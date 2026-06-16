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
  | 'water'
  | 'recipe'
  | 'symptom_analysis'
  | 'health_question'
  | 'app_handoff'
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
  autoSave?: boolean
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
    journalType?: 'mood' | 'health'
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
    importDraft?: any
  }
  water?: {
    amount: number
    unit: 'ml' | 'l' | 'oz'
    amountMl: number
    label: string
    category?: string | null
    drinkType?: string | null
    sweetener?: {
      type: 'free' | 'sugar' | 'honey'
      amount?: number | null
      unit?: 'g' | 'tsp' | 'tbsp' | null
      grams?: number | null
    } | null
  }
  appTarget?: {
    title: string
    path: string
    buttonLabel?: string
    nativeTarget?: any
  }
}

const SELF_HARM_RISK_PATTERN =
  /\b(kill myself|hurt myself|hurting myself|harm myself|harming myself|end my life|suicide|suicidal|self[-\s]?harm|do not want to live|don't want to live|want to die|wish i was dead|can't go on|cant go on)\b/i

function hasSelfHarmRisk(value: unknown) {
  return SELF_HARM_RISK_PATTERN.test(String(value || ''))
}

function buildSelfHarmSupportDraft(transcript: string, localDate: string): VoiceDraft {
  const raw = cleanText(transcript, 1200)
  return {
    action: 'health_question',
    transcript: raw,
    localDate,
    summary: 'Urgent support',
    confirmationMessage:
      'If you might hurt yourself or are in immediate danger, call your local emergency number now. I can open Talk to Helfi with your message ready, but please contact urgent support right away.',
    canConfirm: false,
    autoSave: false,
    appTarget: {
      title: 'Talk to Helfi',
      path: `/chat?voicePrompt=${encodeQueryValue(raw, 1200)}`,
      buttonLabel: 'Open Talk to Helfi',
    },
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

function encodeQueryValue(value: unknown, max = 1000) {
  return encodeURIComponent(cleanText(value, max))
}

function encodeUrlJson(value: any) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
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

const INGREDIENT_LOOKUP_FILLER_WORDS = new Set([
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'half',
  'small',
  'medium',
  'large',
  'extra',
  'xl',
  'slice',
  'slices',
  'gram',
  'grams',
  'g',
  'kg',
  'ml',
  'cup',
  'cups',
  'tablespoon',
  'tablespoons',
  'tbsp',
  'teaspoon',
  'teaspoons',
  'tsp',
  'of',
])

function singularFoodToken(token: string) {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`
  if (token.endsWith('es') && token.length > 3 && !/(ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2)
  if (token.endsWith('s') && token.length > 3 && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

function singularFoodText(value: string) {
  return compactFoodMatchText(value).split(' ').filter(Boolean).map(singularFoodToken).join(' ')
}

function stripIngredientLookupModifiers(value: unknown) {
  const tokens = compactFoodMatchText(value).split(' ').filter(Boolean)
  return tokens
    .filter((token) => !/^\d+(?:\.\d+)?$/.test(token))
    .filter((token) => !INGREDIENT_LOOKUP_FILLER_WORDS.has(token))
    .join(' ')
}

function buildIngredientLookupQueries(query: string) {
  const compactQuery = compactFoodMatchText(query)
  const strippedQuery = stripIngredientLookupModifiers(query)
  const queries = new Set<string>()
  const add = (value: unknown) => {
    const cleaned = cleanText(value, 120)
    if (cleaned) queries.add(cleaned)
  }

  add(strippedQuery)
  if (strippedQuery.includes('greek yogurt') || strippedQuery.includes('greek yoghurt')) {
    add('greek yogurt')
    add('plain greek yogurt')
    add('greek yoghurt')
    add('plain greek yoghurt')
  }
  if (strippedQuery === 'rice') {
    add('cooked rice')
    add('white rice')
    add('brown rice')
  }
  if (strippedQuery === 'coffee') {
    add('brewed coffee')
    add('black coffee')
  }
  if (strippedQuery.includes('protein shake')) {
    add('protein shake')
    add('protein drink')
  }
  if (/\b(toast|bread|sourdough)\b/.test(strippedQuery) && !/\bfrench toast\b/.test(strippedQuery)) {
    add('sourdough toast')
    add('toasted bread')
    add('sourdough bread')
    add('bread')
  }
  add(compactQuery)
  add(query)
  return Array.from(queries)
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

function inferTargetMealFromText(text: string, fallback?: string | null) {
  const match = compactFoodMatchText(text).match(/\b(?:to|for|as|into|in)\s+(?:my\s+)?(breakfast|lunch|dinner|snacks?|snack)\b/)
  if (match?.[1]) return match[1].startsWith('snack') ? 'snacks' : match[1]
  return inferMealFromText(text, fallback)
}

function normalizeWaterUnit(value: string): 'ml' | 'l' | 'oz' | null {
  const unit = value.toLowerCase()
  if (unit === 'ml' || unit.includes('millilitre') || unit.includes('milliliter')) return 'ml'
  if (unit === 'l' || unit.includes('litre') || unit.includes('liter')) return 'l'
  if (unit === 'oz' || unit.includes('ounce')) return 'oz'
  return null
}

function waterAmountToMl(amount: number, unit: 'ml' | 'l' | 'oz') {
  if (unit === 'l') return Math.round(amount * 1000 * 10) / 10
  if (unit === 'oz') return Math.round(amount * 29.5735 * 10) / 10
  return Math.round(amount * 10) / 10
}

function parseWaterAmount(text: string): { amount: number; unit: 'ml' | 'l' | 'oz'; amountMl: number } | null {
  const lower = text.toLowerCase()
  const explicit = lower.match(/\b(\d+(?:\.\d+)?)\s*(ml|millilitres?|milliliters?|l|litres?|liters?|oz|ounces?)\b/)
  if (explicit) {
    const amount = Number(explicit[1])
    const unit = normalizeWaterUnit(explicit[2])
    if (Number.isFinite(amount) && amount > 0 && unit) return { amount, unit, amountMl: waterAmountToMl(amount, unit) }
  }
  if (/\b(glass|cup)\b/.test(lower)) return { amount: 250, unit: 'ml', amountMl: 250 }
  if (/\b(bottle)\b/.test(lower)) return { amount: 600, unit: 'ml', amountMl: 600 }
  return null
}

function inferDrinkType(text: string) {
  const lower = text.toLowerCase()
  if (/\bhot chocolate|cocoa\b/.test(lower)) return 'Hot chocolate'
  if (/\bcoffee|espresso|latte|cappuccino|flat white\b/.test(lower)) return 'Coffee'
  if (/\btea\b/.test(lower)) return 'Tea'
  if (/\bjuice\b/.test(lower)) return 'Juice'
  if (/\bmilk\b/.test(lower)) return 'Milk'
  if (/\bsoft drink|soda|coke zero|coke|cola|lemonade\b/.test(lower)) return 'Soft drink'
  if (/\bwater|hydration\b/.test(lower)) return 'Water'
  return ''
}

function sweetenerGrams(amount: number, unit: 'g' | 'tsp' | 'tbsp', type: 'sugar' | 'honey') {
  if (unit === 'g') return amount
  if (type === 'honey') return unit === 'tbsp' ? amount * 21 : amount * 7
  return unit === 'tbsp' ? amount * 12 : amount * 4
}

function parseSweetener(text: string): { type: 'free' | 'sugar' | 'honey'; amount?: number | null; unit?: 'g' | 'tsp' | 'tbsp' | null; grams?: number | null; needsAmount?: boolean } | null {
  const lower = text.toLowerCase()
  if (/\b(black|plain|unsweetened|sugar[-\s]?free|no sugar|without sugar|zero)\b/.test(lower)) return { type: 'free' }
  const sweetType: 'sugar' | 'honey' | null = /\bhoney\b/.test(lower) ? 'honey' : /\bsugar\b/.test(lower) ? 'sugar' : null
  if (!sweetType) return null
  const match = lower.match(/\b(\d+(?:\.\d+)?)\s*(g|grams?|tsp|teaspoons?|tbsp|tablespoons?)\s+(?:of\s+)?(?:sugar|honey)\b/)
  if (!match) return { type: sweetType, needsAmount: true }
  const amount = Number(match[1])
  const rawUnit = match[2]
  const unit: 'g' | 'tsp' | 'tbsp' = rawUnit.startsWith('g') ? 'g' : rawUnit.startsWith('tbsp') || rawUnit.startsWith('tablespoon') ? 'tbsp' : 'tsp'
  const grams = Number.isFinite(amount) && amount > 0 ? sweetenerGrams(amount, unit, sweetType) : null
  return { type: sweetType, amount, unit, grams }
}

function tryParseWaterRequest(transcript: string, localDate: string): VoiceDraft | null {
  const raw = cleanText(transcript, 800)
  const lower = raw.toLowerCase()
  if (!/\b(log|add|record|track)\b/.test(lower)) return null
  if (!/\b(water|hydration|drink|liquid|coffee|tea|juice|milk|soft drink|soda|coke|cola|hot chocolate)\b/.test(lower)) return null

  const amount = parseWaterAmount(raw)
  const drinkType = inferDrinkType(raw)
  const meal = inferMealFromText(raw, 'other')
  const category = meal === 'uncategorized' ? 'other' : meal
  if (!amount) {
    return {
      action: 'water',
      transcript: raw,
      localDate,
      summary: 'Water amount needed',
      confirmationMessage: 'How much liquid should I log? For example, say "Log 500 ml water."',
      canConfirm: false,
    }
  }
  if (!drinkType) {
    return {
      action: 'water',
      transcript: raw,
      localDate,
      summary: 'Drink type needed',
      confirmationMessage: 'What drink should I log?',
      canConfirm: false,
    }
  }

  const sweetener = parseSweetener(raw)
  const isPlainWater = drinkType === 'Water'
  if (!isPlainWater && !sweetener) {
    return {
      action: 'water',
      transcript: raw,
      localDate,
      summary: `${amount.amount} ${amount.unit} ${drinkType}`,
      confirmationMessage: `Should I log ${drinkType} as sugar-free, or with sugar or honey?`,
      canConfirm: false,
      water: { ...amount, label: drinkType, category, drinkType, sweetener: null },
    }
  }
  if (sweetener?.needsAmount) {
    return {
      action: 'water',
      transcript: raw,
      localDate,
      summary: `${amount.amount} ${amount.unit} ${drinkType}`,
      confirmationMessage: `How much ${sweetener.type} should I add to the ${drinkType}?`,
      canConfirm: false,
      water: { ...amount, label: drinkType, category, drinkType, sweetener: null },
    }
  }

  const sweetenerLabel =
    sweetener && sweetener.type !== 'free' && sweetener.amount && sweetener.unit
      ? ` (${sweetener.type} ${sweetener.amount} ${sweetener.unit})`
      : ''
  const label = `${drinkType}${sweetenerLabel}`
  return {
    action: 'water',
    transcript: raw,
    localDate,
    summary: `${amount.amount} ${amount.unit} ${label}`,
    confirmationMessage: `I will log ${amount.amount} ${amount.unit} ${label}.`,
    canConfirm: true,
    autoSave: true,
    water: {
      ...amount,
      label,
      category,
      drinkType,
      sweetener: isPlainWater ? null : sweetener || { type: 'free' },
    },
  }
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
  let best: { favorite: VoiceFoodFavorite; score: number; specificity: number } | null = null

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
    const specificity = labelTokens.length * 100 + label.length
    if (score >= 0.72 && (!best || score > best.score || (score === best.score && specificity > best.specificity))) {
      best = { favorite, score, specificity }
    }
  }

  return best?.favorite || null
}

function shouldUseFavoriteFood(transcript: string, favorites: VoiceFoodFavorite[]) {
  const request = compactFoodMatchText(transcript)
  if (!request || favorites.length === 0) return false
  if (/\b(favourite|favorite|saved)\b/i.test(transcript)) return true
  return favorites.some((favorite) => {
    const label = compactFoodMatchText(favorite.label || favorite.description || '')
    const labelTokens = label.split(' ').filter(Boolean)
    if (!label || label.length < 10 || labelTokens.length < 2) return false
    return request.includes(label)
  })
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
  if (name.includes('olive oil') || name.includes('cooking oil') || name === 'oil') return quantity * 15
  if (name.includes('coffee')) return quantity * 240
  if (name.includes('protein shake') || name.includes('smoothie')) return quantity * 300
  if (unit.includes('slice') || name.includes('toast') || name.includes('bread')) return quantity * 35
  if (unit.includes('egg') || name.includes('egg')) {
    if (name.includes('small')) return quantity * 38
    if (name.includes('medium')) return quantity * 44
    if (name.includes('extra large')) return quantity * 56
    if (name.includes('large')) return quantity * 50
    return quantity * 50
  }
  if (name.includes('banana')) {
    if (name.includes('small')) return quantity * 100
    if (name.includes('medium')) return quantity * 120
    if (name.includes('extra large')) return quantity * 160
    if (name.includes('large')) return quantity * 140
    return quantity * 120
  }
  if (unit.includes('avocado') || name.includes('avocado')) {
    if (name.includes('small')) return quantity * 120
    if (name.includes('medium')) return quantity * 170
    if (name.includes('extra large')) return quantity * 290
    if (name.includes('large')) return quantity * 230
    return quantity * 170
  }
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

  const meal = inferMealFromText(text, lower.includes('snack') || lower.includes('coffee') || lower.includes('drink') ? 'snacks' : 'uncategorized')
  const withMatch = text.match(/^(.*?)\b(?:with|using|including|contains|made of)\b\s+(.+)$/i)
  const beforeWith = cleanText(
    withMatch?.[1]
      ?.replace(/\b(build|make|create|add|log|put|input|record)\b/gi, ' ')
      .replace(/\b(me|a|an|my|breakfast|lunch|dinner|snacks?|meal|food)\b/gi, ' '),
    500,
  )
  const afterWith = withMatch?.[2]
  const afterColon = text.includes(':') ? text.split(':').slice(1).join(':') : ''
  const listText = cleanText([beforeWith, afterWith || afterColon].filter(Boolean).join(', '), 1000)
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

function tryParseDirectFoodRequest(transcript: string) {
  const text = cleanText(transcript, 1400)
  const lower = text.toLowerCase()
  if (!/\b(add|log|put|input|record)\b/.test(lower)) return null
  if (!/\b(food|meal|breakfast|lunch|dinner|snack|snacks|coffee|banana|shake|smoothie|yogurt|yoghurt|egg|toast|avocado|chicken|rice|milk)\b/.test(lower)) return null
  if (/\b(favourite|favorite|saved|same|yesterday|previous)\b/.test(lower)) return null

  const meal = inferMealFromText(text, lower.includes('snack') || lower.includes('coffee') || lower.includes('drink') ? 'snacks' : 'uncategorized')
  const withoutCommand = text
    .replace(/\b(add|log|put|input|record)\b/gi, ' ')
    .replace(/\b(as|for)\s+(?:a\s+|an\s+)?(breakfast|lunch|dinner|snacks?|meal)\b/gi, ' ')
    .replace(/\b(to|into|in)\s+(?:my\s+)?(breakfast|lunch|dinner|snacks?)\b/gi, ' ')
    .replace(/\b(breakfast|lunch|dinner|snacks?|meal|food)\b/gi, ' ')
    .replace(/\b(to|in)\s+(my\s+)?(food\s+)?(diary|log)\b/gi, ' ')
    .replace(/\b(a|an|my|please)\b/gi, ' ')
  const listText = cleanText(withoutCommand.replace(/\bwith\b/gi, ',').replace(/\band\b/gi, ','), 1000)
  const ingredients = splitIngredientList(listText).map(parseIngredientPhrase).filter(Boolean)
  if (ingredients.length === 0) return null
  const foodWordsInRequest = /\b(coffee|banana|shake|smoothie|yogurt|yoghurt|egg|eggs|toast|avocado|chicken|rice|milk|tea|honey|water|juice|oats?|muffins?|frittata|fritata)\b/.test(listText.toLowerCase())
  if (ingredients.length === 1 && !foodWordsInRequest) return null
  const mealName = meal === 'uncategorized' ? 'Food' : `${meal.charAt(0).toUpperCase()}${meal.slice(1)}`
  return {
    meal,
    mealName,
    draftText: ingredients.map((entry: any) => entry.display || entry.name).join(', '),
    ingredients,
  }
}

function tryParseExerciseRequest(transcript: string) {
  const raw = cleanText(transcript, 600)
  const lower = raw.toLowerCase()
  if (!/\b(log|add|record|track)\b/.test(lower)) return null
  if (!/\b(walk|run|gym|workout|bike|cycle|ride|exercise)\b/.test(lower)) return null
  const distanceMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(km|kilometre|kilometer|kilometres|kilometers|mi|mile|miles)\b/)
  const durationMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(minute|minutes|min|mins|hour|hours|hr|hrs)\b/)
  const distanceKm = distanceMatch ? Number(distanceMatch[1]) * (distanceMatch[2].startsWith('mi') || distanceMatch[2].startsWith('mile') ? 1.609 : 1) : null
  const durationRaw = durationMatch ? Number(durationMatch[1]) : null
  const durationMinutes = durationRaw
    ? durationRaw * (/hour|hr/.test(durationMatch?.[2] || '') ? 60 : 1)
    : distanceKm
    ? lower.includes('run')
      ? Math.max(10, Math.round(distanceKm * 7))
      : lower.includes('bike') || lower.includes('cycle') || lower.includes('ride')
      ? Math.max(10, Math.round(distanceKm * 4))
      : Math.max(10, Math.round(distanceKm * 12))
    : lower.includes('gym') || lower.includes('workout')
    ? 45
    : 30
  const name = lower.includes('run')
    ? 'running'
    : lower.includes('bike') || lower.includes('cycle') || lower.includes('ride')
    ? 'cycling'
    : lower.includes('gym') || lower.includes('workout')
    ? 'gym'
    : 'walking'
  const intensity = lower.includes('hard') || lower.includes('intense')
    ? 'hard'
    : lower.includes('easy') || lower.includes('light')
    ? 'light'
    : lower.includes('moderate')
    ? 'moderate'
    : null
  return {
    action: 'exercise',
    summary: raw,
    exercise: {
      name,
      durationMinutes,
      distanceKm: distanceKm ? Math.round(distanceKm * 10) / 10 : null,
      intensity,
      estimatedDuration: !durationMatch,
    },
  }
}

function tryParseMoodRequest(transcript: string) {
  const raw = cleanText(transcript, 600)
  const lower = raw.toLowerCase()
  if (!/\b(feel|feeling|felt|mood|sad|anxious|anxiety|great|happy|low|stressed|angry|calm)\b/.test(lower)) return null
  const mood = lower.includes('great') || lower.includes('happy') || lower.includes('good')
    ? 6
    : lower.includes('sad') || lower.includes('low')
    ? 2
    : lower.includes('anxious') || lower.includes('anxiety') || lower.includes('stressed')
    ? 3
    : 4
  const tags = [
    lower.includes('sad') || lower.includes('low') ? 'sad' : '',
    lower.includes('anxious') || lower.includes('anxiety') ? 'anxious' : '',
    lower.includes('stressed') ? 'stressed' : '',
    lower.includes('great') || lower.includes('happy') ? 'positive' : '',
  ].filter(Boolean)
  return { action: 'mood', mood: { mood, tags, note: raw } }
}

function tryParseJournalRequest(transcript: string) {
  const raw = cleanText(transcript, 1200)
  const lower = raw.toLowerCase()
  if (!/\b(journal|note|diary)\b/.test(lower)) return null
  if (/\b(open|show|go to|take me to|use|find)\b/.test(lower)) return null
  if (!/\b(add|save|record|log|write|journal that|note that|diary that)\b/.test(lower)) return null
  const journalType = /\bhealth journal\b/.test(lower) ? 'health' : 'mood'
  const content = cleanText(
    raw
      .replace(/^add this to my journal:?\s*/i, '')
      .replace(/^journal that\s*/i, '')
      .replace(/^(?:add|save|record|log)\s+(?:a\s+)?(?:mood\s+|health\s+)?(?:journal|note|diary)(?:\s+note)?(?:\s+that)?\s*/i, ''),
    1200,
  )
  if (!content) return null
  return {
    action: 'journal',
    journal: {
      title: journalType === 'health' ? 'Voice health journal note' : 'Voice journal note',
      content,
      tags: [],
      journalType,
    },
  }
}

function tryParseCopyPreviousRequest(transcript: string) {
  const raw = cleanText(transcript, 600)
  const lower = raw.toLowerCase()
  if (!/\b(add|log|copy|same|repeat)\b/.test(lower)) return null
  if (!/\b(same|yesterday|previous)\b/.test(lower)) return null
  if (!/\b(breakfast|lunch|dinner|snack|snacks|meal|food)\b/.test(lower)) return null
  return {
    action: 'food_copy_previous',
    food: {
      meal: inferMealFromText(raw, 'breakfast'),
    },
  }
}

const RECIPE_PLAIN_INGREDIENTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(chicken breast|chicken)\b/i, label: '150 g chicken breast' },
  { pattern: /\b(cooked rice|brown rice|white rice|rice)\b/i, label: '120 g cooked rice' },
  { pattern: /\bavocado\b/i, label: '75 g avocado' },
  { pattern: /\b(greek yogh?urt|yogh?urt|yogurt)\b/i, label: '170 g plain Greek yogurt' },
  { pattern: /\b(egg|eggs)\b/i, label: '2 large eggs' },
  { pattern: /\b(toast|bread|sourdough)\b/i, label: '1 slice sourdough toast' },
  { pattern: /\b(oats?|rolled oats)\b/i, label: '1 cup rolled oats' },
  { pattern: /\bblueberr(?:y|ies)\b/i, label: '100 g blueberries' },
  { pattern: /\bbanana\b/i, label: '1 banana' },
  { pattern: /\b(salmon)\b/i, label: '150 g salmon' },
  { pattern: /\b(sweet potato)\b/i, label: '150 g sweet potato' },
  { pattern: /\b(broccoli)\b/i, label: '100 g broccoli' },
  { pattern: /\b(spinach)\b/i, label: '75 g spinach' },
  { pattern: /\b(chickpeas?|chick peas?)\b/i, label: '100 g chickpeas' },
  { pattern: /\b(olive oil|oil)\b/i, label: '1 tbsp olive oil' },
]

function requestedRecipeIngredients(transcript: string) {
  const match = transcript.match(/\b(?:with|using|including|from|made of)\b\s+(.+)$/i)
  if (!match?.[1]) return []
  const text = cleanText(match[1].replace(/[.?!]+$/g, ''), 500)
  const found = RECIPE_PLAIN_INGREDIENTS
    .map((entry) => {
      const ingredientMatch = text.match(entry.pattern)
      return ingredientMatch?.index === undefined ? null : { index: ingredientMatch.index, label: entry.label }
    })
    .filter((entry): entry is { index: number; label: string } => Boolean(entry))
    .sort((a, b) => a.index - b.index)
  const unique = Array.from(new Set(found.map((entry) => entry.label)))
  if (unique.length > 0) return unique.slice(0, 10)

  return splitIngredientList(text)
    .map((part) => parseIngredientPhrase(part))
    .filter(Boolean)
    .map((entry: any) => entry.display || entry.name)
    .slice(0, 10)
}

function buildQuickRecipeDraft(transcript: string, localDate: string): VoiceDraft | null {
  const raw = cleanText(transcript, 1000)
  const lower = raw.toLowerCase()
  if (!/\b(recipe|meal idea)\b/.test(lower)) return null
  if (!/\b(create|make|give|suggest|build)\b/.test(lower)) return null
  const meal = lower.includes('breakfast') ? 'breakfast' : lower.includes('lunch') ? 'lunch' : lower.includes('snack') ? 'snack' : 'dinner'
  const highProtein = /\b(high protein|high-protein|protein)\b/.test(lower)
  const lowCalorie = /\b(low calorie|low-calorie|light)\b/.test(lower)
  const requestedIngredients = requestedRecipeIngredients(raw)
  const title = requestedIngredients.length
    ? `${meal.charAt(0).toUpperCase()}${meal.slice(1)} recipe`
    : `${highProtein ? 'High-protein ' : lowCalorie ? 'Low-calorie ' : ''}${meal} recipe`
  const ingredients = requestedIngredients.length
    ? requestedIngredients
    : meal === 'breakfast'
    ? highProtein
      ? ['2 large eggs', '170 g plain Greek yogurt', '1 slice sourdough toast', '75 g avocado']
      : ['1 cup rolled oats', '170 g plain Greek yogurt', '100 g blueberries', '1 tbsp chia seeds']
    : meal === 'lunch'
    ? highProtein
      ? ['150 g chicken breast', '120 g cooked brown rice', '75 g spinach', '1 tbsp olive oil']
      : ['120 g cooked brown rice', '100 g chickpeas', '75 g spinach', '1 tbsp olive oil']
    : meal === 'snack'
    ? highProtein
      ? ['1 protein shake', '1 banana']
      : ['170 g plain Greek yogurt', '100 g berries']
    : highProtein
    ? ['150 g chicken breast', '150 g sweet potato', '100 g broccoli', '1 tbsp olive oil']
    : ['150 g salmon', '150 g potato', '100 g broccoli', '1 tbsp olive oil']
  const steps = [
    'Prepare the ingredients.',
    requestedIngredients.length
      ? 'Cook any ingredients that need cooking.'
      : meal === 'breakfast'
      ? 'Cook or assemble the breakfast ingredients.'
      : 'Cook the main protein and vegetables until done.',
    'Combine, season to taste, and serve.',
  ]
  const importDraft = {
    title,
    source: 'voice-assistant',
    servings: 1,
    prepMinutes: 10,
    cookMinutes: meal === 'snack' ? 0 : 15,
    ingredients,
    steps,
    sourceUrl: null,
    saveRecipe: false,
    createdAt: Date.now(),
  }
  const params = new URLSearchParams()
  params.set('date', localDate)
  params.set('category', meal === 'snack' ? 'snacks' : meal)
  params.set('recipeImport', '1')
  params.set('voiceRecipeDraft', encodeUrlJson(importDraft))
  params.set('t', String(Date.now()))
  return {
    action: 'recipe',
    transcript: raw,
    localDate,
    summary: 'Recipe ready in Build a meal',
    confirmationMessage: 'I created this as a normal Build a meal recipe. Nothing has been saved yet.',
    canConfirm: false,
    recipe: { text: '', importDraft },
    appTarget: {
      title: 'Build a meal',
      path: `/food/build-meal?${params.toString()}`,
      buttonLabel: 'Open Build a meal',
    },
  }
}

function buildRecipeHandoffDraft(transcript: string, localDate: string, recipeText?: string): VoiceDraft {
  const quick = buildQuickRecipeDraft(`create recipe ${transcript}`, localDate)
  if (quick) return quick
  const importDraft = {
    title: cleanText(transcript, 100) || 'Custom meal recipe',
    source: 'voice-assistant',
    servings: 1,
    prepMinutes: null,
    cookMinutes: null,
    ingredients: ['150 g chicken breast', '150 g sweet potato', '100 g broccoli', '1 tbsp olive oil'],
    steps: recipeText
      ? String(recipeText)
          .split('\n')
          .map((line) => cleanText(line, 220))
          .filter(Boolean)
          .slice(0, 12)
      : ['Prepare the ingredients.', 'Cook until done.', 'Combine, season to taste, and serve.'],
    sourceUrl: null,
    saveRecipe: false,
    createdAt: Date.now(),
  }
  const params = new URLSearchParams()
  params.set('date', localDate)
  params.set('category', 'dinner')
  params.set('recipeImport', '1')
  params.set('voiceRecipeDraft', encodeUrlJson(importDraft))
  params.set('t', String(Date.now()))
  return {
    action: 'recipe',
    transcript,
    localDate,
    summary: 'Recipe ready in Build a meal',
    confirmationMessage: 'I created this as a normal Build a meal recipe. Nothing has been saved yet.',
    canConfirm: false,
    recipe: { text: '', importDraft },
    appTarget: {
      title: 'Build a meal',
      path: `/food/build-meal?${params.toString()}`,
      buttonLabel: 'Open Build a meal',
    },
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
    const asksForPlain = !/\b(blueberry|strawberry|vanilla|honey|lemon|berry|chocolate|flavou?r|sweetened)\b/.test(query)
    if ((name.includes('greek') || name.includes('strained')) && (name.includes('plain') || !brand)) score += 90
    if (asksForPlain && name.includes('plain')) score += 70
    if (asksForPlain && /\b(crunch|flip|cookie|cookies|chocolate|lemon|berry|blueberry|strawberry|vanilla|honey|dessert|bar|dip|spread|flavou?r|sweetened|coconut|almond|maple|cinnamon)\b/.test(name)) score -= 140
    if (name.includes('protein')) score -= 15
  }
  if (query.includes('avocado')) {
    if (name === 'avocado' || name.startsWith('avocado raw')) score += 60
  }
  if (query.includes('rice')) {
    if (name === 'rice' || name.includes('rice cooked') || name.includes('cooked rice') || name.includes('white rice') || name.includes('brown rice')) score += 130
    if (name.includes('honey') || name.includes('syrup') || name.includes('cereal') || name.includes('cracker')) score -= 160
  }
  if (query.includes('coffee')) {
    if (name === 'coffee' || name.includes('coffee brewed') || name.includes('brewed coffee') || name.includes('black coffee')) score += 140
    if (name.includes('creamer') || name.includes('creamers') || name.includes('almond milk') || name.includes('ice cream')) score -= 140
  }
  if (query.includes('olive oil') || query === 'oil') {
    if (name.includes('olive oil') || name.includes('extra virgin olive oil')) score += 130
    if (name.includes('spray')) score -= 20
  }
  if (query.includes('protein shake')) {
    if (name.includes('protein') && (name.includes('shake') || name.includes('drink'))) score += 120
    if (name.includes('powder')) score -= 160
    if (name.includes('bar')) score -= 90
  }
  if (/\b(toast|bread|sourdough)\b/.test(query) && !/\bfrench toast\b/.test(query)) {
    if (name.includes('sourdough')) score += 140
    if (/\bbread\b/.test(name)) score += 130
    if (/\btoast\b/.test(name) || /\btoasted\b/.test(name)) score += 60
    if (/\b(toaster|pastr(?:y|ies)|tart|pop tart|cake|cookie|cereal|cracker|waffle|dessert|muffin)\b/.test(name)) score -= 240
    if (/\b(apple|blueberry|cherry|strawberry|fruit|frosted|sweetened|syrup)\b/.test(name)) score -= 120
  }
  return score
}

function chooseBestFoodMatch(query: string, items: any[]) {
  const ranked = items
    .filter(hasCoreNutrition)
    .map((item) => ({ item, score: scoreFoodMatch(query, item) }))
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  return best && best.score > 12 ? best.item : null
}

async function findExactCustomPlainFood(lookupQueries: string[]) {
  for (const lookupQuery of lookupQueries) {
    const queryName = singularFoodText(lookupQuery)
    if (!queryName) continue
    const customRows = await searchCustomFoodMacros(lookupQuery, 20, { allowTypo: false }).catch(() => [])
    const exact = customRows
      .map(normalizeFoodItem)
      .filter(Boolean)
      .find((item) => singularFoodText(item?.name || '') === queryName)
    if (exact) return exact
  }
  return null
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
    source: 'custom',
    id: String(item.id || item.name),
    name: item.name,
    brand: item.brand ?? null,
    serving_size: item.serving_size || '100 g',
    servingOptions: Array.isArray(item.servingOptions) ? item.servingOptions : null,
    calories: item.calories ?? null,
    protein_g: item.protein_g ?? null,
    carbs_g: item.carbs_g ?? null,
    fat_g: item.fat_g ?? null,
    fiber_g: item.fiber_g ?? null,
    sugar_g: item.sugar_g ?? null,
  }
}

function normalizeLibraryFoodItem(row: any): NormalizedFoodItem | null {
  if (!row?.name) return null
  return {
    source: 'usda',
    id: String(row.fdcId ?? row.id),
    name: row.name,
    brand: row.brand ?? null,
    serving_size: row.servingSize || '100 g',
    calories: row.calories ?? null,
    protein_g: row.proteinG ?? null,
    carbs_g: row.carbsG ?? null,
    fat_g: row.fatG ?? null,
    fiber_g: row.fiberG ?? null,
    sugar_g: row.sugarG ?? null,
  }
}

async function findFoodIngredient(query: string) {
  const lookupQueries = buildIngredientLookupQueries(query)
  const exactCustomMatch = await findExactCustomPlainFood(lookupQueries)
  if (exactCustomMatch) return exactCustomMatch

  if (compactFoodMatchText(query).includes('egg')) {
    const wholeEggRows = await prisma.foodLibraryItem.findMany({
      where: {
        name: { contains: 'Egg, whole', mode: 'insensitive' },
        source: { in: ['usda_foundation', 'usda_sr_legacy'] },
      },
      take: 12,
      orderBy: { name: 'asc' },
    })
    const wholeEggMatch = chooseBestFoodMatch(query, wholeEggRows.map(normalizeLibraryFoodItem).filter(Boolean))
    if (wholeEggMatch) return wholeEggMatch
  }

  for (const lookupQuery of lookupQueries) {
    const local = await searchLocalFoods(lookupQuery, {
      pageSize: 18,
      mode: 'prefix-contains',
      sources: ['usda_foundation', 'usda_sr_legacy'],
    })
    const localMatch = chooseBestFoodMatch(lookupQuery, local)
    if (localMatch) return localMatch
  }

  for (const lookupQuery of lookupQueries) {
    const custom = await searchCustomFoodMacros(lookupQuery, 12, { allowTypo: true }).catch(() => [])
    const customMatch = chooseBestFoodMatch(lookupQuery, custom.map(normalizeFoodItem).filter(Boolean))
    if (customMatch) return customMatch
  }

  return null
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
  const isSingleIngredient = items.length === 1
  const displayName = isSingleIngredient ? entries[0]?.name || items[0]?.name || mealName : mealName

  return {
    action: 'food_build_meal' as const,
    transcript,
    localDate,
    summary: `${displayName}, ${nutrition.calories} kcal`,
    confirmationMessage: missing.length
      ? `I found these ingredients for ${meal}: ${ingredientList}.${missingLine}`
      : isSingleIngredient
        ? `I found ${displayName} for ${meal}. I will add it now.`
        : `I found these ingredients for ${meal}: ${ingredientList}. I will add it now.`,
    canConfirm: true,
    autoSave: missing.length === 0,
    food: {
      meal,
      mealName: displayName,
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
        'For clear low-risk logging requests, prepare a saveable draft. The app may save it automatically and then tell the user it is done.',
        'Allowed action values: exercise, mood, journal, water, food_copy_previous, food_build_meal, food_draft, recipe, symptom_analysis, health_question, app_handoff, unknown.',
        'For exercise, infer the exercise name, duration, distance, and intensity from any natural wording. If duration is missing, estimate a practical duration and mark estimatedDuration true.',
        'For mood, use mood score 1 very low to 7 very good, plus short tags and a note.',
        'For journal, make a short title and journal content. If the user says health journal, include journalType "health"; if they say mood journal, include journalType "mood".',
        'For food_copy_previous, only use when the user asks for same breakfast/meal as yesterday or previous day.',
        'For new meals or foods with named ingredients, return food_build_meal with meal, mealName, draftText, and ingredients array. The app will find nutrition before saving.',
        'Use food_draft only when the user gives a vague food request without any usable food names.',
        'For recipes, return action recipe and recipeRequest.',
        'For symptom_analysis, use when the user wants symptoms analyzed or describes symptoms and asks what it could be. Extract symptoms, duration, and notes.',
        'For health_question, use when the user asks health advice, interpretation, supplements, medication, labs, fitness, sleep, or wellbeing questions that are not a save action.',
        'For app_handoff, use when the user clearly asks to open or use a Helfi app area that is not one of the save actions.',
        'Shape: {"action":"...","summary":"...","confirmationMessage":"...","exercise":{"name":"walking","durationMinutes":60,"distanceKm":5,"estimatedDuration":true},"mood":{"mood":2,"tags":["sad"],"note":"..."},"journal":{"title":"...","content":"...","tags":["..."],"journalType":"mood"},"food":{"meal":"breakfast","mealName":"Breakfast","draftText":"...","ingredients":[{"name":"egg","quantity":2,"unit":"each","display":"two eggs"}]},"water":{"amount":500,"unit":"ml","label":"Water"},"symptoms":["headache","fatigue"],"duration":"2 days","notes":"...","recipeRequest":"..."}',
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
    name.includes('gym') || name.includes('workout') ? 'strength' : '',
    name.includes('gym') || name.includes('workout') ? 'weight' : '',
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
  let favorite = findRequestedFavorite(transcript, favorites)
  if (!favorite && /\b(favourite|favorite|saved)\b/i.test(transcript)) {
    const requestedMeal = inferMealFromText(transcript, '')
    favorite =
      favorites.find((item) => compactFoodMatchText(item.meal || '').includes(requestedMeal)) ||
      favorites.find((item) => compactFoodMatchText(item.label || '').includes(requestedMeal)) ||
      null
  }
  if (!favorite) return null
  const meal = inferTargetMealFromText(transcript, favorite.meal)
  const calories = Math.round(Number((favorite.nutrition as any)?.calories ?? (favorite.total as any)?.calories) || 0)
  const summary = `${favorite.label}${calories ? `, ${calories} kcal` : ''}`
  return {
    action: 'food_favorite' as const,
    transcript,
    localDate,
    summary,
    confirmationMessage: `I found ${favorite.label} in your favourites. I will add it to ${meal} now.`,
    canConfirm: true,
    autoSave: true,
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

function inferNativeWebTarget(parsed: any, transcript: string) {
  const raw = `${cleanText(parsed?.target || parsed?.area || parsed?.appArea || parsed?.summary, 200)} ${transcript}`.toLowerCase()
  const openOnly = /\b(open|show|go to|take me to|use)\b/.test(raw)
  const nativeTarget = (title: string, path: string, buttonLabel: string, native: any) => ({
    title,
    path,
    buttonLabel,
    nativeTarget: native,
  })
  const foodMeal = inferMealFromText(raw, 'breakfast')

  if (/\b(dashboard|home)\b/.test(raw)) {
    return nativeTarget('Dashboard', '/dashboard', 'Open Dashboard', { type: 'tab', tab: 'Dashboard' })
  }
  if (/\b(food diary|calorie tracker|track calories|food log)\b/.test(raw)) {
    return nativeTarget('Food Diary', '/food', 'Open Food Diary', { type: 'tab', tab: 'Food' })
  }
  if (/\b(add food entry|add food|food entry)\b/.test(raw) && openOnly) {
    return nativeTarget('Add Food Entry', '/food', 'Open Add Food Entry', {
      type: 'foodAction',
      action: 'openAddFoodEntry',
      meal: foodMeal,
    })
  }
  if (/\b(add ingredient|single ingredient|search food)\b/.test(raw) && openOnly) {
    return nativeTarget('Add Ingredient', '/food', 'Open Add Ingredient', {
      type: 'stack',
      route: 'AddIngredient',
      params: { meal: foodMeal },
    })
  }
  if (/\b(build a meal|build meal|combine ingredients|meal builder)\b/.test(raw) && openOnly) {
    return nativeTarget('Build a Meal', '/food', 'Open Build a Meal', {
      type: 'foodAction',
      action: 'openBuildMeal',
      meal: foodMeal,
    })
  }
  if (/\b(favorites|favourites|saved foods|saved meals)\b/.test(raw) && openOnly) {
    return nativeTarget('Favorites', '/food', 'Open Favorites', {
      type: 'foodAction',
      action: 'openFavorites',
      meal: foodMeal,
    })
  }
  if (/\b(import recipe|recipe import)\b/.test(raw) && openOnly) {
    return nativeTarget('Import Recipe', '/food', 'Open Import Recipe', {
      type: 'foodAction',
      action: 'openImportRecipe',
      meal: foodMeal,
    })
  }
  if (/\b(water|hydration|liquids|drink tracker|water intake)\b/.test(raw) && openOnly) {
    return nativeTarget('Water Intake', '/food/water', 'Open Water Intake', { type: 'stack', route: 'WaterIntake' })
  }
  if (/\b(exercise|workout|activity)\b/.test(raw) && openOnly) {
    return nativeTarget('Exercise', '/food', 'Open Exercise', {
      type: 'foodAction',
      action: 'openExercise',
      meal: foodMeal,
    })
  }
  if (/\bmood journal\b/.test(raw)) {
    return nativeTarget('Mood Journal', '/mood/journal', 'Open Mood Journal', { type: 'stack', route: 'MoodTracker', params: { tab: 'journal' } })
  }
  if (/\b(mood tracker|mood)\b/.test(raw) && openOnly) {
    return nativeTarget('Mood Tracker', '/mood', 'Open Mood Tracker', { type: 'stack', route: 'MoodTracker', params: { tab: 'checkin' } })
  }
  if (/\b(health journal|journal)\b/.test(raw) && openOnly) {
    return { title: 'Health Journal', path: '/health-journal', buttonLabel: 'Open Health Journal' }
  }
  if (/\b(medical image|medical images|image analyzer|image analyser)\b/.test(raw)) {
    return { title: 'Medical Image Analyzer', path: '/medical-images', buttonLabel: 'Open Medical Images' }
  }
  if (/\b(lab report|lab reports|blood test upload|blood tests)\b/.test(raw)) {
    return { title: 'Lab Reports', path: '/lab-reports', buttonLabel: 'Open Lab Reports' }
  }
  if (/\b(subscription|billing|payment|credits)\b/.test(raw) && openOnly) {
    return nativeTarget('Billing', '/billing', 'Open Billing', { type: 'stack', route: 'Billing' })
  }
  if (/\b(settings|account settings)\b/.test(raw) && openOnly) {
    return nativeTarget('Settings', '/settings', 'Open Settings', { type: 'tab', tab: 'Settings' })
  }
  if (/\b(symptom|symptoms|diagnose|diagnosis|what could this be|red flag|red flags)\b/.test(raw)) {
    if (openOnly && !/\b(headache|migraine|nausea|vomiting|diarrhea|fever|cough|sore throat|fatigue|dizzy|dizziness|pain|rash|itchy|hives|chest pain|shortness of breath|palpitations|bloating|heartburn|cramps|swelling)\b/.test(raw)) {
      return { title: 'Symptom Analysis', path: '/symptoms', buttonLabel: 'Open Symptom Analysis' }
    }
    const params = new URLSearchParams()
    params.set('voiceSymptoms', transcript)
    params.set('voiceNotes', transcript)
    return { title: 'Symptom Analysis', path: `/symptoms?${params.toString()}`, buttonLabel: 'Open Symptom Analysis' }
  }
  if (/\b(chat|talk|ask|question|advice|health|supplement|medication|medicine|sleep|stress|energy|labs?|blood test)\b/.test(raw)) {
    return { title: 'Talk to Helfi', path: `/chat?voicePrompt=${encodeQueryValue(transcript, 1200)}`, buttonLabel: 'Open Talk to Helfi' }
  }
  if (/\b(notification|reminder|reminders)\b/.test(raw)) {
    return nativeTarget('Reminders', '/notifications/reminders', 'Open Reminders', { type: 'stack', route: 'Reminders' })
  }
  if (/\b(practitioner|practitioners|doctor|clinic|specialist)\b/.test(raw)) {
    return nativeTarget('Practitioners', '/practitioners', 'Open Practitioners', { type: 'stack', route: 'Practitioners' })
  }
  if (/\b(insight|insights|coach)\b/.test(raw)) {
    return nativeTarget('Insights', '/insights', 'Open Insights', { type: 'tab', tab: 'Insights' })
  }
  return null
}

function extractSymptomText(transcript: string) {
  return cleanText(transcript, 600)
    .replace(/\b(?:for|since|over)\s+((?:about\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hour|hours|day|days|week|weeks|month|months)|today|yesterday|this morning|tonight|last night)\b/gi, ' ')
    .replace(/\b(can you|please|could you|i want you to|i need you to)\b/gi, ' ')
    .replace(/\b(analyze|analyse|check|look at|review|my|these|symptoms?|for me|what could it be|what is it|what might it be)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function knownSymptomsFromText(transcript: string) {
  const lower = transcript.toLowerCase()
  const symptoms = [
    'headache',
    'migraine',
    'nausea',
    'vomiting',
    'diarrhea',
    'fever',
    'cough',
    'sore throat',
    'fatigue',
    'dizzy',
    'dizziness',
    'chest pain',
    'shortness of breath',
    'palpitations',
    'bloating',
    'heartburn',
    'anxiety',
    'insomnia',
    'rash',
    'hives',
    'pain',
  ]
  return symptoms.filter((symptom) => lower.includes(symptom)).slice(0, 12)
}

function buildQuickToolDraft(transcript: string, localDate: string): VoiceDraft | null {
  const raw = cleanText(transcript, 1200)
  const lower = raw.toLowerCase()
  if (hasSelfHarmRisk(raw)) return buildSelfHarmSupportDraft(raw, localDate)
  const symptomWords =
    /\b(symptom|symptoms|headache|migraine|nausea|vomiting|diarrhea|fever|cough|sore throat|fatigue|dizzy|dizziness|pain|rash|itchy|hives|chest pain|shortness of breath|palpitations|bloating|heartburn|anxious|anxiety|insomnia|cramps|swelling)\b/
  const asksForAnalysis = /\b(analyze|analyse|check|review|what could|what might|what is causing|diagnose|red flag)\b/.test(lower)
  const directTarget = inferNativeWebTarget({}, raw)
  const explicitOpen = /\b(open|show|go to|take me to|use|find)\b/.test(lower)
  const asksForInsights = directTarget?.title === 'Insights' && /\b(insight|insights|coach)\b/.test(lower)
  if (directTarget && (explicitOpen || asksForInsights)) {
    return {
      action: 'app_handoff',
      transcript: raw,
      localDate,
      summary: directTarget.title,
      confirmationMessage: `I can open ${directTarget.title} with your request ready.`,
      canConfirm: false,
      appTarget: directTarget,
    }
  }
  if (/\b(journal|note|diary)\b/.test(lower)) return null

  const looksLikeQuestion = /\b(what|why|how|can|could|should|would|is|are|do|does|which)\b/.test(lower) || lower.includes('?')
  const healthTopic =
    /\b(health|symptom|supplement|vitamin|magnesium|medication|medicine|tablet|dose|sleep|energy|tired|fatigue|stress|anxiety|mood|blood test|lab|cholesterol|glucose|protein|calories|diet|nutrition|workout|exercise|pain|injury|period|hormone|digestion|gut)\b/
  const questionShouldGoToChat =
    looksLikeQuestion &&
    /\b(medication|medicine|supplement|vitamin|magnesium|cholesterol|blood test|lab|sleep|energy|dose)\b/.test(lower)
  if (questionShouldGoToChat && healthTopic.test(lower)) {
    return {
      action: 'health_question',
      transcript: raw,
      localDate,
      summary: 'Talk to Helfi',
      confirmationMessage: 'This is a health question. I can open Talk to Helfi with your question ready.',
      canConfirm: false,
      appTarget: {
        title: 'Talk to Helfi',
        path: `/chat?voicePrompt=${encodeQueryValue(raw, 1200)}`,
        buttonLabel: 'Open Talk to Helfi',
      },
    }
  }

  const describesSymptoms = /\b(i have|i've got|i feel|feeling|my)\b/.test(lower)
  if (symptomWords.test(lower) && (asksForAnalysis || describesSymptoms || lower.includes('symptom'))) {
    const params = new URLSearchParams()
    const knownSymptoms = knownSymptomsFromText(raw)
    const symptomText = knownSymptoms.length ? knownSymptoms.join(', ') : extractSymptomText(raw) || raw
    params.set('voiceSymptoms', symptomText)
    params.set('voiceNotes', raw)
    const durationMatch = raw.match(/\b(?:for|since|over)\s+((?:about\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hour|hours|day|days|week|weeks|month|months)|today|yesterday|this morning|tonight|last night)\b/i)
    if (durationMatch?.[1]) params.set('voiceDuration', durationMatch[1])
    return {
      action: 'symptom_analysis',
      transcript: raw,
      localDate,
      summary: 'Symptom Analysis',
      confirmationMessage: 'I can open Symptom Analysis with your symptoms filled in. It will not run or charge until you press Analyze.',
      canConfirm: false,
      appTarget: {
        title: 'Symptom Analysis',
        path: `/symptoms?${params.toString()}`,
        buttonLabel: 'Open Symptom Analysis',
      },
    }
  }

  if (looksLikeQuestion && healthTopic.test(lower)) {
    return {
      action: 'health_question',
      transcript: raw,
      localDate,
      summary: 'Talk to Helfi',
      confirmationMessage: 'This is a health question. I can open Talk to Helfi with your question ready.',
      canConfirm: false,
      appTarget: {
        title: 'Talk to Helfi',
        path: `/chat?voicePrompt=${encodeQueryValue(raw, 1200)}`,
        buttonLabel: 'Open Talk to Helfi',
      },
    }
  }

  return null
}

function buildQuickClarificationDraft(transcript: string, localDate: string): VoiceDraft | null {
  const raw = cleanText(transcript, 1200)
  const lower = raw.toLowerCase()
  const isLogRequest = /\b(log|add|record|track|put|input|save)\b/.test(lower)
  if (!isLogRequest) return null

  if (/\b(food|meal|breakfast|lunch|dinner|snacks?)\b/.test(lower)) {
    return {
      action: 'food_draft',
      transcript: raw,
      localDate,
      summary: 'Food details needed',
      confirmationMessage: 'What food should I log, and which meal should it go in?',
      canConfirm: false,
    }
  }

  if (/\b(exercise|workout|walk|run|ride|cycle|gym)\b/.test(lower)) {
    return {
      action: 'exercise',
      transcript: raw,
      localDate,
      summary: 'Exercise details needed',
      confirmationMessage: 'What exercise should I log, and for how long?',
      canConfirm: false,
    }
  }

  if (/\b(water|hydration|drink|liquid)\b/.test(lower)) {
    return {
      action: 'water',
      transcript: raw,
      localDate,
      summary: 'Liquid details needed',
      confirmationMessage: 'What drink and amount should I log?',
      canConfirm: false,
    }
  }

  if (/\b(mood|feel|feeling)\b/.test(lower)) {
    return {
      action: 'mood',
      transcript: raw,
      localDate,
      summary: 'Mood details needed',
      confirmationMessage: 'How are you feeling, and would you like me to add any note?',
      canConfirm: false,
    }
  }

  if (/\b(journal|note|diary)\b/.test(lower)) {
    return {
      action: 'journal',
      transcript: raw,
      localDate,
      summary: 'Journal note needed',
      confirmationMessage: 'What would you like me to write in the journal?',
      canConfirm: false,
    }
  }

  return null
}

function buildGenericClarificationDraft(transcript: string, localDate: string): VoiceDraft {
  return {
    action: 'unknown',
    transcript: cleanText(transcript, 1200),
    localDate,
    summary: 'Please clarify',
    confirmationMessage: 'I am not sure what to do yet. Please try a clearer request.',
    canConfirm: false,
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
  if (hasSelfHarmRisk(transcript)) {
    return { aiCostCents: 0, draft: buildSelfHarmSupportDraft(transcript, localDate) }
  }

  const actionRaw = cleanText(parsed?.action, 40).toLowerCase() as VoiceAction
  const action: VoiceAction = ['exercise', 'mood', 'journal', 'water', 'food_copy_previous', 'food_favorite', 'food_build_meal', 'food_draft', 'recipe', 'symptom_analysis', 'health_question', 'app_handoff'].includes(actionRaw)
    ? actionRaw
    : 'unknown'
  let aiCostCents = 0
  let usedModel: string | undefined

  const favoriteDraft = shouldUseFavoriteFood(transcript, favorites) ? await buildFavoriteFoodDraft(transcript, localDate, favorites) : null
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
      draft: buildRecipeHandoffDraft(requestText, localDate, recipe.text),
    }
  }

  if (action === 'symptom_analysis') {
    const symptoms = Array.isArray(parsed?.symptoms)
      ? parsed.symptoms.map((item: any) => cleanText(item, 60)).filter(Boolean).slice(0, 12)
      : []
    const symptomsText = symptoms.length ? symptoms.join(', ') : transcript
    const duration = cleanText(parsed?.duration, 120)
    const notes = cleanText(parsed?.notes || transcript, 800)
    const params = new URLSearchParams()
    params.set('voiceSymptoms', symptomsText)
    if (duration) params.set('voiceDuration', duration)
    if (notes) params.set('voiceNotes', notes)
    return {
      aiCostCents,
      draft: {
        action: 'symptom_analysis',
        transcript,
        localDate,
        summary: 'Symptom Analysis',
        confirmationMessage: 'This sounds like a symptom-analysis request. I can open Symptom Analysis with your symptoms filled in. It will not run or charge until you press Analyze.',
        canConfirm: false,
        appTarget: {
          title: 'Symptom Analysis',
          path: `/symptoms?${params.toString()}`,
          buttonLabel: 'Open Symptom Analysis',
        },
      },
    }
  }

  if (action === 'health_question') {
    return {
      aiCostCents,
      draft: {
        action: 'health_question',
        transcript,
        localDate,
        summary: 'Talk to Helfi',
        confirmationMessage: 'This is a health question. I can open Talk to Helfi with your question ready.',
        canConfirm: false,
        appTarget: {
          title: 'Talk to Helfi',
          path: `/chat?voicePrompt=${encodeQueryValue(transcript, 1200)}`,
          buttonLabel: 'Open Talk to Helfi',
        },
      },
    }
  }

  if (action === 'app_handoff') {
    const target = inferNativeWebTarget(parsed, transcript)
    if (target) {
      return {
        aiCostCents,
        draft: {
          action: 'app_handoff',
          transcript,
          localDate,
          summary: target.title,
          confirmationMessage: `I can open ${target.title} with your request ready.`,
          canConfirm: false,
          appTarget: target,
        },
      }
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
        confirmationMessage: `I will log ${summary}.${estimatedDuration ? ' I estimated the time.' : ''}`,
        canConfirm: true,
        autoSave: true,
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
        confirmationMessage: `I will add this mood entry: ${summary}.`,
        canConfirm: true,
        autoSave: true,
        mood,
      },
    }
  }

  if (action === 'journal') {
    const journal = parsed?.journal || {}
    const content = cleanText(journal?.content || transcript, 2000)
    const title = cleanText(journal?.title || 'Voice journal note', 120)
    const tags = Array.isArray(journal?.tags) ? journal.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 8) : []
    const journalTypeRaw = String(journal?.journalType || journal?.type || '').toLowerCase()
    const journalType = journalTypeRaw === 'health' || /\bhealth journal\b/i.test(transcript) ? 'health' : 'mood'
    const journalLabel = journalType === 'health' ? 'health journal' : 'journal'
    return {
      aiCostCents,
      draft: {
        action: 'journal',
        transcript,
        localDate,
        summary: title,
        confirmationMessage: `I will add this ${journalLabel} note: "${content.slice(0, 160)}${content.length > 160 ? '...' : ''}"`,
        canConfirm: true,
        autoSave: true,
        journal: { title, content, tags, journalType },
      },
    }
  }

  if (action === 'water') {
    const water = parsed?.water || {}
    const amount = Number(water?.amount)
    const unit = normalizeWaterUnit(String(water?.unit || ''))
    const drinkType = cleanText(water?.label || water?.drinkType || 'Water', 48) || 'Water'
    if (!Number.isFinite(amount) || amount <= 0 || !unit) {
      return {
        aiCostCents,
        draft: {
          action: 'water',
          transcript,
          localDate,
          summary: 'Water amount needed',
          confirmationMessage: 'How much liquid should I log? For example, say "Log 500 ml water."',
          canConfirm: false,
        },
      }
    }
    const amountMl = waterAmountToMl(amount, unit)
    return {
      aiCostCents,
      draft: {
        action: 'water',
        transcript,
        localDate,
        summary: `${amount} ${unit} ${drinkType}`,
        confirmationMessage: `I will log ${amount} ${unit} ${drinkType}.`,
        canConfirm: true,
        autoSave: true,
        water: {
          amount,
          unit,
          amountMl,
          label: drinkType,
          category: inferMealFromText(transcript, 'other'),
          drinkType,
          sweetener: drinkType === 'Water' ? null : { type: 'free' },
        },
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
        confirmationMessage: `I found ${copy.rows.length} ${meal} item${copy.rows.length === 1 ? '' : 's'} from ${copy.sourceDate}. I will copy them to today.`,
        canConfirm: true,
        autoSave: true,
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

    if (hasSelfHarmRisk(transcript)) {
      return NextResponse.json({
        success: true,
        transcript,
        draft: buildSelfHarmSupportDraft(transcript, localDate),
        audio: null,
        chargedCredits: 0,
        voiceReply: false,
      })
    }

    const wallet = await new CreditManager(user.id).getWalletStatus()
    if (wallet.totalAvailableCents < SIMPLE_MIN_CREDITS) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: SIMPLE_MIN_CREDITS, availableCredits: wallet.totalAvailableCents }, { status: 402 })
    }

    const storedFavorites = await loadStoredFavorites(user.id).catch(() => [])
    const favorites = mergeFavorites(clientFavorites, storedFavorites)
    const favoriteDraft = shouldUseFavoriteFood(transcript, favorites) ? await buildFavoriteFoodDraft(transcript, localDate, favorites) : null
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

    const quickWaterDraft = tryParseWaterRequest(transcript, localDate)
    if (quickWaterDraft) {
      const draft = quickWaterDraft
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
        feature: 'voice-assistant:water-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'water-router',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; prepared water/liquid log`,
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

    const quickMealFood = tryParseIngredientMealRequest(transcript) || tryParseDirectFoodRequest(transcript)
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

    const quickRecipeDraft = buildQuickRecipeDraft(transcript, localDate)
    if (quickRecipeDraft) {
      const draft = quickRecipeDraft
      const chargeCents = Math.max(SIMPLE_MIN_CREDITS, transcriptionCostCents)

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:quick-recipe-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: 'quick-recipe-router',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; prepared quick recipe text`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft,
        audio: null,
        chargedCredits: chargeCents,
        voiceReply: false,
      })
    }

    const quickToolDraft = buildQuickToolDraft(transcript, localDate)
    if (quickToolDraft) {
      const draft = quickToolDraft
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
        feature: 'voice-assistant:tool-route',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'tool-router',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; opened matching Helfi tool`,
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

    const quickParsed = tryParseCopyPreviousRequest(transcript) || tryParseJournalRequest(transcript) || tryParseExerciseRequest(transcript) || tryParseMoodRequest(transcript)
    if (quickParsed) {
      const normalized = await normalizeDraft(quickParsed, transcript, localDate, user.id, null as any, tzOffsetMin, favorites)
      const draft = normalized.draft
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
        feature: 'voice-assistant:quick-log-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'quick-log-router',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; prepared quick log draft`,
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

    const quickClarificationDraft = buildQuickClarificationDraft(transcript, localDate)
    if (quickClarificationDraft) {
      return NextResponse.json({
        success: true,
        transcript,
        draft: quickClarificationDraft,
        audio: null,
        voiceReply: false,
      })
    }

    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({
        success: true,
        transcript,
        draft: buildGenericClarificationDraft(transcript, localDate),
        audio: null,
        voiceReply: false,
      })
    }

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
