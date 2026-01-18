import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { logAIUsage } from '@/lib/ai-usage-logger'
import { buildFoodDiarySnapshot } from '@/lib/food-diary-context'
import { lookupFoodNutrition } from '@/lib/food-data'
import {
  ensureTalkToAITables,
  appendMessage,
  createThread,
  updateThreadTitle,
  updateThreadFoodContext,
  listThreads,
  getThreadChargeStatus,
  markThreadCharged,
  normalizeChatContext,
} from '@/lib/talk-to-ai-chat-store'
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits'
import { isSubscriptionActive } from '@/lib/subscription-utils'

const VOICE_CHAT_COST_CENTS = 10
const FRIDGE_PHOTO_COST_CENTS = 10
const MAX_DETECTED_ITEMS = 20
const MAX_LOOKUP_ITEMS = 12
const PHOTO_MODES = new Set(['menu', 'inventory', 'meal', 'label'])

const isValidDateString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

const readFormString = (form: FormData, key: string) => {
  const raw = form.get(key)
  return typeof raw === 'string' ? raw.trim() : ''
}

const parseJsonRelaxed = (raw: string): any | null => {
  try {
    return JSON.parse(raw)
  } catch {
    try {
      const trimmed = String(raw || '').trim()
      const fenced = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
      const keysQuoted = fenced.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
      const doubleQuoted = keysQuoted.replace(/'/g, '"')
      const noTrailingCommas = doubleQuoted.replace(/,\s*([}\]])/g, '$1')
      return JSON.parse(noTrailingCommas)
    } catch {
      return null
    }
  }
}

const normalizePhotoMode = (value: string) => {
  const mode = String(value || '').trim().toLowerCase()
  return PHOTO_MODES.has(mode) ? mode : 'inventory'
}

const stripNutritionFromServingSize = (raw: string) => {
  return String(raw || '')
    .replace(/\([^)]*(calories?|kcal|kilojoules?|kj|protein|carbs?|fat|fibre|fiber|sugar)[^)]*\)/gi, '')
    .replace(/\b\d+(?:\.\d+)?\s*(kcal|cal|kj)\b[^,)]*(?:protein|carb|fat|fiber|fibre|sugar)[^,)]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const toNumber = (value: any) => {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw) return null
  const numeric = Number(raw.replace(/[^0-9.+-]/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

const describeMacro = (value: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) / 10 : null

const extractAssistantContent = (message: any) => {
  if (!message) return ''
  const content = message.content
  if (typeof content === 'string') return content.trim()
  if (content && typeof content === 'object' && typeof content.text === 'string') {
    return content.text.trim()
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((part: any) => {
        if (typeof part?.text === 'string') return part.text
        if (typeof part?.text?.value === 'string') return part.text.value
        if (typeof part?.text?.content === 'string') return part.text.content
        if (typeof part?.content === 'string') return part.content
        return ''
      })
      .join('')
    return joined.trim()
  }
  if (typeof message.refusal === 'string') return message.refusal.trim()
  if (typeof (message as any).output_text === 'string') return String((message as any).output_text).trim()
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const form = await req.formData()
    const imageFiles = form.getAll('image').filter((file) => file instanceof File) as File[]
    if (imageFiles.length === 0) {
      return NextResponse.json({ error: 'Image required' }, { status: 400 })
    }

    const note = readFormString(form, 'message')
    const photoMode = normalizePhotoMode(readFormString(form, 'photoMode'))
    const rawBarcode = readFormString(form, 'barcode')
    const labelBarcode = rawBarcode ? rawBarcode.replace(/[^0-9A-Za-z]/g, '') : ''
    const incomingThreadId = readFormString(form, 'threadId')
    const forceNewThread = readFormString(form, 'newThread') === 'true'
    const chatContext = normalizeChatContext(readFormString(form, 'entryContext') || readFormString(form, 'context'))
    const requestedLocalDate = readFormString(form, 'localDate')
    const requestedTzOffset = Number(readFormString(form, 'tzOffsetMin'))
    const resolvedTzOffset = Number.isFinite(requestedTzOffset) ? requestedTzOffset : new Date().getTimezoneOffset()
    const resolvedLocalDate = isValidDateString(requestedLocalDate)
      ? requestedLocalDate
      : new Date(Date.now() - resolvedTzOffset * 60 * 1000).toISOString().slice(0, 10)

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { subscription: true, creditTopUps: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isPremium = isSubscriptionActive(user.subscription)
    const now = new Date()
    const hasPurchasedCredits = user.creditTopUps?.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    )

    await ensureTalkToAITables()
    let threadId: string
    if (forceNewThread) {
      const thread = await createThread(session.user.id, undefined, chatContext)
      threadId = thread.id
    } else if (incomingThreadId) {
      threadId = incomingThreadId
    } else {
      const threads = await listThreads(session.user.id, chatContext)
      if (threads.length > 0) {
        threadId = threads[0].id
      } else {
        const thread = await createThread(session.user.id, undefined, chatContext)
        threadId = thread.id
      }
    }

    const threadAlreadyCharged = await getThreadChargeStatus(threadId)
    const shouldChargeChat = !threadAlreadyCharged
    const hasFreeChatCredits = shouldChargeChat ? await hasFreeCredits(user.id, 'VOICE_CHAT') : false
    const allowChatViaFreeUse = shouldChargeChat && !isPremium && !hasPurchasedCredits && hasFreeChatCredits

    if (shouldChargeChat && !isPremium && !hasPurchasedCredits && !hasFreeChatCredits) {
      return NextResponse.json(
        {
          error: 'Payment required',
          message: 'You\'ve used all your free voice chat uses. Subscribe to a monthly plan or purchase credits to continue.',
          requiresPayment: true,
          exhaustedFreeCredits: true,
        },
        { status: 402 },
      )
    }

    const totalChargeCents =
      FRIDGE_PHOTO_COST_CENTS * imageFiles.length +
      (shouldChargeChat && !allowChatViaFreeUse ? VOICE_CHAT_COST_CENTS : 0)

    const cm = new CreditManager(user.id)
    const wallet = await cm.getWalletStatus()
    if (totalChargeCents > 0 && wallet.totalAvailableCents < totalChargeCents) {
      return NextResponse.json(
        {
          error: 'Insufficient credits',
          estimatedCost: totalChargeCents,
          availableCredits: wallet.totalAvailableCents,
        },
        { status: 402 }
      )
    }

    if (totalChargeCents > 0) {
      const ok = await cm.chargeCents(totalChargeCents)
      if (!ok) {
        return NextResponse.json(
          {
            error: 'Insufficient credits',
            estimatedCost: totalChargeCents,
            availableCredits: wallet.totalAvailableCents,
          },
          { status: 402 }
        )
      }
    }

    if (shouldChargeChat && allowChatViaFreeUse) {
      await consumeFreeCredit(user.id, 'VOICE_CHAT')
    }
    if (shouldChargeChat) {
      await markThreadCharged(threadId)
    }

    const foodDiarySnapshot = await buildFoodDiarySnapshot({
      userId: session.user.id,
      localDate: resolvedLocalDate,
      tzOffsetMin: resolvedTzOffset,
    })

    const imageBase64List = await Promise.all(
      imageFiles.map(async (file) => Buffer.from(await file.arrayBuffer()).toString('base64'))
    )
    const imageParts = imageFiles.map((file, idx) => ({
      type: 'image_url',
      image_url: { url: `data:${file.type};base64,${imageBase64List[idx]}`, detail: 'high' },
    }))

    if (photoMode === 'label') {
      const labelVision = await chatCompletionWithCost(openai, {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a nutrition label extractor. Read the nutrition label in the photo(s) and return JSON only. ' +
              'If the label is unclear or missing, return {"status":"unclear","reason":"short reason"}. ' +
              'Otherwise return {"status":"ok","name":"string","brand":"string|null","serving_size":"string|null",' +
              '"per_serving":{"calories":number|null,"protein_g":number|null,"carbs_g":number|null,' +
              '"fat_g":number|null,"fiber_g":number|null,"sugar_g":number|null}}. ' +
              'Use numbers only (no units).',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract nutrition label data from these images.' },
              ...imageParts,
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
      } as any)

      const labelText = labelVision.completion.choices?.[0]?.message?.content || ''
      const labelParsed = parseJsonRelaxed(labelText)
      const labelStatus =
        typeof labelParsed?.status === 'string' ? labelParsed.status.trim().toLowerCase() : ''
      const labelName = typeof labelParsed?.name === 'string' ? labelParsed.name.trim() : 'Nutrition label'
      const labelBrand = typeof labelParsed?.brand === 'string' ? labelParsed.brand.trim() : null
      const labelServingSize =
        typeof labelParsed?.serving_size === 'string' ? labelParsed.serving_size.trim() : null
      const cleanedServingSize = labelServingSize ? stripNutritionFromServingSize(labelServingSize) : null
      const perServing =
        (labelParsed?.per_serving && typeof labelParsed.per_serving === 'object'
          ? labelParsed.per_serving
          : null) || {}

      const labelMacros = {
        calories: describeMacro(toNumber(perServing?.calories ?? perServing?.kcal ?? perServing?.energy_kcal)),
        protein_g: describeMacro(toNumber(perServing?.protein_g ?? perServing?.protein)),
        carbs_g: describeMacro(toNumber(perServing?.carbs_g ?? perServing?.carbs ?? perServing?.carbohydrates)),
        fat_g: describeMacro(toNumber(perServing?.fat_g ?? perServing?.fat ?? perServing?.total_fat)),
        fiber_g: describeMacro(toNumber(perServing?.fiber_g ?? perServing?.fibre_g ?? perServing?.fiber)),
        sugar_g: describeMacro(toNumber(perServing?.sugar_g ?? perServing?.sugars ?? perServing?.sugar)),
      }

      const hasLabelMacros = Object.values(labelMacros).some(
        (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
      )

      if (labelStatus === 'unclear' || !hasLabelMacros) {
        const assistantMessage =
          'I could not read the nutrition label clearly. Please upload a clearer label photo ' +
          '(straight on, good light), or use the barcode scan option.'
        const userMessage = note ? `Nutrition label photo: ${note}` : 'Nutrition label photo'

        await appendMessage(threadId, 'user', userMessage)
        await appendMessage(threadId, 'assistant', assistantMessage)

        const threads = await listThreads(session.user.id, chatContext)
        const currentThread = threads.find((thread) => thread.id === threadId)
        if (currentThread && !currentThread.title) {
          await updateThreadTitle(threadId, 'Nutrition label photo')
        }

        try {
          await logAIUsage({
            context: { feature: 'voice:label-photo:vision', userId: user.id },
            model: 'gpt-4o',
            promptTokens: labelVision.promptTokens,
            completionTokens: labelVision.completionTokens,
            costCents: labelVision.costCents,
          })
        } catch {}

        return NextResponse.json({
          assistant: assistantMessage,
          threadId,
          chargedCents: totalChargeCents,
          chargedChat: shouldChargeChat,
          chargedPhoto: FRIDGE_PHOTO_COST_CENTS * imageFiles.length,
        })
      }

      const labelPrompt = [
        'You are Helfi, a food and macro coach.',
        'Use the FOOD DIARY SNAPSHOT and LABEL DATA to answer the user.',
        'If the user asked a question, answer it directly. If they did not, explain how this item fits today.',
        'Always include the macros for one serving and the updated daily totals after eating one serving.',
        'If something is unknown, say "unknown". If estimated, say "approximate".',
        'Keep the response concise and easy to scan.',
        '',
        'Use this exact format:',
        'Label item: ...',
        'Macros: kcal - protein g - carbs g - fat g - fiber g - sugar g',
        'After eating: ...',
      ].join('\n')

      let labelSaved = false
      if (labelBarcode) {
        try {
          const now = new Date()
          await prisma.barcodeProduct.upsert({
            where: { barcode: labelBarcode },
            update: {
              name: labelName,
              brand: labelBrand,
              servingSize: cleanedServingSize,
              calories: labelMacros.calories,
              proteinG: labelMacros.protein_g,
              carbsG: labelMacros.carbs_g,
              fatG: labelMacros.fat_g,
              fiberG: labelMacros.fiber_g,
              sugarG: labelMacros.sugar_g,
              source: 'label-photo',
              updatedById: user.id,
              updatedAt: now,
            },
            create: {
              barcode: labelBarcode,
              name: labelName,
              brand: labelBrand,
              servingSize: cleanedServingSize,
              calories: labelMacros.calories,
              proteinG: labelMacros.protein_g,
              carbsG: labelMacros.carbs_g,
              fatG: labelMacros.fat_g,
              fiberG: labelMacros.fiber_g,
              sugarG: labelMacros.sugar_g,
              source: 'label-photo',
              reportCount: 0,
              lastReportedAt: null,
              createdById: user.id,
              updatedById: user.id,
              createdAt: now,
              updatedAt: now,
            },
          })
          labelSaved = true
        } catch (err) {
          console.warn('Failed to save label nutrition for barcode', err)
        }
      }

      const assistantModel = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-5.2'
      const fallbackModel = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o'

      let assistantResult = await chatCompletionWithCost(openai, {
        model: assistantModel,
        messages: [
          { role: 'system', content: labelPrompt },
          {
            role: 'user',
            content: [
              'FOOD DIARY SNAPSHOT (JSON):',
              JSON.stringify(foodDiarySnapshot || null),
              '',
              'LABEL DATA (JSON):',
              JSON.stringify(
                {
                  name: labelName,
                  brand: labelBrand,
          serving_size: cleanedServingSize,
          per_serving: labelMacros,
        },
        null,
        2
      ),
              '',
              note ? `User question: ${note}` : 'User question: (none)',
            ].join('\n'),
          },
        ],
        max_tokens: 500,
        temperature: 0.2,
      } as any)

      let assistantMessage = extractAssistantContent(assistantResult.completion.choices?.[0]?.message)
      let usedModel = assistantModel
      if (!assistantMessage) {
        const retry = await chatCompletionWithCost(openai, {
          model: fallbackModel,
          messages: [
            { role: 'system', content: labelPrompt },
            {
              role: 'user',
              content: [
                'FOOD DIARY SNAPSHOT (JSON):',
                JSON.stringify(foodDiarySnapshot || null),
                '',
                'LABEL DATA (JSON):',
                JSON.stringify(
                  {
                    name: labelName,
                    brand: labelBrand,
                    serving_size: cleanedServingSize,
                    per_serving: labelMacros,
                  },
                  null,
                  2
                ),
                '',
                note ? `User question: ${note}` : 'User question: (none)',
              ].join('\n'),
            },
          ],
          max_tokens: 500,
          temperature: 0.2,
        } as any)
        const retryMessage = extractAssistantContent(retry.completion.choices?.[0]?.message)
        if (retryMessage) {
          assistantResult = retry
          assistantMessage = retryMessage
          usedModel = fallbackModel
        }
      }
      if (!assistantMessage) {
        assistantMessage = 'I could not generate a response from the label.'
      }

      const userMessage = note ? `Nutrition label photo: ${note}` : 'Nutrition label photo'

      await appendMessage(threadId, 'user', userMessage)
      await appendMessage(threadId, 'assistant', assistantMessage)

      const labelSummaryParts = [
        `Label item: ${labelName}`,
        labelBrand ? `Brand: ${labelBrand}` : null,
        cleanedServingSize ? `Serving: ${cleanedServingSize}` : null,
        `Macros: ${[
          labelMacros.calories != null ? `${labelMacros.calories} kcal` : 'unknown kcal',
          labelMacros.protein_g != null ? `${labelMacros.protein_g} g protein` : 'unknown protein',
          labelMacros.carbs_g != null ? `${labelMacros.carbs_g} g carbs` : 'unknown carbs',
          labelMacros.fat_g != null ? `${labelMacros.fat_g} g fat` : 'unknown fat',
          labelMacros.fiber_g != null ? `${labelMacros.fiber_g} g fiber` : 'unknown fiber',
          labelMacros.sugar_g != null ? `${labelMacros.sugar_g} g sugar` : 'unknown sugar',
        ].join(' - ')}`,
      ].filter(Boolean)
      await updateThreadFoodContext(threadId, labelSummaryParts.join('\n').slice(0, 1200))

      const threads = await listThreads(session.user.id, chatContext)
      const currentThread = threads.find((thread) => thread.id === threadId)
      if (currentThread && !currentThread.title) {
        await updateThreadTitle(threadId, 'Nutrition label photo')
      }

      try {
        await logAIUsage({
          context: { feature: 'voice:label-photo:vision', userId: user.id },
          model: 'gpt-4o',
          promptTokens: labelVision.promptTokens,
          completionTokens: labelVision.completionTokens,
          costCents: labelVision.costCents,
        })
      } catch {}

      try {
        await logAIUsage({
          context: { feature: 'voice:label-photo:suggestions', userId: user.id },
          model: usedModel,
          promptTokens: assistantResult.promptTokens,
          completionTokens: assistantResult.completionTokens,
          costCents: assistantResult.costCents,
        })
      } catch {}

      return NextResponse.json({
        assistant: assistantMessage,
        threadId,
        labelSaved,
        chargedCents: totalChargeCents,
        chargedChat: shouldChargeChat,
        chargedPhoto: FRIDGE_PHOTO_COST_CENTS * imageFiles.length,
      })
    }

    const vision = await chatCompletionWithCost(openai, {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            `You are a food photo extractor. The photo mode is "${photoMode}". ` +
            'If the mode is "menu", read the menu and list the menu items. ' +
            'If the mode is "meal", list the meal items you can clearly see. ' +
            'If the mode is "inventory", list the foods you can clearly see in a fridge/pantry/cupboard. ' +
            `Return JSON only with this exact shape: {"type":"menu|inventory|meal","items":[{"name":"string"}]}. ` +
            'List clear, human-friendly item names (e.g., "croissant", "eggs", "chicken breast", "Greek yogurt"). ' +
            `Include as many obvious items as possible, up to ${MAX_DETECTED_ITEMS}. If nothing edible is visible, return {"type":"inventory","items": []}.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Identify foods in these photos.' },
            ...imageParts,
          ],
        },
      ],
      max_tokens: 400,
      temperature: 0.2,
    } as any)

    const visionText = vision.completion.choices?.[0]?.message?.content || ''
    const parsed = parseJsonRelaxed(visionText)
    const parsedTypeRaw = typeof parsed?.type === 'string' ? parsed.type.trim().toLowerCase() : ''
    const defaultType = photoMode === 'menu' ? 'menu' : photoMode === 'meal' ? 'meal' : 'inventory'
    const parsedType = parsedTypeRaw === 'menu' || parsedTypeRaw === 'meal' ? parsedTypeRaw : defaultType
    const rawItems = Array.isArray(parsed?.items) ? parsed.items : []
    const items = rawItems
      .map((item: any) => String(item?.name || '').trim())
      .filter((name: string) => name.length > 0)
      .slice(0, MAX_DETECTED_ITEMS)

    const enrichedItems: Array<{
      name: string
      calories: number | null
      protein_g: number | null
      carbs_g: number | null
      fat_g: number | null
      fiber_g: number | null
      sugar_g: number | null
      source: string | null
    }> = []

    for (const name of items.slice(0, MAX_LOOKUP_ITEMS)) {
      const results = await lookupFoodNutrition(name, { preferSource: 'fatsecret', maxResults: 1 })
      const hit = results && results.length > 0 ? results[0] : null
      enrichedItems.push({
        name,
        calories: describeMacro(hit?.calories ?? null),
        protein_g: describeMacro(hit?.protein_g ?? null),
        carbs_g: describeMacro(hit?.carbs_g ?? null),
        fat_g: describeMacro(hit?.fat_g ?? null),
        fiber_g: describeMacro(hit?.fiber_g ?? null),
        sugar_g: describeMacro(hit?.sugar_g ?? null),
        source: hit?.source ?? null,
      })
    }

    const suggestionPrompt = [
      'You are Helfi, a food and macro coach.',
      'Use the FOOD DIARY SNAPSHOT to prioritize nutrients that are most behind target.',
      'Avoid suggestions that would worsen nutrients at or over cap.',
      'Use the items detected in the photo (menu or pantry) when possible; if items are insufficient, suggest simple add-ons.',
      'Include estimated calories, protein, carbs, fat, fiber, and sugar for each suggestion.',
      'After each suggestion, show the updated daily totals if the user ate that option.',
      'If you must estimate, say "approximate". If unknown, say "unknown".',
      'If micronutrients are not available, state that they are unavailable.',
      'Keep answers concise, structured, and easy to scan.',
      '',
      'Use this exact format:',
      'Current totals: ...',
      'Option 1: ...',
      'Macros: kcal - protein g - carbs g - fat g - fiber g - sugar g',
      'After eating: ...',
      'Option 2: ...',
      'Macros: kcal - protein g - carbs g - fat g - fiber g - sugar g',
      'After eating: ...',
    ].join('\n')

    const assistantModel = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-5.2'
    const fallbackModel = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o'
    let assistantResult = await chatCompletionWithCost(openai, {
      model: assistantModel,
      messages: [
        { role: 'system', content: suggestionPrompt },
        {
          role: 'user',
          content: [
            'FOOD DIARY SNAPSHOT (JSON):',
            JSON.stringify(foodDiarySnapshot || null),
            '',
            'VISIBLE ITEMS WITH MACROS (JSON):',
            JSON.stringify(enrichedItems),
            '',
            note ? `User note: ${note}` : 'User note: (none)',
            '',
            'Task: Suggest 3-6 options the user can eat right now to help close macro gaps.',
          ].join('\n'),
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    } as any)

    let assistantMessage = extractAssistantContent(assistantResult.completion.choices?.[0]?.message)
    let usedModel = assistantModel
    if (!assistantMessage) {
      const retry = await chatCompletionWithCost(openai, {
        model: fallbackModel,
        messages: [
          { role: 'system', content: suggestionPrompt },
          {
            role: 'user',
            content: [
              'FOOD DIARY SNAPSHOT (JSON):',
              JSON.stringify(foodDiarySnapshot || null),
              '',
              'VISIBLE ITEMS WITH MACROS (JSON):',
              JSON.stringify(enrichedItems),
              '',
              note ? `User note: ${note}` : 'User note: (none)',
              '',
              'Task: Suggest 3-6 options the user can eat right now to help close macro gaps.',
            ].join('\n'),
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      } as any)
      const retryMessage = extractAssistantContent(retry.completion.choices?.[0]?.message)
      if (retryMessage) {
        assistantResult = retry
        assistantMessage = retryMessage
        usedModel = fallbackModel
      }
    }
    if (!assistantMessage) {
      assistantMessage = 'I could not generate suggestions from the photo.'
    }

    const baseLabel =
      photoMode === 'menu'
        ? 'Menu photo'
        : photoMode === 'meal'
        ? 'Meal photo'
        : photoMode === 'label'
        ? 'Nutrition label photo'
        : 'Fridge/pantry photo'
    const photoLabel = imageFiles.length > 1 ? `${baseLabel} set (${imageFiles.length})` : baseLabel
    const userMessage = note ? `${photoLabel}: ${note}` : photoLabel

    await appendMessage(threadId, 'user', userMessage)
    await appendMessage(threadId, 'assistant', assistantMessage)
    const contextLabel = parsedType === 'menu' ? 'Menu items' : parsedType === 'meal' ? 'Meal items' : 'Photo items'
    const contextSummary = items.length > 0 ? `${contextLabel}: ${items.join(', ')}` : null
    await updateThreadFoodContext(threadId, contextSummary ? contextSummary.slice(0, 1200) : null)

    const threads = await listThreads(session.user.id, chatContext)
    const currentThread = threads.find((thread) => thread.id === threadId)
    if (currentThread && !currentThread.title) {
      const nextTitle = parsedType === 'menu' ? 'Menu photo' : parsedType === 'meal' ? 'Meal photo' : 'Food photo'
      await updateThreadTitle(threadId, nextTitle)
    }

    try {
      await logAIUsage({
        context: { feature: 'voice:fridge-photo:vision', userId: user.id },
        model: 'gpt-4o',
        promptTokens: vision.promptTokens,
        completionTokens: vision.completionTokens,
        costCents: vision.costCents,
      })
    } catch {}

    try {
      await logAIUsage({
        context: { feature: 'voice:fridge-photo:suggestions', userId: user.id },
        model: usedModel,
        promptTokens: assistantResult.promptTokens,
        completionTokens: assistantResult.completionTokens,
        costCents: assistantResult.costCents,
      })
    } catch {}

    return NextResponse.json({
      assistant: assistantMessage,
      threadId,
      chargedCents: totalChargeCents,
      chargedChat: shouldChargeChat,
      chargedPhoto: FRIDGE_PHOTO_COST_CENTS * imageFiles.length,
    })
  } catch (error: any) {
    console.error('[chat-fridge.POST] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
