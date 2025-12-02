export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { searchOpenFoodFactsByQuery, searchUsdaFoods, searchFatSecretFoods, lookupFoodNutrition } from '@/lib/food-data'

// Lightweight read-only endpoint that proxies to external food databases
// and returns a normalized list of items in a format compatible with the
// Food Diary `items[]` structure (name, brand, serving_size, macros).
//
// Query parameters:
// - source: "openfoodfacts" | "usda" | "fatsecret" | "auto" (tries all with fallback)
// - q: search query (product name, brand, or keywords)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const source = (searchParams.get('source') || '').toLowerCase()
    const query = (searchParams.get('q') || '').trim()
    const kind = (searchParams.get('kind') || '').toLowerCase()

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: q' },
        { status: 400 },
      )
    }

    let items: any[] = []
    let actualSource = source

    if (source === 'auto' || !source) {
      const usdaDataType =
        kind === 'packaged' ? 'branded' : kind === 'single' ? 'generic' : 'all'
      // Auto mode: try all sources with fallback
      items = await lookupFoodNutrition(query, {
        preferSource: 'usda',
        maxResults: 5,
        usdaDataType,
      })
      actualSource = items.length > 0 ? items[0].source : 'none'
    } else if (source === 'openfoodfacts') {
      items = await searchOpenFoodFactsByQuery(query, { pageSize: 5 })
    } else if (source === 'usda') {
      const dataType =
        kind === 'packaged' ? 'branded' : kind === 'single' ? 'generic' : 'all'
      items = await searchUsdaFoods(query, { pageSize: 5, dataType })
    } else if (source === 'fatsecret') {
      items = await searchFatSecretFoods(query, { pageSize: 5 })
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid source. Expected "openfoodfacts", "usda", "fatsecret", or "auto".' },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true, source: actualSource, items })
  } catch (error) {
    console.error('GET /api/food-data error', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch food data' }, { status: 500 })
  }
}
