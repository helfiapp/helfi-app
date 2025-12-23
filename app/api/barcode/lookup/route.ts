import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { normalizeBarcodeFood, summarizeDiscreteItemsForLog } from '@/lib/food-normalization'

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
  source: 'helfi' | 'fatsecret' | 'openfoodfacts' | 'usda'
  id: string
  name: string
  brand?: string | null
  serving_size: string
  servings?: number | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  sugar_g: number | null
  barcode?: string | null
  basis?: 'per_serving' | 'per_100g' | null
  quantity_g?: number | null
  energyUnit?: 'kcal' | 'kJ' | null
  piecesPerServing?: number | null
  pieces?: number | null
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

const parseGramsFromLabel = (label?: string | null): number | null => {
  if (!label) return null
  const normalized = String(label).toLowerCase()
  const g = normalized.match(/(\d+(?:\.\d+)?)\s*(g|gram|grams)/i)
  if (g) return parseFloat(g[1])
  const ml = normalized.match(/(\d+(?:\.\d+)?)\s*(ml|milliliter|millilitre)/i)
  if (ml) return parseFloat(ml[1])
  const oz = normalized.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)/i)
  if (oz) return parseFloat(oz[1]) * 28.3495
  return null
}

const parseServingWeight = (servingSize?: string | null): number | null => {
  if (!servingSize) return null
  const normalized = String(servingSize).toLowerCase()
  const g = normalized.match(/(\d+(?:\.\d+)?)\s*(g|gram|grams)\b/i)
  if (g) return parseFloat(g[1])
  const ml = normalized.match(/(\d+(?:\.\d+)?)\s*(ml|milliliter|millilitre)\b/i)
  if (ml) return parseFloat(ml[1])
  const oz = normalized.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)\b/i)
  if (oz) return parseFloat(oz[1]) * 28.3495
  return null
}

const isServingNutritionPlausible = (data: {
  servingSize?: string | null
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fat?: number | null
  fiber?: number | null
}) => {
  const weight = parseServingWeight(data.servingSize || null)
  if (!weight || weight <= 0) return true
  const safe = (v?: number | null) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0)
  const macroSum = safe(data.protein) + safe(data.carbs) + safe(data.fat) + safe(data.fiber)
  const macroLimit = weight * 1.3 + 2
  if (macroSum > macroLimit) return false
  const calories = safe(data.calories)
  const calorieLimit = weight * 9.5 + 10
  if (calories > calorieLimit) return false
  return true
}

// ============ Helfi Barcode Cache ============

async function fetchFoodFromHelfiBarcode(barcode: string): Promise<NormalizedFood | null> {
  try {
    const record = await prisma.barcodeProduct.findUnique({
      where: { barcode },
    })
    if (!record) return null
    const plausible = isServingNutritionPlausible({
      servingSize: record.servingSize || null,
      calories: record.calories ?? null,
      protein: record.proteinG ?? null,
      carbs: record.carbsG ?? null,
      fat: record.fatG ?? null,
      fiber: record.fiberG ?? null,
    })
    if (!plausible) {
      console.warn('Helfi barcode cache rejected due to implausible nutrition', barcode)
      return null
    }
    return {
      source: 'helfi',
      id: record.id,
      name: record.name || 'Scanned food',
      brand: record.brand || null,
      serving_size: record.servingSize || '1 serving',
      calories: record.calories ?? null,
      protein_g: record.proteinG ?? null,
      carbs_g: record.carbsG ?? null,
      fat_g: record.fatG ?? null,
      fiber_g: record.fiberG ?? null,
      sugar_g: record.sugarG ?? null,
      barcode,
      basis: null,
      quantity_g: record.quantityG ?? null,
      piecesPerServing: record.piecesPerServing ?? null,
      pieces: record.piecesPerServing ?? null,
      energyUnit: null,
    }
  } catch (err) {
    console.warn('Helfi barcode lookup failed', err)
    return null
  }
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

    const servingSize = preferred.measurement_description || preferred.serving_description || '1 serving'
    const quantity_g = parseGramsFromLabel(servingSize)
    const basis: NormalizedFood['basis'] = servingSize.toLowerCase().includes('100 g') ? 'per_100g' : 'per_serving'

    return {
      source: 'fatsecret',
      id: String(foodId),
      name: food.food_name,
      brand: food.brand_name || null,
      serving_size: servingSize,
      calories: parseNumber(preferred.calories),
      protein_g: parseNumber(preferred.protein),
      carbs_g: parseNumber(preferred.carbohydrate),
      fat_g: parseNumber(preferred.fat),
      fiber_g: parseNumber(preferred.fiber),
      sugar_g: parseNumber(preferred.sugar),
      barcode,
      basis,
      quantity_g,
      energyUnit: null,
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
    const kcalServing = parseNumber(nutr['energy-kcal_serving'])
    const energyServing = parseNumber(nutr['energy_serving'])
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
    let serving_size = product.serving_size || '1 serving'
    let basis: NormalizedFood['basis'] = 'per_serving'
    let energyUnit: NormalizedFood['energyUnit'] = kcalServing != null ? 'kcal' : energyServing != null ? 'kJ' : null
    const quantity_g = parseGramsFromLabel(serving_size) || null

    if (kcalServing != null || proteinServing != null || carbsServing != null || fatServing != null) {
      calories = kcalServing ?? energyServing ?? parseNumber(nutr['energy-kcal_100g'] ?? nutr['energy_100g'])
      protein_g = proteinServing ?? parseNumber(nutr['proteins_100g'])
      carbs_g = carbsServing ?? parseNumber(nutr['carbohydrates_100g'])
      fat_g = fatServing ?? parseNumber(nutr['fat_100g'])
      fiber_g = fiberServing ?? parseNumber(nutr['fiber_100g'])
      sugar_g = sugarServing ?? parseNumber(nutr['sugars_100g'])
      basis = 'per_serving'
    } else {
      // Use per 100g values
      calories = parseNumber(nutr['energy-kcal_100g'] ?? nutr['energy_100g'])
      protein_g = parseNumber(nutr['proteins_100g'])
      carbs_g = parseNumber(nutr['carbohydrates_100g'])
      fat_g = parseNumber(nutr['fat_100g'])
      fiber_g = parseNumber(nutr['fiber_100g'])
      sugar_g = parseNumber(nutr['sugars_100g'])
      serving_size = '100 g'
      basis = 'per_100g'
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
        basis,
        quantity_g,
        energyUnit,
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

    const servingSize =
      food.servingSize ? `${food.servingSize} ${food.servingSizeUnit || 'g'}` : '100 g'
    const quantity_g = parseGramsFromLabel(servingSize)
    const basis: NormalizedFood['basis'] = food.servingSize ? 'per_serving' : 'per_100g'

    return {
      source: 'usda',
      id: String(food.fdcId),
      name: food.description || productName,
      brand: food.brandName || food.brandOwner || null,
      serving_size: servingSize,
      calories: findNutrient('energy'),
      protein_g: findNutrient('protein'),
      carbs_g: findNutrient('carbohydrate'),
      fat_g: findNutrient('fat') ?? findNutrient('lipid'),
      fiber_g: findNutrient('fiber'),
      sugar_g: findNutrient('sugar'),
      barcode,
      basis,
      quantity_g,
      energyUnit: null,
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

  // Try Helfi cache first (user-labeled nutrition from barcode scans)
  food = await fetchFoodFromHelfiBarcode(code)

  // Try FatSecret first (best for packaged foods)
  if (!food) {
    food = await fetchFoodFromFatSecret(code)
  }

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
    console.log('[BARCODE_DEBUG] source payload', {
      source: food.source,
      serving_size: food.serving_size,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
      fiber_g: food.fiber_g,
      sugar_g: food.sugar_g,
      basis: food.basis || null,
      quantity_g: food.quantity_g || null,
      energyUnit: food.energyUnit || null,
    })

    const normalized = normalizeBarcodeFood(food)
    food = {
      ...food,
      ...normalized.food,
      source: food.source,
      serving_size: normalized.food.serving_size || food.serving_size || '1 serving',
      name: food.name || 'Scanned food',
      id: String(food.id || code),
    }

    const nutritionValues = [
      food.calories,
      food.protein_g,
      food.carbs_g,
      food.fat_g,
      food.fiber_g,
      food.sugar_g,
    ]
    const hasMeaningfulNutrition = nutritionValues.some((v) => Number.isFinite(Number(v)) && Number(v) > 0)
    if (!hasMeaningfulNutrition) {
      return NextResponse.json(
        {
          found: false,
          error: 'nutrition_missing',
          message: 'Product found, but nutrition data is missing. Please scan the nutrition label instead.',
          product: {
            name: food.name || null,
            brand: food.brand || null,
            serving_size: food.serving_size || null,
          },
          barcode: code,
        },
        { status: 422 },
      )
    }

    const discreteLog = summarizeDiscreteItemsForLog([food])
    if (discreteLog.length > 0) {
      console.log('[BARCODE_DEBUG] discrete normalization', discreteLog)
    }
    console.log('[BARCODE_DEBUG] normalized barcode payload', normalized.debug)

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
  
  return NextResponse.json(
    {
      found: false,
      message: 'No product found for this barcode. Try searching by product name instead.',
      barcode: code,
    },
    { status: 404 },
  )
}
