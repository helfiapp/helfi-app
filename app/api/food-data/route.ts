import { NextRequest, NextResponse } from 'next/server'
import { searchOpenFoodFactsByQuery, searchUsdaFoods } from '@/lib/food-data'

// Lightweight read-only endpoint that proxies to external food databases
// and returns a normalized list of items in a format compatible with the
// Food Diary `items[]` structure (name, brand, serving_size, macros).
//
// Query parameters:
// - source: "openfoodfacts" | "usda"
// - q: search query (product name, brand, or keywords)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const source = (searchParams.get('source') || '').toLowerCase()
    const query = (searchParams.get('q') || '').trim()

    if (!source || !query) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: source and q' },
        { status: 400 },
      )
    }

    let items: any[] = []

    if (source === 'openfoodfacts') {
      items = await searchOpenFoodFactsByQuery(query, { pageSize: 5 })
    } else if (source === 'usda') {
      items = await searchUsdaFoods(query, { pageSize: 5 })
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid source. Expected "openfoodfacts" or "usda".' },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true, source, items })
  } catch (error) {
    console.error('GET /api/food-data error', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch food data' }, { status: 500 })
  }
}


