import { NextRequest, NextResponse } from 'next/server'

// FatSecret barcode lookup using client credentials.
// Returns a normalized food object or 404 when not found.

const FATSECRET_CLIENT_ID = process.env.FATSECRET_CLIENT_ID
const FATSECRET_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET

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
  servings?: { serving?: FatSecretServing[] }
}

const parseNumber = (val?: string | null): number | null => {
  if (!val) return null
  const num = parseFloat(val)
  return Number.isFinite(num) ? num : null
}

async function getAccessToken(): Promise<string | null> {
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    console.warn('FatSecret credentials missing for barcode lookup')
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

async function fetchFoodByBarcode(barcode: string) {
  const token = await getAccessToken()
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
      findData?.food?.[0]?.food_id // be defensive about shape

    if (!foodId) return null

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

    const servings = food.servings?.serving || []
    if (!Array.isArray(servings) || servings.length === 0) return null

    const preferred =
      servings.find(
        (s) =>
          s.measurement_description?.toLowerCase().includes('100 g') ||
          s.measurement_description?.toLowerCase().includes('serving'),
      ) || servings[0]

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
    }
  } catch (err) {
    console.warn('FatSecret barcode handler error', err)
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = (searchParams.get('code') || '').trim()
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    return NextResponse.json({ error: 'FatSecret not configured' }, { status: 503 })
  }

  const food = await fetchFoodByBarcode(code)
  if (!food) {
    return NextResponse.json({ found: false }, { status: 404 })
  }

  return NextResponse.json({ found: true, food })
}
