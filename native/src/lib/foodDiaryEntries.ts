/** The normal Food Diary's pure read normalization, extracted without changing
 * function bodies. Native controls and server assistant share this exact code. */
import { materializeMealPortion } from './mealPortions'
import { readOptionalNutrient, scaleOptionalNutrient, sumOptionalNutrients, roundOptionalNutrient } from './nutrientValues'

type Nutrients = {
  calories?: number | null
  calories_kcal?: number | null
  protein?: number | null
  protein_g?: number | null
  carbs?: number | null
  carbs_g?: number | null
  fat?: number | null
  fat_g?: number | null
  fiber?: number | null
  fiber_g?: number | null
  sugar?: number | null
  sugar_g?: number | null
  saturatedFat?: number | null
  saturated_fat_g?: number | null
}

type FoodEntry = {
  id: string
  name: string
  label?: string | null
  meal: string | null
  category?: string | null
  description?: string | null
  localDate?: string | null
  nutrients?: Nutrients | null
  items?: any[] | null
  createdAt: string
  raw?: any
}

type EntryTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number | null
  sugar: number | null
  satFat: number
}

export function roundTo(value: number, decimals = 1) {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

export function nullableNumber(value: any) {
  if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function sanitizeEntryTotals(raw: any): EntryTotals | null {
  if (!raw || typeof raw !== 'object') return null
  const pick = (...values: any[]) => {
    for (const value of values) {
      const n = nullableNumber(value)
      if (n != null && Number.isFinite(n)) return n
    }
    return null
  }

  const calories = pick(raw?.calories, raw?.calories_kcal, raw?.kcal, raw?.energy, raw?.cal)
  const protein = pick(raw?.protein, raw?.protein_g)
  const carbs = pick(raw?.carbs, raw?.carbs_g)
  const fat = pick(raw?.fat, raw?.fat_g)
  const fiber = readOptionalNutrient(raw, ['fiber', 'fiber_g'])
  const sugar = readOptionalNutrient(raw, ['sugar', 'sugar_g'])
  const satFat = pick(raw?.saturatedFat, raw?.saturated_fat_g, raw?.satFat)

  const hasValue = [calories, protein, carbs, fat, fiber, sugar, satFat].some((v) => v != null)
  if (!hasValue) return null

  const safe = (value: number | null, decimals = 1) => {
    if (value == null || !Number.isFinite(value)) return 0
    return Math.max(0, roundTo(value, decimals))
  }

  return {
    calories: Math.max(0, Math.round(calories || 0)),
    protein: safe(protein),
    carbs: safe(carbs),
    fat: safe(fat),
    fiber: roundOptionalNutrient(fiber),
    sugar: roundOptionalNutrient(sugar),
    satFat: safe(satFat),
  }
}

export function hasNonZeroEntryTotals(totals: EntryTotals | null | undefined) {
  if (!totals) return false
  return Object.values(totals).some((value) => Number.isFinite(Number(value)) && Number(value) > 0)
}

export function extractTotalsFromDescriptionText(value: any): EntryTotals | null {
  const text = String(value || '').trim()
  if (!text) return null
  const matchNumber = (regex: RegExp) => {
    const match = text.match(regex)
    if (!match) return null
    const parsed = parseFloat(match[1])
    return Number.isFinite(parsed) ? parsed : null
  }

  const calories =
    matchNumber(/calories?[:\s]*([0-9]+(?:\.[0-9]+)?)/i) ??
    matchNumber(/([0-9]+(?:\.[0-9]+)?)\s*kcal/i)
  const protein = matchNumber(/protein[:\s]*([0-9]+(?:\.[0-9]+)?)\s*g/i)
  const carbs = matchNumber(/carb(?:ohydrate)?s?[:\s]*([0-9]+(?:\.[0-9]+)?)\s*g/i)
  const fat = matchNumber(/fat[:\s]*([0-9]+(?:\.[0-9]+)?)\s*g/i)
  const fiber = matchNumber(/fib(?:er|re)[:\s]*([0-9]+(?:\.[0-9]+)?)\s*g/i)
  const sugar = matchNumber(/sugar[:\s]*([0-9]+(?:\.[0-9]+)?)\s*g/i)

  const hasValue = [calories, protein, carbs, fat, fiber, sugar].some((v) => v != null)
  if (!hasValue) return null

  return {
    calories: Math.max(0, Math.round(calories || 0)),
    protein: Math.max(0, roundTo(protein || 0)),
    carbs: Math.max(0, roundTo(carbs || 0)),
    fat: Math.max(0, roundTo(fat || 0)),
    fiber: roundOptionalNutrient(fiber),
    sugar: roundOptionalNutrient(sugar),
    satFat: 0,
  }
}

export function recalculateTotalsFromItems(items: any[] | null | undefined): EntryTotals | null {
  if (!Array.isArray(items) || items.length === 0) return null

  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0 as number | null,
    sugar: 0 as number | null,
    satFat: 0,
  }

  for (const item of items) {
    const servingsRaw = Number(item?.servings)
    const servings = Number.isFinite(servingsRaw) && servingsRaw > 0 ? servingsRaw : 1
    const multRaw = Number(item?.macroMultiplier ?? item?.multiplier)
    const multiplier = Number.isFinite(multRaw) && multRaw > 0 ? multRaw : 1
    const factor = servings * multiplier

    const protein = Math.max(0, Number(item?.protein_g ?? item?.protein) || 0)
    const carbs = Math.max(0, Number(item?.carbs_g ?? item?.carbs) || 0)
    const fat = Math.max(0, Number(item?.fat_g ?? item?.fat) || 0)
    const fiber = readOptionalNutrient(item, ['fiber_g', 'fiber'])
    const sugar = readOptionalNutrient(item, ['sugar_g', 'sugar'])
    const satFat = Math.max(0, Number(item?.saturated_fat_g ?? item?.saturatedFat) || 0)

    const macroCalories = protein * 4 + carbs * 4 + fat * 9
    const rawCalories = nullableNumber(item?.calories ?? item?.calories_kcal)
    const calories = rawCalories != null && rawCalories >= 0 ? rawCalories : macroCalories

    totals.calories += calories * factor
    totals.protein += protein * factor
    totals.carbs += carbs * factor
    totals.fat += fat * factor
    totals.fiber = sumOptionalNutrients(totals.fiber, scaleOptionalNutrient(fiber, factor))
    totals.sugar = sumOptionalNutrients(totals.sugar, scaleOptionalNutrient(sugar, factor))
    totals.satFat += satFat * factor
  }

  return {
    calories: Math.max(0, Math.round(totals.calories)),
    protein: Math.max(0, roundTo(totals.protein)),
    carbs: Math.max(0, roundTo(totals.carbs)),
    fat: Math.max(0, roundTo(totals.fat)),
    fiber: roundOptionalNutrient(totals.fiber),
    sugar: roundOptionalNutrient(totals.sugar),
    satFat: Math.max(0, roundTo(totals.satFat)),
  }
}

export function normalizeFoodApiEntry(raw: any): FoodEntry {
  const originalRaw = raw
  raw = materializeMealPortion(raw)
  const itemsTotals = recalculateTotalsFromItems(raw?.items)
  const storedTotals = sanitizeEntryTotals(raw?.nutrients || raw?.nutrition || raw?.total)
  const parsedTotals = extractTotalsFromDescriptionText(raw?.description || raw?.name || '')

  let pickedTotals: EntryTotals | null = null
  if (hasNonZeroEntryTotals(itemsTotals)) pickedTotals = itemsTotals
  else if (storedTotals && hasNonZeroEntryTotals(storedTotals)) pickedTotals = storedTotals
  else pickedTotals = parsedTotals || storedTotals || itemsTotals

  const normalized = pickedTotals || {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: null,
    sugar: null,
    satFat: 0,
  }

  const macroCalories = normalized.protein * 4 + normalized.carbs * 4 + normalized.fat * 9
  const recordedCalories = Array.isArray(raw?.items) && raw.items.length
    ? raw.items.every((item: any) => nullableNumber(item?.calories ?? item?.calories_kcal) != null)
    : nullableNumber((raw?.nutrients || raw?.nutrition || raw?.total)?.calories ?? (raw?.nutrients || raw?.nutrition || raw?.total)?.calories_kcal) != null
  if (!recordedCalories && normalized.calories <= 0 && macroCalories > 0) {
    normalized.calories = Math.round(macroCalories)
  }

  const rawName = String(raw?.name || '').trim()
  const descName = String(raw?.description || '')
    .split('\n')[0]
    .split(',')[0]
    .trim()
  const cleanName =
    rawName && rawName.toLowerCase() !== 'food item'
      ? rawName
      : descName || rawName || 'Food item'

  return {
    id: String(raw?.id || `food-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    name: cleanName,
    meal: String(raw?.meal || raw?.category || 'uncategorized').toLowerCase(),
    category: raw?.category ? String(raw.category) : null,
    description: raw?.description ? String(raw.description) : null,
    localDate: raw?.localDate ? String(raw.localDate) : null,
    nutrients: {
      calories: normalized.calories,
      protein: normalized.protein,
      carbs: normalized.carbs,
      fat: normalized.fat,
      fiber: normalized.fiber,
      sugar: normalized.sugar,
      saturatedFat: normalized.satFat,
    },
    items: Array.isArray(raw?.items) ? raw.items : null,
    createdAt: String(raw?.createdAt || new Date().toISOString()),
    raw: originalRaw,
  }
}
