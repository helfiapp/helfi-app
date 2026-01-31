import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

const safeName = (value: any) => String(value || '').trim()

const dedupeNames = (items: { name: string; source: string }[]) => {
  const seen = new Set<string>()
  const result: { name: string; source: string }[] = []
  items.forEach((item) => {
    const key = safeName(item.name).toLowerCase()
    if (seen.has(key)) return
    if (!key) return
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
      return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const cacheKey = `med:${query.toLowerCase()}`
    const cached = getCached(cacheKey)
    if (cached) return NextResponse.json(cached, { headers: { 'Cache-Control': 'no-store' } })

    const results: { name: string; source: string }[] = []

    // RxNorm approximate match
    try {
      const rxUrl = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(
        query
      )}&maxEntries=10`
      const rxResponse = await fetch(rxUrl, { 
        headers: { Accept: 'application/json', 'User-Agent': 'Helfi/1.0 (medication-search)' },
        cache: 'no-store'
      })
      if (rxResponse.ok) {
        const rxData = await rxResponse.json().catch(() => ({}))
        const candidates = rxData?.approximateGroup?.candidate
        const list = Array.isArray(candidates) ? candidates : candidates ? [candidates] : []
        list.forEach((c: any) => {
          const name = safeName(c?.name)
          if (name && name.length > 0) {
            results.push({ name, source: 'rxnorm' })
          }
        })
        console.log(`RxNorm search for "${query}": found ${results.length} results`)
      } else {
        console.warn(`RxNorm search failed with status ${rxResponse.status}`)
      }
    } catch (error) {
      console.error('RxNorm search error:', error)
    }

    // RxNorm "drugs" fallback for better name coverage
    if (results.length < 5) {
      try {
        const rxDrugUrl = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(
          query
        )}`
        const rxDrugResponse = await fetch(rxDrugUrl, {
          headers: { Accept: 'application/json', 'User-Agent': 'Helfi/1.0 (medication-search)' },
          cache: 'no-store',
        })
        if (rxDrugResponse.ok) {
          const rxDrugData = await rxDrugResponse.json().catch(() => ({}))
          const groups = Array.isArray(rxDrugData?.drugGroup?.conceptGroup)
            ? rxDrugData.drugGroup.conceptGroup
            : []
          groups.forEach((group: any) => {
            const props = Array.isArray(group?.conceptProperties) ? group.conceptProperties : []
            props.forEach((prop: any) => {
              const name = safeName(prop?.name)
              if (name) {
                results.push({ name, source: 'rxnorm' })
              }
            })
          })
          console.log(`RxNorm drugs search for "${query}": found ${results.length} results`)
        } else {
          console.warn(`RxNorm drugs search failed with status ${rxDrugResponse.status}`)
        }
      } catch (error) {
        console.error('RxNorm drugs search error:', error)
      }
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
        const fdaResponse = await fetch(fdaUrl, { 
          headers: { Accept: 'application/json', 'User-Agent': 'Helfi/1.0 (medication-search)' },
          cache: 'no-store'
        })
        if (fdaResponse.ok) {
          const fdaData = await fdaResponse.json().catch(() => ({}))
          const fdaResults = Array.isArray(fdaData?.results) ? fdaData.results : []
          fdaResults.forEach((item: any) => {
            const brand = item?.openfda?.brand_name?.[0] || ''
            const generic = item?.openfda?.generic_name?.[0] || ''
            const name = brand && generic ? `${brand} (${generic})` : brand || generic
            if (safeName(name)) {
              results.push({ name, source: 'openfda' })
            }
          })
          console.log(`openFDA search for "${query}": found ${fdaResults.length} results`)
        } else {
          console.warn(`openFDA search failed with status ${fdaResponse.status}`)
        }
      } catch (error) {
        console.error('openFDA search error:', error)
      }
    }

    const payload = { results: dedupeNames(results).slice(0, 10) }
    console.log(`Medication search for "${query}": returning ${payload.results.length} results`)
    setCached(cacheKey, payload)
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Medication search failed:', error)
    return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
