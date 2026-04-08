export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

import { fetchUsdaServingOptions, searchLocalFoods } from '@/lib/food-data'

type SizeUnit =
  | 'piece-small'
  | 'piece-medium'
  | 'piece-large'
  | 'piece-extra-large'
  | 'egg-small'
  | 'egg-medium'
  | 'egg-large'
  | 'egg-extra-large'

type SizeUnitGrams = Partial<Record<SizeUnit, number>>
type MatchedItem = {
  source: 'usda'
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
type SizeLookupResponse = {
  unitGrams: SizeUnitGrams
  matchedItem: MatchedItem | null
}

const cache = new Map<string, SizeLookupResponse>()

const singularizeToken = (value: string) => {
  const lower = String(value || '').toLowerCase()
  if (!lower) return lower
  if (lower.endsWith('ies') && lower.length > 4) return `${lower.slice(0, -3)}y`
  if (
    lower.endsWith('es') &&
    lower.length > 3 &&
    !lower.endsWith('ses') &&
    !lower.endsWith('xes') &&
    !lower.endsWith('zes') &&
    !lower.endsWith('ches') &&
    !lower.endsWith('shes')
  ) {
    return lower.slice(0, -2)
  }
  if (lower.endsWith('s') && lower.length > 3 && !lower.endsWith('ss')) return lower.slice(0, -1)
  return lower
}

const normalizeText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const getTokens = (value: string) =>
  normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .map((token) => singularizeToken(token))

const EGG_BLOCKLIST = new Set([
  'white',
  'yolk',
  'eggplant',
  'nog',
  'noodle',
  'pasta',
  'salad',
  'sandwich',
  'wrap',
  'burrito',
  'taco',
  'pizza',
  'burger',
  'muffin',
  'bagel',
  'roll',
  'cake',
  'cookie',
  'pancake',
  'waffle',
  'rice',
  'protein',
  'powder',
  'substitute',
  'mix',
])

const isEggFood = (name: string) => {
  const tokens = getTokens(name)
  if (!tokens.includes('egg')) return false
  return tokens.every((token) => !EGG_BLOCKLIST.has(token))
}

const hasPositive = (value: number | null | undefined) => Number.isFinite(Number(value)) && Number(value) > 0

const scoreCandidate = (candidateName: string, requestedName: string) => {
  const candidateNorm = normalizeText(candidateName)
  const requestedNorm = normalizeText(requestedName)
  if (!candidateNorm || !requestedNorm) return 0
  if (candidateNorm === requestedNorm) return 2000
  if (candidateNorm.startsWith(requestedNorm)) return 1600

  const candidateTokens = getTokens(candidateName)
  const requestedTokens = getTokens(requestedName)
  let score = 0
  requestedTokens.forEach((token) => {
    if (candidateTokens.includes(token)) {
      score += 200
      return
    }
    if (candidateTokens.some((word) => word.startsWith(token))) score += 120
  })
  if (candidateNorm.includes(requestedNorm)) score += 160
  return score
}

const detectSizeUnit = (labelBase: string, eggFood: boolean): SizeUnit | null => {
  const lower = normalizeText(labelBase)
  if (!lower) return null
  if (
    lower.includes('cup') ||
    lower.includes('tablespoon') ||
    lower.includes('teaspoon') ||
    /\btbsp\b/.test(lower) ||
    /\btsp\b/.test(lower) ||
    /\boz\b/.test(lower) ||
    lower.includes('ounce') ||
    lower.includes('serving') ||
    lower.includes('portion') ||
    lower.includes('slice') ||
    lower.includes('wedge')
  ) {
    return null
  }

  const prefix = eggFood ? 'egg' : 'piece'
  if (/\b(extra large|extra-large|jumbo|xl)\b/.test(lower)) return `${prefix}-extra-large` as SizeUnit
  if (/\bsmall\b/.test(lower)) return `${prefix}-small` as SizeUnit
  if (/\bmedium\b/.test(lower)) return `${prefix}-medium` as SizeUnit
  if (/\blarge\b/.test(lower)) return `${prefix}-large` as SizeUnit
  return null
}

const mapServingOptionsToSizeUnits = (
  name: string,
  options: Array<{ label?: string; serving_size?: string; grams?: number | null }>,
): SizeUnitGrams => {
  const unitGrams: SizeUnitGrams = {}
  const eggFood = isEggFood(name)

  options.forEach((option) => {
    const grams = Number(option?.grams ?? 0)
    if (!Number.isFinite(grams) || grams <= 0) return

    const label = String(option?.label || option?.serving_size || '').trim()
    if (!label) return
    const labelBase = label.split('—')[0]?.trim() || label
    const unit = detectSizeUnit(labelBase, eggFood)
    if (!unit) return

    const current = Number(unitGrams[unit] ?? 0)
    if (!Number.isFinite(current) || current <= 0 || grams > current) {
      unitGrams[unit] = Math.round(grams * 10) / 10
    }
  })

  const extraLargeUnit = eggFood ? 'egg-extra-large' : 'piece-extra-large'
  const largeUnit = eggFood ? 'egg-large' : 'piece-large'
  const mediumUnit = eggFood ? 'egg-medium' : 'piece-medium'
  const smallUnit = eggFood ? 'egg-small' : 'piece-small'

  if (!hasPositive(unitGrams[extraLargeUnit]) && hasPositive(unitGrams[largeUnit]) && hasPositive(unitGrams[mediumUnit])) {
    unitGrams[extraLargeUnit] = Math.round((Number(unitGrams[largeUnit]) + (Number(unitGrams[largeUnit]) - Number(unitGrams[mediumUnit]))) * 10) / 10
  } else if (
    !hasPositive(unitGrams[extraLargeUnit]) &&
    hasPositive(unitGrams[largeUnit]) &&
    hasPositive(unitGrams[smallUnit])
  ) {
    unitGrams[extraLargeUnit] =
      Math.round((Number(unitGrams[largeUnit]) + (Number(unitGrams[largeUnit]) - Number(unitGrams[smallUnit])) / 2) * 10) /
      10
  }

  return unitGrams
}

const findBestUsdaItemForName = async (name: string): Promise<MatchedItem | null> => {
  const matches = await searchLocalFoods(name, {
    pageSize: 20,
    sources: ['usda_foundation', 'usda_sr_legacy'],
    mode: 'prefix-contains',
  })
  if (!Array.isArray(matches) || matches.length === 0) return null

  let best = matches[0] || null
  let bestScore = best ? scoreCandidate(best.name, name) : 0
  matches.slice(1).forEach((candidate) => {
    const score = scoreCandidate(candidate.name, name)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  })
  if (!best?.id) return null
  return {
    source: 'usda',
    id: String(best.id),
    name: String(best.name || '').trim(),
    brand: best.brand ?? null,
    serving_size: best.serving_size ?? null,
    calories: best.calories ?? null,
    protein_g: best.protein_g ?? null,
    carbs_g: best.carbs_g ?? null,
    fat_g: best.fat_g ?? null,
    fiber_g: best.fiber_g ?? null,
    sugar_g: best.sugar_g ?? null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const name = String(searchParams.get('name') || '').trim()
    const source = String(searchParams.get('source') || '').trim().toLowerCase()
    const id = String(searchParams.get('id') || '').trim()

    if (!name) {
      return NextResponse.json({ success: false, error: 'Missing required parameter: name' }, { status: 400 })
    }

    const cacheKey = `${source}:${id}:${normalizeText(name)}`
    const cached = cache.get(cacheKey)
    if (cached) {
      return NextResponse.json({ success: true, ...cached })
    }

    let matchedItem: MatchedItem | null = source === 'usda' && id ? { source: 'usda', id, name } : null
    if (!matchedItem) matchedItem = await findBestUsdaItemForName(name)
    const usdaId = matchedItem?.id ? String(matchedItem.id) : null

    if (!usdaId) {
      const emptyResponse = { unitGrams: {}, matchedItem: null }
      cache.set(cacheKey, emptyResponse)
      return NextResponse.json({ success: true, ...emptyResponse })
    }

    const options = await fetchUsdaServingOptions(usdaId)
    const unitGrams = mapServingOptionsToSizeUnits(name, options)
    const response = {
      unitGrams,
      matchedItem: Object.keys(unitGrams).length > 0 ? matchedItem : null,
    }
    cache.set(cacheKey, response)
    return NextResponse.json({ success: true, ...response })
  } catch (error) {
    console.error('GET /api/food-data/size-units error', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch size units' }, { status: 500 })
  }
}
