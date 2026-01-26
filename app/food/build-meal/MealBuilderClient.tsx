'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import UsageMeter from '@/components/UsageMeter'

type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'uncategorized'

type NormalizedFoodItem = {
  source: 'openfoodfacts' | 'usda' | 'fatsecret'
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
  | 'slice'
  | 'serving'

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

const nameMatchesSearchQuery = (name: string, searchQuery: string, options?: { requireFirstWord?: boolean }) => {
  // Ignore 1-letter tokens so "art" does not match "Bartlett" via "t".
  const queryTokens = getSearchTokens(searchQuery).filter((token) => token.length >= 2)
  const nameTokens = getSearchTokens(name).filter((token) => token.length >= 2)
  if (queryTokens.length === 0 || nameTokens.length === 0) return false
  const tokenMatches = (token: string, word: string) => {
    if (!token || !word) return false
    if (word.startsWith(token)) return true
    if (word.length >= 2 && token.startsWith(word)) return true // Also match if the query token starts with the word
    const singular = singularizeToken(token)
    if (singular !== token && word.startsWith(singular)) return true
    if (singular !== token && singular.startsWith(word)) return true
    if (token.length >= 4 && word.includes(token)) return true
    if (singular.length >= 4 && word.includes(singular)) return true
    // For full words (4+ chars), also allow if word contains the token
    if (word.length >= 4 && token.includes(word)) return true
    return false
  }
  const requireFirstWord = options?.requireFirstWord ?? false
  if (requireFirstWord) {
    if (!queryTokens.some((token) => tokenMatches(token, nameTokens[0]))) return false
  }
  if (queryTokens.length === 1) return nameTokens.some((word) => tokenMatches(queryTokens[0], word))
  return queryTokens.every((token) => nameTokens.some((word) => tokenMatches(token, word)))
}

const itemMatchesSearchQuery = (item: NormalizedFoodItem, searchQuery: string, kind: 'packaged' | 'single') => {
  if (kind === 'single') return nameMatchesSearchQuery(item?.name || '', searchQuery, { requireFirstWord: false })
  const combined = [item?.brand, item?.name].filter(Boolean).join(' ')
  return nameMatchesSearchQuery(combined || item?.name || '', searchQuery, { requireFirstWord: false })
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

const buildInstantSuggestions = (searchQuery: string): NormalizedFoodItem[] => {
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
  suggestions.forEach(add)
  items.forEach(add)
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
  const hasToken = getSearchTokens(q).some((token) => token.length >= 2)
  const filtered = hasToken ? cached.items.filter((item) => itemMatchesSearchQuery(item, q, kind)) : cached.items
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
  slice: 30,
  serving: DEFAULT_SERVING_GRAMS,
}

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
) => {
  if (unit === 'piece') {
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
) => {
  if (!Number.isFinite(amount)) return amount
  if (from === to) return amount

  const weightUnits: BuilderUnit[] = [...ALL_UNITS]

  // Weight conversions
  if (weightUnits.includes(from) && weightUnits.includes(to)) {
    const fromGrams = resolveUnitGrams(from, baseAmount, baseUnit, pieceGrams)
    const toGrams = resolveUnitGrams(to, baseAmount, baseUnit, pieceGrams)
    if (!Number.isFinite(fromGrams) || !Number.isFinite(toGrams) || toGrams <= 0) return amount
    const grams = amount * fromGrams
    return grams / toGrams
  }
  return amount
}

const allowedUnitsForItem = (item?: BuilderItem) => {
  const units = [...DISPLAY_UNITS]
  const pieceGrams = item?.__pieceGrams
  if (!pieceGrams || pieceGrams <= 0) return units.filter((u) => u !== 'piece')
  return units
}

const formatUnitLabel = (unit: BuilderUnit, item?: BuilderItem) => {
  if (unit === 'g') return 'g'
  if (unit === 'tsp') return 'tsp — 5g'
  if (unit === 'tbsp') return 'tbsp — 14g'
  if (unit === 'quarter-cup') return '1/4 cup — 54.5g'
  if (unit === 'half-cup') return '1/2 cup — 109g'
  if (unit === 'three-quarter-cup') return '3/4 cup — 163.5g'
  if (unit === 'cup') return 'cup — 218g'
  if (unit === 'oz') return 'oz — 28g'
  if (unit === 'ml') return 'ml'
  if (unit === 'pinch') return 'pinch — 0.3g'
  if (unit === 'piece') {
    const grams = item?.__pieceGrams
    if (grams && grams > 0) return `piece — ${Math.round(grams * 10) / 10}g`
    return 'piece'
  }
  return unit
}

const macroOrZero = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

const computeServingsFromAmount = (item: BuilderItem) => {
  const baseAmount = item.__baseAmount
  const baseUnit = item.__baseUnit
  const unit = item.__unit || baseUnit
  const amount = Number(item.__amount)
  const pieceGrams = item.__pieceGrams
  if (baseAmount && baseUnit && unit && Number.isFinite(amount)) {
    const inBase = convertAmount(amount, unit, baseUnit, baseAmount, baseUnit, pieceGrams)
    const servings = baseAmount > 0 ? inBase / baseAmount : 0
    return round3(Math.max(0, servings))
  }
  const fallback = Number.isFinite(Number(item.servings)) ? Number(item.servings) : Number(amount)
  return round3(Math.max(0, fallback || 0))
}

const computeItemTotals = (item: BuilderItem) => {
  const servings = computeServingsFromAmount(item)
  return {
    calories: macroOrZero(item.calories) * servings,
    protein: macroOrZero(item.protein_g) * servings,
    carbs: macroOrZero(item.carbs_g) * servings,
    fat: macroOrZero(item.fat_g) * servings,
    fiber: macroOrZero(item.fiber_g) * servings,
    sugar: macroOrZero(item.sugar_g) * servings,
  }
}

const unitToGrams = (amount: number, unit: BuilderUnit, pieceGrams?: number | null): number | null => {
  if (!Number.isFinite(amount)) return null
  if (unit === 'piece' && pieceGrams && pieceGrams > 0) return amount * pieceGrams
  if (unit in UNIT_GRAMS) return amount * UNIT_GRAMS[unit]
  return null
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
    if (baseAmount && baseUnit) {
      const perServing = unitToGrams(baseAmount, baseUnit, pieceGrams)
      if (perServing && Number.isFinite(perServing)) {
        total += perServing * servings
        continue
      }
    }
    const unit = (it?.__unit || it?.__baseUnit) as BuilderUnit | null
    if (!unit) continue
    const grams = unitToGrams(Number(it.__amount || 0), unit, pieceGrams)
    if (grams && Number.isFinite(grams)) total += grams
  }
  return total
}

const computePortionScale = (amountRaw: any, unit: 'g' | 'oz', totalRecipeWeightG: number | null | undefined) => {
  const amount = parseNumericInput(amountRaw)
  if (!amount || amount <= 0) return 1
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
    calories: totals.calories * scale,
    protein: totals.protein * scale,
    carbs: totals.carbs * scale,
    fat: totals.fat * scale,
    fiber: totals.fiber * scale,
    sugar: totals.sugar * scale,
  }
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

  const initialDate = searchParams.get('date') || buildTodayIso()
  const initialCategory = normalizeCategory(searchParams.get('category'))
  const editFavoriteId = (searchParams.get('editFavoriteId') || '').trim()
  const sourceLogId = (searchParams.get('sourceLogId') || '').trim()

  const [selectedDate] = useState<string>(initialDate)
  const [category] = useState<MealCategory>(initialCategory)

  const [mealName, setMealName] = useState('')
  const mealNameBackupRef = useRef<string>('')
  const mealNameEditedRef = useRef(false)
  const mealNameWasClearedOnFocusRef = useRef(false)

  const [energyUnit, setEnergyUnit] = useState<'kcal' | 'kJ'>('kcal')
  const [query, setQuery] = useState('')
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
  const [lastRemoved, setLastRemoved] = useState<{ item: BuilderItem; index: number } | null>(null)
  const undoRemoveTimeoutRef = useRef<any>(null)
  const [portionAmountInput, setPortionAmountInput] = useState('')
  const [portionUnit, setPortionUnit] = useState<'g' | 'oz'>('g')
  const searchDebounceRef = useRef<number | null>(null)
  const brandSearchDebounceRef = useRef<number | null>(null)
  const [brandSuggestions, setBrandSuggestions] = useState<NormalizedFoodItem[]>([])
  const brandSuggestionsRef = useRef<NormalizedFoodItem[]>([])
  const searchCacheRef = useRef<Map<string, { items: NormalizedFoodItem[]; at: number }>>(new Map())
  const servingOptionsCacheRef = useRef<Map<string, ServingOption[]>>(new Map())
  const servingOptionsPendingRef = useRef<Set<string>>(new Set())

  const seqRef = useRef(0)
  const brandSeqRef = useRef(0)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const queryInputRef = useRef<HTMLInputElement | null>(null)
  const portionInputRef = useRef<HTMLInputElement | null>(null)
  const searchPressRef = useRef(0)

  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [barcodeError, setBarcodeError] = useState<string | null>(null)
  const [barcodeStatusHint, setBarcodeStatusHint] = useState<string>('Ready')
  const [manualBarcode, setManualBarcode] = useState('')
  const manualBarcodeBackupRef = useRef<string>('')
  const manualBarcodeEditedRef = useRef(false)
  const manualBarcodeWasClearedOnFocusRef = useRef(false)
  const barcodeScannerRef = useRef<any>(null)

  const [showFavoritesPicker, setShowFavoritesPicker] = useState(false)
  const [favoritesSearch, setFavoritesSearch] = useState('')
  const [favoritesActiveTab, setFavoritesActiveTab] = useState<'all' | 'favorites' | 'custom'>('all')
  const [favoritesToast, setFavoritesToast] = useState<string | null>(null)

  const busy = searchLoading || savingMeal || photoLoading || barcodeLoading
  const showPortionSaveCta = portionAmountInput.trim().length > 0

  const applySavedPortion = (source: any) => {
    if (!source || typeof source !== 'object') return
    const amountRaw = (source as any).__portionAmount
    const unitRaw = (source as any).__portionUnit
    const weightRaw = (source as any).__portionWeightG
    const unit = unitRaw === 'oz' ? 'oz' : 'g'
    if (amountRaw !== null && amountRaw !== undefined && Number.isFinite(Number(amountRaw))) {
      setPortionUnit(unit)
      setPortionAmountInput(String(amountRaw))
      return
    }
    if (weightRaw !== null && weightRaw !== undefined && Number.isFinite(Number(weightRaw))) {
      const grams = Number(weightRaw)
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

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    brandSuggestionsRef.current = brandSuggestions
  }, [brandSuggestions])

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
      if (!liquidItem && baseAmount && baseUnit && (baseUnit === 'tsp' || baseUnit === 'tbsp' || baseUnit === 'cup')) {
        const converted = convertAmount(baseAmount, baseUnit, 'g')
        baseAmount = Number.isFinite(converted) ? converted : baseAmount
        baseUnit = 'g'
      }
      const normalized = normalizeLegacyBaseUnit(baseAmount, baseUnit)
      baseAmount = normalized.amount
      baseUnit = normalized.unit
      const id = `edit:${Date.now()}:${Math.random().toString(16).slice(2)}`
      const resolvedServings = Number.isFinite(servings) && servings > 0 ? servings : 1
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
        __amount: baseAmount && baseUnit ? round3(baseAmount * resolvedServings) : round3(resolvedServings),
        __amountInput: String(baseAmount && baseUnit ? round3(baseAmount * resolvedServings) : round3(resolvedServings)),
        __unit: baseUnit,
        __pieceGrams: pieceGrams,
        __source: typeof raw?.source === 'string' ? raw.source : null,
        __sourceId: raw?.id ? String(raw.id) : null,
        __servingOptions: Array.isArray(raw?.servingOptions)
          ? normalizeServingOptionsForItem(raw.servingOptions, name)
          : null,
        __selectedServingId: raw?.selectedServingId ?? null,
      })
    }
    return next
  }

  useEffect(() => {
    // Editing mode: load a favorite meal into the builder for edits.
    if (!editFavoriteId) {
      editFavoriteSourceItemsRef.current = null
      editFavoriteIsCustomRef.current = false
      return
    }
    if (loadedFavoriteId === editFavoriteId) return
    const favorites = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const fav = favorites.find((f: any) => String(f?.id || '') === editFavoriteId) || null
    if (!fav) return

    const label = normalizeMealLabel(fav?.label || fav?.description || '').trim()
    if (label) setMealName(label)
    applySavedPortion((fav as any)?.nutrition || (fav as any)?.total || null)

    const favItems = parseFavoriteItems(fav)
    editFavoriteSourceItemsRef.current = favItems ? JSON.parse(JSON.stringify(favItems)) : null
    editFavoriteIsCustomRef.current = isCustomMealFavorite(fav)
    if (favItems && favItems.length > 0) {
      const converted = convertToBuilderItems(favItems)
      setItems(converted)
      setExpandedId(null)
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
    }

    setLoadedFavoriteId(editFavoriteId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editFavoriteId, loadedFavoriteId, userData?.favorites])

  useEffect(() => {
    // Editing mode (diary): load a FoodLog row directly when a Build-a-meal diary entry is edited.
    if (!sourceLogId) return
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

        const label = normalizeMealLabel(log?.description || log?.name || '').trim()
        if (!cancelled && label) setMealName(label)
        if (!cancelled) applySavedPortion((log as any)?.nutrients || null)

        const rawItems = Array.isArray(log?.items) ? log.items : null
        if (!cancelled && rawItems && rawItems.length > 0) {
          const converted = convertToBuilderItems(rawItems)
          setItems(converted)
          setExpandedId(null)
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
  }, [sourceLogId, editFavoriteId, loadedFavoriteId])

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

  // Guard rail: portionScale must allow values above 1 to scale larger-than-recipe servings.
  // See GUARD_RAILS.md section "Build a Meal portion scaling".
  const portionScale = useMemo(
    () => computePortionScale(portionAmountInput, portionUnit, totalRecipeWeightG),
    [portionAmountInput, portionUnit, totalRecipeWeightG],
  )

  const mealTotals = useMemo(
    () => applyPortionScaleToTotals(baseMealTotals, portionScale),
    [baseMealTotals, portionScale],
  )

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
    options?: { kindOverride?: 'packaged' | 'single'; sourceOverride?: string; localOnly?: boolean },
  ) => {
    const q = String(searchQuery || '').trim()
    if (!q) return []
    const kindToUse = options?.kindOverride || kind
    const sourceParam = options?.sourceOverride || 'auto'
    const params = new URLSearchParams({
      source: sourceParam,
      q: q,
      kind: kindToUse,
      limit: '20',
    })
    if (options?.localOnly) params.set('localOnly', '1')
    const res = await fetch(`/api/food-data?${params.toString()}`, { method: 'GET' })
    if (!res.ok) return []
    const data = await res.json().catch(() => ({} as any))
    return Array.isArray(data?.items) ? data.items : []
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

  const pickBestMacroMatch = (items: NormalizedFoodItem[], lookup: string) => {
    const filtered = items.filter((candidate) => hasMacroData(candidate))
    if (filtered.length === 0) return null
    return (
      filtered.find((candidate) => nameMatchesSearchQuery(candidate?.name || '', lookup, { requireFirstWord: false })) ||
      filtered[0]
    )
  }

  const resolveItemWithMacros = async (lookup: string) => {
    const usdaItems = await fetchSearchItems(lookup, { kindOverride: 'single', sourceOverride: 'usda', localOnly: true })
    const usdaMatch = pickBestMacroMatch(usdaItems as NormalizedFoodItem[], lookup)
    if (usdaMatch) return usdaMatch

    const fallbackItems = await fetchSearchItems(lookup, { kindOverride: 'packaged', sourceOverride: 'auto' })
    const fallbackMatch = pickBestMacroMatch(fallbackItems as NormalizedFoodItem[], lookup)
    if (fallbackMatch) return fallbackMatch

    return null
  }

  const fetchBrandSuggestions = async (searchQuery: string) => {
    const prefix = getBrandMatchTokens(searchQuery)[0] || ''
    if (prefix.length < 2) return []
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

  const runSearch = async (searchQuery?: string) => {
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
      if (kind === 'packaged') {
        const quickQuery = getQuickPackagedQuery(q)
        if (quickQuery.length >= 2) {
          const quickItems = await fetchSearchItems(quickQuery, { kindOverride: 'packaged', sourceOverride: 'usda', localOnly: true })
          if (seqRef.current === seq && quickItems.length > 0) {
            const hasToken = getSearchTokens(q).some((token) => token.length >= 2)
            const quickFiltered = hasToken ? quickItems.filter((item: NormalizedFoodItem) => itemMatchesSearchQuery(item, q, kind)) : quickItems
            const quickMerged = allowBrandSuggestions ? mergeBrandSuggestions(quickFiltered, brandSuggestionsRef.current) : quickFiltered
            if (seqRef.current === seq) {
              setResults(quickMerged)
              if (quickMerged.length > 0) searchCacheRef.current.set(cacheKey, { items: quickMerged, at: Date.now() })
            }
          }
        }
      }

      let nextItems = await fetchSearchItems(q)
      if (seqRef.current !== seq) return
      const rawItems = nextItems
      const hasToken = getSearchTokens(q).some((token) => token.length >= 2)
      let filteredItems = hasToken ? nextItems.filter((item: NormalizedFoodItem) => itemMatchesSearchQuery(item, q, kind)) : nextItems
      if (kind === 'single' && filteredItems.length === 0 && rawItems.length > 0) {
        filteredItems = rawItems
      }
      if (filteredItems.length === 0 && kind === 'single') {
        try {
          const lastWord = getLastSearchToken(q)
          if (lastWord && lastWord !== q && lastWord.length >= 2) {
            const fallbackItems = await fetchSearchItems(lastWord)
            if (seqRef.current === seq) {
              const fallbackFiltered =
                hasToken && fallbackItems.length > 0
                  ? fallbackItems.filter((item: NormalizedFoodItem) => nameMatchesSearchQuery(item.name || '', lastWord))
                  : fallbackItems
              filteredItems = fallbackFiltered.length > 0 ? fallbackFiltered : fallbackItems
            }
          }
        } catch {}
      }
      const merged =
        kind === 'single'
          ? mergeSearchSuggestions(filteredItems, q)
          : allowBrandSuggestions
          ? mergeBrandSuggestions(filteredItems, brandSuggestionsRef.current)
          : filteredItems
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

  useEffect(() => {
    const q = String(query || '').trim()
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
    }
    if (q.length < 2) {
      seqRef.current += 1
      setResults([])
      setSearchLoading(false)
      if (q.length === 0) setError(null)
      return
    }
    if (kind === 'single') {
      const instant = buildInstantSuggestions(q)
      if (instant.length > 0) setResults(instant)
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
      runSearch(q)
    }, 200)
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
    if (q.length < 2) {
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
    if (item.__source !== 'usda' && item.__source !== 'fatsecret') return null
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
    if (!liquidItem && baseAmount && baseUnit && (baseUnit === 'tsp' || baseUnit === 'tbsp' || baseUnit === 'cup')) {
      const converted = convertAmount(baseAmount, baseUnit, 'g')
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
      addItemDirect(resolved)
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
      if (!liquidItem && baseAmount && baseUnit && (baseUnit === 'tsp' || baseUnit === 'tbsp' || baseUnit === 'cup')) {
        const converted = convertAmount(baseAmount, baseUnit, 'g')
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
    return normalizeMealLabel(raw)
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

  const isCustomMealFavorite = (fav: any) => {
    if (!fav) return false
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

  const stopBarcodeScanner = () => {
    try {
      const current = barcodeScannerRef.current
      if (current?.controls?.stop) current.controls.stop()
      if (current?.reader?.reset) current.reader.reset()
    } catch {}
    barcodeScannerRef.current = null
  }

  const lookupBarcode = async (codeRaw: string) => {
    const code = String(codeRaw || '').trim().replace(/[^0-9A-Za-z]/g, '')
    if (!code) {
      setBarcodeError('Please enter a barcode.')
      return
    }
    setBarcodeError(null)
    setBarcodeLoading(true)
    setBarcodeStatusHint('Looking up barcode…')
    try {
      const res = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(code)}`, { method: 'GET' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 402) {
          setBarcodeError('Not enough credits for barcode scanning.')
        } else if (res.status === 422) {
          setBarcodeError(
            data?.message ||
              data?.error ||
              'Nutrition data is missing for this barcode. Please scan the nutrition label instead.',
          )
        } else if (res.status === 404) {
          setBarcodeError('No product found for that barcode. Try photo or search.')
        } else if (res.status === 401) {
          setBarcodeError('Please sign in again, then retry.')
        } else {
          setBarcodeError('Barcode lookup failed. Please try again.')
        }
        return
      }
      if (!data?.found || !data?.food) {
        setBarcodeError('No product found for that barcode. Try photo or search.')
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
      addItemDirect(normalized)
      setBarcodeStatusHint('Added')
      setShowBarcodeScanner(false)
    } catch {
      setBarcodeError('Barcode lookup failed. Please try again.')
    } finally {
      setBarcodeLoading(false)
    }
  }

  const startBarcodeScanner = async () => {
    setBarcodeError(null)
    setBarcodeStatusHint('Starting camera…')
    try {
      stopBarcodeScanner()
      const region = document.getElementById('meal-builder-barcode-region')
      if (!region) {
        setBarcodeError('Camera area missing. Close and reopen the scanner.')
        setBarcodeStatusHint('Camera error')
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
        if (!text) return
        // Stop quickly so we don't double-trigger.
        stopBarcodeScanner()
        lookupBarcode(text)
      })

      barcodeScannerRef.current = { reader, controls, videoEl }
      setBarcodeStatusHint('Scanning…')
    } catch {
      setBarcodeError('Could not start the camera. Please allow camera access and retry.')
      setBarcodeStatusHint('Camera error')
      stopBarcodeScanner()
    }
  }

  useEffect(() => {
    if (!showBarcodeScanner) {
      stopBarcodeScanner()
      setBarcodeError(null)
      setBarcodeStatusHint('Ready')
      return
    }
    startBarcodeScanner()
    return () => stopBarcodeScanner()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBarcodeScanner])

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
        let servings = it.servings

        if (baseAmount && baseUnit && unit) {
          const inBase = convertAmount(amount, unit, baseUnit, baseAmount, baseUnit, pieceGrams)
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
        if (!baseAmount || !baseUnit) {
          return { ...it, __unit: unit, __amount: amount, __amountInput: amountInput }
        }
        const inBase = convertAmount(amount, unit, baseUnit, baseAmount, baseUnit, pieceGrams)
        const servings = baseAmount > 0 ? inBase / baseAmount : 0
        return { ...it, __unit: unit, __amount: amount, __amountInput: amountInput, servings: round3(Math.max(0, servings)) }
      }),
    )
  }

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
    const favoriteLinkId = (() => {
      if (editFavoriteId) return editFavoriteId
      if (linkedFavoriteId && linkedFavoriteId.trim().length > 0) return linkedFavoriteId.trim()
      if (existingWithSameTitle?.id) return String(existingWithSameTitle.id)
      return `fav-${Date.now()}`
    })()

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
    const portionScaleForSave = computePortionScale(portionAmountForSave, portionUnit, totalRecipeWeightForSave)

    const shouldStripBuilderIds = Boolean(editFavoriteId) && !editFavoriteIsCustomRef.current
    const sourceItemsForMerge = shouldStripBuilderIds ? editFavoriteSourceItemsRef.current : null
    const cleanedItems = itemsForSave.map((it, index) => {
      const {
        __baseAmount,
        __baseUnit,
        __amount,
        __amountInput,
        __unit,
        __pieceGrams,
        __servingOptions,
        __selectedServingId,
        __source,
        __sourceId,
        ...rest
      } = it
      const next: any = { ...rest, servings: computeServingsFromAmount(it) }
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
    const portionWeightForSave = (() => {
      const raw = parseNumericInput(portionAmountForSave)
      if (!raw || raw <= 0) return null
      const grams = unitToGrams(raw, portionUnit === 'oz' ? 'oz' : 'g')
      return grams && Number.isFinite(grams) ? grams : null
    })()
    const portionMeta =
      portionWeightForSave
        ? {
            __portionScale: round3(portionScaleForSave),
            __portionWeightG: Math.round(portionWeightForSave),
            __portionUnit: portionUnit,
            __portionAmount: parseNumericInput(portionAmountForSave),
            __portionTotalWeightG: Math.round(totalRecipeWeightForSave || 0),
          }
        : null

    const createdAtIso = alignTimestampToLocalDate(new Date().toISOString(), selectedDate)

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
        ...(favoriteLinkId ? { __favoriteId: favoriteLinkId } : {}),
        ...(portionMeta ? portionMeta : {}),
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
          try {
            await fetch('/api/food-log', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: sourceLogId,
                description,
                nutrition: payload.nutrition,
                items: cleanedItems,
                meal: category,
                category,
              }),
            })
          } catch {}
          try {
            sessionStorage.setItem(
              'foodDiary:entryOverride',
              JSON.stringify({
                dbId: sourceLogId,
                localDate: selectedDate,
                category,
                nutrition: payload.nutrition,
                total: payload.nutrition,
                items: cleanedItems,
              }),
            )
          } catch {}

        // Keep the linked saved meal in sync (if one exists, or create one for future use).
        try {
          if (favoriteLinkId) {
            const favoritePayload = {
              id: favoriteLinkId,
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
            }
            const existingIndex = favorites.findIndex((f: any) => String(f?.id || '') === favoriteLinkId)
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
        const updatedFavorite = {
          ...existing,
          label: title,
          description,
          nutrition: normalizedNutrition,
          total: normalizedNutrition,
          items: cleanedItems,
          method: existing?.method || (existing?.customMeal ? 'meal-builder' : 'text'),
          meal: existing?.meal || category,
          createdAt: existing?.createdAt || Date.now(),
        }
        const nextFavorites = prev.map((f: any) => (String(f?.id || '') === editFavoriteId ? updatedFavorite : f))
        persistFavorites(nextFavorites)

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

        router.push('/food')
        return
      }

      const res = await fetch('/api/food-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        setError('Saving failed. Please try again.')
        return
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
              nutrition: payload.nutrition,
              total: payload.nutrition,
              items: cleanedItems,
            }),
          )
        }
      } catch {}

      // Auto-save newly created meals into Favorites so they appear under Favorites → Custom.
      try {
        const createdId = typeof data?.id === 'string' ? data.id : null
        const favoritePayload = {
          id: favoriteLinkId,
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

      router.push('/food')
    } catch {
      setError('Saving failed. Please try again.')
    } finally {
      setFavoriteSaving(false)
      setSavingMeal(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
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
            <div className="fixed inset-0 z-50 bg-white flex flex-col">
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
                    data = sortList(favoriteMeals.filter((m: any) => !isCustomMealFavorite(m?.favorite)).filter(filterBySearch))
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
            <div className="fixed inset-0 z-50 bg-black">
              <div className="absolute inset-0 flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 bg-black/70 text-white">
                  <div className="text-sm font-semibold">Scan barcode</div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBarcodeScanner(false)
                      stopBarcodeScanner()
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/10"
                  >
                    Close
                  </button>
                </div>

                <div className="flex-1 relative">
                  <div id="meal-builder-barcode-region" className="absolute inset-0" />
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-64 h-40 border-2 border-white/70 rounded-xl" />
                  </div>
                </div>

                <div className="bg-black/85 text-white px-4 py-3 space-y-2">
                  <div className="text-xs text-white/80">{barcodeStatusHint}</div>
                  {barcodeError && <div className="text-xs text-red-300">{barcodeError}</div>}

                  <div className="flex gap-2">
                    <input
                      value={manualBarcode}
                      onFocus={() => {
                        manualBarcodeBackupRef.current = manualBarcode
                        manualBarcodeEditedRef.current = false
                        manualBarcodeWasClearedOnFocusRef.current = manualBarcode.trim().length > 0
                        if (manualBarcodeWasClearedOnFocusRef.current) setManualBarcode('')
                      }}
                      onChange={(e) => {
                        manualBarcodeEditedRef.current = true
                        setManualBarcode(e.target.value)
                      }}
                      onBlur={() => {
                        if (manualBarcodeWasClearedOnFocusRef.current && !manualBarcodeEditedRef.current) {
                          setManualBarcode(manualBarcodeBackupRef.current)
                        }
                        manualBarcodeWasClearedOnFocusRef.current = false
                        manualBarcodeEditedRef.current = false
                      }}
                      placeholder="Enter barcode"
                      className="flex-1 px-3 py-2 rounded-lg bg-white text-gray-900 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => lookupBarcode(manualBarcode)}
                      disabled={barcodeLoading}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
                    >
                      Lookup
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startBarcodeScanner()}
                      className="flex-1 px-3 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold"
                    >
                      Restart camera
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowBarcodeScanner(false)
                        stopBarcodeScanner()
                      }}
                      className="flex-1 px-3 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
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
              onChange={(e) => {
                setQuery(e.target.value)
                setError(null)
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind('packaged')}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold ${
                kind === 'packaged' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-200'
              }`}
            >
              Packaged
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
            <div className="text-xs font-semibold text-gray-700">Portion size</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                ref={portionInputRef}
                type="number"
                inputMode="decimal"
                min={0}
                value={portionAmountInput}
                onFocus={() => setPortionAmountInput('')}
                onChange={(e) => setPortionAmountInput(e.target.value)}
                placeholder="e.g., 300"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <select
                value={portionUnit}
                onChange={(e) => setPortionUnit(e.target.value as 'g' | 'oz')}
                className="w-20 px-2 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="g">g</option>
                <option value="oz">oz</option>
              </select>
            </div>
            {totalRecipeWeightG > 0 ? (
              <div className="mt-2 text-[11px] text-gray-600">
                Full recipe ≈ {Math.round(totalRecipeWeightG)} g
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-gray-600">
                Add weights to ingredients to use portions.
              </div>
            )}
            {portionScale < 1 && (
              <div className="mt-1 text-[11px] text-emerald-700">
                Saving about {Math.round(portionScale * 100)}% of the recipe.
              </div>
            )}
            {showPortionSaveCta && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2">
                <div className="text-[11px] text-gray-600">Ready to save this portion.</div>
                <button
                  type="button"
                  onClick={createMeal}
                  disabled={busy || favoriteSaving}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-60"
                >
                  Save meal
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
            <div className="text-sm font-semibold text-gray-900">Your ingredients</div>
            <div className="text-xs text-gray-500">{items.length} item{items.length === 1 ? '' : 's'}</div>
          </div>

          {items.length === 0 ? (
            <div className="text-sm text-gray-500">Add ingredients using the search above.</div>
          ) : (
            <div className="space-y-2">
              {items.map((it) => {
                const expanded = expandedId === it.id
                const baseUnits = allowedUnitsForItem(it)
                const totals = computeItemTotals(it)
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
                          {it.name}
                          {it.brand ? ` – ${it.brand}` : ''}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">
                          {it.serving_size ? `Serving: ${it.serving_size}` : 'Serving: (unknown)'} •{' '}
                          {it.__baseUnit ? `Amount: ${it.__amount} ${it.__unit || it.__baseUnit}` : `Servings: ${it.servings}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
                      </div>
                    </button>

                    {expanded && (
                      <div className="px-3 pb-3 bg-white space-y-3">
                        {Array.isArray(it.__servingOptions) && it.__servingOptions.length > 0 && (
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
                              type="text"
                              inputMode="decimal"
                              value={it.__amountInput}
                              onChange={(e) => setAmount(it.id, e.target.value)}
                              onFocus={() => setAmount(it.id, '')}
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
                            <span className="font-semibold text-gray-900">{formatEnergyValue(totals.calories, energyUnit)}</span> {energyUnit}
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(totals.protein)}</span> g protein
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(totals.carbs)}</span> g carbs
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(totals.fat)}</span> g fat
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(totals.fiber)}</span> g fibre
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(totals.sugar)}</span> g sugar
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
            <div className="text-sm font-semibold text-gray-900">Meal totals</div>
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

        <button
          type="button"
          onClick={createMeal}
          disabled={busy}
          className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-2xl"
        >
          {savingMeal ? 'Saving…' : editFavoriteId || sourceLogId ? 'Update' : 'Save meal'}
        </button>

        <div className="pb-10" />
        </div>
      </div>
    </div>
  )
}
