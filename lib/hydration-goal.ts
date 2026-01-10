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

const DIET_GROUPS = {
  lowCarb: ['keto', 'keto-carnivore', 'low-carb', 'atkins', 'zero-carb', 'carnivore', 'lion'],
  highProtein: ['high-protein', 'bodybuilding', 'athlete', 'cutting-bulking'],
  plantBased: ['vegan', 'vegetarian', 'lacto-vegetarian', 'ovo-vegetarian', 'lacto-ovo-vegetarian', 'wfpb', 'raw-vegan'],
  fasting: ['intermittent-fasting', 'omad', 'time-restricted'],
  medicalCaution: ['renal'],
} as const

const hasAnyDiet = (dietSet: Set<string>, ids: readonly string[]) =>
  ids.some((id) => dietSet.has(id))

export function computeHydrationGoal(input: HydrationGoalInput): HydrationGoalResult {
  const weightKg = Number.isFinite(input.weightKg || NaN) ? Number(input.weightKg) : null
  const heightCm = Number.isFinite(input.heightCm || NaN) ? Number(input.heightCm) : null
  const gender = normalizeString(input.gender).toUpperCase()
  const bodyType = normalizeString(input.bodyType).toUpperCase()
  const dietTypes = normalizeList(input.dietTypes).map((v) => v.toLowerCase())
  const goalChoice = normalizeString(input.goalChoice).toLowerCase()
  const goalIntensity = normalizeString(input.goalIntensity).toLowerCase()
  const birthdate = normalizeString(input.birthdate)

  const dietSet = new Set(dietTypes)
  const ageYears = calculateAgeYears(birthdate)

  const baselineMl = weightKg ? Math.round(weightKg * 30) : (gender === 'MALE' ? 2600 : gender === 'FEMALE' ? 2100 : 2300)

  const adjustments: Record<string, number> = {}
  let totalAdjust = 0
  const add = (key: string, value: number) => {
    if (!value) return
    adjustments[key] = value
    totalAdjust += value
  }

  if (heightCm) {
    if (heightCm >= 180) add('height', 150)
    if (heightCm <= 160) add('height', -150)
  }

  if (gender === 'MALE') add('gender', 200)

  if (hasAnyDiet(dietSet, DIET_GROUPS.lowCarb)) add('dietLowCarb', 200)
  if (hasAnyDiet(dietSet, DIET_GROUPS.highProtein)) add('dietHighProtein', 150)
  if (hasAnyDiet(dietSet, DIET_GROUPS.plantBased)) add('dietPlantBased', 100)
  if (hasAnyDiet(dietSet, DIET_GROUPS.fasting)) add('dietFasting', 100)
  if (hasAnyDiet(dietSet, DIET_GROUPS.medicalCaution)) add('dietMedical', -200)

  if (goalChoice.includes('gain') || goalChoice.includes('bulk')) add('goalChoice', 200)
  if (goalChoice.includes('shred') || goalChoice.includes('cut')) add('goalChoice', -100)
  if (goalChoice.includes('lose')) add('goalChoice', -150)

  if (goalIntensity === 'aggressive') add('goalIntensity', 100)
  if (goalIntensity === 'mild') add('goalIntensity', -50)

  if (ageYears != null && ageYears >= 55) add('age', -100)

  const targetRaw = baselineMl + totalAdjust
  const targetMl = Math.round(clamp(targetRaw, 1800, 4000) / 50) * 50

  const inputHash = JSON.stringify({
    weightKg: weightKg ? Math.round(weightKg * 10) / 10 : null,
    heightCm: heightCm ? Math.round(heightCm) : null,
    gender,
    bodyType,
    dietTypes: dietTypes.sort(),
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
