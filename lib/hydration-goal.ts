export type HydrationGoalInput = {
  weightKg: number | null
  heightCm: number | null
  gender?: string | null
  bodyType?: string | null
  exerciseFrequency?: string | null
  exerciseTypes?: string[] | null
  dietTypes?: string[] | null
  diabetesType?: string | null
  goalChoice?: string | null
  goalIntensity?: string | null
  birthdate?: string | null
}

export type HydrationGoalResult = {
  targetMl: number
  baselineMl: number
  adjustments: Record<string, number>
  inputHash: string
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const normalizeList = (value: string[] | null | undefined) =>
  Array.isArray(value)
    ? value
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    : []

const normalizeString = (value: string | null | undefined) => String(value || '').trim()

function calculateAgeYears(birthdate?: string | null): number | null {
  if (!birthdate) return null
  const [y, m, d] = birthdate.split('-').map((v) => parseInt(v, 10))
  if (!y || !m || !d) return null
  const today = new Date()
  let age = today.getFullYear() - y
  const monthDiff = today.getMonth() + 1 - m
  const dayDiff = today.getDate() - d
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1
  if (!Number.isFinite(age) || age <= 0 || age > 110) return null
  return age
}

function parseExerciseDays(value?: string | null): number {
  const raw = normalizeString(value).toLowerCase()
  if (!raw) return 0
  if (raw.includes('every')) return 7
  const match = raw.match(/(\d+)/)
  if (match) {
    const n = Number(match[1])
    if (Number.isFinite(n)) return clamp(n, 0, 7)
  }
  return 0
}

const HIGH_INTENSITY_EXERCISE_KEYWORDS = [
  'running',
  'hiit',
  'crossfit',
  'cycling',
  'spin',
  'swimming',
  'boxing',
  'soccer',
  'basketball',
  'rowing',
  'sprinting',
] as const

const DIET_GROUPS = {
  lowCarb: ['keto', 'keto-carnivore', 'low-carb', 'atkins', 'zero-carb', 'carnivore', 'lion'],
  highProtein: ['high-protein', 'bodybuilding', 'athlete', 'cutting-bulking'],
  plantBased: ['vegan', 'vegetarian', 'lacto-vegetarian', 'ovo-vegetarian', 'lacto-ovo-vegetarian', 'wfpb', 'raw-vegan'],
  fasting: ['intermittent-fasting', 'omad', 'time-restricted'],
  medicalCaution: ['renal'],
  diabetic: ['diabetic'],
} as const

const hasAnyDiet = (dietSet: Set<string>, ids: readonly string[]) =>
  ids.some((id) => dietSet.has(id))

export function computeHydrationGoal(input: HydrationGoalInput): HydrationGoalResult {
  const weightKg = Number.isFinite(input.weightKg || NaN) ? Number(input.weightKg) : null
  const heightCm = Number.isFinite(input.heightCm || NaN) ? Number(input.heightCm) : null
  const gender = normalizeString(input.gender).toUpperCase()
  const bodyType = normalizeString(input.bodyType).toUpperCase()
  const exerciseFrequency = normalizeString(input.exerciseFrequency)
  const exerciseTypes = normalizeList(input.exerciseTypes).map((v) => v.toLowerCase())
  const dietTypes = normalizeList(input.dietTypes).map((v) => v.toLowerCase())
  const diabetesType = normalizeString(input.diabetesType)
  const goalChoice = normalizeString(input.goalChoice).toLowerCase()
  const goalIntensity = normalizeString(input.goalIntensity).toLowerCase()
  const birthdate = normalizeString(input.birthdate)

  const dietSet = new Set(dietTypes)
  const ageYears = calculateAgeYears(birthdate)

  const baselineMl = weightKg ? Math.round(weightKg * 35) : (gender === 'MALE' ? 2600 : gender === 'FEMALE' ? 2100 : 2300)

  const adjustments: Record<string, number> = {}
  let totalAdjust = 0
  const add = (key: string, value: number) => {
    if (!value) return
    adjustments[key] = value
    totalAdjust += value
  }

  if (heightCm) {
    if (heightCm >= 185) add('height', 150)
    if (heightCm <= 160) add('height', -150)
  }

  if (weightKg && heightCm) {
    const heightM = heightCm / 100
    const bmi = weightKg / (heightM * heightM)
    if (bmi > 30) add('bmi', 150)
    if (bmi < 18.5) add('bmi', -150)
  }

  if (gender === 'MALE') add('gender', 200)
  if (gender === 'FEMALE') add('gender', 0)

  if (bodyType === 'ECTOMORPH') add('bodyType', 100)
  if (bodyType === 'ENDOMORPH') add('bodyType', -100)

  const exerciseDays = parseExerciseDays(exerciseFrequency)
  if (exerciseDays > 0) {
    add('exerciseFrequency', Math.min(900, exerciseDays * 120))
  }

  const highIntensity = exerciseTypes.some((type) =>
    HIGH_INTENSITY_EXERCISE_KEYWORDS.some((keyword) => type.includes(keyword))
  )
  if (highIntensity) add('exerciseIntensity', 200)

  if (hasAnyDiet(dietSet, DIET_GROUPS.lowCarb)) add('dietLowCarb', 300)
  if (hasAnyDiet(dietSet, DIET_GROUPS.highProtein)) add('dietHighProtein', 250)
  if (hasAnyDiet(dietSet, DIET_GROUPS.plantBased)) add('dietPlantBased', 200)
  if (hasAnyDiet(dietSet, DIET_GROUPS.fasting)) add('dietFasting', 150)
  if (hasAnyDiet(dietSet, DIET_GROUPS.medicalCaution)) add('dietMedical', -250)
  if (hasAnyDiet(dietSet, DIET_GROUPS.diabetic)) add('dietDiabetic', 150)

  if (diabetesType) add('diabetesType', 150)

  if (goalChoice.includes('gain') || goalChoice.includes('bulk')) add('goalChoice', 200)
  if (goalChoice.includes('shred')) add('goalChoice', 150)
  if (goalChoice.includes('lose')) add('goalChoice', -100)

  if (goalIntensity === 'aggressive') add('goalIntensity', 100)
  if (goalIntensity === 'mild') add('goalIntensity', -50)

  if (ageYears != null) {
    if (ageYears >= 55) add('age', -150)
    if (ageYears < 25) add('age', 100)
  }

  const targetRaw = baselineMl + totalAdjust
  const targetMl = Math.round(clamp(targetRaw, 1500, 5500) / 50) * 50

  const inputHash = JSON.stringify({
    weightKg: weightKg ? Math.round(weightKg * 10) / 10 : null,
    heightCm: heightCm ? Math.round(heightCm) : null,
    gender,
    bodyType,
    exerciseFrequency: exerciseFrequency.toLowerCase(),
    exerciseTypes: exerciseTypes.sort(),
    dietTypes: dietTypes.sort(),
    diabetesType: diabetesType.toLowerCase(),
    goalChoice,
    goalIntensity,
    birthdate,
  })

  return {
    targetMl,
    baselineMl,
    adjustments,
    inputHash,
  }
}
