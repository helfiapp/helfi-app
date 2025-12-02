import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'

// Barcode lookup with multiple API fallbacks:
// 1. FatSecret (primary - has great barcode coverage for packaged foods)
// 2. OpenFoodFacts (fallback - open database with excellent global coverage)
// 3. USDA (secondary fallback - search by product name if barcode not found)

const FATSECRET_CLIENT_ID = process.env.FATSECRET_CLIENT_ID || '5b035e5de0b041ffb0b8522abd75dd0b'
const FATSECRET_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET || 'd544f96d19494c9ca8a3dec1bcaf1da3'
const USDA_API_KEY = process.env.USDA_API_KEY
const OPENFOODFACTS_USER_AGENT = 'helfi-app/1.0 (support@helfi.ai)'
const BARCODE_SCAN_COST_CENTS = 3

type FatSecretServing = {
  measurement_description?: string
  serving_description?: string
  calories?: string
  protein?: string
  carbohydrate?: string
  fat?: string
  fiber?: string
  sugar?: string
}

type FatSecretFood = {
  food_id?: string
  food_name?: string
  brand_name?: string
  servings?: { serving?: FatSecretServing[] | FatSecretServing }
}

interface NormalizedFood {
  source: 'fatsecret' | 'openfoodfacts' | 'usda'
  id: string
  name: string
  brand?: string | null
  serving_size: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  sugar_g: number | null
  barcode?: string | null
}

type OpenFoodFactsResult = {
  food: NormalizedFood | null
  productName: string | null
}

const parseNumber = (val?: string | number | null): number | null => {
  if (val === undefined || val === null) return null
  const num = typeof val === 'number' ? val : parseFloat(val)
  return Number.isFinite(num) ? num : null
}

// ============ FatSecret API ============

async function getFatSecretAccessToken(): Promise<string | null> {
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    console.log('FatSecret credentials not configured, skipping')
    return null
  }

  try {
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
      const txt = await res.text()
      console.warn('FatSecret token request failed', res.status, txt.substring(0, 200))
      return null
    }

    const data = await res.json()
    return data.access_token || null
  } catch (err) {
    console.warn('FatSecret token error', err)
    return null
  }
}

async function fetchFoodFromFatSecret(barcode: string): Promise<NormalizedFood | null> {
  const token = await getFatSecretAccessToken()
  if (!token) return null

  try {
    // Step 1: find food_id from barcode
    const findParams = new URLSearchParams({
      method: 'food.find_id_for_barcode',
      barcode,
      format: 'json',
    })

    const findRes = await fetch(`https://platform.fatsecret.com/rest/server.api?${findParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 0 },
    })

    if (!findRes.ok) {
      const txt = await findRes.text()
      console.warn('FatSecret barcode lookup failed', findRes.status, txt.substring(0, 200))
      return null
    }

    const findData = await findRes.json()
    const foodId =
      findData?.food?.food_id ||
      findData?.food_id ||
      findData?.food?.[0]?.food_id

    if (!foodId) {
      console.log('FatSecret: No food_id found for barcode', barcode)
      return null
    }

    // Step 2: fetch food details
    const foodParams = new URLSearchParams({
      method: 'food.get.v2',
      food_id: String(foodId),
      format: 'json',
    })

    const foodRes = await fetch(`https://platform.fatsecret.com/rest/server.api?${foodParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 0 },
    })

    if (!foodRes.ok) {
      const txt = await foodRes.text()
      console.warn('FatSecret food.get.v2 failed', foodRes.status, txt.substring(0, 200))
      return null
    }

    const foodJson = await foodRes.json()
    const food: FatSecretFood | null = (foodJson as any)?.food || null
    if (!food?.food_name) return null

    // Handle both array and single serving object
    const servingsRaw = food.servings?.serving
    const servings = Array.isArray(servingsRaw) ? servingsRaw : servingsRaw ? [servingsRaw] : []
    if (servings.length === 0) return null

    const preferred =
      servings.find(
        (s) =>
          s.measurement_description?.toLowerCase().includes('100 g') ||
          s.measurement_description?.toLowerCase().includes('serving'),
      ) || servings[0]

    console.log('✅ FatSecret found:', food.food_name, 'for barcode', barcode)

    return {
      source: 'fatsecret',
      id: String(foodId),
      name: food.food_name,
      brand: food.brand_name || null,
      serving_size: preferred.measurement_description || preferred.serving_description || '1 serving',
      calories: parseNumber(preferred.calories),
      protein_g: parseNumber(preferred.protein),
      carbs_g: parseNumber(preferred.carbohydrate),
      fat_g: parseNumber(preferred.fat),
      fiber_g: parseNumber(preferred.fiber),
      sugar_g: parseNumber(preferred.sugar),
      barcode,
    }
  } catch (err) {
    console.warn('FatSecret barcode handler error', err)
    return null
  }
}

// ============ OpenFoodFacts API ============

async function fetchFoodFromOpenFoodFacts(barcode: string): Promise<OpenFoodFactsResult> {
  try {
    const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': OPENFOODFACTS_USER_AGENT,
      },
      cache: 'no-store',
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      console.warn('OpenFoodFacts barcode lookup failed', res.status)
      return { food: null, productName: null }
    }

    const data = await res.json()
    
    if (data.status !== 1 || !data.product) {
      console.log('OpenFoodFacts: Product not found for barcode', barcode)
      return { food: null, productName: null }
    }

    const product = data.product
    const nutr = product.nutriments || {}

    const name: string =
      product.product_name ||
      product.generic_name ||
      product.brands ||
      product.categories ||
      product.labels ||
      barcode

    if (!name) return { food: null, productName: null }

    // Prefer per-serving values, fallback to per 100g
    const kcalServing = parseNumber(nutr['energy-kcal_serving'] ?? nutr['energy_serving'])
    const proteinServing = parseNumber(nutr['proteins_serving'])
    const carbsServing = parseNumber(nutr['carbohydrates_serving'])
    const fatServing = parseNumber(nutr['fat_serving'])
    const fiberServing = parseNumber(nutr['fiber_serving'])
    const sugarServing = parseNumber(nutr['sugars_serving'])

    let calories: number | null = null
    let protein_g: number | null = null
    let carbs_g: number | null = null
    let fat_g: number | null = null
    let fiber_g: number | null = null
    let sugar_g: number | null = null
    let serving_size = '1 serving'

    if (kcalServing != null || proteinServing != null || carbsServing != null || fatServing != null) {
      calories = kcalServing ?? parseNumber(nutr['energy-kcal_100g'] ?? nutr['energy_100g'])
      protein_g = proteinServing ?? parseNumber(nutr['proteins_100g'])
      carbs_g = carbsServing ?? parseNumber(nutr['carbohydrates_100g'])
      fat_g = fatServing ?? parseNumber(nutr['fat_100g'])
      fiber_g = fiberServing ?? parseNumber(nutr['fiber_100g'])
      sugar_g = sugarServing ?? parseNumber(nutr['sugars_100g'])
      serving_size = product.serving_size || '1 serving'
    } else {
      // Use per 100g values
      calories = parseNumber(nutr['energy-kcal_100g'] ?? nutr['energy_100g'])
      protein_g = parseNumber(nutr['proteins_100g'])
      carbs_g = parseNumber(nutr['carbohydrates_100g'])
      fat_g = parseNumber(nutr['fat_100g'])
      fiber_g = parseNumber(nutr['fiber_100g'])
      sugar_g = parseNumber(nutr['sugars_100g'])
      serving_size = '100 g'
    }

    console.log('✅ OpenFoodFacts found:', name, 'for barcode', barcode)

    return {
      food: {
        source: 'openfoodfacts',
        id: barcode,
        name,
        brand: product.brands || null,
        serving_size,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        fiber_g,
        sugar_g,
        barcode,
      },
      productName: name,
    }
  } catch (err) {
    console.warn('OpenFoodFacts barcode handler error', err)
    return { food: null, productName: null }
  }
}

// ============ USDA API (search by product name) ============

async function searchFoodFromUSDA(productName: string, barcode: string): Promise<NormalizedFood | null> {
  if (!USDA_API_KEY) {
    console.log('USDA API key not configured, skipping')
    return null
  }

  try {
    const params = new URLSearchParams({
      api_key: USDA_API_KEY,
      query: productName,
      pageSize: '1',
      dataType: 'Branded',
    })

    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      console.warn('USDA search failed', res.status)
      return null
    }

    const data = await res.json()
    const foods = data.foods || []
    
    if (foods.length === 0) {
      console.log('USDA: No results for query', productName)
      return null
    }

    const food = foods[0]
    const nutrients = food.foodNutrients || []

    const findNutrient = (name: string): number | null => {
      const n = nutrients.find(
        (n: any) => n.nutrientName?.toLowerCase().includes(name.toLowerCase())
      )
      return n ? parseNumber(n.value) : null
    }

    console.log('✅ USDA found:', food.description, 'for barcode', barcode)

    return {
      source: 'usda',
      id: String(food.fdcId),
      name: food.description || productName,
      brand: food.brandName || food.brandOwner || null,
      serving_size: food.servingSize ? `${food.servingSize} ${food.servingSizeUnit || 'g'}` : '100 g',
      calories: findNutrient('energy'),
      protein_g: findNutrient('protein'),
      carbs_g: findNutrient('carbohydrate'),
      fat_g: findNutrient('fat') ?? findNutrient('lipid'),
      fiber_g: findNutrient('fiber'),
      sugar_g: findNutrient('sugar'),
      barcode,
    }
  } catch (err) {
    console.warn('USDA search error', err)
    return null
  }
}

// ============ Main Handler ============

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = (searchParams.get('code') || '').trim().replace(/[^0-9A-Za-z]/g, '')
  
  if (!code) {
    return NextResponse.json({ error: 'Missing barcode code' }, { status: 400 })
  }

  // Require signed-in user for credit charge
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { subscription: true, creditTopUps: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const cm = new CreditManager(user.id)
  const wallet = await cm.getWalletStatus()
  // Pre-check for sufficient credits, but only charge if a product is actually found
  if (wallet.totalAvailableCents < BARCODE_SCAN_COST_CENTS) {
    return NextResponse.json(
      { error: 'Insufficient credits', message: 'Barcode scanning requires 3 credits.' },
      { status: 402 },
    )
  }

  console.log('🔍 Looking up barcode:', code)
  let food: NormalizedFood | null = null
  let openFoodFacts: OpenFoodFactsResult | null = null

  // Try FatSecret first (best for packaged foods)
  food = await fetchFoodFromFatSecret(code)

  // Try OpenFoodFacts second (great global coverage) if still missing
  if (!food) {
    openFoodFacts = await fetchFoodFromOpenFoodFacts(code)
    if (openFoodFacts.food) {
      food = openFoodFacts.food
    }
  }

  // Try USDA using the best available product name (OpenFoodFacts often has a label even when nutrition is missing)
  if (!food) {
    const usdaQuery = openFoodFacts?.productName || code
    const usdaFood = await searchFoodFromUSDA(usdaQuery, code)
    if (usdaFood) {
      food = usdaFood
    }
  }

  if (food) {
    // Charge only when we actually have a product to return
    const charged = await cm.chargeCents(BARCODE_SCAN_COST_CENTS)
    if (!charged) {
      return NextResponse.json(
        { error: 'Insufficient credits', message: 'Barcode scanning requires 3 credits.' },
        { status: 402 },
      )
    }
    return NextResponse.json({ found: true, food })
  }

  console.log('⚠️ No barcode match found after FatSecret, OpenFoodFacts, or USDA for:', code)
  
  return NextResponse.json({ 
    found: false, 
    message: 'No product found for this barcode. Try searching by product name instead.' 
  }, { status: 404 })
}
