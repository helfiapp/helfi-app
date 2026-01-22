import 'server-only'
import { prisma } from '@/lib/prisma'

export interface NormalizedFoodItem {
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
}

export interface ServingOption {
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
  source: 'usda' | 'fatsecret'
}

const OPENFOODFACTS_BASE_URL =
  process.env.OPENFOODFACTS_BASE_URL || 'https://world.openfoodfacts.org'

const OPENFOODFACTS_USER_AGENT =
  process.env.OPENFOODFACTS_USER_AGENT || 'helfi-app/1.0 (support@helfi.ai)'

const USDA_API_KEY = process.env.USDA_API_KEY
// Default to provided credentials if env vars are not set (per user request for FatSecret packaged lookups)
const FATSECRET_CLIENT_ID =
  process.env.FATSECRET_CLIENT_ID || '5b035e5de0b041ffb0b8522abd75dd0b'
const FATSECRET_CLIENT_SECRET =
  process.env.FATSECRET_CLIENT_SECRET || 'd544f96d19494c9ca8a3dec1bcaf1da3'

type TimeoutFetchInit = RequestInit & { timeoutMs?: number }

function nowMs(): number {
  return Date.now()
}

async function fetchWithTimeout(url: string, init: TimeoutFetchInit = {}): Promise<Response> {
  const timeoutMs = typeof init.timeoutMs === 'number' && Number.isFinite(init.timeoutMs) ? init.timeoutMs : 3500
  const controller = new AbortController()
  const signal = init.signal

  const onAbort = () => {
    try {
      controller.abort()
    } catch {}
  }
  if (signal) {
    if (signal.aborted) {
      onAbort()
    } else {
      try {
        signal.addEventListener('abort', onAbort, { once: true })
      } catch {}
    }
  }

  const t = setTimeout(() => {
    try {
      controller.abort()
    } catch {}
  }, timeoutMs)

  try {
    const { timeoutMs: _timeoutMs, signal: _signal, ...rest } = init
    return await fetch(url, { ...rest, signal: controller.signal })
  } finally {
    clearTimeout(t)
    if (signal) {
      try {
        signal.removeEventListener('abort', onAbort)
      } catch {}
    }
  }
}

function parseNumber(value: any): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

export async function searchLocalFoods(
  query: string,
  opts: { pageSize?: number; sources?: string[]; mode?: 'prefix' | 'prefix-contains' } = {},
): Promise<NormalizedFoodItem[]> {
  const q = String(query || '').trim()
  if (!q) return []
  const pageSize = opts.pageSize ?? 10
  const sources = Array.isArray(opts.sources) && opts.sources.length > 0 ? opts.sources : null
  const mode = opts.mode || 'prefix-contains'

  try {
    const normalizePrefixToken = (value: string) =>
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
    const rawTokens = normalizePrefixToken(q)
      .split(' ')
      .filter(Boolean)
      .filter((token) => token.length >= 2)
    const toTitleCase = (value: string) => value.replace(/\b([a-z])/g, (match) => match.toUpperCase())
    const prefixTokens = rawTokens.length > 0 ? [...rawTokens].sort((a, b) => b.length - a.length).slice(0, 1) : [q]
    const tokenSet = new Set<string>()
    const addTokenVariants = (value: string) => {
      if (!value) return
      tokenSet.add(value)
      tokenSet.add(value.toUpperCase())
      tokenSet.add(toTitleCase(value))
    }
    for (const token of prefixTokens) {
      const singular = singularizeToken(token)
      addTokenVariants(token)
      if (singular && singular !== token) addTokenVariants(singular)
    }
    const sourceFilter = sources ? { source: { in: sources } } : null
    const prefixConditions = Array.from(tokenSet).flatMap((token) => [
      { name: { startsWith: token } },
      { brand: { startsWith: token } },
    ])
    const prefixFilter = prefixConditions.length > 0 ? { OR: prefixConditions } : null
    const allowContains = mode !== 'prefix' && q.length >= 4
    const containsFilter = allowContains
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { brand: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : null
    const buildWhere = (filter: any, excludeIds?: string[]) => {
      const clauses = []
      if (sourceFilter) clauses.push(sourceFilter)
      if (filter) clauses.push(filter)
      if (excludeIds && excludeIds.length > 0) clauses.push({ id: { notIn: excludeIds } })
      if (clauses.length === 0) return {}
      if (clauses.length === 1) return clauses[0]
      return { AND: clauses }
    }

    const prefixRows = await prisma.foodLibraryItem.findMany({
      where: buildWhere(prefixFilter),
      take: pageSize,
    })

    const remaining = Math.max(0, pageSize - prefixRows.length)
    const prefixIds = prefixRows.map((row) => row.id)
    const containsRows =
      remaining > 0 && mode !== 'prefix' && prefixRows.length === 0 && containsFilter
        ? await prisma.foodLibraryItem.findMany({
            where: buildWhere(containsFilter, prefixIds),
            take: remaining,
          })
        : []

    const rows = [...prefixRows, ...containsRows]
    return rows.map((row) => ({
      source: 'usda',
      id: String(row.fdcId ?? row.id),
      name: row.name,
      brand: row.brand ?? undefined,
      serving_size: row.servingSize || '100 g',
      calories: row.calories ?? null,
      protein_g: row.proteinG ?? null,
      carbs_g: row.carbsG ?? null,
      fat_g: row.fatG ?? null,
      fiber_g: row.fiberG ?? null,
      sugar_g: row.sugarG ?? null,
    }))
  } catch (err) {
    console.warn('Local food search failed', err)
    return []
  }
}

function normalizeOpenFoodFactsProduct(product: any): NormalizedFoodItem | null {
  if (!product) return null
  const nutr = product.nutriments || {}

  const name: string =
    (product.product_name as string) ||
    (product.generic_name as string) ||
    (product.brands as string) ||
    (product.code as string) ||
    ''
  if (!name) return null

  const brand = (product.brands as string) || undefined

  // Prefer explicit serving_size; fallback to 100g/100ml if not available
  const servingSizeLabel: string =
    (product.serving_size && String(product.serving_size).trim()) ||
    (nutr['serving_size'] && String(nutr['serving_size']).trim()) ||
    (nutr['serving_size_unit']
      ? `1 ${nutr['serving_size_unit']}`
      : nutr['serving_size'] || '')

  let calories: number | null = null
  let protein_g: number | null = null
  let carbs_g: number | null = null
  let fat_g: number | null = null
  let fiber_g: number | null = null
  let sugar_g: number | null = null

  // If per-serving values exist, use them; otherwise fall back to per 100g/ml
  const kcalServing = parseNumber(nutr['energy-kcal_serving'] ?? nutr['energy_serving'])
  const proteinServing = parseNumber(nutr['proteins_serving'])
  const carbsServing = parseNumber(nutr['carbohydrates_serving'])
  const fatServing = parseNumber(nutr['fat_serving'])
  const fiberServing = parseNumber(nutr['fiber_serving'])
  const sugarServing = parseNumber(nutr['sugars_serving'])

  if (kcalServing != null || proteinServing != null || carbsServing != null || fatServing != null) {
    calories = kcalServing ?? parseNumber(nutr['energy-kcal_100g'] ?? nutr['energy_100g'])
    protein_g = proteinServing ?? parseNumber(nutr['proteins_100g'])
    carbs_g = carbsServing ?? parseNumber(nutr['carbohydrates_100g'])
    fat_g = fatServing ?? parseNumber(nutr['fat_100g'])
    fiber_g = fiberServing ?? parseNumber(nutr['fiber_100g'])
    sugar_g = sugarServing ?? parseNumber(nutr['sugars_100g'])
  } else {
    // Fallback: use per 100g/ml as "per serving"
    calories = parseNumber(nutr['energy-kcal_100g'] ?? nutr['energy_100g'])
    protein_g = parseNumber(nutr['proteins_100g'])
    carbs_g = parseNumber(nutr['carbohydrates_100g'])
    fat_g = parseNumber(nutr['fat_100g'])
    fiber_g = parseNumber(nutr['fiber_100g'])
    sugar_g = parseNumber(nutr['sugars_100g'])
  }

  return {
    source: 'openfoodfacts',
    id: String(product.code || product.id || name),
    name,
    brand,
    serving_size: servingSizeLabel || undefined,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    fiber_g,
    sugar_g,
  }
}

export async function searchOpenFoodFactsByQuery(
  query: string,
  opts: { pageSize?: number } = {},
): Promise<NormalizedFoodItem[]> {
  const pageSize = opts.pageSize ?? 5
  if (!query.trim()) return []

  const params = new URLSearchParams({
    action: 'process',
    search_terms: query,
    search_simple: '1',
    json: '1',
    page_size: String(pageSize),
  })

  const url = `${openFoodFactsBaseUrl()}/cgi/search.pl?${params.toString()}`

  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': OPENFOODFACTS_USER_AGENT,
      },
      // keep timeouts modest to avoid blocking the analyzer too long
      cache: 'no-store',
      next: { revalidate: 0 },
      timeoutMs: 3000,
    })

    if (!res.ok) {
      console.warn('OpenFoodFacts search failed', res.status, await res.text())
      return []
    }

    const data = await res.json()
    const products: any[] = Array.isArray(data.products) ? data.products : []

    const normalized: NormalizedFoodItem[] = []
    for (const p of products) {
      const n = normalizeOpenFoodFactsProduct(p)
      if (n) {
        normalized.push(n)
      }
    }
    return normalized
  } catch (err) {
    console.warn('OpenFoodFacts API error', err)
    return []
  }
}

function openFoodFactsBaseUrl(): string {
  return OPENFOODFACTS_BASE_URL.replace(/\/$/, '')
}

// USDA FoodData Central

interface UsdaFoodNutrient {
  nutrientName?: string
  unitName?: string
  value?: number
  amount?: number
  nutrientId?: number
  nutrientNumber?: string
  nutrient?: {
    name?: string
    unitName?: string
    number?: string
    id?: number
  }
}

interface UsdaFood {
  fdcId: number
  description: string
  brandName?: string
  dataType?: string
  servingSize?: number
  servingSizeUnit?: string | { name?: string }
  foodNutrients?: UsdaFoodNutrient[]
  foodPortions?: Array<{
    gramWeight?: number
    modifier?: string
    portionDescription?: string
    measureUnit?: { name?: string }
  }>
}

const extractUsdaNutrients = (food: UsdaFood) => {
  const nutrients = food.foodNutrients || []

  const getName = (n: UsdaFoodNutrient) => (n.nutrientName || n.nutrient?.name || '').toLowerCase()
  const getUnit = (n: UsdaFoodNutrient) => (n.unitName || n.nutrient?.unitName || '').toUpperCase()
  const getId = (n: UsdaFoodNutrient) =>
    Number.isFinite(Number(n.nutrientId)) ? Number(n.nutrientId) : Number(n.nutrient?.id)
  const getNumber = (n: UsdaFoodNutrient) => (n.nutrientNumber || n.nutrient?.number || '').trim()
  const getValue = (n: UsdaFoodNutrient) => {
    const raw = Number.isFinite(Number(n.value)) ? n.value : n.amount
    return Number.isFinite(Number(raw)) ? Number(raw) : null
  }

  const findVal = (opts: {
    names?: string[]
    ids?: number[]
    numbers?: string[]
    units?: string[]
  }): number | null => {
    const names = (opts.names || []).map((n) => n.toLowerCase())
    const ids = opts.ids || []
    const numbers = opts.numbers || []
    const units = (opts.units || []).map((u) => u.toUpperCase())
    for (const n of nutrients) {
      const name = getName(n)
      const id = getId(n)
      const number = getNumber(n)
      const unit = getUnit(n)
      const matchesName = name && names.includes(name)
      const matchesId = Number.isFinite(Number(id)) && ids.includes(Number(id))
      const matchesNumber = number && numbers.includes(number)
      if (!matchesName && !matchesId && !matchesNumber) continue
      if (units.length > 0 && unit && !units.includes(unit)) continue
      const val = getValue(n)
      if (val != null) return val
    }
    return null
  }

  const energyKcal =
    findVal({ names: ['Energy'], units: ['KCAL'] }) ??
    findVal({ ids: [1008], numbers: ['208'], units: ['KCAL'] })
  const energyKj =
    findVal({ names: ['Energy'], units: ['KJ'] }) ??
    findVal({ ids: [1008], numbers: ['208'], units: ['KJ'] })
  const energy = energyKcal ?? (energyKj ? energyKj / 4.184 : null)

  const protein = findVal({
    names: ['Protein'],
    ids: [1003],
    numbers: ['203'],
    units: ['G'],
  })
  const carbs = findVal({
    names: ['Carbohydrate, by difference', 'Carbohydrate'],
    ids: [1005],
    numbers: ['205'],
    units: ['G'],
  })
  const fat = findVal({
    names: ['Total lipid (fat)'],
    ids: [1004],
    numbers: ['204'],
    units: ['G'],
  })
  const fiber = findVal({
    names: ['Fiber, total dietary', 'Dietary Fiber'],
    ids: [1079],
    numbers: ['291'],
    units: ['G'],
  })
  const sugar =
    findVal({
      names: ['Sugars, total including NLEA', 'Sugars, total'],
      ids: [2000],
      numbers: ['269'],
      units: ['G'],
    }) ?? null
  return { energyKcal: energy, protein, carbs, fat, fiber, sugar }
}

function normalizeUsdaFood(food: UsdaFood): NormalizedFoodItem | null {
  if (!food || !food.description) return null
  const { energyKcal, protein, carbs, fat, fiber, sugar } = extractUsdaNutrients(food)

  return {
    source: 'usda',
    id: String(food.fdcId),
    name: food.description,
    brand: food.brandName,
    serving_size: '100 g',
    calories: energyKcal,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    fiber_g: fiber,
    sugar_g: sugar,
  }
}

export async function fetchUsdaServingOptions(fdcId: string): Promise<ServingOption[]> {
  if (!USDA_API_KEY) {
    console.warn('USDA_API_KEY not configured; skipping USDA serving lookup')
    return []
  }
  if (!fdcId) return []

  const url = `https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(fdcId)}?api_key=${USDA_API_KEY}`
  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 0 },
      timeoutMs: 3500,
    })

    if (!res.ok) {
      console.warn('USDA food detail failed', res.status, await res.text())
      return []
    }

    const food: UsdaFood = await res.json()
    const { energyKcal, protein, carbs, fat, fiber, sugar } = extractUsdaNutrients(food)
    const base = {
      calories: energyKcal,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      fiber_g: fiber,
      sugar_g: sugar,
    }

    const dataType = String((food as any)?.dataType || '').toLowerCase()
    const isBranded = dataType.includes('branded')
    const servingSizeRaw = (food as any)?.servingSize
    const servingSizeUnitRaw = (food as any)?.servingSizeUnit
    const servingSizeUnit =
      typeof servingSizeUnitRaw === 'string'
        ? servingSizeUnitRaw
        : typeof servingSizeUnitRaw?.name === 'string'
        ? servingSizeUnitRaw.name
        : ''
    const servingSizeNum = Number(servingSizeRaw)
    const servingSizeGrams =
      Number.isFinite(servingSizeNum) && servingSizeNum > 0 && String(servingSizeUnit).toLowerCase() === 'g'
        ? servingSizeNum
        : null
    const baseWeightGrams = isBranded && servingSizeGrams ? servingSizeGrams : 100

    const scaleFromBase = (grams: number) => grams / baseWeightGrams

    const options: ServingOption[] = []
    if (Number.isFinite(Number(base.calories))) {
      options.push({
        id: `usda:${fdcId}:100g`,
        label: '100 g',
        serving_size: '100 g',
        grams: 100,
        unit: 'g',
        calories: base.calories != null ? Math.round(base.calories * scaleFromBase(100)) : null,
        protein_g: base.protein_g != null ? Math.round(base.protein_g * scaleFromBase(100) * 10) / 10 : null,
        carbs_g: base.carbs_g != null ? Math.round(base.carbs_g * scaleFromBase(100) * 10) / 10 : null,
        fat_g: base.fat_g != null ? Math.round(base.fat_g * scaleFromBase(100) * 10) / 10 : null,
        fiber_g: base.fiber_g != null ? Math.round(base.fiber_g * scaleFromBase(100) * 10) / 10 : null,
        sugar_g: base.sugar_g != null ? Math.round(base.sugar_g * scaleFromBase(100) * 10) / 10 : null,
        source: 'usda',
      })
    }

    if (isBranded && servingSizeGrams && Number.isFinite(Number(base.calories))) {
      options.push({
        id: `usda:${fdcId}:serving`,
        label: `Serving — ${Math.round(servingSizeGrams)}g`,
        serving_size: `Serving — ${Math.round(servingSizeGrams)}g`,
        grams: servingSizeGrams,
        unit: 'g',
        calories: base.calories ?? null,
        protein_g: base.protein_g ?? null,
        carbs_g: base.carbs_g ?? null,
        fat_g: base.fat_g ?? null,
        fiber_g: base.fiber_g ?? null,
        sugar_g: base.sugar_g ?? null,
        source: 'usda',
      })
    }

    const portions = Array.isArray(food.foodPortions) ? food.foodPortions : []
    portions.forEach((portion, idx) => {
      const grams = Number(portion?.gramWeight ?? 0)
      if (!Number.isFinite(grams) || grams <= 0) return
      const labelBase =
        portion?.portionDescription ||
        portion?.modifier ||
        portion?.measureUnit?.name ||
        'Serving'
      const label = `${labelBase} — ${Math.round(grams)}g`
      const factor = scaleFromBase(grams)
      options.push({
        id: `usda:${fdcId}:${idx}`,
        label,
        serving_size: label,
        grams,
        unit: 'g',
        calories: base.calories != null ? Math.round(base.calories * factor) : null,
        protein_g: base.protein_g != null ? Math.round(base.protein_g * factor * 10) / 10 : null,
        carbs_g: base.carbs_g != null ? Math.round(base.carbs_g * factor * 10) / 10 : null,
        fat_g: base.fat_g != null ? Math.round(base.fat_g * factor * 10) / 10 : null,
        fiber_g: base.fiber_g != null ? Math.round(base.fiber_g * factor * 10) / 10 : null,
        sugar_g: base.sugar_g != null ? Math.round(base.sugar_g * factor * 10) / 10 : null,
        source: 'usda',
      })
    })

    const deduped = new Map<string, ServingOption>()
    options.forEach((opt) => {
      const key = `${opt.serving_size}|${opt.grams || ''}`
      if (!deduped.has(key)) deduped.set(key, opt)
    })
    return Array.from(deduped.values())
  } catch (err) {
    console.warn('USDA serving lookup error', err)
    return []
  }
}

export async function searchUsdaFoods(
  query: string,
  opts: { pageSize?: number; dataType?: 'branded' | 'generic' | 'all' } = {},
): Promise<NormalizedFoodItem[]> {
  if (!USDA_API_KEY) {
    console.warn('USDA_API_KEY not configured; skipping USDA lookup')
    return []
  }
  const pageSize = opts.pageSize ?? 5
  const dataType = opts.dataType ?? 'all'
  const dataTypeParam =
    dataType === 'branded'
      ? 'Branded'
      : dataType === 'generic'
      ? ['Foundation', 'Survey (FNDDS)', 'SR Legacy'].join(',')
      : ['Foundation', 'Branded', 'Survey (FNDDS)', 'SR Legacy'].join(',')

  if (!query.trim()) return []

  const params = new URLSearchParams({
    api_key: USDA_API_KEY,
    query,
    pageSize: String(pageSize),
    dataType: dataTypeParam,
  })

  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`

  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 0 },
      timeoutMs: 3500,
    })

    if (!res.ok) {
      console.warn('USDA search failed', res.status, await res.text())
      return []
    }

    const data = await res.json()
    const foods: UsdaFood[] = Array.isArray(data.foods) ? data.foods : []
    const out: NormalizedFoodItem[] = []
    for (const f of foods) {
      const n = normalizeUsdaFood(f)
      if (n) out.push(n)
    }
    return out
  } catch (err) {
    console.warn('USDA API error', err)
    return []
  }
}

// FatSecret Platform API

interface FatSecretFood {
  food_id: string
  food_name: string
  food_type: string
  brand_name?: string
  food_description?: string
  servings?: {
    serving: Array<{
      serving_id: string
      serving_description: string
      serving_url: string
      metric_serving_amount: string
      metric_serving_unit: string
      number_of_units: string
      measurement_description: string
      calories: string
      carbohydrate: string
      protein: string
      fat: string
      saturated_fat?: string
      polyunsaturated_fat?: string
      monounsaturated_fat?: string
      cholesterol?: string
      sodium?: string
      potassium?: string
      fiber?: string
      sugar?: string
    }>
  }
}

interface FatSecretSearchResponse {
  foods?: {
    food?: FatSecretFood[]
    total_results?: string
    max_results?: string
    page_number?: string
  }
}

interface FatSecretFoodDetail {
  food?: FatSecretFood | null
}

function normalizeFatSecretFood(food: FatSecretFood): NormalizedFoodItem | null {
  if (!food || !food.food_name) return null

  // Use the first serving as default, or try to find a standard serving
  const servings = food.servings?.serving || []
  if (servings.length === 0) return null

  const lower = (v: any) => String(v || '').toLowerCase()
  const parseValue = (val: string | undefined): number | null => {
    if (!val) return null
    const num = parseFloat(val)
    return Number.isFinite(num) ? num : null
  }
  const parseAmount = (val: string | undefined): number | null => parseValue(val)

  // Prefer real package servings over generic "100 g".
  const scoreServing = (s: any) => {
    let score = 0
    const measurement = lower(s?.measurement_description || s?.serving_description)
    const metricUnit = lower(s?.metric_serving_unit)
    const metricAmount = parseAmount(s?.metric_serving_amount)

    if (measurement.includes('100 g') || measurement.includes('100g')) score -= 10
    if (measurement.includes('serving')) score += 2

    // Common packaged units (biscuits, slices, pieces, bars, etc.)
    if (
      measurement.includes('biscuit') ||
      measurement.includes('cookie') ||
      measurement.includes('slice') ||
      measurement.includes('piece') ||
      measurement.includes('bar') ||
      measurement.includes('packet') ||
      measurement.includes('pack')
    ) {
      score += 6
    }

    // Prefer metric amounts that look like real servings (roughly 5g–150g).
    if (metricUnit === 'g' && metricAmount != null) {
      if (metricAmount >= 5 && metricAmount <= 150) score += 5
      if (metricAmount === 100) score -= 4
    }

    // Prefer explicit "1" unit servings when available.
    const numberOfUnits = parseAmount(s?.number_of_units)
    if (numberOfUnits != null) {
      if (numberOfUnits === 1) score += 2
      if (numberOfUnits > 1) score += 1
    }

    return score
  }

  const preferredServing = [...servings].sort((a, b) => scoreServing(b) - scoreServing(a))[0] || servings[0]

  const servingSizeBase =
    preferredServing.measurement_description || preferredServing.serving_description || '1 serving'
  const metricAmount = parseAmount(preferredServing.metric_serving_amount)
  const metricUnit = preferredServing.metric_serving_unit
  const servingSizeLabel =
    metricAmount != null &&
    metricAmount > 0 &&
    metricUnit &&
    typeof servingSizeBase === 'string' &&
    !/\b\d+(\.\d+)?\s*(g|ml)\b/i.test(servingSizeBase)
      ? `${servingSizeBase} (${metricAmount} ${metricUnit})`
      : servingSizeBase

  return {
    source: 'fatsecret',
    id: food.food_id,
    name: food.food_name,
    brand: food.brand_name || null,
    serving_size: servingSizeLabel,
    calories: parseValue(preferredServing.calories),
    protein_g: parseValue(preferredServing.protein),
    carbs_g: parseValue(preferredServing.carbohydrate),
    fat_g: parseValue(preferredServing.fat),
    fiber_g: parseValue(preferredServing.fiber),
    sugar_g: parseValue(preferredServing.sugar),
  }
}

let fatSecretTokenCacheByScope: Record<string, { token: string; expiresAtMs: number }> = {}

async function getFatSecretAccessToken(scope = 'basic'): Promise<string | null> {
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    console.warn('FatSecret credentials not configured')
    return null
  }

  const scopeKey = scope && String(scope).trim().length > 0 ? String(scope).trim() : 'basic'
  const cached = fatSecretTokenCacheByScope[scopeKey]
  if (cached && cached.token && nowMs() < cached.expiresAtMs - 10_000) {
    return cached.token
  }

  try {
    // FatSecret uses OAuth 2.0 client credentials flow
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: scopeKey,
    })

    const auth = Buffer.from(`${FATSECRET_CLIENT_ID}:${FATSECRET_CLIENT_SECRET}`).toString('base64')

    const res = await fetchWithTimeout('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body: params.toString(),
      cache: 'no-store',
      timeoutMs: 2500,
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.warn('FatSecret token request failed', res.status, errorText.substring(0, 200))
      return null
    }

    const data = await res.json()
    const token = data.access_token || null
    const expiresInSecRaw = data.expires_in
    const expiresInSec =
      typeof expiresInSecRaw === 'number'
        ? expiresInSecRaw
        : typeof expiresInSecRaw === 'string'
        ? parseInt(expiresInSecRaw, 10)
        : NaN

    if (token) {
      // Default to 5 minutes if FatSecret doesn't return expires_in for some reason.
      const ttlMs = Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec * 1000 : 5 * 60 * 1000
      // Keep a little safety margin so we don't reuse an expired token.
      fatSecretTokenCacheByScope[scopeKey] = { token, expiresAtMs: nowMs() + Math.max(30_000, ttlMs) }
    } else {
      delete fatSecretTokenCacheByScope[scopeKey]
    }
    return token
  } catch (err) {
    console.warn('FatSecret token error', err)
    return null
  }
}

export async function fetchFatSecretServingOptions(foodId: string): Promise<ServingOption[]> {
  if (!foodId) return []
  const accessToken = await getFatSecretAccessToken()
  if (!accessToken) return []

  try {
    const params = new URLSearchParams({
      method: 'food.get.v2',
      food_id: String(foodId),
      format: 'json',
    })
    const url = `https://platform.fatsecret.com/rest/server.api?${params.toString()}`

    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 0 },
      timeoutMs: 3500,
    })

    if (!res.ok) {
      const text = await res.text()
      console.warn('FatSecret food.get.v2 failed', res.status, text.substring(0, 200))
      return []
    }

    const data: FatSecretFoodDetail = await res.json()
    const food = data.food
    if (!food || !food.servings || !food.servings.serving) return []

    const servings = Array.isArray(food.servings.serving)
      ? food.servings.serving
      : [food.servings.serving]

    const options: ServingOption[] = []
    servings.forEach((serving: any, idx: number) => {
      const metricAmount = Number(serving?.metric_serving_amount)
      const metricUnit = String(serving?.metric_serving_unit || '').toLowerCase()
      const measurement = String(serving?.measurement_description || serving?.serving_description || 'Serving')
      const hasMetric = Number.isFinite(metricAmount) && metricAmount > 0 && metricUnit

      const grams = hasMetric && metricUnit === 'g' ? metricAmount : null
      const ml = hasMetric && metricUnit === 'ml' ? metricAmount : null
      const unit: 'g' | 'ml' | 'oz' | undefined =
        metricUnit === 'g' ? 'g' : metricUnit === 'ml' ? 'ml' : metricUnit === 'oz' ? 'oz' : undefined

      const label = hasMetric ? `${measurement} — ${metricAmount} ${metricUnit}` : measurement
      const parseValue = (val: string | undefined): number | null => {
        if (!val) return null
        const num = parseFloat(val)
        return Number.isFinite(num) ? num : null
      }

      options.push({
        id: `fatsecret:${foodId}:${serving?.serving_id ?? idx}`,
        label,
        serving_size: label,
        grams,
        ml,
        unit,
        calories: parseValue(serving?.calories),
        protein_g: parseValue(serving?.protein),
        carbs_g: parseValue(serving?.carbohydrate),
        fat_g: parseValue(serving?.fat),
        fiber_g: parseValue(serving?.fiber),
        sugar_g: parseValue(serving?.sugar),
        source: 'fatsecret',
      })
    })

    return options
  } catch (err) {
    console.warn('FatSecret serving lookup error', err)
    return []
  }
}

export async function searchFatSecretFoods(
  query: string,
  opts: { pageSize?: number } = {},
): Promise<NormalizedFoodItem[]> {
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    console.warn('FatSecret credentials not configured; skipping FatSecret lookup')
    return []
  }

  const pageSize = opts.pageSize ?? 5
  if (!query.trim()) return []

  const accessToken = await getFatSecretAccessToken()
  if (!accessToken) {
    console.warn('Failed to obtain FatSecret access token')
    return []
  }

  try {
    const params = new URLSearchParams({
      method: 'foods.search',
      search_expression: query,
      max_results: String(pageSize),
      format: 'json',
    })

    const url = `https://platform.fatsecret.com/rest/server.api?${params.toString()}`

    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 0 },
      timeoutMs: 3500,
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.warn('FatSecret search failed', res.status, errorText.substring(0, 200))
      return []
    }

    const data: FatSecretSearchResponse = await res.json()
    const foods: FatSecretFood[] = data.foods?.food || []

    const normalized: NormalizedFoodItem[] = []
    for (const f of foods) {
      const n = normalizeFatSecretFood(f)
      if (n) normalized.push(n)
    }
    return normalized
  } catch (err) {
    console.warn('FatSecret API error', err)
    return []
  }
}

export async function fetchFatSecretBrandList(
  startsWith: string,
  options?: { brandType?: string; region?: string; language?: string; limit?: number },
): Promise<string[]> {
  const prefix = String(startsWith || '').trim()
  if (prefix.length < 2) return []

  const accessToken = await getFatSecretAccessToken('premier')
  if (!accessToken) return []

  try {
    const params = new URLSearchParams({
      starts_with: prefix,
      format: 'json',
    })
    if (options?.brandType) params.set('brand_type', options.brandType)
    if (options?.region) params.set('region', options.region)
    if (options?.language) params.set('language', options.language)

    const url = `https://platform.fatsecret.com/rest/brands/v2?${params.toString()}`
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      timeoutMs: 2500,
    })

    if (!res.ok) {
      const text = await res.text()
      console.warn('FatSecret brands list failed', res.status, text.substring(0, 200))
      return []
    }

    const data = await res.json().catch(() => ({} as any))
    const raw =
      (data as any)?.food_brands?.food_brand ||
      (data as any)?.food_brands ||
      (data as any)?.brands ||
      []

    const list = Array.isArray(raw) ? raw : [raw]
    const names: string[] = []
    const seen = new Set<string>()

    const addName = (value: any) => {
      const name = String(value || '').trim()
      if (!name) return
      const key = name.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      names.push(name)
    }

    list.forEach((item) => {
      if (!item) return
      if (typeof item === 'string') {
        addName(item)
        return
      }
      const candidate =
        (item as any).food_brand_name ||
        (item as any).brand_name ||
        (item as any).food_brand ||
        (item as any).name
      addName(candidate)
    })

    const limit = options?.limit && Number.isFinite(options.limit) ? Math.max(1, Math.min(options.limit, 50)) : 20
    return names.slice(0, limit)
  } catch (err) {
    console.warn('FatSecret brands list error', err)
    return []
  }
}

// Enhanced lookup function that tries multiple sources with fallback
export async function lookupFoodNutrition(
  query: string,
  options?: {
    preferSource?: 'usda' | 'fatsecret' | 'openfoodfacts'
    maxResults?: number
    usdaDataType?: 'branded' | 'generic' | 'all'
  },
): Promise<NormalizedFoodItem[]> {
  const maxResults = options?.maxResults ?? 3
  const preferSource = options?.preferSource || 'usda'
  const usdaDataType = options?.usdaDataType

  // Try sources in order of preference
  const sources: Array<() => Promise<NormalizedFoodItem[]>> = []

  if (preferSource === 'usda') {
    sources.push(() => searchUsdaFoods(query, { pageSize: maxResults, dataType: usdaDataType }))
    sources.push(() => searchFatSecretFoods(query, { pageSize: maxResults }))
    sources.push(() => searchOpenFoodFactsByQuery(query, { pageSize: maxResults }))
  } else if (preferSource === 'fatsecret') {
    sources.push(() => searchFatSecretFoods(query, { pageSize: maxResults }))
    sources.push(() => searchUsdaFoods(query, { pageSize: maxResults, dataType: usdaDataType }))
    sources.push(() => searchOpenFoodFactsByQuery(query, { pageSize: maxResults }))
  } else {
    sources.push(() => searchOpenFoodFactsByQuery(query, { pageSize: maxResults }))
    sources.push(() => searchUsdaFoods(query, { pageSize: maxResults, dataType: usdaDataType }))
    sources.push(() => searchFatSecretFoods(query, { pageSize: maxResults }))
  }

  // Try each source until we get results
  for (const sourceFn of sources) {
    try {
      const results = await sourceFn()
      if (results && results.length > 0) {
        console.log(`✅ Found ${results.length} results from ${results[0].source} for query: ${query}`)
        return results
      }
    } catch (err) {
      console.warn(`⚠️ Source lookup failed, trying next:`, err)
      continue
    }
  }

  console.warn(`⚠️ No results found from any source for query: ${query}`)
  return []
}
