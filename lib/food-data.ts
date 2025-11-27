import 'server-only'

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
      ? ['Survey (FNDDS)', 'SR Legacy'].join(',')
      : ['Branded', 'Survey (FNDDS)', 'SR Legacy'].join(',')

  if (!query.trim()) return []

  const params = new URLSearchParams({
    api_key: USDA_API_KEY,
    query,
    pageSize: String(pageSize),
    dataType: dataTypeParam,
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

function normalizeFatSecretFood(food: FatSecretFood): NormalizedFoodItem | null {
  if (!food || !food.food_name) return null

  // Use the first serving as default, or try to find a standard serving
  const servings = food.servings?.serving || []
  if (servings.length === 0) return null

  // Prefer "100 g" or "1 serving" if available, otherwise use first serving
  const preferredServing = servings.find(
    (s) =>
      s.measurement_description?.toLowerCase().includes('100 g') ||
      s.measurement_description?.toLowerCase().includes('serving')
  ) || servings[0]

  const parseValue = (val: string | undefined): number | null => {
    if (!val) return null
    const num = parseFloat(val)
    return Number.isFinite(num) ? num : null
  }

  return {
    source: 'fatsecret',
    id: food.food_id,
    name: food.food_name,
    brand: food.brand_name || null,
    serving_size: preferredServing.measurement_description || preferredServing.serving_description || '1 serving',
    calories: parseValue(preferredServing.calories),
    protein_g: parseValue(preferredServing.protein),
    carbs_g: parseValue(preferredServing.carbohydrate),
    fat_g: parseValue(preferredServing.fat),
    fiber_g: parseValue(preferredServing.fiber),
    sugar_g: parseValue(preferredServing.sugar),
  }
}

async function getFatSecretAccessToken(): Promise<string | null> {
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    console.warn('FatSecret credentials not configured')
    return null
  }

  try {
    // FatSecret uses OAuth 2.0 client credentials flow
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'basic',
    })

    const auth = Buffer.from(`${FATSECRET_CLIENT_ID}:${FATSECRET_CLIENT_SECRET}`).toString('base64')

    const res = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body: params.toString(),
      cache: 'no-store',
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.warn('FatSecret token request failed', res.status, errorText.substring(0, 200))
      return null
    }

    const data = await res.json()
    return data.access_token || null
  } catch (err) {
    console.warn('FatSecret token error', err)
    return null
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

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 0 },
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

// Enhanced lookup function that tries multiple sources with fallback
export async function lookupFoodNutrition(
  query: string,
  options?: {
    preferSource?: 'usda' | 'fatsecret' | 'openfoodfacts'
    maxResults?: number
  },
): Promise<NormalizedFoodItem[]> {
  const maxResults = options?.maxResults ?? 3
  const preferSource = options?.preferSource || 'usda'

  // Try sources in order of preference
  const sources: Array<() => Promise<NormalizedFoodItem[]>> = []

  if (preferSource === 'usda') {
    sources.push(() => searchUsdaFoods(query, { pageSize: maxResults }))
    sources.push(() => searchFatSecretFoods(query, { pageSize: maxResults }))
    sources.push(() => searchOpenFoodFactsByQuery(query, { pageSize: maxResults }))
  } else if (preferSource === 'fatsecret') {
    sources.push(() => searchFatSecretFoods(query, { pageSize: maxResults }))
    sources.push(() => searchUsdaFoods(query, { pageSize: maxResults }))
    sources.push(() => searchOpenFoodFactsByQuery(query, { pageSize: maxResults }))
  } else {
    sources.push(() => searchOpenFoodFactsByQuery(query, { pageSize: maxResults }))
    sources.push(() => searchUsdaFoods(query, { pageSize: maxResults }))
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

