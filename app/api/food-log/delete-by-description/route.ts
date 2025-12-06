import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeMealCategory } from '../route'

// Danger zone endpoint: delete matching food logs by description + category for the authenticated user.
// Used as a last-resort cleaner when client-side deletes fail due to mismatched IDs or dates.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({} as any))
    const rawDesc = String((body as any)?.description || '').trim()
    const rawCategory = String((body as any)?.category || '').trim()
    const targetDates = Array.isArray((body as any)?.dates)
      ? ((body as any).dates as string[]).filter((d) => typeof d === 'string' && d.length >= 8)
      : []

    if (!rawDesc) {
      return NextResponse.json({ error: 'Missing description' }, { status: 400 })
    }

    const category = rawCategory ? normalizeMealCategory(rawCategory) : null
    const descLower = rawDesc.toLowerCase()

    const whereClause: any = {
      userId: user.id,
      OR: [
        { description: { contains: rawDesc, mode: 'insensitive' } },
        { name: { contains: rawDesc, mode: 'insensitive' } },
      ],
    }

    if (category) {
      whereClause.AND = [{ meal: normalizeMealCategory(category) }]
    }

    if (targetDates.length > 0) {
      whereClause.AND = whereClause.AND || []
      whereClause.AND.push({ localDate: { in: targetDates } })
    }

    const matches = await prisma.foodLog.findMany({
      where: whereClause,
      select: { id: true, description: true, meal: true, localDate: true },
    })

    if (!matches.length) {
      return NextResponse.json({ success: true, deleted: 0 })
    }

    const ids = matches.map((m) => m.id)
    const result = await prisma.foodLog.deleteMany({
      where: { id: { in: ids }, userId: user.id },
    })

    return NextResponse.json({ success: true, deleted: result.count, ids })
  } catch (error) {
    console.error('POST /api/food-log/delete-by-description error', error)
    return NextResponse.json({ error: 'Failed to delete logs' }, { status: 500 })
  }
}

