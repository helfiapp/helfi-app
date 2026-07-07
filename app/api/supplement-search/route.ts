import { NextRequest, NextResponse } from 'next/server'
import { searchSupplementReferenceNames } from '@/lib/health-intake-review-match'

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

    const results = await searchSupplementReferenceNames(query, 10)

    const payload = { results }
    setCached(cacheKey, payload)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Supplement search failed:', error)
    return NextResponse.json({ results: [] })
  }
}
