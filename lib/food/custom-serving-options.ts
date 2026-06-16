import {
  DEFAULT_UNIT_GRAMS,
  formatUnitLabel,
  getFoodUnitGrams,
  type MeasurementUnit,
} from './measurement-units'

export type CustomServingOption = {
  id: string
  label: string
  serving_size: string
  grams?: number | null
  ml?: number | null
  unit?: 'g' | 'ml' | 'oz'
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
  source: 'custom'
}

export type CustomServingBasis = {
  name: string
  kind?: string | null
  caloriesPer100g?: number | null
  proteinPer100g?: number | null
  carbsPer100g?: number | null
  fatPer100g?: number | null
  fiberPer100g?: number | null
  sugarPer100g?: number | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
}

const round1 = (value: number) => Math.round(value * 10) / 10
const roundCalories = (value: number) => Math.round(value)

const toNumberOrNull = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const normalizeText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const hasCoreMacros = (basis: CustomServingBasis) =>
  toNumberOrNull(basis.caloriesPer100g ?? basis.calories) != null &&
  toNumberOrNull(basis.proteinPer100g ?? basis.protein_g) != null &&
  toNumberOrNull(basis.carbsPer100g ?? basis.carbs_g) != null &&
  toNumberOrNull(basis.fatPer100g ?? basis.fat_g) != null

const LIQUID_WORDS = new Set([
  'water',
  'milk',
  'juice',
  'coffee',
  'tea',
  'soda',
  'drink',
  'smoothie',
  'shake',
  'broth',
  'stock',
  'oil',
  'vinegar',
  'sauce',
])

const POWDER_OR_SOLID_HINTS = new Set([
  'powder',
  'flour',
  'meal',
  'bread',
  'toast',
  'cracker',
  'chips',
  'bar',
  'seed',
  'seeds',
  'nuts',
  'nut',
])

const isLiquidFood = (name: string) => {
  const tokens = normalizeText(name).split(' ').filter(Boolean)
  if (tokens.some((token) => POWDER_OR_SOLID_HINTS.has(token))) return false
  return tokens.some((token) => LIQUID_WORDS.has(token))
}

const SPECIAL_COUNT_GRAMS: Array<{ pattern: RegExp; unit: string; grams: number; label: string }> = [
  { pattern: /\b(sourdough|toast|bread)\b/, unit: 'slice', grams: 35, label: 'slice' },
  { pattern: /\b(bacon)\b/, unit: 'slice', grams: 12, label: 'slice' },
  { pattern: /\b(cheese)\b/, unit: 'slice', grams: 28, label: 'slice' },
]

const createScaledOption = (
  basis: CustomServingBasis,
  id: string,
  label: string,
  grams: number | null,
  ml: number | null,
  unit?: 'g' | 'ml' | 'oz',
): CustomServingOption | null => {
  const calories = toNumberOrNull(basis.caloriesPer100g ?? basis.calories)
  const protein = toNumberOrNull(basis.proteinPer100g ?? basis.protein_g)
  const carbs = toNumberOrNull(basis.carbsPer100g ?? basis.carbs_g)
  const fat = toNumberOrNull(basis.fatPer100g ?? basis.fat_g)
  const fiber = toNumberOrNull(basis.fiberPer100g ?? basis.fiber_g)
  const sugar = toNumberOrNull(basis.sugarPer100g ?? basis.sugar_g)
  const amount = grams ?? ml
  if (calories == null || protein == null || carbs == null || fat == null) return null
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return null

  const factor = Number(amount) / 100
  return {
    id,
    label,
    serving_size: label,
    grams,
    ml,
    unit,
    calories: roundCalories(calories * factor),
    protein_g: round1(protein * factor),
    carbs_g: round1(carbs * factor),
    fat_g: round1(fat * factor),
    fiber_g: fiber == null ? null : round1(fiber * factor),
    sugar_g: sugar == null ? null : round1(sugar * factor),
    source: 'custom',
  }
}

const addOption = (
  options: CustomServingOption[],
  basis: CustomServingBasis,
  id: string,
  label: string,
  grams: number | null,
  ml: number | null,
  unit?: 'g' | 'ml' | 'oz',
) => {
  const next = createScaledOption(basis, id, label, grams, ml, unit)
  if (!next) return
  const key = `${normalizeText(label)}|${grams ?? ''}|${ml ?? ''}`
  const existing = options.some((option) => `${normalizeText(option.label)}|${option.grams ?? ''}|${option.ml ?? ''}` === key)
  if (!existing) options.push(next)
}

export const buildCustomFoodServingOptions = (basis: CustomServingBasis): CustomServingOption[] => {
  const name = String(basis.name || '').trim()
  const kind = String(basis.kind || 'SINGLE').toUpperCase()
  if (!name || kind !== 'SINGLE' || !hasCoreMacros(basis)) return []

  const options: CustomServingOption[] = []
  const liquid = isLiquidFood(name)

  if (liquid) {
    addOption(options, basis, 'custom:100ml', '100 ml', null, 100, 'ml')
    addOption(options, basis, 'custom:cup', '1 cup (240 ml)', null, 240, 'ml')
    addOption(options, basis, 'custom:tbsp', '1 tbsp (15 ml)', null, 15, 'ml')
    return options
  }

  addOption(options, basis, 'custom:100g', '100 g', 100, null, 'g')
  addOption(options, basis, 'custom:1oz', '1 oz', DEFAULT_UNIT_GRAMS.oz, null, 'oz')

  const foodUnitGrams = getFoodUnitGrams(name)
  const countUnits: MeasurementUnit[] = [
    'egg-small',
    'egg-medium',
    'egg-large',
    'egg-extra-large',
    'piece-small',
    'piece-medium',
    'piece-large',
    'piece-extra-large',
  ]

  countUnits.forEach((unit) => {
    const grams = Number(foodUnitGrams?.[unit])
    if (!Number.isFinite(grams) || grams <= 0) return
    const label = formatUnitLabel(unit, name, grams)
    addOption(options, basis, `custom:${unit}`, label, grams, null, 'g')
  })

  const normalizedName = normalizeText(name)
  SPECIAL_COUNT_GRAMS.forEach((entry) => {
    if (!entry.pattern.test(normalizedName)) return
    addOption(options, basis, `custom:${entry.unit}`, `${entry.label} - ${entry.grams}g`, entry.grams, null, 'g')
  })

  const cupUnits: MeasurementUnit[] = ['half-cup', 'cup']
  cupUnits.forEach((unit) => {
    const grams = Number(foodUnitGrams?.[unit])
    if (!Number.isFinite(grams) || grams <= 0) return
    const label = formatUnitLabel(unit, name, grams)
    addOption(options, basis, `custom:${unit}`, label, grams, null, 'g')
  })

  return options
}
