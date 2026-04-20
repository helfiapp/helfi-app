import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { PRODUCE_MEASUREMENTS, type ProduceMeasurement } from '../data/produceMeasurements'
import type { MainStackParamList } from '../navigation/MainNavigator'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type SearchKind = 'packaged' | 'single'
type SearchSource = 'auto'
type DynamicSizeLookup = {
  unitGrams: FoodUnitGrams | null
  matchedItem: Partial<SearchFoodItem> | null
}

type SearchFoodItem = {
  id: string | number
  source?: string | null
  name: string
  brand?: string | null
  serving_size?: string | null
  servingOptions?: any[] | null
  selectedServingId?: string | null
  calories?: number | null
  calories_kcal?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
  unitGrams?: FoodUnitGrams | null
  __custom?: boolean
}

type AdjustUnit =
  | 'serving'
  | 'g'
  | 'ml'
  | 'oz'
  | 'piece'
  | 'piece-small'
  | 'piece-medium'
  | 'piece-large'
  | 'piece-extra-large'
  | 'egg-small'
  | 'egg-medium'
  | 'egg-large'
  | 'egg-extra-large'
  | 'tsp'
  | 'tbsp'
  | 'quarter-cup'
  | 'half-cup'
  | 'three-quarter-cup'
  | 'cup'
  | 'pinch'
type BaseServing = { amount: number; unit: 'g' | 'ml' | 'oz' } | null
type ServingOption = {
  id: string
  label?: string
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
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
  uncategorized: 'Other',
}
const CUSTOM_SINGLE_BRAND_DESCRIPTORS = new Set(['', 'chopped', 'cubed', 'diced', 'grated', 'sliced'])

function formatLocalDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizeMeal(raw: string | undefined | null) {
  const meal = String(raw || '').toLowerCase().trim()
  if (meal in MEAL_LABELS) return meal
  return 'uncategorized'
}

function mealLabel(meal: string) {
  return MEAL_LABELS[meal] || 'Other'
}

function numberOrZero(value: any) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return n
}

function safeNumber(value: any) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

function sameNumber(a: any, b: any) {
  if (a === null || a === undefined) return b === null || b === undefined
  if (b === null || b === undefined) return false
  return Number(a) === Number(b)
}

function is100gServing(label?: string | null) {
  return /\b100\s*g\b/i.test(String(label || ''))
}

function parseServingGrams(label?: string | null) {
  const raw = String(label || '').toLowerCase()
  const match = raw.match(/(\d+(?:\.\d+)?)\s*g\b/)
  if (!match) return null
  const grams = Number(match[1])
  return Number.isFinite(grams) ? grams : null
}

function roundTo(value: number, decimals = 2) {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

function formatAmount(value: number) {
  if (!Number.isFinite(value)) return '1'
  if (Math.abs(value - Math.round(value)) < 0.001) return String(Math.round(value))
  return String(roundTo(value, 2))
}

function parseServingBase(servingSize?: string | null): BaseServing {
  const raw = String(servingSize || '').toLowerCase()
  if (!raw.trim()) return null

  const gMatch = raw.match(/(\d+(?:\.\d+)?)\s*g\b/)
  if (gMatch) {
    const amount = Number(gMatch[1])
    if (Number.isFinite(amount) && amount > 0) return { amount, unit: 'g' }
  }

  const mlMatch = raw.match(/(\d+(?:\.\d+)?)\s*ml\b/)
  if (mlMatch) {
    const amount = Number(mlMatch[1])
    if (Number.isFinite(amount) && amount > 0) return { amount, unit: 'ml' }
  }

  const ozMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz\b/)
  if (ozMatch) {
    const amount = Number(ozMatch[1])
    if (Number.isFinite(amount) && amount > 0) return { amount, unit: 'oz' }
  }

  return null
}

type FoodUnitGrams = Partial<Record<AdjustUnit, number>>

const DISCRETE_COUNT_UNITS = new Set<AdjustUnit>([
  'piece',
  'piece-small',
  'piece-medium',
  'piece-large',
  'piece-extra-large',
  'egg-small',
  'egg-medium',
  'egg-large',
  'egg-extra-large',
])

function isDiscreteCountUnit(unit: AdjustUnit | null | undefined) {
  return !!unit && DISCRETE_COUNT_UNITS.has(unit)
}

const STATIC_UNIT_GRAMS: Record<AdjustUnit, number> = {
  serving: 100,
  g: 1,
  ml: 1,
  oz: 28.3495,
  piece: 100,
  'piece-small': 100,
  'piece-medium': 100,
  'piece-large': 100,
  'piece-extra-large': 100,
  'egg-small': 38,
  'egg-medium': 44,
  'egg-large': 50,
  'egg-extra-large': 56,
  tsp: 5,
  tbsp: 14,
  'quarter-cup': 54.5,
  'half-cup': 109,
  'three-quarter-cup': 163.5,
  cup: 218,
  pinch: 0.3,
}

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
  [/\bsultanas?\b/g, 'raisin'],
]

function normalizeFoodValue(value: string) {
  let normalized = String(value || '').toLowerCase().replace(/&/g, ' and ')
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  FOOD_VARIANT_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement)
  })
  return normalized.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function foodTokens(value: string) {
  return normalizeFoodValue(value)
    .split(' ')
    .filter(Boolean)
    .map((token) => singularizeToken(token))
}

function isEggFood(name: string | null | undefined) {
  const tokens = foodTokens(String(name || '').trim())
  if (!tokens.includes('egg')) return false
  return tokens.every((token) => !EGG_BLOCKLIST.has(token))
}

function safeNum(value: any) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return num
}

function explicitPieceExtraLarge(produce: { piece_extra_large_g?: number | null }) {
  return safeNum(produce?.piece_extra_large_g)
}

function producePieceLabel(unit: AdjustUnit, produceName: string) {
  if (unit === 'piece-small') return produceName ? `small ${produceName}` : 'small piece'
  if (unit === 'piece-medium') return produceName ? `medium ${produceName}` : 'medium piece'
  if (unit === 'piece-large') return produceName ? `large ${produceName}` : 'large piece'
  return produceName ? `extra large ${produceName}` : 'extra large piece'
}

type ProduceAlias = {
  tokens: string[]
  entryIndex: number
  score: number
}

function splitFoodOptions(value: string) {
  return String(value || '')
    .split(/\/|,|\bor\b/gi)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
}

function buildProduceAliases(entries: ProduceMeasurement[]) {
  const aliases: ProduceAlias[] = []
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
      const tokens = foodTokens(phrase)
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

const PRODUCE_ALIASES = buildProduceAliases(PRODUCE_MEASUREMENTS)
const PRODUCE_LOOKUP_CACHE = new Map<string, ProduceMeasurement | null>()

function findProduceMeasurement(name: string | null | undefined) {
  const normalized = normalizeFoodValue(String(name || '').trim())
  if (!normalized) return null
  if (PRODUCE_LOOKUP_CACHE.has(normalized)) return PRODUCE_LOOKUP_CACHE.get(normalized) || null

  const tokens = new Set(foodTokens(normalized))
  if (tokens.size === 0) {
    PRODUCE_LOOKUP_CACHE.set(normalized, null)
    return null
  }

  let bestIndex = -1
  let bestScore = 0

  for (const alias of PRODUCE_ALIASES) {
    if (!alias.tokens.every((token) => tokens.has(token))) continue
    if (alias.score > bestScore) {
      bestScore = alias.score
      bestIndex = alias.entryIndex
    }
  }

  const row = bestIndex >= 0 ? PRODUCE_MEASUREMENTS[bestIndex] || null : null
  PRODUCE_LOOKUP_CACHE.set(normalized, row)
  return row
}

function getFoodUnitGrams(name: string | null | undefined): FoodUnitGrams {
  const units: FoodUnitGrams = {}

  if (isEggFood(name)) {
    units['egg-small'] = 38
    units['egg-medium'] = 44
    units['egg-large'] = 50
    units['egg-extra-large'] = 56
    return units
  }

  const produce = findProduceMeasurement(name)
  if (!produce) return units

  const cup = safeNum((produce as any).raw_cup_g)
  const quarter = safeNum((produce as any).quarter_cup_raw_g)
  const half = safeNum((produce as any).half_cup_raw_g)
  const threeQuarter = safeNum((produce as any).three_quarter_cup_raw_g)
  const small = safeNum((produce as any).piece_small_g)
  const medium = safeNum((produce as any).piece_medium_g)
  const large = safeNum((produce as any).piece_large_g)
  const extraLarge = (() => {
    const explicit = explicitPieceExtraLarge(produce as any)
    if (explicit && explicit > 0) return explicit
    if (large && medium) return large + (large - medium)
    if (large && small) return large + (large - small) / 2
    return null
  })()

  if (quarter) units['quarter-cup'] = quarter
  if (half) units['half-cup'] = half
  if (threeQuarter) units['three-quarter-cup'] = threeQuarter
  if (cup) units.cup = cup
  if (small) units['piece-small'] = small
  if (medium) units['piece-medium'] = medium
  if (large) units['piece-large'] = large
  if (extraLarge && extraLarge > 0) units['piece-extra-large'] = extraLarge

  return units
}

function getProduceDisplayName(name: string | null | undefined) {
  const produce = findProduceMeasurement(name)
  const base = normalizeFoodValue(String(produce?.food || name || '')).trim()
  if (!base) return ''
  if (base.includes('garlic')) return 'clove'
  return base
}

function resolveUnitGrams(unit: AdjustUnit, foodUnitGrams: FoodUnitGrams) {
  const override = Number(foodUnitGrams?.[unit])
  if (Number.isFinite(override) && override > 0) return override
  return STATIC_UNIT_GRAMS[unit]
}

function hasServingOptionMacroData(option: ServingOption) {
  const calories = option?.calories
  const protein = option?.protein_g
  const carbs = option?.carbs_g
  const fat = option?.fat_g
  const hasCalories = calories !== null && calories !== undefined && Number.isFinite(Number(calories))
  const hasProtein = protein !== null && protein !== undefined && Number.isFinite(Number(protein))
  const hasCarbs = carbs !== null && carbs !== undefined && Number.isFinite(Number(carbs))
  const hasFat = fat !== null && fat !== undefined && Number.isFinite(Number(fat))
  return hasCalories && hasProtein && hasCarbs && hasFat
}

function normalizeServingOptionsForAdjust(raw: any): ServingOption[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((option) => {
      const id = String(option?.id || '').trim()
      if (!id) return null
      const label = typeof option?.label === 'string' ? option.label.trim() : ''
      const servingSize = typeof option?.serving_size === 'string' ? option.serving_size.trim() : ''
      const resolvedServingSize = (servingSize || label || '').trim()
      return {
        id,
        serving_size: resolvedServingSize,
        label: label || undefined,
        grams: safeNumber(option?.grams),
        ml: safeNumber(option?.ml),
        unit: option?.unit === 'ml' || option?.unit === 'g' || option?.unit === 'oz' ? option.unit : undefined,
        calories: safeNumber(option?.calories),
        protein_g: safeNumber(option?.protein_g),
        carbs_g: safeNumber(option?.carbs_g),
        fat_g: safeNumber(option?.fat_g),
        fiber_g: safeNumber(option?.fiber_g),
        sugar_g: safeNumber(option?.sugar_g),
      } as ServingOption
    })
    .filter((option): option is ServingOption => Boolean(option && option.id && (option.serving_size || option.label)))
    .filter((option) => hasServingOptionMacroData(option))
}

function pickDefaultServingOptionForAdjust(options: ServingOption[]) {
  if (!Array.isArray(options) || options.length === 0) return null
  const byPreference = (needle: string) =>
    options.find((option) => String(option?.label || option?.serving_size || '').toLowerCase().includes(needle))
  return byPreference('medium') || byPreference('regular') || byPreference('standard') || options[0] || null
}

function scoreServingOption(option: ServingOption) {
  const label = String(option?.label || option?.serving_size || '').toLowerCase()
  let score = 0
  if (label.includes('serving')) score += 4
  if (label.includes('piece') || label.includes('burger') || label.includes('sandwich') || label.includes('slice')) score += 3
  const grams = Number(option?.grams)
  if (Number.isFinite(grams)) {
    if (grams >= 40 && grams <= 400) score += 3
    if (grams === 100) score -= 6
  }
  if (is100gServing(label)) score -= 10
  return score
}

function pickBestServingOption(options: ServingOption[]) {
  if (!Array.isArray(options) || options.length === 0) return null
  const non100 = options.filter((option) => !is100gServing(option?.serving_size))
  const pool = non100.length > 0 ? non100 : options
  const sorted = [...pool].sort((a, b) => scoreServingOption(b) - scoreServingOption(a))
  return sorted[0] || null
}

function applyServingOptionToResult(item: SearchFoodItem, option: ServingOption): SearchFoodItem {
  return {
    ...item,
    serving_size: option.serving_size || item.serving_size,
    selectedServingId: option.id,
    calories: safeNumber(option.calories),
    protein_g: safeNumber(option.protein_g),
    carbs_g: safeNumber(option.carbs_g),
    fat_g: safeNumber(option.fat_g),
    fiber_g: safeNumber(option.fiber_g),
    sugar_g: safeNumber(option.sugar_g),
  }
}

function hasMeaningfulChange(before: SearchFoodItem, after: SearchFoodItem) {
  if (String(before.serving_size || '') !== String(after.serving_size || '')) return true
  if (!sameNumber(before.calories ?? before.calories_kcal, after.calories ?? after.calories_kcal)) return true
  if (!sameNumber(before.protein_g, after.protein_g)) return true
  if (!sameNumber(before.carbs_g, after.carbs_g)) return true
  if (!sameNumber(before.fat_g, after.fat_g)) return true
  if (!sameNumber(before.fiber_g, after.fiber_g)) return true
  if (!sameNumber(before.sugar_g, after.sugar_g)) return true
  return false
}

function convertBaseUnit(value: number, from: 'g' | 'ml' | 'oz', to: 'g' | 'ml' | 'oz') {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (from === to) return value

  if (from === 'g' && to === 'ml') return value
  if (from === 'ml' && to === 'g') return value
  if (from === 'oz' && to === 'g') return value * 28.3495
  if (from === 'g' && to === 'oz') return value / 28.3495
  if (from === 'oz' && to === 'ml') return value * 29.5735
  if (from === 'ml' && to === 'oz') return value / 29.5735

  return value
}

function amountInBaseUnit(amount: number, unit: AdjustUnit, base: BaseServing, foodUnitGrams: FoodUnitGrams) {
  if (!Number.isFinite(amount) || amount <= 0 || !base) return 0
  if (unit === 'serving') return amount * base.amount
  if (unit === base.unit) return amount

  if (STATIC_UNIT_GRAMS[unit]) {
    const grams = amount * resolveUnitGrams(unit, foodUnitGrams)
    return convertBaseUnit(grams, 'g', base.unit)
  }

  if (unit === 'g' || unit === 'ml' || unit === 'oz') {
    return convertBaseUnit(amount, unit, base.unit)
  }

  return amount
}

function amountFromBaseUnit(amount: number, unit: AdjustUnit, base: BaseServing, foodUnitGrams: FoodUnitGrams) {
  if (!Number.isFinite(amount) || amount <= 0 || !base) return 0
  if (unit === 'serving') return amount / base.amount
  if (unit === base.unit) return amount

  if (STATIC_UNIT_GRAMS[unit]) {
    const grams = convertBaseUnit(amount, base.unit, 'g')
    const perUnit = resolveUnitGrams(unit, foodUnitGrams)
    if (!Number.isFinite(grams) || !Number.isFinite(perUnit) || perUnit <= 0) return 0
    return grams / perUnit
  }

  if (unit === 'g' || unit === 'ml' || unit === 'oz') {
    return convertBaseUnit(amount, base.unit, unit)
  }

  return amount
}

function convertAmountBetweenUnits(amount: number, from: AdjustUnit, to: AdjustUnit, base: BaseServing, foodUnitGrams: FoodUnitGrams) {
  if (!Number.isFinite(amount)) return 0
  if (from === to) return amount
  if (!base || !Number.isFinite(base.amount) || base.amount <= 0) return amount
  const baseAmount = amountInBaseUnit(amount, from, base, foodUnitGrams)
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return 0
  return amountFromBaseUnit(baseAmount, to, base, foodUnitGrams)
}

function computeServings(amount: number, unit: AdjustUnit, base: BaseServing, foodUnitGrams: FoodUnitGrams) {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (unit === 'serving') return amount
  if (!base || !Number.isFinite(base.amount) || base.amount <= 0) return amount

  const converted = amountInBaseUnit(amount, unit, base, foodUnitGrams)
  if (!Number.isFinite(converted) || converted <= 0) return amount
  return converted / base.amount
}

function ingredientSourceLabel(item: SearchFoodItem) {
  if (item?.__custom || String(item?.id || '').startsWith('custom:')) return 'Custom list'
  if (item?.source === 'usda') return 'USDA'
  if (item?.source === 'openfoodfacts') return 'Open Food Facts'
  if (item?.source === 'fatsecret') return 'FatSecret'
  return 'Best match'
}

function defaultUnitOptions(
  base: BaseServing,
  foodName: string | null | undefined,
  foodUnitGramsOverride?: FoodUnitGrams | null,
): AdjustUnit[] {
  if (!base) return ['g', 'ml', 'oz']

  if (isEggFood(foodName)) {
    return ['g', 'oz', 'egg-small', 'egg-medium', 'egg-large', 'egg-extra-large']
  }

  const foodUnits = {
    ...getFoodUnitGrams(foodName),
    ...(foodUnitGramsOverride || {}),
  }
  const hasProducePieceUnits =
    (foodUnits['piece-small'] || 0) > 0 ||
    (foodUnits['piece-medium'] || 0) > 0 ||
    (foodUnits['piece-large'] || 0) > 0 ||
    (foodUnits['piece-extra-large'] || 0) > 0

  const baseUnits: AdjustUnit[] = ['g', 'ml', 'oz', 'tsp', 'tbsp', 'quarter-cup', 'half-cup', 'three-quarter-cup', 'cup', 'pinch']
  let units = [...baseUnits]

  if (hasProducePieceUnits) {
    units = units.filter((unit) => unit !== 'tsp' && unit !== 'tbsp' && unit !== 'pinch')
    if (foodUnits['piece-small']) units.push('piece-small')
    if (foodUnits['piece-medium']) units.push('piece-medium')
    if (foodUnits['piece-large']) units.push('piece-large')
    if (foodUnits['piece-extra-large']) units.push('piece-extra-large')
  }

  return units
}

function unitLabel(unit: AdjustUnit, foodName: string | null | undefined, foodUnitGrams: FoodUnitGrams) {
  const grams = roundTo(resolveUnitGrams(unit, foodUnitGrams), 1)
  if (unit === 'quarter-cup') return `1/4 cup — ${grams}g`
  if (unit === 'half-cup') return `1/2 cup — ${grams}g`
  if (unit === 'three-quarter-cup') return `3/4 cup — ${grams}g`
  if (unit === 'tsp') return `tsp — ${grams}g`
  if (unit === 'tbsp') return `tbsp — ${grams}g`
  if (unit === 'cup') return `cup — ${grams}g`
  if (unit === 'pinch') return `pinch — ${grams}g`
  if (unit === 'egg-small') return `small egg — ${grams}g`
  if (unit === 'egg-medium') return `medium egg — ${grams}g`
  if (unit === 'egg-large') return `large egg — ${grams}g`
  if (unit === 'egg-extra-large') return `extra large egg — ${grams}g`
  if (unit === 'piece') return `piece — ${grams}g`
  const produceName = getProduceDisplayName(foodName)
  if (unit === 'piece-small') return `${producePieceLabel(unit, produceName)} — ${grams}g`
  if (unit === 'piece-medium') return `${producePieceLabel(unit, produceName)} — ${grams}g`
  if (unit === 'piece-large') return `${producePieceLabel(unit, produceName)} — ${grams}g`
  if (unit === 'piece-extra-large') return `${producePieceLabel(unit, produceName)} — ${grams}g`
  return unit
}

function normalizeSearchToken(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeBrandToken(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

function singularizeToken(value: string) {
  const lower = String(value || '').toLowerCase()
  if (!lower) return lower
  if (lower.endsWith('ies') && lower.length > 4) return `${lower.slice(0, -3)}y`
  if (lower.endsWith('es') && lower.length > 3 && !lower.endsWith('ses') && !lower.endsWith('xes') && !lower.endsWith('zes')) {
    return lower.slice(0, -2)
  }
  if (lower.endsWith('s') && lower.length > 3 && !lower.endsWith('ss')) return lower.slice(0, -1)
  return lower
}

function getSearchTokens(value: string) {
  return normalizeSearchToken(value).split(' ').filter(Boolean)
}

function isCustomListItem(item: SearchFoodItem) {
  return Boolean(item?.__custom) || String(item?.id || '').startsWith('custom:') || item?.source === 'custom'
}

function nameMatchesQueryTokens(name: string, query: string) {
  const nameTokens = normalizeSearchToken(name).split(' ').filter(Boolean)
  const queryTokens = normalizeSearchToken(query).split(' ').filter(Boolean)
  if (queryTokens.length === 0 || nameTokens.length === 0) return false

  const firstWord = nameTokens[0] || ''
  const firstQuery = queryTokens[0] || ''
  if (!firstWord || !firstQuery) return false

  const firstWordSingular = singularizeToken(firstWord)
  const firstQuerySingular = singularizeToken(firstQuery)
  const firstWordMatches =
    firstWord.startsWith(firstQuery) ||
    firstWordSingular.startsWith(firstQuerySingular) ||
    firstWord === firstQuery ||
    firstWordSingular === firstQuerySingular

  if (!firstWordMatches) return false
  if (queryTokens.length === 1) return true

  const remaining = queryTokens.slice(1)
  return remaining.every((token) =>
    nameTokens.some((word) => {
      if (word.startsWith(token)) return true
      const singularWord = singularizeToken(word)
      const singularToken = singularizeToken(token)
      return singularWord.startsWith(singularToken)
    }),
  )
}

function filterItemsForQuery(
  items: SearchFoodItem[],
  searchQuery: string,
  kind: SearchKind,
  options?: { allowTypoFallback?: boolean },
) {
  if (!Array.isArray(items) || items.length === 0) return []

  if (kind === 'packaged') {
    const queryTokens = getSearchTokens(searchQuery).filter((token) => token.length >= 2)
    if (queryTokens.length > 0) {
      const looseMatches = items.filter((item) => {
        const combined = [item?.brand, item?.name].filter(Boolean).join(' ')
        const normalized = normalizeSearchToken(combined)
        return queryTokens.every((token) => normalized.includes(token))
      })
      if (looseMatches.length > 0) return looseMatches
    }
  }

  const prefixMatches = items.filter((item) => nameMatchesQueryTokens(String(item?.name || ''), searchQuery))
  if (prefixMatches.length > 0) return prefixMatches
  if (options?.allowTypoFallback === false) return []
  return items
}

function sortResultsAz(
  list: SearchFoodItem[],
  options?: { kind?: SearchKind; query?: string },
) {
  let filtered = Array.isArray(list) ? list : []
  if (options?.kind === 'single') {
    const normalizedQuery = normalizeSearchToken(options?.query || '')
    if (normalizedQuery.length > 0) {
      const strictMatches = filtered.filter((item) => nameMatchesQueryTokens(String(item?.name || ''), normalizedQuery))
      if (strictMatches.length > 0) filtered = strictMatches
    }
  }

  return [...filtered].sort((a, b) => {
    if (options?.kind === 'single') {
      const sourcePriority = (item: SearchFoodItem) => {
        if (isCustomListItem(item)) return 0
        if (item?.source === 'usda') return 1
        if (item?.source === 'fatsecret') return 2
        if (item?.source === 'openfoodfacts') return 3
        return 4
      }
      const bySource = sourcePriority(a) - sourcePriority(b)
      if (bySource !== 0) return bySource
    }
    const aName = String(a?.name || '').trim().toLowerCase()
    const bName = String(b?.name || '').trim().toLowerCase()
    const byName = aName.localeCompare(bName)
    if (byName !== 0) return byName
    const aBrand = String(a?.brand || '').trim().toLowerCase()
    const bBrand = String(b?.brand || '').trim().toLowerCase()
    const byBrand = aBrand.localeCompare(bBrand)
    if (byBrand !== 0) return byBrand
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
}

function buildSearchDisplay(item: SearchFoodItem, searchQuery: string) {
  const name = String(item?.name || 'Food').trim()
  const brand = String(item?.brand || '').trim()
  if (!brand) return { title: name, showBrandSuffix: false }
  const queryFirst = String(searchQuery || '').trim().split(/\s+/)[0] || ''
  const normalizedQuery = normalizeBrandToken(queryFirst)
  const normalizedBrand = normalizeBrandToken(brand)
  const normalizedName = normalizeBrandToken(name)
  if (normalizedQuery && normalizedBrand && normalizedQuery === normalizedBrand && !normalizedName.startsWith(normalizedBrand)) {
    return { title: `${brand} ${name}`.trim(), showBrandSuffix: false }
  }
  return { title: name, showBrandSuffix: true }
}

export function AddIngredientScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<RouteProp<MainStackParamList, 'AddIngredient'>>()
  const { mode, session } = useAppMode()

  const targetMeal = normalizeMeal(route.params?.meal)
  const selectedDate = String(route.params?.date || formatLocalDate())
  const categoryLabel = mealLabel(targetMeal)

  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return buildNativeAuthHeaders(session.token, { includeCookie: true })
  }, [mode, session?.token])

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<SearchKind>('packaged')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<SearchFoodItem[]>([])
  const [userCountry, setUserCountry] = useState('')
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null)
  const [creditsPercentUsed, setCreditsPercentUsed] = useState(0)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoPreviewUri, setPhotoPreviewUri] = useState<string | null>(null)
  const [missingReportOpen, setMissingReportOpen] = useState(false)
  const [missingReportName, setMissingReportName] = useState('')
  const [missingReportBrand, setMissingReportBrand] = useState('')
  const [missingReportSize, setMissingReportSize] = useState('')
  const [missingReportNotes, setMissingReportNotes] = useState('')
  const [missingReportBusy, setMissingReportBusy] = useState(false)
  const [missingReportDone, setMissingReportDone] = useState(false)
  const [missingReportError, setMissingReportError] = useState('')

  const [adjustItem, setAdjustItem] = useState<SearchFoodItem | null>(null)
  const [adjustAmountInput, setAdjustAmountInput] = useState('1')
  const [adjustUnit, setAdjustUnit] = useState<AdjustUnit>('g')
  const [adjustBase, setAdjustBase] = useState<BaseServing>(null)
  const [adjustSaving, setAdjustSaving] = useState(false)
  const [adjustOpeningId, setAdjustOpeningId] = useState<string | null>(null)
  const [adjustPickerMode, setAdjustPickerMode] = useState<'serving' | 'unit' | null>(null)
  const [adjustDropdownLayout, setAdjustDropdownLayout] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)
  const [adjustServingOptions, setAdjustServingOptions] = useState<ServingOption[]>([])
  const [adjustServingId, setAdjustServingId] = useState<string | null>(null)
  const servingOverrideCacheRef = useRef<Map<string, ServingOption>>(new Map())
  const servingOverridePendingRef = useRef<Set<string>>(new Set())
  const sizeUnitCacheRef = useRef<Map<string, DynamicSizeLookup>>(new Map())
  const sizeUnitPendingRef = useRef<Set<string>>(new Set())
  const adjustServingTriggerRef = useRef<any>(null)
  const adjustUnitTriggerRef = useRef<any>(null)

  const adjustFoodUnitGrams = useMemo(() => getFoodUnitGrams(adjustItem?.name || ''), [adjustItem?.name])
  const mergedAdjustUnitGrams = useMemo(
    () => ({ ...adjustFoodUnitGrams, ...(adjustItem?.unitGrams || {}) }),
    [adjustFoodUnitGrams, adjustItem?.unitGrams],
  )

  const requestIdRef = useRef(0)
  const displayedResults = useMemo(
    () => (kind === 'packaged' ? results : sortResultsAz(results, { kind, query })),
    [results, kind, query],
  )

  useEffect(() => {
    if (!authHeaders) return
    let cancelled = false

    const loadUserCountry = async () => {
      try {
        const [userRes, creditRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/user-data`, { headers: authHeaders }),
          session?.token
            ? fetch(`${API_BASE_URL}/api/credit/status`, {
                headers: buildNativeAuthHeaders(session.token, { includeCookie: true }),
              })
            : Promise.resolve(null as any),
        ])
        const data: any = await userRes.json().catch(() => ({}))
        if (cancelled) return
        const nextCountry = String(data?.country || '').trim().toUpperCase()
        setUserCountry(nextCountry)
        if (creditRes) {
          const creditData: any = await creditRes.json().catch(() => ({}))
          if (cancelled) return
          const total = Number(creditData?.credits?.total)
          const percent = Number(creditData?.percentUsed)
          setCreditsRemaining(Number.isFinite(total) ? Math.max(0, Math.round(total)) : null)
          setCreditsPercentUsed(Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0)
        }
      } catch {
        if (!cancelled) {
          setUserCountry('')
          setCreditsRemaining(null)
          setCreditsPercentUsed(0)
        }
      }
    }

    void loadUserCountry()
    return () => {
      cancelled = true
    }
  }, [authHeaders])

  const runSearch = async (
    queryOverride?: string,
    kindOverride?: SearchKind,
    sourceOverride?: SearchSource,
    options?: { silentEmpty?: boolean },
  ) => {
    const q = String(queryOverride ?? query).trim()
    const nextKind = kindOverride || kind
    const nextSource: SearchSource = sourceOverride || 'auto'

    if (!q) {
      setResults([])
      if (!options?.silentEmpty) setError('Please enter a food name to search.')
      return
    }
    if (!authHeaders) return

    const fetchItems = async (source: SearchSource) => {
      const countryParam = userCountry ? `&country=${encodeURIComponent(userCountry)}` : ''
      const res = await fetch(
        `${API_BASE_URL}/api/food-data?source=${source}&kind=${nextKind}&q=${encodeURIComponent(q)}&limit=20${countryParam}`,
        { headers: authHeaders },
      )
      const data: any = await res.json().catch(() => ({}))
      let items: SearchFoodItem[] = Array.isArray(data?.items) ? data.items : []
      if (nextKind === 'single') {
        items = items.filter((entry) => entry?.source === 'usda' || entry?.source === 'fatsecret' || isCustomListItem(entry))
      }
      return { ok: res.ok, items, error: typeof data?.error === 'string' ? data.error : '' }
    }

    const requestId = ++requestIdRef.current

    try {
      setLoading(true)
      setError('')

      const searchResult = await fetchItems(nextSource)
      if (requestId !== requestIdRef.current) return
      if (!searchResult.ok) {
        setResults([])
        setError(searchResult.error || 'Search failed. Please try again.')
        return
      }

      const hasToken = getSearchTokens(q).some((token) => token.length >= 1)
      const filtered = hasToken
        ? filterItemsForQuery(searchResult.items, q, nextKind, { allowTypoFallback: true })
        : searchResult.items
      const finalItems =
        nextKind === 'single' && filtered.length === 0 && searchResult.items.length > 0 ? searchResult.items : filtered

      setResults(finalItems)
      if (finalItems.length === 0) setError(searchResult.error || 'No results yet. Try a different search.')
    } catch {
      if (requestId !== requestIdRef.current) return
      setResults([])
      setError('Search failed. Please try again.')
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      requestIdRef.current += 1
      setLoading(false)
      setResults([])
      setError('')
      return
    }
    const timer = setTimeout(() => {
      void runSearch(q, kind, 'auto', { silentEmpty: true })
    }, 220)
    return () => clearTimeout(timer)
  }, [kind, query, userCountry])

  const loadServingOverride = async (item: SearchFoodItem): Promise<SearchFoodItem | null> => {
    if (!authHeaders) return null
    if (!item || item.source !== 'usda') return null
    if (!is100gServing(item.serving_size)) return null

    const key = `${String(item.source)}:${String(item.id)}`
    const cached = servingOverrideCacheRef.current.get(key)
    if (cached) return applyServingOptionToResult(item, cached)
    if (servingOverridePendingRef.current.has(key)) return null

    servingOverridePendingRef.current.add(key)
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/food-data/servings?source=${encodeURIComponent(String(item.source))}&id=${encodeURIComponent(String(item.id))}`,
        { headers: authHeaders },
      )
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) return null
      const options = normalizeServingOptionsForAdjust(data?.options)
      const best = pickBestServingOption(options)
      if (!best) return null
      servingOverrideCacheRef.current.set(key, best)
      const updated = applyServingOptionToResult(item, best)
      if (!hasMeaningfulChange(item, updated)) return null
      return updated
    } catch {
      return null
    } finally {
      servingOverridePendingRef.current.delete(key)
    }
  }

  const loadDynamicSizeLookup = async (item: SearchFoodItem): Promise<DynamicSizeLookup | null> => {
    if (!authHeaders) return null
    if (!item?.name) return null

    const key = `${String(item.source || 'auto')}:${String(item.id)}:${normalizeSearchToken(item.name)}`
    const cached = sizeUnitCacheRef.current.get(key)
    if (cached) return cached
    if (sizeUnitPendingRef.current.has(key)) return null

    sizeUnitPendingRef.current.add(key)
    try {
      const params = new URLSearchParams({
        name: String(item.name || ''),
        source: String(item.source || ''),
        id: String(item.id || ''),
      })
      const res = await fetch(`${API_BASE_URL}/api/food-data/size-units?${params.toString()}`, { headers: authHeaders })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) return null
      const raw = data?.unitGrams && typeof data.unitGrams === 'object' ? data.unitGrams : {}
      const unitGrams = Object.fromEntries(
        Object.entries(raw).filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0),
      ) as FoodUnitGrams
      const matchedItem =
        data?.matchedItem && typeof data.matchedItem === 'object'
          ? (data.matchedItem as Partial<SearchFoodItem>)
          : null
      const lookup = { unitGrams, matchedItem }
      sizeUnitCacheRef.current.set(key, lookup)
      return lookup
    } catch {
      return null
    } finally {
      sizeUnitPendingRef.current.delete(key)
    }
  }

  const openAdjust = async (item: SearchFoodItem) => {
    const itemKey = `${String(item.source || 'auto')}:${String(item.id)}`
    setAdjustOpeningId(itemKey)
    try {
      const upgraded = await loadServingOverride(item)
      const resolvedTarget = upgraded || item
      const resolvedServingOptions = normalizeServingOptionsForAdjust(resolvedTarget.servingOptions)
      const defaultServingOption = pickDefaultServingOptionForAdjust(resolvedServingOptions)
      const resolvedItem =
        defaultServingOption && hasServingOptionMacroData(defaultServingOption)
          ? applyServingOptionToResult(resolvedTarget, defaultServingOption)
          : resolvedTarget
      const sizeLookup = await loadDynamicSizeLookup(resolvedItem)
      const dynamicUnitGrams = sizeLookup?.unitGrams || null
      const customBrandKey = String(resolvedItem.brand || '').trim().toLowerCase()
      const shouldUseMatchedItem =
        resolvedItem.source === 'custom' &&
        !!sizeLookup?.matchedItem &&
        Object.keys(dynamicUnitGrams || {}).length > 0 &&
        CUSTOM_SINGLE_BRAND_DESCRIPTORS.has(customBrandKey)
      const authoritativeItem: SearchFoodItem = shouldUseMatchedItem
        ? {
            ...resolvedItem,
            source: String(sizeLookup?.matchedItem?.source || 'usda'),
            id: String(sizeLookup?.matchedItem?.id || resolvedItem.id),
            calories: safeNumber(sizeLookup?.matchedItem?.calories ?? resolvedItem.calories ?? resolvedItem.calories_kcal),
            calories_kcal: safeNumber(sizeLookup?.matchedItem?.calories ?? resolvedItem.calories ?? resolvedItem.calories_kcal),
            protein_g: safeNumber(sizeLookup?.matchedItem?.protein_g ?? resolvedItem.protein_g),
            carbs_g: safeNumber(sizeLookup?.matchedItem?.carbs_g ?? resolvedItem.carbs_g),
            fat_g: safeNumber(sizeLookup?.matchedItem?.fat_g ?? resolvedItem.fat_g),
            fiber_g: safeNumber(sizeLookup?.matchedItem?.fiber_g ?? resolvedItem.fiber_g),
            sugar_g: safeNumber(sizeLookup?.matchedItem?.sugar_g ?? resolvedItem.sugar_g),
          }
        : resolvedItem

      const caloriesRaw = Number(authoritativeItem.calories ?? authoritativeItem.calories_kcal)
      const proteinRaw = Number(authoritativeItem.protein_g)
      const carbsRaw = Number(authoritativeItem.carbs_g)
      const fatRaw = Number(authoritativeItem.fat_g)
      const hasCoreNutrition =
        Number.isFinite(caloriesRaw) &&
        Number.isFinite(proteinRaw) &&
        Number.isFinite(carbsRaw) &&
        Number.isFinite(fatRaw)

      if (!hasCoreNutrition) {
        Alert.alert('Cannot add this item', 'This result has missing nutrition data. Please pick another one.')
        return
      }

      const resolvedServingSize = String(authoritativeItem.serving_size || '100 g')
      const base = parseServingBase(resolvedServingSize) || (() => {
        const grams = parseServingGrams(resolvedServingSize)
        return grams && grams > 0 ? { amount: grams, unit: 'g' as const } : { amount: 100, unit: 'g' as const }
      })()

      setAdjustBase(base)
      setAdjustServingOptions(resolvedServingOptions)
      setAdjustServingId(defaultServingOption?.id || null)
      setAdjustItem({
        ...authoritativeItem,
        name: String(authoritativeItem.name || 'Food'),
        brand: authoritativeItem.brand ?? null,
        serving_size: resolvedServingSize,
        servingOptions: resolvedServingOptions.length > 0 ? resolvedServingOptions : null,
        selectedServingId: defaultServingOption?.id || null,
        calories: safeNumber(authoritativeItem.calories ?? authoritativeItem.calories_kcal),
        calories_kcal: safeNumber(authoritativeItem.calories ?? authoritativeItem.calories_kcal),
        protein_g: safeNumber(authoritativeItem.protein_g),
        carbs_g: safeNumber(authoritativeItem.carbs_g),
        fat_g: safeNumber(authoritativeItem.fat_g),
        fiber_g: safeNumber(authoritativeItem.fiber_g),
        sugar_g: safeNumber(authoritativeItem.sugar_g),
        unitGrams: dynamicUnitGrams,
      })

      const mergedUnitGrams = {
        ...getFoodUnitGrams(authoritativeItem?.name || ''),
        ...(dynamicUnitGrams || {}),
      }
      let units = defaultUnitOptions(base, authoritativeItem?.name || '', mergedUnitGrams)
      if (resolvedServingOptions.length > 0) {
        units = units.filter((unit) => unit === 'g' || unit === 'ml' || unit === 'oz')
        units = ['serving', ...units]
      }
      const nextUnit = resolvedServingOptions.length > 0 ? 'serving' : units[0] || 'g'
      setAdjustUnit(nextUnit)
      if (nextUnit === 'serving') {
        setAdjustAmountInput('1')
      } else if (base && nextUnit === base.unit) {
        setAdjustAmountInput(formatAmount(base.amount))
      } else {
        setAdjustAmountInput('1')
      }
      setAdjustPickerMode(null)
      setError('')
    } catch {
      Alert.alert('Could not open this item', 'Please try again.')
    } finally {
      setAdjustOpeningId(null)
    }
  }

  const resetAdjustState = () => {
    setAdjustServingOptions([])
    setAdjustServingId(null)
    setAdjustPickerMode(null)
    setAdjustDropdownLayout(null)
    setAdjustItem(null)
  }

  const addAdjustedItem = async () => {
    if (!adjustItem || !authHeaders || adjustSaving) return
    const amount = numberOrZero(adjustAmountInput)
    if (amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter an amount bigger than 0.')
      return
    }

    const servingsRaw = computeServings(amount, safeAdjustUnit, adjustBase, mergedAdjustUnitGrams)
    const servings = Number.isFinite(servingsRaw) && servingsRaw > 0 ? servingsRaw : 1

    const caloriesBase = numberOrZero(adjustItem.calories ?? adjustItem.calories_kcal)
    const proteinBase = numberOrZero(adjustItem.protein_g)
    const carbsBase = numberOrZero(adjustItem.carbs_g)
    const fatBase = numberOrZero(adjustItem.fat_g)
    const fiberBase = numberOrZero(adjustItem.fiber_g)
    const sugarBase = numberOrZero(adjustItem.sugar_g)

    const calories = Math.max(0, Math.round(caloriesBase * servings))
    const protein = Math.max(0, roundTo(proteinBase * servings, 2))
    const carbs = Math.max(0, roundTo(carbsBase * servings, 2))
    const fat = Math.max(0, roundTo(fatBase * servings, 2))
    const fiber = Math.max(0, roundTo(fiberBase * servings, 2))
    const sugar = Math.max(0, roundTo(sugarBase * servings, 2))

    const title = String(adjustItem.name || '').trim()
    const servingText = String(
      safeAdjustUnit === 'serving' ? selectedServingLabel : adjustItem.serving_size || '1 serving',
    ).trim()
    const detail = `${servingText}${adjustItem.brand ? ` • ${adjustItem.brand}` : ''}`
    const description = detail ? `${title}, ${detail}` : title

    try {
      setAdjustSaving(true)
      const res = await fetch(`${API_BASE_URL}/api/food-log`, {
        method: 'POST',
        headers: buildNativeAuthHeaders(session?.token || '', { json: true, includeCookie: true }),
        body: JSON.stringify({
          localDate: selectedDate,
          meal: targetMeal,
          category: targetMeal,
          description,
          nutrition: {
            calories,
            protein,
            carbs,
            fat,
            fiber,
            sugar,
          },
          total: {
            calories,
            protein,
            carbs,
            fat,
            fiber,
            sugar,
          },
        }),
      })
      if (!res.ok) {
        Alert.alert('Add failed', 'Could not add this ingredient.')
        return
      }

      setAdjustServingOptions([])
      setAdjustServingId(null)
      setAdjustItem(null)
      setAdjustPickerMode(null)
      navigation.goBack()
    } catch {
      Alert.alert('Add failed', 'Could not add this ingredient.')
    } finally {
      setAdjustSaving(false)
    }
  }

  const createFoodEntry = async (payload: {
    name: string
    calories: number
    protein: number
    carbs: number
    fat: number
    fiber?: number
    sugar?: number
    description?: string
  }) => {
    if (!session?.token) return false
    const name = String(payload.name || '').trim()
    if (!name) return false

    const totals = {
      calories: Math.max(0, Math.round(payload.calories)),
      protein: Math.max(0, roundTo(payload.protein)),
      carbs: Math.max(0, roundTo(payload.carbs)),
      fat: Math.max(0, roundTo(payload.fat)),
      fiber: Math.max(0, roundTo(payload.fiber || 0)),
      sugar: Math.max(0, roundTo(payload.sugar || 0)),
    }
    const descriptionRaw = String(payload.description || '').trim()
    const description = descriptionRaw ? `${name}, ${descriptionRaw}` : name

    const res = await fetch(`${API_BASE_URL}/api/food-log`, {
      method: 'POST',
      headers: buildNativeAuthHeaders(session.token, { json: true, includeCookie: true }),
      body: JSON.stringify({
        localDate: selectedDate,
        meal: targetMeal,
        category: targetMeal,
        description,
        nutrition: totals,
        total: totals,
      }),
    })
    return res.ok
  }

  const resetSearchSection = () => {
    setQuery('')
    setResults([])
    setError('')
    setPhotoPreviewUri(null)
  }

  const submitMissingReport = async () => {
    const trimmedName = missingReportName.trim()
    if (!trimmedName) {
      setMissingReportError('Please enter the item name.')
      return
    }
    if (!session?.token) return

    try {
      setMissingReportBusy(true)
      setMissingReportError('')
      const res = await fetch(`${API_BASE_URL}/api/food-missing`, {
        method: 'POST',
        headers: buildNativeAuthHeaders(session.token, { json: true, includeCookie: true }),
        body: JSON.stringify({
          name: trimmedName,
          brand: missingReportBrand.trim() || null,
          chain: missingReportBrand.trim() || null,
          size: missingReportSize.trim() || null,
          notes: missingReportNotes.trim() || null,
          kind,
          query: query.trim() || null,
          country: userCountry || null,
          source: 'add-ingredient',
        }),
      })
      if (!res.ok) {
        setMissingReportError('Something went wrong. Please try again.')
        return
      }
      setMissingReportDone(true)
      setMissingReportBrand('')
      setMissingReportSize('')
      setMissingReportNotes('')
    } catch {
      setMissingReportError('Something went wrong. Please try again.')
    } finally {
      setMissingReportBusy(false)
    }
  }

  const openMissingReport = () => {
    setMissingReportOpen(true)
    setMissingReportDone(false)
    setMissingReportError('')
    if (query.trim()) setMissingReportName(query.trim())
  }

  const addByPhoto = async () => {
    if (!session?.token) return

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo access to continue.')
        return
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        quality: 0.7,
        mediaTypes: ['images'],
      })
      if (picked.canceled || !picked.assets?.[0]?.uri) return

      const asset = picked.assets[0]
      setPhotoPreviewUri(asset.uri)
      setPhotoLoading(true)

      const form = new FormData()
      form.append('mealType', targetMeal)
      form.append('image', {
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: asset.fileName || 'food.jpg',
      } as any)

      const res = await fetch(`${API_BASE_URL}/api/analyze-food`, {
        method: 'POST',
        headers: buildNativeAuthHeaders(session.token, { includeCookie: true }),
        body: form,
      })
      const data: any = await res.json().catch(() => ({}))
      setPhotoLoading(false)

      if (!res.ok) {
        Alert.alert('Analysis failed', String(data?.error || 'Could not analyze this image.'))
        return
      }

      const items = Array.isArray(data?.items) ? data.items : []
      if (items.length > 0) {
        let added = 0
        for (const item of items) {
          const ok = await createFoodEntry({
            name: String(item?.name || 'Analyzed item'),
            calories: numberOrZero(item?.calories || item?.calories_kcal),
            protein: numberOrZero(item?.protein_g || item?.protein),
            carbs: numberOrZero(item?.carbs_g || item?.carbs),
            fat: numberOrZero(item?.fat_g || item?.fat),
            fiber: numberOrZero(item?.fiber_g || item?.fiber),
            sugar: numberOrZero(item?.sugar_g || item?.sugar),
            description: String(item?.serving_size || 'Photo analyzed'),
          })
          if (ok) added += 1
        }
        Alert.alert('Done', `${added} item${added === 1 ? '' : 's'} added from photo.`)
        navigation.goBack()
        return
      }

      const summary = data?.food || data || {}
      const ok = await createFoodEntry({
        name: String(summary?.name || 'Photo analyzed meal'),
        calories: numberOrZero(summary?.calories || summary?.calories_kcal),
        protein: numberOrZero(summary?.protein || summary?.protein_g),
        carbs: numberOrZero(summary?.carbs || summary?.carbs_g),
        fat: numberOrZero(summary?.fat || summary?.fat_g),
        fiber: numberOrZero(summary?.fiber || summary?.fiber_g),
        sugar: numberOrZero(summary?.sugar || summary?.sugar_g),
        description: String(summary?.description || 'Photo analyzed'),
      })
      if (ok) {
        Alert.alert('Done', 'Item added from photo.')
        navigation.goBack()
      }
    } catch {
      setPhotoLoading(false)
      Alert.alert('Analysis failed', 'Could not analyze this image.')
    }
  }

  const adjustAmount = numberOrZero(adjustAmountInput)
  let unitOptions = defaultUnitOptions(adjustBase, adjustItem?.name || '', mergedAdjustUnitGrams)
  if (adjustServingOptions.length > 0) {
    unitOptions = unitOptions.filter((unit) => unit === 'g' || unit === 'ml' || unit === 'oz')
    unitOptions = ['serving', ...unitOptions]
  }
  const safeAdjustUnit = unitOptions.includes(adjustUnit) ? adjustUnit : unitOptions[0] || 'g'
  const selectedServing =
    adjustServingOptions.length > 0 && adjustServingId
      ? adjustServingOptions.find((option) => option.id === adjustServingId) || null
      : null
  const selectedServingLabel =
    selectedServing?.label || selectedServing?.serving_size || adjustItem?.serving_size || '1 serving'
  const adjustServings = computeServings(adjustAmount, safeAdjustUnit, adjustBase, mergedAdjustUnitGrams)
  const servingsForPreview = Number.isFinite(adjustServings) && adjustServings > 0 ? adjustServings : 0
  const useCustomServingLabel = safeAdjustUnit === 'serving' && Math.abs(adjustAmount - 1) > 0.001
  const activeUnitLabel =
    safeAdjustUnit === 'serving'
      ? useCustomServingLabel
        ? 'Custom'
        : selectedServingLabel
      : unitLabel(safeAdjustUnit, adjustItem?.name || '', mergedAdjustUnitGrams)

  const previewCalories = Math.round(numberOrZero(adjustItem?.calories ?? adjustItem?.calories_kcal) * servingsForPreview)
  const previewProtein = roundTo(numberOrZero(adjustItem?.protein_g) * servingsForPreview, 1)
  const previewCarbs = roundTo(numberOrZero(adjustItem?.carbs_g) * servingsForPreview, 1)
  const previewFat = roundTo(numberOrZero(adjustItem?.fat_g) * servingsForPreview, 1)
  const previewFiber = roundTo(numberOrZero(adjustItem?.fiber_g) * servingsForPreview, 1)
  const previewSugar = roundTo(numberOrZero(adjustItem?.sugar_g) * servingsForPreview, 1)

  const formatAdjustUnitChoiceLabel = (
    unit: AdjustUnit,
    servingLabel: string,
  ) => {
    if (unit === 'serving') return servingLabel
    return unitLabel(unit, adjustItem?.name || '', mergedAdjustUnitGrams)
  }

  const applyAdjustServingOption = (option: ServingOption) => {
    setAdjustServingId(option.id)
    setAdjustItem((prev) => {
      if (!prev) return prev
      return {
        ...applyServingOptionToResult(prev, option),
        servingOptions: adjustServingOptions,
        unitGrams: prev.unitGrams,
      }
    })
    const nextLabel = option.serving_size || option.label || '1 serving'
    const nextBase = parseServingBase(nextLabel) || (() => {
      const grams = parseServingGrams(nextLabel)
      return grams && grams > 0 ? { amount: grams, unit: 'g' as const } : { amount: 100, unit: 'g' as const }
    })()
    setAdjustBase(nextBase)
    setAdjustUnit('serving')
    setAdjustAmountInput('1')
    setAdjustPickerMode(null)
    setAdjustDropdownLayout(null)
  }

  const applyAdjustUnitChoice = (unit: AdjustUnit) => {
    const current = numberOrZero(adjustAmountInput)
    const isWeightUnit = unit === 'g' || unit === 'ml' || unit === 'oz'

    if (isWeightUnit) {
      const converted = convertAmountBetweenUnits(
        current,
        safeAdjustUnit,
        unit,
        adjustBase,
        mergedAdjustUnitGrams,
      )
      if (Number.isFinite(converted) && converted > 0) {
        setAdjustAmountInput(formatAmount(converted))
      }
    } else {
      const keepAmount =
        isDiscreteCountUnit(safeAdjustUnit) && Number.isFinite(current) && current > 0 ? current : 1
      setAdjustAmountInput(formatAmount(keepAmount))
    }
    setAdjustUnit(unit)
    setAdjustPickerMode(null)
    setAdjustDropdownLayout(null)
  }

  const closeAdjustPicker = () => {
    setAdjustPickerMode(null)
    setAdjustDropdownLayout(null)
  }

  const openAdjustPicker = (mode: 'serving' | 'unit') => {
    if (adjustPickerMode === mode) {
      closeAdjustPicker()
      return
    }

    const triggerRef = mode === 'serving' ? adjustServingTriggerRef : adjustUnitTriggerRef
    const node = triggerRef.current
    if (!node || typeof node.measureInWindow !== 'function') {
      setAdjustPickerMode(mode)
      setAdjustDropdownLayout(null)
      return
    }

    requestAnimationFrame(() => {
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        const screen = Dimensions.get('window')
        const margin = 16
        const desiredWidth = mode === 'unit' ? 260 : Math.max(260, width)
        const dropdownWidth = Math.min(desiredWidth, screen.width - margin * 2)
        const left = Math.min(Math.max(margin, x + width - dropdownWidth), screen.width - margin - dropdownWidth)
        const availableBelow = screen.height - (y + height) - margin
        const availableAbove = y - margin
        const openUpward = availableBelow < 220 && availableAbove > availableBelow
        const usableSpace = Math.max(availableBelow, availableAbove)
        const maxHeight = Math.max(220, usableSpace - 8)
        const top = openUpward ? Math.max(margin, y - maxHeight - 4) : y + height + 4

        setAdjustDropdownLayout({
          top,
          left,
          width: dropdownWidth,
          maxHeight,
        })
        setAdjustPickerMode(mode)
      })
    })
  }

  return (
    <Screen style={{ backgroundColor: '#FFFFFF' }}>
      <View style={{ borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, width: 36, alignItems: 'flex-start' })}
          >
            <Text style={{ fontSize: 18, color: '#111827' }}>←</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Add ingredient</Text>
            <Text style={{ marginTop: 2, fontSize: 12, color: '#6B7280' }}>Add to {categoryLabel}</Text>
          </View>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, width: 36, alignItems: 'flex-end' })}
          >
            <Text style={{ fontSize: 18, color: '#111827' }}>✕</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 36 }}>
        <View
          style={{
            borderWidth: 1,
            borderColor: '#E5E7EB',
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            padding: 14,
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
            Search foods (use the source buttons below if results look off)
          </Text>

          <View style={{ position: 'relative' }}>
            <TextInput
              value={query}
              onChangeText={(text) => {
                setQuery(text)
                setError('')
              }}
              onSubmitEditing={() => void runSearch()}
              returnKeyType="search"
              placeholder="e.g. pizza"
              autoCorrect={false}
              autoCapitalize="none"
              placeholderTextColor="#9CA3AF"
              style={{
                borderWidth: 1,
                borderColor: '#D1D5DB',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                paddingRight: 48,
                color: '#111827',
              }}
            />
            <Pressable
              onPress={() => void runSearch()}
              disabled={loading || query.trim().length === 0}
              style={({ pressed }) => ({
                position: 'absolute',
                right: 8,
                top: 6,
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#0F172A',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading || query.trim().length === 0 ? 0.6 : pressed ? 0.85 : 1,
              })}
            >
              {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>⌕</Text>}
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              disabled={loading}
              onPress={() => {
                setKind('packaged')
                if (query.trim().length >= 1) void runSearch(query, 'packaged')
              }}
              style={({ pressed }) => ({
                flex: 1,
                borderWidth: 1,
                borderRadius: 10,
                borderColor: kind === 'packaged' ? '#059669' : '#E5E7EB',
                backgroundColor: kind === 'packaged' ? '#059669' : '#FFFFFF',
                paddingVertical: 10,
                alignItems: 'center',
                opacity: loading ? 0.6 : pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: kind === 'packaged' ? '#FFFFFF' : '#374151' }}>
                Packaged/Fast-foods
              </Text>
            </Pressable>
            <Pressable
              disabled={loading}
              onPress={() => {
                setKind('single')
                if (query.trim().length >= 1) void runSearch(query, 'single')
              }}
              style={({ pressed }) => ({
                flex: 1,
                borderWidth: 1,
                borderRadius: 10,
                borderColor: kind === 'single' ? '#0F172A' : '#E5E7EB',
                backgroundColor: kind === 'single' ? '#0F172A' : '#FFFFFF',
                paddingVertical: 10,
                alignItems: 'center',
                opacity: loading ? 0.6 : pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: kind === 'single' ? '#FFFFFF' : '#374151' }}>
                Single food
              </Text>
            </Pressable>
          </View>

          {error ? <Text style={{ color: '#DC2626', fontSize: 13 }}>{error}</Text> : null}

          {loading && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={{ color: '#4B5563' }}>Searching…</Text>
            </View>
          )}

          {!loading && !error && displayedResults.length === 0 && query.trim().length > 0 ? (
            <Text style={{ color: '#6B7280', fontSize: 13 }}>No results yet. Try a different search.</Text>
          ) : null}

          {displayedResults.length > 0 && (
            <View style={{ maxHeight: 520 }}>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ marginTop: 2 }}>
                {displayedResults.map((item, index) => (
                  (() => {
                    const display = buildSearchDisplay(item, query)
                    const itemKey = `${String(item.source || 'auto')}:${String(item.id)}`
                    const isOpeningAdjust = adjustOpeningId === itemKey
                    return (
                      <View
                        key={`${itemKey}:${index}`}
                        style={{
                          borderWidth: 1,
                          borderColor: '#E5E7EB',
                          borderRadius: 14,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          marginBottom: 8,
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 10,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }} numberOfLines={2}>
                            {display.title}
                            {display.showBrandSuffix && item.brand ? ` - ${item.brand}` : ''}
                          </Text>
                          <Text style={{ marginTop: 3, fontSize: 12, color: '#4B5563' }}>
                            {item.serving_size ? `Serving: ${item.serving_size} • ` : ''}
                            {Math.round(numberOrZero(item.calories ?? item.calories_kcal))} kcal
                          </Text>
                          <Text style={{ marginTop: 4, fontSize: 11, color: '#9CA3AF' }}>Source: {ingredientSourceLabel(item)}</Text>
                        </View>
                        <Pressable
                          disabled={isOpeningAdjust}
                          onPress={() => {
                            void openAdjust(item)
                          }}
                          style={({ pressed }) => ({
                            borderRadius: 10,
                            backgroundColor: '#059669',
                            paddingHorizontal: 12,
                            paddingVertical: 9,
                            opacity: isOpeningAdjust ? 0.7 : pressed ? 0.9 : 1,
                          })}
                        >
                          {isOpeningAdjust ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Add</Text>
                          )}
                        </Pressable>
                      </View>
                    )
                  })()
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 12,
            paddingVertical: 14,
          }}
        >
          <Pressable onPress={openMissingReport} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#047857' }}>Missing item? Tell us</Text>
          </Pressable>
        </View>

        <View
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            padding: 12,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Or use AI photo analysis</Text>
          <Text style={{ fontSize: 14, color: '#4B5563' }}>Take a clear photo of the food or package.</Text>

          <View>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Credits remaining</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ flex: 1, height: 8, borderRadius: 999, backgroundColor: '#E5E7EB', overflow: 'hidden', marginRight: 10 }}>
                <View
                  style={{
                    width: `${Math.max(0, 100 - creditsPercentUsed)}%`,
                    height: '100%',
                    backgroundColor: '#4CAF50',
                  }}
                />
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>
                {creditsRemaining !== null ? creditsRemaining.toLocaleString() : '—'}
              </Text>
            </View>
          </View>

          {photoPreviewUri ? (
            <View style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
              <Image source={{ uri: photoPreviewUri }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              disabled={photoLoading}
              onPress={() => void addByPhoto()}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: 10,
                backgroundColor: '#059669',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 12,
                opacity: photoLoading ? 0.6 : pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
                {photoLoading ? 'Analyzing…' : 'Add image'}
              </Text>
            </Pressable>
            <Pressable
              onPress={resetSearchSection}
              style={({ pressed }) => ({
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 14,
                paddingVertical: 12,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151' }}>Reset</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={missingReportOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setMissingReportOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 16,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#E5E7EB',
              backgroundColor: '#FFFFFF',
              padding: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Report missing item</Text>
              <Pressable onPress={() => setMissingReportOpen(false)}>
                <Text style={{ fontSize: 18, color: '#6B7280' }}>✕</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 12, gap: 10 }}>
              <Text style={{ fontSize: 12, color: '#6B7280' }}>Country: {userCountry || 'Unknown'}</Text>

              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 4 }}>Item name *</Text>
                <TextInput
                  value={missingReportName}
                  onChangeText={setMissingReportName}
                  placeholder="e.g. Strawberry sundae"
                  placeholderTextColor="#9CA3AF"
                  style={{
                    borderWidth: 1,
                    borderColor: '#D1D5DB',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: '#111827',
                  }}
                />
              </View>

              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 4 }}>Brand or chain</Text>
                <TextInput
                  value={missingReportBrand}
                  onChangeText={setMissingReportBrand}
                  placeholder="e.g. McDonald's"
                  placeholderTextColor="#9CA3AF"
                  style={{
                    borderWidth: 1,
                    borderColor: '#D1D5DB',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: '#111827',
                  }}
                />
              </View>

              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 4 }}>Size (optional)</Text>
                <TextInput
                  value={missingReportSize}
                  onChangeText={setMissingReportSize}
                  placeholder="e.g. Small / Medium / Large"
                  placeholderTextColor="#9CA3AF"
                  style={{
                    borderWidth: 1,
                    borderColor: '#D1D5DB',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: '#111827',
                  }}
                />
              </View>

              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 4 }}>Extra notes</Text>
                <TextInput
                  value={missingReportNotes}
                  onChangeText={setMissingReportNotes}
                  placeholder="Anything else that helps"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  textAlignVertical="top"
                  style={{
                    borderWidth: 1,
                    borderColor: '#D1D5DB',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 84,
                    color: '#111827',
                  }}
                />
              </View>

              {missingReportError ? <Text style={{ fontSize: 12, color: '#DC2626' }}>{missingReportError}</Text> : null}
              {missingReportDone ? <Text style={{ fontSize: 12, color: '#047857' }}>Thanks. We have it.</Text> : null}

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <Pressable onPress={() => setMissingReportOpen(false)}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#6B7280' }}>Close</Text>
                </Pressable>
                <Pressable
                  disabled={missingReportBusy}
                  onPress={() => void submitMissingReport()}
                  style={({ pressed }) => ({
                    borderRadius: 10,
                    backgroundColor: '#059669',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    opacity: missingReportBusy ? 0.6 : pressed ? 0.9 : 1,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                    {missingReportBusy ? 'Sending…' : 'Send'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!adjustItem}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          if (adjustSaving) return
          resetAdjustState()
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          <View
            style={{
              borderBottomWidth: 1,
              borderBottomColor: '#E5E7EB',
              paddingHorizontal: 16,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontSize: 22, color: '#111827' }}> </Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>Adjust ingredient</Text>
            <Pressable
              onPress={() => {
                if (adjustSaving) return
                resetAdjustState()
              }}
            >
              <Text style={{ fontSize: 22, color: '#9CA3AF' }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!adjustPickerMode}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}
          >
            <View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{adjustItem?.name || 'Food'}</Text>
              {adjustItem?.brand ? <Text style={{ marginTop: 2, fontSize: 12, color: '#6B7280' }}>{adjustItem.brand}</Text> : null}
            </View>

            {adjustServingOptions.length > 0 ? (
              <View>
                <Text style={{ fontSize: 14, color: '#374151', marginBottom: 6 }}>Base serving size</Text>
                <View ref={adjustServingTriggerRef}>
                  <Pressable
                    onPress={() => openAdjustPicker('serving')}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: '#D1D5DB',
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      backgroundColor: '#FFFFFF',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      opacity: pressed ? 0.9 : 1,
                    })}
                  >
                    <Text style={{ color: '#111827', fontSize: 15, flex: 1, marginRight: 8 }} numberOfLines={1}>
                      {selectedServingLabel}
                    </Text>
                    <Text style={{ color: '#6B7280' }}>{adjustPickerMode === 'serving' ? '▴' : '▾'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View>
              <Text style={{ fontSize: 14, color: '#374151', marginBottom: 6 }}>Amount</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  value={adjustAmountInput}
                  onChangeText={(text) => {
                    if (adjustPickerMode) closeAdjustPicker()
                    setAdjustAmountInput(text)
                  }}
                  keyboardType="decimal-pad"
                  placeholder="1"
                  placeholderTextColor="#9CA3AF"
                  style={{
                    width: 92,
                    borderWidth: 1,
                    borderColor: '#D1D5DB',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                    color: '#111827',
                    fontSize: 16,
                  }}
                />
                <View ref={adjustUnitTriggerRef} style={{ flex: 1 }}>
                  <Pressable
                    onPress={() => openAdjustPicker('unit')}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: '#D1D5DB',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      backgroundColor: '#FFFFFF',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      opacity: pressed ? 0.9 : 1,
                    })}
                  >
                    <Text style={{ color: '#111827', fontSize: 15, flex: 1, marginRight: 8 }} numberOfLines={1}>
                      {activeUnitLabel}
                    </Text>
                    <Text style={{ color: '#6B7280' }}>{adjustPickerMode === 'unit' ? '▴' : '▾'}</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>Servings: {formatAmount(servingsForPreview || 1)}</Text>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2, gap: 8 }}>
              {[
                { label: 'Calories', value: `${previewCalories}` },
                { label: 'Protein', value: `${previewProtein} g` },
                { label: 'Carbs', value: `${previewCarbs} g` },
                { label: 'Fat', value: `${previewFat} g` },
                { label: 'Fibre', value: `${previewFiber} g` },
                { label: 'Sugar', value: `${previewSugar} g` },
              ].map((tile) => (
                <View
                  key={tile.label}
                  style={{
                    width: '48.6%',
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, color: '#4B5563' }}>
                    {tile.label}: <Text style={{ color: '#111827', fontWeight: '700' }}>{tile.value}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                disabled={adjustSaving}
                onPress={() => void addAdjustedItem()}
                style={({ pressed }) => ({
                  flex: 1,
                  borderRadius: 9,
                  backgroundColor: '#059669',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 11,
                  opacity: adjustSaving ? 0.65 : pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 17 }}>{adjustSaving ? 'Adding…' : 'Add to diary'}</Text>
              </Pressable>
              <Pressable
                disabled={adjustSaving}
                onPress={() => {
                  resetAdjustState()
                }}
                style={({ pressed }) => ({
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  backgroundColor: '#FFFFFF',
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                  opacity: adjustSaving ? 0.65 : pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: '#4B5563', fontWeight: '700', fontSize: 17 }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>

        <Modal transparent visible={!!adjustPickerMode} animationType="none" onRequestClose={closeAdjustPicker}>
          <View style={{ flex: 1 }}>
            <Pressable
              onPress={closeAdjustPicker}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              }}
            />
            {adjustPickerMode && adjustDropdownLayout ? (
              <View
                style={{
                  position: 'absolute',
                  top: adjustDropdownLayout.top,
                  left: adjustDropdownLayout.left,
                  width: adjustDropdownLayout.width,
                  maxHeight: adjustDropdownLayout.maxHeight,
                  borderWidth: 1,
                  borderColor: '#D1D5DB',
                  borderRadius: 8,
                  backgroundColor: '#FFFFFF',
                  shadowColor: '#000000',
                  shadowOpacity: 0.16,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 6,
                  overflow: 'hidden',
                }}
              >
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                  {adjustPickerMode === 'serving'
                    ? adjustServingOptions.map((option, index) => {
                        const optionLabel = option.label || option.serving_size
                        const isSelected = adjustServingId === option.id
                        return (
                          <Pressable
                            key={`${option.id}-${index}`}
                            onPress={() => applyAdjustServingOption(option)}
                            style={({ pressed }) => ({
                              paddingHorizontal: 12,
                              paddingVertical: 12,
                              backgroundColor: isSelected ? '#EFF6FF' : pressed ? '#F9FAFB' : '#FFFFFF',
                              borderTopWidth: index === 0 ? 0 : 1,
                              borderTopColor: '#E5E7EB',
                            })}
                          >
                            <Text style={{ color: '#111827', fontSize: 15, fontWeight: isSelected ? '700' : '500' }}>
                              {optionLabel}
                            </Text>
                          </Pressable>
                        )
                      })
                    : unitOptions.map((unit, index) => {
                        const isSelected = safeAdjustUnit === unit
                        const unitText = formatAdjustUnitChoiceLabel(
                          unit,
                          useCustomServingLabel ? 'Custom' : selectedServingLabel,
                        )
                        return (
                          <Pressable
                            key={`${unit}-${index}`}
                            onPress={() => applyAdjustUnitChoice(unit)}
                            style={({ pressed }) => ({
                              paddingHorizontal: 10,
                              paddingVertical: 10,
                              backgroundColor: isSelected ? '#EFF6FF' : pressed ? '#F9FAFB' : '#FFFFFF',
                            })}
                          >
                            <Text style={{ color: '#111827', fontSize: 15 }}>{unitText}</Text>
                          </Pressable>
                        )
                      })}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </Modal>
      </Modal>
    </Screen>
  )
}
