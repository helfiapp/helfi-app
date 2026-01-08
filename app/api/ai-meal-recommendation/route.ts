import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import OpenAI from 'openai'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'
import { calculateDailyTargets } from '@/lib/daily-targets'
import { estimateTokensFromText, openaiCostCentsForTokens } from '@/lib/cost-meter'
import {
  AI_MEAL_RECOMMENDATION_CREDITS,
  AI_MEAL_RECOMMENDATION_GOAL_NAME,
  AI_MEAL_RECOMMENDATION_HISTORY_LIMIT,
  AI_MEAL_RECOMMENDATION_STORAGE_VERSION,
  MealCategory,
  normalizeMealCategory,
} from '@/lib/ai-meal-recommendation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type MacroTotals = {
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  sugar_g: number | null
}

type RecommendedItem = {
  id?: string
  name: string
  serving_size?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
  servings: number
}

type RecommendedMealRecord = {
  id: string
  createdAt: string
  date: string
  category: MealCategory
  mealName: string
  tags: string[]
  why: string
  recipe?: {
    servings?: number | null
    prepMinutes?: number | null
    cookMinutes?: number | null
    steps: string[]
  } | null
  items: RecommendedItem[]
  totals: MacroTotals
}

type StoredState = {
  version: number
  history: RecommendedMealRecord[]
  seenExplainAt?: string | null
  committedIds?: string[] | null
  lastGenerated?: {
    mealName: string
    items: RecommendedItem[]
    createdAt: string
  } | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const round3 = (n: number) => Math.round(n * 1000) / 1000

const macroOrZero = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

const computeTotalsFromItems = (items: RecommendedItem[]): MacroTotals => {
  const total = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }
  for (const item of items) {
    const servings = typeof item.servings === 'number' && Number.isFinite(item.servings) ? item.servings : 0
    total.calories += macroOrZero(item.calories) * servings
    total.protein_g += macroOrZero(item.protein_g) * servings
    total.carbs_g += macroOrZero(item.carbs_g) * servings
    total.fat_g += macroOrZero(item.fat_g) * servings
    total.fiber_g += macroOrZero(item.fiber_g) * servings
    total.sugar_g += macroOrZero(item.sugar_g) * servings
  }
  return {
    calories: Math.round(total.calories),
    protein_g: round3(total.protein_g),
    carbs_g: round3(total.carbs_g),
    fat_g: round3(total.fat_g),
    fiber_g: round3(total.fiber_g),
    sugar_g: round3(total.sugar_g),
  }
}

function parseJsonRelaxed(raw: string): any | null {
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

const MEAL_NAME_STOPWORDS = new Set(
  [
    'ai',
    'recommended',
    'meal',
    'breakfast',
    'lunch',
    'dinner',
    'snack',
    'snacks',
    'other',
    'with',
    'and',
    'or',
    'the',
    'a',
    'an',
    'of',
    'in',
    'on',
    'over',
    'to',
    'for',
    'style',
    'bowl',
    'salad',
    'plate',
    'wrap',
    'sandwich',
    'stir',
    'fry',
    'stirfry',
    'stir-fry',
    'grilled',
    'baked',
    'roasted',
    'steamed',
    'sauteed',
    'sautéed',
    'seared',
    'poached',
    'boiled',
    'broiled',
    'pan',
    'air',
    'fryer',
    'slow',
    'cooked',
    'quick',
    'easy',
    'simple',
    'healthy',
    'high',
    'low',
    'protein',
    'carb',
    'carbs',
    'fat',
    'fiber',
    'fibre',
    'sugar',
    'heart',
    'friendly',
    'gut',
    'hormone',
    'supportive',
    'support',
    'anti',
    'inflammatory',
    'mediterranean',
    'italian',
    'mexican',
    'asian',
    'thai',
    'indian',
    'greek',
    'korean',
    'japanese',
    'vietnamese',
  ].map((v) => v.toLowerCase()),
)

const MEAL_NAME_FLAVOR_TOKEN_TO_ITEM: Record<
  string,
  { name: string; serving_size: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g: number }
> = {
  lemon: { name: 'Lemon juice', serving_size: '1 tsp', calories: 1, protein_g: 0, carbs_g: 0.3, fat_g: 0, fiber_g: 0, sugar_g: 0 },
  lime: { name: 'Lime juice', serving_size: '1 tsp', calories: 1, protein_g: 0, carbs_g: 0.3, fat_g: 0, fiber_g: 0, sugar_g: 0 },
  garlic: { name: 'Garlic, raw', serving_size: '1 clove', calories: 4, protein_g: 0.2, carbs_g: 1, fat_g: 0, fiber_g: 0.1, sugar_g: 0 },
  ginger: { name: 'Ginger, raw', serving_size: '1 tsp', calories: 2, protein_g: 0, carbs_g: 0.4, fat_g: 0, fiber_g: 0, sugar_g: 0 },
  onion: { name: 'Onion, raw', serving_size: '2 tbsp', calories: 8, protein_g: 0.2, carbs_g: 1.9, fat_g: 0, fiber_g: 0.3, sugar_g: 0.8 },
  parsley: { name: 'Parsley', serving_size: '1 tbsp', calories: 1, protein_g: 0.1, carbs_g: 0.2, fat_g: 0, fiber_g: 0.1, sugar_g: 0 },
  basil: { name: 'Basil', serving_size: '1 tbsp', calories: 1, protein_g: 0.1, carbs_g: 0.1, fat_g: 0, fiber_g: 0.1, sugar_g: 0 },
  oregano: { name: 'Oregano', serving_size: '1 tsp', calories: 3, protein_g: 0.1, carbs_g: 0.7, fat_g: 0.1, fiber_g: 0.4, sugar_g: 0 },
  cilantro: { name: 'Cilantro', serving_size: '1 tbsp', calories: 1, protein_g: 0.1, carbs_g: 0.1, fat_g: 0, fiber_g: 0.1, sugar_g: 0 },
  coriander: { name: 'Coriander', serving_size: '1 tsp', calories: 3, protein_g: 0.1, carbs_g: 0.6, fat_g: 0.2, fiber_g: 0.4, sugar_g: 0 },
  cumin: { name: 'Cumin', serving_size: '1 tsp', calories: 8, protein_g: 0.4, carbs_g: 0.9, fat_g: 0.5, fiber_g: 0.2, sugar_g: 0 },
  paprika: { name: 'Paprika', serving_size: '1 tsp', calories: 6, protein_g: 0.3, carbs_g: 1.2, fat_g: 0.3, fiber_g: 0.7, sugar_g: 0.4 },
  turmeric: { name: 'Turmeric', serving_size: '1 tsp', calories: 8, protein_g: 0.2, carbs_g: 1.4, fat_g: 0.2, fiber_g: 0.5, sugar_g: 0.1 },
  chili: { name: 'Chili flakes', serving_size: '1 tsp', calories: 6, protein_g: 0.2, carbs_g: 1.1, fat_g: 0.3, fiber_g: 0.7, sugar_g: 0.5 },
  chilli: { name: 'Chili flakes', serving_size: '1 tsp', calories: 6, protein_g: 0.2, carbs_g: 1.1, fat_g: 0.3, fiber_g: 0.7, sugar_g: 0.5 },
  vinegar: { name: 'Vinegar', serving_size: '1 tbsp', calories: 3, protein_g: 0, carbs_g: 0.1, fat_g: 0, fiber_g: 0, sugar_g: 0 },
  olive: { name: 'Olive oil', serving_size: '1 tsp', calories: 40, protein_g: 0, carbs_g: 0, fat_g: 4.5, fiber_g: 0, sugar_g: 0 },
  oil: { name: 'Olive oil', serving_size: '1 tsp', calories: 40, protein_g: 0, carbs_g: 0, fat_g: 4.5, fiber_g: 0, sugar_g: 0 },
}

const tokenize = (raw: string) =>
  String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.endsWith('s') && t.length > 3 ? t.slice(0, -1) : t))

const buildTokenSetFromItems = (items: RecommendedItem[]) => {
  const set = new Set<string>()
  for (const item of items) {
    for (const t of tokenize(item?.name || '')) set.add(t)
  }
  return set
}

const inferMealNameFromItems = (category: MealCategory, items: RecommendedItem[]) => {
  const cleaned = items
    .map((it) => String(it?.name || '').replace(/\([^)]*\)/g, '').trim())
    .filter(Boolean)
    .map((name) => name.split(',')[0].trim())
  if (cleaned.length === 0) return `AI Recommended ${category}`

  const scored = items
    .map((it, idx) => {
      const cals = Number(it?.calories || 0)
      const servings = Number(it?.servings || 0)
      const score = (Number.isFinite(cals) ? cals : 0) * (Number.isFinite(servings) ? servings : 1)
      return { idx, score }
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => cleaned[s.idx] || cleaned[0])
    .filter(Boolean)

  const primary = scored[0] || cleaned[0]
  const sides = scored.slice(1, 3).filter((v) => v && v.toLowerCase() !== primary.toLowerCase())
  if (sides.length === 0) return primary
  if (sides.length === 1) return `${primary} with ${sides[0]}`
  return `${primary} with ${sides[0]} & ${sides[1]}`
}

const applyMealNameConsistency = (category: MealCategory, mealNameRaw: string, itemsRaw: RecommendedItem[]) => {
  let mealName = String(mealNameRaw || '').trim()
  let items = Array.isArray(itemsRaw) ? [...itemsRaw] : []
  const itemTokens = buildTokenSetFromItems(items)

  const unmatchedMeaningful: string[] = []
  for (const token of tokenize(mealName)) {
    if (MEAL_NAME_STOPWORDS.has(token)) continue
    if (itemTokens.has(token)) continue
    const flavor = MEAL_NAME_FLAVOR_TOKEN_TO_ITEM[token]
    if (flavor) {
      // Avoid duplicates (e.g. "oil" + "olive" both map to Olive oil).
      const exists = items.some((it) => String(it?.name || '').toLowerCase().includes(flavor.name.toLowerCase()))
      if (!exists) {
        items.push({
          name: flavor.name,
          serving_size: flavor.serving_size,
          servings: 1,
          calories: flavor.calories,
          protein_g: flavor.protein_g,
          carbs_g: flavor.carbs_g,
          fat_g: flavor.fat_g,
          fiber_g: flavor.fiber_g,
          sugar_g: flavor.sugar_g,
        })
      }
      continue
    }
    // Might be a cooking/style word we missed; track but don’t immediately reject.
    if (token.length >= 4) unmatchedMeaningful.push(token)
  }

  if (!mealName) {
    mealName = inferMealNameFromItems(category, items)
  } else if (unmatchedMeaningful.length >= 3) {
    // If too many meaningful tokens don't map to ingredients, fall back to a deterministic name
    // derived from the ingredient list to avoid misleading titles.
    mealName = inferMealNameFromItems(category, items)
  }

  return { mealName, items }
}

const normalizeRecipe = (raw: any) => {
  if (!raw || typeof raw !== 'object') return null
  const steps = Array.isArray((raw as any).steps)
    ? (raw as any).steps
        .map((s: any) => String(s || '').trim())
        .filter(Boolean)
        .slice(0, 12)
    : []
  if (steps.length === 0) return null
  const prepMinutes = Number((raw as any).prepMinutes ?? (raw as any).prep_minutes)
  const cookMinutes = Number((raw as any).cookMinutes ?? (raw as any).cook_minutes)
  const servings = Number((raw as any).servings ?? null)
  return {
    servings: Number.isFinite(servings) && servings > 0 ? Math.round(servings) : null,
    prepMinutes: Number.isFinite(prepMinutes) && prepMinutes >= 0 ? Math.round(prepMinutes) : null,
    cookMinutes: Number.isFinite(cookMinutes) && cookMinutes >= 0 ? Math.round(cookMinutes) : null,
    steps,
  }
}

const buildFallbackRecipe = (category: MealCategory, items: RecommendedItem[]) => {
  const names = items.map((it) => String(it?.name || '').trim()).filter(Boolean)
  const has = (re: RegExp) => names.some((n) => re.test(n.toLowerCase()))

  const mainCooking = (() => {
    if (has(/\b(egg|eggs|egg whites)\b/)) return 'Cook the eggs in a non-stick pan until set.'
    if (has(/\b(cod|salmon|tuna|fish|prawn|shrimp)\b/)) return 'Cook the fish gently (bake, steam, or pan-sear) until it flakes.'
    if (has(/\b(chicken|beef|pork|lamb|turkey)\b/)) return 'Cook the protein through in a pan or oven until done.'
    if (has(/\b(tofu|tempeh|edamame)\b/)) return 'Sear the tofu/tempeh until golden.'
    return 'Cook the main ingredient using your preferred method until ready.'
  })()

  const carbCooking = (() => {
    if (has(/\b(lentil|lentils|bean|beans|chickpea|chickpeas)\b/)) return 'Warm the legumes (or cook if needed) and season lightly.'
    if (has(/\b(rice|quinoa|oats|pasta|barley)\b/)) return 'Cook the grains according to the package directions.'
    return null
  })()

  const vegCooking = has(/\b(broccoli|spinach|kale|lettuce|carrot|tomato|cucumber|zucchini|capsicum|pepper|onion|mushroom)\b/)
    ? 'Steam or sauté the vegetables until tender-crisp.'
    : null

  const seasoning = has(/\b(lemon|lime|garlic|ginger|turmeric|cumin|paprika|chili|chilli|parsley|basil|oregano|coriander|cilantro|vinegar|oil)\b/)
    ? 'Finish with your listed herbs/spices (and lemon/lime if included) to taste.'
    : 'Season to taste.'

  const steps = [
    `Prep your ingredients: measure the servings and chop/trim anything that needs it.`,
    mainCooking,
    carbCooking,
    vegCooking,
    `Combine everything in a bowl/plate and mix gently.`,
    seasoning,
  ].filter(Boolean) as string[]

  const base = category === 'breakfast' ? { prepMinutes: 8, cookMinutes: 10 } : category === 'snacks' ? { prepMinutes: 6, cookMinutes: 6 } : { prepMinutes: 10, cookMinutes: 15 }
  return { servings: 1, ...base, steps: steps.slice(0, 10) }
}

// Revenue per credit (in USD cents) used to guarantee profit margins.
// Subscriptions: $20 -> 1400 credits == 1.4286 cents/credit (same across tiers).
// Top-ups: $5 -> 250 credits == 2.0 cents/credit.
const SUB_REVENUE_CENTS_PER_CREDIT = Number(process.env.HELFI_SUB_REVENUE_CENTS_PER_CREDIT || '1.4286') || 1.4286
// Target margins (profit/revenue):
// - subscriptions: 60% profit => allow cost <= 40% of revenue
// - top-ups: 70% profit => allow cost <= 30% of revenue
const SUB_TARGET_MARGIN = 0.6

// For a fixed credit price, use the subscription rule as the "worst case"
// (lowest revenue/credit). Meeting subscription margin guarantees top-up margin
// given top-up revenue/credit is higher than subscription revenue/credit.
const MAX_VENDOR_COST_CENTS_FOR_FIXED_CREDITS = Math.floor(
  AI_MEAL_RECOMMENDATION_CREDITS * SUB_REVENUE_CENTS_PER_CREDIT * (1 - SUB_TARGET_MARGIN),
)

const buildTodayIso = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const truncate = (value: string, maxChars: number) => {
  const s = String(value || '')
  if (s.length <= maxChars) return s
  return `${s.slice(0, Math.max(0, maxChars - 1))}…`
}

const safeJsonCompact = (value: any, maxChars: number) => truncate(JSON.stringify(value ?? null), maxChars)

const extractTotalsFromNutrients = (nutrients: any): MacroTotals => {
  if (!nutrients || typeof nutrients !== 'object') {
    return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }
  }
  const calories = Number((nutrients as any)?.calories ?? (nutrients as any)?.Calories ?? 0)
  const protein = Number((nutrients as any)?.protein ?? (nutrients as any)?.protein_g ?? 0)
  const carbs = Number((nutrients as any)?.carbs ?? (nutrients as any)?.carbs_g ?? 0)
  const fat = Number((nutrients as any)?.fat ?? (nutrients as any)?.fat_g ?? 0)
  const fiber = Number((nutrients as any)?.fiber ?? (nutrients as any)?.fiber_g ?? 0)
  const sugar = Number((nutrients as any)?.sugar ?? (nutrients as any)?.sugar_g ?? 0)
  return {
    calories: Number.isFinite(calories) ? calories : 0,
    protein_g: Number.isFinite(protein) ? protein : 0,
    carbs_g: Number.isFinite(carbs) ? carbs : 0,
    fat_g: Number.isFinite(fat) ? fat : 0,
    fiber_g: Number.isFinite(fiber) ? fiber : 0,
    sugar_g: Number.isFinite(sugar) ? sugar : 0,
  }
}

const sumTotals = (rows: MacroTotals[]): MacroTotals => {
  const total = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }
  for (const r of rows) {
    total.calories += macroOrZero(r.calories)
    total.protein_g += macroOrZero(r.protein_g)
    total.carbs_g += macroOrZero(r.carbs_g)
    total.fat_g += macroOrZero(r.fat_g)
    total.fiber_g += macroOrZero(r.fiber_g)
    total.sugar_g += macroOrZero(r.sugar_g)
  }
  return {
    calories: Math.round(total.calories),
    protein_g: round3(total.protein_g),
    carbs_g: round3(total.carbs_g),
    fat_g: round3(total.fat_g),
    fiber_g: round3(total.fiber_g),
    sugar_g: round3(total.sugar_g),
  }
}

const subtractTotals = (a: MacroTotals, b: MacroTotals): MacroTotals => ({
  calories: a.calories !== null && b.calories !== null ? a.calories - b.calories : null,
  protein_g: a.protein_g !== null && b.protein_g !== null ? round3(a.protein_g - b.protein_g) : null,
  carbs_g: a.carbs_g !== null && b.carbs_g !== null ? round3(a.carbs_g - b.carbs_g) : null,
  fat_g: a.fat_g !== null && b.fat_g !== null ? round3(a.fat_g - b.fat_g) : null,
  fiber_g: a.fiber_g !== null && b.fiber_g !== null ? round3(a.fiber_g - b.fiber_g) : null,
  sugar_g: a.sugar_g !== null && b.sugar_g !== null ? round3(a.sugar_g - b.sugar_g) : null,
})

const getAuthedEmail = async (req: NextRequest): Promise<string | null> => {
  const session = await getServerSession(authOptions)
  let userEmail = session?.user?.email ?? null
  if (!userEmail) {
    try {
      const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
      })
      if (token?.email) userEmail = String(token.email)
    } catch {}
  }
  return userEmail
}

const loadStoredState = async (userId: string): Promise<StoredState> => {
  const stored = await prisma.healthGoal.findFirst({
    where: { userId, name: AI_MEAL_RECOMMENDATION_GOAL_NAME },
    select: { category: true },
  })
  if (!stored?.category) {
    return { version: AI_MEAL_RECOMMENDATION_STORAGE_VERSION, history: [], seenExplainAt: null, committedIds: [], lastGenerated: null }
  }
  try {
    const parsed = JSON.parse(stored.category)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const history = Array.isArray((parsed as any).history) ? (parsed as any).history.filter(Boolean) : []
      const seenExplainAt =
        typeof (parsed as any).seenExplainAt === 'string' ? (parsed as any).seenExplainAt : null
      const committedIds = Array.isArray((parsed as any).committedIds)
        ? (parsed as any).committedIds.map((v: any) => String(v || '').trim()).filter(Boolean)
        : []
      const lastGeneratedRaw = (parsed as any).lastGenerated
      const lastGenerated =
        lastGeneratedRaw && typeof lastGeneratedRaw === 'object'
          ? {
              mealName: String(lastGeneratedRaw.mealName || '').trim(),
              items: Array.isArray(lastGeneratedRaw.items) ? lastGeneratedRaw.items : [],
              createdAt: String(lastGeneratedRaw.createdAt || ''),
            }
          : null
      return {
        version: Number((parsed as any).version) || AI_MEAL_RECOMMENDATION_STORAGE_VERSION,
        history,
        seenExplainAt,
        committedIds,
        lastGenerated,
      }
    }
    const history = Array.isArray(parsed) ? parsed.filter(Boolean) : []
    return { version: AI_MEAL_RECOMMENDATION_STORAGE_VERSION, history, seenExplainAt: null, committedIds: [], lastGenerated: null }
  } catch {
    return { version: AI_MEAL_RECOMMENDATION_STORAGE_VERSION, history: [], seenExplainAt: null, committedIds: [], lastGenerated: null }
  }
}

const saveStoredState = async (userId: string, state: StoredState) => {
  const committedIdSet = new Set(
    Array.isArray(state.committedIds) ? state.committedIds.map((v) => String(v || '').trim()).filter(Boolean) : [],
  )
  const trimmedHistory = Array.isArray(state.history)
    ? state.history
        .filter(Boolean)
        // Only persist committed records into the saved history.
        .filter((h: any) => committedIdSet.has(String(h?.id || '')))
        .slice(0, AI_MEAL_RECOMMENDATION_HISTORY_LIMIT)
    : []
  const payload = JSON.stringify({
    version: AI_MEAL_RECOMMENDATION_STORAGE_VERSION,
    history: trimmedHistory,
    seenExplainAt: state.seenExplainAt || null,
    committedIds: Array.from(committedIdSet).slice(0, AI_MEAL_RECOMMENDATION_HISTORY_LIMIT),
    lastGenerated: state.lastGenerated
      ? {
          mealName: String(state.lastGenerated.mealName || ''),
          items: Array.isArray(state.lastGenerated.items) ? state.lastGenerated.items : [],
          createdAt: String(state.lastGenerated.createdAt || ''),
        }
      : null,
  })
  const existing = await prisma.healthGoal.findFirst({
    where: { userId, name: AI_MEAL_RECOMMENDATION_GOAL_NAME },
    select: { id: true },
  })
  if (existing?.id) {
    await prisma.healthGoal.update({ where: { id: existing.id }, data: { category: payload } })
    return
  }
  await prisma.healthGoal.create({
    data: {
      userId,
      name: AI_MEAL_RECOMMENDATION_GOAL_NAME,
      category: payload,
      currentRating: 0,
    },
  })
}

const buildTargetsForUser = async (user: any) => {
  const profile = (() => {
    try {
      const stored = user.healthGoals?.find((g: any) => g?.name === '__PROFILE_INFO_DATA__')
      const parsed = stored?.category ? JSON.parse(stored.category) : null
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  })()

  const primaryGoal = (() => {
    try {
      const stored = user.healthGoals?.find((g: any) => g?.name === '__PRIMARY_GOAL__')
      const parsed = stored?.category ? JSON.parse(stored.category) : null
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  })()

  const selectedIssues = (() => {
    try {
      const stored = user.healthGoals?.find((g: any) => g?.name === '__SELECTED_ISSUES__')
      const parsed = stored?.category ? JSON.parse(stored.category) : null
      return Array.isArray(parsed) ? parsed.map((v: any) => String(v || '')).filter(Boolean) : []
    } catch {
      return []
    }
  })()

  const healthSituations = (() => {
    try {
      const stored = user.healthGoals?.find((g: any) => g?.name === '__HEALTH_SITUATIONS_DATA__')
      const parsed = stored?.category ? JSON.parse(stored.category) : null
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  })()

  const allergySettings = (() => {
    try {
      const stored = user.healthGoals?.find((g: any) => g?.name === '__ALLERGIES_DATA__')
      const parsed = stored?.category ? JSON.parse(stored.category) : null
      return parsed && typeof parsed === 'object' ? parsed : { allergies: [], diabetesType: '' }
    } catch {
      return { allergies: [], diabetesType: '' }
    }
  })()

  const dietTypes = (() => {
    try {
      const stored = user.healthGoals?.find((g: any) => g?.name === '__DIET_PREFERENCE__')
      const parsed = stored?.category ? JSON.parse(stored.category) : null
      if (!parsed || typeof parsed !== 'object') return []
      const raw = Array.isArray((parsed as any).dietTypes) ? (parsed as any).dietTypes : (parsed as any).dietType
      if (Array.isArray(raw)) return raw.map((v: any) => String(v || '').trim()).filter(Boolean)
      if (typeof raw === 'string' && raw.trim()) return [raw.trim()]
      return []
    } catch {
      return []
    }
  })()

  const goalChoiceValue =
    typeof primaryGoal?.goalChoice === 'string' ? primaryGoal.goalChoice.toLowerCase() : ''
  const useManualTargets = goalChoiceValue.includes('lose') || goalChoiceValue.includes('gain')

  const targets = calculateDailyTargets({
    gender: user.gender ? String(user.gender).toLowerCase() : '',
    birthdate: typeof profile?.dateOfBirth === 'string' ? profile.dateOfBirth : '',
    weightKg: typeof user.weight === 'number' ? user.weight : null,
    heightCm: typeof user.height === 'number' ? user.height : null,
    exerciseFrequency: typeof user.exerciseFrequency === 'string' ? user.exerciseFrequency : '',
    dietTypes,
    goals: selectedIssues,
    goalChoice: typeof primaryGoal?.goalChoice === 'string' ? primaryGoal.goalChoice : '',
    goalIntensity:
      typeof primaryGoal?.goalIntensity === 'string' &&
      ['mild', 'standard', 'aggressive'].includes(primaryGoal.goalIntensity.toLowerCase())
        ? (primaryGoal.goalIntensity.toLowerCase() as any)
        : 'standard',
    calorieTarget: useManualTargets && typeof primaryGoal?.goalCalorieTarget === 'number' ? primaryGoal.goalCalorieTarget : null,
    macroSplit:
      useManualTargets && primaryGoal?.goalMacroSplit && typeof primaryGoal.goalMacroSplit === 'object'
        ? primaryGoal.goalMacroSplit
        : null,
    fiberTarget: useManualTargets && typeof primaryGoal?.goalFiberTarget === 'number' ? primaryGoal.goalFiberTarget : null,
    sugarMax: useManualTargets && typeof primaryGoal?.goalSugarMax === 'number' ? primaryGoal.goalSugarMax : null,
    bodyType: user.bodyType ? String(user.bodyType).toLowerCase() : '',
    diabetesType:
      typeof allergySettings?.diabetesType === 'string' &&
      ['type1', 'type2', 'prediabetes'].includes(allergySettings.diabetesType.toLowerCase())
        ? (allergySettings.diabetesType.toLowerCase() as any)
        : null,
    healthSituations: healthSituations as any,
  })

  return {
    targets: {
      calories: targets.calories ?? null,
      protein_g: targets.protein ?? null,
      carbs_g: targets.carbs ?? null,
      fat_g: targets.fat ?? null,
      fiber_g: typeof targets.fiber === 'number' ? targets.fiber : null,
      sugar_g: typeof targets.sugarMax === 'number' ? targets.sugarMax : null,
    } satisfies MacroTotals,
    profile,
    primaryGoal,
    selectedIssues,
    healthSituations,
    allergySettings,
  }
}

const loadFoodLogsForDate = async (userId: string, date: string, tzOffsetMin: number) => {
  const [y, m, d] = date.split('-').map((v) => parseInt(v, 10))
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + tzOffsetMin * 60 * 1000)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
  const logs = await prisma.foodLog.findMany({
    where: {
      userId,
      OR: [{ localDate: date }, { localDate: null, createdAt: { gte: start, lte: end } }, { createdAt: { gte: start, lte: end } }],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, description: true, nutrients: true, meal: true, category: true, localDate: true, createdAt: true },
  })

  const filtered = logs.filter((log) => {
    if (log.localDate === date) return true
    const createdAt = log.createdAt instanceof Date ? log.createdAt : new Date(log.createdAt as any)
    if (Number.isNaN(createdAt.getTime())) return false
    const local = new Date(createdAt.getTime() - tzOffsetMin * 60 * 1000)
    const iso = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`
    return iso === date
  })

  return filtered
}

const normalizeNameKey = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const buildItemSet = (items: RecommendedItem[]) =>
  new Set(
    items
      .map((item) => normalizeNameKey(item?.name || ''))
      .filter(Boolean),
  )

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const val of a) {
    if (b.has(val)) intersection += 1
  }
  const union = a.size + b.size - intersection
  return union > 0 ? intersection / union : 0
}

const isSimilarMeal = (a: { mealName: string; items: RecommendedItem[] }, b: { mealName: string; items: RecommendedItem[] }) => {
  const nameA = normalizeNameKey(a.mealName)
  const nameB = normalizeNameKey(b.mealName)
  if (nameA && nameA === nameB) return true
  const nameSetA = new Set(nameA.split(' ').filter(Boolean))
  const nameSetB = new Set(nameB.split(' ').filter(Boolean))
  if (jaccard(nameSetA, nameSetB) >= 0.8) return true
  const itemsA = buildItemSet(a.items)
  const itemsB = buildItemSet(b.items)
  if (itemsA.size > 0 && itemsB.size > 0 && jaccard(itemsA, itemsB) >= 0.6) return true
  return false
}

const normalizeAndValidateItems = (items: any[]): RecommendedItem[] => {
  const safe: RecommendedItem[] = []
  for (const raw of Array.isArray(items) ? items : []) {
    const name = String(raw?.name || '').trim()
    if (!name) continue
    const servings = Number(raw?.servings ?? 1)
    safe.push({
      id: raw?.id ? String(raw.id) : undefined,
      name,
      serving_size: raw?.serving_size ? String(raw.serving_size) : null,
      calories: Number.isFinite(Number(raw?.calories)) ? Number(raw.calories) : null,
      protein_g: Number.isFinite(Number(raw?.protein_g)) ? Number(raw.protein_g) : null,
      carbs_g: Number.isFinite(Number(raw?.carbs_g)) ? Number(raw.carbs_g) : null,
      fat_g: Number.isFinite(Number(raw?.fat_g)) ? Number(raw.fat_g) : null,
      fiber_g: Number.isFinite(Number(raw?.fiber_g)) ? Number(raw.fiber_g) : null,
      sugar_g: Number.isFinite(Number(raw?.sugar_g)) ? Number(raw.sugar_g) : null,
      servings: Number.isFinite(servings) ? clamp(servings, 0, 20) : 1,
    })
  }
  return safe
}

const scaleToFitCalories = (items: RecommendedItem[], caloriesCap: number | null) => {
  if (!Number.isFinite(Number(caloriesCap)) || !caloriesCap || caloriesCap <= 0) return items
  const totals = computeTotalsFromItems(items)
  const totalCalories = Number(totals.calories || 0)
  if (!Number.isFinite(totalCalories) || totalCalories <= 0) return items
  if (totalCalories <= caloriesCap) return items

  const factor = clamp(caloriesCap / totalCalories, 0.15, 1)
  return items.map((it) => ({ ...it, servings: round3(clamp((Number(it.servings) || 0) * factor, 0, 20)) }))
}

const filterCommittedHistory = (state: StoredState) => {
  const committedIdSet = new Set(
    Array.isArray(state.committedIds) ? state.committedIds.map((v) => String(v || '').trim()).filter(Boolean) : [],
  )
  if (committedIdSet.size === 0) return []
  return (state.history || []).filter((h: any) => h && committedIdSet.has(String(h?.id || '')))
}

export async function GET(req: NextRequest) {
  const userEmail = await getAuthedEmail(req)
  if (!userEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = (searchParams.get('date') || buildTodayIso()).trim()
  const category = normalizeMealCategory(searchParams.get('category'))
  const tzOffsetMin = Number(searchParams.get('tz') || '0')

  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    include: { healthGoals: true, supplements: true, medications: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const storedState = await loadStoredState(user.id)
  const historyAll = filterCommittedHistory(storedState)
    .filter((h) => h && typeof h === 'object')
    .sort((a: any, b: any) => Number(new Date(b.createdAt).getTime()) - Number(new Date(a.createdAt).getTime()))

  const { targets } = await buildTargetsForUser(user as any)
  const logs = await loadFoodLogsForDate(user.id, date, Number.isFinite(tzOffsetMin) ? tzOffsetMin : 0)
  const used = sumTotals(logs.map((l) => extractTotalsFromNutrients(l.nutrients)))
  const remaining = subtractTotals(targets, used)

  // Return full history, but leave filtering to client.
  return NextResponse.json({
    costCredits: AI_MEAL_RECOMMENDATION_CREDITS,
    context: { targets, used, remaining },
    history: historyAll,
    seenExplain: Boolean(storedState.seenExplainAt) || historyAll.length > 0,
    category,
  })
}

export async function PUT(req: NextRequest) {
  const userEmail = await getAuthedEmail(req)
  if (!userEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Optional: persist a recommendation into history after the user explicitly saves it.
  // (Generated meals are otherwise treated as drafts and are not stored in history.)
  const body = await req.json().catch(() => null)
  if (body && typeof body === 'object' && (body as any).action === 'commit') {
    const rawRec = (body as any).recommendation
    if (!rawRec || typeof rawRec !== 'object') {
      return NextResponse.json({ error: 'Missing recommendation' }, { status: 400 })
    }

    const category = normalizeMealCategory((rawRec as any).category)
    const date = typeof (rawRec as any).date === 'string' ? String((rawRec as any).date).trim() : buildTodayIso()
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const state = await loadStoredState(user.id)
    const historyAll = filterCommittedHistory(state)
      .filter((h) => h && typeof h === 'object')
      .sort((a: any, b: any) => Number(new Date(b.createdAt).getTime()) - Number(new Date(a.createdAt).getTime()))

    const itemsInitial = normalizeAndValidateItems((rawRec as any).items)
    if (!itemsInitial || itemsInitial.length === 0) {
      return NextResponse.json({ error: 'Invalid items' }, { status: 400 })
    }

    const mealNameRaw = typeof (rawRec as any).mealName === 'string' ? String((rawRec as any).mealName).trim() : ''
    const { mealName: safeMealName, items: itemsWithNameFixes } = applyMealNameConsistency(category, mealNameRaw, itemsInitial)
    const recipe = normalizeRecipe((rawRec as any).recipe) || buildFallbackRecipe(category, itemsWithNameFixes)
    const totals = computeTotalsFromItems(itemsWithNameFixes)

    const id =
      typeof (rawRec as any).id === 'string' && String((rawRec as any).id).trim()
        ? String((rawRec as any).id).trim()
        : `air-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const createdAt =
      typeof (rawRec as any).createdAt === 'string' && !Number.isNaN(new Date((rawRec as any).createdAt).getTime())
        ? String((rawRec as any).createdAt)
        : new Date().toISOString()

    const tags = Array.isArray((rawRec as any).tags)
      ? (rawRec as any).tags.map((t: any) => String(t || '').trim()).filter(Boolean).slice(0, 12)
      : []
    const why = typeof (rawRec as any).why === 'string' ? String((rawRec as any).why).trim() : ''
    const record: RecommendedMealRecord = {
      id,
      createdAt,
      date,
      category,
      mealName: safeMealName || `AI Recommended ${category}`,
      tags,
      why,
      recipe,
      items: itemsWithNameFixes,
      totals,
    }

    const nextHistory = [record, ...historyAll.filter((h: any) => String(h?.id || '') !== id)].slice(
      0,
      AI_MEAL_RECOMMENDATION_HISTORY_LIMIT,
    )
    const committedIds = Array.from(
      new Set([id, ...(Array.isArray(state.committedIds) ? state.committedIds : [])].map((v) => String(v || '').trim()).filter(Boolean)),
    ).slice(0, AI_MEAL_RECOMMENDATION_HISTORY_LIMIT)
    try {
      await saveStoredState(user.id, {
        ...state,
        history: nextHistory,
        seenExplainAt: state.seenExplainAt || new Date().toISOString(),
        committedIds,
      })
    } catch (e) {
      console.warn('[ai-meal-recommendation] failed to persist committed history (non-fatal)', e)
    }

    return NextResponse.json({ ok: true, history: nextHistory })
  }

  const state = await loadStoredState(user.id)
  if (state.seenExplainAt) {
    return NextResponse.json({ ok: true, seenExplainAt: state.seenExplainAt })
  }
  const nowIso = new Date().toISOString()
  try {
    await saveStoredState(user.id, { ...state, seenExplainAt: nowIso })
  } catch (e) {
    console.warn('[ai-meal-recommendation] failed to mark explain as seen (non-fatal)', e)
  }
  return NextResponse.json({ ok: true, seenExplainAt: nowIso })
}

export async function POST(req: NextRequest) {
  const userEmail = await getAuthedEmail(req)
  if (!userEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const date = typeof body?.date === 'string' ? body.date.trim() : buildTodayIso()
  const category = normalizeMealCategory(body?.category)
  const tzOffsetMin = Number(body?.tz || '0')

  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    include: { healthGoals: true, supplements: true, medications: true, subscription: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const cm = new CreditManager(user.id)
  const wallet = await cm.getWalletStatus()
  if (wallet.totalAvailableCents < AI_MEAL_RECOMMENDATION_CREDITS) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }

  // Model selection mirrors the Food Analyzer override (optional).
  let model = (process.env.OPENAI_FOOD_MODEL || 'gpt-4o').trim() || 'gpt-4o'
  try {
    const goal = await prisma.healthGoal.findFirst({
      where: { userId: user.id, name: '__FOOD_ANALYZER_MODEL__' },
      select: { category: true },
    })
    if (goal?.category) {
      const parsed = JSON.parse(goal.category)
      const override = typeof parsed?.model === 'string' ? parsed.model.trim() : ''
      if (override === 'gpt-4o' || override === 'gpt-5.2') {
        model = override
      }
    }
  } catch {}

  const { targets, profile, primaryGoal, selectedIssues, healthSituations, allergySettings } = await buildTargetsForUser(user as any)
  const logs = await loadFoodLogsForDate(user.id, date, Number.isFinite(tzOffsetMin) ? tzOffsetMin : 0)
  const used = sumTotals(logs.map((l) => extractTotalsFromNutrients(l.nutrients)))
  const remaining = subtractTotals(targets, used)

  const storedState = await loadStoredState(user.id)
  const historyAll = filterCommittedHistory(storedState)
    .filter((h) => h && typeof h === 'object')
    .sort((a: any, b: any) => Number(new Date(b.createdAt).getTime()) - Number(new Date(a.createdAt).getTime()))

  const recentSameCategory = historyAll.filter((h: any) => normalizeMealCategory(h?.category) === category).slice(0, 10)
  const recentNames = recentSameCategory.map((h: any) => String(h?.mealName || '').trim()).filter(Boolean)
  const recentIngredientHints = recentSameCategory
    .flatMap((h: any) => (Array.isArray(h?.items) ? h.items.slice(0, 6) : []))
    .map((it: any) => String(it?.name || '').trim())
    .filter(Boolean)
    .slice(0, 24)

  const todaysDescriptions = logs
    .map((l) => String(l.description || '').split('\n')[0].trim())
    .filter(Boolean)
    .slice(0, 8)

  const supplements = Array.isArray((user as any)?.supplements) ? (user as any).supplements : []
  const medications = Array.isArray((user as any)?.medications) ? (user as any).medications : []

  const allergies = Array.isArray((allergySettings as any)?.allergies) ? (allergySettings as any).allergies : []
  const diabetesType = typeof (allergySettings as any)?.diabetesType === 'string' ? (allergySettings as any).diabetesType : ''

  const caloriesCap = typeof remaining.calories === 'number' && Number.isFinite(remaining.calories) ? Math.max(0, remaining.calories) : null

  const system = [
    'You are Helfi’s AI meal recommender.',
    'Return JSON only. No markdown. No extra text.',
    'Do NOT make medical claims. Use informational wording only.',
    'Respect allergies/intolerances and avoid excluded foods.',
    'Respect remaining calories/macros: stay within remaining if possible; if very tight, recommend a smaller/snack-style meal.',
    'Avoid repeating meals; rotate away from recent names/ingredients when possible.',
    'The meal name must not mention ingredients that are missing from the items list (including herbs/spices). If you mention it, include it as an item even if calories are tiny.',
    '',
    'Output schema:',
    '{',
    '  "mealName": string,',
    '  "tags": string[],',
    '  "why": string,',
    '  "recipe": { "prepMinutes": number, "cookMinutes": number, "steps": string[] },',
    '  "items": Array<{',
    '    "name": string,',
    '    "serving_size": string,',
    '    "servings": number,',
    '    "calories": number,',
    '    "protein_g": number,',
    '    "carbs_g": number,',
    '    "fat_g": number,',
    '    "fiber_g": number,',
    '    "sugar_g": number',
    '  }>',
    '}',
  ].join('\n')

  const buildUserPrompt = (opts: {
    supplementsLimit: number
    medicationsLimit: number
    healthSituationsMaxChars: number
    todaysFoodsLimit: number
    recentNamesLimit: number
    recentIngredientsLimit: number
    avoidNames: string[]
    avoidIngredients: string[]
    strictAvoidance: boolean
  }) => {
    const supplementsForPrompt = supplements
      .slice(0, opts.supplementsLimit)
      .map((s: any) => ({
        name: truncate(String(s?.name || ''), 64),
        dosage: truncate(String(s?.dosage || ''), 64),
        timing: truncate(String(s?.timing || ''), 64),
        scheduleInfo: truncate(String(s?.scheduleInfo || ''), 64),
      }))

    const medicationsForPrompt = medications
      .slice(0, opts.medicationsLimit)
      .map((m: any) => ({
        name: truncate(String(m?.name || ''), 64),
        dosage: truncate(String(m?.dosage || ''), 64),
        timing: truncate(String(m?.timing || ''), 64),
        scheduleInfo: truncate(String(m?.scheduleInfo || ''), 64),
      }))

    const userPrompt = [
      `Meal type: ${category}`,
      `Date: ${date}`,
      '',
      'User profile (may be partial):',
    `- gender: ${user.gender ? String(user.gender).toLowerCase() : ''}`,
    `- weightKg: ${typeof user.weight === 'number' ? user.weight : ''}`,
    `- heightCm: ${typeof user.height === 'number' ? user.height : ''}`,
    `- birthdate: ${typeof profile?.dateOfBirth === 'string' ? profile.dateOfBirth : ''}`,
    `- exerciseFrequency: ${typeof user.exerciseFrequency === 'string' ? user.exerciseFrequency : ''}`,
    `- exerciseTypes: ${Array.isArray(user.exerciseTypes) ? user.exerciseTypes.join(', ') : ''}`,
    `- goalChoice: ${typeof primaryGoal?.goalChoice === 'string' ? primaryGoal.goalChoice : ''}`,
    `- goalIntensity: ${typeof primaryGoal?.goalIntensity === 'string' ? primaryGoal.goalIntensity : ''}`,
    `- selected goals/concerns: ${Array.isArray(selectedIssues) ? selectedIssues.join(', ') : ''}`,
      '',
      'Health situations (free-text):',
    safeJsonCompact(healthSituations || {}, opts.healthSituationsMaxChars),
      '',
      'Allergies/intolerances to avoid:',
      safeJsonCompact(allergies || [], 240),
      diabetesType ? `Diabetes: ${diabetesType}` : '',
      '',
      'Supplements logged:',
      safeJsonCompact(supplementsForPrompt, 1400),
      '',
      'Medications logged:',
      safeJsonCompact(medicationsForPrompt, 1400),
      '',
      'Daily targets:',
      safeJsonCompact(targets, 260),
      'Used so far today:',
      safeJsonCompact(used, 260),
      'Remaining for today:',
      safeJsonCompact(remaining, 260),
      caloriesCap !== null ? `Hard cap calories for this meal: <= ${Math.max(0, Math.floor(caloriesCap))}` : '',
      '',
      'Foods already logged today (avoid repeating):',
    safeJsonCompact(todaysDescriptions.map((d) => truncate(d, 90)).slice(0, opts.todaysFoodsLimit), 900),
      '',
      'Recent AI recommended meal names (avoid repeating):',
    safeJsonCompact(recentNames.map((n) => truncate(n, 70)).slice(0, opts.recentNamesLimit), 600),
      'Saved/favorite meal names (never repeat):',
    safeJsonCompact(opts.avoidNames.map((n) => truncate(n, 70)), 600),
      'Recent AI recommended ingredient hints (avoid repeating):',
    safeJsonCompact(recentIngredientHints.map((n) => truncate(n, 48)).slice(0, opts.recentIngredientsLimit), 900),
      'Saved/favorite ingredient hints (never repeat):',
    safeJsonCompact(opts.avoidIngredients.map((n) => truncate(n, 48)), 900),
      '',
      'Constraints:',
      '- Provide 2–6 ingredients.',
      '- Use common, realistic foods and portions; keep ingredient list concise.',
      '- Set "servings" to 1 for every item. If there are multiple pieces, put the count into "serving_size" (e.g., "2 slices").',
      opts.strictAvoidance ? '- Do NOT reuse any meal name or ingredient combination from the avoid lists. Choose a clearly different meal.' : '',
      '- Tags must be short (1–3 words), informational (e.g., "Low sugar", "High protein", "Gut-friendly").',
      '- The "why" must be 2–5 sentences in plain English referencing goals and remaining macros.',
    ]
    .filter(Boolean)
    .join('\n')
    return userPrompt
  }

  const favoriteMeals = (() => {
    try {
      const storedFavorites = (user as any)?.healthGoals?.find((goal: any) => goal?.name === '__FOOD_FAVORITES__')
      if (!storedFavorites?.category) return []
      const parsed = JSON.parse(storedFavorites.category)
      if (Array.isArray(parsed?.favorites)) return parsed.favorites
      if (Array.isArray(parsed)) return parsed
      return []
    } catch {
      return []
    }
  })()

  const favoriteNames = favoriteMeals
    .map((fav: any) => String(fav?.label || fav?.description || '').trim())
    .filter(Boolean)
    .slice(0, 40)
  const favoriteIngredientHints = favoriteMeals
    .flatMap((fav: any) => (Array.isArray(fav?.items) ? fav.items.slice(0, 6) : []))
    .map((item: any) => String(item?.name || '').trim())
    .filter(Boolean)
    .slice(0, 40)

  const lastGeneratedCandidate = (() => {
    const last = storedState.lastGenerated
    if (!last || typeof last !== 'object') return null
    const items = normalizeAndValidateItems(last.items)
    if (!items.length) return null
    return { mealName: String(last.mealName || '').trim(), items }
  })()

  const lastGeneratedIngredientHints = lastGeneratedCandidate
    ? lastGeneratedCandidate.items.map((item) => String(item?.name || '').trim()).filter(Boolean)
    : []
  const avoidNames = Array.from(new Set([...recentNames, ...favoriteNames, lastGeneratedCandidate?.mealName || ''].filter(Boolean)))
  const avoidIngredients = Array.from(
    new Set([...recentIngredientHints, ...favoriteIngredientHints, ...lastGeneratedIngredientHints].filter(Boolean)),
  )

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  let record: RecommendedMealRecord | null = null
  const maxAttempts = 3

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let userPrompt = buildUserPrompt({
      supplementsLimit: 18,
      medicationsLimit: 18,
      healthSituationsMaxChars: 900,
      todaysFoodsLimit: 8,
      recentNamesLimit: 8,
      recentIngredientsLimit: 24,
      avoidNames,
      avoidIngredients,
      strictAvoidance: attempt > 0,
    })

    // Guard rail: keep the prompt within a cost envelope so the fixed credit price
    // maintains required profit margins. We compute a conservative upper-bound cost
    // based on prompt length + max output tokens.
    let maxOutputTokens = 650
    const estimateVendorCost = () => {
      const estPromptTokens = estimateTokensFromText(`${system}\n${userPrompt}`)
      const estVendorCostCents = openaiCostCentsForTokens(model, {
        promptTokens: estPromptTokens,
        completionTokens: maxOutputTokens,
      })
      return { estPromptTokens, estVendorCostCents }
    }

    let estimate = estimateVendorCost()
    if (MAX_VENDOR_COST_CENTS_FOR_FIXED_CREDITS > 0 && estimate.estVendorCostCents > MAX_VENDOR_COST_CENTS_FOR_FIXED_CREDITS) {
      // First trim pass: cut verbose fields further.
      userPrompt = buildUserPrompt({
        supplementsLimit: 10,
        medicationsLimit: 10,
        healthSituationsMaxChars: 500,
        todaysFoodsLimit: 5,
        recentNamesLimit: 6,
        recentIngredientsLimit: 16,
        avoidNames,
        avoidIngredients,
        strictAvoidance: attempt > 0,
      })
      estimate = estimateVendorCost()
    }

    if (MAX_VENDOR_COST_CENTS_FOR_FIXED_CREDITS > 0 && estimate.estVendorCostCents > MAX_VENDOR_COST_CENTS_FOR_FIXED_CREDITS) {
      // Second trim pass: reduce output cap (most expensive part for these models).
      maxOutputTokens = 500
      estimate = estimateVendorCost()
    }

    if (MAX_VENDOR_COST_CENTS_FOR_FIXED_CREDITS > 0 && estimate.estVendorCostCents > MAX_VENDOR_COST_CENTS_FOR_FIXED_CREDITS) {
      console.warn('[ai-meal-recommendation] prompt still too large for fixed credit price; proceeding with strict caps', {
        estPromptTokens: estimate.estPromptTokens,
        estVendorCostCents: estimate.estVendorCostCents,
        maxVendorCostCents: MAX_VENDOR_COST_CENTS_FOR_FIXED_CREDITS,
        maxOutputTokens,
      })
    }

    let content = ''
    try {
      const completion = await runChatCompletionWithLogging(
        openai,
        {
          model,
          temperature: 0.5,
          ...(model.toLowerCase().includes('gpt-5') ? { max_completion_tokens: maxOutputTokens } : { max_tokens: maxOutputTokens }),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userPrompt },
          ],
        } as any,
        {
          feature: 'food:ai-meal-recommendation',
          userId: user.id,
          userLabel: user.email,
          endpoint: '/api/ai-meal-recommendation',
        },
      )
      const raw = (completion as any)?.choices?.[0]?.message?.content
      content = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((p: any) => p?.text || '').join('') : ''
    } catch (err: any) {
      console.error('[ai-meal-recommendation] LLM call failed', err)
      return NextResponse.json({ error: 'AI failed' }, { status: 500 })
    }

    const parsed = parseJsonRelaxed(content)
    const mealName = typeof parsed?.mealName === 'string' ? parsed.mealName.trim() : ''
    const tags = Array.isArray(parsed?.tags) ? parsed.tags.map((t: any) => String(t || '').trim()).filter(Boolean).slice(0, 12) : []
    const why = typeof parsed?.why === 'string' ? parsed.why.trim() : ''
    const itemsInitial = normalizeAndValidateItems(parsed?.items)
    if (!itemsInitial || itemsInitial.length === 0) {
      continue
    }

    const itemsDefaulted = itemsInitial.map((item) => ({ ...item, servings: 1 }))
    const { mealName: safeMealName, items: itemsWithNameFixes } = applyMealNameConsistency(category, mealName, itemsDefaulted)
    const recipe = normalizeRecipe(parsed?.recipe) || buildFallbackRecipe(category, itemsWithNameFixes)
    const fitItems = itemsWithNameFixes
    const totals = computeTotalsFromItems(fitItems)

    const candidate = { mealName: safeMealName || `AI Recommended ${category}`, items: fitItems }
    const comparisons: Array<{ mealName: string; items: RecommendedItem[] }> = []
    if (lastGeneratedCandidate) comparisons.push(lastGeneratedCandidate)
    historyAll.forEach((h) => comparisons.push({ mealName: h.mealName, items: h.items }))
    favoriteMeals.forEach((fav: any) => {
      const favItems = normalizeAndValidateItems(fav?.items)
      if (favItems.length > 0) {
        comparisons.push({ mealName: String(fav?.label || fav?.description || '').trim(), items: favItems })
      }
    })

    const isDuplicate = comparisons.some((comp) => isSimilarMeal(candidate, comp))
    if (isDuplicate) {
      continue
    }

    record = {
      id: `air-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      date,
      category,
      mealName: candidate.mealName,
      tags,
      why,
      recipe,
      items: fitItems,
      totals,
    }
    break
  }

  if (!record) {
    return NextResponse.json({ error: 'Unable to generate a unique meal right now.' }, { status: 502 })
  }

  // Charge credits only after we have a usable recommendation.
  const charged = await cm.chargeCents(AI_MEAL_RECOMMENDATION_CREDITS)
  if (!charged) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }

  try {
    await saveStoredState(user.id, {
      ...storedState,
      seenExplainAt: storedState.seenExplainAt || new Date().toISOString(),
      lastGenerated: { mealName: record.mealName, items: record.items, createdAt: record.createdAt },
    })
  } catch (e) {
    console.warn('[ai-meal-recommendation] failed to update last generated (non-fatal)', e)
  }

  const remainingAfter = subtractTotals(targets, used)

  return NextResponse.json({
    costCredits: AI_MEAL_RECOMMENDATION_CREDITS,
    context: { targets, used, remaining: remainingAfter },
    history: historyAll,
    seenExplain: true,
    recommendation: record,
  })
}
