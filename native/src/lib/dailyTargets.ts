export type DailyTargets = {
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber?: number | null
  sugarMax?: number | null
}

export type DailyTargetInput = {
  gender?: string | null
  birthdate?: string | null
  weightKg?: number | null
  heightCm?: number | null
  exerciseFrequency?: string | null
  goals?: string[] | null
  goalChoice?: string | null
  goalIntensity?: 'mild' | 'standard' | 'aggressive' | null
  exerciseDurations?: Record<string, number | string | null> | null
  bodyType?: string | null
  allergies?: string[] | null
  diabetesType?: 'type1' | 'type2' | 'prediabetes' | null
  dietTypes?: any
  calorieTarget?: number | null
  macroSplit?: {
    proteinPct?: number | null
    carbPct?: number | null
    fatPct?: number | null
  } | null
  fiberTarget?: number | null
  sugarMax?: number | null
  healthSituations?: {
    healthIssues?: string
    healthProblems?: string
    additionalInfo?: string
  } | null
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const normalizeDietTypes = (raw: any): string[] => {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .filter((v) => typeof v === 'string')
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    )
  }
  if (typeof raw === 'string') {
    const v = raw.trim()
    return v ? [v] : []
  }
  return []
}

const EXERCISE_MET: Record<string, number> = {
  walking: 3.5,
  running: 9,
  swimming: 6,
  'bike riding': 7,
  biking: 7,
  cycling: 7,
  mma: 10,
  boxing: 9.5,
  jujitsu: 7.5,
  jiu: 7.5,
  karate: 8,
  'body building': 6,
  bodybuilding: 6,
  yoga: 3,
  pilates: 3.5,
}

function calculateAge(birthdate?: string | null): number | null {
  if (!birthdate) return null
  const [y, m, d] = birthdate.split('-').map((v) => parseInt(v, 10))
  if (!y || !m || !d) return null
  const today = new Date()
  let age = today.getFullYear() - y
  const monthDiff = today.getMonth() + 1 - m
  const dayDiff = today.getDate() - d
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1
  }
  if (!Number.isFinite(age) || age <= 0 || age > 110) return null
  return age
}

function activityMultiplier(exerciseFrequency?: string | null): number {
  if (!exerciseFrequency) return 1.2
  const f = exerciseFrequency.toLowerCase()
  if (f.includes('every day') || f.includes('6 days') || f.includes('6 day')) return 1.6
  if (f.includes('5 days') || f.includes('5 day')) return 1.55
  if (f.includes('3 days') || f.includes('3 day') || f.includes('4 days') || f.includes('4 day'))
    return 1.45
  if (f.includes('2 days') || f.includes('2 day') || f.includes('1 day')) return 1.3
  return 1.2
}

function parseExerciseDurations(
  durations?: Record<string, number | string | null> | null,
  exerciseFrequency?: string | null,
): number {
  if (!durations) return 0
  const freq = exerciseFrequency ? exerciseFrequency.toLowerCase() : ''
  const sessionsPerWeekMatch = freq.match(/(\d+)\s*day/)
  const sessionsPerWeek = sessionsPerWeekMatch ? parseInt(sessionsPerWeekMatch[1], 10) : 3

  return Object.entries(durations).reduce((total, [rawType, rawMinutes]) => {
    const minutes = typeof rawMinutes === 'string' ? parseFloat(rawMinutes) : rawMinutes || 0
    if (!Number.isFinite(minutes) || minutes <= 0) return total
    const normalizedType = rawType.trim().toLowerCase()
    const met =
      EXERCISE_MET[normalizedType] ||
      EXERCISE_MET[normalizedType.replace(/\s+/g, ' ')] ||
      5 // default moderate activity
    // Convert MET minutes to daily kcal; MET formula kcal/min = (MET * 3.5 * kg) / 200
    const dailyMinutes = (minutes * (Number.isFinite(sessionsPerWeek) ? sessionsPerWeek : 3)) / 7
    return total + { met, dailyMinutes }.met * 3.5 * dailyMinutes // weight factored later
  }, 0)
}

function goalAdjustmentFactor(goalChoice?: string | null, intensity?: 'mild' | 'standard' | 'aggressive' | null): number {
  const choice = (goalChoice || '').toLowerCase()
  const level: 'mild' | 'standard' | 'aggressive' =
    typeof intensity === 'string'
      ? (intensity.toLowerCase() as 'mild' | 'standard' | 'aggressive')
      : 'standard'
  const byLevel = (base: number) => {
    if (level === 'mild') return base * 0.7
    if (level === 'aggressive') return base * 1.2
    return base
  }

  if (choice.includes('lose')) return 1 - byLevel(0.1) // 10% mild → 12% aggressive deficit
  if (choice.includes('tone')) return 1 - byLevel(0.12)
  if (choice.includes('shred')) return 1 - byLevel(0.2)
  if (choice.includes('gain')) return 1 + byLevel(0.1)
  return 1
}

function parseConditionsText(healthSituations?: DailyTargetInput['healthSituations']): string[] {
  const blob = [
    healthSituations?.healthIssues || '',
    healthSituations?.healthProblems || '',
    healthSituations?.additionalInfo || '',
  ]
    .join(' ')
    .toLowerCase()

  const matches = []
  if (blob.includes('diab')) matches.push('diabetes')
  if (blob.includes('pcos')) matches.push('pcos')
  if (blob.includes('cholesterol') || blob.includes('lipid')) matches.push('cholesterol')
  if (blob.includes('hypertension') || blob.includes('blood pressure')) matches.push('hypertension')
  if (blob.includes('ibs') || blob.includes('bowel') || blob.includes('constipation')) matches.push('ibs')
  if (blob.includes('heart') || blob.includes('cardio')) matches.push('cardio')
  return matches
}

function macroSplitForGoal(goalChoice?: string | null): { proteinPct: number; fatPct: number; carbPct: number } {
  const choice = (goalChoice || '').toLowerCase()
  if (choice.includes('lose')) return { proteinPct: 0.32, fatPct: 0.3, carbPct: 0.38 }
  if (choice.includes('tone')) return { proteinPct: 0.33, fatPct: 0.3, carbPct: 0.37 }
  if (choice.includes('shred')) return { proteinPct: 0.36, fatPct: 0.3, carbPct: 0.34 }
  if (choice.includes('gain')) return { proteinPct: 0.28, fatPct: 0.28, carbPct: 0.44 }
  return { proteinPct: 0.3, fatPct: 0.3, carbPct: 0.4 }
}

function normalizeSplit(proteinPct: number, fatPct: number, carbPct: number) {
  const totalPct = proteinPct + fatPct + carbPct
  if (totalPct > 1e-6) {
    return {
      proteinPct: proteinPct / totalPct,
      fatPct: fatPct / totalPct,
      carbPct: carbPct / totalPct,
    }
  }
  return { proteinPct: 0.3, fatPct: 0.3, carbPct: 0.4 }
}

function normalizeMacroSplit(input?: DailyTargetInput['macroSplit'] | null) {
  if (!input || typeof input !== 'object') return null
  const protein = Number(input.proteinPct)
  const carbs = Number(input.carbPct)
  const fat = Number(input.fatPct)
  const hasAny = [protein, carbs, fat].some((v) => Number.isFinite(v) && v > 0)
  if (!hasAny) return null
  return normalizeSplit(
    Number.isFinite(protein) ? protein : 0,
    Number.isFinite(fat) ? fat : 0,
    Number.isFinite(carbs) ? carbs : 0,
  )
}

function parseConditionsFromGoals(goals?: string[] | null): string[] {
  if (!Array.isArray(goals) || goals.length === 0) return []
  const blob = goals.join(' ').toLowerCase()
  const conditions: string[] = []
  const add = (tag: string) => {
    if (!conditions.includes(tag)) conditions.push(tag)
  }
  if (blob.includes('diab')) add('diabetes')
  if (blob.includes('pcos')) add('pcos')
  if (blob.includes('cholesterol') || blob.includes('lipid')) add('cholesterol')
  if (blob.includes('hypertension') || blob.includes('blood pressure')) add('hypertension')
  if (blob.includes('heart') || blob.includes('cardio')) add('cardio')
  if (blob.includes('ibs')) add('ibs')
  if (blob.includes('constipation')) add('constipation')
  if (blob.includes('ulcer')) add('ulcer')
  if (blob.includes('gerd') || blob.includes('reflux')) add('reflux')
  if (blob.includes('acid') && blob.includes('reflux')) add('reflux')
  return conditions
}

function parseConditionsFromDiabetes(diabetesType?: DailyTargetInput['diabetesType']): string[] {
  const type = (diabetesType || '').toLowerCase()
  if (type === 'type1') return ['diabetes_type1']
  if (type === 'type2') return ['diabetes_type2']
  if (type === 'prediabetes') return ['prediabetes']
  return []
}

function applyConditionAdjustments(
  split: { proteinPct: number; fatPct: number; carbPct: number },
  conditions: string[],
): { proteinPct: number; fatPct: number; carbPct: number; fiberTarget: number; sugarCap: number } {
  let { proteinPct, fatPct, carbPct } = split
  let fiberTarget = 28
  let sugarCap = 35

  if (conditions.includes('diabetes') || conditions.includes('pcos') || conditions.includes('diabetes_type1') || conditions.includes('diabetes_type2')) {
    carbPct = Math.max(0.25, carbPct - 0.05)
    proteinPct = Math.min(0.4, proteinPct + 0.03)
    sugarCap = 25
    fiberTarget = 32
  }
  if (conditions.includes('diabetes_type1')) {
    carbPct = Math.max(0.23, carbPct - 0.02)
    sugarCap = Math.min(sugarCap, 22)
    fiberTarget = Math.max(fiberTarget, 34)
  }
  if (conditions.includes('diabetes_type2')) {
    carbPct = Math.max(0.22, carbPct - 0.03)
    sugarCap = Math.min(sugarCap, 20)
    fiberTarget = Math.max(fiberTarget, 34)
  }
  if (conditions.includes('prediabetes')) {
    carbPct = Math.max(0.26, carbPct - 0.03)
    sugarCap = Math.min(sugarCap, 28)
    fiberTarget = Math.max(fiberTarget, 30)
  }
  if (conditions.includes('ibs')) {
    fiberTarget = 30
  }
  if (conditions.includes('cholesterol') || conditions.includes('cardio') || conditions.includes('hypertension')) {
    fatPct = Math.max(0.25, fatPct - 0.02)
    carbPct = Math.min(0.45, carbPct + 0.02)
  }

  if (conditions.includes('constipation')) {
    fiberTarget = Math.max(fiberTarget, 32)
  }

  if (conditions.includes('ulcer') || conditions.includes('reflux')) {
    // Gentle tweak: avoid very high fat splits; keep carbs moderate
    fatPct = Math.min(fatPct, 0.32)
    carbPct = Math.min(Math.max(carbPct, 0.35), 0.45)
  }

  const normalized = normalizeSplit(proteinPct, fatPct, carbPct)

  return { ...normalized, fiberTarget, sugarCap }
}

function applyBodyTypeAdjustments(
  split: { proteinPct: number; fatPct: number; carbPct: number },
  bodyType?: string | null,
) {
  const type = (bodyType || '').toLowerCase()
  let proteinPct = split.proteinPct
  let fatPct = split.fatPct
  let carbPct = split.carbPct
  let calorieFactor = 1
  let fiberBonus = 0

  if (type.startsWith('ecto')) {
    // Slightly higher carbs and calories to support weight gain/maintenance
    carbPct += 0.02
    fatPct -= 0.01
    calorieFactor = 1.05
  } else if (type.startsWith('endo')) {
    // Slightly higher protein, moderate carbs, gentle calorie reduction
    proteinPct += 0.02
    carbPct -= 0.03
    fatPct += 0.01
    calorieFactor = 0.95
  } else if (type.startsWith('meso')) {
    fiberBonus = 1 // subtle nudge
  }

  const normalized = normalizeSplit(proteinPct, fatPct, carbPct)
  return { ...normalized, calorieFactor, fiberBonus }
}

type DietMacroRule = {
  carbsMaxG?: number
  sugarMaxG?: number
  proteinMinGPerKg?: number
  split?: { proteinPct: number; fatPct: number; carbPct: number }
}

const DIET_MACRO_RULES: Record<string, DietMacroRule> = {
  keto: { carbsMaxG: 30, sugarMaxG: 25, split: { proteinPct: 0.25, fatPct: 0.7, carbPct: 0.05 } },
  'keto-carnivore': { carbsMaxG: 20, sugarMaxG: 15, split: { proteinPct: 0.25, fatPct: 0.7, carbPct: 0.05 } },
  'low-carb': { carbsMaxG: 130 },
  atkins: { carbsMaxG: 40, sugarMaxG: 30 },
  'zero-carb': { carbsMaxG: 10, sugarMaxG: 5, split: { proteinPct: 0.3, fatPct: 0.7, carbPct: 0.0 } },
  carnivore: { carbsMaxG: 10, sugarMaxG: 5, split: { proteinPct: 0.3, fatPct: 0.7, carbPct: 0.0 } },
  lion: { carbsMaxG: 10, sugarMaxG: 5, split: { proteinPct: 0.3, fatPct: 0.7, carbPct: 0.0 } },
  diabetic: { carbsMaxG: 160, sugarMaxG: 25 },
  'high-protein': { proteinMinGPerKg: 1.6 },
  bodybuilding: { proteinMinGPerKg: 1.8 },
}

export function applyDietMacroRules(
  base: DailyTargets,
  dietTypesRaw: any,
  weightKg?: number | null,
): DailyTargets {
  const dietTypes = normalizeDietTypes(dietTypesRaw)
  if (!dietTypes.length) return base

  const rules = dietTypes.map((d) => DIET_MACRO_RULES[d]).filter(Boolean) as DietMacroRule[]
  if (!rules.length) return base

  const calories = base.calories
  if (!calories || calories <= 0) return base

  const carbsMaxG = rules.reduce<number | null>((min, r) => {
    if (typeof r.carbsMaxG !== 'number') return min
    return min === null ? r.carbsMaxG : Math.min(min, r.carbsMaxG)
  }, null)

  const sugarMaxG = rules.reduce<number | null>((min, r) => {
    if (typeof r.sugarMaxG !== 'number') return min
    return min === null ? r.sugarMaxG : Math.min(min, r.sugarMaxG)
  }, null)

  const proteinMinGPerKg = rules.reduce<number | null>((max, r) => {
    if (typeof r.proteinMinGPerKg !== 'number') return max
    return max === null ? r.proteinMinGPerKg : Math.max(max, r.proteinMinGPerKg)
  }, null)

  const splitRule = (() => {
    const priority = ['zero-carb', 'carnivore', 'lion', 'keto-carnivore', 'keto', 'atkins', 'low-carb', 'diabetic']
    for (const id of priority) {
      const rule = DIET_MACRO_RULES[id]
      if (rule?.split && dietTypes.includes(id)) return rule.split
    }
    return null
  })()

  let nextCarbs = typeof base.carbs === 'number' ? base.carbs : 0
  if (splitRule) {
    nextCarbs = Math.round((calories * splitRule.carbPct) / 4)
  }
  if (carbsMaxG !== null) nextCarbs = Math.min(nextCarbs, carbsMaxG)
  nextCarbs = Math.max(0, Math.round(nextCarbs))

  const minProtein = (() => {
    if (proteinMinGPerKg === null) return 0
    if (!weightKg || weightKg <= 0) return 0
    return Math.round(weightKg * proteinMinGPerKg)
  })()

  let nextProtein = typeof base.protein === 'number' ? base.protein : 0
  if (splitRule) {
    nextProtein = Math.round((calories * splitRule.proteinPct) / 4)
  }
  nextProtein = Math.max(nextProtein, minProtein)
  nextProtein = Math.max(0, Math.round(nextProtein))

  const adjustDownToFit = () => {
    const used = nextProtein * 4 + nextCarbs * 4
    const room = calories - used
    if (room >= 0) return

    const need = Math.abs(room)
    const reducibleCarbCals = nextCarbs * 4
    const carbCutCals = Math.min(reducibleCarbCals, need)
    nextCarbs = Math.max(0, Math.round((reducibleCarbCals - carbCutCals) / 4))
    const usedAfterCarb = nextProtein * 4 + nextCarbs * 4
    const roomAfterCarb = calories - usedAfterCarb
    if (roomAfterCarb >= 0) return

    const need2 = Math.abs(roomAfterCarb)
    const reducibleProteinG = Math.max(0, nextProtein - minProtein)
    const reducibleProteinCals = reducibleProteinG * 4
    const proteinCutCals = Math.min(reducibleProteinCals, need2)
    nextProtein = Math.max(minProtein, Math.round(nextProtein - proteinCutCals / 4))
  }
  adjustDownToFit()

  const remainingCalories = calories - (nextProtein * 4 + nextCarbs * 4)
  const nextFat = Math.max(0, Math.round(remainingCalories / 9))

  return {
    ...base,
    protein: nextProtein,
    carbs: nextCarbs,
    fat: nextFat,
    sugarMax:
      typeof base.sugarMax === 'number'
        ? Math.round(Math.min(base.sugarMax, sugarMaxG ?? base.sugarMax))
        : sugarMaxG,
  }
}

/**
 * Calculate daily calorie + macro targets using a simple, transparent approach:
 * - Mifflin–St Jeor BMR
 * - Activity multiplier from exercise frequency
 * - Light goal-based adjustment (weight loss / gain)
 */
export function calculateDailyTargets(input: DailyTargetInput): DailyTargets {
  const gender = (input.gender || '').toLowerCase()
  const weightKg = input.weightKg && input.weightKg > 0 ? input.weightKg : null
  const heightCm = input.heightCm && input.heightCm > 0 ? input.heightCm : null
  const age = calculateAge(input.birthdate)

  if (!weightKg || !heightCm || !age || (gender !== 'male' && gender !== 'female')) {
    // Not enough info – return nulls so the UI can show a friendly message instead of guessing.
    return { calories: null, protein: null, carbs: null, fat: null }
  }

  // Mifflin–St Jeor formula
  let bmr =
    10 * weightKg +
    6.25 * heightCm -
    5 * age +
    (gender === 'male' ? 5 : -161)

  if (!Number.isFinite(bmr) || bmr <= 0) {
    return { calories: null, protein: null, carbs: null, fat: null }
  }

  const activity = activityMultiplier(input.exerciseFrequency)
  const goalFactor = goalAdjustmentFactor(input.goalChoice, input.goalIntensity)
  const bodyTypeFactor = applyBodyTypeAdjustments({ proteinPct: 0, fatPct: 0, carbPct: 1 }, input.bodyType).calorieFactor

  // Include user-reported exercise durations to estimate extra daily burn
  const metMinutes = parseExerciseDurations(input.exerciseDurations, input.exerciseFrequency)
  const extraActivityKcal =
    weightKg && metMinutes > 0 ? (metMinutes * weightKg) / 200 : 0 // kcal/day

  const tdee = bmr * activity
  const rawTargetCalories = Math.round((tdee + extraActivityKcal) * goalFactor * bodyTypeFactor)
  const manualCalories = Number(input.calorieTarget)
  const targetCalories = clamp(
    Number.isFinite(manualCalories) && manualCalories > 0 ? Math.round(manualCalories) : rawTargetCalories,
    1200,
    4000,
  )

  const manualSplit = normalizeMacroSplit(input.macroSplit)
  const baseSplit = manualSplit ?? macroSplitForGoal(input.goalChoice)
  const conditions = Array.from(
    new Set([
      ...parseConditionsText(input.healthSituations),
      ...parseConditionsFromGoals(input.goals),
      ...parseConditionsFromDiabetes(input.diabetesType),
    ]),
  )
  const conditioned = applyConditionAdjustments(baseSplit, conditions)
  let proteinPct = baseSplit.proteinPct
  let fatPct = baseSplit.fatPct
  let carbPct = baseSplit.carbPct
  let fiberTarget = conditioned.fiberTarget
  let sugarCap = conditioned.sugarCap
  let fiberBonus = 0

  if (!manualSplit) {
    const bodyAdjusted = applyBodyTypeAdjustments(
      { proteinPct: conditioned.proteinPct, fatPct: conditioned.fatPct, carbPct: conditioned.carbPct },
      input.bodyType,
    )
    proteinPct = bodyAdjusted.proteinPct
    fatPct = bodyAdjusted.fatPct
    carbPct = bodyAdjusted.carbPct
    fiberBonus = bodyAdjusted.fiberBonus
  } else {
    const bodyAdjusted = applyBodyTypeAdjustments({ proteinPct, fatPct, carbPct }, input.bodyType)
    fiberBonus = bodyAdjusted.fiberBonus
  }

  const proteinCalories = targetCalories * proteinPct
  const carbCalories = targetCalories * carbPct
  const fatCalories = targetCalories * fatPct

  const protein = Math.round(proteinCalories / 4)
  const carbs = Math.round(carbCalories / 4)
  const fat = Math.round(fatCalories / 9)
  let fiber = Math.round(fiberTarget + fiberBonus)
  let sugarMax = Math.round(
    Math.min(
      sugarCap,
      targetCalories > 0 ? targetCalories * 0.12 / 4 : sugarCap // default to ~12% kcal cap if stricter
    )
  )
  const manualFiberRaw = input.fiberTarget
  if (manualFiberRaw !== null && manualFiberRaw !== undefined) {
    const manualFiber = Number(manualFiberRaw)
    if (Number.isFinite(manualFiber) && manualFiber >= 0) {
      fiber = Math.round(manualFiber)
    }
  }
  const manualSugarRaw = input.sugarMax
  if (manualSugarRaw !== null && manualSugarRaw !== undefined) {
    const manualSugar = Number(manualSugarRaw)
    if (Number.isFinite(manualSugar) && manualSugar >= 0) {
      sugarMax = Math.round(manualSugar)
    }
  }
  if (Number.isFinite(carbs) && carbs > 0) {
    sugarMax = Math.min(sugarMax, carbs)
  }

  const base: DailyTargets = {
    calories: targetCalories,
    protein,
    carbs,
    fat,
    fiber,
    sugarMax,
  }

  return applyDietMacroRules(base, input.dietTypes, weightKg)
}
