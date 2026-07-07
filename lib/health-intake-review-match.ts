import { prisma } from '@/lib/prisma'
import { ensureSupplementCatalogSchema } from '@/lib/supplement-catalog-db'
import { ensureMedicationCatalogSchema } from '@/lib/medication-catalog-db'

export type HealthIntakeReviewItemType = 'supplement' | 'medication'
export type HealthIntakeReviewMatchSource =
  | 'supplement_catalog'
  | 'medication_catalog'
  | 'rxnorm'
  | 'openfda'
  | 'dsld'

export type HealthIntakeReviewMatch = {
  name: string
  source: HealthIntakeReviewMatchSource
  confidence: 'exact' | 'possible'
}

type ReferenceResult = {
  name: string
  source: 'rxnorm' | 'openfda' | 'dsld'
}

type ScoredMatch = {
  name: string
  source: HealthIntakeReviewMatchSource
  score: number
  confidence: 'exact' | 'possible'
}

type CacheEntry<T> = { ts: number; data: T }

const CACHE_TTL_MS = 5 * 60 * 1000
const externalCache = new Map<string, CacheEntry<ReferenceResult[]>>()

function cleanText(value: unknown, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeSearchText(value: unknown) {
  return cleanText(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isPlaceholderName(value: unknown) {
  const safe = cleanText(value, 120).toLowerCase()
  return new Set([
    'analyzing...',
    'unknown',
    'unknown supplement',
    'unknown medication',
    'analysis error',
    'supplement label',
    'medication label',
    'supplement added',
    'medication added',
  ]).has(safe)
}

function getCachedResults(key: string) {
  const entry = externalCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    externalCache.delete(key)
    return null
  }
  return entry.data
}

function setCachedResults(key: string, data: ReferenceResult[]) {
  externalCache.set(key, { ts: Date.now(), data })
}

function dedupeReferenceResults(items: ReferenceResult[]) {
  const seen = new Set<string>()
  const result: ReferenceResult[] = []
  items.forEach((item) => {
    const name = cleanText(item.name, 180)
    const key = name.toLowerCase()
    if (!name || seen.has(key) || isPlaceholderName(name)) return
    seen.add(key)
    result.push({ name, source: item.source })
  })
  return result
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 2500) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
    if (!response.ok) return null
    return response.json().catch(() => null)
  } finally {
    clearTimeout(timeout)
  }
}

export async function searchMedicationReferenceNames(query: string, limit = 10): Promise<ReferenceResult[]> {
  const safeQuery = cleanText(query, 120)
  if (safeQuery.length < 2) return []
  const cacheKey = `med:${safeQuery.toLowerCase()}:${limit}`
  const cached = getCachedResults(cacheKey)
  if (cached) return cached

  const results: ReferenceResult[] = []
  const headers = { Accept: 'application/json', 'User-Agent': 'Helfi/1.0 (medication-search)' }

  try {
    const rxUrl = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(safeQuery)}&maxEntries=${Math.max(1, limit)}`
    const rxData = await fetchJsonWithTimeout(rxUrl, { headers })
    const candidates = rxData?.approximateGroup?.candidate
    const list = Array.isArray(candidates) ? candidates : candidates ? [candidates] : []
    list.forEach((candidate: any) => {
      const name = cleanText(candidate?.name, 180)
      if (name) results.push({ name, source: 'rxnorm' })
    })
  } catch (error) {
    console.warn('[health intake review match] RxNorm approximate search skipped', error)
  }

  if (results.length < 5) {
    try {
      const rxDrugUrl = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(safeQuery)}`
      const rxDrugData = await fetchJsonWithTimeout(rxDrugUrl, { headers })
      const groups = Array.isArray(rxDrugData?.drugGroup?.conceptGroup) ? rxDrugData.drugGroup.conceptGroup : []
      groups.forEach((group: any) => {
        const props = Array.isArray(group?.conceptProperties) ? group.conceptProperties : []
        props.forEach((prop: any) => {
          const name = cleanText(prop?.name, 180)
          if (name) results.push({ name, source: 'rxnorm' })
        })
      })
    } catch (error) {
      console.warn('[health intake review match] RxNorm drug search skipped', error)
    }
  }

  if (results.length < 5) {
    try {
      const safe = safeQuery.replace(/"/g, '').trim()
      const termQuery = safe.includes(' ') ? `"${safe}"` : `${safe}*`
      const search = `(openfda.brand_name:${termQuery} OR openfda.generic_name:${termQuery})`
      const fdaUrl = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(search)}&limit=${Math.max(1, limit)}`
      const fdaData = await fetchJsonWithTimeout(fdaUrl, { headers })
      const fdaResults = Array.isArray(fdaData?.results) ? fdaData.results : []
      fdaResults.forEach((item: any) => {
        const brand = cleanText(item?.openfda?.brand_name?.[0], 100)
        const generic = cleanText(item?.openfda?.generic_name?.[0], 100)
        const name = brand && generic ? `${brand} (${generic})` : brand || generic
        if (name) results.push({ name, source: 'openfda' })
      })
    } catch (error) {
      console.warn('[health intake review match] openFDA search skipped', error)
    }
  }

  const deduped = dedupeReferenceResults(results).slice(0, limit)
  setCachedResults(cacheKey, deduped)
  return deduped
}

function buildSupplementReferenceName(source: any) {
  const brand =
    source?.brandName ||
    source?.brand_name ||
    source?.brand ||
    source?.manufacturer ||
    null
  const product =
    source?.fullName ||
    source?.productName ||
    source?.product_name ||
    source?.labelName ||
    source?.label_name ||
    source?.supplementName ||
    source?.supplement_name ||
    null
  if (brand && product) return `${brand} - ${product}`
  return product || brand || null
}

export async function searchSupplementReferenceNames(query: string, limit = 10): Promise<ReferenceResult[]> {
  const safeQuery = cleanText(query, 120)
  if (safeQuery.length < 2) return []
  const cacheKey = `supp:${safeQuery.toLowerCase()}:${limit}`
  const cached = getCachedResults(cacheKey)
  if (cached) return cached

  try {
    const url = `https://api.ods.od.nih.gov/dsld/v9/search-filter?q=${encodeURIComponent(safeQuery)}&from=0&size=${Math.max(1, limit)}&sort_by=_score&sort_order=desc`
    const data = await fetchJsonWithTimeout(url, { headers: { Accept: 'application/json' } })
    const hits = Array.isArray(data?.hits) ? data.hits : data?.hits?.hits
    const results = (Array.isArray(hits) ? hits : [])
      .map((hit: any) => {
        const source = hit?._source || hit?.source || hit || {}
        const name = cleanText(buildSupplementReferenceName(source), 180)
        return name ? { name, source: 'dsld' as const } : null
      })
      .filter(Boolean) as ReferenceResult[]
    const deduped = dedupeReferenceResults(results).slice(0, limit)
    setCachedResults(cacheKey, deduped)
    return deduped
  } catch (error) {
    console.warn('[health intake review match] NIH DSLD search skipped', error)
    return []
  }
}

function scoreMatch(queryTokens: string[], row: { name: string; source: HealthIntakeReviewMatchSource; brand?: string | null; product?: string | null }): ScoredMatch | null {
  const label = cleanText(row.name, 180)
  if (!label || isPlaceholderName(label)) return null
  const haystack = normalizeSearchText(`${row.name || ''} ${row.brand || ''} ${row.product || ''}`)
  const score = queryTokens.reduce((acc, token) => (haystack.includes(token) ? acc + 1 : acc), 0)
  if (score === 0) return null
  return {
    name: label,
    source: row.source,
    score,
    confidence: normalizeSearchText(label) === queryTokens.join(' ') ? 'exact' : 'possible',
  }
}

function bestScoredMatch(matches: ScoredMatch[]) {
  matches.sort((a, b) => b.score - a.score || (a.confidence === 'exact' ? -1 : 1))
  const best = matches[0]
  return best ? { name: best.name, source: best.source, confidence: best.confidence } : null
}

async function findLocalCatalogMatch(itemType: HealthIntakeReviewItemType, queryTokens: string[]) {
  if (itemType === 'supplement') {
    await ensureSupplementCatalogSchema()
    const rows = await prisma.supplementCatalog.findMany({
      where: {
        OR: queryTokens.map((token) => ({
          OR: [
            { fullName: { contains: token, mode: 'insensitive' as const } },
            { brand: { contains: token, mode: 'insensitive' as const } },
            { product: { contains: token, mode: 'insensitive' as const } },
          ],
        })),
      },
      orderBy: [{ updatedAt: 'desc' }],
      distinct: ['fullName'],
      take: 24,
    })
    return bestScoredMatch(
      rows
        .map((row) => scoreMatch(queryTokens, {
          name: row.fullName,
          brand: row.brand,
          product: row.product,
          source: 'supplement_catalog',
        }))
        .filter(Boolean) as ScoredMatch[],
    )
  }

  await ensureMedicationCatalogSchema()
  const tokenConditions = queryTokens.map((_, idx) =>
    `("fullName" ILIKE $${idx * 3 + 1} OR "brand" ILIKE $${idx * 3 + 2} OR "product" ILIKE $${idx * 3 + 3})`,
  ).join(' OR ')
  const params: any[] = []
  queryTokens.forEach((token) => {
    const pattern = `%${token}%`
    params.push(pattern, pattern, pattern)
  })
  const rows = await prisma.$queryRawUnsafe<Array<{ fullName: string; brand: string | null; product: string | null }>>(
    `SELECT DISTINCT ON ("fullName") "fullName", "brand", "product", "updatedAt"
     FROM "MedicationCatalog"
     WHERE ${tokenConditions}
     ORDER BY "fullName", "updatedAt" DESC
     LIMIT 24`,
    ...params,
  )
  return bestScoredMatch(
    rows
      .map((row) => scoreMatch(queryTokens, {
        name: row.fullName,
        brand: row.brand,
        product: row.product,
        source: 'medication_catalog',
      }))
      .filter(Boolean) as ScoredMatch[],
  )
}

async function findExternalReferenceMatch(itemType: HealthIntakeReviewItemType, queryTokens: string[], query: string) {
  const results =
    itemType === 'medication'
      ? await searchMedicationReferenceNames(query, 10)
      : await searchSupplementReferenceNames(query, 10)
  return bestScoredMatch(
    results
      .map((result) => scoreMatch(queryTokens, { name: result.name, source: result.source }))
      .filter(Boolean) as ScoredMatch[],
  )
}

export async function findHealthIntakeReviewMatch(itemType: HealthIntakeReviewItemType, name: string): Promise<HealthIntakeReviewMatch | null> {
  const query = normalizeSearchText(name)
  const tokens = query.split(' ').filter(Boolean).slice(0, 6)
  if (tokens.length === 0) return null

  try {
    const localMatch = await findLocalCatalogMatch(itemType, tokens)
    if (localMatch) return localMatch
  } catch (error) {
    console.warn('[health intake review match] local catalog search skipped', error)
  }

  try {
    return await findExternalReferenceMatch(itemType, tokens, name)
  } catch (error) {
    console.warn('[health intake review match] external reference search skipped', error)
    return null
  }
}
