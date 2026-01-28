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

const dedupeNames = (items: { name: string; source: string }[]) => {
  const seen = new Set<string>()
  const result: { name: string; source: string }[] = []
  items.forEach((item) => {
    const key = item.name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(item)
  })
  return result
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = String(searchParams.get('q') || '').trim()
    if (query.length < 2) {
      return NextResponse.json({ results: [] })
    }

    const cacheKey = `med:${query.toLowerCase()}`
    const cached = getCached(cacheKey)
    if (cached) return NextResponse.json(cached)

    const results: { name: string; source: string }[] = []

    // RxNorm approximate match
    try {
      const rxUrl = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(
        query
      )}&maxEntries=10`
      const rxResponse = await fetch(rxUrl, { headers: { Accept: 'application/json' } })
      if (rxResponse.ok) {
        const rxData = await rxResponse.json().catch(() => ({}))
        const candidates = rxData?.approximateGroup?.candidate
        const list = Array.isArray(candidates) ? candidates : candidates ? [candidates] : []
        list.forEach((c: any) => {
          const name = String(c?.name || '').trim()
          if (name) {
            results.push({ name, source: 'rxnorm' })
          }
        })
      }
    } catch (error) {
      console.warn('RxNorm search failed:', error)
    }

    // openFDA fallback
    if (results.length < 5) {
      try {
        const safe = query.replace(/"/g, '').trim()
        const termQuery = safe.includes(' ') ? `"${safe}"` : `${safe}*`
        const search = `(openfda.brand_name:${termQuery} OR openfda.generic_name:${termQuery})`
        const fdaUrl = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(
          search
        )}&limit=10`
        const fdaResponse = await fetch(fdaUrl, { headers: { Accept: 'application/json' } })
        if (fdaResponse.ok) {
          const fdaData = await fdaResponse.json().catch(() => ({}))
          const fdaResults = Array.isArray(fdaData?.results) ? fdaData.results : []
          fdaResults.forEach((item: any) => {
            const brand = item?.openfda?.brand_name?.[0] || ''
            const generic = item?.openfda?.generic_name?.[0] || ''
            const name = brand && generic ? `${brand} (${generic})` : brand || generic
            if (name) {
              results.push({ name, source: 'openfda' })
            }
          })
        }
      } catch (error) {
        console.warn('openFDA search failed:', error)
      }
    }

    const payload = { results: dedupeNames(results).slice(0, 10) }
    setCached(cacheKey, payload)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Medication search failed:', error)
    return NextResponse.json({ results: [] })
  }
}
