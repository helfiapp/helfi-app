import { NextRequest, NextResponse } from 'next/server'
import { searchMedicationReferenceNames } from '@/lib/health-intake-review-match'

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

    const results = await searchMedicationReferenceNames(query, 10)

    const payload = { results: dedupeNames(results).slice(0, 10) }
    console.log(`Medication search for "${query}": returning ${payload.results.length} results`)
    setCached(cacheKey, payload)
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Medication search failed:', error)
    return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
