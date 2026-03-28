'use client'

import { useEffect, useMemo, useState } from 'react'

import { DAIRY_SEMI_SOLID_MEASUREMENTS } from '@/lib/food/dairy-semi-solid-measurements'
import { DRY_FOOD_MEASUREMENTS } from '@/lib/food/dry-food-measurements'
import { PRODUCE_MEASUREMENTS } from '@/lib/food/produce-measurements'

type RecommendedItem = {
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

type BuilderUnit =
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
  | 'piece'
  | 'piece-small'
  | 'piece-medium'
  | 'piece-large'
  | 'piece-extra-large'
  | 'egg-small'
  | 'egg-medium'
  | 'egg-large'
  | 'egg-extra-large'
  | 'serving'

type FoodUnitGrams = Partial<Record<BuilderUnit, number>>

type FoodAlias = {
  tokens: string[]
  entryIndex: number
  score: number
}

type CountSizeHint = 'small' | 'medium' | 'large' | 'extra-large'

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const round3 = (n: number) => Math.round(n * 1000) / 1000

const macroOrZero = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0)

const formatNumber = (value: number | null | undefined, decimals = 0) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value))
}

const formatDecimal = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0'
  const normalized = round3(value)
  if (Number.isInteger(normalized)) return String(normalized)
  return normalized.toFixed(3).replace(/\.?0+$/, '')
}

const UNIT_GRAMS: Record<BuilderUnit, number> = {
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
  piece: 100,
  'piece-small': 100,
  'piece-medium': 100,
  'piece-large': 100,
  'piece-extra-large': 100,
  'egg-small': 38,
  'egg-medium': 44,
  'egg-large': 50,
  'egg-extra-large': 56,
  serving: 100,
}

const DISPLAY_UNITS: BuilderUnit[] = [
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
  'piece-extra-large',
]

const EGG_UNITS: BuilderUnit[] = ['egg-small', 'egg-medium', 'egg-large', 'egg-extra-large']

const EGG_UNIT_GRAMS: FoodUnitGrams = {
  'egg-small': UNIT_GRAMS['egg-small'],
  'egg-medium': UNIT_GRAMS['egg-medium'],
  'egg-large': UNIT_GRAMS['egg-large'],
  'egg-extra-large': UNIT_GRAMS['egg-extra-large'],
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

const normalizeFoodValue = (value: string) => {
  let normalized = String(value || '').toLowerCase().replace(/&/g, ' and ')
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
    (lower.endsWith('ches') ||
      lower.endsWith('shes') ||
      lower.endsWith('xes') ||
      lower.endsWith('zes') ||
      lower.endsWith('ses') ||
      lower.endsWith('oes')) &&
    value.length > 4
  ) {
    return value.slice(0, -2)
  }
  if (lower.endsWith('s') && value.length > 3 && !lower.endsWith('ss') && !lower.endsWith('us')) {
    return value.slice(0, -1)
  }
  return value
}

const tokenizeFoodValue = (value: string) =>
  normalizeFoodValue(value)
    .split(' ')
    .map((token) => singularizeToken(token))
    .filter(Boolean)

const detectCountSizeHint = (raw: string | null | undefined): CountSizeHint | null => {
  const normalized = normalizeFoodValue(String(raw || ''))
  if (!normalized) return null
  if (/\b(extra large|xl|jumbo)\b/.test(normalized)) return 'extra-large'
  if (/\bsmall\b/.test(normalized)) return 'small'
  if (/\bmedium\b/.test(normalized)) return 'medium'
  if (/\blarge\b/.test(normalized)) return 'large'
  return null
}

const eggUnitFromSizeHint = (hint: CountSizeHint | null): BuilderUnit => {
  if (hint === 'small') return 'egg-small'
  if (hint === 'medium') return 'egg-medium'
  if (hint === 'extra-large') return 'egg-extra-large'
  return 'egg-large'
}

const pieceUnitFromSizeHint = (hint: CountSizeHint | null): BuilderUnit => {
  if (hint === 'small') return 'piece-small'
  if (hint === 'large') return 'piece-large'
  if (hint === 'extra-large') return 'piece-extra-large'
  return 'piece-medium'
}

const isEggFood = (name: string | null | undefined) => {
  const tokens = tokenizeFoodValue(String(name || '').trim())
  if (!tokens.includes('egg')) return false
  return tokens.every((token) => !EGG_BLOCKLIST.has(token))
}

const buildFoodAliases = (entries: Array<{ food: string }>) => {
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
    const modifiers = modifierChunks.flatMap((chunk) =>
      chunk
        .split(/\/|,|\bor\b/gi)
        .map((part) => part.trim())
        .filter(Boolean),
    )

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
) => {
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

const buildDryFoodUnitGrams = (entry: (typeof DRY_FOOD_MEASUREMENTS)[number]): FoodUnitGrams => ({
  pinch: entry.pinch_g,
  tsp: entry.tsp_g,
  tbsp: entry.tbsp_g,
  'quarter-cup': entry.quarter_cup_g,
  'half-cup': entry.half_cup_g,
  'three-quarter-cup': entry.three_quarter_cup_g,
  cup: entry.cup_g,
})

const buildDairySemiSolidUnitGrams = (entry: (typeof DAIRY_SEMI_SOLID_MEASUREMENTS)[number]): FoodUnitGrams => ({
  tsp: entry.tsp_g,
  tbsp: entry.tbsp_g,
  'quarter-cup': entry.quarter_cup_g,
  'half-cup': entry.half_cup_g,
  'three-quarter-cup': entry.three_quarter_cup_g,
  cup: entry.cup_g,
})

const toUnitValue = (value: number | null) => (Number.isFinite(Number(value)) ? Number(value) : undefined)

const buildProduceUnitGrams = (entry: (typeof PRODUCE_MEASUREMENTS)[number]): FoodUnitGrams => {
  const small = toUnitValue(entry.piece_small_g)
  const medium = toUnitValue(entry.piece_medium_g)
  const large = toUnitValue(entry.piece_large_g)
  let extraLarge: number | null = null
  if (Number.isFinite(Number(large)) && Number.isFinite(Number(medium)) && Number(large) > 0 && Number(medium) > 0) {
    extraLarge = Number(large) + (Number(large) - Number(medium))
  } else if (Number.isFinite(Number(large)) && Number.isFinite(Number(small)) && Number(large) > 0 && Number(small) > 0) {
    extraLarge = Number(large) + (Number(large) - Number(small)) / 2
  }
  return {
    'quarter-cup': toUnitValue(entry.quarter_cup_raw_g),
    'half-cup': toUnitValue(entry.half_cup_raw_g),
    'three-quarter-cup': toUnitValue(entry.three_quarter_cup_raw_g),
    cup: toUnitValue(entry.raw_cup_g),
    'piece-small': small,
    'piece-medium': medium,
    'piece-large': large,
    'piece-extra-large': toUnitValue(extraLarge),
  }
}

const DRY_FOOD_ALIASES = buildFoodAliases(DRY_FOOD_MEASUREMENTS)
const DRY_FOOD_LOOKUP_CACHE = new Map<string, FoodUnitGrams | null>()
const DAIRY_SEMI_SOLID_ALIASES = buildFoodAliases(DAIRY_SEMI_SOLID_MEASUREMENTS)
const DAIRY_SEMI_SOLID_LOOKUP_CACHE = new Map<string, FoodUnitGrams | null>()
const PRODUCE_ALIASES = buildFoodAliases(PRODUCE_MEASUREMENTS)
const PRODUCE_LOOKUP_CACHE = new Map<string, FoodUnitGrams | null>()

const getDryFoodUnitGrams = (name: string | null | undefined) =>
  resolveFoodUnitGrams(name, DRY_FOOD_MEASUREMENTS, DRY_FOOD_ALIASES, DRY_FOOD_LOOKUP_CACHE, buildDryFoodUnitGrams)

const getDairySemiSolidUnitGrams = (name: string | null | undefined) =>
  resolveFoodUnitGrams(
    name,
    DAIRY_SEMI_SOLID_MEASUREMENTS,
    DAIRY_SEMI_SOLID_ALIASES,
    DAIRY_SEMI_SOLID_LOOKUP_CACHE,
    buildDairySemiSolidUnitGrams,
  )

const getProduceUnitGrams = (name: string | null | undefined) =>
  resolveFoodUnitGrams(name, PRODUCE_MEASUREMENTS, PRODUCE_ALIASES, PRODUCE_LOOKUP_CACHE, buildProduceUnitGrams)

const getFoodUnitGrams = (name: string | null | undefined): FoodUnitGrams | null =>
  (isEggFood(name) ? EGG_UNIT_GRAMS : null) || getProduceUnitGrams(name) || getDairySemiSolidUnitGrams(name) || getDryFoodUnitGrams(name)

const parseFraction = (value: string) => {
  const match = String(value || '')
    .trim()
    .match(/^(\d+)\s*\/\s*(\d+)$/)
  if (!match) return null
  const top = Number(match[1])
  const bottom = Number(match[2])
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) return null
  return top / bottom
}

const parseServingBase = (servingSize: any): { amount: number | null; unit: BuilderUnit | null } => {
  const raw = String(servingSize || '').trim()
  if (!raw) return { amount: null, unit: null }
  const paren = raw.match(/\(([^)]*)\)/)
  const target = paren?.[1] ? paren[1] : raw

  const parseAmount = (value: string): number | null => {
    const trimmed = value.trim()
    const mixed = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
    if (mixed) {
      const whole = Number(mixed[1])
      const top = Number(mixed[2])
      const bottom = Number(mixed[3])
      if (Number.isFinite(whole) && Number.isFinite(top) && Number.isFinite(bottom) && bottom > 0) {
        return whole + top / bottom
      }
    }
    const fraction = parseFraction(trimmed)
    if (fraction !== null) return fraction
    const parsed = parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  const match = target.match(
    /(\d+(?:\.\d+)?(?:\s+\d+\s*\/\s*\d+)?|\d+\s*\/\s*\d+)\s*(g|grams?|ml|oz|ounces?|tsp|teaspoons?|tbsp|tablespoons?|cup|cups?|pinch|pinches|piece|pieces|serving|servings)/i,
  )
  if (!match) {
    const lower = target.toLowerCase()
    if (/\bpinch(es)?\b/.test(lower)) return { amount: 1, unit: 'pinch' }
    if (/\bpieces?\b/.test(lower)) return { amount: 1, unit: 'piece' }
    if (/\bservings?\b/.test(lower)) return { amount: 1, unit: 'serving' }
    const sizeHint = detectCountSizeHint(target)
    if (sizeHint) {
      if (isEggFood(raw)) return { amount: 1, unit: eggUnitFromSizeHint(sizeHint) }
      return { amount: 1, unit: pieceUnitFromSizeHint(sizeHint) }
    }
    return { amount: null, unit: null }
  }

  const amount = parseAmount(match[1])
  if (!amount || !Number.isFinite(amount) || amount <= 0) return { amount: null, unit: null }
  const unitRaw = String(match[2] || '').toLowerCase()
  if (unitRaw.startsWith('g')) return { amount, unit: 'g' }
  if (unitRaw.startsWith('ml')) return { amount, unit: 'ml' }
  if (unitRaw.startsWith('oz') || unitRaw.startsWith('ounce')) return { amount, unit: 'oz' }
  if (unitRaw.startsWith('tsp') || unitRaw.startsWith('teaspoon')) return { amount, unit: 'tsp' }
  if (unitRaw.startsWith('tbsp') || unitRaw.startsWith('tablespoon')) return { amount, unit: 'tbsp' }
  if (unitRaw.startsWith('pinch')) return { amount, unit: 'pinch' }
  if (unitRaw.startsWith('piece')) return { amount, unit: 'piece' }
  if (unitRaw.startsWith('serving')) return { amount, unit: 'serving' }
  if (unitRaw.startsWith('cup')) return { amount, unit: 'cup' }
  return { amount: null, unit: null }
}

const seedBaseServing = (base: { amount: number | null; unit: BuilderUnit | null }) => {
  if (base.amount && base.unit) return base
  return { amount: 1, unit: 'serving' as BuilderUnit }
}

const extractPieceGramsFromLabel = (label: string) => {
  const gramsMatch = String(label || '')
    .trim()
    .match(/\((\d+(?:\.\d+)?)\s*g\)/i)
  const grams = gramsMatch ? Number(gramsMatch[1]) : NaN
  if (Number.isFinite(grams) && grams > 0) return grams
  return null
}

const isLikelyLiquidItem = (nameRaw: string, servingRaw?: string | null) => {
  const label = `${String(nameRaw || '').toLowerCase()} ${String(servingRaw || '').toLowerCase()}`.trim()
  if (!label) return false
  const liquidHints = ['milk', 'juice', 'water', 'soda', 'drink', 'tea', 'coffee', 'broth', 'soup', 'oil', 'vinegar', 'smoothie']
  const solidHints = ['powder', 'mix', 'bar', 'granola', 'bread', 'cookie', 'chips', 'cracker']
  if (solidHints.some((hint) => label.includes(hint))) return false
  return liquidHints.some((hint) => label.includes(hint))
}

const resolveUnitGrams = (
  unit: BuilderUnit,
  baseAmount?: number | null,
  baseUnit?: BuilderUnit | null,
  pieceGrams?: number | null,
  foodUnitGrams?: FoodUnitGrams | null,
) => {
  const override = foodUnitGrams?.[unit]
  if (Number.isFinite(Number(override)) && Number(override) > 0) return Number(override)
  if (unit === 'piece' || unit === 'piece-small' || unit === 'piece-medium' || unit === 'piece-large' || unit === 'piece-extra-large') {
    if (pieceGrams && pieceGrams > 0) return pieceGrams
    return UNIT_GRAMS.piece
  }
  if (unit === 'serving' && baseAmount && baseUnit && Object.prototype.hasOwnProperty.call(UNIT_GRAMS, baseUnit)) {
    return baseAmount * UNIT_GRAMS[baseUnit]
  }
  return UNIT_GRAMS[unit]
}

const convertAmount = (
  amount: number,
  from: BuilderUnit,
  to: BuilderUnit,
  baseAmount?: number | null,
  baseUnit?: BuilderUnit | null,
  pieceGrams?: number | null,
  foodUnitGrams?: FoodUnitGrams | null,
) => {
  if (!Number.isFinite(amount) || from === to) return amount
  const fromGrams = resolveUnitGrams(from, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
  const toGrams = resolveUnitGrams(to, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
  if (!Number.isFinite(fromGrams) || !Number.isFinite(toGrams) || toGrams <= 0) return amount
  return (amount * fromGrams) / toGrams
}

const allowedUnitsForItem = (name: string, pieceGrams?: number | null) => {
  let units = [...DISPLAY_UNITS]
  if (isEggFood(name)) {
    const disallowed = new Set<BuilderUnit>([
      'ml',
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
      'piece-extra-large',
    ])
    units = units.filter((unit) => !disallowed.has(unit))
    return [...units, ...EGG_UNITS]
  }

  const produceUnits = getProduceUnitGrams(name)
  const hasPieceSmall = Number.isFinite(Number(produceUnits?.['piece-small'])) && Number(produceUnits?.['piece-small']) > 0
  const hasPieceMedium = Number.isFinite(Number(produceUnits?.['piece-medium'])) && Number(produceUnits?.['piece-medium']) > 0
  const hasPieceLarge = Number.isFinite(Number(produceUnits?.['piece-large'])) && Number(produceUnits?.['piece-large']) > 0
  const hasPieceExtraLarge =
    Number.isFinite(Number(produceUnits?.['piece-extra-large'])) && Number(produceUnits?.['piece-extra-large']) > 0

  if (produceUnits) units = units.filter((unit) => unit !== 'tsp' && unit !== 'tbsp' && unit !== 'pinch')
  if (hasPieceSmall || hasPieceMedium || hasPieceLarge) {
    units = units.filter((unit) => unit !== 'piece')
  } else if (!pieceGrams || pieceGrams <= 0) {
    units = units.filter((unit) => unit !== 'piece')
  }
  if (!hasPieceSmall) units = units.filter((unit) => unit !== 'piece-small')
  if (!hasPieceMedium) units = units.filter((unit) => unit !== 'piece-medium')
  if (!hasPieceLarge) units = units.filter((unit) => unit !== 'piece-large')
  if (!hasPieceExtraLarge) units = units.filter((unit) => unit !== 'piece-extra-large')
  return units
}

const formatUnitLabel = (unit: BuilderUnit, name: string, pieceGrams?: number | null) => {
  const foodUnitGrams = getFoodUnitGrams(name)
  const produceUnits = getProduceUnitGrams(name)
  const produceName = produceUnits ? normalizeFoodValue(name) : ''
  const unitValue = foodUnitGrams?.[unit]
  if (unit === 'g') return 'g'
  if (unit === 'ml') return 'ml'
  if (unit === 'oz') return 'oz'
  if (unit === 'tsp') return `tsp — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 5}g`
  if (unit === 'tbsp') return `tbsp — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 14}g`
  if (unit === 'quarter-cup') return `1/4 cup — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 54.5}g`
  if (unit === 'half-cup') return `1/2 cup — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 109}g`
  if (unit === 'three-quarter-cup') return `3/4 cup — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 163.5}g`
  if (unit === 'cup') return `cup — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 218}g`
  if (unit === 'pinch') return `pinch — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 0.3}g`
  if (unit === 'egg-small') return `small egg — ${Math.round((Number(unitValue) || UNIT_GRAMS['egg-small']) * 10) / 10}g`
  if (unit === 'egg-medium') return `medium egg — ${Math.round((Number(unitValue) || UNIT_GRAMS['egg-medium']) * 10) / 10}g`
  if (unit === 'egg-large') return `large egg — ${Math.round((Number(unitValue) || UNIT_GRAMS['egg-large']) * 10) / 10}g`
  if (unit === 'egg-extra-large') return `extra large egg — ${Math.round((Number(unitValue) || UNIT_GRAMS['egg-extra-large']) * 10) / 10}g`
  if (unit === 'piece') {
    if (pieceGrams && pieceGrams > 0) return `piece — ${Math.round(pieceGrams * 10) / 10}g`
    return 'piece'
  }
  if (unit === 'piece-small') return `${produceName ? `small ${produceName}` : 'small piece'} — ${Math.round((Number(unitValue) || UNIT_GRAMS['piece-small']) * 10) / 10}g`
  if (unit === 'piece-medium') return `${produceName ? `medium ${produceName}` : 'medium piece'} — ${Math.round((Number(unitValue) || UNIT_GRAMS['piece-medium']) * 10) / 10}g`
  if (unit === 'piece-large') return `${produceName ? `large ${produceName}` : 'large piece'} — ${Math.round((Number(unitValue) || UNIT_GRAMS['piece-large']) * 10) / 10}g`
  if (unit === 'piece-extra-large') return `${produceName ? `extra large ${produceName}` : 'extra large piece'} — ${Math.round((Number(unitValue) || UNIT_GRAMS['piece-extra-large']) * 10) / 10}g`
  return unit
}

const computeServingsFromAmount = (
  amount: number,
  unit: BuilderUnit | null,
  baseAmount: number | null,
  baseUnit: BuilderUnit | null,
  pieceGrams: number | null,
  name: string,
) => {
  if (!unit || !baseAmount || !baseUnit || !Number.isFinite(amount)) return Math.max(0, amount || 0)
  const foodUnitGrams = getFoodUnitGrams(name)
  const inBase = convertAmount(amount, unit, baseUnit, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
  const servings = baseAmount > 0 ? inBase / baseAmount : 0
  return round3(Math.max(0, servings))
}

export default function RecommendedIngredientCard({
  item,
  index,
  onServingsChange,
}: {
  item: RecommendedItem
  index: number
  onServingsChange: (index: number, next: number) => void
}) {
  const servings = useMemo(() => {
    const raw = Number(item?.servings ?? 1)
    return Number.isFinite(raw) ? clamp(raw, 0, 20) : 1
  }, [item?.servings])

  const servingSizeLabel = item.serving_size ? String(item.serving_size).trim() : '1 serving'
  const parsedBase = useMemo(() => {
    const seeded = seedBaseServing(parseServingBase(servingSizeLabel))
    const pieceGrams = extractPieceGramsFromLabel(servingSizeLabel)
    let baseAmount = seeded.amount
    let baseUnit = seeded.unit
    if (!isLikelyLiquidItem(item.name, servingSizeLabel) && baseAmount && baseUnit && (baseUnit === 'tsp' || baseUnit === 'tbsp' || baseUnit === 'cup')) {
      const converted = convertAmount(baseAmount, baseUnit, 'g', undefined, undefined, undefined, getFoodUnitGrams(item.name))
      baseAmount = Number.isFinite(converted) ? converted : baseAmount
      baseUnit = 'g'
    }
    if (baseUnit === 'serving') {
      const hint = detectCountSizeHint(servingSizeLabel)
      if (hint) baseUnit = isEggFood(item.name) ? eggUnitFromSizeHint(hint) : pieceUnitFromSizeHint(hint)
    }
    return {
      baseAmount,
      baseUnit,
      pieceGrams,
    }
  }, [item.name, servingSizeLabel])

  const units = useMemo(
    () => allowedUnitsForItem(item.name, parsedBase.pieceGrams),
    [item.name, parsedBase.pieceGrams],
  )

  const initialUnit = useMemo(
    () => (parsedBase.baseUnit && units.includes(parsedBase.baseUnit) ? parsedBase.baseUnit : units[0] || parsedBase.baseUnit || 'serving'),
    [parsedBase.baseUnit, units],
  )

  const amountFromServings = useMemo(() => {
    if (!parsedBase.baseAmount || !parsedBase.baseUnit || !initialUnit) return servings
    const totalBaseAmount = parsedBase.baseAmount * servings
    return convertAmount(
      totalBaseAmount,
      parsedBase.baseUnit,
      initialUnit,
      parsedBase.baseAmount,
      parsedBase.baseUnit,
      parsedBase.pieceGrams,
      getFoodUnitGrams(item.name),
    )
  }, [initialUnit, item.name, parsedBase.baseAmount, parsedBase.baseUnit, parsedBase.pieceGrams, servings])

  const [expanded, setExpanded] = useState(false)
  const [selectedUnit, setSelectedUnit] = useState<BuilderUnit>(initialUnit)
  const [amountInput, setAmountInput] = useState(() => formatDecimal(amountFromServings))
  const [amountFocused, setAmountFocused] = useState(false)

  useEffect(() => {
    setSelectedUnit(initialUnit)
  }, [initialUnit])

  useEffect(() => {
    if (amountFocused) return
    const nextAmount =
      parsedBase.baseAmount && parsedBase.baseUnit
        ? convertAmount(
            parsedBase.baseAmount * servings,
            parsedBase.baseUnit,
            selectedUnit,
            parsedBase.baseAmount,
            parsedBase.baseUnit,
            parsedBase.pieceGrams,
            getFoodUnitGrams(item.name),
          )
        : servings
    setAmountInput(formatDecimal(nextAmount))
  }, [
    amountFocused,
    item.name,
    parsedBase.baseAmount,
    parsedBase.baseUnit,
    parsedBase.pieceGrams,
    selectedUnit,
    servings,
  ])

  const totals = useMemo(
    () => ({
      calories: Math.round(macroOrZero(item.calories) * servings),
      protein_g: round3(macroOrZero(item.protein_g) * servings),
      carbs_g: round3(macroOrZero(item.carbs_g) * servings),
      fat_g: round3(macroOrZero(item.fat_g) * servings),
      fiber_g: round3(macroOrZero(item.fiber_g) * servings),
      sugar_g: round3(macroOrZero(item.sugar_g) * servings),
    }),
    [item.calories, item.carbs_g, item.fat_g, item.fiber_g, item.protein_g, item.sugar_g, servings],
  )

  const amountUnitLabel = selectedUnit || parsedBase.baseUnit || 'serving'
  const fullAmountLabel = parsedBase.baseAmount && parsedBase.baseUnit ? `${formatDecimal(Number(amountInput) || 0)} ${amountUnitLabel}` : formatDecimal(servings)

  const applyAmountChange = (raw: string, unit: BuilderUnit = selectedUnit) => {
    setAmountInput(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const nextServings = computeServingsFromAmount(
      parsed,
      unit,
      parsedBase.baseAmount,
      parsedBase.baseUnit,
      parsedBase.pieceGrams,
      item.name,
    )
    onServingsChange(index, nextServings)
  }

  const handleUnitChange = (nextUnit: BuilderUnit) => {
    const currentAmount = Number(amountInput)
    const safeCurrentAmount = Number.isFinite(currentAmount)
      ? currentAmount
      : parsedBase.baseAmount && parsedBase.baseUnit
        ? convertAmount(
            parsedBase.baseAmount * servings,
            parsedBase.baseUnit,
            selectedUnit,
            parsedBase.baseAmount,
            parsedBase.baseUnit,
            parsedBase.pieceGrams,
            getFoodUnitGrams(item.name),
          )
        : servings
    const converted = convertAmount(
      safeCurrentAmount,
      selectedUnit,
      nextUnit,
      parsedBase.baseAmount,
      parsedBase.baseUnit,
      parsedBase.pieceGrams,
      getFoodUnitGrams(item.name),
    )
    setSelectedUnit(nextUnit)
    setAmountInput(formatDecimal(converted))
    const nextServings = computeServingsFromAmount(
      converted,
      nextUnit,
      parsedBase.baseAmount,
      parsedBase.baseUnit,
      parsedBase.pieceGrams,
      item.name,
    )
    onServingsChange(index, nextServings)
  }

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-3 bg-white hover:bg-gray-50"
      >
        <div className="min-w-0 text-left">
          <div className="text-sm font-semibold text-gray-900 truncate">{item.name}</div>
          <div className="text-[11px] text-gray-500 truncate">
            {servingSizeLabel ? `Serving: ${servingSizeLabel}` : 'Serving: (unknown)'} • Amount (full recipe): {fullAmountLabel}
          </div>
        </div>
        <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 bg-white space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-700">Amount</div>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={amountInput}
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
                onChange={(e) => applyAmountChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-700">Serving size</div>
              <select
                value={selectedUnit}
                onChange={(e) => handleUnitChange(e.target.value as BuilderUnit)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {formatUnitLabel(unit, item.name, parsedBase.pieceGrams)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
              <span className="font-semibold text-gray-900">{formatNumber(totals.calories)}</span> kcal
            </div>
            <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
              <span className="font-semibold text-gray-900">{formatNumber(totals.protein_g, 1)}</span> g protein
            </div>
            <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
              <span className="font-semibold text-gray-900">{formatNumber(totals.carbs_g, 1)}</span> g carbs
            </div>
            <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
              <span className="font-semibold text-gray-900">{formatNumber(totals.fat_g, 1)}</span> g fat
            </div>
            <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
              <span className="font-semibold text-gray-900">{formatNumber(totals.fiber_g, 1)}</span> g fibre
            </div>
            <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
              <span className="font-semibold text-gray-900">{formatNumber(totals.sugar_g, 1)}</span> g sugar
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
