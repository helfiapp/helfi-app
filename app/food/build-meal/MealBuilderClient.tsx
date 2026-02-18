'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import UsageMeter from '@/components/UsageMeter'
import MissingFoodReport from '@/components/food/MissingFoodReport'
import { DRY_FOOD_MEASUREMENTS } from '@/lib/food/dry-food-measurements'
import { PRODUCE_MEASUREMENTS } from '@/lib/food/produce-measurements'
import { DAIRY_SEMI_SOLID_MEASUREMENTS } from '@/lib/food/dairy-semi-solid-measurements'
import { applyFoodNameOverride, createFoodNameOverrideIndex } from '@/lib/food/food-name-overrides'

type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'uncategorized'

type NormalizedFoodItem = {
  source: 'openfoodfacts' | 'usda' | 'fatsecret' | 'custom'
  id: string
  name: string
  brand?: string | null
  serving_size?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
  __suggestion?: boolean
  __searchQuery?: string
}

type ServingOption = {
  id: string
  label?: string | null
  serving_size?: string | null
  grams?: number | null
  ml?: number | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
  source?: string | null
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
  | 'handful'
  | 'piece'
  | 'piece-small'
  | 'piece-medium'
  | 'piece-large'
  | 'piece-extra-large'
  | 'egg-small'
  | 'egg-medium'
  | 'egg-large'
  | 'egg-extra-large'
  | 'slice'
  | 'serving'

type PortionUnit = 'serving' | 'g' | 'oz'

type BuilderItem = {
  id: string
  name: string
  brand?: string | null
  serving_size?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
  servings: number
  __baseAmount: number | null
  __baseUnit: BuilderUnit | null
  __amount: number
  __amountInput: string
  __unit: BuilderUnit | null
  __pieceGrams: number | null
  __servingOptions?: ServingOption[] | null
  __selectedServingId?: string | null
  __source?: NormalizedFoodItem['source'] | null
  __sourceId?: string | null
  __matchedName?: string | null
  __importKey?: string | null
}

const CATEGORY_LABELS: Record<MealCategory, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
  uncategorized: 'Other',
}
const BARCODE_REGION_ID = 'meal-builder-barcode-reader'

const FAVORITE_PORTION_SEED_KEY = 'foodDiary:favoritePortionSeed'

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

const alignTimestampToLocalDate = (iso: string, localDate: string) => {
  try {
    if (!localDate || localDate.length < 8) return iso
    const base = new Date(iso)
    if (Number.isNaN(base.getTime())) return iso
    const [y, m, d] = localDate.split('-').map((v) => parseInt(v, 10))
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso
    const anchored = new Date(y, m - 1, d, base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds())
    return anchored.toISOString()
  } catch {
    return iso
  }
}

const formatTimeInputValue = (date: Date) => {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

const extractTimeFromTimestamp = (raw: any) => {
  if (!raw) return ''
  const dt = new Date(raw)
  if (Number.isNaN(dt.getTime())) return ''
  return formatTimeInputValue(dt)
}

const buildCreatedAtFromEntryTime = (localDate: string, entryTime: string, fallbackIso: string) => {
  const fallback = alignTimestampToLocalDate(fallbackIso, localDate)
  try {
    if (!entryTime || !/^\d{2}:\d{2}$/.test(entryTime)) return fallback
    if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return fallback
    const [h, min] = entryTime.split(':').map((v) => parseInt(v, 10))
    const [y, mon, d] = localDate.split('-').map((v) => parseInt(v, 10))
    if (!Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(y) || !Number.isFinite(mon) || !Number.isFinite(d)) {
      return fallback
    }
    const dt = new Date(y, mon - 1, d, h, min, 0, 0)
    if (Number.isNaN(dt.getTime())) return fallback
    return dt.toISOString()
  } catch {
    return fallback
  }
}

const toNumber = (v: any): number | null => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

const round3 = (n: number) => Math.round(n * 1000) / 1000
const KCAL_TO_KJ = 4.184

const formatEnergyValue = (value: number | null | undefined, unit: 'kcal' | 'kJ') => {
  const base = typeof value === 'number' && Number.isFinite(value) ? value : 0
  const display = unit === 'kJ' ? base * KCAL_TO_KJ : base
  return Math.round(display)
}

const MEAL_TOTAL_CARDS: Array<{
  key: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar'
  label: string
  unit?: string
  gradient: string
  accent: string
}> = [
  { key: 'calories', label: 'Calories', unit: '', gradient: 'from-orange-50 to-orange-100', accent: 'text-orange-500' },
  { key: 'protein', label: 'Protein', unit: 'g', gradient: 'from-blue-50 to-blue-100', accent: 'text-blue-500' },
  { key: 'carbs', label: 'Carbs', unit: 'g', gradient: 'from-green-50 to-green-100', accent: 'text-green-500' },
  { key: 'fat', label: 'Fat', unit: 'g', gradient: 'from-purple-50 to-purple-100', accent: 'text-purple-500' },
  { key: 'fiber', label: 'Fiber', unit: 'g', gradient: 'from-amber-50 to-amber-100', accent: 'text-amber-500' },
  { key: 'sugar', label: 'Sugar', unit: 'g', gradient: 'from-pink-50 to-pink-100', accent: 'text-pink-500' },
]

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

const COMMON_SINGLE_FOOD_SUGGESTIONS: Array<{ name: string; serving_size?: string }> = [
  { name: 'Milk, whole', serving_size: '100 g' },
  { name: 'Milk, lowfat', serving_size: '100 g' },
  { name: 'Milk, nonfat', serving_size: '100 g' },
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

const MEASUREMENT_LIST_SUGGESTIONS: Array<{ name: string; serving_size?: string; __searchQuery?: string }> = [
  ...PRODUCE_MEASUREMENTS.map((item) => ({
    name: item.food,
    serving_size: '100 g',
    __searchQuery: item.food,
  })),
  ...DRY_FOOD_MEASUREMENTS.map((item) => ({
    name: item.food,
    serving_size: '100 g',
    __searchQuery: item.food,
  })),
  ...DAIRY_SEMI_SOLID_MEASUREMENTS.map((item) => ({
    name: item.food,
    serving_size: '100 g',
    __searchQuery: item.food,
  })),
]

const ENABLE_SINGLE_SUGGESTIONS = false

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

const getSearchTokens = (value: string) => normalizeSearchToken(value).split(' ').filter(Boolean)

const getLastSearchToken = (searchQuery: string) => {
  const tokens = getSearchTokens(searchQuery)
  return tokens.length > 0 ? tokens[tokens.length - 1] : ''
}

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

// PROTECTED: BUILD_MEAL_SEARCH_CORE START
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
  kind: 'packaged' | 'single',
  options?: { allowTypo?: boolean },
) => {
  if (kind === 'single')
    return nameMatchesSearchQuery(item?.name || '', searchQuery, { requireFirstWord: false, allowTypo: options?.allowTypo })
  const combined = [item?.brand, item?.name].filter(Boolean).join(' ')
  const rawTokens = getSearchTokens(searchQuery).filter(Boolean)

  const tokenStartsWord = (word: string, token: string) => {
    if (!word || !token) return false
    if (word.startsWith(token)) return true
    const singularWord = singularizeToken(word)
    if (singularWord !== word && singularWord.startsWith(token)) return true
    const singularToken = singularizeToken(token)
    if (singularToken !== token && word.startsWith(singularToken)) return true
    if (singularToken !== token && singularWord !== word && singularWord.startsWith(singularToken)) return true
    const allowTypo = (options?.allowTypo ?? false) && token.length >= 3 && token[0] === word[0]
    if (!allowTypo) return false
    const prefixSame = word.slice(0, token.length)
    if (prefixSame && isOneEditAway(token, prefixSame)) return true
    const prefixLonger = word.slice(0, token.length + 1)
    if (prefixLonger && isOneEditAway(token, prefixLonger)) return true
    return false
  }

  // Word-by-word intent: once users start word #2, keep the current word in control.
  if (rawTokens.length > 1) {
    const words = getSearchTokens(combined || item?.name || '').filter(Boolean)
    const activeToken = rawTokens[rawTokens.length - 1] || ''
    if (!activeToken || words.length === 0) return false
    const activeMatch = words.some((word) => tokenStartsWord(word, activeToken))
    if (!activeMatch) return false
    const compactHaystack = normalizeBrandToken(combined || item?.name || '')
    const leadingTokens = rawTokens.slice(0, -1).filter((token) => token.length >= 2)
    const leadingMatch = leadingTokens.every((token) => {
      const normalized = normalizeBrandToken(token)
      if (normalized && compactHaystack.includes(normalized)) return true
      const singular = normalizeBrandToken(singularizeToken(token))
      if (singular && compactHaystack.includes(singular)) return true
      return false
    })
    if (!leadingMatch) return false
    return true
  }

  return nameMatchesSearchQuery(combined || item?.name || '', searchQuery, { requireFirstWord: false, allowTypo: options?.allowTypo })
}

const filterItemsForQuery = (
  items: NormalizedFoodItem[],
  searchQuery: string,
  kind: 'packaged' | 'single',
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
  const rawTokens = getSearchTokens(searchQuery).filter(Boolean)
  if (rawTokens.length <= 1) return searchQuery
  const brandTokens = getBrandMatchTokens(searchQuery)
  const firstBrand = brandTokens[0] || ''
  const tailToken = rawTokens[rawTokens.length - 1] || ''
  if (firstBrand) {
    if (tailToken.length >= 1 && normalizeBrandToken(tailToken) !== firstBrand) {
      return `${firstBrand} ${tailToken}`.trim()
    }
    return firstBrand
  }
  return searchQuery
}
// PROTECTED: BUILD_MEAL_SEARCH_CORE END

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

const buildInstantSuggestions = (searchQuery: string): NormalizedFoodItem[] => {
  if (!ENABLE_SINGLE_SUGGESTIONS) return []
  const tokens = getSearchTokens(searchQuery)
  if (!tokens.some((token) => token.length >= 2)) return []
  const normalizedQuery = normalizeSearchToken(searchQuery)
  const matches = [...MEASUREMENT_LIST_SUGGESTIONS, ...COMMON_SINGLE_FOOD_SUGGESTIONS].filter((item) =>
    (normalizedQuery.length >= 4 && normalizeSearchToken(item.name).includes(normalizedQuery)) ||
    nameMatchesSearchQuery(item.name, searchQuery, { requireFirstWord: false }),
  )
  return matches.slice(0, 8).map((item) => ({
    source: 'usda',
    id: `suggest:${normalizeSearchToken(item.name)}`,
    name: item.name,
    serving_size: item.serving_size || '100 g',
    __suggestion: true,
    __searchQuery: (item as any).__searchQuery || item.name,
  }))
}

const mergeSearchSuggestions = (items: NormalizedFoodItem[], searchQuery: string) => {
  const suggestions = buildInstantSuggestions(searchQuery)
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

const buildSearchCacheKey = (kind: 'packaged' | 'single') => `builder:${kind}`

const getCachedSearchResults = (
  q: string,
  kind: 'packaged' | 'single',
  cache: Map<string, { items: NormalizedFoodItem[]; at: number }>,
) => {
  const cached = cache.get(buildSearchCacheKey(kind))
  if (!cached || !Array.isArray(cached.items) || cached.items.length === 0) return []
  const hasToken = getSearchTokens(q).some((token) => token.length >= 1)
  const filtered = hasToken ? filterItemsForQuery(cached.items, q, kind, { allowTypoFallback: false }) : cached.items
  return filtered.slice(0, 20)
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

const DEFAULT_SERVING_GRAMS = 100

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
  handful: 30,
  piece: 100,
  'piece-small': 100,
  'piece-medium': 100,
  'piece-large': 100,
  'piece-extra-large': 100,
  'egg-small': 38,
  'egg-medium': 44,
  'egg-large': 50,
  'egg-extra-large': 56,
  slice: 30,
  serving: DEFAULT_SERVING_GRAMS,
}

const OPEN_UNITS: BuilderUnit[] = ['g', 'ml', 'oz']
const isOpenUnit = (unit?: BuilderUnit | null) => (unit ? OPEN_UNITS.includes(unit) : false)

type FoodUnitGrams = Partial<Record<BuilderUnit, number>>

type FoodAlias = {
  tokens: string[]
  entryIndex: number
  score: number
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

const RECIPE_LOOKUP_DESCRIPTORS = new Set([
  'fresh',
  'frozen',
  'store',
  'bought',
  'store-bought',
  'finely',
  'roughly',
  'thinly',
  'thickly',
  'chopped',
  'diced',
  'minced',
  'ground',
  'grated',
  'sliced',
  'peeled',
  'crushed',
  'boneless',
  'skinless',
  'trimmed',
  'halved',
  'quartered',
  'optional',
  'plus',
  'more',
  'to',
  'or',
  'garnish',
  'taste',
  'parts',
  'part',
  'tied',
  'such',
  'as',
  'and',
  'good',
  'free-range',
  'extra',
  'virgin',
  'large',
  'medium',
  'small',
])

const RECIPE_LOOKUP_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'or',
  'the',
  'of',
  'to',
  'for',
  'with',
  'in',
  'on',
  'as',
  'from',
  'into',
  'about',
  'around',
  'fresh',
  'good',
  'plus',
  'more',
])

const RECIPE_LOOKUP_PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bstore[\s-]*bought\b/gi, ' '],
  [/\bfresh\s+or\s+frozen\b/gi, ' '],
  [/\byellow onions?\b/gi, 'onion'],
  [/\bwhite onions?\b/gi, 'onion'],
  [/\bbrown onions?\b/gi, 'onion'],
  [/\bgreen onions?\b/gi, 'spring onion'],
  [/\bscallions?\b/gi, 'spring onion'],
  [/\bspring onions?\b/gi, 'spring onion'],
  [/\bcloves of garlic\b/gi, 'garlic'],
]

const normalizeFoodValue = (value: string) => {
  let normalized = value.toLowerCase().replace(/&/g, ' and ')
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  FOOD_VARIANT_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement)
  })
  return normalized.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

const tokenizeFoodValue = (value: string) =>
  normalizeFoodValue(value)
    .split(' ')
    .map((token) => singularizeToken(token))
    .filter(Boolean)

const EGG_UNITS: BuilderUnit[] = ['egg-small', 'egg-medium', 'egg-large', 'egg-extra-large']
const EGG_UNIT_GRAMS: FoodUnitGrams = {
  'egg-small': UNIT_GRAMS['egg-small'],
  'egg-medium': UNIT_GRAMS['egg-medium'],
  'egg-large': UNIT_GRAMS['egg-large'],
  'egg-extra-large': UNIT_GRAMS['egg-extra-large'],
}

type CountSizeHint = 'small' | 'medium' | 'large' | 'extra-large'

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

const buildDryFoodUnitGrams = (entry: (typeof DRY_FOOD_MEASUREMENTS)[number]): FoodUnitGrams => ({
  pinch: entry.pinch_g,
  tsp: entry.tsp_g,
  tbsp: entry.tbsp_g,
  'quarter-cup': entry.quarter_cup_g,
  'half-cup': entry.half_cup_g,
  'three-quarter-cup': entry.three_quarter_cup_g,
  cup: entry.cup_g,
})

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

const DRY_FOOD_ALIASES = buildFoodAliases(DRY_FOOD_MEASUREMENTS)
const DRY_FOOD_LOOKUP_CACHE = new Map<string, FoodUnitGrams | null>()

const getDryFoodUnitGrams = (name: string | null | undefined): FoodUnitGrams | null =>
  resolveFoodUnitGrams(name, DRY_FOOD_MEASUREMENTS, DRY_FOOD_ALIASES, DRY_FOOD_LOOKUP_CACHE, buildDryFoodUnitGrams)

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

const DAIRY_SEMI_SOLID_ALIASES = buildFoodAliases(DAIRY_SEMI_SOLID_MEASUREMENTS)
const DAIRY_SEMI_SOLID_LOOKUP_CACHE = new Map<string, FoodUnitGrams | null>()

const getDairySemiSolidUnitGrams = (name: string | null | undefined): FoodUnitGrams | null =>
  resolveFoodUnitGrams(
    name,
    DAIRY_SEMI_SOLID_MEASUREMENTS,
    DAIRY_SEMI_SOLID_ALIASES,
    DAIRY_SEMI_SOLID_LOOKUP_CACHE,
    buildDairySemiSolidUnitGrams,
  )

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

const PRODUCE_ALIASES = buildFoodAliases(PRODUCE_MEASUREMENTS)
const PRODUCE_LOOKUP_CACHE = new Map<string, FoodUnitGrams | null>()

const getProduceUnitGrams = (name: string | null | undefined): FoodUnitGrams | null =>
  resolveFoodUnitGrams(name, PRODUCE_MEASUREMENTS, PRODUCE_ALIASES, PRODUCE_LOOKUP_CACHE, buildProduceUnitGrams)

const getFoodUnitGrams = (name: string | null | undefined): FoodUnitGrams | null =>
  (isEggFood(name) ? EGG_UNIT_GRAMS : null) || getProduceUnitGrams(name) || getDairySemiSolidUnitGrams(name) || getDryFoodUnitGrams(name)

const ALL_UNITS: BuilderUnit[] = [
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
  'handful',
  'piece',
  'piece-small',
  'piece-medium',
  'piece-large',
  'piece-extra-large',
  'egg-small',
  'egg-medium',
  'egg-large',
  'egg-extra-large',
  'slice',
  'serving',
]

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

const parseServingBase = (servingSize: any): { amount: number | null; unit: BuilderUnit | null } => {
  const raw = String(servingSize || '').trim()
  if (!raw) return { amount: null, unit: null }

  // Prefer values inside parentheses: "1 breast (187 g)"
  const paren = raw.match(/\(([^)]*)\)/)
  const target = paren?.[1] ? paren[1] : raw

  const parseAmount = (value: string): number | null => {
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

  const m = target.match(
    /(\d+(?:\.\d+)?(?:\s+\d+\s*\/\s*\d+)?|\d+\s*\/\s*\d+)\s*(g|grams?|ml|mL|oz|ounces?|tsp|teaspoons?|tbsp|tablespoons?|cup|cups?|pinch|pinches|handful|handfuls|piece|pieces|slice|slices|serving|servings)/i,
  )
  if (!m) {
    const lower = target.toLowerCase()
    if (/\bpinch(es)?\b/.test(lower)) return { amount: 1, unit: 'pinch' }
    if (/\bhandfuls?\b/.test(lower)) return { amount: 1, unit: 'handful' }
    if (/\bpieces?\b/.test(lower)) return { amount: 1, unit: 'piece' }
    if (/\bslices?\b/.test(lower)) return { amount: 1, unit: 'slice' }
    if (/\bservings?\b/.test(lower)) return { amount: 1, unit: 'serving' }
    return { amount: null, unit: null }
  }
  const amount = parseAmount(m[1])
  if (!amount || !Number.isFinite(amount) || amount <= 0) return { amount: null, unit: null }
  const unitRaw = String(m[2] || '').toLowerCase()

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

const seedBaseServing = (base: { amount: number | null; unit: BuilderUnit | null }) => {
  if (base.amount && base.unit) return base
  return { amount: 1, unit: 'serving' as BuilderUnit }
}

const normalizeLegacyBaseUnit = (amount: number | null, unit: BuilderUnit | null) => {
  if (!amount || !unit) return { amount, unit }
  if (unit === 'serving') return { amount: amount * DEFAULT_SERVING_GRAMS, unit: 'g' as BuilderUnit }
  if (unit === 'slice') return { amount: amount * UNIT_GRAMS.slice, unit: 'g' as BuilderUnit }
  if (unit === 'handful') return { amount: amount * UNIT_GRAMS.handful, unit: 'g' as BuilderUnit }
  return { amount, unit }
}

const isGenericSizeLabel = (label: string) => {
  const l = (label || '').toLowerCase().trim()
  if (!l) return false
  return ['small', 'medium', 'large', 'extra large', 'extra-large', 'xl', 'jumbo', 'mini', 'regular'].includes(l)
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

const DISCRETE_UNIT_TERMS = [
  'egg','eggs','piece','pieces','slice','slices','bacon','rasher','rashers','strip','strips','sausage','sausages',
  'link','links','patty','pattie','nugget','nuggets','wing','wings','meatball','meatballs','bar','stick','cookie',
  'biscuit','cracker','pancake','scoop','banana','apple','tomato','potato','onion','carrot','zucchini','courgette',
  'bun','roll','sandwich','burger'
]

const isDiscreteUnitLabel = (label: string) => {
  const l = (label || '').toLowerCase().trim()
  if (!l) return false
  return DISCRETE_UNIT_TERMS.some((term) => l.includes(term))
}

const normalizeServingOptionLabel = (option: ServingOption, itemName: string) => {
  const raw = String(option?.label || option?.serving_size || '').trim()
  if (!raw) return raw
  const grams = Number(option?.grams)
  const base = raw.split('—')[0]?.trim() || raw
  if (isGenericSizeLabel(base) && itemName) {
    const gramsLabel = Number.isFinite(grams) && grams > 0 ? ` — ${Math.round(grams)}g` : ''
    return `1 ${base} ${itemName}${gramsLabel}`.trim()
  }
  return raw
}

const normalizeServingOptionsForItem = (options: ServingOption[], itemName: string) =>
  options.map((opt) => ({
    ...opt,
    label: normalizeServingOptionLabel(opt, itemName),
  }))

const extractPieceGramsFromLabel = (label: string) => {
  const meta = parseServingUnitMeta(label)
  if (!meta || !isDiscreteUnitLabel(meta.unitLabel)) return null
  const parsed = parseServingBase(label)
  if (!parsed.amount || parsed.unit !== 'g') return null
  if (meta.quantity <= 0) return null
  return parsed.amount / meta.quantity
}


const isLikelyLiquidItem = (nameRaw: string, servingRaw?: string | null) => {
  const name = String(nameRaw || '').toLowerCase()
  const serving = String(servingRaw || '').toLowerCase()
  const label = `${name} ${serving}`.trim()
  if (!label) return false

  const solidHints = ['powder', 'mix', 'bar', 'granola', 'bread', 'cookie', 'chips', 'crisps', 'cracker']
  if (solidHints.some((hint) => label.includes(hint))) return false

  const liquidHints = [
    'milk',
    'juice',
    'water',
    'soda',
    'drink',
    'beverage',
    'tea',
    'coffee',
    'broth',
    'soup',
    'wine',
    'beer',
    'smoothie',
    'shake',
    'oil',
    'vinegar',
    'syrup',
  ]
  return liquidHints.some((hint) => label.includes(hint))
}

const isLikelyPieceItem = (nameRaw: string, servingRaw?: string | null) => {
  const name = String(nameRaw || '').toLowerCase()
  const serving = String(servingRaw || '').toLowerCase()
  const label = `${name} ${serving}`.trim()
  if (!label) return false

  if (/\b(piece|pieces|whole|medium|large|small)\b/.test(label)) return true

  const produceHints = [
    'carrot',
    'zucchini',
    'apple',
    'banana',
    'orange',
    'pear',
    'tomato',
    'potato',
    'onion',
    'cucumber',
    'pepper',
    'capsicum',
    'mushroom',
    'broccoli',
    'cauliflower',
  ]
  return produceHints.some((hint) => label.includes(hint))
}

const resolveUnitGrams = (
  unit: BuilderUnit,
  baseAmount?: number | null,
  baseUnit?: BuilderUnit | null,
  pieceGrams?: number | null,
  foodUnitGrams?: FoodUnitGrams | null,
) => {
  const foodOverride = foodUnitGrams?.[unit]
  if (Number.isFinite(Number(foodOverride)) && Number(foodOverride) > 0) return Number(foodOverride)
  if (
    unit === 'piece' ||
    unit === 'piece-small' ||
    unit === 'piece-medium' ||
    unit === 'piece-large' ||
    unit === 'piece-extra-large'
  ) {
    if (pieceGrams && pieceGrams > 0) return pieceGrams
    return UNIT_GRAMS.piece
  }
  if (
    (unit === 'serving' || unit === 'slice' || unit === 'handful') &&
    baseAmount &&
    baseUnit &&
    Object.prototype.hasOwnProperty.call(UNIT_GRAMS, baseUnit)
  ) {
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
  if (!Number.isFinite(amount)) return amount
  if (from === to) return amount

  const weightUnits: BuilderUnit[] = [...ALL_UNITS]

  // Weight conversions
  if (weightUnits.includes(from) && weightUnits.includes(to)) {
    const fromGrams = resolveUnitGrams(from, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
    const toGrams = resolveUnitGrams(to, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
    if (!Number.isFinite(fromGrams) || !Number.isFinite(toGrams) || toGrams <= 0) return amount
    const grams = amount * fromGrams
    return grams / toGrams
  }
  return amount
}

const allowedUnitsForItem = (item?: BuilderItem) => {
  let units = [...DISPLAY_UNITS]
  if (isEggFood(item?.name || '')) {
    const disallowed = new Set<BuilderUnit>([
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
      'piece-extra-large',
    ])
    units = units.filter((unit) => !disallowed.has(unit) && !EGG_UNITS.includes(unit))
    return [...units, ...EGG_UNITS]
  }
  const pieceGrams = item?.__pieceGrams
  const produceUnits = item?.name ? getProduceUnitGrams(item.name) : null
  const isProduce = Boolean(produceUnits)
  if (isProduce) units = units.filter((u) => u !== 'tsp' && u !== 'tbsp' && u !== 'pinch')
  const hasPieceSmall = Number.isFinite(Number(produceUnits?.['piece-small'])) && Number(produceUnits?.['piece-small']) > 0
  const hasPieceMedium = Number.isFinite(Number(produceUnits?.['piece-medium'])) && Number(produceUnits?.['piece-medium']) > 0
  const hasPieceLarge = Number.isFinite(Number(produceUnits?.['piece-large'])) && Number(produceUnits?.['piece-large']) > 0
  const hasPieceExtraLarge =
    Number.isFinite(Number(produceUnits?.['piece-extra-large'])) && Number(produceUnits?.['piece-extra-large']) > 0
  if (hasPieceSmall || hasPieceMedium || hasPieceLarge) {
    units = units.filter((u) => u !== 'piece')
  } else if (!pieceGrams || pieceGrams <= 0) {
    units = units.filter((u) => u !== 'piece')
  }
  if (!hasPieceSmall) units = units.filter((u) => u !== 'piece-small')
  if (!hasPieceMedium) units = units.filter((u) => u !== 'piece-medium')
  if (!hasPieceLarge) units = units.filter((u) => u !== 'piece-large')
  if (!hasPieceExtraLarge) units = units.filter((u) => u !== 'piece-extra-large')
  return units
}

const formatUnitLabel = (unit: BuilderUnit, item?: BuilderItem) => {
  const foodUnitGrams = item?.name ? getFoodUnitGrams(item.name) : null
  const produceUnits = item?.name ? getProduceUnitGrams(item.name) : null
  const normalizedProduceName = produceUnits ? normalizeFoodValue(String(item?.name || '').trim()) : ''
  const produceName = (() => {
    if (!normalizedProduceName) return ''
    // For garlic, "piece" is almost always a clove.
    if (/\bgarlic\b/.test(normalizedProduceName) && !/\b(powder|granules?)\b/.test(normalizedProduceName)) return 'clove'
    return normalizedProduceName
  })()
  const unitValue = foodUnitGrams?.[unit]
  if (unit === 'g') return 'g'
  if (unit === 'tsp') return `tsp — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 5}g`
  if (unit === 'tbsp') return `tbsp — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 14}g`
  if (unit === 'quarter-cup') return `1/4 cup — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 54.5}g`
  if (unit === 'half-cup') return `1/2 cup — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 109}g`
  if (unit === 'three-quarter-cup') return `3/4 cup — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 163.5}g`
  if (unit === 'cup') return `cup — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 218}g`
  if (unit === 'oz') return 'oz'
  if (unit === 'ml') return 'ml'
  if (unit === 'pinch') return `pinch — ${Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? round3(Number(unitValue)) : 0.3}g`
  if (unit === 'egg-small') {
    const grams = Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : UNIT_GRAMS['egg-small']
    return `small egg — ${Math.round(grams * 10) / 10}g`
  }
  if (unit === 'egg-medium') {
    const grams = Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : UNIT_GRAMS['egg-medium']
    return `medium egg — ${Math.round(grams * 10) / 10}g`
  }
  if (unit === 'egg-large') {
    const grams = Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : UNIT_GRAMS['egg-large']
    return `large egg — ${Math.round(grams * 10) / 10}g`
  }
  if (unit === 'egg-extra-large') {
    const grams = Number.isFinite(Number(unitValue)) && Number(unitValue) > 0 ? Number(unitValue) : UNIT_GRAMS['egg-extra-large']
    return `extra large egg — ${Math.round(grams * 10) / 10}g`
  }
  if (unit === 'piece') {
    const grams = item?.__pieceGrams
    if (grams && grams > 0) return `piece — ${Math.round(grams * 10) / 10}g`
    return 'piece'
  }
  if (unit === 'piece-small') {
    const grams = Number(unitValue)
    if (Number.isFinite(grams) && grams > 0) {
      if (produceName) return `small ${produceName} — ${Math.round(grams * 10) / 10}g`
      return `small piece — ${Math.round(grams * 10) / 10}g`
    }
    return produceName ? `small ${produceName}` : 'small piece'
  }
  if (unit === 'piece-medium') {
    const grams = Number(unitValue)
    if (Number.isFinite(grams) && grams > 0) {
      if (produceName) return `medium ${produceName} — ${Math.round(grams * 10) / 10}g`
      return `medium piece — ${Math.round(grams * 10) / 10}g`
    }
    return produceName ? `medium ${produceName}` : 'medium piece'
  }
  if (unit === 'piece-large') {
    const grams = Number(unitValue)
    if (Number.isFinite(grams) && grams > 0) {
      if (produceName) return `large ${produceName} — ${Math.round(grams * 10) / 10}g`
      return `large piece — ${Math.round(grams * 10) / 10}g`
    }
    return produceName ? `large ${produceName}` : 'large piece'
  }
  if (unit === 'piece-extra-large') {
    const grams = Number(unitValue)
    if (Number.isFinite(grams) && grams > 0) {
      if (produceName) return `extra large ${produceName} — ${Math.round(grams * 10) / 10}g`
      return `extra large piece — ${Math.round(grams * 10) / 10}g`
    }
    return produceName ? `extra large ${produceName}` : 'extra large piece'
  }
  return unit
}

const getAmountInputStepForUnit = (unit: BuilderUnit | null | undefined) => {
  if (!unit) return 1
  if (unit === 'oz') return 0.1
  if (unit === 'tsp' || unit === 'tbsp') return 0.1
  if (unit === 'quarter-cup' || unit === 'half-cup' || unit === 'three-quarter-cup' || unit === 'cup') return 0.1
  if (unit === 'pinch' || unit === 'handful') return 0.1
  if (unit === 'piece' || unit === 'piece-small' || unit === 'piece-medium' || unit === 'piece-large') return 1
  if (unit === 'slice' || unit === 'serving') return 1
  return 1
}

const macroOrZero = (v: any) => {
  const num = typeof v === 'number' && Number.isFinite(v) ? v : 0
  return Math.max(0, num) // Clamp to >= 0 to prevent negative macros
}

const computeServingsFromAmount = (item: BuilderItem) => {
  const baseAmount = item.__baseAmount
  const baseUnit = item.__baseUnit
  const unit = item.__unit || baseUnit
  const amount = Number(item.__amount)
  const pieceGrams = item.__pieceGrams
  const foodUnitGrams = getFoodUnitGrams(item.name)
  if (baseAmount && baseUnit && unit && Number.isFinite(amount)) {
    const inBase = convertAmount(amount, unit, baseUnit, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
    const servings = baseAmount > 0 ? inBase / baseAmount : 0
    return round3(Math.max(0, servings))
  }
  const fallback = Number.isFinite(Number(item.servings)) ? Number(item.servings) : Number(amount)
  return round3(Math.max(0, fallback || 0))
}

const computeItemTotals = (item: BuilderItem) => {
  const servings = computeServingsFromAmount(item)
  const protein = macroOrZero(item.protein_g)
  const carbs = macroOrZero(item.carbs_g)
  const fat = macroOrZero(item.fat_g)
  const fiber = macroOrZero(item.fiber_g)
  let calories = macroOrZero(item.calories)
  if (!Number.isFinite(calories) || calories <= 0) {
    const macroEnergy = protein * 4 + carbs * 4 + fat * 9
    calories = Number.isFinite(macroEnergy) && macroEnergy > 0 ? macroEnergy : 0
  }
  return {
    calories: calories * servings,
    protein: protein * servings,
    carbs: carbs * servings,
    fat: fat * servings,
    fiber: fiber * servings,
    sugar: macroOrZero(item.sugar_g) * servings,
  }
}

const unitToGrams = (
  amount: number,
  unit: BuilderUnit,
  pieceGrams?: number | null,
  baseAmount?: number | null,
  baseUnit?: BuilderUnit | null,
  foodUnitGrams?: FoodUnitGrams | null,
): number | null => {
  if (!Number.isFinite(amount)) return null
  const gramsPerUnit = resolveUnitGrams(unit, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
  if (!Number.isFinite(gramsPerUnit)) return null
  return amount * gramsPerUnit
}

const parseNumericInput = (value: any): number | null => {
  const raw = String(value ?? '').replace(',', '.').trim()
  if (!raw) return null
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

const computeTotalRecipeWeightG = (items: BuilderItem[]) => {
  let total = 0
  for (const it of items) {
    const servings = computeServingsFromAmount(it)
    const baseAmount = it?.__baseAmount
    const baseUnit = it?.__baseUnit
    const pieceGrams = it?.__pieceGrams
    const foodUnitGrams = getFoodUnitGrams(it?.name)
    if (baseAmount && baseUnit) {
      const perServing = unitToGrams(baseAmount, baseUnit, pieceGrams, baseAmount, baseUnit, foodUnitGrams)
      if (perServing && Number.isFinite(perServing)) {
        total += perServing * servings
        continue
      }
    }
    const unit = (it?.__unit || it?.__baseUnit) as BuilderUnit | null
    if (!unit) continue
    const grams = unitToGrams(Number(it.__amount || 0), unit, pieceGrams, baseAmount, baseUnit, foodUnitGrams)
    if (grams && Number.isFinite(grams)) total += grams
  }
  return total
}

const computePortionWeightG = (
  amountRaw: any,
  unit: PortionUnit,
  totalRecipeWeightG: number | null | undefined,
  recipeServings: number | null | undefined,
) => {
  const amount = parseNumericInput(amountRaw)
  if (!amount || amount <= 0) return null
  if (unit === 'serving') {
    if (!totalRecipeWeightG || !Number.isFinite(totalRecipeWeightG) || totalRecipeWeightG <= 0) return null
    const servings = Number(recipeServings)
    if (!Number.isFinite(servings) || servings <= 0) return null
    const grams = (totalRecipeWeightG * amount) / servings
    return Number.isFinite(grams) && grams > 0 ? grams : null
  }
  const grams = unitToGrams(amount, unit === 'oz' ? 'oz' : 'g')
  return grams && Number.isFinite(grams) ? grams : null
}

const computePortionScale = (
  amountRaw: any,
  unit: PortionUnit,
  totalRecipeWeightG: number | null | undefined,
  recipeServings: number | null | undefined,
) => {
  const amount = parseNumericInput(amountRaw)
  if (!amount || amount <= 0) return 1
  if (unit === 'serving') {
    const servings = Number(recipeServings)
    if (!Number.isFinite(servings) || servings <= 0) return 1
    const raw = amount / servings
    if (!Number.isFinite(raw) || raw <= 0) return 1
    return raw
  }
  if (!totalRecipeWeightG || !Number.isFinite(totalRecipeWeightG) || totalRecipeWeightG <= 0) return 1
  const grams = unitToGrams(amount, unit === 'oz' ? 'oz' : 'g')
  if (!grams || !Number.isFinite(grams) || grams <= 0) return 1
  const raw = grams / totalRecipeWeightG
  if (!Number.isFinite(raw) || raw <= 0) return 1
  return raw
}

const applyPortionScaleToTotals = (
  totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number },
  scale: number,
) => {
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return totals
  return {
    calories: Math.max(0, Math.round(totals.calories * scale)),
    protein: Math.max(0, Math.round(totals.protein * scale * 10) / 10),
    carbs: Math.max(0, Math.round(totals.carbs * scale * 10) / 10),
    fat: Math.max(0, Math.round(totals.fat * scale * 10) / 10),
    fiber: Math.max(0, Math.round(totals.fiber * scale * 10) / 10),
    sugar: Math.max(0, Math.round(totals.sugar * scale * 10) / 10),
  }
}

const buildItemsSignature = (items: BuilderItem[] | null | undefined) => {
  if (!Array.isArray(items) || items.length === 0) return ''
  const parts = items.map((it) => {
    const id = typeof it?.id === 'string' ? it.id : ''
    const name = String(it?.name || '').trim().toLowerCase()
    const amount = Number.isFinite(Number(it?.__amount)) ? String(round3(Number(it.__amount))) : ''
    const unit = typeof it?.__unit === 'string' ? it.__unit : ''
    const serving = String(it?.serving_size || '').trim().toLowerCase()
    return [id, name, amount, unit, serving].filter(Boolean).join('~')
  })
  return parts.filter(Boolean).sort().join('|')
}

const buildRawItemsSignature = (items: any[] | null | undefined) => {
  if (!Array.isArray(items) || items.length === 0) return ''
  const parts = items.map((it) => {
    const id = typeof it?.id === 'string' ? it.id : ''
    const name = String(it?.name || it?.label || '').trim().toLowerCase()
    const amount = Number.isFinite(Number(it?.weightAmount))
      ? String(round3(Number(it.weightAmount)))
      : Number.isFinite(Number(it?.amount))
      ? String(round3(Number(it.amount)))
      : ''
    const unit = typeof it?.weightUnit === 'string' ? it.weightUnit : typeof it?.unit === 'string' ? it.unit : ''
    const serving = String(it?.serving_size || '').trim().toLowerCase()
    return [id, name, amount, unit, serving].filter(Boolean).join('~')
  })
  return parts.filter(Boolean).sort().join('|')
}

const parseFavoriteItems = (fav: any): any[] | null => {
  if (!fav) return null
  const candidate = (fav as any)?.items
  if (Array.isArray(candidate)) return candidate
  if (typeof candidate === 'string') {
    try {
      const parsed = JSON.parse(candidate)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

const extractTotalsSignature = (totals: any) => {
  if (!totals || typeof totals !== 'object') return null
  const toNumber = (value: any) => {
    const parsed = typeof value === 'string' ? parseFloat(value) : Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return {
    calories: toNumber((totals as any).calories),
    protein: toNumber((totals as any).protein ?? (totals as any).protein_g),
    carbs: toNumber((totals as any).carbs ?? (totals as any).carbs_g),
    fat: toNumber((totals as any).fat ?? (totals as any).fat_g),
    fiber: toNumber((totals as any).fiber ?? (totals as any).fiber_g),
    sugar: toNumber((totals as any).sugar ?? (totals as any).sugar_g),
  }
}

const normalizeSyncLabel = (value: any) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const totalsMatch = (left: any, right: any) => {
  const a = extractTotalsSignature(left)
  const b = extractTotalsSignature(right)
  if (!a || !b) return false
  const within = (x: number | null, y: number | null, tolerance: number) => {
    if (x === null || y === null) return false
    return Math.abs(x - y) <= tolerance
  }
  return (
    within(a.calories, b.calories, 2) &&
    within(a.protein, b.protein, 0.2) &&
    within(a.carbs, b.carbs, 0.2) &&
    within(a.fat, b.fat, 0.2)
  )
}

const sanitizeMealTitle = (v: string) => v.replace(/\s+/g, ' ').trim()

const buildDefaultMealName = (items: BuilderItem[]) => {
  const names = items.map((i) => String(i?.name || '').trim()).filter(Boolean)
  if (names.length === 0) return 'Meal'
  const head = names.slice(0, 3).join(', ')
  return names.length > 3 ? `${head}…` : head
}

export default function MealBuilderClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userData, updateUserData } = useUserData()

  const [foodNameOverridesFallback, setFoodNameOverridesFallback] = useState<any[] | null>(null)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('food:nameOverrides')
      const parsed = raw ? JSON.parse(raw) : null
      if (Array.isArray(parsed)) setFoodNameOverridesFallback(parsed)
    } catch {}
  }, [])
  const rawFoodNameOverrides = (userData as any)?.foodNameOverrides
  const foodNameOverrides = useMemo(() => {
    if (Array.isArray(rawFoodNameOverrides)) return rawFoodNameOverrides
    return foodNameOverridesFallback || []
  }, [rawFoodNameOverrides, foodNameOverridesFallback])
  useEffect(() => {
    if (!Array.isArray(rawFoodNameOverrides)) return
    try {
      localStorage.setItem('food:nameOverrides', JSON.stringify(rawFoodNameOverrides))
    } catch {}
  }, [rawFoodNameOverrides])
  const foodNameOverrideIndex = useMemo(() => createFoodNameOverrideIndex(foodNameOverrides), [foodNameOverrides])

  const initialDate = searchParams.get('date') || buildTodayIso()
  const initialCategory = normalizeCategory(searchParams.get('category'))
  const editFavoriteId = (searchParams.get('editFavoriteId') || '').trim()
  const sourceLogId = (searchParams.get('sourceLogId') || '').trim()
  const recipeImportFlag = (searchParams.get('recipeImport') || '').trim()
  const fromFavoriteAdjust = (searchParams.get('fromFavoriteAdjust') || '').trim() === '1'

  const [selectedDate] = useState<string>(initialDate)
  const [category] = useState<MealCategory>(initialCategory)

  const [mealName, setMealName] = useState('')
  const mealNameBackupRef = useRef<string>('')
  const mealNameEditedRef = useRef(false)
  const mealNameWasClearedOnFocusRef = useRef(false)

  const [energyUnit, setEnergyUnit] = useState<'kcal' | 'kJ'>('kcal')
  const [query, setQuery] = useState('')
  const queryBackupRef = useRef<string>('')
  const queryWasClearedOnFocusRef = useRef(false)
  const queryEditedAfterClearRef = useRef(false)
  const amountBackupRef = useRef<Map<string, string>>(new Map())
  const amountWasClearedOnFocusRef = useRef<Set<string>>(new Set())
  const amountEditedAfterClearRef = useRef<Set<string>>(new Set())
  const [kind, setKind] = useState<'packaged' | 'single'>('packaged')
  const [searchLoading, setSearchLoading] = useState(false)
  const [savingMeal, setSavingMeal] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<NormalizedFoodItem[]>([])
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [loadedFavoriteId, setLoadedFavoriteId] = useState<string | null>(null)
  const [linkedFavoriteId, setLinkedFavoriteId] = useState<string>('')
  const [favoriteSaving, setFavoriteSaving] = useState(false)

  const [items, setItems] = useState<BuilderItem[]>([])
  const itemsRef = useRef<BuilderItem[]>([])
  const editFavoriteSourceItemsRef = useRef<any[] | null>(null)
  const editFavoriteIsCustomRef = useRef(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // RECIPE LOCK (owner request): reopened saved recipes must support one top-level ingredients expander.
  // Default collapsed in edit/reopen mode; keep enabled in first-time build flow.
  // Do not remove/change without explicit written owner approval.
  const [ingredientsListExpanded, setIngredientsListExpanded] = useState(true)
  const [lastRemoved, setLastRemoved] = useState<{ item: BuilderItem; index: number } | null>(null)
  const undoRemoveTimeoutRef = useRef<any>(null)
  const [portionControlEnabled, setPortionControlEnabled] = useState(false)
  const [portionAmountInput, setPortionAmountInput] = useState('')
  const [portionUnit, setPortionUnit] = useState<PortionUnit>('g')
  const [recipeServingsForPortion, setRecipeServingsForPortion] = useState<number | null>(null)
  const searchDebounceRef = useRef<number | null>(null)
  const brandSearchDebounceRef = useRef<number | null>(null)
  const [brandSuggestions, setBrandSuggestions] = useState<NormalizedFoodItem[]>([])
  const brandSuggestionsRef = useRef<NormalizedFoodItem[]>([])
  const searchCacheRef = useRef<Map<string, { items: NormalizedFoodItem[]; at: number }>>(new Map())
  const servingOptionsCacheRef = useRef<Map<string, ServingOption[]>>(new Map())
  const servingOptionsPendingRef = useRef<Set<string>>(new Set())
  const importResolveCacheRef = useRef<Map<string, NormalizedFoodItem | null>>(new Map())
  const importSearchCacheRef = useRef<Map<string, NormalizedFoodItem[]>>(new Map())
  const importAutoFillCacheRef = useRef<Map<string, NormalizedFoodItem | null>>(new Map())

  const seqRef = useRef(0)
  const instantPackagedSeqRef = useRef(0)
  const brandSeqRef = useRef(0)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const queryInputRef = useRef<HTMLInputElement | null>(null)
  const portionInputRef = useRef<HTMLInputElement | null>(null)
  const searchPressRef = useRef(0)

  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [showManualBarcodeInput, setShowManualBarcodeInput] = useState(false)
  const [barcodeError, setBarcodeError] = useState<string | null>(null)
  const [barcodeStatus, setBarcodeStatus] = useState<'idle' | 'scanning' | 'loading'>('idle')
  const [barcodeStatusHint, setBarcodeStatusHint] = useState<string>('')
  const [manualBarcode, setManualBarcode] = useState('')
  const barcodeScannerRef = useRef<any>(null)
  const barcodeLookupInFlightRef = useRef(false)
  const barcodeDetectLockRef = useRef(false)
  const manualBarcodeInputRef = useRef<HTMLInputElement | null>(null)
  const [torchEnabled, setTorchEnabled] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const barcodeTorchTrackRef = useRef<MediaStreamTrack | null>(null)
  const initialItemsSignatureRef = useRef<string>('')
  const initialPortionTotalWeightRef = useRef<number | null>(null)

  const [recipeImportDraft, setRecipeImportDraft] = useState<any | null>(null)
  const [recipeImportLoading, setRecipeImportLoading] = useState(false)
  const [recipeImportMissing, setRecipeImportMissing] = useState<string[]>([])
  const [recipeImportProgress, setRecipeImportProgress] = useState<{
    total: number
    processed: number
    matched: number
    missing: number
    current: string
  }>({
    total: 0,
    processed: 0,
    matched: 0,
    missing: 0,
    current: '',
  })
  const [saveImportedRecipeToFavorites, setSaveImportedRecipeToFavorites] = useState(false)
  const recipeImportAppliedRef = useRef(false)
  const recipeImportPortionPrefilledRef = useRef(false)
  const editCollapseAppliedScopeRef = useRef<string | null>(null)
  const editListCollapseAppliedScopeRef = useRef<string | null>(null)

  const [showFavoritesPicker, setShowFavoritesPicker] = useState(false)
  const [favoritesSearch, setFavoritesSearch] = useState('')
  const [favoritesActiveTab, setFavoritesActiveTab] = useState<'all' | 'favorites' | 'custom'>('all')
  const [favoritesToast, setFavoritesToast] = useState<string | null>(null)

  const busy = searchLoading || savingMeal || photoLoading || barcodeLoading || recipeImportLoading
  const showPortionSaveCta = portionControlEnabled && (parseNumericInput(portionAmountInput) || 0) > 0
  const isDiaryEdit = Boolean(sourceLogId) && !editFavoriteId
  const isFavoriteAdjustBuild = fromFavoriteAdjust && !editFavoriteId && !sourceLogId
  const showEntryTimeOverride = Boolean(sourceLogId || isFavoriteAdjustBuild)
  const editScopeKey = editFavoriteId ? `fav:${editFavoriteId}` : sourceLogId ? `log:${sourceLogId}` : ''

  // Draft protection + auto-save (owner request):
  // - Always keep a draft while the user is building a meal (so they don't lose ingredients if they leave).
  // - If we're editing an existing diary entry (sourceLogId), also auto-update that entry in the background.
  const draftKey = useMemo(() => {
    const scope = editFavoriteId ? `fav:${editFavoriteId}` : sourceLogId ? `log:${sourceLogId}` : 'new'
    return `mealBuilder:draft:${selectedDate}:${category}:${scope}`
  }, [selectedDate, category, editFavoriteId, sourceLogId])
  const draftAppliedRef = useRef(false)
  const draftWriteTimeoutRef = useRef<number | null>(null)
  const diaryAutosaveTimeoutRef = useRef<number | null>(null)
  const lastDiaryAutosaveSignatureRef = useRef<string>('')
  const [autosaveHint, setAutosaveHint] = useState<string>('')
  const [favoriteUpdatePrompt, setFavoriteUpdatePrompt] = useState<{
    description: string
    nutrition: any
    items: any[]
    category: string
  } | null>(null)
  const [entryTime, setEntryTime] = useState<string>('')
  const [favoriteUpdatePromptSaving, setFavoriteUpdatePromptSaving] = useState(false)
  const [favoriteAdjustRecencySeed, setFavoriteAdjustRecencySeed] = useState<{
    favoriteId: string
    sourceId: string
    label: string
  } | null>(null)

  const applySavedPortion = (source: any) => {
    if (!source || typeof source !== 'object') return
    const explicitToggle = (source as any).__portionControlEnabled
    if (typeof explicitToggle === 'boolean') {
      setPortionControlEnabled(explicitToggle)
    } else {
      const legacyScale = Number((source as any).__portionScale)
      setPortionControlEnabled(Number.isFinite(legacyScale) && Math.abs(legacyScale - 1) > 0.0001)
    }
    const amountRaw = (source as any).__portionAmount
    const unitRaw = (source as any).__portionUnit
    const weightRaw = (source as any).__portionWeightG
    const totalWeightRaw = Number((source as any).__portionTotalWeightG)
    const servingsRaw = Number((source as any).__portionRecipeServings)
    if (Number.isFinite(servingsRaw) && servingsRaw > 0) setRecipeServingsForPortion(servingsRaw)
    else setRecipeServingsForPortion(null)
    const unit: PortionUnit = unitRaw === 'oz' ? 'oz' : unitRaw === 'serving' ? 'serving' : 'g'
    if (amountRaw !== null && amountRaw !== undefined && Number.isFinite(Number(amountRaw))) {
      setPortionUnit(unit)
      setPortionAmountInput(String(amountRaw))
      return
    }
    if (weightRaw !== null && weightRaw !== undefined && Number.isFinite(Number(weightRaw))) {
      const grams = Number(weightRaw)
      if (
        unit === 'serving' &&
        Number.isFinite(servingsRaw) &&
        servingsRaw > 0 &&
        Number.isFinite(totalWeightRaw) &&
        totalWeightRaw > 0
      ) {
        const servingAmount = (grams / totalWeightRaw) * servingsRaw
        setPortionUnit('serving')
        setPortionAmountInput(String(round3(Math.max(0.1, servingAmount))))
        return
      }
      if (unit === 'oz') {
        const oz = convertAmount(grams, 'g', 'oz')
        setPortionUnit('oz')
        setPortionAmountInput(Number.isFinite(oz) ? String(round3(oz)) : '')
      } else {
        setPortionUnit('g')
        setPortionAmountInput(String(Math.round(grams)))
      }
    }
  }

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(draftKey)
    } catch {}
  }, [draftKey])

  const getSavedPortionTotalWeightG = (source: any) => {
    if (!source || typeof source !== 'object') return null
    const raw = (source as any).__portionTotalWeightG
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
  }

  // Restore draft (best-effort). We intentionally let the draft win so users can continue where they left off.
  useEffect(() => {
    if (recipeImportFlag) return
    if (recipeImportAppliedRef.current) return
    if (draftAppliedRef.current) return
    try {
      const raw = sessionStorage.getItem(draftKey)
      if (!raw) return
      const parsed = raw ? JSON.parse(raw) : null
      const nextItems = parsed && Array.isArray(parsed.items) ? (parsed.items as BuilderItem[]) : null
      if (!nextItems || nextItems.length === 0) return
      setItems(nextItems)
      setExpandedId(null)
      if (typeof parsed.mealName === 'string') setMealName(parsed.mealName)
      if (typeof parsed.energyUnit === 'string' && (parsed.energyUnit === 'kcal' || parsed.energyUnit === 'kJ')) {
        setEnergyUnit(parsed.energyUnit)
      }
      if (typeof parsed.portionAmountInput === 'string') setPortionAmountInput(parsed.portionAmountInput)
      if (typeof parsed.portionUnit === 'string' && (parsed.portionUnit === 'serving' || parsed.portionUnit === 'g' || parsed.portionUnit === 'oz')) {
        setPortionUnit(parsed.portionUnit)
      }
      if (typeof parsed.portionControlEnabled === 'boolean') {
        setPortionControlEnabled(parsed.portionControlEnabled)
      }
      if (typeof parsed.entryTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.entryTime)) {
        setEntryTime(parsed.entryTime)
      }
      if (typeof parsed.saveImportedRecipeToFavorites === 'boolean') {
        setSaveImportedRecipeToFavorites(parsed.saveImportedRecipeToFavorites)
      }
      const parsedRecipeServings = Number(parsed?.recipeServingsForPortion)
      if (Number.isFinite(parsedRecipeServings) && parsedRecipeServings > 0) setRecipeServingsForPortion(parsedRecipeServings)
      draftAppliedRef.current = true
      setAutosaveHint('Draft restored')
      window.setTimeout(() => setAutosaveHint(''), 1200)
    } catch {
      // ignore
    }
  }, [draftKey, recipeImportFlag])

  // Keep a draft updated while editing, so ingredients aren't lost.
  useEffect(() => {
    try {
      if (draftWriteTimeoutRef.current) window.clearTimeout(draftWriteTimeoutRef.current)
      draftWriteTimeoutRef.current = window.setTimeout(() => {
        const itemsForDraft = itemsRef.current?.length ? itemsRef.current : items
        if (!itemsForDraft || itemsForDraft.length === 0) return
        const snapshot = {
          v: 1,
          updatedAt: Date.now(),
          mealName,
          energyUnit,
          portionControlEnabled,
          portionAmountInput,
          portionUnit,
          entryTime,
          saveImportedRecipeToFavorites,
          recipeServingsForPortion,
          items: itemsForDraft,
        }
        try {
          sessionStorage.setItem(draftKey, JSON.stringify(snapshot))
        } catch {}
      }, 250)
    } catch {}
    return () => {
      try {
        if (draftWriteTimeoutRef.current) window.clearTimeout(draftWriteTimeoutRef.current)
      } catch {}
    }
  }, [draftKey, items, mealName, energyUnit, portionControlEnabled, portionAmountInput, portionUnit, entryTime, saveImportedRecipeToFavorites, recipeServingsForPortion])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    brandSuggestionsRef.current = brandSuggestions
  }, [brandSuggestions])

  useEffect(() => {
    if (!recipeImportLoading) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = 'Recipe import is still running. Please stay on this page until it finishes.'
      return event.returnValue
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [recipeImportLoading])

  useEffect(() => {
    if (!recipeImportLoading) return
    if (!Array.isArray(items) || items.length === 0) return
    const latest = items[items.length - 1]
    const latestId = String(latest?.id || '')
    if (!latestId) return
    try {
      const escape = (v: string) => {
        try {
          return (window as any).CSS?.escape ? (window as any).CSS.escape(v) : v.replace(/["\\]/g, '\\$&')
        } catch {
          return v.replace(/["\\]/g, '\\$&')
        }
      }
      const start = Date.now()
      const tick = () => {
        const el = document.querySelector(`[data-builder-item-id="${escape(latestId)}"]`) as HTMLElement | null
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
        if (Date.now() - start < 1500) window.requestAnimationFrame(tick)
      }
      window.requestAnimationFrame(tick)
    } catch {}
  }, [recipeImportLoading, items])

  useEffect(() => {
    if (!expandedId) return
    const item = itemsRef.current.find((entry) => entry.id === expandedId)
    if (!item) return
    if (Array.isArray(item.__servingOptions) && item.__servingOptions.length > 0) return
    loadServingOptionsForItem(item).then((options) => {
      if (!options || options.length === 0) return
      setItems((prev) =>
        prev.map((entry) => {
          if (entry.id !== item.id) return entry
          const currentLabel = String(entry.serving_size || '').toLowerCase()
          const selected =
            options.find((opt) => String(opt?.label || opt?.serving_size || '').toLowerCase() === currentLabel) || null
          const pieceFromSelected =
            selected && !entry.__pieceGrams ? extractPieceGramsFromLabel(String(selected.label || selected.serving_size || '')) : null
          return {
            ...entry,
            __servingOptions: options,
            __selectedServingId: selected?.id || entry.__selectedServingId || null,
            __pieceGrams: entry.__pieceGrams || pieceFromSelected || null,
          }
        }),
      )
    })
  }, [expandedId])

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
    // Cleanup blob preview URLs.
    return () => {
      try {
        if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
      } catch {}
    }
  }, [photoPreviewUrl])

  const parseFavoriteItems = (fav: any): any[] | null => {
    const candidate = fav?.items
    if (Array.isArray(candidate)) return candidate
    if (typeof candidate === 'string') {
      try {
        const parsed = JSON.parse(candidate)
        return Array.isArray(parsed) ? parsed : null
      } catch {
        return null
      }
    }
    return null
  }

  useEffect(() => {
    // Seeded from Food Diary "Change portion" flow: open full editor with source meal as a NEW add flow.
    if (!isFavoriteAdjustBuild) {
      setFavoriteAdjustRecencySeed(null)
      return
    }

    setFavoriteAdjustRecencySeed(null)
    let seeded = false
    try {
      const raw = sessionStorage.getItem(FAVORITE_PORTION_SEED_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      const source = parsed?.source && typeof parsed.source === 'object' ? parsed.source : null
      if (!source) return

      const label = sanitizeMealTitle(String(parsed?.label || source?.description || source?.label || 'Meal'))
      if (label) setMealName(label)
      setLinkedFavoriteId('')
      const sourceFavoriteId = typeof source?.id === 'string' ? source.id.trim() : ''
      const sourceSourceId = typeof source?.sourceId === 'string' ? source.sourceId.trim() : ''
      const sourceLabel = sanitizeMealTitle(String(source?.label || source?.description || label || ''))
      if (sourceFavoriteId || sourceSourceId || sourceLabel) {
        setFavoriteAdjustRecencySeed({
          favoriteId: sourceFavoriteId,
          sourceId: sourceSourceId,
          label: sourceLabel,
        })
      } else {
        setFavoriteAdjustRecencySeed(null)
      }

      const totals = (source as any)?.nutrition || (source as any)?.total || null
      applySavedPortion(totals)
      initialPortionTotalWeightRef.current = getSavedPortionTotalWeightG(totals)

      const sourceItems = Array.isArray((source as any)?.items)
        ? (source as any).items
        : Array.isArray((source as any)?.ingredients)
        ? (source as any).ingredients
        : null

      if (sourceItems && sourceItems.length > 0) {
        const converted = convertToBuilderItems(sourceItems)
        setItems(converted)
        setExpandedId(null)
        initialItemsSignatureRef.current = buildItemsSignature(converted)
      } else {
        const fallbackItem = {
          name: label || 'Meal',
          serving_size: '1 serving',
          servings: 1,
          calories: totals?.calories ?? null,
          protein_g: totals?.protein ?? totals?.protein_g ?? null,
          carbs_g: totals?.carbs ?? totals?.carbs_g ?? null,
          fat_g: totals?.fat ?? totals?.fat_g ?? null,
          fiber_g: totals?.fiber ?? totals?.fiber_g ?? null,
          sugar_g: totals?.sugar ?? totals?.sugar_g ?? null,
        }
        const converted = convertToBuilderItems([fallbackItem])
        setItems(converted)
        setExpandedId(null)
        initialItemsSignatureRef.current = buildItemsSignature(converted)
      }

      setLoadedFavoriteId(`seed:${Date.now()}`)
      draftAppliedRef.current = true
      seeded = true
    } catch {
      // non-blocking
    } finally {
      if (seeded) {
        try {
          sessionStorage.removeItem(FAVORITE_PORTION_SEED_KEY)
        } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFavoriteAdjustBuild])

  const convertToBuilderItems = (rawItems: any[]): BuilderItem[] => {
    const next: BuilderItem[] = []
    for (const raw of Array.isArray(rawItems) ? rawItems : []) {
      const name = String(raw?.name || raw?.food || 'Food').trim() || 'Food'
      const brand = raw?.brand ?? null
      const serving_size = raw?.serving_size || raw?.servingSize || raw?.serving || ''
      const servings = toNumber(raw?.servings) ?? 1
      const base = seedBaseServing(parseServingBase(serving_size))
      let baseAmount = base.amount
      let baseUnit = base.unit
      const pieceGrams = extractPieceGramsFromLabel(serving_size)
      const liquidItem = isLikelyLiquidItem(name, serving_size)
      const foodUnitGrams = getFoodUnitGrams(name)
      if (!liquidItem && baseAmount && baseUnit && (baseUnit === 'tsp' || baseUnit === 'tbsp' || baseUnit === 'cup')) {
        const converted = convertAmount(baseAmount, baseUnit, 'g', undefined, undefined, undefined, foodUnitGrams)
        baseAmount = Number.isFinite(converted) ? converted : baseAmount
        baseUnit = 'g'
      }
      const normalized = normalizeLegacyBaseUnit(baseAmount, baseUnit)
      baseAmount = normalized.amount
      baseUnit = normalized.unit
      const id = `edit:${Date.now()}:${Math.random().toString(16).slice(2)}`
      const resolvedServings = Number.isFinite(servings) && servings > 0 ? servings : 1
      const savedUnitRaw = typeof raw?.__unit === 'string' ? raw.__unit.trim() : ''
      const savedUnit = ALL_UNITS.includes(savedUnitRaw as BuilderUnit) ? (savedUnitRaw as BuilderUnit) : null
      const savedAmount = toNumber(raw?.__amount)
      const savedAmountInput = typeof raw?.__amountInput === 'string' ? raw.__amountInput.trim() : ''
      const allowedUnits = allowedUnitsForItem({ name, __pieceGrams: pieceGrams } as BuilderItem)
      const fallbackAmount = baseAmount && baseUnit ? round3(baseAmount * resolvedServings) : round3(resolvedServings)
      const savedUnitAllowed = savedUnit && allowedUnits.includes(savedUnit)
      const initialUnit = savedUnitAllowed ? savedUnit : baseUnit || allowedUnits[0] || null
      const initialAmount =
        savedUnitAllowed && Number.isFinite(Number(savedAmount)) && Number(savedAmount) >= 0
          ? Number(savedAmount)
          : fallbackAmount
      const initialAmountInput = savedUnitAllowed && savedAmountInput ? savedAmountInput : String(initialAmount)
      next.push({
        id,
        name,
        brand,
        serving_size: serving_size || null,
        calories: toNumber(raw?.calories),
        protein_g: toNumber(raw?.protein_g),
        carbs_g: toNumber(raw?.carbs_g),
        fat_g: toNumber(raw?.fat_g),
        fiber_g: toNumber(raw?.fiber_g),
        sugar_g: toNumber(raw?.sugar_g),
        servings: resolvedServings,
        __baseAmount: baseAmount,
        __baseUnit: baseUnit,
        __amount: initialAmount,
        __amountInput: initialAmountInput,
        __unit: initialUnit,
        __pieceGrams: pieceGrams,
        __source: typeof raw?.source === 'string' ? raw.source : null,
        __sourceId: raw?.id ? String(raw.id) : null,
        __servingOptions: Array.isArray(raw?.servingOptions)
          ? normalizeServingOptionsForItem(raw.servingOptions, name)
          : null,
        __selectedServingId: raw?.selectedServingId ?? null,
        __matchedName: typeof raw?.__matchedName === 'string' ? raw.__matchedName : null,
        __importKey: typeof raw?.__importKey === 'string' ? raw.__importKey : null,
      })
    }
    return next
  }

  useEffect(() => {
    // Editing mode: load a favorite meal into the builder for edits.
    if (!editFavoriteId) {
      editFavoriteSourceItemsRef.current = null
      editFavoriteIsCustomRef.current = false
      initialItemsSignatureRef.current = ''
      initialPortionTotalWeightRef.current = null
      return
    }
    if (loadedFavoriteId === editFavoriteId) return
    const favorites = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const fav = favorites.find((f: any) => String(f?.id || '') === editFavoriteId) || null
    if (!fav) return

    // If we restored a draft, do not overwrite the user's in-progress changes.
    if (draftAppliedRef.current) {
      setLoadedFavoriteId(editFavoriteId)
      return
    }

    const label = normalizeMealLabel(fav?.label || fav?.description || '').trim()
    if (label) setMealName(label)
    const favoriteTotals = (fav as any)?.nutrition || (fav as any)?.total || null
    applySavedPortion(favoriteTotals)
    initialPortionTotalWeightRef.current = getSavedPortionTotalWeightG(favoriteTotals)

    const favItems = parseFavoriteItems(fav)
    editFavoriteSourceItemsRef.current = favItems ? JSON.parse(JSON.stringify(favItems)) : null
    editFavoriteIsCustomRef.current = isCustomMealFavorite(fav)
    if (favItems && favItems.length > 0) {
      const converted = convertToBuilderItems(favItems)
      setItems(converted)
      setExpandedId(null)
      initialItemsSignatureRef.current = buildItemsSignature(converted)
    } else {
      const total = (fav as any)?.total || (fav as any)?.nutrition || null
      const fallbackItem = {
        name: label || 'Favorite',
        serving_size: '1 serving',
        servings: 1,
        calories: total?.calories ?? null,
        protein_g: total?.protein ?? total?.protein_g ?? null,
        carbs_g: total?.carbs ?? total?.carbs_g ?? null,
        fat_g: total?.fat ?? total?.fat_g ?? null,
        fiber_g: total?.fiber ?? total?.fiber_g ?? null,
        sugar_g: total?.sugar ?? total?.sugar_g ?? null,
      }
      const converted = convertToBuilderItems([fallbackItem])
      setItems(converted)
      setExpandedId(null)
      initialItemsSignatureRef.current = buildItemsSignature(converted)
    }

    setLoadedFavoriteId(editFavoriteId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editFavoriteId, loadedFavoriteId, userData?.favorites])

  useEffect(() => {
    // Editing mode (diary): load a FoodLog row directly when a Build-a-meal diary entry is edited.
    if (!sourceLogId) {
      if (!isFavoriteAdjustBuild) setEntryTime('')
      if (!editFavoriteId) {
        initialItemsSignatureRef.current = ''
        initialPortionTotalWeightRef.current = null
      }
      return
    }
    if (editFavoriteId) return
    if (loadedFavoriteId === `log:${sourceLogId}`) return

    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/food-log?id=${encodeURIComponent(sourceLogId)}`, { method: 'GET' })
        const data = await res.json().catch(() => ({} as any))
        if (!res.ok) return
        const log = (data as any)?.log || null
        if (!log) return

        const linked = (() => {
          const n = log?.nutrients
          if (n && typeof n === 'object') {
            const raw = (n as any).__favoriteId
            return typeof raw === 'string' ? raw.trim() : ''
          }
          return ''
        })()
        if (!cancelled) setLinkedFavoriteId(linked)

        const loadedTime = extractTimeFromTimestamp(log?.createdAt)
        if (!cancelled && loadedTime) {
          setEntryTime((prev) => (prev ? prev : loadedTime))
        }

        // If we restored a draft, do not overwrite the user's in-progress changes.
        if (draftAppliedRef.current) {
          if (!cancelled) setLoadedFavoriteId(`log:${sourceLogId}`)
          return
        }

        const label = normalizeMealLabel(log?.description || log?.name || '').trim()
        if (!cancelled && label) setMealName(label)
        const logTotals = (log as any)?.nutrients || null
        if (!cancelled) applySavedPortion(logTotals)
        initialPortionTotalWeightRef.current = getSavedPortionTotalWeightG(logTotals)

        const rawItems = Array.isArray(log?.items) ? log.items : null
        if (!cancelled && rawItems && rawItems.length > 0) {
          const converted = convertToBuilderItems(rawItems)
          setItems(converted)
          setExpandedId(null)
          initialItemsSignatureRef.current = buildItemsSignature(converted)
        }

        if (!cancelled) setLoadedFavoriteId(`log:${sourceLogId}`)
      } catch {
        // non-blocking
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceLogId, editFavoriteId, loadedFavoriteId, isFavoriteAdjustBuild])

  useEffect(() => {
    if (!showEntryTimeOverride) return
    if (entryTime) return
    setEntryTime(formatTimeInputValue(new Date()))
  }, [showEntryTimeOverride, entryTime])

  useEffect(() => {
    // UX rule: when reopening an already-saved meal, start with all ingredient cards collapsed.
    // This should not affect first-time recipe building before save.
    if (!editScopeKey) {
      editCollapseAppliedScopeRef.current = null
      return
    }
    const expectedLoadedId = editFavoriteId ? editFavoriteId : `log:${sourceLogId}`
    if (!expectedLoadedId) return
    if (loadedFavoriteId !== expectedLoadedId) return
    if (editCollapseAppliedScopeRef.current === editScopeKey) return
    setExpandedId(null)
    editCollapseAppliedScopeRef.current = editScopeKey
  }, [editScopeKey, editFavoriteId, sourceLogId, loadedFavoriteId])

  useEffect(() => {
    // UX rule: when reopening an already-saved meal, the whole "Your ingredients" section starts collapsed.
    // RECIPE LOCK (owner request): do not alter this default without explicit written approval.
    if (!editScopeKey) {
      editListCollapseAppliedScopeRef.current = null
      setIngredientsListExpanded(true)
      return
    }
    const expectedLoadedId = editFavoriteId ? editFavoriteId : `log:${sourceLogId}`
    if (!expectedLoadedId) return
    if (loadedFavoriteId !== expectedLoadedId) return
    if (editListCollapseAppliedScopeRef.current === editScopeKey) return
    setIngredientsListExpanded(false)
    editListCollapseAppliedScopeRef.current = editScopeKey
  }, [editScopeKey, editFavoriteId, sourceLogId, loadedFavoriteId])

  useEffect(() => {
    // Keep /food on the same date when the user returns.
    try {
      const raw = sessionStorage.getItem('foodDiary:warmState')
      const parsed = raw ? JSON.parse(raw) : {}
      const next = { ...(parsed || {}), selectedDate }
      sessionStorage.setItem('foodDiary:warmState', JSON.stringify(next))
    } catch {}
  }, [selectedDate])

  const baseMealTotals = useMemo(() => {
    const total = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
    for (const it of items) {
      const t = computeItemTotals(it)
      total.calories += t.calories
      total.protein += t.protein
      total.carbs += t.carbs
      total.fat += t.fat
      total.fiber += t.fiber
      total.sugar += t.sugar
    }
    return total
  }, [items])

  const totalRecipeWeightG = useMemo(() => computeTotalRecipeWeightG(items), [items])
  const totalRecipeWeightGForScale = useMemo(() => {
    const saved = initialPortionTotalWeightRef.current
    if (!saved || !Number.isFinite(saved) || saved <= 0) return totalRecipeWeightG
    const initialSig = initialItemsSignatureRef.current
    if (!initialSig) return totalRecipeWeightG
    const currentSig = buildItemsSignature(items)
    if (!currentSig || currentSig !== initialSig) return totalRecipeWeightG
    return saved
  }, [items, totalRecipeWeightG])

  useEffect(() => {
    const draft = recipeImportDraft
    if (!draft) return
    if (recipeImportPortionPrefilledRef.current) return
    const servings = Number((draft as any)?.servings)
    if (items.length === 0) return

    if (Number.isFinite(servings) && servings > 0) {
      recipeImportPortionPrefilledRef.current = true
      setRecipeServingsForPortion(servings)
      setPortionUnit('serving')
      setPortionAmountInput('1')
      return
    }

    if (!totalRecipeWeightG || !Number.isFinite(totalRecipeWeightG) || totalRecipeWeightG <= 0) return
    recipeImportPortionPrefilledRef.current = true
    setPortionUnit('g')
    setPortionAmountInput(String(Math.max(1, Math.round(totalRecipeWeightG))))
  }, [recipeImportDraft, totalRecipeWeightG, items.length, portionAmountInput])


  // Guard rail: portionScale must allow values above 1 to scale larger-than-recipe servings.
  // See GUARD_RAILS.md section "Build a Meal portion scaling".
  const computedPortionScale = useMemo(
    () => computePortionScale(portionAmountInput, portionUnit, totalRecipeWeightGForScale, recipeServingsForPortion),
    [portionAmountInput, portionUnit, totalRecipeWeightGForScale, recipeServingsForPortion],
  )

  // GUARD RAIL: Calorie consistency between edit page and front page
  // When editing an existing entry, we MUST use the saved __portionScale from the entry
  // Do NOT recalculate from portion input - the front page uses saved scale, so we must match it
  // See GUARD_RAILS.md section 3.14 for details
  const [savedPortionScale, setSavedPortionScale] = useState<number | null>(null)
  const [portionScaleOverriddenByUser, setPortionScaleOverriddenByUser] = useState(false)
  
  useEffect(() => {
    if (sourceLogId && !editFavoriteId) {
      setPortionScaleOverriddenByUser(false)
      // When editing a diary entry, fetch and store the saved portion scale
      const fetchSavedScale = async () => {
        try {
          const res = await fetch(`/api/food-log?id=${encodeURIComponent(sourceLogId)}`, { method: 'GET' })
          const data = await res.json().catch(() => ({} as any))
          if (res.ok && data?.log) {
            const logTotals = (data.log as any)?.nutrients || null
            if (logTotals && typeof logTotals === 'object') {
              const scale = Number((logTotals as any).__portionScale)
              setSavedPortionScale(Number.isFinite(scale) && scale > 0 ? scale : null)
            } else {
              setSavedPortionScale(null)
            }
          } else {
            setSavedPortionScale(null)
          }
        } catch {
          setSavedPortionScale(null)
        }
      }
      fetchSavedScale()
    } else if (editFavoriteId) {
      setPortionScaleOverriddenByUser(false)
      // When editing a favorite, get saved portion scale from favorite data
      const favorites = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
      const fav = favorites.find((f: any) => String(f?.id || '') === editFavoriteId) || null
      if (fav) {
        const favoriteTotals = (fav as any)?.nutrition || (fav as any)?.total || null
        if (favoriteTotals && typeof favoriteTotals === 'object') {
          const scale = Number((favoriteTotals as any).__portionScale)
          setSavedPortionScale(Number.isFinite(scale) && scale > 0 ? scale : null)
        } else {
          setSavedPortionScale(null)
        }
      } else {
        setSavedPortionScale(null)
      }
    } else {
      setPortionScaleOverriddenByUser(false)
      setSavedPortionScale(null)
    }
  }, [sourceLogId, editFavoriteId, userData])

  // GUARD RAIL: Use saved portion scale when editing to match front page calories
  // The front page applies saved __portionScale, so edit page must use it too
  // Only use computed scale for new entries (not editing)
  // See GUARD_RAILS.md section 3.14 for details
  const portionScale = useMemo(() => {
    // If we have a saved scale and we're editing an existing entry, use saved scale to match front page
    if (savedPortionScale !== null && (sourceLogId || editFavoriteId) && !portionScaleOverriddenByUser) {
      return savedPortionScale
    }
    return computedPortionScale
  }, [savedPortionScale, computedPortionScale, sourceLogId, editFavoriteId, portionScaleOverriddenByUser])

  const effectivePortionScale = useMemo(() => {
    if (!portionControlEnabled) return 1
    return portionScale
  }, [portionControlEnabled, portionScale])

  const mealTotals = useMemo(
    () => applyPortionScaleToTotals(baseMealTotals, effectivePortionScale),
    [baseMealTotals, effectivePortionScale],
  )

  useEffect(() => {
    if (portionUnit !== 'serving') return
    const amount = parseNumericInput(portionAmountInput)
    if (amount && amount > 0) return
    setPortionAmountInput('1')
  }, [portionUnit, portionAmountInput])

  const adjustServingPortion = (delta: number) => {
    const current = parseNumericInput(portionAmountInput) ?? 1
    const next = round3(Math.max(0.1, current + delta))
    setPortionScaleOverriddenByUser(true)
    setPortionAmountInput(String(next))
  }

  const servingLabel = (() => {
    const amount = parseNumericInput(portionAmountInput) ?? 0
    if (!Number.isFinite(amount) || amount <= 0) return '0 servings'
    if (Math.abs(amount - 1) < 0.0001) return '1 serving'
    return `${round3(amount)} servings`
  })()

  const addBuilderItem = (next: BuilderItem) => {
    setItems((prev) => [...prev, next])
    setExpandedId(next.id)
    try {
      if (typeof window !== 'undefined') {
        const id = String(next.id || '')
        const start = Date.now()
        const escape = (v: string) => {
          try {
            return (window as any).CSS?.escape ? (window as any).CSS.escape(v) : v.replace(/["\\]/g, '\\$&')
          } catch {
            return v.replace(/["\\]/g, '\\$&')
          }
        }
        const tick = () => {
          const el = document.querySelector(`[data-builder-item-id="${escape(id)}"]`) as HTMLElement | null
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
          if (Date.now() - start < 1500) window.requestAnimationFrame(tick)
        }
        window.requestAnimationFrame(tick)
      }
    } catch {}
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

  const fetchSearchItems = async (
    searchQuery: string,
    options?: { kindOverride?: 'packaged' | 'single'; sourceOverride?: string; localOnly?: boolean; timeoutMs?: number },
  ) => {
    const q = String(searchQuery || '').trim()
    if (!q) return []
    const kindToUse = options?.kindOverride || kind
    const sourceParam = options?.sourceOverride || 'auto'
    const userCountry = String(userData?.country || '').trim()
    const params = new URLSearchParams({
      source: sourceParam,
      q: q,
      kind: kindToUse,
      limit: '20',
    })
    if (userCountry) params.set('country', userCountry)
    if (options?.localOnly) params.set('localOnly', '1')
    const timeoutMs = Number(options?.timeoutMs)
    const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    const controller = hasTimeout ? new AbortController() : null
    const timer = hasTimeout
      ? window.setTimeout(() => {
          try {
            controller?.abort()
          } catch {}
        }, timeoutMs)
      : null
    try {
      const res = await fetch(`/api/food-data?${params.toString()}`, {
        method: 'GET',
        signal: controller?.signal,
      })
      if (!res.ok) return []
      const data = await res.json().catch(() => ({} as any))
      return Array.isArray(data?.items) ? data.items : []
    } catch {
      return []
    } finally {
      if (timer !== null) window.clearTimeout(timer)
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

  const normalizeRecipeLookupValue = (value: string) => {
    let normalized = normalizeFoodValue(value)
    RECIPE_LOOKUP_PHRASE_REPLACEMENTS.forEach(([pattern, replacement]) => {
      normalized = normalized.replace(pattern, replacement)
    })
    return normalized.replace(/\s+/g, ' ').trim()
  }

  const buildRecipeLookupCandidates = (lookup: string) => {
    const out = new Set<string>()
    const add = (raw: string) => {
      const next = normalizeRecipeLookupValue(raw)
      if (!next || next.length < 2) return
      out.add(next)
    }

    const base = String(lookup || '').trim()
    if (!base) return []
    add(base)

    const tokens = normalizeRecipeLookupValue(base).split(' ').filter(Boolean)
    if (tokens.length === 0) return Array.from(out)

    const stripped = tokens.filter(
      (token) => !RECIPE_LOOKUP_DESCRIPTORS.has(token) && !/^\d/.test(token) && !/^\d+\s*\/\s*\d+$/.test(token),
    )
    if (stripped.length > 0) add(stripped.join(' '))

    const singularized = stripped.map((token) => singularizeToken(token))
    if (singularized.length > 0) add(singularized.join(' '))
    if (singularized.length > 1) add(singularized.slice(-1).join(' '))
    if (singularized.length > 1) add(singularized.slice(-2).join(' '))
    if (singularized.length === 1) add(singularized[0])

    return Array.from(out)
      .sort((a, b) => {
        const aWords = a.split(' ').filter(Boolean).length
        const bWords = b.split(' ').filter(Boolean).length
        if (aWords !== bWords) return aWords - bWords
        return a.length - b.length
      })
      .slice(0, 5)
  }

  const scoreMacroMatch = (candidate: NormalizedFoodItem, lookup: string, resolvedKind: 'packaged' | 'single') => {
    const lookupNorm = normalizeRecipeLookupValue(lookup)
    const lookupTokens = lookupNorm.split(' ').filter(Boolean)
    const candidateName = normalizeRecipeLookupValue(String(candidate?.name || ''))
    const candidateCombo = normalizeRecipeLookupValue(`${candidate?.brand || ''} ${candidate?.name || ''}`)
    const candidateTokens = candidateCombo.split(' ').filter(Boolean)

    let score = 0
    if (candidateName === lookupNorm) score += 1200
    if (candidateCombo === lookupNorm) score += 1300
    if (candidateName.startsWith(lookupNorm)) score += 900
    if (candidateCombo.startsWith(lookupNorm)) score += 950
    if (candidateName.includes(lookupNorm)) score += 600
    if (candidateCombo.includes(lookupNorm)) score += 650

    let tokenHits = 0
    for (const token of lookupTokens) {
      if (candidateTokens.includes(token)) {
        tokenHits += 2
        continue
      }
      if (candidateTokens.some((word) => word.startsWith(token))) tokenHits += 1
    }
    score += tokenHits * 140

    if (resolvedKind === 'single') {
      if (!candidate?.brand) score += 80
      if (candidateName.includes('raw')) score += 40
    } else if (candidate?.brand) {
      score += 20
    }

    return score
  }

  const getRecipeCoreTokens = (value: string) =>
    normalizeRecipeLookupValue(value)
      .split(' ')
      .filter((token) => token.length >= 3 && !RECIPE_LOOKUP_STOPWORDS.has(token) && !/^\d/.test(token))

  const isAcceptableRecipeMacroMatch = (
    candidate: NormalizedFoodItem,
    lookup: string,
    resolvedKind: 'packaged' | 'single',
    score: number,
  ) => {
    if (!candidate) return false
    const coreTokens = getRecipeCoreTokens(lookup)
    const candidateTokens = normalizeRecipeLookupValue(`${candidate?.brand || ''} ${candidate?.name || ''}`)
      .split(' ')
      .filter(Boolean)

    if (coreTokens.length === 0) {
      const lookupNorm = normalizeRecipeLookupValue(lookup)
      const candidateNorm = normalizeRecipeLookupValue(`${candidate?.brand || ''} ${candidate?.name || ''}`)
      return lookupNorm.length >= 3 && candidateNorm.includes(lookupNorm)
    }

    let matches = 0
    for (const token of coreTokens) {
      if (
        candidateTokens.includes(token) ||
        candidateTokens.some((word) => word.startsWith(token) || token.startsWith(word))
      ) {
        matches += 1
      }
    }

    const minMatches = coreTokens.length <= 2 ? 1 : Math.ceil(coreTokens.length * 0.5)
    if (matches < minMatches) return false
    if (resolvedKind === 'packaged' && matches < Math.min(2, coreTokens.length)) return false
    return score >= 420
  }

  const pickBestMacroMatch = (items: NormalizedFoodItem[], lookup: string, resolvedKind: 'packaged' | 'single') => {
    const filtered = items.filter((candidate) => hasMacroData(candidate))
    if (filtered.length === 0) return null
    const sorted = [...filtered].sort((a, b) => scoreMacroMatch(b, lookup, resolvedKind) - scoreMacroMatch(a, lookup, resolvedKind))
    for (const candidate of sorted) {
      const score = scoreMacroMatch(candidate, lookup, resolvedKind)
      if (isAcceptableRecipeMacroMatch(candidate, lookup, resolvedKind, score)) return candidate
    }
    return null
  }

  const fetchImportSearchItems = async (
    lookup: string,
    options: { kindOverride: 'packaged' | 'single'; sourceOverride: string; localOnly?: boolean; timeoutMs?: number },
  ) => {
    const key = `${options.kindOverride}|${options.sourceOverride}|${options.localOnly ? '1' : '0'}|${options.timeoutMs || 0}|${lookup}`
    const cached = importSearchCacheRef.current.get(key)
    if (cached) return cached
    const items = (await fetchSearchItems(lookup, options)) as NormalizedFoodItem[]
    importSearchCacheRef.current.set(key, items)
    return items
  }

  const resolveItemWithMacros = async (lookup: string, options?: { fastImportMode?: boolean }) => {
    const lookupKey = normalizeRecipeLookupValue(lookup)
    if (!lookupKey) return null
    const fastImportMode = Boolean(options?.fastImportMode)
    const cacheKey = `${fastImportMode ? 'fast' : 'full'}:${lookupKey}`
    if (importResolveCacheRef.current.has(cacheKey)) {
      return importResolveCacheRef.current.get(cacheKey) || null
    }

    const candidates = buildRecipeLookupCandidates(lookup)
    const localAttempts: Array<{ kind: 'single' | 'packaged'; source: string; localOnly?: boolean; timeoutMs: number }> = [
      { kind: 'single', source: 'usda', localOnly: true, timeoutMs: fastImportMode ? 900 : 1800 },
      { kind: 'single', source: 'auto', localOnly: true, timeoutMs: fastImportMode ? 900 : 1800 },
      { kind: 'packaged', source: 'auto', localOnly: true, timeoutMs: fastImportMode ? 900 : 1800 },
    ]
    const remoteAttempts: Array<{ kind: 'single' | 'packaged'; source: string; localOnly?: boolean; timeoutMs: number }> = [
      { kind: 'single', source: 'auto', timeoutMs: fastImportMode ? 1400 : 2600 },
      { kind: 'packaged', source: 'auto', timeoutMs: fastImportMode ? 1400 : 2600 },
    ]

    const findBestAcrossAttempts = async (
      candidate: string,
      attempts: Array<{ kind: 'single' | 'packaged'; source: string; localOnly?: boolean; timeoutMs: number }>,
    ) => {
      const settled = await Promise.all(
        attempts.map(async (attempt) => {
          const items = await fetchImportSearchItems(candidate, {
            kindOverride: attempt.kind,
            sourceOverride: attempt.source,
            localOnly: attempt.localOnly,
            timeoutMs: attempt.timeoutMs,
          })
          const best = pickBestMacroMatch(items, candidate, attempt.kind)
          if (!best) return null
          return { best, score: scoreMacroMatch(best, candidate, attempt.kind) }
        }),
      )
      const valid = settled.filter(Boolean) as Array<{ best: NormalizedFoodItem; score: number }>
      if (valid.length === 0) return null
      valid.sort((a, b) => b.score - a.score)
      return valid[0].best
    }

    for (const candidate of candidates) {
      const localBest = await findBestAcrossAttempts(candidate, localAttempts)
      if (localBest) {
        importResolveCacheRef.current.set(cacheKey, localBest)
        return localBest
      }
      const remoteBest = await findBestAcrossAttempts(candidate, remoteAttempts)
      if (remoteBest) {
        importResolveCacheRef.current.set(cacheKey, remoteBest)
        return remoteBest
      }
    }

    if (fastImportMode) {
      importResolveCacheRef.current.set(cacheKey, null)
      return null
    }

    // Last-chance retry for obvious single foods on slow/unstable connections.
    const resilientAttempts: Array<{ kind: 'single' | 'packaged'; source: string; localOnly?: boolean; timeoutMs: number }> = [
      { kind: 'single', source: 'usda', localOnly: true, timeoutMs: 4500 },
      { kind: 'single', source: 'auto', localOnly: true, timeoutMs: 4500 },
      { kind: 'single', source: 'auto', timeoutMs: 5500 },
    ]
    const resilientCandidates = Array.from(
      new Set([lookupKey, ...getRecipeCoreTokens(lookupKey).map((token) => singularizeToken(token)).filter(Boolean)]),
    ).slice(0, 4)
    for (const candidate of resilientCandidates) {
      if (!candidate || candidate.length < 2) continue
      const resilientBest = await findBestAcrossAttempts(candidate, resilientAttempts)
      if (resilientBest) {
        importResolveCacheRef.current.set(cacheKey, resilientBest)
        return resilientBest
      }
    }

    importResolveCacheRef.current.set(cacheKey, null)
    return null
  }

  const resolveMissingIngredientWithAi = async (line: string, lookup: string) => {
    const cacheKey = normalizeRecipeLookupValue(lookup || line)
    if (!cacheKey) return null
    if (importAutoFillCacheRef.current.has(cacheKey)) {
      return importAutoFillCacheRef.current.get(cacheKey) || null
    }
    try {
      const res = await fetch('/api/recipe-import/resolve-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient: line,
          lookup,
          country: String((userData as any)?.country || '').trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || !data?.item) {
        importAutoFillCacheRef.current.set(cacheKey, null)
        return null
      }
      const item = data.item as NormalizedFoodItem
      if (!hasMacroData(item)) {
        importAutoFillCacheRef.current.set(cacheKey, null)
        return null
      }
      importAutoFillCacheRef.current.set(cacheKey, item)
      importResolveCacheRef.current.set(cacheKey, item)
      return item
    } catch {
      importAutoFillCacheRef.current.set(cacheKey, null)
      return null
    }
  }

  useEffect(() => {
    if (!recipeImportFlag) return
    if (recipeImportAppliedRef.current) return
    recipeImportAppliedRef.current = true

    let draft: any = null
    try {
      const raw = sessionStorage.getItem('food:recipeImportDraft')
      if (raw) draft = JSON.parse(raw)
    } catch {
      draft = null
    }
    if (!draft || typeof draft !== 'object') {
      setError('Recipe import was not found. Please import again.')
      return
    }

    const ingredients = Array.isArray((draft as any).ingredients) ? ((draft as any).ingredients as any[]) : []
    const steps = Array.isArray((draft as any).steps) ? ((draft as any).steps as any[]) : []
    if (ingredients.length === 0 && steps.length === 0) {
      setError('Recipe import was empty. Please import again.')
      return
    }

    setRecipeImportDraft(draft)
    setRecipeImportMissing([])
    setSaveImportedRecipeToFavorites(false)
    // Start recipe imports from a clean builder state so stale drafts cannot duplicate cards.
    setItems([])
    itemsRef.current = []
    setExpandedId(null)
    try {
      sessionStorage.removeItem(draftKey)
    } catch {}
    const draftServings = Number((draft as any)?.servings)
    if (Number.isFinite(draftServings) && draftServings > 0) {
      setRecipeServingsForPortion(draftServings)
    }

    const title = String((draft as any).title || '').trim()
    if (title) {
      setMealName(title)
      mealNameEditedRef.current = true
      mealNameBackupRef.current = title
    }

    const parseFraction = (raw: string) => {
      const s = String(raw || '').trim()
      const m = s.match(/^(\d+)\s*\/\s*(\d+)$/)
      if (!m) return null
      const a = Number(m[1])
      const b = Number(m[2])
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null
      return a / b
    }

    const normalizeLookup = (raw: string) => {
      let s = String(raw || '').trim()
      s = s.replace(/\(\s*,\s*([^)]*?)\)/g, '($1)')
      s = s.replace(/\(.*?\)/g, ' ')
      s = s.split(',')[0] || s
      s = s.replace(/\s+,/g, ' ')
      s = s.replace(/\b(to taste|optional|plus more|for garnish|garnish|divided)\b/gi, ' ')
      s = s.replace(/\s+-\s+/g, ' ')
      s = s.replace(/[^a-zA-Z0-9\s/.-]/g, ' ')
      s = s.replace(/^(extra\s+large|large|medium|small)\s+/i, '')
      RECIPE_LOOKUP_PHRASE_REPLACEMENTS.forEach(([pattern, replacement]) => {
        s = s.replace(pattern, replacement)
      })
      s = s.replace(/\s+/g, ' ').trim()
      return s
    }

    const mapUnit = (rawUnit: string): { unit: BuilderUnit | null; scale: number } => {
      const u = String(rawUnit || '')
        .toLowerCase()
        .replace(/\./g, '')
        .replace(/[^a-z]/g, '')
        .trim()
      if (u === 'g' || u === 'gm' || u === 'gms' || u === 'gram' || u === 'grams') return { unit: 'g', scale: 1 }
      if (u === 'kg' || u === 'kgs' || u === 'kilogram' || u === 'kilograms') return { unit: 'g', scale: 1000 }
      if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return { unit: 'oz', scale: 16 }
      if (u === 'ml' || u === 'milliliter' || u === 'milliliters') return { unit: 'ml', scale: 1 }
      if (u === 'l' || u === 'liter' || u === 'liters') return { unit: 'ml', scale: 1000 }
      if (u === 'oz' || u === 'ounce' || u === 'ounces') return { unit: 'oz', scale: 1 }
      if (u === 'tsp' || u === 'tsps' || u === 'teaspoon' || u === 'teaspoons') return { unit: 'tsp', scale: 1 }
      if (u === 'tbsp' || u === 'tbs' || u === 'tbsps' || u === 'tablespoon' || u === 'tablespoons')
        return { unit: 'tbsp', scale: 1 }
      if (u === 'cup' || u === 'cups') return { unit: 'cup', scale: 1 }
      if (u === 'clove' || u === 'cloves') return { unit: 'piece', scale: 1 }
      if (u === 'piece' || u === 'pieces') return { unit: 'piece', scale: 1 }
      if (u === 'egg' || u === 'eggs') return { unit: 'egg-large', scale: 1 }
      if (u === 'smallegg' || u === 'smalleggs') return { unit: 'egg-small', scale: 1 }
      if (u === 'mediumegg' || u === 'mediumeggs') return { unit: 'egg-medium', scale: 1 }
      if (u === 'largeegg' || u === 'largeeggs') return { unit: 'egg-large', scale: 1 }
      if (
        u === 'extralargeegg' ||
        u === 'extralargeeggs' ||
        u === 'jumboegg' ||
        u === 'jumboeggs' ||
        u === 'xlegg' ||
        u === 'xleggs'
      ) {
        return { unit: 'egg-extra-large', scale: 1 }
      }
      return { unit: null, scale: 1 }
    }

    const hasPositiveProduceUnit = (units: FoodUnitGrams | null, unit: BuilderUnit) => {
      const grams = Number(units?.[unit])
      return Number.isFinite(grams) && grams > 0
    }

    const parseMappedUnitFromParts = (
      parts: string[],
    ): { mapped: { unit: BuilderUnit | null; scale: number }; consumed: number; lookupFallback: string } => {
      const cleanTokens = parts
        .map((part) =>
          String(part || '')
            .toLowerCase()
            .replace(/\./g, '')
            .replace(/[^a-z]/g, '')
            .trim(),
        )
        .filter(Boolean)
      if (cleanTokens.length === 0) return { mapped: { unit: null, scale: 1 }, consumed: 0, lookupFallback: '' }

      const maxJoin = Math.min(3, cleanTokens.length)
      for (let tokenCount = maxJoin; tokenCount >= 1; tokenCount -= 1) {
        const joined = cleanTokens.slice(0, tokenCount).join('')
        const mapped = mapUnit(joined)
        if (mapped.unit) {
          return {
            mapped,
            consumed: tokenCount,
            lookupFallback: mapped.unit.startsWith('egg-') ? 'egg' : cleanTokens[tokenCount - 1] || '',
          }
        }
      }

      const looksLikeEggToken = (value: string | undefined) => {
        const token = String(value || '')
        return token === 'egg' || token === 'eggs'
      }

      const first = cleanTokens[0] || ''
      const second = cleanTokens[1] || ''
      const third = cleanTokens[2] || ''

      if (first === 'extra' && second === 'large' && third) {
        if (looksLikeEggToken(third)) {
          return { mapped: { unit: 'egg-extra-large', scale: 1 }, consumed: 3, lookupFallback: 'egg' }
        }
        const produceUnits = getProduceUnitGrams(third)
        if (hasPositiveProduceUnit(produceUnits, 'piece-extra-large')) {
          return { mapped: { unit: 'piece-extra-large', scale: 1 }, consumed: 3, lookupFallback: third }
        }
      }

      const sizeHint = detectCountSizeHint(first)
      if (sizeHint && second) {
        if (looksLikeEggToken(second)) {
          return { mapped: { unit: eggUnitFromSizeHint(sizeHint), scale: 1 }, consumed: 2, lookupFallback: 'egg' }
        }
        const produceUnits = getProduceUnitGrams(second)
        const candidate = pieceUnitFromSizeHint(sizeHint)
        if (hasPositiveProduceUnit(produceUnits, candidate)) {
          return { mapped: { unit: candidate, scale: 1 }, consumed: 2, lookupFallback: second }
        }
      }

      return { mapped: { unit: null, scale: 1 }, consumed: 0, lookupFallback: '' }
    }

    const parseNumberToken = (rawToken: string) => {
      const token = String(rawToken || '').trim()
      if (!token) return null
      const range = token.match(/^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)$/)
      if (range) {
        const a = Number(String(range[1]).replace(',', '.'))
        const b = Number(String(range[2]).replace(',', '.'))
        if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) return (a + b) / 2
      }
      const fraction = parseFraction(token)
      if (fraction !== null) return fraction
      const asNumber = Number(token.replace(',', '.'))
      return Number.isFinite(asNumber) ? asNumber : null
    }

    const parseLine = (rawLine: string): { lookup: string; amount: number | null; unit: BuilderUnit | null } => {
      let line = String(rawLine || '').trim()
      line = line.replace(/^[\s•*\-–—]+/, '').trim()
      line = line.replace(/^\d+\.\s+/, '').trim()
      if (!line) return { lookup: '', amount: null, unit: null }
      const metricHint = (() => {
        const m = line.match(/\((\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|oz)\b/i)
        if (!m) return null
        const amount = parseNumberToken(m[1])
        const mapped = mapUnit(m[2] || '')
        if (amount === null || !mapped.unit) return null
        return { amount: amount * mapped.scale, unit: mapped.unit }
      })()
      const withMetricHint = (result: { lookup: string; amount: number | null; unit: BuilderUnit | null }) => {
        if (!metricHint) return result
        if (!result.unit || result.unit === 'cup' || result.unit === 'tbsp' || result.unit === 'tsp' || result.unit === 'piece') {
          return { ...result, amount: metricHint.amount, unit: metricHint.unit }
        }
        return result
      }

      const mixed = line.match(/^(\d+)\s+(\d+\/\d+)\s+(.*)$/)
      if (mixed) {
        const whole = Number(mixed[1])
        const frac = parseFraction(mixed[2])
        const rest = String(mixed[3] || '').trim()
        const amount = Number.isFinite(whole) && frac !== null ? whole + frac : null
        const parts = rest.split(/\s+/)
        const parsedUnit = parseMappedUnitFromParts(parts)
        const mapped = parsedUnit.mapped
        const lookup = normalizeLookup(parts.slice(parsedUnit.consumed).join(' ') || parsedUnit.lookupFallback || rest)
        return withMetricHint({ lookup, amount: amount !== null ? amount * mapped.scale : null, unit: mapped.unit })
      }

      const fracOnly = line.match(/^(\d+\/\d+)\s+(.*)$/)
      if (fracOnly) {
        const amount = parseFraction(fracOnly[1])
        const rest = String(fracOnly[2] || '').trim()
        const parts = rest.split(/\s+/)
        const parsedUnit = parseMappedUnitFromParts(parts)
        const mapped = parsedUnit.mapped
        const lookup = normalizeLookup(parts.slice(parsedUnit.consumed).join(' ') || parsedUnit.lookupFallback || rest)
        return withMetricHint({ lookup, amount: amount !== null ? amount * mapped.scale : null, unit: mapped.unit })
      }

      const compactUnit = line.match(/^((?:\d+\/\d+)|(?:\d+(?:[.,]\d+)?))([a-zA-Z]+)\s+(.*)$/)
      if (compactUnit) {
        const amount = parseNumberToken(compactUnit[1])
        const unitToken = compactUnit[2] || ''
        const rest = String(compactUnit[3] || '').trim()
        const mapped = mapUnit(unitToken)
        const lookup = normalizeLookup(rest)
        return withMetricHint({ lookup, amount: amount !== null ? amount * mapped.scale : null, unit: mapped.unit })
      }

      const numOnly = line.match(/^(\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?)\s+(.*)$/)
      if (numOnly) {
        const amount = parseNumberToken(numOnly[1])
        const rest = String(numOnly[2] || '').trim()
        const parts = rest.split(/\s+/)
        const parsedUnit = parseMappedUnitFromParts(parts)
        const mapped = parsedUnit.mapped
        if (mapped.unit) {
          const lookup = normalizeLookup(parts.slice(parsedUnit.consumed).join(' ') || parsedUnit.lookupFallback || rest)
          return withMetricHint({ lookup, amount: amount !== null ? amount * mapped.scale : null, unit: mapped.unit })
        }
        return withMetricHint({ lookup: normalizeLookup(rest), amount: amount ?? null, unit: null })
      }

      return withMetricHint({ lookup: normalizeLookup(line), amount: null, unit: null })
    }

    const toImportDedupeKey = (lookup: string, amount: number | null, unit: BuilderUnit | null) => {
      const nameKey = normalizeLookup(lookup).toLowerCase()
      if (!nameKey) return ''
      const amountKey =
        typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? String(round3(amount)) : ''
      const unitKey = String(unit || '').trim().toLowerCase()
      return `${nameKey}|${amountKey}|${unitKey}`
    }

    const toImportNameKey = (lookup: string) => normalizeLookup(lookup).toLowerCase()

    const run = async () => {
      const lines = ingredients.map((l) => String(l || '').trim()).filter(Boolean).slice(0, 60)
      if (lines.length === 0) return
      const fastImportMode = lines.length <= 6
      const prefillItems = Array.isArray((draft as any).prefillItems) ? ((draft as any).prefillItems as any[]) : []
      const seenImportKeys = new Set<string>()
      const seenImportNames = new Set<string>()
      for (const existing of items) {
        const existingStoredKey = String((existing as any).__importKey || '').trim()
        if (existingStoredKey) seenImportKeys.add(existingStoredKey)
        const existingName = String(existing.name || (existing as any).__matchedName || '').trim()
        const existingNameKey = toImportNameKey(existingName)
        if (existingNameKey) seenImportNames.add(existingNameKey)
        const existingAmount =
          typeof existing.__amount === 'number' && Number.isFinite(existing.__amount) && existing.__amount > 0
            ? existing.__amount
            : null
        const existingUnit = (existing.__unit as BuilderUnit | null) ?? null
        const existingKey = toImportDedupeKey(existingName, existingAmount, existingUnit)
        if (existingKey) seenImportKeys.add(existingKey)
      }
      importResolveCacheRef.current.clear()
      importSearchCacheRef.current.clear()
      importAutoFillCacheRef.current.clear()
      setRecipeImportProgress({
        total: lines.length,
        processed: 0,
        matched: 0,
        missing: 0,
        current: '',
      })
      setRecipeImportLoading(true)
      const missing: string[] = []
      let processedCount = 0
      let matchedCount = 0
      let missingCount = 0

      const publishProgress = (currentLine: string) => {
        setRecipeImportProgress({
          total: lines.length,
          processed: Math.min(lines.length, processedCount),
          matched: matchedCount,
          missing: missingCount,
          current: currentLine,
        })
      }
      try {
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          const line = lines[lineIndex]
          const parsed = parseLine(line)
          const lookup = String(parsed.lookup || '').trim()
          const currentLine = lookup || line
          const lineKey = toImportDedupeKey(lookup || line, parsed.amount, parsed.unit)
          const lineNameKey = toImportNameKey(lookup || line)
          if (!lookup) {
            processedCount += 1
            missingCount += 1
            if (lineKey && !seenImportKeys.has(lineKey)) {
              seenImportKeys.add(lineKey)
              if (lineNameKey) seenImportNames.add(lineNameKey)
              missing.push(line)
            }
            publishProgress(currentLine)
            continue
          }
          const alreadyAdded =
            (lineKey && seenImportKeys.has(lineKey)) ||
            (lineNameKey &&
              seenImportNames.has(lineNameKey) &&
              !(typeof parsed.amount === 'number' && Number.isFinite(parsed.amount) && parsed.amount > 0))
          if (alreadyAdded) {
            processedCount += 1
            matchedCount += 1
            publishProgress(currentLine)
            continue
          }
          const prefill = prefillItems[lineIndex]
          const prefillLine = String(prefill?.importLine || '').trim()
          const prefillName = String(prefill?.name || '').trim()
          const prefillLineKey = toImportNameKey(prefillLine)
          const prefillNameKey = toImportNameKey(prefillName)
          const prefillMatchesLine =
            (!prefillLineKey && !prefillNameKey) || prefillLineKey === lineNameKey || prefillNameKey === lineNameKey

          if (prefillMatchesLine) {
            const prefillCandidate = {
              source: 'custom',
              id: String(prefill?.id || `prefill-${lineIndex}`),
              name: prefillName || lookup || line,
              brand: null,
              serving_size: prefill?.serving_size ? String(prefill.serving_size) : null,
              calories: Number.isFinite(Number(prefill?.calories)) ? Number(prefill.calories) : null,
              protein_g: Number.isFinite(Number(prefill?.protein_g)) ? Number(prefill.protein_g) : null,
              carbs_g: Number.isFinite(Number(prefill?.carbs_g)) ? Number(prefill.carbs_g) : null,
              fat_g: Number.isFinite(Number(prefill?.fat_g)) ? Number(prefill.fat_g) : null,
              fiber_g: Number.isFinite(Number(prefill?.fiber_g)) ? Number(prefill.fiber_g) : null,
              sugar_g: Number.isFinite(Number(prefill?.sugar_g)) ? Number(prefill.sugar_g) : null,
            } as NormalizedFoodItem
            if (hasMacroData(prefillCandidate)) {
              addItemDirectWithOverrides(
                prefillCandidate,
                { amount: parsed.amount, unit: parsed.unit },
                { displayName: lookup, matchedName: prefillCandidate.name, importKey: lineKey },
              )
              if (lineKey) seenImportKeys.add(lineKey)
              if (lineNameKey) seenImportNames.add(lineNameKey)
              processedCount += 1
              matchedCount += 1
              publishProgress(currentLine)
              continue
            }
          }

          const resolved = await resolveItemWithMacros(lookup, { fastImportMode })
          if (!resolved) {
            setRecipeImportProgress((prev) => ({
              ...prev,
              current: `Auto-filling ${currentLine}…`,
            }))
            const aiResolved = await resolveMissingIngredientWithAi(line, lookup)
            if (aiResolved) {
              addItemDirectWithOverrides(
                aiResolved,
                { amount: parsed.amount, unit: parsed.unit },
                { displayName: lookup, matchedName: aiResolved.name, importKey: lineKey },
              )
              if (lineKey) seenImportKeys.add(lineKey)
              if (lineNameKey) seenImportNames.add(lineNameKey)
              processedCount += 1
              matchedCount += 1
              publishProgress(currentLine)
              continue
            }
            processedCount += 1
            missingCount += 1
            if (lineKey && !seenImportKeys.has(lineKey)) {
              seenImportKeys.add(lineKey)
              if (lineNameKey) seenImportNames.add(lineNameKey)
              missing.push(line)
            }
            setRecipeImportMissing([...missing])
            publishProgress(currentLine)
            continue
          }
          addItemDirectWithOverrides(
            resolved,
            { amount: parsed.amount, unit: parsed.unit },
            { displayName: lookup, matchedName: resolved.name, importKey: lineKey },
          )
          if (lineKey) seenImportKeys.add(lineKey)
          if (lineNameKey) seenImportNames.add(lineNameKey)
          processedCount += 1
          matchedCount += 1
          publishProgress(currentLine)
        }
      } catch {
      } finally {
        setRecipeImportProgress((prev) => ({
          ...prev,
          processed: Math.max(prev.processed, processedCount),
          matched: Math.max(prev.matched, matchedCount),
          missing: Math.max(prev.missing, missingCount),
          current: '',
        }))
        setRecipeImportMissing(missing)
        setRecipeImportLoading(false)
      }
    }

    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeImportFlag])

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

  const runSearch = async (searchQuery?: string, options?: { skipQuickLocal?: boolean }) => {
    const raw = String(searchQuery ?? query)
    const q = raw.trim()
    const cacheKey = buildSearchCacheKey(kind)
    if (!q) {
      setError('Please type a food name to search.')
      return
    }

    setError(null)
    setSearchLoading(true)

    const seq = ++seqRef.current

    try {
      const allowBrandSuggestions = kind === 'packaged' && shouldShowBrandSuggestions(q)
      if (kind === 'packaged' && !options?.skipQuickLocal) {
        const quickQuery = getQuickPackagedQuery(q)
        if (quickQuery.length >= 1) {
          const quickItems = await fetchSearchItems(quickQuery, { kindOverride: 'packaged', sourceOverride: 'usda', localOnly: true })
          if (seqRef.current === seq && quickItems.length > 0) {
            const hasToken = getSearchTokens(q).some((token) => token.length >= 1)
            const quickFiltered = hasToken ? filterItemsForQuery(quickItems, q, kind, { allowTypoFallback: false }) : quickItems
            const quickMerged = allowBrandSuggestions ? mergeBrandSuggestions(quickFiltered, brandSuggestionsRef.current) : quickFiltered
            const quickWithSuggestions =
              allowBrandSuggestions || kind !== 'packaged' ? quickMerged : mergeSearchSuggestions(quickMerged, q)
            if (seqRef.current === seq) {
              setResults(quickWithSuggestions)
              if (quickWithSuggestions.length > 0) {
                searchCacheRef.current.set(cacheKey, { items: quickWithSuggestions, at: Date.now() })
              }
            }
          }
        }
      }

      let nextItems = await fetchSearchItems(q)
      if (seqRef.current !== seq) return
      const rawItems = nextItems
      const hasToken = getSearchTokens(q).some((token) => token.length >= 1)
      let filteredItems = hasToken ? filterItemsForQuery(nextItems, q, kind, { allowTypoFallback: true }) : nextItems
      if (kind === 'single' && filteredItems.length === 0 && rawItems.length > 0) {
        const tokenCount = getSearchTokens(q).filter((token) => token.length >= 1).length
        if (tokenCount <= 1) filteredItems = rawItems
      }
      if (filteredItems.length === 0 && kind === 'single') {
        try {
          const lastWord = getLastSearchToken(q)
          if (lastWord && lastWord !== q && lastWord.length >= 1) {
            const fallbackItems = await fetchSearchItems(lastWord)
            if (seqRef.current === seq) {
              const fallbackFiltered =
                hasToken && fallbackItems.length > 0
                  ? filterItemsForQuery(fallbackItems, lastWord, kind, { allowTypoFallback: false })
                  : fallbackItems
              filteredItems = fallbackFiltered.length > 0 ? fallbackFiltered : fallbackItems
            }
          }
        } catch {}
      }
      let merged =
        kind === 'single'
          ? mergeSearchSuggestions(filteredItems, q)
          : allowBrandSuggestions
          ? mergeBrandSuggestions(filteredItems, brandSuggestionsRef.current)
          : filteredItems
      if (kind === 'packaged' && !allowBrandSuggestions) {
        merged = mergeSearchSuggestions(merged, q)
      }
      if (seqRef.current !== seq) return
      setResults(merged)
      if (merged.length > 0) searchCacheRef.current.set(cacheKey, { items: merged, at: Date.now() })
      return merged
    } catch (e: any) {
      if (seqRef.current !== seq) return
      setError('Search failed. Please try again.')
    } finally {
      if (seqRef.current === seq) setSearchLoading(false)
    }
  }

  const runInstantPackagedQuickSearch = async (searchQuery: string) => {
    const q = String(searchQuery || '').trim()
    if (!q) return
    const quickQuery = getQuickPackagedQuery(q)
    if (quickQuery.length < 1) return
    const seq = ++instantPackagedSeqRef.current
    try {
      const quickItems = await fetchSearchItems(quickQuery, {
        kindOverride: 'packaged',
        sourceOverride: 'usda',
        localOnly: true,
        timeoutMs: 900,
      })
      if (instantPackagedSeqRef.current !== seq || quickItems.length === 0) return
      const hasToken = getSearchTokens(q).some((token) => token.length >= 1)
      const quickFiltered = hasToken
        ? filterItemsForQuery(quickItems, q, 'packaged', { allowTypoFallback: false })
        : quickItems
      if (quickFiltered.length === 0 || instantPackagedSeqRef.current !== seq) return
      const allowBrandSuggestions = shouldShowBrandSuggestions(q)
      const quickMerged = allowBrandSuggestions
        ? mergeBrandSuggestions(quickFiltered, brandSuggestionsRef.current)
        : quickFiltered
      if (quickMerged.length === 0 || instantPackagedSeqRef.current !== seq) return
      setResults(quickMerged)
      searchCacheRef.current.set(buildSearchCacheKey('packaged'), { items: quickMerged, at: Date.now() })
    } catch {
      // ignore instant lookup errors
    }
  }

  useEffect(() => {
    const q = String(query || '').trim()
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
    }
    if (q.length < 1) {
      seqRef.current += 1
      instantPackagedSeqRef.current += 1
      setResults([])
      setSearchLoading(false)
      if (q.length === 0) setError(null)
      return
    }
    if (kind === 'single') {
      const instant = buildInstantSuggestions(q)
      if (instant.length > 0) setResults(instant)
    } else {
      void runInstantPackagedQuickSearch(q)
    }
    const cached = getCachedSearchResults(q, kind, searchCacheRef.current)
    if (cached.length > 0) {
      const mergedCached =
        kind === 'single'
          ? mergeSearchSuggestions(cached, q)
          : shouldShowBrandSuggestions(q)
          ? mergeBrandSuggestions(cached, brandSuggestionsRef.current)
          : cached
      setResults(mergedCached)
    }
    setSearchLoading(true)
    searchDebounceRef.current = window.setTimeout(() => {
      runSearch(q, { skipQuickLocal: true })
    }, 90)
    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = null
      }
    }
  }, [query, kind])

  useEffect(() => {
    const q = String(query || '').trim()
    if (brandSearchDebounceRef.current) {
      window.clearTimeout(brandSearchDebounceRef.current)
      brandSearchDebounceRef.current = null
    }
    if (kind !== 'packaged') {
      brandSeqRef.current += 1
      setBrandSuggestions([])
      return
    }
    if (q.length < 1) {
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
    if (fallback.length > 0) setBrandSuggestions(fallback)
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

  const triggerSearchFromButton = () => {
    const now = Date.now()
    if (now - searchPressRef.current < 300) return
    searchPressRef.current = now
    const raw = queryInputRef.current?.value ?? query
    runSearch(raw)
  }

  const loadServingOptionsForItem = async (item: BuilderItem) => {
    if (!item?.__source || !item?.__sourceId) return null
    if (item.__source !== 'usda' && item.__source !== 'fatsecret' && item.__source !== 'custom') return null
    const key = `${item.__source}:${item.__sourceId}`
    const cached = servingOptionsCacheRef.current.get(key)
    if (cached) return cached
    if (servingOptionsPendingRef.current.has(key)) return null
    servingOptionsPendingRef.current.add(key)
    try {
      const params = new URLSearchParams({ source: item.__source, id: String(item.__sourceId) })
      const res = await fetch(`/api/food-data/servings?${params.toString()}`, { method: 'GET' })
      if (!res.ok) return null
      const data = await res.json().catch(() => ({}))
      const optionsRaw: ServingOption[] = Array.isArray(data?.options) ? data.options : []
      const options = normalizeServingOptionsForItem(optionsRaw, item.name || 'Food')
      if (options.length > 0) servingOptionsCacheRef.current.set(key, options)
      return options
    } catch {
      return null
    } finally {
      servingOptionsPendingRef.current.delete(key)
    }
  }

  const applyServingOptionToItem = (item: BuilderItem, option: ServingOption) => {
    const next = { ...item }
    const label = String(option?.label || option?.serving_size || '').trim()
    if (label) next.serving_size = label
    if (option?.calories != null) next.calories = toNumber(option.calories)
    if (option?.protein_g != null) next.protein_g = toNumber(option.protein_g)
    if (option?.carbs_g != null) next.carbs_g = toNumber(option.carbs_g)
    if (option?.fat_g != null) next.fat_g = toNumber(option.fat_g)
    if (option?.fiber_g != null) next.fiber_g = toNumber(option.fiber_g)
    if (option?.sugar_g != null) next.sugar_g = toNumber(option.sugar_g)

    const grams = Number(option?.grams)
    const ml = Number(option?.ml)
    let baseAmount = next.__baseAmount
    let baseUnit = next.__baseUnit
    if (Number.isFinite(grams) && grams > 0) {
      baseAmount = grams
      baseUnit = 'g'
    } else if (Number.isFinite(ml) && ml > 0) {
      baseAmount = ml
      baseUnit = 'ml'
    } else if (label) {
      const parsed = parseServingBase(label)
      baseAmount = parsed.amount
      baseUnit = parsed.unit
    }

    const normalized = normalizeLegacyBaseUnit(baseAmount, baseUnit)
    baseAmount = normalized.amount
    baseUnit = normalized.unit

    next.__baseAmount = baseAmount
    next.__baseUnit = baseUnit
    next.__unit = baseUnit
    next.__selectedServingId = option?.id || null
    next.__pieceGrams = label ? extractPieceGramsFromLabel(label) : null

    if (baseAmount && baseUnit) {
      const servings = Number.isFinite(Number(next.servings)) ? Number(next.servings) : 1
      next.__amount = round3(baseAmount * servings)
      next.__amountInput = String(next.__amount)
    }

    return next
  }

  const setServingOption = (id: string, optionId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const options = Array.isArray(it.__servingOptions) ? it.__servingOptions : []
        const selected = options.find((opt) => opt?.id === optionId)
        if (!selected) return { ...it, __selectedServingId: optionId }
        return applyServingOptionToItem(it, selected)
      }),
    )
  }

	  const addItemDirect = (r: NormalizedFoodItem) => {
	    triggerHaptic(10)
    const base = seedBaseServing(parseServingBase(r?.serving_size))
    let baseAmount = base.amount
    let baseUnit = base.unit
    const pieceGrams = extractPieceGramsFromLabel(r?.serving_size || '')
    const liquidItem = isLikelyLiquidItem(r?.name || '', r?.serving_size)
    const foodUnitGrams = getFoodUnitGrams(r?.name || '')
    if (!liquidItem && baseAmount && baseUnit && (baseUnit === 'tsp' || baseUnit === 'tbsp' || baseUnit === 'cup')) {
      const converted = convertAmount(baseAmount, baseUnit, 'g', undefined, undefined, undefined, foodUnitGrams)
      baseAmount = Number.isFinite(converted) ? converted : baseAmount
      baseUnit = 'g'
    }
    const normalized = normalizeLegacyBaseUnit(baseAmount, baseUnit)
    baseAmount = normalized.amount
    baseUnit = normalized.unit

    const defaultAmount =
      baseAmount && baseUnit
        ? baseAmount
        : 1

    const id = `${r.source}:${r.id}:${Date.now()}`

    const next: BuilderItem = {
      id,
      name: r.name || 'Food',
      brand: r.brand ?? null,
      serving_size: r.serving_size ?? null,
      calories: toNumber(r.calories),
      protein_g: toNumber(r.protein_g),
      carbs_g: toNumber(r.carbs_g),
      fat_g: toNumber(r.fat_g),
      fiber_g: toNumber(r.fiber_g),
      sugar_g: toNumber(r.sugar_g),
      servings: 1,
      __baseAmount: baseAmount,
      __baseUnit: baseUnit,
      __amount: defaultAmount,
      __amountInput: String(defaultAmount),
      __unit: baseUnit,
      __pieceGrams: pieceGrams,
      __source: r?.source ?? null,
      __sourceId: r?.id ? String(r.id) : null,
      __servingOptions: null,
      __selectedServingId: null,
    }

    // If we know the base amount, treat the amount as units in the base and compute servings.
    if (baseAmount && baseUnit) {
      next.servings = 1
    }

	    addBuilderItem(next)
	  }

  const addItemDirectWithOverrides = (
    r: NormalizedFoodItem,
    overrides?: { amount?: number | null; unit?: BuilderUnit | null },
      options?: { displayName?: string | null; matchedName?: string | null; importKey?: string | null },
  ) => {
	    const base = seedBaseServing(parseServingBase(r?.serving_size))
	    let baseAmount = base.amount
	    let baseUnit = base.unit
	    const pieceGrams = extractPieceGramsFromLabel(r?.serving_size || '')
	    const liquidItem = isLikelyLiquidItem(r?.name || '', r?.serving_size)
	    const foodUnitGrams = getFoodUnitGrams(r?.name || '')
	    if (!liquidItem && baseAmount && baseUnit && (baseUnit === 'tsp' || baseUnit === 'tbsp' || baseUnit === 'cup')) {
	      const converted = convertAmount(baseAmount, baseUnit, 'g', undefined, undefined, undefined, foodUnitGrams)
	      baseAmount = Number.isFinite(converted) ? converted : baseAmount
	      baseUnit = 'g'
	    }
	    const normalized = normalizeLegacyBaseUnit(baseAmount, baseUnit)
	    baseAmount = normalized.amount
	    baseUnit = normalized.unit

	    const defaultAmount = baseAmount && baseUnit ? baseAmount : 1
	    const id = `${r.source}:${r.id}:${Date.now()}:${Math.random().toString(16).slice(2)}`

    let nextUnit = overrides?.unit ?? baseUnit
    let nextAmount =
      typeof overrides?.amount === 'number' && Number.isFinite(overrides.amount) && overrides.amount > 0
        ? overrides.amount
        : defaultAmount
    const isImportedLine = String(options?.importKey || '').trim().length > 0

    if (isImportedLine && !overrides?.unit && typeof overrides?.amount === 'number' && Number.isFinite(overrides.amount) && overrides.amount > 0) {
      const sizeHint = detectCountSizeHint(options?.displayName || '')
      const importedName = String(options?.displayName || r?.name || '').trim()
      if (isEggFood(importedName) || isEggFood(r?.name || '')) {
        nextUnit = eggUnitFromSizeHint(sizeHint)
      } else {
        const produceUnits = getProduceUnitGrams(r?.name || importedName)
        const preferred = pieceUnitFromSizeHint(sizeHint)
        const preferredGrams = Number(produceUnits?.[preferred])
        if (Number.isFinite(preferredGrams) && preferredGrams > 0) {
          nextUnit = preferred
        } else {
          const fallbackPieceUnits: BuilderUnit[] = ['piece-medium', 'piece-large', 'piece-small', 'piece-extra-large']
          const fallback = fallbackPieceUnits.find((unit) => {
            const grams = Number(produceUnits?.[unit])
            return Number.isFinite(grams) && grams > 0
          })
          if (fallback) nextUnit = fallback
        }
      }
    }

    if (isImportedLine && nextUnit) {
      const keepEggUnit =
        nextUnit === 'egg-small' ||
        nextUnit === 'egg-medium' ||
        nextUnit === 'egg-large' ||
        nextUnit === 'egg-extra-large'
      const keepPieceUnit =
        ((nextUnit === 'piece' && Number.isFinite(Number(pieceGrams)) && Number(pieceGrams) > 0) ||
          ((nextUnit === 'piece-small' ||
            nextUnit === 'piece-medium' ||
            nextUnit === 'piece-large' ||
            nextUnit === 'piece-extra-large') &&
            Number.isFinite(Number(foodUnitGrams?.[nextUnit])) &&
            Number(foodUnitGrams?.[nextUnit]) > 0))
      if (!keepEggUnit && !keepPieceUnit) {
      const fromGrams = resolveUnitGrams(nextUnit, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
      const toGrams = resolveUnitGrams('g', baseAmount, baseUnit, pieceGrams, foodUnitGrams)
      if (Number.isFinite(fromGrams) && fromGrams > 0 && Number.isFinite(toGrams) && toGrams > 0) {
        const converted = convertAmount(nextAmount, nextUnit, 'g', baseAmount, baseUnit, pieceGrams, foodUnitGrams)
        if (Number.isFinite(converted) && converted > 0) {
          nextAmount = round3(converted)
          nextUnit = 'g'
        }
      }
    }
    }

	    const next: BuilderItem = {
	      id,
	      name: String(options?.displayName || r.name || 'Food').trim() || 'Food',
	      brand: options?.displayName ? null : r.brand ?? null,
	      serving_size: r.serving_size ?? null,
	      calories: toNumber(r.calories),
	      protein_g: toNumber(r.protein_g),
	      carbs_g: toNumber(r.carbs_g),
	      fat_g: toNumber(r.fat_g),
	      fiber_g: toNumber(r.fiber_g),
	      sugar_g: toNumber(r.sugar_g),
	      servings: 1,
	      __baseAmount: baseAmount,
	      __baseUnit: baseUnit,
	      __amount: nextAmount,
	      __amountInput: String(nextAmount),
	      __unit: nextUnit,
	      __pieceGrams: pieceGrams,
	      __source: r?.source ?? null,
	      __sourceId: r?.id ? String(r.id) : null,
	      __servingOptions: null,
	      __selectedServingId: null,
        __matchedName: String(options?.matchedName || r.name || '').trim() || null,
        __importKey: String(options?.importKey || '').trim() || null,
	    }

	    try {
	      next.servings = computeServingsFromAmount(next)
	    } catch {}
	    addBuilderItem(next)
	  }

	  const addItemWithMacros = async (item: NormalizedFoodItem) => {
	    if (!item) return
	    if (!hasMacroData(item)) {
      setError('This item has no nutrition data. Please choose another result.')
      return
    }
    addItemDirect(item)
  }

  const addSuggestionItem = async (item: NormalizedFoodItem) => {
    const lookup = item.__searchQuery || item.name
    setSearchLoading(true)
    try {
      const resolved = await resolveItemWithMacros(lookup)
      if (!resolved) {
        setError('This item has no nutrition data. Please choose another result.')
        return
      }
      const displayName = item?.name || resolved?.name
      const displayBrand = item?.brand ?? resolved?.brand
      addItemDirect({
        ...resolved,
        name: displayName || resolved.name,
        brand: displayBrand ?? resolved.brand,
      })
    } catch {
      setError('Search failed. Please try again.')
    } finally {
      setSearchLoading(false)
    }
  }

  const addItemsFromAi = (aiItems: any[]) => {
    if (!Array.isArray(aiItems) || aiItems.length === 0) return
    // Add each detected ingredient as its own expandable card.
    for (const ai of aiItems) {
      const name = String(ai?.name || ai?.food || 'Food').trim() || 'Food'
      const brand = ai?.brand ?? null
      const serving_size = ai?.serving_size || ai?.servingSize || ai?.serving || ''
      const servings = toNumber(ai?.servings) ?? 1

      const base = seedBaseServing(parseServingBase(serving_size))
      let baseAmount = base.amount
      let baseUnit = base.unit
      const pieceGrams = extractPieceGramsFromLabel(serving_size)
      const liquidItem = isLikelyLiquidItem(name, serving_size)
      const foodUnitGrams = getFoodUnitGrams(name)
      if (!liquidItem && baseAmount && baseUnit && (baseUnit === 'tsp' || baseUnit === 'tbsp' || baseUnit === 'cup')) {
        const converted = convertAmount(baseAmount, baseUnit, 'g', undefined, undefined, undefined, foodUnitGrams)
        baseAmount = Number.isFinite(converted) ? converted : baseAmount
        baseUnit = 'g'
      }
      const normalized = normalizeLegacyBaseUnit(baseAmount, baseUnit)
      baseAmount = normalized.amount
      baseUnit = normalized.unit

      const id = `ai:${Date.now()}:${Math.random().toString(16).slice(2)}`
      const next: BuilderItem = {
        id,
        name,
        brand,
        serving_size: serving_size || null,
        calories: toNumber(ai?.calories),
        protein_g: toNumber(ai?.protein_g),
        carbs_g: toNumber(ai?.carbs_g),
        fat_g: toNumber(ai?.fat_g),
        fiber_g: toNumber(ai?.fiber_g),
        sugar_g: toNumber(ai?.sugar_g),
        servings: Number.isFinite(servings) && servings > 0 ? servings : 1,
        __baseAmount: baseAmount,
        __baseUnit: baseUnit,
        __amount: baseAmount && baseUnit ? round3(baseAmount * (Number.isFinite(servings) ? servings : 1)) : round3(Number.isFinite(servings) ? servings : 1),
        __amountInput: String(baseAmount && baseUnit ? round3(baseAmount * (Number.isFinite(servings) ? servings : 1)) : round3(Number.isFinite(servings) ? servings : 1)),
        __unit: baseUnit,
        __pieceGrams: pieceGrams,
        __source: ai?.source ?? null,
        __sourceId: ai?.id ? String(ai.id) : null,
        __servingOptions: Array.isArray(ai?.servingOptions)
          ? normalizeServingOptionsForItem(ai.servingOptions, name)
          : null,
        __selectedServingId: ai?.selectedServingId ?? null,
      }
      addBuilderItem(next)
    }
  }

  const addFromFavorite = (fav: any) => {
    if (!fav) return
    // Favorites are saved meals; prefer their ingredient cards when available.
    let favItems: any[] | null = null
    const candidate = (fav as any)?.items
    if (Array.isArray(candidate)) {
      favItems = candidate
    } else if (typeof candidate === 'string') {
      try {
        const parsed = JSON.parse(candidate)
        favItems = Array.isArray(parsed) ? parsed : null
      } catch {
        favItems = null
      }
    }

    if (favItems && favItems.length > 0) {
      addItemsFromAi(favItems)
      return
    }

    // Fallback: add as a single ingredient using the favorite's totals.
    const total = (fav as any)?.total || (fav as any)?.nutrition || null
    const label = String((fav as any)?.label || (fav as any)?.description || 'Favorite').trim() || 'Favorite'
    addItemsFromAi([
      {
        name: label,
        brand: 'Favorite',
        serving_size: '1 serving',
        servings: 1,
        calories: total?.calories ?? null,
        protein_g: total?.protein ?? total?.protein_g ?? null,
        carbs_g: total?.carbs ?? total?.carbs_g ?? null,
        fat_g: total?.fat ?? total?.fat_g ?? null,
        fiber_g: total?.fiber ?? total?.fiber_g ?? null,
        sugar_g: total?.sugar ?? total?.sugar_g ?? null,
      },
    ])
  }

  const HISTORY_RESET_EPOCH_MS = 1765532876309 // Dec 12, 2025 09:47:56 UTC

  const normalizeMealLabel = (raw: any) => {
    const s = String(raw || '').trim()
    if (!s) return ''
    const firstLine = s.split('\n')[0] || s
    return firstLine.split('Calories:')[0].trim()
  }

  const favoriteDisplayLabel = (fav: any) => {
    const raw = (fav?.label || fav?.description || '').toString()
    const base = normalizeMealLabel(raw)
    const overridden = applyFoodNameOverride(base, { favorite: fav }, foodNameOverrideIndex) || base
    return overridden || base
  }

  const looksLikeMealBuilderCreatedItemId = (rawId: any) => {
    const id = typeof rawId === 'string' ? rawId : ''
    if (!id) return false
    if (/^(openfoodfacts|usda|fatsecret):[^:]+:\d{9,}$/i.test(id)) return true
    if (/^ai:\d{9,}:[0-9a-f]+$/i.test(id)) return true
    return false
  }

  const isLegacyMealBuilderFavorite = (fav: any) => {
    if (!fav) return false
    const items = parseFavoriteItems(fav)
    if (!items || items.length === 0) return false
    return items.some((it: any) => looksLikeMealBuilderCreatedItemId(it?.id))
  }

  // GUARD RAIL: Single ingredient favorites must NOT appear in Custom tab
  // Only multi-item meals created via "Build a Meal" should be custom meals
  // See GUARD_RAILS.md section 3.14 for details
  const isCustomMealFavorite = (fav: any) => {
    if (!fav) return false
    // Single ingredient favorites should NEVER be considered custom meals
    // Only multi-item meals created via "Build a Meal" should be custom meals
    const items = parseFavoriteItems(fav)
    const isSingleIngredient = !items || items.length === 0 || items.length === 1
    if (isSingleIngredient) return false
    
    if ((fav as any)?.customMeal === true) return true
    const method = String((fav as any)?.method || '').toLowerCase()
    if (method === 'meal-builder' || method === 'combined') return true
    return false
  }

  const buildSourceTag = (entry: any) => {
    if (!entry) return 'Custom'
    if (entry?.sourceTag) return String(entry.sourceTag)
    if ((entry as any)?.source) return String((entry as any).source).toUpperCase()
    if ((entry as any)?.method === 'photo') return 'CRDB'
    if ((entry as any)?.method === 'text') return 'Manual'
    return 'CRDB'
  }

  const extractCalories = (entry: any) => {
    const n = (entry?.total || entry?.nutrition || null) as any
    const c = n?.calories
    return typeof c === 'number' && Number.isFinite(c) ? Math.round(c) : null
  }

  const readWarmDiaryState = (): any | null => {
    try {
      const raw = sessionStorage.getItem('foodDiary:warmState')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  const readPersistentDiarySnapshot = (): any | null => {
    try {
      const raw = localStorage.getItem('foodDiary:persistentSnapshot')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  const buildFavoritesDatasets = () => {
    const favorites = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const pool: any[] = []

    const todays = Array.isArray((userData as any)?.todaysFoods) ? ((userData as any).todaysFoods as any[]) : []
    pool.push(...todays)

    const warm = readWarmDiaryState()
    const historyByDate = warm?.historyByDate
    if (historyByDate && typeof historyByDate === 'object') {
      Object.values(historyByDate).forEach((entries: any) => {
        if (Array.isArray(entries)) pool.push(...entries)
      })
    }

    const snap = readPersistentDiarySnapshot()
    if (snap?.byDate && typeof snap.byDate === 'object') {
      Object.values(snap.byDate).forEach((d: any) => {
        if (Array.isArray(d?.entries)) pool.push(...d.entries)
      })
    }

    const meetsShape = (entry: any) => {
      if (!entry) return false
      const desc = String(entry?.description || entry?.label || '').trim()
      if (!desc) return false
      const hasNutrition = Boolean(entry?.nutrition) || Boolean(entry?.total) || (Array.isArray(entry?.items) && entry.items.length > 0)
      if (!hasNutrition) return false
      const ts =
        typeof entry?.createdAt === 'string'
          ? new Date(entry.createdAt).getTime()
          : typeof entry?.createdAt === 'number'
          ? entry.createdAt
          : typeof entry?.id === 'number'
          ? entry.id
          : Number(entry?.id)
      return Number.isFinite(ts) ? ts >= HISTORY_RESET_EPOCH_MS : true
    }

    const allByKey = new Map<string, any>()
    pool.filter(meetsShape).forEach((entry) => {
      const key = normalizeMealLabel(entry?.description || entry?.label || '').toLowerCase()
      if (!key) return
      const existing = allByKey.get(key)
      const created = Number(entry?.createdAt ? new Date(entry.createdAt).getTime() : entry?.id || 0)
      const existingCreated = Number(existing?.createdAt ? new Date(existing.createdAt).getTime() : existing?.id || 0)
      if (!existing || created > existingCreated) allByKey.set(key, entry)
    })

    favorites.forEach((fav: any) => {
      const key = favoriteDisplayLabel(fav).toLowerCase()
      if (!key) return
      if (!allByKey.has(key)) allByKey.set(key, { ...fav, sourceTag: 'Favorite' })
    })

    const allMeals = Array.from(allByKey.values()).map((entry) => ({
      id: entry?.id || `all-${Math.random()}`,
      label: normalizeMealLabel(entry?.description || entry?.label || 'Meal') || 'Meal',
      entry,
      favorite: (entry as any)?.sourceTag === 'Favorite' ? entry : null,
      createdAt: entry?.createdAt || entry?.id || Date.now(),
      sourceTag: (entry as any)?.sourceTag === 'Favorite' ? 'Favorite' : buildSourceTag(entry),
      calories: extractCalories(entry),
      serving: entry?.items?.[0]?.serving_size || entry?.serving || '',
    }))

    const favoriteMeals = favorites.map((fav: any) => ({
      id: fav?.id || `fav-${Math.random()}`,
      label: favoriteDisplayLabel(fav) || normalizeMealLabel(fav?.description || fav?.label || 'Favorite meal') || 'Favorite meal',
      favorite: fav,
      createdAt: fav?.createdAt || fav?.id || Date.now(),
      sourceTag: 'Favorite',
      calories: extractCalories(fav),
      serving: fav?.items?.[0]?.serving_size || fav?.serving || '',
    }))

    // Product request: "Custom" only shows meals the user created (Build-a-meal / Combined).
    const customMeals = favoriteMeals.filter((m: any) => isCustomMealFavorite(m?.favorite))

    return { allMeals, favoriteMeals, customMeals }
  }

  const favoritesKeySet = useMemo(() => {
    const favorites = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const set = new Set<string>()
    favorites.forEach((fav: any) => {
      const key = favoriteDisplayLabel(fav).toLowerCase()
      if (key) set.add(key)
    })
    return set
  }, [userData])

  const persistFavorites = (nextFavorites: any[]) => {
    updateUserData({ favorites: nextFavorites })
    try {
      fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: nextFavorites }),
      }).catch(() => {})
    } catch {}
  }

  const normalizeFoodNameKey = (value: any) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  const persistFoodNameOverrides = (nextOverrides: any[]) => {
    updateUserData({ foodNameOverrides: nextOverrides } as any)
    setFoodNameOverridesFallback(nextOverrides)
    try {
      localStorage.setItem('food:nameOverrides', JSON.stringify(nextOverrides))
    } catch {}
    try {
      fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foodNameOverrides: nextOverrides }),
      }).catch(() => {})
    } catch {}
  }

  const saveFoodNameOverride = (fromLabel: any, toLabel: any, entry?: any) => {
    const from = normalizeMealLabel(fromLabel).trim()
    const to = normalizeMealLabel(toLabel).trim()
    if (!from || !to || from === to) return
    const fromKey = normalizeFoodNameKey(from)
    if (!fromKey) return

    let itemId = ''
    let favoriteId = ''
    let sourceId = ''
    let barcode = ''
    try {
      const items = Array.isArray(entry?.items) ? entry.items : null
      const single = Array.isArray(items) && items.length === 1 ? items[0] : null
      itemId = single && typeof single?.id === 'string' ? String(single.id).trim() : ''
      const barcodeRaw = single?.barcode || single?.gtinUpc
      barcode = barcodeRaw ? String(barcodeRaw).trim() : ''
      favoriteId =
        (entry?.favorite && entry.favorite.id && String(entry.favorite.id)) ||
        (entry?.nutrition && (entry.nutrition as any).__favoriteId) ||
        (entry?.total && (entry.total as any).__favoriteId) ||
        (entry?.id && String(entry.id).startsWith('fav-') ? String(entry.id) : '') ||
        ''
      sourceId =
        (entry?.favorite && entry.favorite.sourceId) ||
        entry?.sourceId ||
        (entry?.nutrition && (entry.nutrition as any).__sourceId) ||
        (entry?.total && (entry.total as any).__sourceId) ||
        ''
      favoriteId = String(favoriteId || '').trim()
      sourceId = String(sourceId || '').trim()
    } catch {}

    const base = Array.isArray((userData as any)?.foodNameOverrides)
      ? (((userData as any).foodNameOverrides as any[]) || [])
      : Array.isArray(foodNameOverridesFallback)
      ? foodNameOverridesFallback
      : []

    const next = base.filter((row: any) => {
      const rowItemId = typeof row?.itemId === 'string' ? String(row.itemId).trim() : ''
      const rowFavId = typeof row?.favoriteId === 'string' ? String(row.favoriteId).trim() : ''
      const rowSrcId = typeof row?.sourceId === 'string' ? String(row.sourceId).trim() : ''
      const rowBarcode = typeof row?.barcode === 'string' ? String(row.barcode).trim() : ''
      if (itemId && rowItemId && rowItemId === itemId) return false
      if (favoriteId && rowFavId && rowFavId === favoriteId) return false
      if (sourceId && rowSrcId && rowSrcId === sourceId) return false
      if (barcode && rowBarcode && rowBarcode === barcode) return false
      return normalizeFoodNameKey(normalizeMealLabel(row?.from || '')) !== fromKey
    })

    next.unshift({
      from,
      to,
      ...(itemId ? { itemId } : {}),
      ...(favoriteId ? { favoriteId } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(barcode ? { barcode } : {}),
      createdAt: Date.now(),
    })

    persistFoodNameOverrides(next)
  }

  const saveToFavorites = (entryLike: any) => {
    const source = entryLike
    if (!source) return
    const labelRaw = source?.description || source?.label || 'Favorite meal'
    const cleanLabel = normalizeMealLabel(labelRaw) || 'Favorite meal'

    const clonedItems =
      source?.items && Array.isArray(source.items) && source.items.length > 0 ? JSON.parse(JSON.stringify(source.items)) : null

    const favoritePayload = {
      id: `fav-${Date.now()}`,
      sourceId: (source as any)?.id || (source as any)?.dbId || null,
      label: cleanLabel,
      description: String(source?.description || cleanLabel),
      nutrition: source?.nutrition || source?.total || null,
      total: source?.total || source?.nutrition || null,
      items: clonedItems,
      photo: source?.photo || null,
      method: source?.method || 'text',
      meal: normalizeCategory(source?.meal || source?.category || source?.mealType),
      createdAt: Date.now(),
    }

    const prev = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const existingIndex = prev.findIndex(
      (fav: any) =>
        (fav.sourceId && favoritePayload.sourceId && fav.sourceId === favoritePayload.sourceId) ||
        (fav.label && favoritePayload.label && fav.label === favoritePayload.label),
    )
    const next =
      existingIndex >= 0
        ? prev.map((fav: any, idx: number) => (idx === existingIndex ? { ...favoritePayload, id: fav.id || favoritePayload.id } : fav))
        : [...prev, favoritePayload]

    persistFavorites(next)
    setFavoritesToast('Saved to Favorites')
    setTimeout(() => setFavoritesToast(null), 1400)
  }

  const deleteFavorite = (id: string) => {
    const favId = String(id || '').trim()
    if (!favId) return
    const prev = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const next = prev.filter((f: any) => String(f?.id || '') !== favId)
    persistFavorites(next)
    setFavoritesToast('Removed')
    setTimeout(() => setFavoritesToast(null), 1400)
  }

  const openEditFavorite = (fav: any) => {
    const id = String(fav?.id || '').trim()
    if (!id) return
    const favCategory = normalizeCategory(fav?.meal || fav?.category || category)
    router.push(
      `/food/build-meal?date=${encodeURIComponent(selectedDate)}&category=${encodeURIComponent(favCategory)}&editFavoriteId=${encodeURIComponent(id)}`,
    )
  }

  const analyzePhotoAndAdd = async (file: File) => {
    if (!file) return
    setError(null)
    setPhotoLoading(true)
    try {
      triggerHaptic(10)
      try {
        if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
      } catch {}
      try {
        setPhotoPreviewUrl(URL.createObjectURL(file))
      } catch {}
      const fd = new FormData()
      fd.append('image', file)
      // Use the existing Food image analyzer. This can return multiple ingredients.
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
      const detected = Array.isArray(data?.items) ? data.items : []
      if (detected.length === 0) {
        setError('No ingredients were detected from that photo. Try a clearer photo or use search/barcode.')
        return
      }
      addItemsFromAi(detected)
      try {
        window.dispatchEvent(new Event('credits:refresh'))
      } catch {}
    } catch {
      setError('Photo analysis failed. Please try again.')
    } finally {
      setPhotoLoading(false)
      try {
        if (photoInputRef.current) photoInputRef.current.value = ''
      } catch {}
    }
  }

  const resetTorchState = () => {
    barcodeTorchTrackRef.current = null
    setTorchEnabled(false)
    setTorchAvailable(false)
  }

  const disableTorch = () => {
    const track = barcodeTorchTrackRef.current
    if (track && typeof track.applyConstraints === 'function') {
      try {
        const constraints: MediaTrackConstraints & { advanced?: Array<{ torch?: boolean }> } = {
          advanced: [{ torch: false }],
        }
        ;(track as any).applyConstraints(constraints).catch(() => {})
      } catch {}
    }
    resetTorchState()
  }

  const attachTorchTrack = (stream: MediaStream | null) => {
    if (!stream) {
      resetTorchState()
      return
    }
    const track = stream.getVideoTracks?.()[0]
    barcodeTorchTrackRef.current = track || null
    const capabilities = (track?.getCapabilities?.() as any) || {}
    const canTorch = !!capabilities.torch
    setTorchAvailable(canTorch)
    if (!canTorch) setTorchEnabled(false)
  }

  const attachTorchTrackFromDom = (retry = true) => {
    const region = document.getElementById(BARCODE_REGION_ID)
    const videoEl = region?.querySelector('video') as HTMLVideoElement | null
    const stream = (videoEl?.srcObject as MediaStream) || null
    if (!stream && retry) {
      setTimeout(() => attachTorchTrackFromDom(false), 250)
      return
    }
    attachTorchTrack(stream)
  }

  const stopBarcodeScanner = () => {
    setBarcodeStatusHint('')
    disableTorch()
    try {
      const current = barcodeScannerRef.current
      if (current?.controls?.stop) current.controls.stop()
      if (current?.reader?.reset) current.reader.reset()
      if (current?.videoEl) {
        try {
          current.videoEl.pause()
        } catch {}
        try {
          current.videoEl.srcObject = null
        } catch {}
        try {
          current.videoEl.remove()
        } catch {}
      }
      if (current?.stream) {
        try {
          ;(current.stream as MediaStream).getTracks().forEach((t) => t.stop())
        } catch {}
      }
    } catch {}
    barcodeScannerRef.current = null
    const region = document.getElementById(BARCODE_REGION_ID)
    if (region) region.innerHTML = ''
  }

  const resetBarcodeState = () => {
    setBarcodeStatus('idle')
    setBarcodeError(null)
    setManualBarcode('')
    setShowManualBarcodeInput(false)
    barcodeLookupInFlightRef.current = false
    resetTorchState()
  }

  const lookupBarcodeAndAdd = async (codeRaw: string) => {
    const code = String(codeRaw || '').trim().replace(/[^0-9A-Za-z]/g, '')
    if (!code) {
      setBarcodeError('Enter a valid barcode to search.')
      setBarcodeStatus('scanning')
      setBarcodeStatusHint('Scanning…')
      return
    }
    if (barcodeLookupInFlightRef.current) return

    const resumeScannerAfterLookup = () => {
      if (!showBarcodeScanner) return
      if ((barcodeScannerRef.current as any)?.videoEl) {
        setBarcodeStatus('scanning')
        setBarcodeStatusHint('Scanning…')
        return
      }
      startBarcodeScanner()
    }

    barcodeLookupInFlightRef.current = true
    setBarcodeLoading(true)
    setBarcodeStatus('loading')
    setBarcodeStatusHint('Looking up barcode…')
    setBarcodeError(null)

    try {
      const res = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(code)}`, { method: 'GET' })
      const data = await res.json().catch(() => ({}))
      if (res.status === 404 || res.status === 422) {
        setBarcodeStatus('idle')
        setBarcodeError('No food found for this barcode. Try again or use photo.')
        resumeScannerAfterLookup()
        return
      }
      if (res.status === 402) {
        setBarcodeStatus('idle')
        setBarcodeError(data?.message || data?.error || 'Not enough credits to scan. Each barcode scan costs 3 credits.')
        return
      }
      if (res.status === 401) {
        setBarcodeStatus('idle')
        setBarcodeError('Please sign in to scan barcodes.')
        return
      }
      if (!res.ok) {
        setBarcodeStatus('idle')
        setBarcodeError('Could not find a match. Please rescan or type the code.')
        resumeScannerAfterLookup()
        return
      }
      if (!data?.found || !data?.food) {
        setBarcodeStatus('idle')
        setBarcodeError('No food found for this barcode. Try again or use photo.')
        resumeScannerAfterLookup()
        return
      }
      const food = data.food
      const normalized: NormalizedFoodItem = {
        source: food.source === 'fatsecret' ? 'fatsecret' : food.source === 'usda' ? 'usda' : 'openfoodfacts',
        id: String(food.id || code),
        name: String(food.name || 'Scanned food'),
        brand: food.brand ?? null,
        serving_size: String(food.serving_size || '1 serving'),
        calories: toNumber(food.calories),
        protein_g: toNumber(food.protein_g),
        carbs_g: toNumber(food.carbs_g),
        fat_g: toNumber(food.fat_g),
        fiber_g: toNumber(food.fiber_g),
        sugar_g: toNumber(food.sugar_g),
      }
      setShowBarcodeScanner(false)
      setBarcodeStatus('idle')
      setBarcodeStatusHint('')
      addItemDirect(normalized)
      setManualBarcode('')
      setShowManualBarcodeInput(false)
    } catch {
      setBarcodeStatus('idle')
      setBarcodeError('Could not find a match. Please rescan or type the code.')
      resumeScannerAfterLookup()
    } finally {
      setBarcodeLoading(false)
      barcodeLookupInFlightRef.current = false
    }
  }

  const handleBarcodeDetected = (rawCode: string) => {
    if (!rawCode || barcodeLookupInFlightRef.current || barcodeDetectLockRef.current) return
    const cleaned = rawCode.replace(/[^0-9A-Za-z]/g, '')
    if (!cleaned) return
    barcodeDetectLockRef.current = true
    void lookupBarcodeAndAdd(cleaned).finally(() => {
      barcodeDetectLockRef.current = false
    })
  }

  const toggleTorch = async () => {
    const track = barcodeTorchTrackRef.current
    if (!track) {
      setTorchAvailable(false)
      setTorchEnabled(false)
      setBarcodeError('Flash is not available for this camera.')
      return
    }
    const capabilities = typeof track.getCapabilities === 'function' ? (track.getCapabilities() as any) : null
    if (!capabilities?.torch) {
      setTorchAvailable(false)
      setTorchEnabled(false)
      setBarcodeError('Flash is not available for this camera.')
      return
    }
    try {
      const next = !torchEnabled
      const constraints: MediaTrackConstraints & { advanced?: Array<{ torch?: boolean }> } = {
        advanced: [{ torch: next }],
      }
      await (track as any).applyConstraints(constraints)
      setTorchEnabled(next)
      setBarcodeError(null)
    } catch {
      setBarcodeError('Could not control the flash on this device.')
      resetTorchState()
    }
  }

  const startBarcodeScanner = async () => {
    if (!showBarcodeScanner) return
    resetTorchState()
    setShowManualBarcodeInput(false)
    setBarcodeStatus('loading')
    setBarcodeStatusHint('Starting camera…')
    setBarcodeError(null)
    try {
      barcodeLookupInFlightRef.current = false
      stopBarcodeScanner()
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setBarcodeError('Camera is only available in the browser.')
        setBarcodeStatusHint('Camera unavailable in this browser')
        setBarcodeStatus('idle')
        return
      }
      const region = document.getElementById(BARCODE_REGION_ID)
      if (!region) {
        setBarcodeError('Camera area missing. Close and reopen the scanner.')
        setBarcodeStatusHint('Camera area missing')
        setBarcodeStatus('idle')
        return
      }
      region.innerHTML = ''
      const videoEl = document.createElement('video')
      videoEl.setAttribute('playsinline', 'true')
      videoEl.setAttribute('autoplay', 'true')
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.autoplay = true
      videoEl.style.width = '100%'
      videoEl.style.height = '100%'
      videoEl.style.objectFit = 'cover'
      region.appendChild(videoEl)

      const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser')
      const { DecodeHintType } = await import('@zxing/library')
      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.ITF,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)
      const reader = new BrowserMultiFormatReader()
      reader.setHints(hints)

      const constraints: any = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          advanced: [{ focusMode: 'continuous' }],
        },
      }

      const controls = await reader.decodeFromConstraints(constraints, videoEl, (result: any) => {
        const text = result?.getText ? result.getText() : result?.text
        if (text) handleBarcodeDetected(text)
      })

      const stream = (videoEl.srcObject as MediaStream) || null
      barcodeScannerRef.current = { reader, controls, videoEl, stream }
      setBarcodeStatus('scanning')
      setBarcodeStatusHint('Scanning…')
      setTimeout(() => attachTorchTrackFromDom(), 150)
    } catch {
      setBarcodeError('Could not start the camera. Please allow camera access, then tap Restart.')
      setBarcodeStatusHint('Camera start failed')
      setBarcodeStatus('idle')
      stopBarcodeScanner()
    }
  }

  useEffect(() => {
    if (showBarcodeScanner) {
      startBarcodeScanner()
    } else {
      stopBarcodeScanner()
      resetBarcodeState()
    }
    return () => {
      stopBarcodeScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBarcodeScanner])

  useEffect(() => {
    if (showManualBarcodeInput && manualBarcodeInputRef.current) {
      manualBarcodeInputRef.current.focus()
    }
  }, [showManualBarcodeInput])

  const removeItem = (id: string) => {
    const current = itemsRef.current
    const idx = current.findIndex((x) => x.id === id)
    if (idx >= 0) {
      const removed = current[idx]
      setLastRemoved({ item: removed, index: idx })
      try {
        if (undoRemoveTimeoutRef.current) clearTimeout(undoRemoveTimeoutRef.current)
      } catch {}
      undoRemoveTimeoutRef.current = setTimeout(() => setLastRemoved(null), 5000)
    }
    setItems((prev) => prev.filter((x) => x.id !== id))
    setExpandedId((prev) => (prev === id ? null : prev))
  }

  const undoRemove = () => {
    const payload = lastRemoved
    if (!payload) return
    try {
      if (undoRemoveTimeoutRef.current) clearTimeout(undoRemoveTimeoutRef.current)
    } catch {}
    setItems((prev) => {
      const next = [...prev]
      const insertAt = Math.max(0, Math.min(payload.index, next.length))
      next.splice(insertAt, 0, payload.item)
      return next
    })
    setLastRemoved(null)
  }

  const setAmount = (id: string, raw: string) => {
    const v = String(raw ?? '').replace(',', '.')
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const num = v.trim() === '' ? NaN : Number(v)
        const amount = Number.isFinite(num) && num >= 0 ? num : 0
        const baseAmount = it.__baseAmount
        const baseUnit = it.__baseUnit
        const unit = it.__unit || baseUnit
        const pieceGrams = it.__pieceGrams
        const foodUnitGrams = getFoodUnitGrams(it.name)
        let servings = it.servings

        if (baseAmount && baseUnit && unit) {
          const inBase = convertAmount(amount, unit, baseUnit, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
          servings = baseAmount > 0 ? inBase / baseAmount : 0
        } else {
          // Fallback: treat amount as servings
          servings = amount
        }

        return { ...it, __amountInput: v, __amount: amount, servings: round3(Math.max(0, servings)) }
      }),
    )
  }

  const setUnit = (id: string, unit: BuilderUnit) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const baseAmount = it.__baseAmount
        const baseUnit = it.__baseUnit
        const pieceGrams = it.__pieceGrams
        const amount = Number.isFinite(Number(it.__amount)) ? Number(it.__amount) : 0
        const amountInput = typeof it.__amountInput === 'string' ? it.__amountInput : String(amount)
        const currentUnit = it.__unit || it.__baseUnit
        const foodUnitGrams = getFoodUnitGrams(it.name)
        let nextAmount = amount
        let nextAmountInput = amountInput

        if (isOpenUnit(unit)) {
          if (currentUnit) {
            const converted = convertAmount(amount, currentUnit, unit, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
            nextAmount = round3(Math.max(0, converted))
            nextAmountInput = String(nextAmount)
          }
        } else if (!currentUnit || isOpenUnit(currentUnit)) {
          nextAmount = 1
          nextAmountInput = '1'
        }

        if (!baseAmount || !baseUnit) {
          return { ...it, __unit: unit, __amount: nextAmount, __amountInput: nextAmountInput }
        }
        const inBase = convertAmount(nextAmount, unit, baseUnit, baseAmount, baseUnit, pieceGrams, foodUnitGrams)
        const servings = baseAmount > 0 ? inBase / baseAmount : 0
        return { ...it, __unit: unit, __amount: nextAmount, __amountInput: nextAmountInput, servings: round3(Math.max(0, servings)) }
      }),
    )
  }

  const buildDiaryAutosaveBundle = useCallback(() => {
    if (!isDiaryEdit) return null
    if (!sourceLogId) return null
    const itemsForSave = itemsRef.current?.length ? itemsRef.current : items
    if (!itemsForSave || itemsForSave.length === 0) return null

    const title = sanitizeMealTitle(mealName) || buildDefaultMealName(itemsForSave)
    const description = title

    const totalsForSave = itemsForSave.reduce(
      (total, it) => {
        const t = computeItemTotals(it)
        total.calories += t.calories
        total.protein += t.protein
        total.carbs += t.carbs
        total.fat += t.fat
        total.fiber += t.fiber
        total.sugar += t.sugar
        return total
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
    )

    const totalRecipeWeightForSave = computeTotalRecipeWeightG(itemsForSave)
    const portionAmountForSave = portionInputRef.current?.value ?? portionAmountInput
    const portionScaleRaw = computePortionScale(portionAmountForSave, portionUnit, totalRecipeWeightForSave, recipeServingsForPortion)
    const portionScaleForSave = portionControlEnabled ? portionScaleRaw : 1
    const portionAmountNumeric = parseNumericInput(portionAmountForSave)

    const portionWeightForSave = portionControlEnabled
      ? computePortionWeightG(portionAmountForSave, portionUnit, totalRecipeWeightForSave, recipeServingsForPortion)
      : null
    const portionMeta =
      portionControlEnabled && portionAmountNumeric && portionAmountNumeric > 0
        ? {
            __portionScale: round3(portionScaleForSave),
            __portionUnit: portionUnit,
            __portionAmount: portionAmountNumeric,
            __portionTotalWeightG:
              Number.isFinite(Number(totalRecipeWeightForSave)) && Number(totalRecipeWeightForSave) > 0
                ? Math.round(Number(totalRecipeWeightForSave))
                : null,
            __portionRecipeServings:
              Number.isFinite(Number(recipeServingsForPortion)) && Number(recipeServingsForPortion) > 0
                ? Number(recipeServingsForPortion)
                : null,
            __portionControlEnabled: true,
            ...(portionWeightForSave ? { __portionWeightG: Math.round(portionWeightForSave) } : {}),
          }
        : null

    const cleanedItems = itemsForSave.map((it) => {
      const {
        __baseAmount,
        __baseUnit,
        __amountInput,
        __pieceGrams,
        __servingOptions,
        __selectedServingId,
        __source,
        __sourceId,
        ...rest
      } = it
      return { ...rest, __amount: it.__amount, __unit: it.__unit, servings: computeServingsFromAmount(it) }
    })

    const shouldScaleTotals = Number.isFinite(portionScaleForSave) && portionScaleForSave !== 1
    const scaledTotals = shouldScaleTotals
      ? {
          calories: totalsForSave.calories * portionScaleForSave,
          protein: totalsForSave.protein * portionScaleForSave,
          carbs: totalsForSave.carbs * portionScaleForSave,
          fat: totalsForSave.fat * portionScaleForSave,
          fiber: totalsForSave.fiber * portionScaleForSave,
          sugar: totalsForSave.sugar * portionScaleForSave,
        }
      : totalsForSave

    const favoriteId = (linkedFavoriteId || '').trim()
    const createdAtIso = buildCreatedAtFromEntryTime(selectedDate, entryTime, new Date().toISOString())
    const nutritionBase: any = {
      calories: Math.round(scaledTotals.calories),
      protein: round3(scaledTotals.protein),
      carbs: round3(scaledTotals.carbs),
      fat: round3(scaledTotals.fat),
      fiber: round3(scaledTotals.fiber),
      sugar: round3(scaledTotals.sugar),
      __origin: 'meal-builder',
      __portionControlEnabled: portionControlEnabled,
      ...(favoriteId ? { __favoriteId: favoriteId } : {}),
      ...(portionMeta ? portionMeta : {}),
    }
    const diaryNutrition = favoriteId ? { ...nutritionBase, __favoriteManualEdit: true } : nutritionBase

    const signature = [
      title,
      String(portionControlEnabled ? '1' : '0'),
      portionUnit,
      String(parseNumericInput(portionAmountForSave) || ''),
      entryTime,
      String(Number(recipeServingsForPortion) || ''),
      buildItemsSignature(itemsForSave),
      favoriteId,
    ].join('|')

    return { title, description, cleanedItems, diaryNutrition, createdAtIso, signature }
  }, [isDiaryEdit, sourceLogId, items, mealName, portionControlEnabled, portionAmountInput, portionUnit, entryTime, recipeServingsForPortion, linkedFavoriteId, selectedDate])

  useEffect(() => {
    if (!isDiaryEdit) return
    if (!sourceLogId) return
    if (savingMeal) return
    const itemsForSave = itemsRef.current?.length ? itemsRef.current : items
    if (!itemsForSave || itemsForSave.length === 0) return

    try {
      if (diaryAutosaveTimeoutRef.current) window.clearTimeout(diaryAutosaveTimeoutRef.current)
      diaryAutosaveTimeoutRef.current = window.setTimeout(async () => {
        const built = buildDiaryAutosaveBundle()
        if (!built) return
        if (built.signature && built.signature === lastDiaryAutosaveSignatureRef.current) return
        lastDiaryAutosaveSignatureRef.current = built.signature || ''
        setAutosaveHint('Auto-saving…')
        try {
          const res = await fetch('/api/food-log', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: sourceLogId,
              description: built.description,
              nutrition: built.diaryNutrition,
              items: built.cleanedItems,
              meal: category,
              category,
              createdAt: built.createdAtIso,
            }),
          })
          if (!res.ok) throw new Error('autosave failed')
          try {
            sessionStorage.setItem(
              'foodDiary:entryOverride',
              JSON.stringify({
                dbId: sourceLogId,
                localDate: selectedDate,
                category,
                description: built.description,
                nutrition: built.diaryNutrition,
                total: built.diaryNutrition,
                items: built.cleanedItems,
                createdAt: built.createdAtIso,
              }),
            )
          } catch {}
          setAutosaveHint('Saved')
          window.setTimeout(() => setAutosaveHint(''), 1200)
        } catch {
          setAutosaveHint('Auto-save failed')
          window.setTimeout(() => setAutosaveHint(''), 1500)
        }
      }, 900)
    } catch {}

    return () => {
      try {
        if (diaryAutosaveTimeoutRef.current) window.clearTimeout(diaryAutosaveTimeoutRef.current)
      } catch {}
    }
  }, [isDiaryEdit, sourceLogId, items, mealName, portionControlEnabled, portionAmountInput, portionUnit, linkedFavoriteId, savingMeal, buildDiaryAutosaveBundle, category, selectedDate])

  const createMeal = async () => {
    if (items.length === 0) {
      setError('Add at least one ingredient first.')
      return
    }

    setError(null)

    const title = sanitizeMealTitle(mealName) || buildDefaultMealName(items)
    const description = title
    const favorites = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const existingWithSameTitle =
      favorites.find((f: any) => isCustomMealFavorite(f) && String(f?.label || f?.description || '').trim() === title.trim()) || null

    // DO NOT TOUCH (owner lock, HEL-160):
    // fromFavoriteAdjust is a one-off diary add flow only.
    // It must never update favorite/custom defaults.
    // Default favorite/custom edits are allowed only via Favorites/Custom pencil edit flow.
    const oneOffDiaryAddOnly = isFavoriteAdjustBuild
    const shouldAutoSaveFavorite = (() => {
      if (oneOffDiaryAddOnly) return false
      if (editFavoriteId) return true
      if (recipeImportDraft) return saveImportedRecipeToFavorites
      return true
    })()

    const favoriteLinkId = (() => {
      if (!shouldAutoSaveFavorite) return ''
      if (editFavoriteId) return editFavoriteId
      if (linkedFavoriteId && linkedFavoriteId.trim().length > 0) return linkedFavoriteId.trim()
      if (existingWithSameTitle?.id) return String(existingWithSameTitle.id)
      return `fav-${Date.now()}`
    })()
    const safeFavoriteLinkId = oneOffDiaryAddOnly ? '' : favoriteLinkId

    const itemsForSave = itemsRef.current?.length ? itemsRef.current : items
    const totalsForSave = itemsForSave.reduce(
      (total, it) => {
        const t = computeItemTotals(it)
        total.calories += t.calories
        total.protein += t.protein
        total.carbs += t.carbs
        total.fat += t.fat
        total.fiber += t.fiber
        total.sugar += t.sugar
        return total
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
    )
    const totalRecipeWeightForSave = computeTotalRecipeWeightG(itemsForSave)
    const portionAmountForSave = portionInputRef.current?.value ?? portionAmountInput
    const portionScaleRaw = computePortionScale(portionAmountForSave, portionUnit, totalRecipeWeightForSave, recipeServingsForPortion)
    const portionScaleForSave = portionControlEnabled ? portionScaleRaw : 1
    const portionAmountNumeric = parseNumericInput(portionAmountForSave)

    const shouldStripBuilderIds = Boolean(editFavoriteId) && !editFavoriteIsCustomRef.current
    const sourceItemsForMerge = shouldStripBuilderIds ? editFavoriteSourceItemsRef.current : null
    const cleanedItems = itemsForSave.map((it, index) => {
      const {
        __baseAmount,
        __baseUnit,
        __amountInput,
        __pieceGrams,
        __servingOptions,
        __selectedServingId,
        __source,
        __sourceId,
        ...rest
      } = it
      const next: any = { ...rest, __amount: it.__amount, __unit: it.__unit, servings: computeServingsFromAmount(it) }
      const source =
        Array.isArray(sourceItemsForMerge) && sourceItemsForMerge[index]
          ? sourceItemsForMerge[index]
          : null
      if (source && typeof source === 'object') {
        if (source.barcode) next.barcode = source.barcode
        if (source.barcodeSource) next.barcodeSource = source.barcodeSource
        if (source.detectionMethod) next.detectionMethod = source.detectionMethod
        if (source.source) next.source = source.source
      }
      if (shouldStripBuilderIds) {
        const sourceId = source && typeof source.id === 'string' ? source.id.trim() : ''
        if (sourceId) next.id = sourceId
        else delete next.id
      }
      return next
    })

    const shouldScaleTotals = Number.isFinite(portionScaleForSave) && portionScaleForSave !== 1
    const scaledTotals = shouldScaleTotals
      ? {
          calories: totalsForSave.calories * portionScaleForSave,
          protein: totalsForSave.protein * portionScaleForSave,
          carbs: totalsForSave.carbs * portionScaleForSave,
          fat: totalsForSave.fat * portionScaleForSave,
          fiber: totalsForSave.fiber * portionScaleForSave,
          sugar: totalsForSave.sugar * portionScaleForSave,
        }
      : totalsForSave
    const portionWeightForSave = portionControlEnabled
      ? computePortionWeightG(portionAmountForSave, portionUnit, totalRecipeWeightForSave, recipeServingsForPortion)
      : null
    const portionMeta =
      portionControlEnabled && portionAmountNumeric && portionAmountNumeric > 0
        ? {
            __portionScale: round3(portionScaleForSave),
            __portionUnit: portionUnit,
            __portionAmount: portionAmountNumeric,
            __portionTotalWeightG:
              Number.isFinite(Number(totalRecipeWeightForSave)) && Number(totalRecipeWeightForSave) > 0
                ? Math.round(Number(totalRecipeWeightForSave))
                : null,
            __portionRecipeServings:
              Number.isFinite(Number(recipeServingsForPortion)) && Number(recipeServingsForPortion) > 0
                ? Number(recipeServingsForPortion)
                : null,
            __portionControlEnabled: true,
            ...(portionWeightForSave ? { __portionWeightG: Math.round(portionWeightForSave) } : {}),
          }
        : null

    const importedRecipeMeta =
      recipeImportDraft &&
      Array.isArray((recipeImportDraft as any).steps) &&
      (recipeImportDraft as any).steps.length > 0
        ? {
            title: String((recipeImportDraft as any).title || title).trim() || title,
            sourceUrl: (recipeImportDraft as any).sourceUrl || null,
            servings: Number.isFinite(Number((recipeImportDraft as any).servings)) ? Number((recipeImportDraft as any).servings) : null,
            prepMinutes: Number.isFinite(Number((recipeImportDraft as any).prepMinutes))
              ? Number((recipeImportDraft as any).prepMinutes)
              : null,
            cookMinutes: Number.isFinite(Number((recipeImportDraft as any).cookMinutes))
              ? Number((recipeImportDraft as any).cookMinutes)
              : null,
            steps: (recipeImportDraft as any).steps.map((s: any) => String(s || '').trim()).filter(Boolean).slice(0, 30),
          }
        : null

    const createdAtIso = buildCreatedAtFromEntryTime(selectedDate, entryTime, new Date().toISOString())

    const payload = {
      description,
      nutrition: {
        calories: Math.round(scaledTotals.calories),
        protein: round3(scaledTotals.protein),
        carbs: round3(scaledTotals.carbs),
        fat: round3(scaledTotals.fat),
        fiber: round3(scaledTotals.fiber),
        sugar: round3(scaledTotals.sugar),
        __origin: 'meal-builder',
        __portionControlEnabled: portionControlEnabled,
        ...(safeFavoriteLinkId ? { __favoriteId: safeFavoriteLinkId } : {}),
        ...(portionMeta ? portionMeta : {}),
        ...(importedRecipeMeta ? { __importRecipe: importedRecipeMeta } : {}),
      },
      imageUrl: null,
      items: cleanedItems,
      localDate: selectedDate,
      meal: category,
      category,
      createdAt: createdAtIso,
    }

    setSavingMeal(true)
    try {
      // Editing a diary entry directly (no favorites template involved).
        if (!editFavoriteId && sourceLogId) {
          const diaryNutrition =
            safeFavoriteLinkId && payload.nutrition
              ? { ...(payload.nutrition as any), __favoriteManualEdit: true }
              : payload.nutrition
          const updateRes = await fetch('/api/food-log', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: sourceLogId,
              description,
              nutrition: diaryNutrition,
              items: cleanedItems,
              meal: category,
              category,
              createdAt: createdAtIso,
            }),
          })
          if (!updateRes.ok) {
            setError('Could not update this meal. Please try again.')
            return
          }
          try {
            sessionStorage.setItem(
              'foodDiary:entryOverride',
              JSON.stringify({
                dbId: sourceLogId,
                localDate: selectedDate,
                category,
                description,
                nutrition: diaryNutrition,
                total: diaryNutrition,
                items: cleanedItems,
                createdAt: createdAtIso,
              }),
            )
          } catch {}

        // Keep the linked saved meal in sync (if one exists, or create one for future use).
        try {
          if (safeFavoriteLinkId) {
            const existingIndex = favorites.findIndex((f: any) => String(f?.id || '') === safeFavoriteLinkId)
            const existing = existingIndex >= 0 ? favorites[existingIndex] : null
            const existingLabel = String(existing?.label || existing?.description || '').trim()
            const aliases = Array.isArray((existing as any)?.aliases) ? ([...(existing as any).aliases] as string[]) : []
            const normalizedExisting = normalizeMealLabel(existingLabel) || existingLabel
            if (normalizedExisting && normalizedExisting !== title && !aliases.includes(normalizedExisting)) {
              aliases.push(normalizedExisting)
            }
            const favoritePayload = {
              id: safeFavoriteLinkId,
              sourceId: sourceLogId,
              label: title,
              description,
              nutrition: payload.nutrition,
              total: payload.nutrition,
              items: cleanedItems,
              photo: null,
              method: 'meal-builder',
              customMeal: true,
              meal: category,
              createdAt: Date.now(),
              ...(aliases.length > 0 ? { aliases } : {}),
            }
            const nextFavorites =
              existingIndex >= 0
                ? favorites.map((f: any, idx: number) => (idx === existingIndex ? { ...favoritePayload, id: f.id || favoritePayload.id } : f))
                : [...favorites, favoritePayload]
            persistFavorites(nextFavorites)
          }
        } catch {}

        try {
          sessionStorage.setItem(
            'foodDiary:scrollToEntry',
            JSON.stringify({ dbId: sourceLogId, localDate: selectedDate, category }),
          )
        } catch {}
        clearDraft()
        router.push('/food')
        return
      }

      if (editFavoriteId) {
        setFavoriteSaving(true)
        const prev = favorites
        const existing = prev.find((f: any) => String(f?.id || '') === editFavoriteId) || null
        if (!existing) {
          setError('Could not find that saved meal to edit. Please reopen from Favorites → Custom.')
          return
        }
        const previousDescription = String(existing?.description || existing?.label || '').trim()
        const previousItemsSignature = buildRawItemsSignature(parseFavoriteItems(existing))
        const previousTotals = extractTotalsSignature(existing?.nutrition || existing?.total || null)
        let candidateLogId = ''
        try {
          const tz = new Date().getTimezoneOffset()
          const res = await fetch(`/api/food-log?date=${encodeURIComponent(selectedDate)}&tz=${tz}&t=${Date.now()}`, {
            cache: 'no-store',
          })
          if (res.ok) {
            const data = await res.json().catch(() => ({} as any))
            const logs = Array.isArray(data?.logs) ? data.logs : []
            if (logs.length > 0) {
              const previousLabelNorm = normalizeSyncLabel(previousDescription)
              const nextLabelNorm = normalizeSyncLabel(description)
              const byFavorite = logs.filter(
                (log: any) => String((log?.nutrients as any)?.__favoriteId || '').trim() === editFavoriteId,
              )
              if (byFavorite.length > 0 && byFavorite[0]?.id) {
                candidateLogId = String(byFavorite[0].id)
              } else {
                const labelMatches = logs.filter((log: any) => {
                  const label = normalizeSyncLabel(log?.description || log?.name || '')
                  return label && (label === previousLabelNorm || label === nextLabelNorm)
                })
                const itemMatches =
                  previousItemsSignature && previousItemsSignature.length > 0
                    ? labelMatches.filter((log: any) => {
                        const items = Array.isArray(log?.items)
                          ? log.items
                          : Array.isArray((log?.nutrients as any)?.items)
                          ? (log?.nutrients as any).items
                          : null
                        return buildRawItemsSignature(items) === previousItemsSignature
                      })
                    : []
                const totalsMatches =
                  previousTotals && Object.values(previousTotals).some((v) => v !== null)
                    ? labelMatches.filter((log: any) => totalsMatch(log?.nutrients, previousTotals))
                    : []
                const pool =
                  itemMatches.length === 1
                    ? itemMatches
                    : totalsMatches.length === 1
                    ? totalsMatches
                    : labelMatches.length === 1
                    ? labelMatches
                    : []
                if (pool.length === 1 && pool[0]?.id) {
                  candidateLogId = String(pool[0].id)
                }
              }
            }
          }
        } catch {}
        const existingOrigin = (() => {
          const fromNutrition = (existing as any)?.nutrition?.__origin
          if (typeof fromNutrition === 'string' && fromNutrition.trim().length > 0) return fromNutrition
          const fromTotal = (existing as any)?.total?.__origin
          if (typeof fromTotal === 'string' && fromTotal.trim().length > 0) return fromTotal
          return ''
        })()
        const keepMealBuilderOrigin = isCustomMealFavorite(existing)
        const normalizedNutrition = (() => {
          const base = payload.nutrition ? { ...payload.nutrition } : null
          if (!base) return base
          if (keepMealBuilderOrigin) return base
          if (Object.prototype.hasOwnProperty.call(base, '__origin')) {
            delete (base as any).__origin
          }
          if (existingOrigin) {
            return { ...base, __origin: existingOrigin }
          }
          return base
        })()

        // Keep the old label as an alias so older diary/library entries can still match this Favorite
        // after it is renamed (prevents "long USDA name" reappearing in the picker).
        const aliases = Array.isArray((existing as any)?.aliases) ? ([...(existing as any).aliases] as string[]) : []
        const normalizedExisting = normalizeMealLabel(previousDescription) || previousDescription
        if (normalizedExisting && normalizedExisting !== title && !aliases.includes(normalizedExisting)) {
          aliases.push(normalizedExisting)
        }
        const updatedFavorite = {
          ...existing,
          label: title,
          description,
          nutrition: normalizedNutrition,
          total: normalizedNutrition,
          items: cleanedItems,
          ...(aliases.length > 0 ? { aliases } : {}),
          method: existing?.method || (existing?.customMeal ? 'meal-builder' : 'text'),
          meal: existing?.meal || category,
          createdAt: existing?.createdAt || Date.now(),
        }
        try {
          saveFoodNameOverride(previousDescription || existing?.label || '', description, {
            ...existing,
            items: cleanedItems,
            sourceId: existing?.sourceId || candidateLogId || sourceLogId || '',
            nutrition: normalizedNutrition || payload.nutrition,
            total: normalizedNutrition || payload.nutrition,
          })
        } catch {}
        const nextFavorites = prev.map((f: any) => (String(f?.id || '') === editFavoriteId ? updatedFavorite : f))
        persistFavorites(nextFavorites)
        try {
          sessionStorage.setItem('foodDiary:favoritesAllForceRefresh', '1')
        } catch {}

        const syncNutrition = normalizedNutrition || payload.nutrition
        try {
          if (syncNutrition) {
            const res = await fetch('/api/food-log/sync-favorite', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                favoriteId: editFavoriteId,
                localDate: selectedDate,
                description,
                nutrition: syncNutrition,
                total: syncNutrition,
                items: cleanedItems,
                previousDescription,
                previousItemsSignature,
                previousTotals,
                candidateLogId,
              }),
            })
            if (res.ok) {
              try {
                sessionStorage.setItem(
                  'foodDiary:favoriteSync',
                  JSON.stringify({
                    favoriteId: editFavoriteId,
                    localDate: selectedDate,
                    description,
                    nutrition: syncNutrition,
                    total: syncNutrition,
                    items: cleanedItems,
                    previousDescription,
                    previousItemsSignature,
                    previousTotals,
                    candidateLogId,
                  }),
                )
              } catch {}
            }
          }
        } catch {}

        // If we were opened from a diary entry, update that FoodLog row too.
        // Do NOT use favorite.sourceId here: favorites are reusable templates and may point to an older log.
        const targetLogId = sourceLogId ? String(sourceLogId) : ''
        if (targetLogId) {
          try {
            await fetch('/api/food-log', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: targetLogId,
                description,
                nutrition: normalizedNutrition || payload.nutrition,
                items: cleanedItems,
                meal: existing?.meal || category,
                category: existing?.meal || category,
                createdAt: createdAtIso,
              }),
            })
          } catch {}
          try {
            sessionStorage.setItem(
              'foodDiary:scrollToEntry',
              JSON.stringify({ dbId: targetLogId, localDate: selectedDate, category: existing?.meal || category }),
            )
          } catch {}
        }

        // Owner request: after updating a favorite from Favorites flow,
        // ask whether to add this updated meal to diary immediately.
        if (!targetLogId) {
          const addCategory = normalizeCategory(existing?.meal || category)
          setFavoriteUpdatePrompt({
            description,
            nutrition: {
              ...(normalizedNutrition || payload.nutrition || {}),
              __favoriteId: editFavoriteId,
            },
            items: cleanedItems,
            category: addCategory,
          })
          clearDraft()
          return
        }

        clearDraft()
        router.push('/food')
        return
      }

      const addedOrderStamp = Date.now()
      const createNutrition = {
        ...(payload.nutrition as any),
        __addedOrder: addedOrderStamp,
      }
      const createPayload: any = {
        ...payload,
        nutrition: createNutrition,
      }
      if (isFavoriteAdjustBuild) createPayload.allowDuplicate = true

      const res = await fetch('/api/food-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        setError('Saving failed. Please try again.')
        return
      }
      if (isFavoriteAdjustBuild && favoriteAdjustRecencySeed) {
        try {
          const targetFavoriteId = String(favoriteAdjustRecencySeed.favoriteId || '').trim()
          const targetSourceId = String(favoriteAdjustRecencySeed.sourceId || '').trim()
          const targetLabelKey = normalizeFoodNameKey(
            normalizeMealLabel(String(favoriteAdjustRecencySeed.label || '')).trim(),
          )
          const usedAtMs = addedOrderStamp
          let changed = false
          const nextFavorites = favorites.map((fav: any) => {
            const favId = String(fav?.id || '').trim()
            const favSourceId = String(fav?.sourceId || '').trim()
            const favLabelKey = normalizeFoodNameKey(
              normalizeMealLabel(favoriteDisplayLabel(fav) || fav?.label || fav?.description || '').trim(),
            )
            const idMatch = targetFavoriteId && favId && favId === targetFavoriteId
            const sourceMatch = targetSourceId && favSourceId && favSourceId === targetSourceId
            const labelMatch = targetLabelKey && favLabelKey && favLabelKey === targetLabelKey
            if (!idMatch && !sourceMatch && !labelMatch) return fav
            changed = true
            return { ...fav, lastUsedAt: usedAtMs }
          })
          if (changed) persistFavorites(nextFavorites)
        } catch {
          // Non-blocking: diary add already succeeded.
        }
      }
      try {
        const createdId = typeof data?.id === 'string' ? data.id : null
        if (createdId) {
          sessionStorage.setItem(
            'foodDiary:entryOverride',
            JSON.stringify({
              dbId: createdId,
              localDate: selectedDate,
              category,
              description,
              nutrition: createNutrition,
              total: createNutrition,
              items: cleanedItems,
            }),
          )
        }
      } catch {}

      // Auto-save newly created meals into Favorites so they appear under Favorites → Custom.
      // For recipe-import builds, only do this if the user enabled "Save to favorites".
      if (shouldAutoSaveFavorite && safeFavoriteLinkId) {
        try {
          const createdId = typeof data?.id === 'string' ? data.id : null
          const favoritePayload: any = {
            id: safeFavoriteLinkId,
            sourceId: createdId,
            label: title,
            description,
            nutrition: payload.nutrition,
            total: payload.nutrition,
            items: cleanedItems,
            photo: null,
            method: 'meal-builder',
            customMeal: true,
            meal: category,
            createdAt: Date.now(),
          }
          if (importedRecipeMeta) {
            favoritePayload.recipe = {
              servings: importedRecipeMeta.servings,
              prepMinutes: importedRecipeMeta.prepMinutes,
              cookMinutes: importedRecipeMeta.cookMinutes,
              steps: importedRecipeMeta.steps,
            }
            favoritePayload.sourceUrl = importedRecipeMeta.sourceUrl || null
          }
          const existingIndex = favorites.findIndex(
            (fav: any) =>
              (fav.id && favoritePayload.id && String(fav.id) === String(favoritePayload.id)) ||
              (fav.sourceId && favoritePayload.sourceId && fav.sourceId === favoritePayload.sourceId) ||
              (fav.label && favoritePayload.label && fav.label === favoritePayload.label),
          )
          const nextFavorites =
            existingIndex >= 0
              ? favorites.map((fav: any, idx: number) =>
                  idx === existingIndex ? { ...favoritePayload, id: fav.id || favoritePayload.id } : fav,
                )
              : [...favorites, favoritePayload]
          persistFavorites(nextFavorites)
        } catch {}
      }

      // Scroll to the saved meal when returning to the diary.
      try {
        const createdId = typeof data?.id === 'string' ? data.id : null
        if (createdId) {
          sessionStorage.setItem(
            'foodDiary:scrollToEntry',
            JSON.stringify({ dbId: createdId, localDate: selectedDate, category }),
          )
        }
      } catch {}

      clearDraft()
      router.push('/food')
    } catch {
      setError('Saving failed. Please try again.')
    } finally {
      setFavoriteSaving(false)
      setSavingMeal(false)
    }
  }

  const handleFavoriteUpdatePromptCancel = () => {
    setFavoriteUpdatePrompt(null)
    clearDraft()
    router.push('/food')
  }

  const handleFavoriteUpdatePromptAdd = async () => {
    if (!favoriteUpdatePrompt || favoriteUpdatePromptSaving) return
    setFavoriteUpdatePromptSaving(true)
    try {
      const addedOrderStamp = Date.now()
      const addPayload = {
        description: favoriteUpdatePrompt.description,
        nutrition: {
          ...(favoriteUpdatePrompt.nutrition || {}),
          __addedOrder: addedOrderStamp,
        },
        imageUrl: null,
        items: favoriteUpdatePrompt.items,
        localDate: selectedDate,
        meal: favoriteUpdatePrompt.category,
        category: favoriteUpdatePrompt.category,
        createdAt: alignTimestampToLocalDate(new Date().toISOString(), selectedDate),
        allowDuplicate: true,
      }
      const addRes = await fetch('/api/food-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addPayload),
      })
      if (!addRes.ok) {
        setError('Favorite was updated, but we could not add it to diary right now.')
        return
      }
      const addData = await addRes.json().catch(() => ({} as any))
      const createdId = typeof addData?.id === 'string' ? addData.id : ''
      if (createdId) {
        try {
          sessionStorage.setItem(
            'foodDiary:entryOverride',
            JSON.stringify({
              dbId: createdId,
              localDate: selectedDate,
              category: favoriteUpdatePrompt.category,
              description: favoriteUpdatePrompt.description,
              nutrition: addPayload.nutrition,
              total: addPayload.nutrition,
              items: favoriteUpdatePrompt.items,
            }),
          )
          sessionStorage.setItem(
            'foodDiary:scrollToEntry',
            JSON.stringify({ dbId: createdId, localDate: selectedDate, category: favoriteUpdatePrompt.category }),
          )
        } catch {}
      }
      setFavoriteUpdatePrompt(null)
      clearDraft()
      router.push('/food')
    } catch {
      setError('Favorite was updated, but we could not add it to diary right now.')
    } finally {
      setFavoriteUpdatePromptSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {favoriteUpdatePrompt && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-xl p-5">
            <div className="text-base font-semibold text-gray-900">Favorite updated</div>
            <div className="mt-2 text-sm text-gray-600">Would you like to add this updated meal to your diary now?</div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleFavoriteUpdatePromptCancel}
                disabled={favoriteUpdatePromptSaving}
                className="flex-1 py-2.5 px-4 rounded-xl border border-emerald-600 bg-white text-emerald-600 font-semibold hover:bg-emerald-50 disabled:opacity-60"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={handleFavoriteUpdatePromptAdd}
                disabled={favoriteUpdatePromptSaving}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                {favoriteUpdatePromptSaving ? 'Adding…' : 'Add Meal'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-4">
          <div className="flex items-start gap-3 md:items-center">
            <button
              type="button"
              onClick={() => router.push('/food')}
              className="p-2 rounded-full hover:bg-gray-100"
              aria-label="Back"
            >
              <span aria-hidden>←</span>
            </button>
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900 truncate">
                {editFavoriteId ? 'Edit meal' : 'Build a meal'}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-sm font-medium text-emerald-700">
                  {CATEGORY_LABELS[category]}
                </span>
                <span className="text-gray-300">•</span>
                <span>{selectedDate}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="px-4 py-4">
        <div className="w-full max-w-4xl mx-auto space-y-4">
          {lastRemoved && (
            <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 w-[min(92vw,520px)] px-3 py-3 rounded-2xl bg-slate-900 text-white shadow-lg flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">Removed {String(lastRemoved.item?.name || 'item')}</div>
                <div className="text-xs text-white/80">Tap undo to restore</div>
              </div>
              <button
                type="button"
                onClick={undoRemove}
                className="px-3 py-2 rounded-xl bg-white text-slate-900 text-sm font-semibold"
              >
                Undo
              </button>
            </div>
          )}

          {showFavoritesPicker && (
            <div className="fixed inset-0 md:left-64 z-50 bg-white flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowFavoritesPicker(false)}
                  className="p-2 rounded-full hover:bg-gray-100"
                  aria-label="Back"
                >
                  <span aria-hidden>←</span>
                </button>
                <div className="flex-1 text-center">
                  <div className="text-lg font-semibold text-gray-900">Add from favorites</div>
                  <div className="text-xs text-gray-500">Pick from All / Favorites / Custom</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFavoritesPicker(false)}
                  className="p-2 rounded-full hover:bg-gray-100"
                  aria-label="Close"
                >
                  <span aria-hidden>✕</span>
                </button>
              </div>

              <div className="px-4 py-3 border-b border-gray-200">
                <input
                  value={favoritesSearch}
                  onChange={(e) => setFavoritesSearch(e.target.value)}
                  placeholder="Search all foods..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="px-4 py-3 border-b border-gray-200">
                <div className="grid grid-cols-3 gap-2">
                  {(['all', 'favorites', 'custom'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFavoritesActiveTab(tab)}
                      className={`py-2 text-sm font-semibold border rounded-lg ${
                        favoritesActiveTab === tab ? 'bg-gray-200 text-gray-900 border-gray-300' : 'bg-white text-gray-700 border-gray-300'
                      }`}
                    >
                      {tab === 'all' ? 'All' : tab === 'favorites' ? 'Favorites' : 'Custom'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {(() => {
                  const search = favoritesSearch.trim().toLowerCase()
                  const { allMeals, favoriteMeals, customMeals } = buildFavoritesDatasets()
                  const filterBySearch = (item: any) => {
                    if (!search) return true
                    return (
                      String(item?.label || '').toLowerCase().includes(search) ||
                      String(item?.serving || '').toLowerCase().includes(search) ||
                      String(item?.sourceTag || '').toLowerCase().includes(search)
                    )
                  }
                  const sortList = (list: any[]) => [...list].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))

                  let data: any[] = []
                  if (favoritesActiveTab === 'all') data = sortList(allMeals.filter(filterBySearch))
                  if (favoritesActiveTab === 'favorites')
                    data = sortList(favoriteMeals.filter(filterBySearch))
                  if (favoritesActiveTab === 'custom') data = sortList(customMeals.filter(filterBySearch))

                  if (data.length === 0) {
                    return (
                      <div className="text-sm text-gray-500 py-8 text-center">
                        {favoritesActiveTab === 'all'
                          ? 'No meals yet. Add some entries to see them here.'
                          : favoritesActiveTab === 'favorites'
                          ? 'No favorites yet.'
                          : 'No custom meals yet.'}
                      </div>
                    )
                  }

                  return (
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                      {data.map((item, idx) => {
                        const label = String(item?.label || 'Meal').trim() || 'Meal'
                        const calories = typeof item?.calories === 'number' && Number.isFinite(item.calories) ? item.calories : null
                        const displayCalories = calories !== null ? formatEnergyValue(calories, energyUnit) : null
                        const tag = String(item?.sourceTag || (favoritesActiveTab === 'favorites' ? 'Favorite' : 'Custom'))
                        const serving = String(item?.serving || '1 serving')
                        const key = normalizeMealLabel(label).toLowerCase()
                        const isSaved = Boolean(item?.favorite) || (key ? favoritesKeySet.has(key) : false)
                        const canSaveFromAll = favoritesActiveTab === 'all' && !isSaved && Boolean(item?.entry)
                        const favorite = item?.favorite || null
                        const favoriteId = favorite?.id ? String(favorite.id) : null
                        return (
                          <div
                            key={String(item?.id || idx)}
                            className="w-full flex items-stretch gap-2"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (item?.favorite) addFromFavorite(item.favorite)
                                else if (item?.entry) addFromFavorite(item.entry)
                                else addFromFavorite(item)
                                setShowFavoritesPicker(false)
                                setFavoritesSearch('')
                              }}
                              className="flex-1 min-w-0 flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">{label}</div>
                              <div className="text-xs text-gray-500 truncate">
                                {serving} • {tag}
                              </div>
                            </div>
                            {displayCalories !== null && (
                              <div className="text-sm font-semibold text-gray-900">
                                {displayCalories} {energyUnit}
                              </div>
                            )}
                          </button>

                            {favoritesActiveTab === 'all' && (
                              <div className="flex items-center pr-2">
                                {isSaved ? (
                                  <div className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
                                    Saved
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!canSaveFromAll}
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      if (item?.entry) {
                                        saveToFavorites(item.entry)
                                      }
                                    }}
                                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                                    aria-label="Save to favorites"
                                  >
                                    Save
                                  </button>
                                )}
                              </div>
                            )}

                            {favoritesActiveTab !== 'all' && favoriteId && (
                              <div className="flex items-center pr-2 gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    openEditFavorite(favorite)
                                  }}
                                  className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50"
                                  title="Edit meal"
                                  aria-label="Edit meal"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    deleteFavorite(favoriteId)
                                  }}
                                  className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-red-700 hover:bg-red-50"
                                  title="Delete meal"
                                  aria-label="Delete meal"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              {favoritesToast && (
                <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold shadow-lg">
                  {favoritesToast}
                </div>
              )}
            </div>
          )}

          {showBarcodeScanner && (
            <div className="fixed inset-0 z-50 bg-black flex flex-col">
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowBarcodeScanner(false)}
                  className="w-10 h-10 flex items-center justify-center"
                  aria-label="Close scanner"
                >
                  <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="text-lg font-semibold text-gray-900">Scan Barcode</div>
                <div className="w-10" />
              </div>

              <div className="flex-1 relative bg-black overflow-hidden">
                <div id={BARCODE_REGION_ID} className="absolute inset-0" />

                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center px-6">
                  <div className="text-center mb-6">
                    <div className="text-white text-xl font-semibold drop-shadow-lg">Scan Barcode</div>
                    <div className="text-white/80 text-sm mt-1 drop-shadow">Place barcode in the frame to scan</div>
                  </div>

                  <div className="w-72 h-[220px] rounded-[22px] border-[4px] border-white/95 shadow-[0_0_30px_rgba(0,0,0,0.35)]" />

                  {barcodeStatusHint && (
                    <div className="absolute bottom-6 left-0 right-0 text-center">
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-black/55 text-white text-xs font-semibold shadow-lg">
                        {barcodeStatusHint}
                      </div>
                    </div>
                  )}
                </div>

                {showManualBarcodeInput && (
                  <div
                    className="pointer-events-auto absolute left-4 right-4 bg-white/95 rounded-2xl shadow-2xl border border-gray-200 p-4 space-y-3"
                    style={{ bottom: '110px' }}
                  >
                    <div className="text-sm font-semibold text-gray-900">Type the barcode</div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={manualBarcodeInputRef}
                        value={manualBarcode}
                        onChange={(e) => setManualBarcode(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            lookupBarcodeAndAdd(manualBarcode)
                          }
                        }}
                        placeholder="Enter barcode number"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => lookupBarcodeAndAdd(manualBarcode)}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-emerald-700"
                      >
                        Search
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowManualBarcodeInput(false)
                        setManualBarcode('')
                      }}
                      className="text-xs text-gray-500 underline font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {barcodeStatus === 'loading' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="text-white text-sm font-medium">Starting camera...</span>
                    </div>
                  </div>
                )}
              </div>

              {barcodeError && (
                <div className="flex-shrink-0 px-4 py-3 bg-red-500 text-white text-center text-sm">
                  {barcodeError}
                </div>
              )}

              <div className="flex-shrink-0 bg-stone-100 border-t border-gray-200" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                <div className="flex items-center justify-evenly px-6 py-4 gap-6">
                  <button
                    type="button"
                    onClick={toggleTorch}
                    disabled={!torchAvailable}
                    className={`flex items-center gap-2 font-semibold ${torchAvailable ? 'text-gray-800' : 'text-gray-400'}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="text-sm uppercase tracking-wide">{torchEnabled ? 'Flash On' : 'Flash'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowManualBarcodeInput((prev) => !prev)
                      setBarcodeError(null)
                      setTimeout(() => {
                        manualBarcodeInputRef.current?.focus()
                      }, 50)
                    }}
                    className="flex items-center gap-2 text-gray-800 font-semibold"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h2m2 0h2m2 0h2m2 0h2M4 18h2m2 0h2m2 0h2m2 0h2M7 6v12m4-12v12m4-12v12" />
                    </svg>
                    <span className="text-sm uppercase tracking-wide">{showManualBarcodeInput ? 'Hide Input' : 'Type Barcode'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

	          {(recipeImportLoading || recipeImportMissing.length > 0 || (recipeImportDraft && Array.isArray((recipeImportDraft as any).steps) && (recipeImportDraft as any).steps.length > 0)) && (
	            <div className="space-y-3">
	              {recipeImportLoading && (
	                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
	                  <div className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
	                    <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
	                    Importing recipe ingredients…
	                  </div>
	                  <div className="mt-1 text-xs text-emerald-800">
	                    {Math.min(recipeImportProgress.processed, recipeImportProgress.total)} of {recipeImportProgress.total || 0} checked • {recipeImportProgress.matched} found
	                  </div>
	                  <div className="mt-1 text-xs text-emerald-700">
	                    This can take a little while. Please stay on this page until it finishes.
	                  </div>
	                </div>
	              )}

	              {recipeImportDraft && Array.isArray((recipeImportDraft as any).steps) && (recipeImportDraft as any).steps.length > 0 && (
	                <details className="rounded-2xl border border-gray-200 bg-white p-4">
	                  <summary className="cursor-pointer text-sm font-semibold text-gray-900">Recipe instructions (from import)</summary>
	                  <ol className="mt-3 space-y-2 text-sm text-gray-700 list-decimal pl-5">
	                    {(recipeImportDraft as any).steps.slice(0, 20).map((step: any, i: number) => (
	                      <li key={i} className="leading-relaxed">
	                        {String(step || '').trim()}
	                      </li>
	                    ))}
	                  </ol>
	                  {typeof (recipeImportDraft as any).sourceUrl === 'string' && (recipeImportDraft as any).sourceUrl.trim() ? (
	                    <div className="mt-3 text-xs text-gray-500">Source: {(recipeImportDraft as any).sourceUrl}</div>
	                  ) : null}
	                </details>
	              )}

	              {recipeImportMissing.length > 0 && (
	                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
	                  <div className="text-sm font-semibold text-amber-900">Some ingredients need a quick manual match</div>
	                  <div className="mt-1 text-xs text-amber-800">
	                    We couldn’t find nutrition data for {recipeImportMissing.length} item{recipeImportMissing.length === 1 ? '' : 's'}. Search and add them manually.
	                  </div>
	                  <div className="mt-2 text-xs text-amber-900">
	                    {recipeImportMissing.slice(0, 6).map((m, idx) => (
	                      <div key={idx}>• {m}</div>
	                    ))}
	                    {recipeImportMissing.length > 6 && <div>• …</div>}
	                  </div>
	                </div>
	              )}
	            </div>
	          )}

          {recipeImportLoading && recipeImportProgress.total > 0 && (
            <div className="fixed bottom-5 right-5 z-[70] w-[min(92vw,360px)] rounded-2xl border border-emerald-200 bg-white shadow-xl p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                Building your meal…
              </div>
              <div className="mt-1 text-xs text-gray-700">
                {Math.min(recipeImportProgress.processed, recipeImportProgress.total)} of {recipeImportProgress.total} ingredients checked.
              </div>
              <div className="mt-1 text-xs text-gray-700">
                {recipeImportProgress.matched} found • {recipeImportProgress.missing} need manual match
              </div>
              {recipeImportProgress.current ? (
                <div className="mt-1 text-[11px] text-gray-500 truncate">
                  Checking: {recipeImportProgress.current}
                </div>
              ) : null}
              <div className="mt-2 h-2 w-full rounded-full bg-emerald-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      recipeImportProgress.total > 0
                        ? (recipeImportProgress.processed / recipeImportProgress.total) * 100
                        : 0,
                    )}%`,
                  }}
                />
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                This can take a while. Please do not leave this page.
              </div>
            </div>
          )}

	        <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3">
	          <div className="text-sm font-semibold text-gray-900">Meal name (optional)</div>
	          <input
	            value={mealName}
            onFocus={() => {
              mealNameBackupRef.current = mealName
              mealNameEditedRef.current = false
              mealNameWasClearedOnFocusRef.current = mealName.trim().length > 0
              if (mealNameWasClearedOnFocusRef.current) setMealName('')
            }}
            onChange={(e) => {
              mealNameEditedRef.current = true
              setMealName(e.target.value)
            }}
            onBlur={() => {
              if (mealNameWasClearedOnFocusRef.current && !mealNameEditedRef.current) {
                setMealName(mealNameBackupRef.current)
              }
              mealNameWasClearedOnFocusRef.current = false
              mealNameEditedRef.current = false
            }}
            placeholder={buildDefaultMealName(items)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-900">Search ingredients</div>
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
              onFocus={() => {
                queryBackupRef.current = query
                queryWasClearedOnFocusRef.current = query.trim().length > 0
                queryEditedAfterClearRef.current = false
                if (queryWasClearedOnFocusRef.current) {
                  setQuery('')
                  setError(null)
                  setResults([])
                }
              }}
              onChange={(e) => {
                if (queryWasClearedOnFocusRef.current) queryEditedAfterClearRef.current = true
                setQuery(e.target.value)
                setError(null)
              }}
              onBlur={(e) => {
                const current = String((e.target as HTMLInputElement).value || '')
                if (queryWasClearedOnFocusRef.current && !queryEditedAfterClearRef.current && current.trim().length === 0) {
                  setQuery(queryBackupRef.current)
                }
                queryWasClearedOnFocusRef.current = false
                queryEditedAfterClearRef.current = false
              }}
              placeholder="e.g. chicken breast"
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
              disabled={busy || query.trim().length === 0}
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
              {busy ? (
                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 20l-3.5-3.5" />
                </svg>
              )}
            </button>
          </form>
          {(results.length > 0 || searchLoading || error) && (
            <div className="pt-2">
              {searchLoading && (
                <div className="text-xs text-gray-500">Searching…</div>
              )}
              {error && <div className="text-xs text-red-600">{error}</div>}
              {results.length > 0 && (
                <div className="max-h-72 overflow-y-auto space-y-2 pt-2">
                  {results.map((r) => {
                    const isSuggestion = Boolean((r as any).__suggestion)
                    const isBrandSuggestion = Boolean((r as any).__brandSuggestion)
                    const display = buildSearchDisplay(r, query)
                    return (
                      <div key={`${r.source}:${r.id}`} className="flex items-start justify-between rounded-xl border border-gray-200 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {display.title}
                            {display.showBrandSuffix && r.brand ? ` – ${r.brand}` : ''}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {isBrandSuggestion ? 'Brand match' : r.serving_size ? `Serving: ${r.serving_size}` : 'Serving: (unknown)'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (isBrandSuggestion) {
                              const nextQuery = (r as any).__searchQuery || r.name
                              setQuery(nextQuery)
                              setError(null)
                              runSearch(nextQuery)
                              return
                            }
                            if (isSuggestion) {
                              addSuggestionItem(r)
                              return
                            }
                            addItemWithMacros(r)
                          }}
                          className="ml-3 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                        >
                          {isBrandSuggestion ? 'Show' : 'Add'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          <div className="pt-2">
            <MissingFoodReport
              defaultQuery={query}
              kind={kind}
              country={userData?.country || ''}
              source="build-meal"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind('packaged')}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold ${
                kind === 'packaged' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-200'
              }`}
            >
              Packaged/Fast-foods
            </button>
            <button
              type="button"
              onClick={() => setKind('single')}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold ${
                kind === 'single' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-gray-700 border-gray-200'
              }`}
            >
              Single food
            </button>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  triggerHaptic(10)
                  photoInputRef.current?.click()
                }}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
              >
                {photoLoading ? 'Adding photo…' : 'Add by photo'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowBarcodeScanner(true)}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
              >
                {barcodeLoading ? 'Looking up…' : 'Scan barcode'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setFavoritesActiveTab('all')
                  setFavoritesSearch('')
                  setShowFavoritesPicker(true)
                }}
                className="col-span-2 sm:col-span-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
              >
                Add from favorites
              </button>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) analyzePhotoAndAdd(f)
              }}
            />
          </div>

          <UsageMeter inline className="mt-1" feature="foodAnalysis" />

          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-700">Portion control</div>
                <div className="text-[11px] text-gray-600">
                  {portionControlEnabled
                    ? 'Toggle is on: you are editing a portion amount.'
                    : 'Toggle is off: this meal uses 100% of ingredients.'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={portionControlEnabled}
                aria-label="Portion control"
                onClick={() => setPortionControlEnabled((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  portionControlEnabled ? 'bg-emerald-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    portionControlEnabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {portionControlEnabled ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  {portionUnit === 'serving' ? (
                    <div className="flex-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPortionScaleOverriddenByUser(true)
                          adjustServingPortion(-1)
                        }}
                        className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-lg font-semibold text-gray-700 hover:bg-gray-50"
                        aria-label="Decrease servings"
                      >
                        −
                      </button>
                      <div className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm text-gray-900">
                        {servingLabel}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPortionScaleOverriddenByUser(true)
                          adjustServingPortion(1)
                        }}
                        className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-lg font-semibold text-gray-700 hover:bg-gray-50"
                        aria-label="Increase servings"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <input
                      ref={portionInputRef}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={portionAmountInput}
                      onFocus={() => setPortionAmountInput('')}
                      onChange={(e) => {
                        setPortionScaleOverriddenByUser(true)
                        setPortionAmountInput(e.target.value)
                      }}
                      placeholder={portionUnit === 'oz' ? 'e.g., 10' : 'e.g., 300'}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  )}
                  <select
                    value={portionUnit}
                    onChange={(e) => {
                      setPortionScaleOverriddenByUser(true)
                      setPortionUnit(e.target.value as PortionUnit)
                    }}
                    className="w-28 px-2 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="serving">serving</option>
                    <option value="g">g</option>
                    <option value="oz">oz</option>
                  </select>
                </div>
                {totalRecipeWeightG > 0 && Number.isFinite(effectivePortionScale) && effectivePortionScale > 0 ? (
                  <div className="mt-2 text-[11px] text-emerald-700">
                    This portion is {Math.round(effectivePortionScale * 100)}% of the full amount.
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-2 text-[11px] text-emerald-700">This meal is 100% of the full amount.</div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="px-2 py-1 rounded-full bg-white border border-emerald-200 text-[11px] font-medium text-gray-700">
                <span className="font-semibold text-gray-900">{formatEnergyValue(mealTotals.calories, energyUnit)}</span> {energyUnit}
              </div>
              <div className="px-2 py-1 rounded-full bg-white border border-emerald-200 text-[11px] font-medium text-gray-700">
                <span className="font-semibold text-gray-900">{round3(mealTotals.protein)}</span> g protein
              </div>
              <div className="px-2 py-1 rounded-full bg-white border border-emerald-200 text-[11px] font-medium text-gray-700">
                <span className="font-semibold text-gray-900">{round3(mealTotals.carbs)}</span> g carbs
              </div>
              <div className="px-2 py-1 rounded-full bg-white border border-emerald-200 text-[11px] font-medium text-gray-700">
                <span className="font-semibold text-gray-900">{round3(mealTotals.fat)}</span> g fat
              </div>
              <div className="px-2 py-1 rounded-full bg-white border border-emerald-200 text-[11px] font-medium text-gray-700">
                <span className="font-semibold text-gray-900">{round3(mealTotals.fiber)}</span> g fibre
              </div>
              <div className="px-2 py-1 rounded-full bg-white border border-emerald-200 text-[11px] font-medium text-gray-700">
                <span className="font-semibold text-gray-900">{round3(mealTotals.sugar)}</span> g sugar
              </div>
            </div>
            <div className="mt-1 text-[11px] text-gray-600">
              {portionControlEnabled
                ? 'These update live when you change portion size.'
                : 'Portion control is off. Totals show the full meal.'}
            </div>
            {portionControlEnabled &&
            portionUnit === 'serving' &&
            Number.isFinite(Number(recipeServingsForPortion)) &&
            Number(recipeServingsForPortion) > 0 ? (
              <div className="mt-2 text-[11px] text-gray-600">
                Recipe has about {Math.round(Number(recipeServingsForPortion))} servings.
              </div>
            ) : null}
            {totalRecipeWeightG > 0 ? (
              <div className="mt-2 text-[11px] text-gray-600">
                Full recipe ≈ {Math.round(totalRecipeWeightG)} g
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-gray-600">
                Add weights to ingredients to use portions.
              </div>
            )}
            {recipeImportDraft && !editFavoriteId ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] text-gray-700">
                    Would you like to save this as a custom meal?
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={saveImportedRecipeToFavorites}
                    aria-label="Save as custom meal"
                    onClick={() => setSaveImportedRecipeToFavorites((prev) => !prev)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      saveImportedRecipeToFavorites ? 'bg-emerald-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        saveImportedRecipeToFavorites ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {saveImportedRecipeToFavorites
                    ? 'Toggle is on: this meal will be saved to Custom meals.'
                    : 'Toggle is off: this meal will not be saved to Custom meals.'}
                </div>
              </div>
            ) : null}
            {showPortionSaveCta && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2">
                <div className="text-[11px] text-gray-600">Ready to save this portion.</div>
                <button
                  type="button"
                  onClick={createMeal}
                  disabled={busy || favoriteSaving}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {isFavoriteAdjustBuild ? 'Add' : 'Save meal'}
                </button>
              </div>
            )}
          </div>

          {photoPreviewUrl && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
              <div className="relative w-full max-w-sm mx-auto">
                {photoLoading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin" />
                  </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreviewUrl}
                  alt="Analyzed food"
                  className="w-full aspect-square object-cover"
                />
              </div>
              <div className="px-3 py-2 text-xs text-gray-600 flex items-center justify-between gap-2">
                <span>{photoLoading ? 'Analyzing photo…' : 'Photo added'}</span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
                    } catch {}
                    setPhotoPreviewUrl(null)
                    try {
                      if (photoInputRef.current) photoInputRef.current.value = ''
                    } catch {}
                  }}
                  className="text-xs font-semibold text-gray-700 hover:text-gray-900"
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {(savingMeal || photoLoading || barcodeLoading) && (
            <div className="text-xs text-gray-500">
              {savingMeal
                ? 'Saving…'
                : photoLoading
                ? 'Analyzing photo…'
                : barcodeLoading
                ? 'Looking up barcode…'
                : 'Working…'}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            {/* RECIPE LOCK (owner request): this is the single top-level ingredients expander.
                Keep as one section toggle on reopen/edit flows unless owner approves change. */}
            <button
              type="button"
              onClick={() => {
                if (items.length === 0) return
                setIngredientsListExpanded((prev) => !prev)
              }}
              className={`flex items-center gap-2 text-sm font-semibold ${
                items.length === 0 ? 'text-gray-900 cursor-default' : 'text-gray-900 hover:text-gray-700'
              }`}
            >
              <span>Your ingredients</span>
              {items.length > 0 ? <span className="text-gray-400">{ingredientsListExpanded ? '▾' : '▸'}</span> : null}
            </button>
            <div className="text-xs text-gray-500">{items.length} item{items.length === 1 ? '' : 's'}</div>
          </div>

          {items.length === 0 ? (
            <div className="text-sm text-gray-500">Add ingredients using the search above.</div>
          ) : !ingredientsListExpanded ? (
            <button
              type="button"
              onClick={() => setIngredientsListExpanded(true)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs text-gray-600 hover:bg-gray-100"
            >
              Ingredients are hidden. Tap to expand.
            </button>
          ) : (
            <div className="space-y-2">
              {items.map((it) => {
                const expanded = expandedId === it.id
                const compactCollapsedHeader = Boolean((editFavoriteId || sourceLogId) && !expanded)
                const baseUnits = allowedUnitsForItem(it)
                const hasCustomUnits = Boolean(getFoodUnitGrams(it.name))
                const displayName = applyFoodNameOverride(it.name, { items: [it] }, foodNameOverrideIndex) || it.name
                const isImportedRecipeView = Boolean(recipeImportDraft || recipeImportFlag)
                const totals = computeItemTotals(it)
                const displayTotals = applyPortionScaleToTotals(totals, effectivePortionScale)
                const macroTotals = isImportedRecipeView ? totals : displayTotals
                const amountUnit = it.__unit || it.__baseUnit
                const fullAmount = Number.isFinite(Number(it.__amount)) ? round3(Number(it.__amount)) : null
                const hasPortionScale = Number.isFinite(Number(effectivePortionScale)) && Number(effectivePortionScale) > 0
                const showPortionAmount = Boolean(
                  portionControlEnabled &&
                  amountUnit &&
                    fullAmount !== null &&
                    hasPortionScale &&
                    Math.abs(Number(effectivePortionScale) - 1) > 0.0001,
                )
                const portionAmount = showPortionAmount
                  ? round3(Math.max(0, Number(fullAmount) * Number(effectivePortionScale)))
                  : null
                return (
                  <div
                    key={it.id}
                    data-builder-item-id={it.id}
                    className="rounded-2xl border border-gray-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : it.id)}
                      className="w-full flex items-center justify-between px-3 py-3 bg-white hover:bg-gray-50"
                    >
                      <div className="min-w-0 text-left">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {displayName}
                          {it.brand ? ` – ${it.brand}` : ''}
                        </div>
                        {!compactCollapsedHeader && (
                          <>
                            {isImportedRecipeView ? (
                              <div className="text-[11px] text-gray-500 truncate">
                                {it.__baseUnit && amountUnit && fullAmount !== null
                                  ? `Full recipe amount: ${fullAmount} ${amountUnit}`
                                  : `Full recipe servings: ${it.servings}`}
                              </div>
                            ) : (
                              <div className="text-[11px] text-gray-500 truncate">
                                {it.serving_size ? `Serving: ${it.serving_size}` : 'Serving: (unknown)'} •{' '}
                                {it.__baseUnit && amountUnit && fullAmount !== null
                                  ? `Amount (full recipe): ${fullAmount} ${amountUnit}`
                                  : `Servings: ${it.servings}`}
                              </div>
                            )}
                            {showPortionAmount && amountUnit && portionAmount !== null ? (
                              <div className="text-[11px] text-gray-500 truncate">
                                Portion amount: {portionAmount} {amountUnit}
                              </div>
                            ) : null}
                            {it.__matchedName &&
                            normalizeSearchToken(it.__matchedName) !== normalizeSearchToken(it.name) ? (
                              <div className="text-[11px] text-gray-400 truncate">
                                Matched nutrition: {it.__matchedName}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
                      </div>
                    </button>

                    {expanded && (
                      <div className="px-3 pb-3 bg-white space-y-3">
                        {!isImportedRecipeView &&
                          Array.isArray(it.__servingOptions) &&
                          it.__servingOptions.length > 0 &&
                          !hasCustomUnits && (
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">Serving size options</div>
                            <select
                              value={it.__selectedServingId || ''}
                              onChange={(e) => setServingOption(it.id, e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            >
                              <option value="">Choose a size</option>
                              {it.__servingOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label || opt.serving_size}
                                </option>
                              ))}
                            </select>
                          </div>
                          )}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">Amount</div>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={getAmountInputStepForUnit(it.__unit || it.__baseUnit)}
                              value={it.__amountInput}
                              onFocus={(e) => {
                                // Mobile UX: tap-to-clear, but restore if user doesn't type anything.
                                const current = String((e.target as HTMLInputElement).value || '')
                                amountBackupRef.current.set(it.id, current)
                                amountEditedAfterClearRef.current.delete(it.id)
                                if (!current.trim()) {
                                  amountWasClearedOnFocusRef.current.delete(it.id)
                                  return
                                }
                                amountWasClearedOnFocusRef.current.add(it.id)
                                setAmount(it.id, '')
                              }}
                              onChange={(e) => {
                                if (amountWasClearedOnFocusRef.current.has(it.id)) amountEditedAfterClearRef.current.add(it.id)
                                setAmount(it.id, e.target.value)
                              }}
                              onBlur={(e) => {
                                const cleared = amountWasClearedOnFocusRef.current.has(it.id)
                                const edited = amountEditedAfterClearRef.current.has(it.id)
                                const current = String((e.target as HTMLInputElement).value || '')
                                if (cleared && !edited && current.trim().length === 0) {
                                  const backup = amountBackupRef.current.get(it.id)
                                  if (typeof backup === 'string') setAmount(it.id, backup)
                                }
                                amountWasClearedOnFocusRef.current.delete(it.id)
                                amountEditedAfterClearRef.current.delete(it.id)
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">Serving size</div>
                            {baseUnits.length > 0 ? (
                              <select
                                value={it.__unit || it.__baseUnit || baseUnits[0]}
                                onChange={(e) => setUnit(it.id, e.target.value as BuilderUnit)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              >
                                {baseUnits.map((u) => (
                                  <option key={u} value={u}>
                                    {formatUnitLabel(u, it)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-600">
                                servings
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{formatEnergyValue(macroTotals.calories, energyUnit)}</span> {energyUnit}
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(macroTotals.protein)}</span> g protein
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(macroTotals.carbs)}</span> g carbs
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(macroTotals.fat)}</span> g fat
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(macroTotals.fiber)}</span> g fibre
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(macroTotals.sugar)}</span> g sugar
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            removeItem(it.id)
                          }}
                          className="w-full mt-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100"
                        >
                          Remove ingredient
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-gray-900">
              {portionControlEnabled && effectivePortionScale !== 1 ? 'Your portion totals' : 'Meal totals'}
            </div>
            <div className="inline-flex items-center text-[11px] bg-gray-100 rounded-full p-0.5 border border-gray-200">
              <button
                type="button"
                onClick={() => setEnergyUnit('kcal')}
                className={`px-2 py-0.5 rounded-full ${
                  energyUnit === 'kcal' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                kcal
              </button>
              <button
                type="button"
                onClick={() => setEnergyUnit('kJ')}
                className={`px-2 py-0.5 rounded-full ${
                  energyUnit === 'kJ' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                kJ
              </button>
            </div>
          </div>
          {portionControlEnabled && effectivePortionScale !== 1 && (
            <div className="mb-2 text-[11px] text-gray-600">
              Your portion is about {Math.round(effectivePortionScale * 100)}% of the recipe.
              <span className="mx-1">•</span>
              Whole recipe: {formatEnergyValue(baseMealTotals.calories, energyUnit)} {energyUnit} • {round3(baseMealTotals.carbs)} g
              carbs • {round3(baseMealTotals.sugar)} g sugar
            </div>
          )}
          {!portionControlEnabled && (
            <div className="mb-2 text-[11px] text-gray-600">This meal is 100% of the full amount.</div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {MEAL_TOTAL_CARDS.map((card) => {
              const value =
                card.key === 'calories'
                  ? formatEnergyValue(mealTotals.calories, energyUnit)
                  : card.key === 'protein'
                  ? round3(mealTotals.protein)
                  : card.key === 'carbs'
                  ? round3(mealTotals.carbs)
                  : card.key === 'fat'
                  ? round3(mealTotals.fat)
                  : card.key === 'fiber'
                  ? round3(mealTotals.fiber)
                  : round3(mealTotals.sugar)
              const label = card.key === 'calories' ? (energyUnit === 'kJ' ? 'Kilojoules' : 'Calories') : card.label
              const unit = card.key === 'calories' ? energyUnit : card.unit || ''
              return (
                <div
                  key={card.key}
                  className={`rounded-xl p-3 bg-gradient-to-br ${card.gradient} border border-gray-100`}
                >
                  <div className={`text-lg font-bold ${card.accent}`}>
                    {value}
                    {unit ? ` ${unit}` : ''}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</div>
                </div>
              )
            })}
          </div>
        </div>

        {(autosaveHint || isDiaryEdit) && (
          <div className="text-xs text-gray-500 px-1">
            {autosaveHint || 'Auto-saving while you edit…'}
          </div>
        )}

        {showEntryTimeOverride && (
          <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-2">
            <label className="block text-sm font-medium text-gray-700">Change time entry</label>
            <input
              type="time"
              value={entryTime}
              onChange={(e) => setEntryTime(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-base"
            />
          </div>
        )}

        <button
          type="button"
          onClick={createMeal}
          disabled={busy}
          className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-2xl"
        >
          {savingMeal ? (isFavoriteAdjustBuild ? 'Adding…' : 'Saving…') : editFavoriteId || sourceLogId ? 'Update' : isFavoriteAdjustBuild ? 'Add' : 'Save meal'}
        </button>

        <div className="pb-10" />
        </div>
      </div>
    </div>
  )
}
