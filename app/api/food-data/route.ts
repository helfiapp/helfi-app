export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { searchOpenFoodFactsByQuery, searchUsdaFoods, searchFatSecretFoods, lookupFoodNutrition, searchLocalFoods } from '@/lib/food-data'
import { prisma } from '@/lib/prisma'

let usdaHealthCache: { count: number | null; checkedAt: number } = { count: null, checkedAt: 0 }

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
    const localOnly = searchParams.get('localOnly') === '1'
    const limitRaw = searchParams.get('limit')
    const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : NaN
    const limit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 1), 50) : 20
    const kindMode = kind === 'packaged' ? 'packaged' : 'single'

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

    const getSearchTokens = (value: string) => normalizeForMatch(value).split(' ').filter(Boolean)

    const DESCRIPTOR_TOKENS = new Set([
      'raw',
      'fresh',
      'cooked',
      'uncooked',
      'frozen',
      'pasteurized',
      'pasteurised',
      'boiled',
      'baked',
      'roasted',
      'fried',
      'grilled',
      'steamed',
      'sauteed',
      'smoked',
      'dried',
    ])

    const nameMatchesSearchQuery = (name: string, searchQuery: string) => {
      // Ignore 1-letter tokens so "art" does not match "Bartlett" via "t".
      const rawTokens = getSearchTokens(searchQuery).filter((token) => token.length >= 2)
      const filteredTokens = rawTokens.filter((token) => !DESCRIPTOR_TOKENS.has(token))
      const queryTokens = filteredTokens.length > 0 ? filteredTokens : rawTokens
      const nameTokens = getSearchTokens(name).filter((token) => token.length >= 2)
      if (queryTokens.length === 0 || nameTokens.length === 0) return false
      const tokenMatches = (token: string, word: string) => {
        if (!token || !word) return false
        if (word.startsWith(token)) return true
        if (word.length >= 2 && token.startsWith(word)) return true
        const singular = singularizeToken(token)
        if (singular !== token && word.startsWith(singular)) return true
        if (singular !== token && singular.startsWith(word)) return true
        if (token.length >= 4 && word.includes(token)) return true
        if (singular.length >= 4 && word.includes(singular)) return true
        if (word.length >= 4 && token.includes(word)) return true
        return false
      }
      if (queryTokens.length === 1) return nameTokens.some((word) => tokenMatches(queryTokens[0], word))
      return queryTokens.every((token) => nameTokens.some((word) => tokenMatches(token, word)))
    }

    type CustomPackagedItem = {
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
      source: 'openfoodfacts' | 'usda' | 'fatsecret'
      aliases?: string[]
    }

    const CUSTOM_PACKAGED_ITEMS: CustomPackagedItem[] = [
      {
        id: 'custom:burger-with-the-lot',
        name: 'Burger with the lot (fish & chip shop)',
        brand: null,
        serving_size: '1 burger',
        calories: 950,
        protein_g: 44,
        carbs_g: 72,
        fat_g: 62,
        fiber_g: 6.5,
        sugar_g: 16,
        source: 'openfoodfacts',
        aliases: ['burger with the lot', 'burger with lot', 'fish and chip shop burger', 'fish & chip shop burger'],
      },
    ]

    const getCustomPackagedMatches = (value: string) => {
      if (!value) return []
      return CUSTOM_PACKAGED_ITEMS.filter((item) => {
        if (nameMatchesSearchQuery(item.name, value)) return true
        const aliases = Array.isArray(item.aliases) ? item.aliases : []
        return aliases.some((alias) => nameMatchesSearchQuery(alias, value))
      }).map((item) => {
        const { aliases, ...rest } = item
        return rest
      })
    }

    const mergeCustomPackagedMatches = (list: any[], custom: any[]) => {
      if (!Array.isArray(custom) || custom.length === 0) return list
      const seen = new Set<string>()
      const merged: any[] = []
      const add = (item: any) => {
        const key = `${normalizeForMatch(item?.name)}|${normalizeForMatch(item?.brand)}`
        if (!key || key === '|') return
        if (seen.has(key)) return
        seen.add(key)
        merged.push(item)
      }
      custom.forEach(add)
      list.forEach(add)
      return merged
    }

    const queryNorm = normalizeForMatch(query)
    const queryCompact = normalizeForCompact(query)
    const queryTokens = queryNorm ? queryNorm.split(' ').filter(Boolean) : []
    const queryTokensNormalized = queryTokens.map((token) => singularizeToken(token))
    const queryFirstToken = queryTokens[0] || ''
    const customPackagedMatches = kindMode === 'packaged' ? getCustomPackagedMatches(query) : []
    let customPackagedApplied = false

    const hasMacroData = (item: any) => {
      if (!item) return false
      const calories = item?.calories
      const protein = item?.protein_g
      const carbs = item?.carbs_g
      const fat = item?.fat_g
      const hasCalories = calories !== null && calories !== undefined && Number.isFinite(Number(calories))
      const hasProtein = protein !== null && protein !== undefined && Number.isFinite(Number(protein))
      const hasCarbs = carbs !== null && carbs !== undefined && Number.isFinite(Number(carbs))
      const hasFat = fat !== null && fat !== undefined && Number.isFinite(Number(fat))
      return hasCalories && hasProtein && hasCarbs && hasFat
    }

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
      const nameTokens = n.split(' ').filter(Boolean)
      const scoredTokens = queryTokensNormalized.filter((token) => token.length >= 2)
      const coreTokens = scoredTokens.filter((token) => !DESCRIPTOR_TOKENS.has(token))
      if (scoredTokens.length > 0) {
        const exactMatches = new Set<string>()
        const prefixMatches = new Set<string>()
        for (const token of scoredTokens) {
          if (nameTokens.includes(token)) {
            exactMatches.add(token)
            continue
          }
          if (nameTokens.some((word) => word.startsWith(token))) {
            prefixMatches.add(token)
          }
        }
        if (exactMatches.size > 0) return 520 + exactMatches.size * 120
        if (prefixMatches.size > 0) {
          let score = 360 + prefixMatches.size * 40
          if (coreTokens.length > 0) {
            const exactCoreMatches = coreTokens.filter((token) => nameTokens.includes(token))
            if (exactCoreMatches.length === 0) score -= 200
          }
          return score
        }
      }
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
      if (kindMode === 'single') {
        score += it?.brand ? -40 : 120
      } else if (it?.brand) {
        score += 40
      }
      const nameNorm = normalizeForMatch(it?.name)
      if (nameNorm) score += Math.max(0, 80 - Math.min(80, nameNorm.length))
      const brandToken = normalizeForMatch(queryFirstToken)
      if (brandToken) {
        const brand = normalizeForMatch(it?.brand)
        const name = normalizeForMatch(it?.name)
        if (brand && brand === brandToken) score += 220
        if (brand && brand.startsWith(brandToken)) score += 180
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
        const base = parts.join(' ')
        const raw = `${base} raw`
        const rawComma = `${base}, raw`
        const cooked = `${base} cooked`
        const cookedComma = `${base}, cooked`
        candidates.add(raw)
        candidates.add(rawComma)
        candidates.add(cooked)
        candidates.add(cookedComma)
      }

      return Array.from(candidates).filter((q) => q.toLowerCase() !== original.toLowerCase())
    }

    // LOCKED: Single-food search must use the local USDA library (foodLibraryItem) only.
    // Do not swap back to the external USDA API. See GUARD_RAILS.md for restore steps.
    const checkUsdaLibraryHealth = async () => {
      const now = Date.now()
      if (now - usdaHealthCache.checkedAt < 10 * 60 * 1000 && usdaHealthCache.count != null) return usdaHealthCache.count
      const count = await prisma.foodLibraryItem.count({ where: { source: { in: ['usda_foundation', 'usda_sr_legacy', 'usda_branded'] } } })
      usdaHealthCache = { count, checkedAt: now }
      return count
    }

    const searchUsdaSingleFood = async (value: string) => {
      const sources = ['usda_foundation', 'usda_sr_legacy', 'usda_branded']
      const attempt = async (q: string) => {
        if (!q) return []
        return await searchLocalFoods(q, { pageSize: limit, sources })
      }

      const primary = await attempt(value)
      if (primary.length > 0) return primary

      const fallbacks = buildSingleFoodFallbacks(value)
      for (const fallback of fallbacks) {
        const next = await attempt(fallback)
        if (next.length > 0) return next
      }

      const libraryCount = await checkUsdaLibraryHealth()
      if (libraryCount < 100000) {
        console.warn(`USDA library looks thin (${libraryCount} rows). Consider re-importing USDA data.`)
      }
      // As a last resort, hit USDA API so users still get results if the local library is empty.
      const remote = await searchUsdaFoods(value, { pageSize: limit, dataType: 'generic' })
      if (remote.length > 0) return remote
      for (const fallback of fallbacks) {
        const remoteNext = await searchUsdaFoods(fallback, { pageSize: limit, dataType: 'generic' })
        if (remoteNext.length > 0) return remoteNext
      }
      return []
    }

    const searchLocalPreferred = async (value: string, resolvedKind: 'packaged' | 'single') => {
      if (!value) return []
      if (resolvedKind === 'packaged') {
        return await searchLocalFoods(value, { pageSize: limit, sources: ['usda_branded'], mode: 'prefix' })
      }
      const [foundation, legacy, branded] = await Promise.all([
        searchLocalFoods(value, { pageSize: limit, sources: ['usda_foundation'] }),
        searchLocalFoods(value, { pageSize: limit, sources: ['usda_sr_legacy'] }),
        searchLocalFoods(value, { pageSize: limit, sources: ['usda_branded'] }),
      ])

      const combined = [...foundation, ...legacy, ...branded]
      const seen = new Set<string>()
      const deduped = combined.filter((item) => {
        const key = `${normalizeForMatch(item?.name)}|${normalizeForMatch(item?.brand)}`
        if (!key || key === '|') return false
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      const filtered = deduped.filter((item) => nameMatchesSearchQuery(item?.name || '', value))
      return (filtered.length > 0 ? filtered : deduped).slice(0, limit)
    }

    if (source === 'auto' || !source) {
      const resolvedKind = kind === 'packaged' ? 'packaged' : 'single'

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

      const restaurantKeywords = [
        'mcdonald',
        'mcdonalds',
        'burger king',
        'kfc',
        'subway',
        'domino',
        'pizza hut',
        'starbucks',
        'dunkin',
        'taco bell',
        'wendy',
        'popeyes',
        'chipotle',
        'panera',
        'chick fil',
        'chick-fil',
        'five guys',
        'in n out',
        'innout',
        'jack in the box',
        'carls jr',
        'hardees',
        'shake shack',
        'arby',
        'dairy queen',
        'white castle',
      ]
      const isRestaurantQuery = restaurantKeywords.some((keyword) => queryNorm.includes(keyword))

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
        if (typeof grams === 'number' && Number.isFinite(grams) && grams >= 120) return true
        if (hasMealWord && typeof grams === 'number' && Number.isFinite(grams) && grams >= 90) return true
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

      const localItems = resolvedKind === 'single' ? await searchLocalPreferred(query, resolvedKind) : []
      if (resolvedKind === 'single' && localItems.length > 0) {
        items = [...localItems].sort((a, b) => scoreItem(b) - scoreItem(a)).slice(0, limit)
        actualSource = 'auto'
      } else if (resolvedKind === 'single') {
        items = await searchUsdaSingleFood(query)
        actualSource = 'usda'
      } else {
        const perSource = Math.min(Math.max(limit, 10), 25)

        const normalized = (value: any) => String(value || '').trim().toLowerCase()
        const dedupe = (list: any[]) => {
          const byNameBrand = new Map<string, any>()
          list
            .sort((a, b) => scoreItem(b) - scoreItem(a))
            .forEach((it) => {
              const key = `${normalized(it?.name)}|${normalized(it?.brand)}`
              if (!key || key === '|') return
              if (!byNameBrand.has(key)) byNameBrand.set(key, it)
            })
          return Array.from(byNameBrand.values())
        }

        const buildCompactFoodQuery = (value: string) => {
          const normalized = normalizeForMatch(value)
          if (!normalized) return null
          const compacted = normalized.replace(/\bcheese burger\b/g, 'cheeseburger')
          return compacted !== normalized ? compacted : null
        }

        const fetchExternalPool = async () => {
          const fetchForQuery = async (value: string) => {
            const [off, fat] = await Promise.all([
              searchOpenFoodFactsByQuery(value, { pageSize: perSource }),
              searchFatSecretFoods(value, { pageSize: perSource }),
            ])
            return dedupe([...off, ...fat])
          }

          const primary = await fetchForQuery(query)
          if (primary.length > 0) return primary
          const compactQuery = buildCompactFoodQuery(query)
          if (!compactQuery) return primary
          return await fetchForQuery(compactQuery)
        }

        if (isRestaurantQuery) {
          const pooled = await fetchExternalPool()
          items = pooled.slice(0, limit)
          actualSource = 'auto'
        } else {
          const localPackaged = await searchLocalPreferred(query, 'packaged')
          const localPackagedFiltered = localPackaged.filter((item) => {
            const combined = [item?.brand, item?.name].filter(Boolean).join(' ')
            return nameMatchesSearchQuery(combined || item?.name || '', query)
          })
          const minLocalOnly = 5
          const pooled = localPackagedFiltered.length < minLocalOnly ? await fetchExternalPool() : []
          const combined = dedupe([...localPackagedFiltered, ...pooled])
          const combinedWithCustom =
            customPackagedMatches.length > 0 ? mergeCustomPackagedMatches(combined, customPackagedMatches) : combined
          items = combinedWithCustom.sort((a, b) => scoreItem(b) - scoreItem(a)).slice(0, limit)
          actualSource = 'auto'
          customPackagedApplied = customPackagedMatches.length > 0
        }
      }
    } else if (source === 'openfoodfacts') {
      items = await searchOpenFoodFactsByQuery(query, { pageSize: limit })
    } else if (source === 'usda') {
      const resolvedKind = kind === 'packaged' ? 'packaged' : 'single'
      const localItems = await searchLocalPreferred(query, resolvedKind)
      if (localItems.length > 0) {
        items = localItems
        actualSource = 'usda'
      } else if (localOnly) {
        items = []
        actualSource = 'usda'
      } else {
        const dataType = resolvedKind === 'packaged' ? 'all' : 'generic'
        if (resolvedKind !== 'packaged') {
          items = await searchUsdaSingleFood(query)
        } else {
          const remote = await searchUsdaFoods(query, { pageSize: limit, dataType })
          items = remote
        }
      }
    } else if (source === 'fatsecret') {
      items = await searchFatSecretFoods(query, { pageSize: limit })
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid source. Expected "openfoodfacts", "usda", "fatsecret", or "auto".' },
        { status: 400 },
      )
    }

    if (kindMode === 'packaged' && customPackagedMatches.length > 0 && !customPackagedApplied) {
      items = mergeCustomPackagedMatches(items, customPackagedMatches)
    }

    if (Array.isArray(items) && items.length > 0) {
      const filtered = items.filter((item) => hasMacroData(item))
      items = filtered
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
