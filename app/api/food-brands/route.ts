export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { fetchFatSecretBrandList } from '@/lib/food-data'

const brandCache = new Map<string, { items: string[]; expiresAtMs: number }>()

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startsWith = String(searchParams.get('startsWith') || searchParams.get('q') || '').trim()
    const brandType = String(searchParams.get('type') || 'restaurant').trim().toLowerCase()

    if (startsWith.length < 2) {
      return NextResponse.json({ success: true, items: [] })
    }

    const key = `${brandType}:${startsWith.toLowerCase()}`
    const cached = brandCache.get(key)
    if (cached && Date.now() < cached.expiresAtMs) {
      return NextResponse.json({ success: true, items: cached.items })
    }

    const items = await fetchFatSecretBrandList(startsWith, { brandType, limit: 20 })
    brandCache.set(key, { items, expiresAtMs: Date.now() + 24 * 60 * 60 * 1000 })
    return NextResponse.json({ success: true, items })
  } catch (error) {
    console.warn('Food brands lookup failed', error)
    return NextResponse.json({ success: false, items: [] }, { status: 200 })
  }
}
