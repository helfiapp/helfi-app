'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import UsageMeter from '@/components/UsageMeter'
import MissingFoodReport from '@/components/food/MissingFoodReport'
import {
  DEFAULT_UNIT_GRAMS,
  MeasurementUnit,
  convertAmount,
  formatUnitLabel as formatMeasurementUnitLabel,
  getAllowedUnitsForFood,
  getFoodUnitGrams,
} from '@/lib/food/measurement-units'

type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'uncategorized'
type SearchKind = 'packaged' | 'single'
type SearchSource = 'auto' | 'usda' | 'openfoodfacts'

type NormalizedFoodItem = {
  source: 'openfoodfacts' | 'usda' | 'fatsecret' | 'custom'
  id: string
  name: string
  brand?: string | null
  serving_size?: string | null
  servings?: number | null
  servingOptions?: any[] | null
  selectedServingId?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
  __custom?: boolean
}

type DrinkOverrideItem = Omit<NormalizedFoodItem, 'source' | 'id'> & {
  source?: NormalizedFoodItem['source'] | string
  id?: string
}

type ServingOption = {
  id: string
  serving_size: string
  label?: string
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

const CATEGORY_LABELS: Record<MealCategory, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
  uncategorized: 'Other',
}

const normalizeCategory = (raw: any): MealCategory => {
  const v = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (v.includes('breakfast')) return 'breakfast'
  if (v.includes('lunch')) return 'lunch'
  if (v.includes('dinner')) return 'dinner'
  if (v.includes('snack')) return 'snacks'
  if (v.includes('uncat') || v.includes('other')) return 'uncategorized'
  return 'uncategorized'
}

const buildTodayIso = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const safeNumber = (n: any) => (typeof n === 'number' && Number.isFinite(n) ? n : null)
const round3 = (n: number) => Math.round(n * 1000) / 1000
const formatNumber = (value: number) => {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')
}
const is100gServing = (label?: string | null) => /\b100\s*g\b/i.test(String(label || ''))
const sameNumber = (a: any, b: any) => {
  if (a === null || a === undefined) return b === null || b === undefined
  if (b === null || b === undefined) return false
  return Number(a) === Number(b)
}

const normalizeDrinkUnit = (value: string | null | undefined) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'ml' || raw === 'milliliter' || raw === 'millilitre') return 'ml'
  if (raw === 'l' || raw === 'liter' || raw === 'litre') return 'l'
  if (raw === 'oz' || raw === 'ounce' || raw === 'ounces' || raw === 'fl oz' || raw === 'floz') return 'oz'
  return null
}

const parseDrinkOverride = (
  amountRaw: string | null,
  unitRaw: string | null,
): { amount: number; unit: 'ml' | 'l' | 'oz'; amountMl: number } | null => {
  const amount = Number(amountRaw)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = normalizeDrinkUnit(unitRaw)
  if (!unit) return null
  const amountMl = unit === 'l' ? amount * 1000 : unit === 'oz' ? amount * 29.5735 : amount
  if (!Number.isFinite(amountMl) || amountMl <= 0) return null
  return { amount, unit, amountMl }
}

const formatDrinkAmountLabel = (amount: number, unit: 'ml' | 'l' | 'oz') => {
  const unitLabel = unit === 'l' ? 'L' : unit
  return `${formatNumber(amount)} ${unitLabel}`
}

const parseServingBaseMl = (servingSize: string | null | undefined) => {
  const raw = String(servingSize || '').toLowerCase()
  const matchMl = raw.match(/(\d+(?:\.\d+)?)\s*ml\b/)
  if (matchMl) return Number(matchMl[1])
  const matchL = raw.match(/(\d+(?:\.\d+)?)\s*l\b/)
  if (matchL) return Number(matchL[1]) * 1000
  const matchOz = raw.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz\b/)
  if (matchOz) return Number(matchOz[1]) * 29.5735
  const matchG = raw.match(/(\d+(?:\.\d+)?)\s*g\b/)
  if (matchG) return Number(matchG[1])
  return null
}

const scaleMacroValue = (value: any, factor: number, decimals: number) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const scaled = numeric * factor
  if (!Number.isFinite(scaled)) return null
  const precision = Math.pow(10, decimals)
  return Math.round(scaled * precision) / precision
}

const applyDrinkAmountOverrideToItem = (
  item: DrinkOverrideItem,
  override: { amount: number; unit: 'ml' | 'l' | 'oz'; amountMl: number },
) => {
  const baseMl = parseServingBaseMl(item?.serving_size)
  if (!baseMl || !Number.isFinite(baseMl) || baseMl <= 0) return item
  const factor = override.amountMl / baseMl
  if (!Number.isFinite(factor) || factor <= 0) return item
  return {
    ...item,
    serving_size: formatDrinkAmountLabel(override.amount, override.unit),
    calories: scaleMacroValue(item.calories, factor, 0),
    protein_g: scaleMacroValue(item.protein_g, factor, 1),
    carbs_g: scaleMacroValue(item.carbs_g, factor, 1),
    fat_g: scaleMacroValue(item.fat_g, factor, 1),
    fiber_g: scaleMacroValue(item.fiber_g, factor, 1),
    sugar_g: scaleMacroValue(item.sugar_g, factor, 1),
    servings: 1,
  }
}

const buildTotalsFromItem = (item: DrinkOverrideItem) => ({
  calories: Number(item?.calories ?? 0),
  protein: Number(item?.protein_g ?? 0),
  carbs: Number(item?.carbs_g ?? 0),
  fat: Number(item?.fat_g ?? 0),
  fiber: Number(item?.fiber_g ?? 0),
  sugar: Number(item?.sugar_g ?? 0),
})

const alignTimestampToLocalDate = (iso: string, localDate: string) => {
  try {
    if (!localDate || localDate.length < 8) return iso
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const time = d.toISOString().slice(11) // HH:mm:ss.sssZ
    return `${localDate}T${time}`
  } catch {
    return iso
  }
}

const buildDefaultMealName = (names: string[]) => {
  const cleaned = names.map((n) => String(n || '').trim()).filter(Boolean)
  if (cleaned.length === 0) return 'Meal'
  const head = cleaned.slice(0, 3).join(', ')
  return cleaned.length > 3 ? `${head}…` : head
}

const triggerHaptic = (duration = 10) => {
  try {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
    const pref = localStorage.getItem('hapticsEnabled')
    const enabled = pref === null ? true : pref === 'true'
    if (enabled && !reduced && 'vibrate' in navigator) (navigator as any).vibrate(duration)
  } catch {}
}

const normalizeBrandToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()

const normalizeSearchToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

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

const getSearchTokens = (value: string) => normalizeSearchToken(value).split(' ').filter(Boolean)

const isOneEditAway = (a: string, b: string) => {
  const lenA = a.length
  const lenB = b.length
  if (Math.abs(lenA - lenB) > 1) return false
  if (lenA === lenB) {
    let mismatches = 0
    for (let i = 0; i < lenA; i += 1) {
      if (a[i] !== b[i]) {
        mismatches += 1
        if (mismatches > 1) return false
      }
    }
    return mismatches <= 1
  }
  const shorter = lenA < lenB ? a : b
  const longer = lenA < lenB ? b : a
  let i = 0
  let j = 0
  let edits = 0
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1
      j += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    j += 1
  }
  return true
}

const nameMatchesSearchQuery = (
  name: string,
  searchQuery: string,
  options?: { requireFirstWord?: boolean; allowTypo?: boolean },
) => {
  const normalizedQuery = normalizeSearchToken(searchQuery)
  const nameTokens = getSearchTokens(name)
  if (!normalizedQuery) return false
  if (normalizedQuery.length === 1) {
    return nameTokens.some((word) => word.startsWith(normalizedQuery))
  }
  const queryTokens = getSearchTokens(searchQuery).filter((token) => token.length >= 2)
  const filteredNameTokens = nameTokens.filter((token) => token.length >= 1)
  if (queryTokens.length === 0 || filteredNameTokens.length === 0) return false
  const tokenMatches = (token: string, word: string) => {
    if (!token || !word) return false
    const matchToken = (value: string) => {
      if (word.startsWith(value)) return true
      const singularWord = singularizeToken(word)
      if (singularWord !== word && singularWord.startsWith(value)) return true
      const allowTypo = (options?.allowTypo ?? true) && value.length >= 3 && value[0] === word[0]
      if (!allowTypo) return false
      const prefixSame = word.slice(0, value.length)
      if (prefixSame && isOneEditAway(value, prefixSame)) return true
      const prefixLonger = word.slice(0, value.length + 1)
      if (prefixLonger && isOneEditAway(value, prefixLonger)) return true
      return false
    }
    if (matchToken(token)) return true
    const singular = singularizeToken(token)
    if (singular !== token && matchToken(singular)) return true
    return false
  }
  const requireFirstWord = options?.requireFirstWord ?? false
  if (requireFirstWord) {
    if (!queryTokens.some((token) => tokenMatches(token, filteredNameTokens[0]))) return false
  }
  if (queryTokens.length === 1) return filteredNameTokens.some((word) => tokenMatches(queryTokens[0], word))
  return queryTokens.every((token) => filteredNameTokens.some((word) => tokenMatches(token, word)))
}

const itemMatchesSearchQuery = (
  item: NormalizedFoodItem,
  searchQuery: string,
  kind: SearchKind,
  options?: { allowTypo?: boolean },
) => {
  if (kind === 'single')
    return nameMatchesSearchQuery(item?.name || '', searchQuery, { requireFirstWord: false, allowTypo: options?.allowTypo })
  const combined = [item?.brand, item?.name].filter(Boolean).join(' ')
  const primary = nameMatchesSearchQuery(combined || item?.name || '', searchQuery, {
    requireFirstWord: false,
    allowTypo: options?.allowTypo,
  })
  if (primary) return true

  // Packaged/fast-food: allow compact token matching so queries like "mcdonalds"
  // match names like "McDonald's" (which normalizes to "mc donald s").
  const compactHaystack = normalizeBrandToken(combined || item?.name || '')
  const tokens = getSearchTokens(searchQuery).filter((t) => t.length >= 2)
  if (compactHaystack && tokens.length > 0) {
    const ok = tokens.every((t) => compactHaystack.includes(normalizeBrandToken(t)))
    if (ok) return true
  }

  return false
}

const filterItemsForQuery = (
  items: NormalizedFoodItem[],
  searchQuery: string,
  kind: SearchKind,
  options?: { allowTypoFallback?: boolean },
) => {
  if (!Array.isArray(items) || items.length === 0) return []
  const prefixMatches = items.filter((item) => itemMatchesSearchQuery(item, searchQuery, kind, { allowTypo: false }))
  if (prefixMatches.length > 0) return prefixMatches
  if (options?.allowTypoFallback === false) return []
  return items.filter((item) => itemMatchesSearchQuery(item, searchQuery, kind, { allowTypo: true }))
}

const GENERIC_FOOD_TOKENS = new Set([
  'burger',
  'cheese',
  'cheeseburger',
  'fries',
  'nugget',
  'nuggets',
  'wrap',
  'pizza',
  'meal',
  'combo',
  'sandwich',
  'salad',
  'taco',
  'burrito',
  'coffee',
  'latte',
  'tea',
  'drink',
  'soda',
  'cola',
  'coke',
  'shake',
  'ice',
  'cream',
  'icecream',
  'muffin',
  'donut',
  'doughnut',
  'chicken',
  'beef',
  'fish',
  'pork',
  'bacon',
  'sausage',
  'egg',
  'breakfast',
])

const getBrandMatchTokens = (searchQuery: string) =>
  getSearchTokens(searchQuery)
    .filter((token) => token.length >= 2)
    .filter((token) => !GENERIC_FOOD_TOKENS.has(token))
    .map((token) => normalizeBrandToken(token))
    .filter(Boolean)

const shouldShowBrandSuggestions = (searchQuery: string) => {
  const tokens = getSearchTokens(searchQuery).filter((token) => token.length >= 2)
  if (tokens.length === 0) return false
  const brandTokens = getBrandMatchTokens(searchQuery)
  if (brandTokens.length === 0) return false
  return true
}

const getQuickPackagedQuery = (searchQuery: string) => {
  const tokens = getSearchTokens(searchQuery).filter((token) => token.length >= 2)
  if (tokens.length <= 1) return searchQuery
  const brandTokens = getBrandMatchTokens(searchQuery)
  if (brandTokens.length > 0) return brandTokens[0]
  return tokens[0]
}

const buildBrandSuggestions = (names: string[], searchQuery: string): NormalizedFoodItem[] => {
  const normalizedTokens = getBrandMatchTokens(searchQuery).filter(Boolean)
  if (normalizedTokens.length === 0) return []
  const matches = names.filter((name) => {
    const normalizedBrand = normalizeBrandToken(name)
    if (!normalizedBrand) return false
    return normalizedTokens.some((token) => normalizedBrand.startsWith(token))
  })
  return matches.slice(0, 8).map((name) => ({
    source: 'fatsecret',
    id: `brand:${normalizeSearchToken(name)}`,
    name,
    serving_size: null,
    __brandSuggestion: true,
    __searchQuery: name,
  }))
}

const buildSingleFoodSuggestions = (searchQuery: string): NormalizedFoodItem[] => {
  if (!ENABLE_SINGLE_SUGGESTIONS) return []
  const tokens = getSearchTokens(searchQuery)
  if (!tokens.some((token) => token.length >= 2)) return []
  const normalizedQuery = normalizeSearchToken(searchQuery)
  const matches = COMMON_SINGLE_FOOD_SUGGESTIONS.filter((item) =>
    (normalizedQuery.length >= 4 && normalizeSearchToken(item.name).includes(normalizedQuery)) ||
    nameMatchesSearchQuery(item.name, searchQuery, { requireFirstWord: false }),
  )
  return matches.slice(0, 8).map((item) => ({
    source: 'usda',
    id: `suggest:${normalizeSearchToken(item.name)}`,
    name: item.name,
    serving_size: item.serving_size || '100 g',
    __suggestion: true,
    __searchQuery: item.name,
  }))
}

const mergeSearchSuggestions = (items: NormalizedFoodItem[], searchQuery: string) => {
  const suggestions = buildSingleFoodSuggestions(searchQuery)
  if (suggestions.length === 0) return items
  const merged: NormalizedFoodItem[] = []
  const seen = new Set<string>()
  const add = (item: NormalizedFoodItem) => {
    const key = normalizeSearchToken(item?.name || '')
    if (!key || seen.has(key)) return
    seen.add(key)
    merged.push(item)
  }
  items.forEach(add)
  suggestions.forEach(add)
  return merged
}

const mergeBrandSuggestions = (items: NormalizedFoodItem[], suggestions: NormalizedFoodItem[]) => {
  if (suggestions.length === 0) return items
  const merged: NormalizedFoodItem[] = []
  const seen = new Set<string>()
  const add = (item: NormalizedFoodItem) => {
    const key = normalizeSearchToken(item?.name || '')
    if (!key || seen.has(key)) return
    seen.add(key)
    merged.push(item)
  }
  items.forEach(add)
  suggestions.forEach(add)
  return merged
}

const buildSearchCacheKey = (kind: SearchKind, source: SearchSource) => `${kind}:${source}`

const getCachedSearchResults = (
  q: string,
  kind: SearchKind,
  source: SearchSource,
  cache: Map<string, { items: NormalizedFoodItem[]; at: number }>,
) => {
  const cached = cache.get(buildSearchCacheKey(kind, source))
  if (!cached || !Array.isArray(cached.items) || cached.items.length === 0) return []
  const hasToken = getSearchTokens(q).some((token) => token.length >= 1)
  const filtered = hasToken ? filterItemsForQuery(cached.items, q, kind, { allowTypoFallback: false }) : cached.items
  return filtered.slice(0, 20)
}

const parseServingGrams = (label?: string | null) => {
  const raw = String(label || '').toLowerCase()
  const match = raw.match(/(\d+(?:\.\d+)?)\s*g\b/)
  if (!match) return null
  const grams = Number(match[1])
  return Number.isFinite(grams) ? grams : null
}

const parseServingQuantity = (value: string): number | null => {
  const trimmed = value.trim()
  const mixed = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixed) {
    const whole = Number(mixed[1])
    const num = Number(mixed[2])
    const den = Number(mixed[3])
    if (Number.isFinite(whole) && Number.isFinite(num) && Number.isFinite(den) && den > 0) {
      return whole + num / den
    }
  }
  const frac = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (frac) {
    const num = Number(frac[1])
    const den = Number(frac[2])
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return num / den
  }
  const num = parseFloat(trimmed)
  return Number.isFinite(num) ? num : null
}

const parseServingUnitMeta = (label: string) => {
  const normalized = String(label || '').trim()
  if (!normalized) return null
  const numberToken = normalized.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/)
  if (!numberToken) return null
  const quantity = parseServingQuantity(numberToken[0])
  if (!quantity || quantity <= 0) return null
  const unitLabel = normalized.replace(numberToken[0], '').trim().replace(/^of\s+/i, '').trim()
  return { quantity, unitLabel }
}

const parseServingBase = (servingSize: any): { amount: number | null; unit: MeasurementUnit | null } => {
  const raw = String(servingSize || '').trim()
  if (!raw) return { amount: null, unit: null }

  const paren = raw.match(/\(([^)]*)\)/)
  const target = paren?.[1] ? paren[1] : raw

  const parseAmount = (value: string): number | null => parseServingQuantity(value)

  const match = target.match(
    /(\d+(?:\.\d+)?(?:\s+\d+\s*\/\s*\d+)?|\d+\s*\/\s*\d+)\s*(g|grams?|ml|mL|oz|ounces?|tsp|teaspoons?|tbsp|tablespoons?|cup|cups?|pinch|pinches|handful|handfuls|piece|pieces|slice|slices|serving|servings)/i,
  )
  if (!match) return { amount: null, unit: null }
  const amount = parseAmount(match[1])
  if (!amount || !Number.isFinite(amount) || amount <= 0) return { amount: null, unit: null }
  const unitRaw = String(match[2] || '').toLowerCase()

  if (unitRaw.startsWith('g')) return { amount, unit: 'g' }
  if (unitRaw === 'ml' || unitRaw === 'ml'.toLowerCase() || unitRaw === 'mL'.toLowerCase()) return { amount, unit: 'ml' }
  if (unitRaw.startsWith('oz') || unitRaw.startsWith('ounce')) return { amount, unit: 'oz' }
  if (unitRaw.startsWith('tsp') || unitRaw.startsWith('teaspoon')) return { amount, unit: 'tsp' }
  if (unitRaw.startsWith('tbsp') || unitRaw.startsWith('tablespoon')) return { amount, unit: 'tbsp' }
  if (unitRaw.startsWith('pinch')) return { amount, unit: 'pinch' }
  if (unitRaw.startsWith('handful')) return { amount, unit: 'handful' }
  if (unitRaw.startsWith('piece')) return { amount, unit: 'piece' }
  if (unitRaw.startsWith('slice')) return { amount, unit: 'slice' }
  if (unitRaw.startsWith('serving')) return { amount, unit: 'serving' }
  if (unitRaw.startsWith('cup')) return { amount, unit: 'cup' }
  return { amount: null, unit: null }
}

const DISCRETE_UNIT_TERMS = [
  'egg',
  'eggs',
  'piece',
  'pieces',
  'slice',
  'slices',
  'bacon',
  'rasher',
  'rashers',
  'strip',
  'strips',
  'sausage',
  'sausages',
  'link',
  'links',
  'patty',
  'pattie',
  'nugget',
  'nuggets',
  'wing',
  'wings',
  'meatball',
  'meatballs',
  'bar',
  'stick',
  'cookie',
  'biscuit',
  'cracker',
  'pancake',
  'scoop',
  'banana',
  'apple',
  'tomato',
  'potato',
  'onion',
  'carrot',
  'zucchini',
  'courgette',
  'bun',
  'roll',
  'sandwich',
  'burger',
]

const isDiscreteUnitLabel = (label: string) => {
  const l = (label || '').toLowerCase().trim()
  if (!l) return false
  return DISCRETE_UNIT_TERMS.some((term) => l.includes(term))
}

const extractPieceGramsFromLabel = (label: string) => {
  const meta = parseServingUnitMeta(label)
  if (!meta || !isDiscreteUnitLabel(meta.unitLabel)) return null
  const parsed = parseServingBase(label)
  if (!parsed.amount || parsed.unit !== 'g') return null
  if (meta.quantity <= 0) return null
  return parsed.amount / meta.quantity
}

const normalizeLegacyBaseUnit = (amount: number | null, unit: MeasurementUnit | null) => {
  if (!amount || !unit) return { amount, unit }
  if (unit === 'serving') return { amount: amount * DEFAULT_UNIT_GRAMS.serving, unit: 'g' as MeasurementUnit }
  if (unit === 'slice') return { amount: amount * DEFAULT_UNIT_GRAMS.slice, unit: 'g' as MeasurementUnit }
  if (unit === 'handful') return { amount: amount * DEFAULT_UNIT_GRAMS.handful, unit: 'g' as MeasurementUnit }
  return { amount, unit }
}

const MEAT_TOKENS = [
  'beef',
  'ground',
  'mince',
  'minced',
  'lamb',
  'pork',
  'chicken',
  'turkey',
  'veal',
  'sausage',
  'bacon',
  'meat',
  'burger',
  'patty',
  'steak',
]

const COMMON_PACKAGED_BRAND_SUGGESTIONS = [
  'McDonald\'s',
  'KFC',
  'Subway',
  'Burger King',
  'Hungry Jack\'s',
  'Domino\'s',
  'Pizza Hut',
  'Starbucks',
  'Dunkin\' Donuts',
  'Taco Bell',
  'Wendy\'s',
  'Nando\'s',
  'Oporto',
  'Guzman y Gomez',
  'Grill\'d',
  'Red Rooster',
  'Sushi Hub',
]

const ENABLE_SINGLE_SUGGESTIONS = false

const COMMON_SINGLE_FOOD_SUGGESTIONS: Array<{ name: string; serving_size?: string }> = [
  { name: 'Apple, raw', serving_size: '100 g' },
  { name: 'Banana, raw', serving_size: '100 g' },
  { name: 'Raspberries, raw', serving_size: '100 g' },
  { name: 'Strawberries, raw', serving_size: '100 g' },
  { name: 'Blueberries, raw', serving_size: '100 g' },
  { name: 'Grapes, raw', serving_size: '100 g' },
  { name: 'Orange, raw', serving_size: '100 g' },
  { name: 'Pear, raw', serving_size: '100 g' },
  { name: 'Pineapple, raw', serving_size: '100 g' },
  { name: 'Mango, raw', serving_size: '100 g' },
  { name: 'Kiwi, raw', serving_size: '100 g' },
  { name: 'Watermelon, raw', serving_size: '100 g' },
  { name: 'Pumpkin, raw', serving_size: '100 g' },
  { name: 'Carrots, raw', serving_size: '100 g' },
  { name: 'Zucchini, raw', serving_size: '100 g' },
  { name: 'Tomato, raw', serving_size: '100 g' },
  { name: 'Potato, raw', serving_size: '100 g' },
  { name: 'Onion, raw', serving_size: '100 g' },
  { name: 'Garlic, raw', serving_size: '100 g' },
  { name: 'Broccoli, raw', serving_size: '100 g' },
  { name: 'Cauliflower, raw', serving_size: '100 g' },
  { name: 'Spinach, raw', serving_size: '100 g' },
  { name: 'Lettuce, raw', serving_size: '100 g' },
  { name: 'Cucumber, raw', serving_size: '100 g' },
  { name: 'Capsicum, raw', serving_size: '100 g' },
  { name: 'Mushrooms, raw', serving_size: '100 g' },
  { name: 'Egg, whole, raw', serving_size: '100 g' },
  { name: 'Eggs, whole, raw', serving_size: '100 g' },
  { name: 'Chicken breast, raw', serving_size: '100 g' },
  { name: 'Chicken thigh, raw', serving_size: '100 g' },
  { name: 'Beef, ground, raw', serving_size: '100 g' },
  { name: 'Pork, raw', serving_size: '100 g' },
  { name: 'Salmon, raw', serving_size: '100 g' },
  { name: 'Tuna, raw', serving_size: '100 g' },
  { name: 'Rice, cooked', serving_size: '100 g' },
  { name: 'Pasta, cooked', serving_size: '100 g' },
  { name: 'Bread, white', serving_size: '100 g' },
  { name: 'Milk, whole', serving_size: '100 g' },
  { name: 'Yogurt, plain', serving_size: '100 g' },
  { name: 'Cheese, cheddar', serving_size: '100 g' },
  { name: 'Olive oil', serving_size: '100 g' },
  { name: 'Butter', serving_size: '100 g' },
  { name: 'Sugar', serving_size: '100 g' },
  { name: 'Salt', serving_size: '100 g' },
  { name: 'Oats, raw', serving_size: '100 g' },
  { name: 'Almonds', serving_size: '100 g' },
  { name: 'Walnuts, raw', serving_size: '100 g' },
  { name: 'Peanut butter', serving_size: '100 g' },
  { name: 'Avocado, raw', serving_size: '100 g' },
]

const shouldShowMeatFat = (item: NormalizedFoodItem, queryText: string) => {
  if (item?.source !== 'usda') return false
  const name = String(item?.name || '').toLowerCase()
  const query = String(queryText || '').toLowerCase()
  return MEAT_TOKENS.some((token) => name.includes(token) || query.includes(token))
}

const buildMeatFatLabel = (item: NormalizedFoodItem, queryText: string) => {
  if (!shouldShowMeatFat(item, queryText)) return null
  const grams = parseServingGrams(item?.serving_size)
  const fat = Number(item?.fat_g)
  if (grams == null || !Number.isFinite(grams) || grams <= 0 || !Number.isFinite(fat) || fat <= 0) return null
  const fatPercent = Math.round((fat / grams) * 100)
  if (!Number.isFinite(fatPercent) || fatPercent <= 0 || fatPercent >= 100) return null
  const leanPercent = Math.max(0, 100 - fatPercent)
  if (leanPercent > 0) return `${leanPercent}% lean / ${fatPercent}% fat`
  return `${fatPercent}% fat`
}

export default function AddIngredientClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userData } = useUserData()

  const selectedDate = searchParams.get('date') || buildTodayIso()
  const category = normalizeCategory(searchParams.get('category'))
  const prefillQuery = searchParams.get('q') || ''
  const drinkOverride = parseDrinkOverride(
    searchParams.get('drinkAmount'),
    searchParams.get('drinkUnit'),
  )
  const drinkType = (searchParams.get('drinkType') || '').trim()
  const waterLogId = (searchParams.get('waterLogId') || '').trim()
  const drinkMeta =
    drinkType && drinkOverride
      ? {
          __drinkType: drinkType,
          __drinkAmount: drinkOverride.amount,
          __drinkUnit: drinkOverride.unit,
          __drinkAmountMl: drinkOverride.amountMl,
          ...(waterLogId ? { __waterLogId: waterLogId } : {}),
        }
      : null

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<SearchKind>('packaged')
  const [sourceChoice, setSourceChoice] = useState<SearchSource>('auto')
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<NormalizedFoodItem[]>([])
  const [brandSuggestions, setBrandSuggestions] = useState<NormalizedFoodItem[]>([])
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [adjustItem, setAdjustItem] = useState<NormalizedFoodItem | null>(null)
  const [adjustAmountInput, setAdjustAmountInput] = useState<string>('1')
  const [adjustUnit, setAdjustUnit] = useState<MeasurementUnit>('g')
  const [adjustBase, setAdjustBase] = useState<{ amount: number | null; unit: MeasurementUnit | null } | null>(null)
  const [adjustPieceGrams, setAdjustPieceGrams] = useState<number | null>(null)
  const [adjustServingId, setAdjustServingId] = useState<string | null>(null)
  const [adjustSaving, setAdjustSaving] = useState(false)
  const prefillAppliedRef = useRef(false)

  const abortRef = useRef<AbortController | null>(null)
  const servingCacheRef = useRef<Map<string, ServingOption>>(new Map())
  const servingPendingRef = useRef<Set<string>>(new Set())
  const seqRef = useRef(0)
  const brandSeqRef = useRef(0)
  const searchDebounceRef = useRef<number | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const queryInputRef = useRef<HTMLInputElement | null>(null)
  const searchPressRef = useRef(0)
  const brandSuggestionsRef = useRef<NormalizedFoodItem[]>([])
  const searchCacheRef = useRef<Map<string, { items: NormalizedFoodItem[]; at: number }>>(new Map())
  const brandSearchDebounceRef = useRef<number | null>(null)

  const cleanSingleFoodQuery = (value: string) =>
    value
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const buildSingleFoodFallback = (value: string) => {
    const cleaned = cleanSingleFoodQuery(value)
    if (!cleaned) return null
    const parts = cleaned.split(' ').filter(Boolean)
    if (parts.length === 0) return null
    const last = parts[parts.length - 1]
    const singular = singularizeToken(last)
    if (singular === last) return null
    parts[parts.length - 1] = singular
    const candidate = parts.join(' ')
    if (candidate.toLowerCase() === cleaned.toLowerCase()) return null
    return candidate
  }

  const buildSearchDisplay = (item: NormalizedFoodItem, searchQuery: string) => {
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

  useEffect(() => {
    return () => {
      try {
        if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
      } catch {}
    }
  }, [photoPreviewUrl])

  useEffect(() => {
    brandSuggestionsRef.current = brandSuggestions
  }, [brandSuggestions])

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const key = 'helfi:food-search-warm'
      if (sessionStorage.getItem(key) === '1') return
      sessionStorage.setItem(key, '1')
      fetch('/api/food-data?source=usda&kind=single&q=apple&limit=5&localOnly=1').catch(() => {})
    } catch {}
  }, [])

  useEffect(() => {
    if (prefillAppliedRef.current) return
    const next = String(prefillQuery || '').trim()
    if (!next) return
    prefillAppliedRef.current = true
    setQuery(next)
    if (next.length >= 1) {
      runSearch(next, kind)
    }
  }, [prefillQuery, kind])

  useEffect(() => {
    const q = String(query || '').trim()
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
    }
    if (q.length < 1) {
      try {
        abortRef.current?.abort()
      } catch {}
      abortRef.current = null
      seqRef.current += 1
      setResults([])
      setLoading(false)
      setError(null)
      return
    }
    if (kind === 'single') {
      const instant = buildSingleFoodSuggestions(q)
      if (instant.length > 0) setResults(instant)
    }
    const cached = getCachedSearchResults(q, kind, sourceChoice, searchCacheRef.current)
    if (cached.length > 0) {
      const allowBrands = kind === 'packaged' && shouldShowBrandSuggestions(q)
      const mergedCached = allowBrands ? mergeBrandSuggestions(cached, brandSuggestionsRef.current) : kind === 'packaged' ? cached : mergeSearchSuggestions(cached, q)
      setResults(mergedCached)
    }
    setLoading(true)
    searchDebounceRef.current = window.setTimeout(() => {
      runSearch(q, kind, sourceChoice, { preserveResults: true })
    }, 200)
    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = null
      }
    }
  }, [query, kind, sourceChoice])

  useEffect(() => {
    const q = String(query || '').trim()
    if (brandSearchDebounceRef.current) {
      window.clearTimeout(brandSearchDebounceRef.current)
      brandSearchDebounceRef.current = null
    }
    if (kind !== 'packaged' || q.length < 1) {
      brandSeqRef.current += 1
      setBrandSuggestions([])
      return
    }
    if (!shouldShowBrandSuggestions(q)) {
      brandSeqRef.current += 1
      setBrandSuggestions([])
      return
    }
    const fallback = buildBrandSuggestions(COMMON_PACKAGED_BRAND_SUGGESTIONS, q)
    if (fallback.length > 0) {
      setBrandSuggestions(fallback)
      setResults((prev) => mergeBrandSuggestions(prev, fallback))
    }
    const seq = ++brandSeqRef.current
    brandSearchDebounceRef.current = window.setTimeout(async () => {
      const list = await fetchBrandSuggestions(q)
      if (brandSeqRef.current !== seq) return
      setBrandSuggestions(list)
      setResults((prev) => mergeBrandSuggestions(prev, list))
    }, 150)
    return () => {
      if (brandSearchDebounceRef.current) {
        window.clearTimeout(brandSearchDebounceRef.current)
        brandSearchDebounceRef.current = null
      }
    }
  }, [query, kind])

  useEffect(() => {
    // Keep /food on the same date when the user returns.
    try {
      const raw = sessionStorage.getItem('foodDiary:warmState')
      const parsed = raw ? JSON.parse(raw) : {}
      const next = { ...(parsed || {}), selectedDate }
      sessionStorage.setItem('foodDiary:warmState', JSON.stringify(next))
    } catch {}
  }, [selectedDate])

  const categoryLabel = CATEGORY_LABELS[category] || 'Other'

  const scoreServingOption = (opt: ServingOption) => {
    const label = String(opt?.label || opt?.serving_size || '').toLowerCase()
    let score = 0
    if (label.includes('serving')) score += 4
    if (label.includes('piece') || label.includes('burger') || label.includes('sandwich') || label.includes('slice')) score += 3
    const grams = Number(opt?.grams)
    if (Number.isFinite(grams)) {
      if (grams >= 40 && grams <= 400) score += 3
      if (grams === 100) score -= 6
    }
    if (is100gServing(label)) score -= 10
    return score
  }

  const pickBestServingOption = (options: ServingOption[]) => {
    if (!Array.isArray(options) || options.length === 0) return null
    const non100 = options.filter((opt) => !is100gServing(opt?.serving_size))
    const pool = non100.length > 0 ? non100 : options
    const sorted = [...pool].sort((a, b) => scoreServingOption(b) - scoreServingOption(a))
    return sorted[0] || null
  }

  const applyServingOptionToResult = (r: NormalizedFoodItem, opt: ServingOption): NormalizedFoodItem => ({
    ...r,
    serving_size: opt.serving_size || r.serving_size,
    calories: safeNumber(opt.calories),
    protein_g: safeNumber(opt.protein_g),
    carbs_g: safeNumber(opt.carbs_g),
    fat_g: safeNumber(opt.fat_g),
    fiber_g: safeNumber(opt.fiber_g),
    sugar_g: safeNumber(opt.sugar_g),
  })

  const hasMeaningfulChange = (before: NormalizedFoodItem, after: NormalizedFoodItem) => {
    if (String(before.serving_size || '') !== String(after.serving_size || '')) return true
    if (!sameNumber(before.calories, after.calories)) return true
    if (!sameNumber(before.protein_g, after.protein_g)) return true
    if (!sameNumber(before.carbs_g, after.carbs_g)) return true
    if (!sameNumber(before.fat_g, after.fat_g)) return true
    if (!sameNumber(before.fiber_g, after.fiber_g)) return true
    if (!sameNumber(before.sugar_g, after.sugar_g)) return true
    return false
  }

  const hasServingOptionMacroData = (opt: ServingOption) => {
    const calories = opt?.calories
    const protein = opt?.protein_g
    const carbs = opt?.carbs_g
    const fat = opt?.fat_g
    const hasCalories = calories !== null && calories !== undefined && Number.isFinite(Number(calories))
    const hasProtein = protein !== null && protein !== undefined && Number.isFinite(Number(protein))
    const hasCarbs = carbs !== null && carbs !== undefined && Number.isFinite(Number(carbs))
    const hasFat = fat !== null && fat !== undefined && Number.isFinite(Number(fat))
    return hasCalories && hasProtein && hasCarbs && hasFat
  }

  const normalizeServingOptionsForAdjust = (raw: any): ServingOption[] => {
    if (!Array.isArray(raw)) return []
    return raw
      .map((opt) => {
        const id = String(opt?.id || '').trim()
        if (!id) return null
        const label = typeof opt?.label === 'string' ? opt.label.trim() : ''
        const servingSize = typeof opt?.serving_size === 'string' ? opt.serving_size.trim() : ''
        const serving_size = (servingSize || label || '').trim()
        return {
          id,
          serving_size,
          label: label || undefined,
          grams: safeNumber(opt?.grams),
          ml: safeNumber(opt?.ml),
          unit: opt?.unit === 'ml' || opt?.unit === 'g' || opt?.unit === 'oz' ? opt.unit : undefined,
          calories: safeNumber(opt?.calories),
          protein_g: safeNumber(opt?.protein_g),
          carbs_g: safeNumber(opt?.carbs_g),
          fat_g: safeNumber(opt?.fat_g),
          fiber_g: safeNumber(opt?.fiber_g),
          sugar_g: safeNumber(opt?.sugar_g),
        } as ServingOption
      })
      .filter((opt): opt is ServingOption => Boolean(opt && opt.id && (opt.serving_size || opt.label)))
      .filter((opt) => hasServingOptionMacroData(opt))
  }

  const pickDefaultServingOptionForAdjust = (options: ServingOption[]) => {
    if (!Array.isArray(options) || options.length === 0) return null
    const byPreference = (needle: string) =>
      options.find((opt) => String(opt?.label || opt?.serving_size || '').toLowerCase().includes(needle))
    return byPreference('medium') || byPreference('regular') || byPreference('standard') || options[0] || null
  }

  const loadServingOverride = async (r: NormalizedFoodItem): Promise<NormalizedFoodItem | null> => {
    if (!r || r.source !== 'usda') return null
    if (!is100gServing(r.serving_size)) return null
    const key = `${r.source}:${r.id}`
    const cached = servingCacheRef.current.get(key)
    if (cached) return applyServingOptionToResult(r, cached)
    if (servingPendingRef.current.has(key)) return null
    servingPendingRef.current.add(key)
    try {
      const params = new URLSearchParams({ source: r.source, id: String(r.id) })
      const res = await fetch(`/api/food-data/servings?${params.toString()}`, { method: 'GET' })
      if (!res.ok) return null
      const data = await res.json().catch(() => ({}))
      const options: ServingOption[] = Array.isArray(data?.options) ? data.options : []
      const best = pickBestServingOption(options)
      if (!best) return null
      servingCacheRef.current.set(key, best)
      const updated = applyServingOptionToResult(r, best)
      if (!hasMeaningfulChange(r, updated)) return null
      return updated
    } catch {
      return null
    } finally {
      servingPendingRef.current.delete(key)
    }
  }

  const resolveSuggestionItem = async (r: NormalizedFoodItem): Promise<NormalizedFoodItem | null> => {
    if (!r || !(r as any).__suggestion) return r
    const lookup = String((r as any).__searchQuery || r.name || '').trim()
    if (!lookup) return null
    try {
      const params = new URLSearchParams({
        source: 'usda',
        q: lookup,
        kind: 'single',
        limit: '20',
      })
      const res = await fetch(`/api/food-data?${params.toString()}`, { method: 'GET' })
      if (!res.ok) return null
      const data = await res.json().catch(() => ({}))
      let items: NormalizedFoodItem[] = Array.isArray(data?.items) ? data.items : []
      items = items.filter((item) => item?.source === 'usda')
      if (items.length === 0) return null
      const match =
        items.find((item) => nameMatchesSearchQuery(item?.name || '', lookup, { requireFirstWord: false })) ||
        items[0]
      return match
    } catch {
      return null
    }
  }

  const hasMacroData = (item: NormalizedFoodItem | null | undefined) => {
    if (!item) return false
    const hasCalories =
      item.calories !== null && item.calories !== undefined && Number.isFinite(Number(item.calories))
    const hasProtein =
      item.protein_g !== null && item.protein_g !== undefined && Number.isFinite(Number(item.protein_g))
    const hasCarbs =
      item.carbs_g !== null && item.carbs_g !== undefined && Number.isFinite(Number(item.carbs_g))
    const hasFat = item.fat_g !== null && item.fat_g !== undefined && Number.isFinite(Number(item.fat_g))
    return hasCalories && hasProtein && hasCarbs && hasFat
  }

  const fetchBrandSuggestions = async (searchQuery: string) => {
  const prefix = getBrandMatchTokens(searchQuery)[0] || ''
  if (prefix.length < 1) return []
    try {
      const res = await fetch(`/api/food-brands?startsWith=${encodeURIComponent(prefix)}`, { method: 'GET' })
      if (!res.ok) return []
      const data = await res.json().catch(() => ({} as any))
      const items = Array.isArray(data?.items) ? data.items : []
      const combined = items.length > 0 ? items : COMMON_PACKAGED_BRAND_SUGGESTIONS
      return buildBrandSuggestions(combined, searchQuery)
    } catch {
      return buildBrandSuggestions(COMMON_PACKAGED_BRAND_SUGGESTIONS, searchQuery)
    }
  }

  const runSearch = async (
    qOverride?: string,
    kindOverride?: SearchKind,
    sourceOverride?: SearchSource,
    options?: { preserveResults?: boolean },
  ) => {
    const q = String(qOverride ?? query).trim()
    const source = sourceOverride ?? sourceChoice
    const k = kindOverride ?? kind
    const cacheKey = buildSearchCacheKey(k, source)
    const userCountry = String(userData?.country || '').trim()
    if (!q) {
      setError('Please type a food name to search.')
      return
    }

    setError(null)
    setLoading(true)
    if (!options?.preserveResults) setResults([])

    try {
      abortRef.current?.abort()
    } catch {}
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++seqRef.current

    try {
      const sourceParam = source === 'auto' ? 'auto' : source
      const fetchItems = async (searchQuery: string, options?: { sourceParam?: SearchSource; localOnly?: boolean }) => {
        const params = new URLSearchParams({
          source: options?.sourceParam ?? sourceParam,
          q: searchQuery,
          kind: k,
          limit: '20',
        })
        if (userCountry) params.set('country', userCountry)
        if (options?.localOnly) params.set('localOnly', '1')
        const res = await fetch(`/api/food-data?${params.toString()}`, { method: 'GET', signal: controller.signal })
        const data = await res.json().catch(() => ({}))
        return { res, data }
      }

      const allowBrandSuggestions = k === 'packaged' && shouldShowBrandSuggestions(q)
      if (k === 'packaged' && sourceParam === 'auto') {
        const quickQuery = getQuickPackagedQuery(q)
        if (quickQuery.length >= 1) {
          const quick = await fetchItems(quickQuery, { sourceParam: 'usda', localOnly: true })
          if (quick.res.ok && seqRef.current === seq) {
            const quickItems = Array.isArray(quick.data?.items) ? quick.data.items : []
            const hasToken = getSearchTokens(q).some((token) => token.length >= 1)
            const quickFiltered = hasToken ? filterItemsForQuery(quickItems, q, k, { allowTypoFallback: false }) : quickItems
            const quickMerged = allowBrandSuggestions ? mergeBrandSuggestions(quickFiltered, brandSuggestionsRef.current) : quickFiltered
            if (seqRef.current === seq && quickMerged.length > 0) {
              setResults(quickMerged)
              searchCacheRef.current.set(cacheKey, { items: quickMerged, at: Date.now() })
            }
          }
        }
      }

      let { res, data } = await fetchItems(q)
      if (!res.ok) {
        const msg =
          typeof data?.error === 'string'
            ? data.error
            : typeof data?.message === 'string'
            ? data.message
            : 'Search failed. Please try again.'
        if (seqRef.current === seq) setError(msg)
        return
      }
      if (seqRef.current !== seq) return
      let baseResults = Array.isArray(data?.items) ? data.items : []
      if (k === 'single') {
        // Include USDA foods and custom foods (marked with __custom flag)
        baseResults = baseResults.filter((item: NormalizedFoodItem) => 
          item?.source === 'usda' || (item as any)?.__custom === true
        )
        if (baseResults.length === 0) {
          const fallback = buildSingleFoodFallback(q)
          if (fallback) {
            const retry = await fetchItems(fallback)
            if (retry.res.ok) {
              const retryItems = Array.isArray(retry.data?.items) ? retry.data.items : []
              baseResults = retryItems.filter((item: NormalizedFoodItem) => 
                item?.source === 'usda' || (item as any)?.__custom === true
              )
            }
          }
        }
      }
      const hasToken = getSearchTokens(q).some((token) => token.length >= 1)
      const filteredResults = hasToken ? filterItemsForQuery(baseResults, q, k, { allowTypoFallback: true }) : baseResults
      const finalResults = k === 'single' && filteredResults.length === 0 && baseResults.length > 0 ? baseResults : filteredResults
      const merged =
        k === 'packaged'
          ? allowBrandSuggestions
            ? mergeBrandSuggestions(finalResults, brandSuggestionsRef.current)
            : finalResults
          : mergeSearchSuggestions(finalResults, q)
      if (seqRef.current !== seq) return
      setResults(merged)
      if (merged.length > 0) searchCacheRef.current.set(cacheKey, { items: merged, at: Date.now() })
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      if (seqRef.current !== seq) return
      setError('Search failed. Please try again.')
    } finally {
      if (seqRef.current === seq) setLoading(false)
    }
  }

  const triggerSearchFromButton = () => {
    const now = Date.now()
    if (now - searchPressRef.current < 300) return
    searchPressRef.current = now
    const raw = queryInputRef.current?.value ?? query
    runSearch(raw)
  }

  useEffect(() => {
    if (results.length === 0) return
    let cancelled = false
    const run = async () => {
      for (const r of results) {
        if (!is100gServing(r.serving_size)) continue
        const updated = await loadServingOverride(r)
        if (!updated || cancelled) continue
        setResults((prev) => {
          let changed = false
          const next = prev.map((item) => {
            if (item.source === updated.source && item.id === updated.id) {
              if (hasMeaningfulChange(item, updated)) {
                changed = true
                return updated
              }
            }
            return item
          })
          return changed ? next : prev
        })
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [results])

  const addFoodEntry = async (payload: any) => {
    const res = await fetch('/api/food-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg =
        typeof data?.error === 'string'
          ? data.error
          : typeof data?.message === 'string'
          ? data.message
          : 'Saving failed. Please try again.'
      throw new Error(msg)
    }
    return data
  }

  const computeServingsFromAmount = (
    amount: number,
    unit: MeasurementUnit,
    base: { amount: number | null; unit: MeasurementUnit | null } | null,
    pieceGrams: number | null,
    foodName: string,
  ) => {
    if (!base?.amount || !base?.unit) return 1
    if (!Number.isFinite(amount) || amount <= 0) return 1
    const foodUnitGrams = getFoodUnitGrams(foodName)
    const inBase = convertAmount(amount, unit, base.unit, base.amount, base.unit, pieceGrams, foodUnitGrams)
    const servings = base.amount > 0 ? inBase / base.amount : 0
    return round3(Math.max(0, servings || 0))
  }

  const openAdjustModalForItem = async (r: NormalizedFoodItem) => {
    if (!r) return
    setError(null)
    triggerHaptic(10)
    setAddingId(`${r.source}:${r.id}`)
    try {
      let target = r
      if ((r as any).__suggestion) {
        const resolved = await resolveSuggestionItem(r)
        if (!resolved) {
          setError('No match found. Try a longer search.')
          return
        }
        target = resolved
      }
      const upgraded = await loadServingOverride(target)
      const resolvedTarget = upgraded || target

      const servingOptions = normalizeServingOptionsForAdjust((resolvedTarget as any)?.servingOptions)
      const defaultServingOption = pickDefaultServingOptionForAdjust(servingOptions)
      const resolvedWithServing =
        defaultServingOption && hasServingOptionMacroData(defaultServingOption)
          ? applyServingOptionToResult(resolvedTarget, defaultServingOption)
          : resolvedTarget

      if (!hasMacroData(resolvedWithServing)) {
        setError('This item has no nutrition data. Please choose another result.')
        return
      }

      const baseItem: NormalizedFoodItem = {
        source: resolvedWithServing.source,
        id: resolvedWithServing.id,
        name: String(resolvedWithServing.name || 'Food'),
        brand: resolvedWithServing.brand ?? null,
        serving_size: String(resolvedWithServing.serving_size || '1 serving'),
        servingOptions: servingOptions.length > 0 ? servingOptions : null,
        selectedServingId: defaultServingOption?.id || null,
        calories: safeNumber(resolvedWithServing.calories),
        protein_g: safeNumber(resolvedWithServing.protein_g),
        carbs_g: safeNumber(resolvedWithServing.carbs_g),
        fat_g: safeNumber(resolvedWithServing.fat_g),
        fiber_g: safeNumber(resolvedWithServing.fiber_g),
        sugar_g: safeNumber(resolvedWithServing.sugar_g),
        servings: 1,
      }

      const parsedBase = parseServingBase(baseItem.serving_size)
      const fallbackGrams = parseServingGrams(baseItem.serving_size)
      const base = normalizeLegacyBaseUnit(
        parsedBase.amount && parsedBase.unit ? parsedBase.amount : fallbackGrams || 100,
        parsedBase.amount && parsedBase.unit ? parsedBase.unit : 'g',
      )
      const pieceGrams = extractPieceGramsFromLabel(baseItem.serving_size || '')

      const allowedUnits = getAllowedUnitsForFood(baseItem.name, pieceGrams)
      const baseUnitAllowed =
        base.unit && allowedUnits.includes(base.unit) ? (base.unit as MeasurementUnit) : null
      let nextUnit = baseUnitAllowed || allowedUnits[0] || 'g'
      let nextAmount = base.amount && base.amount > 0 ? base.amount : 1

      if (drinkOverride) {
        if (drinkOverride.unit === 'ml' || drinkOverride.unit === 'oz') {
          nextUnit = drinkOverride.unit
          nextAmount = drinkOverride.amount
        } else if (drinkOverride.unit === 'l') {
          nextUnit = 'ml'
          nextAmount = drinkOverride.amount * 1000
        }
      } else if (servingOptions.length > 0) {
        // Fast-food menu items: default to "1 serving" so users can pick Small/Medium/Large.
        nextUnit = 'serving'
        nextAmount = 1
      }

      setAdjustItem(baseItem)
      setAdjustBase(base)
      setAdjustPieceGrams(pieceGrams)
      setAdjustUnit(nextUnit)
      setAdjustAmountInput(formatNumber(nextAmount))
      setAdjustServingId(defaultServingOption?.id || null)
    } finally {
      setAddingId(null)
    }
  }

  const confirmAdjustAdd = async () => {
    if (!adjustItem) return
    if (adjustSaving) return
    setAdjustSaving(true)
    setError(null)
    try {
      const amount = Number(adjustAmountInput)
      const unit = adjustUnit
      const base = adjustBase || { amount: 100, unit: 'g' }
      const pieceGrams = adjustPieceGrams
      const servings = computeServingsFromAmount(amount, unit, base, pieceGrams, adjustItem.name || '')
      const finalServings = Number.isFinite(servings) && servings > 0 ? servings : 1

      const item = {
        ...adjustItem,
        servings: finalServings,
        weightAmount: Number.isFinite(amount) ? amount : null,
        weightUnit: unit,
      }

      const nutrition = {
        calories: Math.round(Number(item.calories || 0) * finalServings),
        protein: round3(Number(item.protein_g || 0) * finalServings),
        carbs: round3(Number(item.carbs_g || 0) * finalServings),
        fat: round3(Number(item.fat_g || 0) * finalServings),
        fiber: round3(Number(item.fiber_g || 0) * finalServings),
        sugar: round3(Number(item.sugar_g || 0) * finalServings),
        ...(drinkMeta ? drinkMeta : {}),
      }

      const createdAtIso = alignTimestampToLocalDate(new Date().toISOString(), selectedDate)

      const payload = {
        description: item.name,
        nutrition,
        imageUrl: null,
        items: [item],
        localDate: selectedDate,
        meal: category,
        category,
        createdAt: createdAtIso,
      }

      const created = await addFoodEntry(payload)
      try {
        const createdId = typeof created?.id === 'string' ? created.id : null
        if (createdId) {
          sessionStorage.setItem(
            'foodDiary:scrollToEntry',
            JSON.stringify({ dbId: createdId, localDate: selectedDate, category }),
          )
        }
      } catch {}
      setAdjustItem(null)
      router.push('/food')
    } catch (e: any) {
      setError(e?.message || 'Could not add that ingredient. Please try again.')
    } finally {
      setAdjustSaving(false)
    }
  }

  const addFromSearchResult = async (r: NormalizedFoodItem) => {
    if (!r) return
    await openAdjustModalForItem(r)
  }

  const addByPhoto = async (file: File) => {
    if (!file) return
    setError(null)
    triggerHaptic(10)
    setPhotoLoading(true)
    try {
      try {
        if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
      } catch {}
      try {
        setPhotoPreviewUrl(URL.createObjectURL(file))
      } catch {}
    } catch {}
    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('analysisMode', 'meal')
      const res = await fetch('/api/analyze-food', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof data?.message === 'string'
            ? data.message
            : typeof data?.error === 'string'
            ? data.error
            : 'Photo analysis failed. Please try again.'
        setError(msg)
        return
      }

      const items = Array.isArray(data?.items) ? data.items : []
      const total = data?.total || data?.nutrition || null

      if (!items.length) {
        setError('No ingredients were detected from that photo. Try a clearer photo or use search.')
        return
      }

      let finalItems = items
      let finalTotal = total
      if (drinkOverride && items.length === 1) {
        const scaled = applyDrinkAmountOverrideToItem(items[0], drinkOverride)
        if (scaled !== items[0]) {
          finalItems = [scaled]
          finalTotal = buildTotalsFromItem(scaled)
        }
      }

      const createdAtIso = alignTimestampToLocalDate(new Date().toISOString(), selectedDate)
      const title = buildDefaultMealName(finalItems.map((it: any) => it?.name || it?.food || 'Food'))

      const nutrition = {
        calories: Math.round(Number(finalTotal?.calories || 0)),
        protein: round3(Number(finalTotal?.protein ?? finalTotal?.protein_g ?? 0)),
        carbs: round3(Number(finalTotal?.carbs ?? finalTotal?.carbs_g ?? 0)),
        fat: round3(Number(finalTotal?.fat ?? finalTotal?.fat_g ?? 0)),
        fiber: round3(Number(finalTotal?.fiber ?? finalTotal?.fiber_g ?? 0)),
        sugar: round3(Number(finalTotal?.sugar ?? finalTotal?.sugar_g ?? 0)),
        ...(drinkMeta ? drinkMeta : {}),
      }

      const payload = {
        description: title,
        nutrition,
        imageUrl: null,
        items: finalItems,
        localDate: selectedDate,
        meal: category,
        category,
        createdAt: createdAtIso,
      }

      const created = await addFoodEntry(payload)
      try {
        const createdId = typeof created?.id === 'string' ? created.id : null
        if (createdId) {
          sessionStorage.setItem(
            'foodDiary:scrollToEntry',
            JSON.stringify({ dbId: createdId, localDate: selectedDate, category }),
          )
        }
      } catch {}
      try {
        window.dispatchEvent(new Event('credits:refresh'))
      } catch {}
      router.push('/food')
    } catch (e: any) {
      setError(e?.message || 'Photo analysis failed. Please try again.')
    } finally {
      setPhotoLoading(false)
      try {
        if (photoInputRef.current) photoInputRef.current.value = ''
      } catch {}
    }
  }

  const headerSubtitle = useMemo(() => `Add to ${categoryLabel}`, [categoryLabel])

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="w-full max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push('/food')}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Back"
          >
            <span aria-hidden>←</span>
          </button>
          <div className="flex-1 text-center">
            <div className="text-lg font-semibold text-gray-900">Add ingredient</div>
            <div className="text-xs text-gray-500">{headerSubtitle}</div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/food')}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Close"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="w-full max-w-3xl mx-auto space-y-4">
          {/* PROTECTED: ADD_INGREDIENT_SEARCH START */}
          <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3">
            <div className="text-sm font-semibold text-gray-900">
              Search foods (use the source buttons below if results look off)
            </div>

            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault()
                const raw = queryInputRef.current?.value ?? query
                runSearch(raw)
              }}
            >
                <input
                  ref={queryInputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setError(null)
                  }}
                placeholder="e.g. pizza"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="search"
                className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <button
                type="button"
                aria-label="Search"
                disabled={loading || query.trim().length === 0}
                onMouseDown={(e) => {
                  e.preventDefault()
                  triggerSearchFromButton()
                }}
                onTouchStart={(e) => {
                  e.preventDefault()
                  triggerSearchFromButton()
                }}
                onClick={triggerSearchFromButton}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center disabled:opacity-60"
              >
                {loading ? (
                  <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 20l-3.5-3.5" />
                  </svg>
                )}
              </button>
            </form>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  const nextSource = sourceChoice === 'usda' ? 'auto' : sourceChoice
                  setKind('packaged')
                  if (nextSource !== sourceChoice) setSourceChoice(nextSource)
                  if (query.trim().length >= 1) runSearch(query, 'packaged', nextSource)
                }}
                className={`px-3 py-2 rounded-lg border text-sm font-semibold ${
                  kind === 'packaged' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-200'
                } disabled:opacity-60`}
              >
                Packaged/Fast-foods
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  const nextSource = sourceChoice === 'openfoodfacts' ? 'usda' : sourceChoice
                  setKind('single')
                  if (nextSource !== sourceChoice) setSourceChoice(nextSource)
                  if (query.trim().length >= 1) runSearch(query, 'single', nextSource)
                }}
                className={`px-3 py-2 rounded-lg border text-sm font-semibold ${
                  kind === 'single' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-gray-700 border-gray-200'
                } disabled:opacity-60`}
              >
                Single food
              </button>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-600">Source</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([
                  { key: 'auto', label: 'Best match' },
                  { key: 'usda', label: 'USDA' },
                  { key: 'openfoodfacts', label: 'OpenFoodFacts' },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      const nextKind =
                        opt.key === 'usda' ? 'single' : opt.key === 'openfoodfacts' ? 'packaged' : kind
                      setSourceChoice(opt.key)
                      if (nextKind !== kind) setKind(nextKind)
                      if (query.trim().length >= 1) runSearch(query, nextKind, opt.key)
                    }}
                    className={`px-3 py-2 rounded-lg border text-xs font-semibold ${
                      sourceChoice === opt.key
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-gray-700 border-gray-200'
                    } disabled:opacity-60`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-gray-500">
                USDA works with Single food. OpenFoodFacts works with Packaged.
              </div>
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            {!loading && !error && results.length === 0 && query.trim() && (
              <div className="text-sm text-gray-500">
                No results yet. Try a different search or switch the source above.
              </div>
            )}

            {results.length > 0 && (
              <div className="max-h-[60vh] overflow-y-auto space-y-2 pt-1">
                {results.map((r, idx) => {
                  const id = `${r.source}:${r.id}:${idx}`
                  const busy = addingId === `${r.source}:${r.id}`
                  const isBrandSuggestion = Boolean((r as any).__brandSuggestion)
                  const display = buildSearchDisplay(r, query)
                  return (
                    <div key={id} className="flex items-start justify-between rounded-xl border border-gray-200 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {display.title}
                          {display.showBrandSuffix && r.brand ? ` – ${r.brand}` : ''}
                        </div>
                          <div className="mt-0.5 text-xs text-gray-600">
                            {isBrandSuggestion ? (
                              <span>Brand match</span>
                            ) : (
                              <>
                                {r.serving_size ? `Serving: ${r.serving_size} • ` : ''}
                                {r.calories != null && !Number.isNaN(Number(r.calories)) && <span>{Math.round(Number(r.calories))} kcal</span>}
                              </>
                            )}
                            {(() => {
                              const fatLabel = buildMeatFatLabel(r, query)
                              return fatLabel ? <span className="ml-2">{fatLabel}</span> : null
                            })()}
                          </div>
                        <div className="mt-1 text-[11px] text-gray-400">
                          {isBrandSuggestion
                            ? 'Brand list'
                            : `Source: ${
                                (r as any)?.__custom || String((r as any)?.id || '').startsWith('custom:')
                                  ? 'Custom list'
                                  : r.source === 'usda'
                                  ? 'USDA'
                                  : r.source === 'fatsecret'
                                  ? 'FatSecret'
                                  : 'Open Food Facts'
                              }`}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (isBrandSuggestion) {
                            const nextQuery = (r as any).__searchQuery || r.name
                            setQuery(nextQuery)
                            runSearch(nextQuery, kind)
                            return
                          }
                          addFromSearchResult(r)
                        }}
                        className="ml-3 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {isBrandSuggestion ? 'Show' : busy ? 'Adding…' : 'Add'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {/* PROTECTED: ADD_INGREDIENT_SEARCH END */}
          <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
            <MissingFoodReport
              defaultQuery={query}
              kind={kind}
              country={userData?.country || ''}
              source="add-ingredient"
            />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-2">
            <div className="text-sm font-semibold text-gray-900">Or use AI photo analysis</div>
            <div className="text-sm text-gray-600">Take a clear photo of the food or package.</div>

            <div>
              <UsageMeter inline={true} feature="foodAnalysis" />
            </div>

            {photoPreviewUrl && (
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreviewUrl} alt="Selected food photo" className="w-full max-h-64 object-cover" />
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={photoLoading}
                onClick={() => photoInputRef.current?.click()}
                className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                {photoLoading ? 'Analyzing…' : 'Add image'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setResults([])
                  setError(null)
                }}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                Reset
              </button>
            </div>

            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) addByPhoto(f)
              }}
            />
          </div>
        </div>
      </div>

      {adjustItem && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="text-base font-semibold text-gray-900">Adjust ingredient</div>
              <button
                type="button"
                onClick={() => {
                  if (adjustSaving) return
                  setAdjustItem(null)
                }}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                aria-label="Close"
              >
                <span aria-hidden>✕</span>
              </button>
            </div>
            <div className="px-4 py-4 space-y-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">{adjustItem.name}</div>
                {adjustItem.brand && <div className="text-xs text-gray-500">{adjustItem.brand}</div>}
              </div>

              {(() => {
                const pieceGrams = adjustPieceGrams
                const servingOptions = normalizeServingOptionsForAdjust((adjustItem as any)?.servingOptions)
                const selectedServing =
                  servingOptions.length > 0 && adjustServingId
                    ? servingOptions.find((opt) => opt.id === adjustServingId) || null
                    : null
                const selectedServingLabel =
                  selectedServing?.label || selectedServing?.serving_size || adjustItem.serving_size || 'serving'

                let unitOptions = getAllowedUnitsForFood(adjustItem.name, pieceGrams)
                if (servingOptions.length > 0) {
                  // Fast-food menu items often include produce words (eg "strawberry") in the name,
                  // which can make the dropdown show "small strawberry", "large strawberry", etc.
                  // That's correct for the fruit, but wrong for a sundae. Keep the list simple.
                  const keep = new Set<MeasurementUnit>(['g', 'ml', 'oz'])
                  unitOptions = unitOptions.filter((unit) => keep.has(unit))
                  unitOptions = ['serving', ...unitOptions]
                }
                const safeUnit = unitOptions.includes(adjustUnit) ? adjustUnit : unitOptions[0] || 'g'
                const amountNumber = Number(adjustAmountInput)
                const servings = computeServingsFromAmount(
                  Number.isFinite(amountNumber) ? amountNumber : 0,
                  safeUnit,
                  adjustBase,
                  pieceGrams,
                  adjustItem.name || '',
                )
                const calories = round3(Number(adjustItem.calories || 0) * servings)
                const protein = round3(Number(adjustItem.protein_g || 0) * servings)
                const carbs = round3(Number(adjustItem.carbs_g || 0) * servings)
                const fat = round3(Number(adjustItem.fat_g || 0) * servings)
                const fiber = round3(Number(adjustItem.fiber_g || 0) * servings)
                const sugar = round3(Number(adjustItem.sugar_g || 0) * servings)

                return (
                  <>
                    {servingOptions.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Serving size</label>
                        <select
                          value={adjustServingId || servingOptions[0]?.id || ''}
                          onChange={(e) => {
                            const nextId = e.target.value
                            const nextOpt = servingOptions.find((opt) => opt.id === nextId) || null
                            if (!nextOpt) return

                            setAdjustServingId(nextOpt.id)
                            setAdjustItem((prev) => {
                              if (!prev) return prev
                              const updated = applyServingOptionToResult(prev, nextOpt)
                              return {
                                ...updated,
                                servingOptions,
                                selectedServingId: nextOpt.id,
                              }
                            })

                            const nextLabel = nextOpt.serving_size || nextOpt.label || '1 serving'
                            const nextParsed = parseServingBase(nextLabel)
                            const nextFallbackGrams = parseServingGrams(nextLabel)
                            const nextBase = normalizeLegacyBaseUnit(
                              nextParsed.amount && nextParsed.unit ? nextParsed.amount : nextFallbackGrams || 100,
                              nextParsed.amount && nextParsed.unit ? nextParsed.unit : 'g',
                            )
                            setAdjustBase(nextBase)
                            setAdjustPieceGrams(extractPieceGramsFromLabel(nextLabel || ''))

                            const currentAmount = Number(adjustAmountInput)
                            const keepAmount =
                              adjustUnit === 'serving' && Number.isFinite(currentAmount) && currentAmount > 0
                                ? currentAmount
                                : 1
                            setAdjustUnit('serving')
                            setAdjustAmountInput(formatNumber(keepAmount))
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        >
                          {servingOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label || opt.serving_size}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={(() => {
                            if (safeUnit === 'oz') return 0.1
                            if (safeUnit === 'tsp' || safeUnit === 'tbsp') return 0.1
                            if (
                              safeUnit === 'quarter-cup' ||
                              safeUnit === 'half-cup' ||
                              safeUnit === 'three-quarter-cup' ||
                              safeUnit === 'cup'
                            )
                              return 0.1
                            if (safeUnit === 'pinch' || safeUnit === 'handful') return 0.1
                            if (safeUnit === 'serving') return 0.25
                            if (
                              safeUnit === 'piece' ||
                              safeUnit === 'piece-small' ||
                              safeUnit === 'piece-medium' ||
                              safeUnit === 'piece-large' ||
                              safeUnit === 'piece-extra-large' ||
                              safeUnit === 'slice'
                            )
                              return 1
                            return 1
                          })()}
                          value={adjustAmountInput}
                          onChange={(e) => setAdjustAmountInput(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                        <select
                          value={safeUnit}
                          onChange={(e) => {
                            const nextUnit = e.target.value as MeasurementUnit
                            const currentAmount = Number(adjustAmountInput)
                            if (Number.isFinite(currentAmount)) {
                              const foodUnitGrams = getFoodUnitGrams(adjustItem.name)
                              const converted = convertAmount(
                                currentAmount,
                                safeUnit,
                                nextUnit,
                                adjustBase?.amount ?? null,
                                adjustBase?.unit ?? null,
                                pieceGrams,
                                foodUnitGrams,
                              )
                              if (Number.isFinite(converted)) setAdjustAmountInput(formatNumber(converted))
                            }
                            setAdjustUnit(nextUnit)
                          }}
                          className="w-36 px-2 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        >
                          {unitOptions.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit === 'serving'
                                ? selectedServingLabel
                                : formatMeasurementUnitLabel(unit, adjustItem.name, pieceGrams)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">Servings: {formatNumber(servings || 1)}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div className="rounded-lg border border-gray-200 px-2 py-2">
                        Calories: <span className="font-semibold text-gray-900">{Math.round(calories)}</span>
                      </div>
                      <div className="rounded-lg border border-gray-200 px-2 py-2">
                        Protein: <span className="font-semibold text-gray-900">{formatNumber(protein)} g</span>
                      </div>
                      <div className="rounded-lg border border-gray-200 px-2 py-2">
                        Carbs: <span className="font-semibold text-gray-900">{formatNumber(carbs)} g</span>
                      </div>
                      <div className="rounded-lg border border-gray-200 px-2 py-2">
                        Fat: <span className="font-semibold text-gray-900">{formatNumber(fat)} g</span>
                      </div>
                      <div className="rounded-lg border border-gray-200 px-2 py-2">
                        Fibre: <span className="font-semibold text-gray-900">{formatNumber(fiber)} g</span>
                      </div>
                      <div className="rounded-lg border border-gray-200 px-2 py-2">
                        Sugar: <span className="font-semibold text-gray-900">{formatNumber(sugar)} g</span>
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
            <div className="border-t border-gray-200 px-4 py-3 flex gap-2">
              <button
                type="button"
                disabled={adjustSaving}
                onClick={confirmAdjustAdd}
                className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                {adjustSaving ? 'Adding…' : 'Add to diary'}
              </button>
              <button
                type="button"
                disabled={adjustSaving}
                onClick={() => setAdjustItem(null)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
