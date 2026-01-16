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
  listThreads,
  getThreadChargeStatus,
  markThreadCharged,
  normalizeChatContext,
} from '@/lib/talk-to-ai-chat-store'
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits'
import { isSubscriptionActive } from '@/lib/subscription-utils'

const VOICE_CHAT_COST_CENTS = 10
const FRIDGE_PHOTO_COST_CENTS = 10
const MAX_DETECTED_ITEMS = 12
const MAX_LOOKUP_ITEMS = 8

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

const describeMacro = (value: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) / 10 : null

const extractAssistantContent = (message: any) => {
  if (!message) return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).join('')
  }
  if (typeof message.refusal === 'string') return message.refusal
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
    const imageFile = form.get('image') as File | null
    if (!imageFile) {
      return NextResponse.json({ error: 'Image required' }, { status: 400 })
    }

    const note = readFormString(form, 'message')
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
      FRIDGE_PHOTO_COST_CENTS + (shouldChargeChat && !allowChatViaFreeUse ? VOICE_CHAT_COST_CENTS : 0)

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

    const imageBuffer = await imageFile.arrayBuffer()
    const imageBase64 = Buffer.from(imageBuffer).toString('base64')

    const vision = await chatCompletionWithCost(openai, {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a food inventory extractor. Identify distinct edible items visible in a fridge, pantry, or cupboard photo. ' +
            `Return JSON only with this exact shape: {"items":[{"name":"string"}]}. ` +
            'List clear, human-friendly item names (e.g., "eggs", "chicken breast", "Greek yogurt", "brown rice", "canned tuna"). ' +
            `Limit to ${MAX_DETECTED_ITEMS} items. If nothing edible is visible, return {"items": []}.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Identify foods in this photo.' },
            {
              type: 'image_url',
              image_url: { url: `data:${imageFile.type};base64,${imageBase64}`, detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 400,
      temperature: 0.2,
    } as any)

    const visionText = vision.completion.choices?.[0]?.message?.content || ''
    const parsed = parseJsonRelaxed(visionText)
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
      'Use only the items detected in the photo when possible; if items are insufficient, suggest simple add-ons.',
      'Start with a single "Current totals" line using the snapshot data.',
      'Include estimated calories, protein, carbs, fat, fiber, and sugar for each suggestion.',
      'After each suggestion, show the updated daily totals if the user ate that option.',
      'If you must estimate, say "approximate". If unknown, say "unknown".',
      'If micronutrients are not available, state that they are unavailable.',
      'Keep answers concise, structured, and easy to scan.',
    ].join(' ')

    const assistantResult = await chatCompletionWithCost(openai, {
      model: process.env.OPENAI_INSIGHTS_MODEL || 'gpt-5.2',
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

    const assistantMessage =
      extractAssistantContent(assistantResult.completion.choices?.[0]?.message) ||
      'I could not generate suggestions from the photo.'

    const userMessage = note
      ? `Fridge/pantry photo: ${note}`
      : 'Fridge/pantry photo'

    await appendMessage(threadId, 'user', userMessage)
    await appendMessage(threadId, 'assistant', assistantMessage)

    const threads = await listThreads(session.user.id, chatContext)
    const currentThread = threads.find((thread) => thread.id === threadId)
    if (currentThread && !currentThread.title) {
      await updateThreadTitle(threadId, 'Fridge photo')
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
        model: process.env.OPENAI_INSIGHTS_MODEL || 'gpt-5.2',
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
      chargedPhoto: FRIDGE_PHOTO_COST_CENTS,
    })
  } catch (error: any) {
    console.error('[chat-fridge.POST] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
