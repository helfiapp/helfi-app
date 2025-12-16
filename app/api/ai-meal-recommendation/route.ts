import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import OpenAI from 'openai'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'
import { calculateDailyTargets } from '@/lib/daily-targets'
import {
  AI_MEAL_RECOMMENDATION_CREDITS,
  AI_MEAL_RECOMMENDATION_GOAL_NAME,
  AI_MEAL_RECOMMENDATION_HISTORY_LIMIT,
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
  items: RecommendedItem[]
  totals: MacroTotals
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

const buildTodayIso = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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

const getOrInitHistory = async (userId: string): Promise<RecommendedMealRecord[]> => {
  const stored = await prisma.healthGoal.findFirst({
    where: { userId, name: AI_MEAL_RECOMMENDATION_GOAL_NAME },
    select: { id: true, category: true },
  })
  if (!stored?.category) return []
  try {
    const parsed = JSON.parse(stored.category)
    const history = Array.isArray(parsed?.history) ? parsed.history : Array.isArray(parsed) ? parsed : []
    return history.filter(Boolean)
  } catch {
    return []
  }
}

const saveHistory = async (userId: string, history: RecommendedMealRecord[]) => {
  const trimmed = Array.isArray(history) ? history.filter(Boolean).slice(0, AI_MEAL_RECOMMENDATION_HISTORY_LIMIT) : []
  const existing = await prisma.healthGoal.findFirst({
    where: { userId, name: AI_MEAL_RECOMMENDATION_GOAL_NAME },
    select: { id: true },
  })
  const payload = JSON.stringify({ version: 1, history: trimmed })
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

  const targets = calculateDailyTargets({
    gender: user.gender ? String(user.gender).toLowerCase() : '',
    birthdate: typeof profile?.dateOfBirth === 'string' ? profile.dateOfBirth : '',
    weightKg: typeof user.weight === 'number' ? user.weight : null,
    heightCm: typeof user.height === 'number' ? user.height : null,
    exerciseFrequency: typeof user.exerciseFrequency === 'string' ? user.exerciseFrequency : '',
    goals: selectedIssues,
    goalChoice: typeof primaryGoal?.goalChoice === 'string' ? primaryGoal.goalChoice : '',
    goalIntensity:
      typeof primaryGoal?.goalIntensity === 'string' &&
      ['mild', 'standard', 'aggressive'].includes(primaryGoal.goalIntensity.toLowerCase())
        ? (primaryGoal.goalIntensity.toLowerCase() as any)
        : 'standard',
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

  const historyAll = (await getOrInitHistory(user.id))
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
    category,
  })
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

  const historyAll = (await getOrInitHistory(user.id))
    .filter((h) => h && typeof h === 'object')
    .sort((a: any, b: any) => Number(new Date(b.createdAt).getTime()) - Number(new Date(a.createdAt).getTime()))

  const recentSameCategory = historyAll.filter((h: any) => normalizeMealCategory(h?.category) === category).slice(0, 10)
  const recentNames = recentSameCategory.map((h: any) => String(h?.mealName || '').trim()).filter(Boolean)
  const recentIngredientHints = recentSameCategory
    .flatMap((h: any) => (Array.isArray(h?.items) ? h.items.slice(0, 6) : []))
    .map((it: any) => String(it?.name || '').trim())
    .filter(Boolean)
    .slice(0, 40)

  const todaysDescriptions = logs
    .map((l) => String(l.description || '').split('\n')[0].trim())
    .filter(Boolean)
    .slice(0, 12)

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
    '',
    'Output schema:',
    '{',
    '  "mealName": string,',
    '  "tags": string[],',
    '  "why": string,',
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
    JSON.stringify(healthSituations || {}),
    '',
    'Allergies/intolerances to avoid:',
    JSON.stringify(allergies || []),
    diabetesType ? `Diabetes: ${diabetesType}` : '',
    '',
    'Supplements logged:',
    JSON.stringify(
      supplements.slice(0, 30).map((s: any) => ({ name: s?.name, dosage: s?.dosage, timing: s?.timing, scheduleInfo: s?.scheduleInfo })),
    ),
    '',
    'Medications logged:',
    JSON.stringify(
      medications.slice(0, 30).map((m: any) => ({ name: m?.name, dosage: m?.dosage, timing: m?.timing, scheduleInfo: m?.scheduleInfo })),
    ),
    '',
    'Daily targets:',
    JSON.stringify(targets),
    'Used so far today:',
    JSON.stringify(used),
    'Remaining for today:',
    JSON.stringify(remaining),
    caloriesCap !== null ? `Hard cap calories for this meal: <= ${Math.max(0, Math.floor(caloriesCap))}` : '',
    '',
    'Foods already logged today (avoid repeating):',
    JSON.stringify(todaysDescriptions),
    '',
    'Recent AI recommended meal names (avoid repeating):',
    JSON.stringify(recentNames),
    'Recent AI recommended ingredient hints (avoid repeating):',
    JSON.stringify(recentIngredientHints),
    '',
    'Constraints:',
    '- Provide 2–6 ingredients.',
    '- Use common, realistic foods and portions; keep ingredient list concise.',
    '- Tags must be short (1–3 words), informational (e.g., "Low sugar", "High protein", "Gut-friendly").',
    '- The "why" must be 2–5 sentences in plain English referencing goals and remaining macros.',
  ]
    .filter(Boolean)
    .join('\n')

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  let content = ''
  try {
    const completion = await runChatCompletionWithLogging(
      openai,
      {
        model,
        temperature: 0.5,
        ...(model.toLowerCase().includes('gpt-5') ? { max_completion_tokens: 650 } : { max_tokens: 650 }),
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
  const items = normalizeAndValidateItems(parsed?.items)
  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 })
  }

  const fitItems = scaleToFitCalories(items, caloriesCap)
  const totals = computeTotalsFromItems(fitItems)

  // Charge credits only after we have a usable recommendation.
  const charged = await cm.chargeCents(AI_MEAL_RECOMMENDATION_CREDITS)
  if (!charged) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }

  const record: RecommendedMealRecord = {
    id: `air-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    date,
    category,
    mealName: mealName || `AI Recommended ${category}`,
    tags,
    why,
    items: fitItems,
    totals,
  }

  const nextHistory = [record, ...historyAll].slice(0, AI_MEAL_RECOMMENDATION_HISTORY_LIMIT)
  try {
    await saveHistory(user.id, nextHistory)
  } catch (e) {
    console.warn('[ai-meal-recommendation] failed to persist history (non-fatal)', e)
  }

  const remainingAfter = subtractTotals(targets, used)

  return NextResponse.json({
    costCredits: AI_MEAL_RECOMMENDATION_CREDITS,
    context: { targets, used, remaining: remainingAfter },
    history: nextHistory,
    recommendation: record,
  })
}

