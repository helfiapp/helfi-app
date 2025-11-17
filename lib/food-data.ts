import 'server-only'

export interface NormalizedFoodItem {
  source: 'openfoodfacts' | 'usda'
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

const OPENFOODFACTS_BASE_URL =
  process.env.OPENFOODFACTS_BASE_URL || 'https://world.openfoodfacts.org'

const OPENFOODFACTS_USER_AGENT =
  process.env.OPENFOODFACTS_USER_AGENT || 'helfi-app/1.0 (support@helfi.ai)'

const USDA_API_KEY = process.env.USDA_API_KEY

function parseNumber(value: any): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return n
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
    const res = await fetch(url, {
      headers: {
        'User-Agent': OPENFOODFACTS_USER_AGENT,
      },
      // keep timeouts modest to avoid blocking the analyzer too long
      cache: 'no-store',
      next: { revalidate: 0 },
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
}

interface UsdaFood {
  fdcId: number
  description: string
  brandName?: string
  foodNutrients?: UsdaFoodNutrient[]
}

function normalizeUsdaFood(food: UsdaFood): NormalizedFoodItem | null {
  if (!food || !food.description) return null
  const nutrients = food.foodNutrients || []

  const findVal = (name: string, units?: string[]): number | null => {
    const n = nutrients.find(
      (n) => n.nutrientName?.toLowerCase() === name.toLowerCase() && (!units || units.includes(n.unitName || '')),
    )
    if (!n) return null
    if (!Number.isFinite(Number(n.value))) return null
    return Number(n.value)
  }

  const energyKcal = findVal('Energy', ['KCAL']) ?? findVal('Energy', ['kcal'])
  const protein = findVal('Protein', ['G', 'g'])
  const carbs = findVal('Carbohydrate, by difference', ['G', 'g'])
  const fat = findVal('Total lipid (fat)', ['G', 'g'])
  const fiber = findVal('Fiber, total dietary', ['G', 'g'])
  const sugar = findVal('Sugars, total including NLEA', ['G', 'g']) ?? findVal('Sugars, total', ['G', 'g'])

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

export async function searchUsdaFoods(
  query: string,
  opts: { pageSize?: number } = {},
): Promise<NormalizedFoodItem[]> {
  if (!USDA_API_KEY) {
    console.warn('USDA_API_KEY not configured; skipping USDA lookup')
    return []
  }
  const pageSize = opts.pageSize ?? 5
  if (!query.trim()) return []

  const params = new URLSearchParams({
    api_key: USDA_API_KEY,
    query,
    pageSize: String(pageSize),
    dataType: ['Branded', 'Survey (FNDDS)', 'SR Legacy'].join(','),
  })

  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 0 },
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


