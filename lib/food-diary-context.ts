import { prisma } from '@/lib/prisma'
import { calculateDailyTargets } from '@/lib/daily-targets'

export type MacroTotals = {
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  sugar_g: number | null
}

export type MacroRemaining = {
  remaining: number
  remainingClamped: number
  overBy: number
}

export type FoodDiarySnapshot = {
  localDate: string
  tzOffsetMin: number
  totals: MacroTotals
  targets: MacroTotals
  remaining: Record<keyof MacroTotals, MacroRemaining | null>
  priority: {
    low: string[]
    nearCap: string[]
  }
  logCount: number
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const toNumber = (value: any) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const round1 = (value: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) / 10 : null

const clampMin = (value: number, min: number) => Math.max(min, value)

const buildMacroTotals = (logs: Array<{ nutrients: any }>): MacroTotals => {
  const totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }
  let counted = 0

  logs.forEach((log) => {
    const n = (log && log.nutrients && typeof log.nutrients === 'object') ? log.nutrients : {}
    const calories = toNumber(n.calories ?? n.energy_kcal ?? n.energy)
    const protein = toNumber(n.protein_g ?? n.protein)
    const carbs = toNumber(n.carbs_g ?? n.carbohydrates_g ?? n.carbohydrates ?? n.carbs)
    const fat = toNumber(n.fat_g ?? n.total_fat_g ?? n.fat)
    const fiber = toNumber(n.fiber_g ?? n.fiber)
    const sugar = toNumber(n.sugar_g ?? n.sugar)
    const hasAny =
      (calories ?? 0) > 0 ||
      (protein ?? 0) > 0 ||
      (carbs ?? 0) > 0 ||
      (fat ?? 0) > 0 ||
      (fiber ?? 0) > 0 ||
      (sugar ?? 0) > 0

    if (!hasAny) return
    counted += 1
    totals.calories += calories ?? 0
    totals.protein_g += protein ?? 0
    totals.carbs_g += carbs ?? 0
    totals.fat_g += fat ?? 0
    totals.fiber_g += fiber ?? 0
    totals.sugar_g += sugar ?? 0
  })

  return {
    calories: Math.round(totals.calories),
    protein_g: round1(totals.protein_g),
    carbs_g: round1(totals.carbs_g),
    fat_g: round1(totals.fat_g),
    fiber_g: round1(totals.fiber_g),
    sugar_g: round1(totals.sugar_g),
  }
}

const buildRemaining = (target: number | null, consumed: number | null) => {
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) return null
  const used = typeof consumed === 'number' && Number.isFinite(consumed) ? consumed : 0
  const remaining = target - used
  return {
    remaining: round1(remaining) ?? remaining,
    remainingClamped: round1(clampMin(remaining, 0)) ?? clampMin(remaining, 0),
    overBy: round1(clampMin(-remaining, 0)) ?? clampMin(-remaining, 0),
  }
}

const loadFoodLogsForDate = async (userId: string, date: string, tzOffsetMin: number) => {
  const [y, m, d] = date.split('-').map((v) => parseInt(v, 10))
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + tzOffsetMin * 60 * 1000)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
  const logs = await prisma.foodLog.findMany({
    where: {
      userId,
      OR: [
        { localDate: date },
        { localDate: null, createdAt: { gte: start, lte: end } },
        { createdAt: { gte: start, lte: end } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { nutrients: true, localDate: true, createdAt: true },
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

const buildTargetsForUser = (user: any) => {
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
    calories: targets.calories ?? null,
    protein_g: targets.protein ?? null,
    carbs_g: targets.carbs ?? null,
    fat_g: targets.fat ?? null,
    fiber_g: typeof targets.fiber === 'number' ? targets.fiber : null,
    sugar_g: typeof targets.sugarMax === 'number' ? targets.sugarMax : null,
  } satisfies MacroTotals
}

export async function buildFoodDiarySnapshot(params: {
  userId: string
  localDate: string
  tzOffsetMin: number
}): Promise<FoodDiarySnapshot | null> {
  const { userId, localDate, tzOffsetMin } = params
  if (!DATE_RE.test(localDate)) return null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { healthGoals: { orderBy: { updatedAt: 'desc' } } },
  })
  if (!user) return null

  const [logs, targets] = await Promise.all([
    loadFoodLogsForDate(userId, localDate, tzOffsetMin),
    Promise.resolve(buildTargetsForUser(user)),
  ])

  const totals = buildMacroTotals(logs)
  const remaining = {
    calories: buildRemaining(targets.calories, totals.calories),
    protein_g: buildRemaining(targets.protein_g, totals.protein_g),
    carbs_g: buildRemaining(targets.carbs_g, totals.carbs_g),
    fat_g: buildRemaining(targets.fat_g, totals.fat_g),
    fiber_g: buildRemaining(targets.fiber_g, totals.fiber_g),
    sugar_g: buildRemaining(targets.sugar_g, totals.sugar_g),
  }

  const deficitCandidates: Array<{ key: string; ratio: number }> = []
  const nearCap: string[] = []
  const pushDeficit = (label: string, target: number | null, consumed: number | null) => {
    if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) return
    const used = typeof consumed === 'number' && Number.isFinite(consumed) ? consumed : 0
    const remainingValue = target - used
    if (remainingValue <= 0) {
      nearCap.push(label)
      return
    }
    const ratio = remainingValue / target
    if (ratio <= 0.12) {
      nearCap.push(label)
    }
    deficitCandidates.push({ key: label, ratio })
  }

  pushDeficit('Protein', targets.protein_g, totals.protein_g)
  pushDeficit('Fiber', targets.fiber_g, totals.fiber_g)
  pushDeficit('Carbs', targets.carbs_g, totals.carbs_g)
  pushDeficit('Fat', targets.fat_g, totals.fat_g)
  pushDeficit('Sugar', targets.sugar_g, totals.sugar_g)
  pushDeficit('Calories', targets.calories, totals.calories)

  const low = deficitCandidates
    .sort((a, b) => b.ratio - a.ratio)
    .map((entry) => entry.key)

  return {
    localDate,
    tzOffsetMin,
    totals,
    targets,
    remaining,
    priority: {
      low: low.slice(0, 3),
      nearCap: Array.from(new Set(nearCap)).slice(0, 3),
    },
    logCount: logs.length,
  }
}
