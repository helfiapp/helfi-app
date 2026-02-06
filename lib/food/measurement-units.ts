import { PRODUCE_MEASUREMENTS } from '@/lib/food/produce-measurements'
import { DRY_FOOD_MEASUREMENTS } from '@/lib/food/dry-food-measurements'
import { DAIRY_SEMI_SOLID_MEASUREMENTS } from '@/lib/food/dairy-semi-solid-measurements'

export type MeasurementUnit =
  | 'g'
  | 'ml'
  | 'oz'
  | 'tsp'
  | 'tbsp'
  | 'quarter-cup'
  | 'half-cup'
  | 'three-quarter-cup'
  | 'cup'
  | 'pinch'
  | 'handful'
  | 'piece'
  | 'piece-small'
  | 'piece-medium'
  | 'piece-large'
  | 'egg-small'
  | 'egg-medium'
  | 'egg-large'
  | 'egg-extra-large'
  | 'slice'
  | 'serving'

export type FoodUnitGrams = Partial<Record<MeasurementUnit, number>>

export const DEFAULT_UNIT_GRAMS: Record<MeasurementUnit, number> = {
  g: 1,
  ml: 1,
  oz: 28.3495,
  tsp: 5,
  tbsp: 14,
  'quarter-cup': 218 / 4,
  'half-cup': 218 / 2,
  'three-quarter-cup': (218 * 3) / 4,
  cup: 218,
  pinch: 0.3,
  handful: 30,
  piece: 100,
  'piece-small': 100,
  'piece-medium': 100,
  'piece-large': 100,
  'egg-small': 38,
  'egg-medium': 44,
  'egg-large': 50,
  'egg-extra-large': 56,
  slice: 30,
  serving: 100,
}

export const DISPLAY_MEASUREMENT_UNITS: MeasurementUnit[] = [
  'g',
  'ml',
  'oz',
  'tsp',
  'tbsp',
  'quarter-cup',
  'half-cup',
  'three-quarter-cup',
  'cup',
  'pinch',
  'piece',
  'piece-small',
  'piece-medium',
  'piece-large',
]

const EGG_UNITS: MeasurementUnit[] = ['egg-small', 'egg-medium', 'egg-large', 'egg-extra-large']
const EGG_UNIT_GRAMS: FoodUnitGrams = {
  'egg-small': DEFAULT_UNIT_GRAMS['egg-small'],
  'egg-medium': DEFAULT_UNIT_GRAMS['egg-medium'],
  'egg-large': DEFAULT_UNIT_GRAMS['egg-large'],
  'egg-extra-large': DEFAULT_UNIT_GRAMS['egg-extra-large'],
}

const FOOD_VARIANT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\byoghurt\b/g, 'yogurt'],
  [/\bchilli\b/g, 'chili'],
  [/\baubergine\b/g, 'eggplant'],
  [/\bcourgette\b/g, 'zucchini'],
  [/\bcapsicum\b/g, 'bell pepper'],
  [/\bbeetroot\b/g, 'beet'],
  [/\bsweetcorn\b/g, 'corn'],
  [/\bgarbanzo\b/g, 'chickpea'],
  [/\bscallions?\b/g, 'spring onion'],
  [/\bgreen onions?\b/g, 'spring onion'],
  [/\brocket\b/g, 'arugula'],
  [/\bcoriander\b/g, 'cilantro'],
  [/\bicing sugar\b/g, 'powdered sugar'],
  [/\bconfectioners? sugar\b/g, 'powdered sugar'],
  [/\bsultanas?\b/g, 'raisins'],
]

const normalizeFoodValue = (value: string) => {
  let normalized = value.toLowerCase().replace(/&/g, ' and ')
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  FOOD_VARIANT_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement)
  })
  return normalized.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

const singularizeToken = (value: string) => {
  const lower = value.toLowerCase()
  if (lower.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`
  if (
    lower.endsWith('es') &&
    value.length > 3 &&
    !lower.endsWith('ses') &&
    !lower.endsWith('xes') &&
    !lower.endsWith('zes') &&
    !lower.endsWith('ches') &&
    !lower.endsWith('shes')
  ) {
    return value.slice(0, -2)
  }
  if (lower.endsWith('s') && value.length > 3 && !lower.endsWith('ss')) return value.slice(0, -1)
  return value
}

const tokenizeFoodValue = (value: string) =>
  normalizeFoodValue(value)
    .split(' ')
    .map((token) => singularizeToken(token))
    .filter(Boolean)

const EGG_BLOCKLIST = new Set([
  'white',
  'yolk',
  'eggplant',
  'nog',
  'noodle',
  'pasta',
  'salad',
  'sandwich',
  'wrap',
  'burrito',
  'taco',
  'pizza',
  'burger',
  'muffin',
  'bagel',
  'roll',
  'cake',
  'cookie',
  'pancake',
  'waffle',
  'rice',
  'protein',
  'powder',
  'substitute',
  'mix',
])

const isEggFood = (name: string | null | undefined) => {
  const tokens = tokenizeFoodValue(String(name || '').trim())
  if (!tokens.includes('egg')) return false
  return tokens.every((token) => !EGG_BLOCKLIST.has(token))
}

const splitFoodOptions = (value: string) =>
  value
    .split(/\/|,|\bor\b/gi)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

type FoodAlias = {
  tokens: string[]
  entryIndex: number
  score: number
}

const buildFoodAliases = (entries: Array<{ food: string }>): FoodAlias[] => {
  const aliases: FoodAlias[] = []
  const seen = new Set<string>()
  entries.forEach((entry, entryIndex) => {
    const raw = String(entry?.food || '').trim()
    if (!raw) return

    const modifierChunks: string[] = []
    const baseRaw = raw.replace(/\(([^)]*)\)/g, (_, inner) => {
      modifierChunks.push(inner)
      return ' '
    })
    const baseParts = baseRaw
      .split('/')
      .map((chunk) => chunk.trim())
      .filter(Boolean)
    const modifiers = modifierChunks.flatMap((chunk) => splitFoodOptions(chunk))

    const addAlias = (phrase: string, scoreBoost = 0) => {
      const tokens = tokenizeFoodValue(phrase)
      if (tokens.length === 0) return
      const key = `${entryIndex}:${tokens.join('|')}`
      if (seen.has(key)) return
      seen.add(key)
      aliases.push({ tokens, entryIndex, score: tokens.length + scoreBoost })
    }

    baseParts.forEach((base) => {
      addAlias(base)
      modifiers.forEach((modifier) => addAlias(`${base} ${modifier}`, 1))
    })
  })
  return aliases
}

const resolveFoodUnitGrams = (
  name: string | null | undefined,
  entries: Array<{ food: string }>,
  aliases: FoodAlias[],
  cache: Map<string, FoodUnitGrams | null>,
  buildUnitGrams: (entry: any) => FoodUnitGrams,
): FoodUnitGrams | null => {
  const normalized = normalizeFoodValue(String(name || '').trim())
  if (!normalized) return null
  if (cache.has(normalized)) return cache.get(normalized) || null
  const tokens = new Set(tokenizeFoodValue(normalized))
  let bestScore = 0
  let bestIndex = -1
  for (const alias of aliases) {
    if (!alias.tokens.every((token) => tokens.has(token))) continue
    if (alias.score > bestScore) {
      bestScore = alias.score
      bestIndex = alias.entryIndex
    }
  }
  const entry = bestIndex >= 0 ? entries[bestIndex] : null
  const result = entry ? buildUnitGrams(entry) : null
  cache.set(normalized, result)
  return result
}

const toUnitValue = (value: number | null) => (Number.isFinite(Number(value)) ? Number(value) : undefined)

const buildDryFoodUnitGrams = (entry: (typeof DRY_FOOD_MEASUREMENTS)[number]): FoodUnitGrams => ({
  pinch: entry.pinch_g,
  tsp: entry.tsp_g,
  tbsp: entry.tbsp_g,
  'quarter-cup': entry.quarter_cup_g,
  'half-cup': entry.half_cup_g,
  'three-quarter-cup': entry.three_quarter_cup_g,
  cup: entry.cup_g,
})

const buildDairySemiSolidUnitGrams = (
  entry: (typeof DAIRY_SEMI_SOLID_MEASUREMENTS)[number],
): FoodUnitGrams => ({
  tsp: entry.tsp_g,
  tbsp: entry.tbsp_g,
  'quarter-cup': entry.quarter_cup_g,
  'half-cup': entry.half_cup_g,
  'three-quarter-cup': entry.three_quarter_cup_g,
  cup: entry.cup_g,
})

const buildProduceUnitGrams = (entry: (typeof PRODUCE_MEASUREMENTS)[number]): FoodUnitGrams => ({
  'quarter-cup': toUnitValue(entry.quarter_cup_raw_g),
  'half-cup': toUnitValue(entry.half_cup_raw_g),
  'three-quarter-cup': toUnitValue(entry.three_quarter_cup_raw_g),
  cup: toUnitValue(entry.raw_cup_g),
  'piece-small': toUnitValue(entry.piece_small_g),
  'piece-medium': toUnitValue(entry.piece_medium_g),
  'piece-large': toUnitValue(entry.piece_large_g),
})

const DRY_FOOD_ALIASES = buildFoodAliases(DRY_FOOD_MEASUREMENTS)
const DRY_FOOD_LOOKUP_CACHE = new Map<string, FoodUnitGrams | null>()
const DAIRY_SEMI_SOLID_ALIASES = buildFoodAliases(DAIRY_SEMI_SOLID_MEASUREMENTS)
const DAIRY_SEMI_SOLID_LOOKUP_CACHE = new Map<string, FoodUnitGrams | null>()
const PRODUCE_ALIASES = buildFoodAliases(PRODUCE_MEASUREMENTS)
const PRODUCE_LOOKUP_CACHE = new Map<string, FoodUnitGrams | null>()

export const getDryFoodUnitGrams = (name: string | null | undefined): FoodUnitGrams | null =>
  resolveFoodUnitGrams(name, DRY_FOOD_MEASUREMENTS, DRY_FOOD_ALIASES, DRY_FOOD_LOOKUP_CACHE, buildDryFoodUnitGrams)

export const getDairySemiSolidUnitGrams = (name: string | null | undefined): FoodUnitGrams | null =>
  resolveFoodUnitGrams(
    name,
    DAIRY_SEMI_SOLID_MEASUREMENTS,
    DAIRY_SEMI_SOLID_ALIASES,
    DAIRY_SEMI_SOLID_LOOKUP_CACHE,
    buildDairySemiSolidUnitGrams,
  )

export const getProduceUnitGrams = (name: string | null | undefined): FoodUnitGrams | null =>
  resolveFoodUnitGrams(name, PRODUCE_MEASUREMENTS, PRODUCE_ALIASES, PRODUCE_LOOKUP_CACHE, buildProduceUnitGrams)

export const getFoodUnitGrams = (name: string | null | undefined): FoodUnitGrams | null =>
  (isEggFood(name) ? EGG_UNIT_GRAMS : null) ||
  getProduceUnitGrams(name) ||
  getDairySemiSolidUnitGrams(name) ||
  getDryFoodUnitGrams(name)

export const getAllowedUnitsForFood = (
  name: string | null | undefined,
  pieceGrams?: number | null,
): MeasurementUnit[] => {
  let units: MeasurementUnit[] = [...DISPLAY_MEASUREMENT_UNITS]
  if (isEggFood(name)) {
    const disallowed = new Set<MeasurementUnit>([
      'ml',
      'tsp',
      'tbsp',
      'quarter-cup',
      'half-cup',
      'three-quarter-cup',
      'cup',
      'pinch',
      'handful',
      'piece',
      'piece-small',
      'piece-medium',
      'piece-large',
    ])
    units = units.filter((unit) => !disallowed.has(unit) && !EGG_UNITS.includes(unit))
    return [...units, ...EGG_UNITS]
  }
  const produceUnits = name ? getProduceUnitGrams(name) : null
  const isProduce = Boolean(produceUnits)
  if (isProduce) units = units.filter((unit) => unit !== 'tsp' && unit !== 'tbsp' && unit !== 'pinch')
  const hasPieceSmall = Number.isFinite(Number(produceUnits?.['piece-small'])) && Number(produceUnits?.['piece-small']) > 0
  const hasPieceMedium = Number.isFinite(Number(produceUnits?.['piece-medium'])) && Number(produceUnits?.['piece-medium']) > 0
  const hasPieceLarge = Number.isFinite(Number(produceUnits?.['piece-large'])) && Number(produceUnits?.['piece-large']) > 0
  if (hasPieceSmall || hasPieceMedium || hasPieceLarge) {
    units = units.filter((unit) => unit !== 'piece')
  } else if (!pieceGrams || pieceGrams <= 0) {
    units = units.filter((unit) => unit !== 'piece')
  }
  if (!hasPieceSmall) units = units.filter((unit) => unit !== 'piece-small')
  if (!hasPieceMedium) units = units.filter((unit) => unit !== 'piece-medium')
  if (!hasPieceLarge) units = units.filter((unit) => unit !== 'piece-large')
  return units
}

export const formatUnitLabel = (unit: MeasurementUnit, name?: string | null, pieceGrams?: number | null) => {
  const foodUnitGrams = name ? getFoodUnitGrams(name) : null
  const unitValue = foodUnitGrams?.[unit]
  if (unit === 'g') return 'g'
  if (unit === 'ml') return 'ml'
  if (unit === 'oz') return 'oz'
  if (unit === 'tsp') return `tsp — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : 5}g`
  if (unit === 'tbsp') return `tbsp — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : 14}g`
  if (unit === 'quarter-cup') return `1/4 cup — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : 54.5}g`
  if (unit === 'half-cup') return `1/2 cup — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : 109}g`
  if (unit === 'three-quarter-cup') return `3/4 cup — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : 163.5}g`
  if (unit === 'cup') return `cup — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : 218}g`
  if (unit === 'pinch') return `pinch — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : 0.3}g`
  if (unit === 'egg-small') {
    const grams = Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : DEFAULT_UNIT_GRAMS['egg-small']
    return `small egg — ${Math.round(grams * 10) / 10}g`
  }
  if (unit === 'egg-medium') {
    const grams = Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : DEFAULT_UNIT_GRAMS['egg-medium']
    return `medium egg — ${Math.round(grams * 10) / 10}g`
  }
  if (unit === 'egg-large') {
    const grams = Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : DEFAULT_UNIT_GRAMS['egg-large']
    return `large egg — ${Math.round(grams * 10) / 10}g`
  }
  if (unit === 'egg-extra-large') {
    const grams =
      Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : DEFAULT_UNIT_GRAMS['egg-extra-large']
    return `extra large egg — ${Math.round(grams * 10) / 10}g`
  }
  if (unit === 'piece') {
    if (pieceGrams && pieceGrams > 0) return `piece — ${Math.round(pieceGrams * 10) / 10}g`
    return 'piece'
  }
  if (unit === 'piece-small') {
    const grams = Number(unitValue)
    return Number.isFinite(grams) && grams > 0 ? `small piece — ${Math.round(grams * 10) / 10}g` : 'small piece'
  }
  if (unit === 'piece-medium') {
    const grams = Number(unitValue)
    return Number.isFinite(grams) && grams > 0 ? `medium piece — ${Math.round(grams * 10) / 10}g` : 'medium piece'
  }
  if (unit === 'piece-large') {
    const grams = Number(unitValue)
    return Number.isFinite(grams) && grams > 0 ? `large piece — ${Math.round(grams * 10) / 10}g` : 'large piece'
  }
  return unit
}

export const resolveUnitGrams = (
  unit: MeasurementUnit,
  baseAmount?: number | null,
  baseUnit?: MeasurementUnit | null,
  pieceGrams?: number | null,
  foodUnitGrams?: FoodUnitGrams | null,
) => {
  const foodOverride = foodUnitGrams?.[unit]
  if (Number.isFinite(Number(foodOverride)) && Number(foodOverride) > 0) return Number(foodOverride)
  if (unit === 'piece' || unit === 'piece-small' || unit === 'piece-medium' || unit === 'piece-large') {
    if (pieceGrams && pieceGrams > 0) return pieceGrams
    return DEFAULT_UNIT_GRAMS.piece
  }
  if (
    (unit === 'serving' || unit === 'slice' || unit === 'handful') &&
    baseAmount &&
    baseUnit &&
    Object.prototype.hasOwnProperty.call(DEFAULT_UNIT_GRAMS, baseUnit)
  ) {
    return baseAmount * DEFAULT_UNIT_GRAMS[baseUnit]
  }
  return DEFAULT_UNIT_GRAMS[unit]
}

export const convertAmount = (
  amount: number,
  from: MeasurementUnit,
  to: MeasurementUnit,
  baseAmount?: number | null,
  baseUnit?: MeasurementUnit | null,
  pieceGrams?: number | null,
  foodUnitGrams?: FoodUnitGrams | null,
) => {
  if (!Number.isFinite(amount)) return amount
  if (from === to) return amount
  const fromGrams = resolveUnitGrams(from, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
  const toGrams = resolveUnitGrams(to, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
  if (!Number.isFinite(fromGrams) || !Number.isFinite(toGrams) || toGrams <= 0) return amount
  const grams = amount * fromGrams
  return grams / toGrams
}
