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
    const limitRaw = searchParams.get('limit')
    const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : NaN
    const limit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 1), 50) : 20

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: q' },
        { status: 400 },
      )
    }

    let items: any[] = []
    let actualSource = source

    const normalizeForMatch = (value: any) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')

    const normalizeForCompact = (value: any) => normalizeForMatch(value).replace(/\s+/g, '')

    const queryNorm = normalizeForMatch(query)
    const queryCompact = normalizeForCompact(query)
    const queryTokens = queryNorm ? queryNorm.split(' ').filter(Boolean) : []

    const scoreNameMatch = (name: any) => {
      if (!queryNorm) return 0
      const n = normalizeForMatch(name)
      const nCompact = normalizeForCompact(name)
      if (!n) return 0
      if (nCompact === queryCompact) return 1200
      if (nCompact.startsWith(queryCompact)) return 1000
      if (n === queryNorm) return 900
      if (n.startsWith(queryNorm)) return 750
      if (nCompact.includes(queryCompact)) return 600
      if (n.includes(queryNorm)) return 500
      if (queryTokens.length > 0) {
        const hitCount = queryTokens.filter((t) => n.includes(t)).length
        if (hitCount === queryTokens.length) return 350
        return hitCount * 40
      }
      return 0
    }

    if (source === 'auto' || !source) {
      const usdaDataType =
        kind === 'packaged' ? 'branded' : kind === 'single' ? 'generic' : 'all'

      const perSource = Math.min(Math.max(Math.ceil(limit / 2), 10), 25)

      const scoredServing = (serving: string | null | undefined) => {
        const s = (serving || '').toLowerCase()
        if (!s) return 0
        // Prefer real package servings over "100 g" defaults.
        if (s.includes('100 g') || s.includes('100g')) return -5
        if (s.includes('serving')) return 2
        if (s.includes('piece') || s.includes('biscuit') || s.includes('cookie') || s.includes('slice')) return 3
        return 1
      }

      const scoreItem = (it: any) => {
        let score = 0
        score += scoreNameMatch(it?.name)
        if (it?.source === 'usda') score += 4
        if (it?.source === 'fatsecret') score += 2
        if (it?.source === 'openfoodfacts') score += 1
        if (it?.brand) score += 2
        if (Number.isFinite(Number(it?.calories)) && Number(it.calories) > 0) score += 1
        score += scoredServing(it?.serving_size)
        return score
      }

      const [usdaRes, fatRes, offRes] = await Promise.allSettled([
        searchUsdaFoods(query, { pageSize: perSource, dataType: usdaDataType }),
        searchFatSecretFoods(query, { pageSize: perSource }),
        searchOpenFoodFactsByQuery(query, { pageSize: perSource }),
      ])

      const pooled: any[] = []
      for (const res of [usdaRes, fatRes, offRes]) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          pooled.push(...res.value)
        }
      }

      // De-dupe by (name + brand) to avoid showing the same item multiple times across sources.
      const normalized = (value: any) => String(value || '').trim().toLowerCase()
      const byNameBrand = new Map<string, any>()
      pooled
        .sort((a, b) => scoreItem(b) - scoreItem(a))
        .forEach((it) => {
          const key = `${normalized(it?.name)}|${normalized(it?.brand)}`
          if (!key || key === '|') return
          if (!byNameBrand.has(key)) byNameBrand.set(key, it)
        })

      items = Array.from(byNameBrand.values()).slice(0, limit)
      actualSource = 'auto'
    } else if (source === 'openfoodfacts') {
      items = await searchOpenFoodFactsByQuery(query, { pageSize: limit })
    } else if (source === 'usda') {
      const dataType =
        kind === 'packaged' ? 'branded' : kind === 'single' ? 'generic' : 'all'
      items = await searchUsdaFoods(query, { pageSize: limit, dataType })
    } else if (source === 'fatsecret') {
      items = await searchFatSecretFoods(query, { pageSize: limit })
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid source. Expected "openfoodfacts", "usda", "fatsecret", or "auto".' },
        { status: 400 },
      )
    }

    // For non-auto sources, apply the same name-match ranking so exact matches come first.
    if (actualSource !== 'auto' && Array.isArray(items) && items.length > 1) {
      items = [...items].sort((a, b) => scoreNameMatch(b?.name) - scoreNameMatch(a?.name))
    }

    return NextResponse.json({ success: true, source: actualSource, items })
  } catch (error) {
    console.error('GET /api/food-data error', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch food data' }, { status: 500 })
  }
}
