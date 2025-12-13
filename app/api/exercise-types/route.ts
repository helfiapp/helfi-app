import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const search = (searchParams.get('search') || '').trim()
  const category = (searchParams.get('category') || '').trim()
  const intensity = (searchParams.get('intensity') || '').trim()

  const limitRaw = Number(searchParams.get('limit') || 30)
  const offsetRaw = Number(searchParams.get('offset') || 0)
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 30
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0

  const where: any = {}
  if (category) where.category = category
  if (intensity) where.intensity = intensity
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
    ]
  }

  const items = await prisma.exerciseType.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take: limit,
    skip: offset,
  })

  const normalizedSearch = search.toLowerCase()
  const normalizedCategory = category.toLowerCase()
  let ordered = items

  // UX: prioritize the most common activities near the top (especially within Cardio).
  // Prisma ordering is alphabetical, so "Walking" otherwise lands near the bottom.
  if (!normalizedSearch && normalizedCategory === 'cardio') {
    const rank = (name: string) => {
      const v = (name || '').toLowerCase()
      if (v.includes('walking')) return 0
      if (v.includes('jog')) return 1
      if (v.includes('run')) return 2
      if (v.includes('elliptical')) return 3
      if (v.includes('rowing')) return 4
      if (v.includes('aerobics')) return 5
      return 10
    }
    ordered = [...items].sort((a: any, b: any) => {
      const ra = rank(a?.name)
      const rb = rank(b?.name)
      if (ra !== rb) return ra - rb
      return String(a?.name || '').localeCompare(String(b?.name || ''))
    })
  }

  return NextResponse.json({ items: ordered, limit, offset })
}
