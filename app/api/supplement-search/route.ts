import { NextRequest, NextResponse } from 'next/server'

type CacheEntry = { ts: number; data: any }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000

const getCached = (key: string) => {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.data
}

const setCached = (key: string, data: any) => {
  cache.set(key, { ts: Date.now(), data })
}

const buildSupplementName = (source: any) => {
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = String(searchParams.get('q') || '').trim()
    if (query.length < 2) {
      return NextResponse.json({ results: [] })
    }

    const cacheKey = `supp:${query.toLowerCase()}`
    const cached = getCached(cacheKey)
    if (cached) return NextResponse.json(cached)

    const url = `https://api.ods.od.nih.gov/dsld/v9/search-filter?q=${encodeURIComponent(
      query
    )}&from=0&size=10&sort_by=_score&sort_order=desc`

    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) {
      return NextResponse.json({ results: [] })
    }

    const data = await response.json().catch(() => ({}))
    const hits = Array.isArray(data?.hits) ? data.hits : data?.hits?.hits
    const results = (Array.isArray(hits) ? hits : [])
      .map((hit: any) => {
        const source = hit?._source || hit?.source || hit || {}
        const name = buildSupplementName(source)
        if (!name) return null
        return {
          name,
          source: 'dsld',
        }
      })
      .filter(Boolean)

    const payload = { results }
    setCached(cacheKey, payload)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Supplement search failed:', error)
    return NextResponse.json({ results: [] })
  }
}
