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
import { searchLocalFoods, type NormalizedFoodItem } from '@/lib/food-data'
import { searchCustomFoodMacros } from '@/lib/food/custom-foods'

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
  | 'food_build_meal'
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
    mealName?: string
    nutrition?: any
    items?: any[]
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

function round1(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(Math.max(0, n) * 10) / 10
}

function hasCoreNutrition(item: any) {
  return (
    Number.isFinite(Number(item?.calories ?? item?.calories_kcal)) &&
    Number.isFinite(Number(item?.protein_g ?? item?.protein)) &&
    Number.isFinite(Number(item?.carbs_g ?? item?.carbs)) &&
    Number.isFinite(Number(item?.fat_g ?? item?.fat))
  )
}

function servingGramsFromText(value: unknown) {
  const text = String(value || '').toLowerCase()
  const grams = text.match(/(\d+(?:\.\d+)?)\s*g\b/)
  if (grams) return Number(grams[1])
  const ml = text.match(/(\d+(?:\.\d+)?)\s*ml\b/)
  if (ml) return Number(ml[1])
  return null
}

function numberFromWords(value: unknown) {
  const text = String(value || '').toLowerCase().trim()
  const direct = Number(text)
  if (Number.isFinite(direct) && direct > 0) return direct
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    half: 0.5,
  }
  return words[text] || null
}

function estimateIngredientGrams(nameRaw: string, quantityRaw: unknown, unitRaw: unknown) {
  const name = compactFoodMatchText(nameRaw)
  const unit = compactFoodMatchText(unitRaw)
  const quantity = numberFromWords(quantityRaw) || 1
  const explicit = servingGramsFromText(`${quantityRaw || ''} ${unitRaw || ''}`)
  if (explicit) return explicit
  if (unit.includes('gram')) return quantity
  if (unit.includes('kg') || unit.includes('kilogram')) return quantity * 1000
  if (unit.includes('ml')) return quantity
  if (unit.includes('cup')) return quantity * 240
  if (unit.includes('tbsp') || unit.includes('tablespoon')) return quantity * 15
  if (unit.includes('tsp') || unit.includes('teaspoon')) return quantity * 5
  if (unit.includes('slice') || name.includes('toast') || name.includes('bread')) return quantity * 35
  if (unit.includes('egg') || name.includes('egg')) return quantity * 50
  if (unit.includes('avocado') || name.includes('avocado')) return quantity * 150
  if (name.includes('yoghurt') || name.includes('yogurt')) return quantity * 170
  return quantity * 100
}

function normalizeIngredientRequest(raw: any) {
  const name = cleanText(raw?.name || raw?.food || raw?.ingredient || raw, 120)
  if (!name) return null
  return {
    name,
    quantity: raw?.quantity ?? raw?.amount ?? null,
    unit: cleanText(raw?.unit || raw?.measure, 40) || null,
    display: cleanText(raw?.display || raw?.text || name, 160) || name,
  }
}

function splitIngredientList(value: string) {
  return String(value || '')
    .replace(/\band\b/gi, ',')
    .split(',')
    .map((part) => cleanText(part.replace(/[.?!]+$/g, ''), 120))
    .filter(Boolean)
    .slice(0, 12)
}

function parseIngredientPhrase(value: string) {
  const text = cleanText(value, 160)
  const match = text.match(
    /^(?:(one|two|three|four|five|six|seven|eight|nine|ten|half|\d+(?:\.\d+)?)\s+)?(?:(cup|cups|slice|slices|egg|eggs|gram|grams|g|kg|ml|tablespoon|tablespoons|tbsp|teaspoon|teaspoons|tsp)\s+(?:of\s+)?)?(.+)$/i,
  )
  if (!match) return normalizeIngredientRequest(text)
  const quantity = match[1] || null
  const unit = match[2] || null
  const name = cleanText(match[3] || text, 120)
  return normalizeIngredientRequest({ name, quantity, unit, display: text })
}

function tryParseIngredientMealRequest(transcript: string) {
  const text = cleanText(transcript, 1400)
  const lower = text.toLowerCase()
  const asksForFood =
    /\b(build|make|create|add|log|put|input|record)\b/.test(lower) &&
    /\b(breakfast|lunch|dinner|snack|meal|food)\b/.test(lower)
  if (!asksForFood) return null

  const meal = inferMealFromText(text, lower.includes('snack') ? 'snacks' : 'uncategorized')
  const afterWith = text.match(/\b(?:with|using|including|contains|made of)\b\s+(.+)$/i)?.[1]
  const afterColon = text.includes(':') ? text.split(':').slice(1).join(':') : ''
  const listText = cleanText(afterWith || afterColon, 1000)
  if (!listText) return null
  const ingredients = splitIngredientList(listText).map(parseIngredientPhrase).filter(Boolean)
  if (ingredients.length < 2) return null
  const mealName = meal === 'uncategorized' ? 'Meal' : `${meal.charAt(0).toUpperCase()}${meal.slice(1)}`
  return {
    meal,
    mealName,
    draftText: ingredients.map((entry: any) => entry.display || entry.name).join(', '),
    ingredients,
  }
}

function scoreFoodMatch(queryRaw: string, item: any) {
  const query = compactFoodMatchText(queryRaw)
  const name = compactFoodMatchText(item?.name || '')
  const brand = compactFoodMatchText(item?.brand || '')
  const text = `${name} ${brand}`.trim()
  if (!name) return -1000
  let score = 0
  const queryTokens = query.split(' ').filter(Boolean)
  const nameTokens = name.split(' ').filter(Boolean)
  if (name === query) score += 100
  if (nameTokens[0] && queryTokens[0] && nameTokens[0] === queryTokens[0]) score += 30
  if (queryTokens.every((token) => text.includes(token))) score += 20
  if (!brand) score += 8
  if (String(item?.source || '').toLowerCase() === 'custom') score -= 6
  if (/[A-Z]{4,}/.test(String(item?.name || ''))) score -= 4

  if (query.includes('egg')) {
    if (name.startsWith('egg whole')) score += 130
    else if (name.includes('whole egg') || name === 'egg') score += 80
    if (name.includes('liquid')) score -= 60
    if (name.includes('egg white') || name.includes('whites') || name.includes('substitute')) score -= 80
  }
  if (query.includes('yoghurt') || query.includes('yogurt')) {
    if ((name.includes('greek') || name.includes('strained')) && (name.includes('plain') || !brand)) score += 55
    if (name.includes('blueberry') || name.includes('strawberry') || name.includes('vanilla') || name.includes('honey')) score -= 55
    if (name.includes('protein')) score -= 15
  }
  if (query.includes('avocado')) {
    if (name === 'avocado' || name.startsWith('avocado raw')) score += 60
  }
  if (query.includes('sourdough') || query.includes('toast')) {
    if (name.includes('sourdough') || name.includes('toasted')) score += 45
  }
  return score
}

function chooseBestFoodMatch(query: string, items: any[]) {
  return items
    .filter(hasCoreNutrition)
    .sort((a, b) => scoreFoodMatch(query, b) - scoreFoodMatch(query, a))[0] || null
}

function itemCore(item: any, grams: number) {
  const baseGrams = servingGramsFromText(item?.serving_size) || 100
  const scale = baseGrams > 0 ? grams / baseGrams : 1
  const calories = Math.round(Number(item?.calories ?? item?.calories_kcal ?? 0) * scale)
  const protein = round1(Number(item?.protein_g ?? item?.protein ?? 0) * scale)
  const carbs = round1(Number(item?.carbs_g ?? item?.carbs ?? 0) * scale)
  const fat = round1(Number(item?.fat_g ?? item?.fat ?? 0) * scale)
  const fiber = round1(Number(item?.fiber_g ?? item?.fiber ?? 0) * scale)
  const sugar = round1(Number(item?.sugar_g ?? item?.sugar ?? 0) * scale)
  return { calories, protein, carbs, fat, fiber, sugar, grams: Math.round(grams) }
}

function normalizeFoodItem(item: any): NormalizedFoodItem | null {
  if (!item?.name) return null
  return {
    source: 'usda',
    id: String(item.id || item.name),
    name: item.name,
    brand: item.brand ?? null,
    serving_size: item.serving_size || '100 g',
    calories: item.calories ?? null,
    protein_g: item.protein_g ?? null,
    carbs_g: item.carbs_g ?? null,
    fat_g: item.fat_g ?? null,
    fiber_g: item.fiber_g ?? null,
    sugar_g: item.sugar_g ?? null,
  }
}

async function findFoodIngredient(query: string) {
  const lookupQueries = compactFoodMatchText(query).includes('egg') ? ['Egg, whole', query] : [query]
  for (const lookupQuery of lookupQueries) {
    const local = await searchLocalFoods(lookupQuery, { pageSize: 18, mode: 'prefix-contains' })
    const localMatch = chooseBestFoodMatch(query, local)
    if (localMatch) return localMatch
  }

  const custom = await searchCustomFoodMacros(query, 6, { allowTypo: true }).catch(() => [])
  const customMatch = chooseBestFoodMatch(query, custom.map(normalizeFoodItem).filter(Boolean))
  return customMatch || null
}

async function buildVoiceMealDraft(parsedFood: any, transcript: string, localDate: string) {
  const parsedIngredients = Array.isArray(parsedFood?.ingredients)
    ? parsedFood.ingredients.map(normalizeIngredientRequest).filter(Boolean)
    : []
  if (parsedIngredients.length === 0) return null

  const meal = cleanText(parsedFood?.meal || inferMealFromText(transcript, 'uncategorized'), 40).toLowerCase() || 'uncategorized'
  const mealName =
    cleanText(parsedFood?.mealName || parsedFood?.title, 120) ||
    `${meal === 'uncategorized' ? 'Meal' : `${meal.charAt(0).toUpperCase()}${meal.slice(1)}`} from voice`

  const resolved = await Promise.all(
    parsedIngredients.slice(0, 12).map(async (ingredient: any) => {
      const found = await findFoodIngredient(ingredient.name)
      if (!found) return { ingredient, found: null }
      const grams = estimateIngredientGrams(ingredient.name, ingredient.quantity, ingredient.unit)
      const core = itemCore(found, grams)
      return {
        ingredient,
        found,
        core,
        item: {
          ...found,
          name: found.name,
          label: found.name,
          requestedName: ingredient.name,
          requestedAmount: ingredient.display,
          serving_size: `${core.grams} g estimated`,
          calories: core.calories,
          calories_kcal: core.calories,
          protein_g: core.protein,
          carbs_g: core.carbs,
          fat_g: core.fat,
          fiber_g: core.fiber,
          sugar_g: core.sugar,
        },
      }
    }),
  )

  const found = resolved.filter((entry) => entry.found && entry.item)
  if (found.length === 0) return null

  const missing = resolved.filter((entry) => !entry.found).map((entry) => entry.ingredient.name)
  const totals = found.reduce(
    (acc, entry: any) => {
      acc.calories += Number(entry.core.calories) || 0
      acc.protein += Number(entry.core.protein) || 0
      acc.carbs += Number(entry.core.carbs) || 0
      acc.fat += Number(entry.core.fat) || 0
      acc.fiber += Number(entry.core.fiber) || 0
      acc.sugar += Number(entry.core.sugar) || 0
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
  )
  const nutrition = {
    calories: Math.round(totals.calories),
    calories_kcal: Math.round(totals.calories),
    protein: round1(totals.protein),
    protein_g: round1(totals.protein),
    carbs: round1(totals.carbs),
    carbs_g: round1(totals.carbs),
    fat: round1(totals.fat),
    fat_g: round1(totals.fat),
    fiber: round1(totals.fiber),
    fiber_g: round1(totals.fiber),
    sugar: round1(totals.sugar),
    sugar_g: round1(totals.sugar),
    __voiceBuiltMeal: true,
  }
  const items = found.map((entry: any) => entry.item)
  const entries = found.map((entry: any) => ({
    name: entry.ingredient.display || entry.ingredient.name,
    description: `${entry.found.name} - ${entry.core.grams} g estimated`,
    meal,
  }))
  const ingredientList = entries.map((entry) => entry.name).join(', ')
  const missingLine = missing.length ? ` I could not find ${missing.join(', ')}, so please check before saving.` : ''

  return {
    action: 'food_build_meal' as const,
    transcript,
    localDate,
    summary: `${mealName}, ${nutrition.calories} kcal`,
    confirmationMessage: `I found these ingredients for ${meal}: ${ingredientList}. Please confirm before I add it.${missingLine}`,
    canConfirm: true,
    food: {
      meal,
      mealName,
      draftText: ingredientList,
      entries,
      items,
      nutrition,
    },
  }
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
        'Allowed action values: exercise, mood, journal, food_copy_previous, food_build_meal, food_draft, recipe, unknown.',
        'For exercise, infer the exercise name, duration, distance, and intensity from any natural wording. If duration is missing, estimate a practical duration and mark estimatedDuration true.',
        'For mood, use mood score 1 very low to 7 very good, plus short tags and a note.',
        'For journal, make a short title and journal content.',
        'For food_copy_previous, only use when the user asks for same breakfast/meal as yesterday or previous day.',
        'For new meals or foods with named ingredients, return food_build_meal with meal, mealName, draftText, and ingredients array. The app will find nutrition before confirmation.',
        'Use food_draft only when the user gives a vague food request without any usable food names.',
        'For recipes, return action recipe and recipeRequest.',
        'Shape: {"action":"...","summary":"...","confirmationMessage":"...","exercise":{"name":"walking","durationMinutes":60,"distanceKm":5,"estimatedDuration":true},"mood":{"mood":2,"tags":["sad"],"note":"..."},"journal":{"title":"...","content":"...","tags":["..."]},"food":{"meal":"breakfast","mealName":"Breakfast","draftText":"...","ingredients":[{"name":"egg","quantity":2,"unit":"each","display":"two eggs"}]},"recipeRequest":"..."}',
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
  const action: VoiceAction = ['exercise', 'mood', 'journal', 'food_copy_previous', 'food_favorite', 'food_build_meal', 'food_draft', 'recipe'].includes(actionRaw)
    ? actionRaw
    : 'unknown'
  let aiCostCents = 0
  let usedModel: string | undefined

  const favoriteDraft = await buildFavoriteFoodDraft(transcript, localDate, favorites)
  if (favoriteDraft && (action === 'food_favorite' || action === 'food_build_meal' || action === 'food_draft' || action === 'unknown')) {
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

  if (action === 'food_build_meal' || action === 'food_draft') {
    const builtMeal = await buildVoiceMealDraft(parsed?.food || {}, transcript, localDate)
    if (builtMeal) {
      return { aiCostCents, draft: builtMeal }
    }
  }

  if (action === 'food_draft' || action === 'food_build_meal') {
    const draftText = cleanText(parsed?.food?.draftText || transcript, 1200)
    const meal = cleanText(parsed?.food?.meal || inferMealFromText(transcript, 'uncategorized'), 40)
    return {
      aiCostCents,
      draft: {
        action: 'food_draft',
        transcript,
        localDate,
        summary: 'Food draft ready',
        confirmationMessage: `I can see the food request, but I could not match enough ingredients yet: ${draftText}. Please try naming the foods one by one.`,
        canConfirm: false,
        food: { meal: meal || 'uncategorized', draftText },
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

    const quickMealFood = tryParseIngredientMealRequest(transcript)
    const quickMealDraft = quickMealFood ? await buildVoiceMealDraft(quickMealFood, transcript, localDate) : null
    if (quickMealDraft) {
      const draft = quickMealDraft
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
        feature: 'voice-assistant:quick-meal-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'food-ingredient-match',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; built meal from ingredient search`,
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
