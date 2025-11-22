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
  healthSituations?: {
    healthIssues?: string
    healthProblems?: string
    additionalInfo?: string
  } | null
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

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
  const level = intensity || 'standard'
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

function applyConditionAdjustments(
  split: { proteinPct: number; fatPct: number; carbPct: number },
  conditions: string[],
): { proteinPct: number; fatPct: number; carbPct: number; fiberTarget: number; sugarCap: number } {
  let { proteinPct, fatPct, carbPct } = split
  let fiberTarget = 28
  let sugarCap = 35

  if (conditions.includes('diabetes') || conditions.includes('pcos')) {
    carbPct = Math.max(0.25, carbPct - 0.05)
    proteinPct = Math.min(0.4, proteinPct + 0.03)
    sugarCap = 25
    fiberTarget = 32
  }
  if (conditions.includes('ibs')) {
    fiberTarget = 30
  }
  if (conditions.includes('cholesterol') || conditions.includes('cardio') || conditions.includes('hypertension')) {
    fatPct = Math.max(0.25, fatPct - 0.02)
    carbPct = Math.min(0.45, carbPct + 0.02)
  }

  const totalPct = proteinPct + fatPct + carbPct
  if (totalPct > 1e-6) {
    proteinPct = proteinPct / totalPct
    fatPct = fatPct / totalPct
    carbPct = carbPct / totalPct
  }

  return { proteinPct, fatPct, carbPct, fiberTarget, sugarCap }
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

  // Include user-reported exercise durations to estimate extra daily burn
  const metMinutes = parseExerciseDurations(input.exerciseDurations, input.exerciseFrequency)
  const extraActivityKcal =
    weightKg && metMinutes > 0 ? (metMinutes * weightKg) / 200 : 0 // kcal/day

  const tdee = bmr * activity
  const targetCalories = clamp(Math.round((tdee + extraActivityKcal) * goalFactor), 1200, 4000)

  const baseSplit = macroSplitForGoal(input.goalChoice)
  const conditions = parseConditionsText(input.healthSituations)
  const { proteinPct, fatPct, carbPct, fiberTarget, sugarCap } = applyConditionAdjustments(baseSplit, conditions)

  const proteinCalories = targetCalories * proteinPct
  const carbCalories = targetCalories * carbPct
  const fatCalories = targetCalories * fatPct

  const protein = Math.round(proteinCalories / 4)
  const carbs = Math.round(carbCalories / 4)
  const fat = Math.round(fatCalories / 9)
  const fiber = Math.round(fiberTarget)
  const sugarMax = Math.round(
    Math.min(
      sugarCap,
      targetCalories > 0 ? targetCalories * 0.12 / 4 : sugarCap // default to ~12% kcal cap if stricter
    )
  )

  return {
    calories: targetCalories,
    protein,
    carbs,
    fat,
    fiber,
    sugarMax,
  }
}
