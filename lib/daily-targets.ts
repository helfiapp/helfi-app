export type DailyTargets = {
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
}

export type DailyTargetInput = {
  gender?: string | null
  birthdate?: string | null
  weightKg?: number | null
  heightCm?: number | null
  exerciseFrequency?: string | null
  goals?: string[] | null
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

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

function goalAdjustmentFactor(goals?: string[] | null): number {
  if (!goals || goals.length === 0) return 1
  const lower = goals.map((g) => g.toLowerCase())
  const wantsWeightLoss = lower.some(
    (g) =>
      g.includes('weight loss') ||
      g.includes('lose weight') ||
      g.includes('fat loss') ||
      g.includes('reduce weight'),
  )
  const wantsMuscleGain = lower.some(
    (g) => g.includes('muscle') || g.includes('gain weight') || g.includes('build'),
  )

  if (wantsWeightLoss && !wantsMuscleGain) {
    return 0.85 // ~15% deficit
  }
  if (wantsMuscleGain && !wantsWeightLoss) {
    return 1.05 // small surplus
  }
  return 1 // mixed/maintenance
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
  const goalFactor = goalAdjustmentFactor(input.goals)

  const tdee = bmr * activity
  const targetCalories = clamp(Math.round(tdee * goalFactor), 1200, 4000)

  // Simple macro split for now: 25% protein, 45% carbs, 30% fat.
  const proteinCalories = targetCalories * 0.25
  const carbCalories = targetCalories * 0.45
  const fatCalories = targetCalories * 0.3

  const protein = Math.round(proteinCalories / 4)
  const carbs = Math.round(carbCalories / 4)
  const fat = Math.round(fatCalories / 9)

  return {
    calories: targetCalories,
    protein,
    carbs,
    fat,
  }
}


