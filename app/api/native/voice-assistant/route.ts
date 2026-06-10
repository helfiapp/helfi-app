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
const COMMAND_FAST_MODEL = process.env.HELFI_VOICE_COMMAND_FAST_MODEL || 'gpt-4o-mini'
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
  | 'food_favorite'
  | 'food_draft'
  | 'recipe'
  | 'unknown'

type VoiceFoodFavorite = {
  id?: string | null
  label: string
  description?: string | null
  meal?: string | null
  nutrition?: any
  total?: any
  items?: any
  raw?: any
}

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
    favorite?: VoiceFoodFavorite
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

function compactFoodMatchText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an|my|me|please|can|you|put|in|add|log|have|had|for|today|to|diary|meal)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = Array.from({ length: b.length + 1 }, () => 0)
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]
  }
  return prev[b.length]
}

function inferMealFromText(text: string, fallback?: string | null) {
  const normalized = compactFoodMatchText(text)
  if (/\bbreakfast\b/.test(normalized)) return 'breakfast'
  if (/\blunch\b/.test(normalized)) return 'lunch'
  if (/\bdinner\b/.test(normalized)) return 'dinner'
  if (/\bsnack|snacks\b/.test(normalized)) return 'snacks'
  return cleanText(fallback || 'uncategorized', 40).toLowerCase() || 'uncategorized'
}

function normalizeFavoriteInput(raw: any): VoiceFoodFavorite | null {
  if (!raw || typeof raw !== 'object') return null
  const label = cleanText(raw.label || raw.name || raw.description || raw.raw?.label || raw.raw?.name, 160)
  if (!label) return null
  const description = cleanText(raw.description || raw.raw?.description || label, 500)
  const meal = cleanText(raw.meal || raw.category || raw.persistedCategory || raw.raw?.meal || raw.raw?.category, 40).toLowerCase()
  return {
    id: raw.id ? String(raw.id) : null,
    label,
    description: description || label,
    meal: meal || null,
    nutrition: raw.nutrition || raw.nutrients || raw.total || raw.raw?.nutrition || raw.raw?.nutrients || raw.raw?.total || null,
    total: raw.total || raw.nutrition || raw.nutrients || raw.raw?.total || raw.raw?.nutrition || raw.raw?.nutrients || null,
    items: Array.isArray(raw.items) ? raw.items : Array.isArray(raw.raw?.items) ? raw.raw.items : null,
    raw,
  }
}

function parseFavoritesJson(raw: unknown): VoiceFoodFavorite[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const list = Array.isArray((parsed as any)?.favorites) ? (parsed as any).favorites : Array.isArray(parsed) ? parsed : []
    return list
      .map((item: any) => normalizeFavoriteInput(item))
      .filter((item: VoiceFoodFavorite | null): item is VoiceFoodFavorite => Boolean(item))
  } catch {
    return []
  }
}

function mergeFavorites(primary: VoiceFoodFavorite[], secondary: VoiceFoodFavorite[]) {
  const byKey = new Map<string, VoiceFoodFavorite>()
  ;[...primary, ...secondary].forEach((favorite) => {
    const key = String(favorite.id || '').trim() || compactFoodMatchText(favorite.label)
    if (key && !byKey.has(key)) byKey.set(key, favorite)
  })
  return Array.from(byKey.values())
}

async function loadStoredFavorites(userId: string) {
  const stored = await prisma.healthGoal.findFirst({
    where: { userId, name: '__FOOD_FAVORITES__' },
    orderBy: { createdAt: 'desc' },
    select: { category: true },
  })
  return parseFavoritesJson(stored?.category || '')
}

function findRequestedFavorite(transcript: string, favorites: VoiceFoodFavorite[]) {
  const request = compactFoodMatchText(transcript)
  if (!request || favorites.length === 0) return null
  const requestTokens = request.split(' ').filter((token) => token.length >= 3)
  const requestCompact = request.replace(/\s+/g, '')
  let best: { favorite: VoiceFoodFavorite; score: number } | null = null

  for (const favorite of favorites) {
    const label = compactFoodMatchText(favorite.label || favorite.description || '')
    if (!label) continue
    const labelTokens = label.split(' ').filter((token) => token.length >= 3)
    const labelCompact = label.replace(/\s+/g, '')
    const tokenMatches = labelTokens.filter((token) =>
      requestTokens.some((requestToken) => requestToken === token || levenshteinDistance(requestToken, token) <= 1),
    ).length
    let score = tokenMatches / Math.max(1, labelTokens.length)
    if (request.includes(label)) score = Math.max(score, 1)
    if (requestCompact.includes(labelCompact)) score = Math.max(score, 1)
    const compactDistance = levenshteinDistance(requestCompact, labelCompact)
    if (compactDistance <= 2) score = Math.max(score, 0.95)
    if (score >= 0.72 && (!best || score > best.score)) best = { favorite, score }
  }

  return best?.favorite || null
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
        'You quickly understand natural spoken requests for the Helfi health app.',
        'Return compact JSON only. Do not explain.',
        'Never say an action is saved. All save actions are only drafts until the user confirms.',
        'Allowed action values: exercise, mood, journal, food_copy_previous, food_draft, recipe, unknown.',
        'For exercise, infer the exercise name, duration, distance, and intensity from any natural wording. If duration is missing, estimate a practical duration and mark estimatedDuration true.',
        'For mood, use mood score 1 very low to 7 very good, plus short tags and a note.',
        'For journal, make a short title and journal content.',
        'For food_copy_previous, only use when the user asks for same breakfast/meal as yesterday or previous day.',
        'For new meals or foods, including ingredient lists or build-a-meal requests, return food_draft with meal and draftText. Do not silently save uncertain nutrition.',
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
  const models = Array.from(new Set([COMMAND_FAST_MODEL, COMMAND_MODEL, FALLBACK_MODEL, 'gpt-4o']))
  for (const model of models) {
    try {
      const wrapped = await chatCompletionWithCost(
        openai,
        {
          model,
          messages,
          max_tokens: 420,
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

async function buildFavoriteFoodDraft(transcript: string, localDate: string, favorites: VoiceFoodFavorite[]) {
  const favorite = findRequestedFavorite(transcript, favorites)
  if (!favorite) return null
  const meal = inferMealFromText(transcript, favorite.meal)
  const calories = Math.round(Number((favorite.nutrition as any)?.calories ?? (favorite.total as any)?.calories) || 0)
  const summary = `${favorite.label}${calories ? `, ${calories} kcal` : ''}`
  return {
    action: 'food_favorite' as const,
    transcript,
    localDate,
    summary,
    confirmationMessage: `I found ${favorite.label} in your favourites. Please confirm before I add it to ${meal}.`,
    canConfirm: true,
    food: {
      meal,
      entries: [{ name: favorite.label, description: favorite.description || favorite.label, meal }],
      favorite: {
        id: favorite.id || null,
        label: favorite.label,
        description: favorite.description || favorite.label,
        meal,
        nutrition: favorite.nutrition || favorite.total || null,
        total: favorite.total || favorite.nutrition || null,
        items: Array.isArray(favorite.items) ? favorite.items : null,
      },
    },
  }
}

async function speak(openai: OpenAI, text: string, userId: string) {
  const speechText = cleanText(text, 1200)
  if (!speechText) return { audio: null, costCents: 0 }
  const response = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: process.env.HELFI_VOICE_TTS_VOICE || 'coral',
    input: speechText,
    instructions:
      'Speak like a warm, calm health coach. Sound natural and conversational, with gentle energy and smooth pacing. Avoid a robotic or announcer style.',
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

async function normalizeDraft(
  parsed: any,
  transcript: string,
  localDate: string,
  userId: string,
  openai: OpenAI,
  tzOffsetMin: number,
  favorites: VoiceFoodFavorite[],
): Promise<{ draft: VoiceDraft; aiCostCents: number; usedModel?: string }> {
  const actionRaw = cleanText(parsed?.action, 40).toLowerCase() as VoiceAction
  const action: VoiceAction = ['exercise', 'mood', 'journal', 'food_copy_previous', 'food_favorite', 'food_draft', 'recipe'].includes(actionRaw)
    ? actionRaw
    : 'unknown'
  let aiCostCents = 0
  let usedModel: string | undefined

  const favoriteDraft = await buildFavoriteFoodDraft(transcript, localDate, favorites)
  if (favoriteDraft && (action === 'food_favorite' || action === 'food_draft' || action === 'unknown')) {
    return { aiCostCents, draft: favoriteDraft }
  }

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

    const contentType = request.headers.get('content-type') || ''
    let transcript = ''
    let localDate = ''
    let tzOffsetMin = new Date().getTimezoneOffset()
    let wantsVoiceReply = false
    let durationSeconds = 30
    let transcriptionCostCents = 0
    let clientFavorites: VoiceFoodFavorite[] = []

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('audio') || form.get('file')
      transcript = cleanText(form.get('transcript'), 2000)
      tzOffsetMin = Number(form.get('tzOffsetMin'))
      if (!Number.isFinite(tzOffsetMin)) tzOffsetMin = new Date().getTimezoneOffset()
      localDate = localDateFromRequest(form.get('localDate'), tzOffsetMin)
      wantsVoiceReply = String(form.get('voiceReply') || '').toLowerCase() === 'true'
      clientFavorites = parseFavoritesJson(form.get('favorites'))
      const durationMillis = Number(form.get('durationMillis'))
      durationSeconds = Number.isFinite(durationMillis) && durationMillis > 0 ? durationMillis / 1000 : 30
      if (!transcript && file instanceof File) {
        if (!file.type.startsWith('audio/')) return NextResponse.json({ error: 'File must be audio' }, { status: 400 })
        if (file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Audio must be less than 12MB' }, { status: 400 })
        const openai = getOpenAIClient()
        if (!openai) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
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
      clientFavorites = parseFavoritesJson(body?.favorites)
    }

    if (!transcript) return NextResponse.json({ error: 'No speech found' }, { status: 400 })

    const wallet = await new CreditManager(user.id).getWalletStatus()
    if (wallet.totalAvailableCents < SIMPLE_MIN_CREDITS) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: SIMPLE_MIN_CREDITS, availableCredits: wallet.totalAvailableCents }, { status: 402 })
    }

    const storedFavorites = await loadStoredFavorites(user.id).catch(() => [])
    const favorites = mergeFavorites(clientFavorites, storedFavorites)
    const favoriteDraft = await buildFavoriteFoodDraft(transcript, localDate, favorites)
    if (favoriteDraft) {
      const draft = favoriteDraft
      let aiCostCents = transcriptionCostCents
      let chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply) {
        const openai = getOpenAIClient()
        if (openai) {
          const tts = await speak(openai, draft.confirmationMessage, user.id)
          audio = tts.audio
          const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
          chargeCents += voiceCharge
          aiCostCents += tts.costCents
        }
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
        feature: 'voice-assistant:favorite-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'favorite-match',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; matched saved favorite`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft,
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }

    const openai = getOpenAIClient()
    if (!openai) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })

    const command = await runJsonCommandModel(openai, transcript, localDate, user.id)
    const normalized = await normalizeDraft(command.parsed, transcript, localDate, user.id, openai, tzOffsetMin, favorites)
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
