import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeMealCategory } from '../route'
import { deleteFoodPhotosIfUnused } from '@/lib/food-photo-storage'

// Danger zone endpoint: delete matching food logs by description + category for the authenticated user.
// Used as a last-resort cleaner when client-side deletes fail due to mismatched IDs or dates.
export async function POST(request: NextRequest) {
  try {
    let session
    let userEmail: string | null = null
    try {
      session = await getServerSession(authOptions)
      userEmail = session?.user?.email ?? null
    } catch (sessionError) {
      console.error('POST /api/food-log/delete-by-description - getServerSession failed (will try JWT fallback):', sessionError)
    }

    if (!userEmail) {
      try {
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) {
          userEmail = String(token.email)
        }
      } catch (tokenError) {
        console.error('POST /api/food-log/delete-by-description - JWT fallback failed:', tokenError)
      }
    }

    if (!userEmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({} as any))
    const rawDesc = String((body as any)?.description || '').trim()
    const rawCategory = String((body as any)?.category || '').trim()
    const rawClientId = typeof (body as any)?.clientId === 'string' ? String((body as any).clientId).trim() : ''
    const rawCreatedAt = (body as any)?.createdAt ?? (body as any)?.createdAtMs ?? null
    let targetCreatedAtMs: number | null = null
    if (typeof rawCreatedAt === 'number' && Number.isFinite(rawCreatedAt)) {
      targetCreatedAtMs = rawCreatedAt
    } else if (typeof rawCreatedAt === 'string' && rawCreatedAt.trim()) {
      const parsed = new Date(rawCreatedAt)
      if (!Number.isNaN(parsed.getTime())) {
        targetCreatedAtMs = parsed.getTime()
      }
    }
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
    if (targetCreatedAtMs !== null) {
      const windowStart = new Date(targetCreatedAtMs - 2000)
      const windowEnd = new Date(targetCreatedAtMs + 2000)
      whereClause.AND = whereClause.AND || []
      whereClause.AND.push({ createdAt: { gte: windowStart, lte: windowEnd } })
    }

    const matches = await prisma.foodLog.findMany({
      where: whereClause,
      select: { id: true, description: true, meal: true, localDate: true, imageUrl: true, nutrients: true, createdAt: true },
    })

    const filteredMatches = rawClientId
      ? matches.filter((row) => {
          const rowClientId = typeof (row as any)?.nutrients?.__clientId === 'string' ? String((row as any).nutrients.__clientId) : ''
          return Boolean(rowClientId) && rowClientId === rawClientId
        })
      : matches

    // #region agent log
    try {
      console.log('AGENT_DEBUG', JSON.stringify({hypothesisId:'D',location:'app/api/food-log/delete-by-description/route.ts:POST',message:'Delete-by-description match summary',data:{rawDescLen:rawDesc.length,category,datesCount:targetDates.length,matchesCount:filteredMatches.length,sample:filteredMatches.slice(0,3).map(m=>({idPrefix:String(m.id).slice(0,8),meal:m.meal||null,localDate:m.localDate||null}))},timestamp:Date.now()}));
    } catch {}
    // #endregion agent log

    if (!filteredMatches.length) {
      return NextResponse.json({ success: true, deleted: 0 })
    }

    const ids = filteredMatches.map((m) => m.id)
    const result = await prisma.foodLog.deleteMany({
      where: { id: { in: ids }, userId: user.id },
    })

    try {
      await deleteFoodPhotosIfUnused(filteredMatches.map((row) => row.imageUrl))
    } catch (cleanupError) {
      console.warn('AGENT_DEBUG', JSON.stringify({ hypothesisId: 'PHOTO_CLEAN', location: 'app/api/food-log/delete-by-description/route.ts:POST:cleanup', message: 'Food photo cleanup failed (non-blocking)', timestamp: Date.now() }))
      console.warn(cleanupError)
    }

    return NextResponse.json({ success: true, deleted: result.count, ids })
  } catch (error) {
    console.error('POST /api/food-log/delete-by-description error', error)
    return NextResponse.json({ error: 'Failed to delete logs' }, { status: 500 })
  }
}
