import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import OpenAI from 'openai'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { CreditManager } from '@/lib/credit-system'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { logAiUsageEvent } from '@/lib/ai-usage-logger'
import { buildFoodDiarySnapshot } from '@/lib/food-diary-context'
import { estimateTextToSpeechCostCents, estimateTranscriptionCostCents } from '@/lib/cost-meter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COMMAND_MODEL = process.env.HELFI_VOICE_COMMAND_MODEL || 'gpt-5.5'
const FALLBACK_MODEL = process.env.HELFI_VOICE_COMMAND_FALLBACK_MODEL || 'gpt-5.2'
const TRANSCRIBE_MODEL = process.env.HELFI_VOICE_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'
const TTS_MODEL = process.env.HELFI_VOICE_TTS_MODEL || 'gpt-4o-mini-tts'
const SIMPLE_MIN_CREDITS = 3
const VOICE_REPLY_MIN_CREDITS = 2
const RECIPE_MIN_CREDITS = 10
const MAX_AUDIO_BYTES = 12 * 1024 * 1024

type VoiceAction =
  | 'exercise'
  | 'mood'
  | 'journal'
  | 'food_copy_previous'
  | 'food_draft'
  | 'recipe'
  | 'unknown'

type VoiceDraft = {
  action: VoiceAction
  transcript: string
  localDate: string
  summary: string
  confirmationMessage: string
  canConfirm: boolean
  exercise?: {
    exerciseTypeId: number
    exerciseName: string
    durationMinutes: number
    distanceKm?: number | null
    intensity?: string | null
    estimatedDuration?: boolean
  }
  mood?: {
    mood: number
    tags: string[]
    note: string
  }
  journal?: {
    title: string
    content: string
    tags: string[]
  }
  food?: {
    meal: string
    sourceDate?: string
    sourceLogIds?: string[]
    entries?: Array<{ name: string; description?: string | null; meal?: string | null }>
    draftText?: string
  }
  recipe?: {
    text: string
  }
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

async function resolveUser(request: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null)
  const sessionUserId = typeof session?.user?.id === 'string' ? session.user.id : null
  const nativeUserId = sessionUserId ? null : await getUserIdFromNativeAuth(request)
  const userId = sessionUserId || nativeUserId
  if (!userId) return null
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  })
}

function localDateFromRequest(raw: unknown, tzOffsetRaw: unknown) {
  const requested = typeof raw === 'string' ? raw.trim() : ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested
  const offset = Number(tzOffsetRaw)
  const tzOffsetMin = Number.isFinite(offset) ? offset : new Date().getTimezoneOffset()
  return new Date(Date.now() - tzOffsetMin * 60 * 1000).toISOString().slice(0, 10)
}

function shiftLocalDate(localDate: string, deltaDays: number) {
  const [year, month, day] = localDate.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + deltaDays)
  return date.toISOString().slice(0, 10)
}

function cleanText(value: unknown, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function parseAssistantJson(content: string) {
  const raw = String(content || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

async function runJsonCommandModel(openai: OpenAI, transcript: string, localDate: string, userId: string) {
  const messages = [
    {
      role: 'system' as const,
      content: [
        'You classify spoken requests for the Helfi health app.',
        'Return JSON only.',
        'Never say an action is saved. All save actions are only drafts until the user confirms.',
        'Allowed action values: exercise, mood, journal, food_copy_previous, food_draft, recipe, unknown.',
        'For exercise, infer a practical duration if missing. For a 5 km walk, use 60 minutes unless the user gives a time.',
        'For mood, use mood score 1 very low to 7 very good, plus short tags and a note.',
        'For journal, make a short title and journal content.',
        'For food_copy_previous, only use when the user asks for same breakfast/meal as yesterday or previous day.',
        'For new foods with uncertain nutrition, return food_draft with canConfirm false.',
        'For recipes, return action recipe and recipeRequest.',
        'Shape: {"action":"...","summary":"...","confirmationMessage":"...","exercise":{"name":"walking","durationMinutes":60,"distanceKm":5,"estimatedDuration":true},"mood":{"mood":2,"tags":["sad"],"note":"..."},"journal":{"title":"...","content":"...","tags":["..."]},"food":{"meal":"breakfast","draftText":"..."},"recipeRequest":"..."}',
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: `Today is ${localDate}. Spoken request: ${transcript}`,
    },
  ]

  let lastError: any = null
  for (const model of [COMMAND_MODEL, FALLBACK_MODEL, 'gpt-4o']) {
    try {
      const wrapped = await chatCompletionWithCost(
        openai,
        {
          model,
          messages,
          max_tokens: 700,
          temperature: 0.1,
          response_format: { type: 'json_object' } as any,
        } as any,
        { feature: 'voice-assistant:understand', userId },
      )
      const content = wrapped.completion.choices?.[0]?.message?.content || ''
      const parsed = parseAssistantJson(content)
      if (parsed && typeof parsed === 'object') {
        return { parsed, wrapped, usedModel: model }
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('Could not understand voice command')
}

async function transcribeAudio(openai: OpenAI, file: File, userId: string, durationSeconds: number) {
  const response = await openai.audio.transcriptions.create({
    model: TRANSCRIBE_MODEL,
    file,
    response_format: 'text',
  } as any)
  const text = typeof response === 'string' ? response : String((response as any)?.text || '')
  const costCents = estimateTranscriptionCostCents(durationSeconds)
  await logAiUsageEvent({
    feature: 'voice-assistant:transcribe',
    userId,
    endpoint: '/api/native/voice-assistant',
    model: TRANSCRIBE_MODEL,
    promptTokens: 0,
    completionTokens: 0,
    costCents,
    success: true,
    detail: `estimated ${Math.round(durationSeconds)}s audio transcription`,
  })
  return { text: cleanText(text, 2000), costCents }
}

async function findExerciseType(rawName: string) {
  const name = cleanText(rawName || 'walking', 80).toLowerCase()
  const searchTerms = [
    name,
    name.includes('walk') ? 'walking' : '',
    name.includes('run') ? 'running' : '',
    name.includes('cycle') || name.includes('bike') ? 'cycling' : '',
  ].filter(Boolean)
  for (const term of searchTerms) {
    const found = await prisma.exerciseType.findFirst({
      where: { name: { contains: term, mode: 'insensitive' } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })
    if (found) return found
  }
  return prisma.exerciseType.findFirst({
    where: { name: { contains: 'walking', mode: 'insensitive' } },
  })
}

async function buildRecipe(openai: OpenAI, requestText: string, userId: string, localDate: string, tzOffsetMin: number) {
  const snapshot = await buildFoodDiarySnapshot({ userId, localDate, tzOffsetMin }).catch(() => null)
  const diaryLine = snapshot
    ? `Today: ${Math.round(snapshot.totals.calories || 0)} kcal, ${Math.round(snapshot.totals.protein_g || 0)} g protein. Remaining: ${Math.round(snapshot.remaining.calories?.remainingClamped || 0)} kcal and ${Math.round(snapshot.remaining.protein_g?.remainingClamped || 0)} g protein.`
    : 'Food diary context is unavailable.'
  const wrapped = await chatCompletionWithCost(
    openai,
    {
      model: COMMAND_MODEL,
      max_tokens: 900,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'You are Helfi. Create one practical recipe. Use the diary context if helpful. Include servings, ingredients, steps, and approximate macros. Do not save food.',
        },
        {
          role: 'user',
          content: `${diaryLine}\n\nRecipe request: ${requestText}`,
        },
      ],
    } as any,
    { feature: 'voice-assistant:recipe', userId },
  )
  const text = cleanText(wrapped.completion.choices?.[0]?.message?.content || '', 5000)
  return { text, costCents: wrapped.costCents, model: wrapped.completion.model || COMMAND_MODEL }
}

async function buildFoodCopyDraft(userId: string, localDate: string, meal: string) {
  const sourceDate = shiftLocalDate(localDate, -1)
  const normalizedMeal = meal || 'breakfast'
  const rows = await prisma.foodLog.findMany({
    where: {
      userId,
      localDate: sourceDate,
      OR: [
        { meal: { equals: normalizedMeal, mode: 'insensitive' } },
        { category: { equals: normalizedMeal, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })
  const entries = rows.map((row) => ({
    name: row.name,
    description: row.description,
    meal: row.meal || row.category,
  }))
  return { sourceDate, rows, entries }
}

async function speak(openai: OpenAI, text: string, userId: string) {
  const speechText = cleanText(text, 1200)
  if (!speechText) return { audio: null, costCents: 0 }
  const response = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: 'marin',
    input: speechText,
    response_format: 'mp3',
  } as any)
  const buffer = Buffer.from(await response.arrayBuffer())
  const costCents = estimateTextToSpeechCostCents(speechText)
  await logAiUsageEvent({
    feature: 'voice-assistant:tts',
    userId,
    endpoint: '/api/native/voice-assistant',
    model: TTS_MODEL,
    promptTokens: 0,
    completionTokens: 0,
    costCents,
    success: true,
    detail: 'estimated text-to-speech cost',
  })
  return { audio: `data:audio/mpeg;base64,${buffer.toString('base64')}`, costCents }
}

function normalizeMood(value: any) {
  return {
    mood: clampNumber(value?.mood, 1, 7, 4),
    tags: Array.isArray(value?.tags) ? value.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 8) : [],
    note: cleanText(value?.note, 600),
  }
}

async function normalizeDraft(parsed: any, transcript: string, localDate: string, userId: string, openai: OpenAI, tzOffsetMin: number): Promise<{ draft: VoiceDraft; aiCostCents: number; usedModel?: string }> {
  const actionRaw = cleanText(parsed?.action, 40).toLowerCase() as VoiceAction
  const action: VoiceAction = ['exercise', 'mood', 'journal', 'food_copy_previous', 'food_draft', 'recipe'].includes(actionRaw)
    ? actionRaw
    : 'unknown'
  let aiCostCents = 0
  let usedModel: string | undefined

  if (action === 'recipe') {
    const requestText = cleanText(parsed?.recipeRequest || transcript, 1000)
    const recipe = await buildRecipe(openai, requestText, userId, localDate, tzOffsetMin)
    aiCostCents += recipe.costCents
    usedModel = recipe.model
    return {
      aiCostCents,
      usedModel,
      draft: {
        action: 'recipe',
        transcript,
        localDate,
        summary: 'Recipe ready',
        confirmationMessage: 'Here is the recipe. Nothing has been saved.',
        canConfirm: false,
        recipe: { text: recipe.text },
      },
    }
  }

  if (action === 'exercise') {
    const exercise = parsed?.exercise || {}
    const type = await findExerciseType(exercise?.name || parsed?.summary || transcript)
    if (!type) {
      return {
        aiCostCents,
        draft: {
          action: 'unknown',
          transcript,
          localDate,
          summary: 'Exercise type not found',
          confirmationMessage: 'I could not find a matching exercise type. Please try a simpler exercise name.',
          canConfirm: false,
        },
      }
    }
    const distanceKm = Number(exercise?.distanceKm)
    const safeDistance = Number.isFinite(distanceKm) && distanceKm > 0 ? Math.round(distanceKm * 10) / 10 : null
    const fallbackDuration = safeDistance && /walk/i.test(type.name) ? Math.max(10, Math.round(safeDistance * 12)) : 30
    const durationMinutes = clampNumber(exercise?.durationMinutes, 1, 24 * 60, fallbackDuration)
    const estimatedDuration = Boolean(exercise?.estimatedDuration || !Number.isFinite(Number(exercise?.durationMinutes)))
    const summary = `${type.name}, ${durationMinutes} minutes${safeDistance ? `, ${safeDistance} km` : ''}`
    return {
      aiCostCents,
      draft: {
        action: 'exercise',
        transcript,
        localDate,
        summary,
        confirmationMessage: `I can log ${summary}. ${estimatedDuration ? 'I estimated the time, so please check it before saving.' : 'Please confirm before I save it.'}`,
        canConfirm: true,
        exercise: {
          exerciseTypeId: type.id,
          exerciseName: type.name,
          durationMinutes,
          distanceKm: safeDistance,
          intensity: cleanText(exercise?.intensity, 40) || null,
          estimatedDuration,
        },
      },
    }
  }

  if (action === 'mood') {
    const mood = normalizeMood(parsed?.mood || {})
    const summary = `Mood ${mood.mood}/7${mood.tags.length ? `, ${mood.tags.join(', ')}` : ''}`
    return {
      aiCostCents,
      draft: {
        action: 'mood',
        transcript,
        localDate,
        summary,
        confirmationMessage: `I can add this mood entry: ${summary}. Please confirm before I save it.`,
        canConfirm: true,
        mood,
      },
    }
  }

  if (action === 'journal') {
    const journal = parsed?.journal || {}
    const content = cleanText(journal?.content || transcript, 2000)
    const title = cleanText(journal?.title || 'Voice journal note', 120)
    const tags = Array.isArray(journal?.tags) ? journal.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 8) : []
    return {
      aiCostCents,
      draft: {
        action: 'journal',
        transcript,
        localDate,
        summary: title,
        confirmationMessage: `I can add this journal note: “${content.slice(0, 160)}${content.length > 160 ? '...' : ''}” Please confirm before I save it.`,
        canConfirm: true,
        journal: { title, content, tags },
      },
    }
  }

  if (action === 'food_copy_previous') {
    const meal = cleanText(parsed?.food?.meal || 'breakfast', 40).toLowerCase() || 'breakfast'
    const copy = await buildFoodCopyDraft(userId, localDate, meal)
    if (copy.rows.length === 0) {
      return {
        aiCostCents,
        draft: {
          action: 'food_copy_previous',
          transcript,
          localDate,
          summary: `No ${meal} found yesterday`,
          confirmationMessage: `I could not find a ${meal} entry from yesterday to copy.`,
          canConfirm: false,
          food: { meal, sourceDate: copy.sourceDate, sourceLogIds: [], entries: [] },
        },
      }
    }
    return {
      aiCostCents,
      draft: {
        action: 'food_copy_previous',
        transcript,
        localDate,
        summary: `Copy ${copy.rows.length} ${meal} item${copy.rows.length === 1 ? '' : 's'} from yesterday`,
        confirmationMessage: `I found ${copy.rows.length} ${meal} item${copy.rows.length === 1 ? '' : 's'} from ${copy.sourceDate}. Please confirm before I copy them to today.`,
        canConfirm: true,
        food: {
          meal,
          sourceDate: copy.sourceDate,
          sourceLogIds: copy.rows.map((row) => row.id),
          entries: copy.entries,
        },
      },
    }
  }

  if (action === 'food_draft') {
    const draftText = cleanText(parsed?.food?.draftText || transcript, 1200)
    return {
      aiCostCents,
      draft: {
        action: 'food_draft',
        transcript,
        localDate,
        summary: 'Food draft ready',
        confirmationMessage: 'I drafted the food request for review. I need clear nutrition details before saving a new food entry.',
        canConfirm: false,
        food: { meal: cleanText(parsed?.food?.meal || 'uncategorized', 40), draftText },
      },
    }
  }

  return {
    aiCostCents,
    draft: {
      action: 'unknown',
      transcript,
      localDate,
      summary: 'Please review',
      confirmationMessage: cleanText(parsed?.confirmationMessage, 300) || 'I am not sure what to do yet. Please try a clearer request.',
      canConfirm: false,
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const openai = getOpenAIClient()
    if (!openai) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })

    const contentType = request.headers.get('content-type') || ''
    let transcript = ''
    let localDate = ''
    let tzOffsetMin = new Date().getTimezoneOffset()
    let wantsVoiceReply = false
    let durationSeconds = 30
    let transcriptionCostCents = 0

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('audio') || form.get('file')
      transcript = cleanText(form.get('transcript'), 2000)
      tzOffsetMin = Number(form.get('tzOffsetMin'))
      if (!Number.isFinite(tzOffsetMin)) tzOffsetMin = new Date().getTimezoneOffset()
      localDate = localDateFromRequest(form.get('localDate'), tzOffsetMin)
      wantsVoiceReply = String(form.get('voiceReply') || '').toLowerCase() === 'true'
      const durationMillis = Number(form.get('durationMillis'))
      durationSeconds = Number.isFinite(durationMillis) && durationMillis > 0 ? durationMillis / 1000 : 30
      if (!transcript && file instanceof File) {
        if (!file.type.startsWith('audio/')) return NextResponse.json({ error: 'File must be audio' }, { status: 400 })
        if (file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Audio must be less than 12MB' }, { status: 400 })
        const transcribed = await transcribeAudio(openai, file, user.id, durationSeconds)
        transcript = transcribed.text
        transcriptionCostCents = transcribed.costCents
      }
    } else {
      const body = await request.json().catch(() => ({} as any))
      transcript = cleanText(body?.transcript || body?.message, 2000)
      tzOffsetMin = Number(body?.tzOffsetMin)
      if (!Number.isFinite(tzOffsetMin)) tzOffsetMin = new Date().getTimezoneOffset()
      localDate = localDateFromRequest(body?.localDate, tzOffsetMin)
      wantsVoiceReply = Boolean(body?.voiceReply)
    }

    if (!transcript) return NextResponse.json({ error: 'No speech found' }, { status: 400 })

    const wallet = await new CreditManager(user.id).getWalletStatus()
    if (wallet.totalAvailableCents < SIMPLE_MIN_CREDITS) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: SIMPLE_MIN_CREDITS, availableCredits: wallet.totalAvailableCents }, { status: 402 })
    }

    const command = await runJsonCommandModel(openai, transcript, localDate, user.id)
    const normalized = await normalizeDraft(command.parsed, transcript, localDate, user.id, openai, tzOffsetMin)
    let draft = normalized.draft
    let aiCostCents = transcriptionCostCents + command.wrapped.costCents + normalized.aiCostCents
    const isRecipe = draft.action === 'recipe'
    let chargeCents = Math.max(isRecipe ? RECIPE_MIN_CREDITS : SIMPLE_MIN_CREDITS, aiCostCents)
    let audio: string | null = null

    if (wantsVoiceReply) {
      const tts = await speak(openai, draft.recipe?.text || draft.confirmationMessage, user.id)
      audio = tts.audio
      const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
      chargeCents += voiceCharge
      aiCostCents += tts.costCents
    }

    const freshWallet = await new CreditManager(user.id).getWalletStatus()
    if (freshWallet.totalAvailableCents < chargeCents) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
    }

    const charged = await new CreditManager(user.id).chargeCents(chargeCents)
    if (!charged) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
    }

    await logAiUsageEvent({
      feature: isRecipe ? 'voice-assistant:recipe-command' : 'voice-assistant:command',
      userId: user.id,
      endpoint: '/api/native/voice-assistant',
      model: normalized.usedModel || command.usedModel,
      promptTokens: command.wrapped.promptTokens,
      completionTokens: command.wrapped.completionTokens,
      costCents: chargeCents,
      success: true,
      detail: `charged ${chargeCents} credits; vendor estimate ${aiCostCents}`,
    })

    return NextResponse.json({
      success: true,
      transcript,
      draft,
      audio,
      chargedCredits: chargeCents,
      voiceReply: Boolean(audio),
    })
  } catch (error: any) {
    console.error('[native voice assistant] draft failed', error)
    return NextResponse.json({ error: error?.message || 'Voice assistant failed' }, { status: 500 })
  }
}
