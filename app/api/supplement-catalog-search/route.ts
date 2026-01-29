import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureSupplementCatalogSchema } from '@/lib/supplement-catalog-db'

export const dynamic = 'force-dynamic'

const normalizeSearchText = (value: string) => {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const isPlaceholderName = (value: string) => {
  const safe = String(value || '').trim().toLowerCase()
  return new Set([
    'analyzing...',
    'supplement added',
    'unknown supplement',
    'analysis error',
  ]).has(safe)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = String(searchParams.get('q') || '').trim()
    if (query.length < 2) {
      return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': 'no-store' } })
    }

    await ensureSupplementCatalogSchema()

    const tokens = normalizeSearchText(query).split(' ').filter(Boolean).slice(0, 6)
    if (tokens.length === 0) {
      return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const tokenFilters = tokens.map((token) => ({
      OR: [
        { fullName: { contains: token, mode: 'insensitive' as const } },
        { brand: { contains: token, mode: 'insensitive' as const } },
        { product: { contains: token, mode: 'insensitive' as const } },
      ],
    }))

    const rows = await prisma.supplementCatalog.findMany({
      where: { OR: tokenFilters },
      orderBy: [{ updatedAt: 'desc' }],
      distinct: ['fullName'],
      take: 60,
    })

    const scored = rows
      .map((row) => {
        const label = String(row.fullName || '').trim()
        if (!label || isPlaceholderName(label)) return null
        const haystack = normalizeSearchText(
          `${row.fullName || ''} ${row.brand || ''} ${row.product || ''}`,
        )
        const score = tokens.reduce((acc, token) => (haystack.includes(token) ? acc + 1 : acc), 0)
        return { label, score, updatedAt: row.updatedAt }
      })
      .filter(Boolean) as { label: string; score: number; updatedAt: Date }[]

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.updatedAt.getTime() - a.updatedAt.getTime()
    })

    const results = scored.slice(0, 12).map((item) => ({
      name: item.label,
      source: 'catalog',
    }))

    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Supplement catalog search failed:', error)
    return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

