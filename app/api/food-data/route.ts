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

    const queryNorm = normalizeForMatch(query)
    const queryCompact = normalizeForCompact(query)
    const queryTokens = queryNorm ? queryNorm.split(' ').filter(Boolean) : []
    const queryTokensNormalized = queryTokens.map((token) => singularizeToken(token))
    const queryFirstToken = queryTokens[0] || ''

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
        if (hitCount === queryTokens.length) return 420
        return hitCount * 40
      }
      return 0
    }

    const scoreItemName = (it: any) => {
      const combined = [it?.brand, it?.name].filter(Boolean).join(' ').trim()
      let score = scoreNameMatch(combined || it?.name)
      const brandToken = normalizeForMatch(queryFirstToken)
      if (brandToken) {
        const brand = normalizeForMatch(it?.brand)
        const name = normalizeForMatch(it?.name)
        if (brand && brand === brandToken) score += 220
        if (name && name.startsWith(brandToken)) score += 160
        if (brand && name && name.startsWith(brand)) score += 120
      }
      return score
    }

    const cleanSingleFoodQuery = (value: string) =>
      value
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const buildSingleFoodFallbacks = (value: string) => {
      const original = value.trim()
      if (!original) return []
      const cleaned = cleanSingleFoodQuery(original)
      const candidates = new Set<string>()
      if (cleaned && cleaned.toLowerCase() !== original.toLowerCase()) candidates.add(cleaned)

      const parts = cleaned.split(' ').filter(Boolean)
      if (parts.length > 0) {
        const last = parts[parts.length - 1]
        const singular = singularizeToken(last)
        if (singular && singular !== last) {
          const updated = [...parts]
          updated[updated.length - 1] = singular
          candidates.add(updated.join(' '))
        }
      }

      return Array.from(candidates).filter((q) => q.toLowerCase() !== original.toLowerCase())
    }

    const filterGenericUsda = (list: any[]) =>
      Array.isArray(list) ? list.filter((item) => !item?.brand) : []

    const searchUsdaSingleFood = async (value: string) => {
      const primaryAll = await searchUsdaFoods(value, { pageSize: limit, dataType: 'all' })
      const primary = filterGenericUsda(primaryAll)
      if (primary.length > 0) return primary
      const fallbacks = buildSingleFoodFallbacks(value)
      for (const fallback of fallbacks) {
        const nextAll = await searchUsdaFoods(fallback, { pageSize: limit, dataType: 'all' })
        const next = filterGenericUsda(nextAll)
        if (next.length > 0) return next
      }
      return []
    }

    if (source === 'auto' || !source) {
      const resolvedKind = kind === 'packaged' ? 'packaged' : 'single'
      const usdaDataType = resolvedKind === 'packaged' ? 'all' : 'generic'

      const scoredServing = (serving: string | null | undefined, calories?: number | null) => {
        const s = (serving || '').toLowerCase()
        if (!s) return 0
        let score = 1
        // Prefer real package servings over "100 g" defaults.
        if (s.includes('100 g') || s.includes('100g')) score -= isMealQuery ? 8 : 5
        if (s.includes('serving')) score += 2
        if (
          s.includes('piece') ||
          s.includes('biscuit') ||
          s.includes('cookie') ||
          s.includes('slice') ||
          s.includes('pack') ||
          s.includes('packet') ||
          s.includes('each')
        ) {
          score += 3
        }
        if (isMealQuery) {
          if (
            s.includes('kebab') ||
            s.includes('kebap') ||
            s.includes('shawarma') ||
            s.includes('doner') ||
            s.includes('gyro') ||
            s.includes('burger') ||
            s.includes('wrap') ||
            s.includes('burrito') ||
            s.includes('taco') ||
            s.includes('pizza') ||
            s.includes('sandwich') ||
            s.includes('roll') ||
            s.includes('sub') ||
            s.includes('pita')
          ) {
            score += 4
          }
          const cal = Number(calories)
          if (Number.isFinite(cal)) {
            if (cal >= 250 && cal <= 1200) score += 3
            if (cal > 0 && cal < 150) score -= 5
          }
        }
        return score
      }

      const parseServingGrams = (serving: any) => {
        const raw = String(serving || '').toLowerCase()
        const match = raw.match(/(\d+(?:\.\d+)?)\s*g\b/)
        if (!match) return null
        const grams = Number(match[1])
        return Number.isFinite(grams) ? grams : null
      }

      const mealKeywords = [
        'kebab',
        'kebap',
        'shawarma',
        'doner',
        'gyro',
        'burger',
        'wrap',
        'burrito',
        'taco',
        'pizza',
        'sandwich',
        'roll',
        'sub',
        'pita',
        'meal',
        'combo',
      ]
      const isMealQuery = queryTokensNormalized.some((token) => mealKeywords.includes(token))

      const isLikelyFullMeal = (it: any) => {
        const servingText = String(it?.serving_size || '').toLowerCase()
        const grams = parseServingGrams(it?.serving_size)
        const calories = Number(it?.calories)
        const hasMealWord =
          servingText.includes('kebab') ||
          servingText.includes('kebap') ||
          servingText.includes('shawarma') ||
          servingText.includes('doner') ||
          servingText.includes('gyro') ||
          servingText.includes('burger') ||
          servingText.includes('wrap') ||
          servingText.includes('burrito') ||
          servingText.includes('taco') ||
          servingText.includes('pizza') ||
          servingText.includes('sandwich') ||
          servingText.includes('roll') ||
          servingText.includes('sub') ||
          servingText.includes('pita')
        if (Number.isFinite(grams) && grams >= 120) return true
        if (hasMealWord && Number.isFinite(grams) && grams >= 90) return true
        if (Number.isFinite(calories) && calories >= 250) return true
        return false
      }

    const scoreItem = (it: any) => {
      let score = 0
      score += scoreItemName(it)
      if (it?.source === 'usda') score += 4
      if (it?.source === 'fatsecret') score += isMealQuery ? 6 : 2
      if (it?.source === 'openfoodfacts') score += 1
      if (it?.brand) score += 2
      if (Number.isFinite(Number(it?.calories)) && Number(it.calories) > 0) score += 1
      score += scoredServing(it?.serving_size, it?.calories)
      if (isMealQuery) {
        const grams = parseServingGrams(it?.serving_size)
        if (typeof grams === 'number' && Number.isFinite(grams)) {
          if (grams >= 150 && grams <= 600) score += 6
          if (grams >= 90 && grams < 150) score += 2
          if (grams > 0 && grams < 80) score -= 6
        }
        if (it?.source === 'openfoodfacts' && typeof grams === 'number' && grams < 80) score -= 4
        if (it?.source === 'usda' && it?.brand) score += 2
        if (Number.isFinite(Number(it?.calories)) && Number(it.calories) < 150) score -= 4
      }
      return score
    }

      if (resolvedKind === 'single') {
        items = await searchUsdaSingleFood(query)
        actualSource = 'usda'
        if (items.length === 0) {
          const perSource = Math.min(Math.max(Math.ceil(limit / 2), 10), 25)
          const results = await Promise.allSettled([
            searchFatSecretFoods(query, { pageSize: perSource }),
            searchOpenFoodFactsByQuery(query, { pageSize: perSource }),
          ])
          const pooled: any[] = []
          for (const res of results) {
            if (res.status === 'fulfilled' && Array.isArray(res.value)) {
              pooled.push(...res.value)
            }
          }
          if (pooled.length > 0) {
            items = pooled.sort((a, b) => scoreItem(b) - scoreItem(a)).slice(0, limit)
            actualSource = 'auto'
          }
        }
      } else {
        const perSource = Math.min(Math.max(Math.ceil(limit / 2), 10), 25)

        const requests =
          resolvedKind === 'packaged'
            ? [
                searchFatSecretFoods(query, { pageSize: perSource }),
                searchOpenFoodFactsByQuery(query, { pageSize: perSource }),
              ]
            : [
                searchUsdaFoods(query, { pageSize: perSource, dataType: usdaDataType }),
                searchFatSecretFoods(query, { pageSize: perSource }),
                searchOpenFoodFactsByQuery(query, { pageSize: perSource }),
              ]

        const results = await Promise.allSettled(requests)

        const pooled: any[] = []
        for (const res of results) {
          if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            pooled.push(...res.value)
          }
        }

        if (resolvedKind === 'packaged' && isMealQuery) {
          const hasFullMeal = pooled.some((it) => isLikelyFullMeal(it))
          if (!hasFullMeal) {
            const usdaBoost = await searchUsdaFoods(query, { pageSize: perSource, dataType: 'branded' })
            pooled.push(...usdaBoost)
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

        if (items.length === 0) {
          // Fallback: if packaged sources return nothing, try USDA so users still get results.
          items = await searchUsdaFoods(query, { pageSize: limit, dataType: 'all' })
        }
      }
    } else if (source === 'openfoodfacts') {
      items = await searchOpenFoodFactsByQuery(query, { pageSize: limit })
    } else if (source === 'usda') {
      const dataType =
        kind === 'packaged' ? 'all' : kind === 'single' ? 'generic' : 'all'
      if (kind !== 'packaged') {
        items = await searchUsdaSingleFood(query)
      } else {
        items = await searchUsdaFoods(query, { pageSize: limit, dataType })
      }
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
      items = [...items].sort((a, b) => scoreItemName(b) - scoreItemName(a))
    }

    return NextResponse.json({ success: true, source: actualSource, items })
  } catch (error) {
    console.error('GET /api/food-data error', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch food data' }, { status: 500 })
  }
}
