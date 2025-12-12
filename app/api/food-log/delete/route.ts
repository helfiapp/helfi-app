import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Delete a specific food log (by id) for the authenticated user
export async function POST(request: NextRequest) {
  try {
    let session
    let userEmail: string | null = null
    try {
      session = await getServerSession(authOptions)
      userEmail = session?.user?.email ?? null
    } catch (sessionError) {
      console.error('POST /api/food-log/delete - getServerSession failed (will try JWT fallback):', sessionError)
    }

    // Match /api/food-log GET: JWT fallback because getServerSession can be unreliable on some clients.
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
        console.error('POST /api/food-log/delete - JWT fallback failed:', tokenError)
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
    const id = String((body as any)?.id || '').trim()
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aaafab43-c6ce-48b6-a8ee-51e168d7e762',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'E',location:'app/api/food-log/delete/route.ts:POST',message:'Delete-by-id requested',data:{idLen:id.length,idPrefix:id.slice(0,8)},timestamp:Date.now()})}).catch(()=>{});
    console.log('AGENT_DEBUG', JSON.stringify({hypothesisId:'E',location:'app/api/food-log/delete/route.ts:POST',message:'Delete-by-id requested',data:{idLen:id.length,idPrefix:id.slice(0,8)},timestamp:Date.now()}));
    // #endregion agent log

    // Ensure the log belongs to the user
    const existing = await prisma.foodLog.findUnique({ where: { id: id as any } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Many users have duplicate FoodLog rows that represent one visible "meal card".
    // Deleting a single row can appear to work, but the "ghost" resurfaces after refresh
    // because other near-identical rows still exist. To prevent resurrection, do a
    // conservative duplicate sweep around the deleted row.
    let deletedCount = 0
    try {
      const rawText = String(existing.description || existing.name || '').trim()
      const needle = rawText.split('\n')[0].trim().slice(0, 140)
      const createdAt = existing.createdAt instanceof Date ? existing.createdAt : new Date(existing.createdAt as any)
      const createdAtMs = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.getTime() : NaN

      // Only do a sweep when we have a meaningful text seed (avoid nuking short placeholder rows like "0").
      const shouldSweep = needle.length >= 12 && Number.isFinite(createdAtMs)
      if (shouldSweep) {
        const WINDOW_HOURS = 6
        const windowStart = new Date(createdAtMs - WINDOW_HOURS * 60 * 60 * 1000)
        const windowEnd = new Date(createdAtMs + WINDOW_HOURS * 60 * 60 * 1000)

        const addDays = (dateStr: string, delta: number) => {
          const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
          if (!m) return ''
          const y = parseInt(m[1], 10)
          const mo = parseInt(m[2], 10)
          const d = parseInt(m[3], 10)
          if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return ''
          const dt = new Date(Date.UTC(y, mo - 1, d))
          dt.setUTCDate(dt.getUTCDate() + delta)
          return dt.toISOString().slice(0, 10)
        }

        const baseLocalDate = typeof (existing as any).localDate === 'string' ? String((existing as any).localDate) : ''
        const candidateDates = Array.from(
          new Set(
            [
              baseLocalDate,
              baseLocalDate ? addDays(baseLocalDate, -1) : '',
              baseLocalDate ? addDays(baseLocalDate, 1) : '',
              baseLocalDate ? addDays(baseLocalDate, -2) : '',
              baseLocalDate ? addDays(baseLocalDate, 2) : '',
            ].filter((d) => typeof d === 'string' && d.length >= 8),
          ),
        )

        const duplicates = await prisma.foodLog.findMany({
          where: {
            userId: user.id,
            OR: [
              // Always include the requested id
              { id: id as any },
              // Time-window match (handles wrong/missing localDate rows that leak across days)
              {
                createdAt: { gte: windowStart, lte: windowEnd },
                OR: [
                  { description: { contains: needle, mode: 'insensitive' } },
                  { name: { contains: needle, mode: 'insensitive' } },
                ],
              },
              // LocalDate match (handles rows with correct localDate but slightly different createdAt)
              candidateDates.length > 0
                ? {
                    localDate: { in: candidateDates },
                    OR: [
                      { description: { contains: needle, mode: 'insensitive' } },
                      { name: { contains: needle, mode: 'insensitive' } },
                    ],
                  }
                : undefined,
            ].filter(Boolean) as any,
          },
          select: { id: true },
        })

        const ids = Array.from(new Set(duplicates.map((d) => d.id))).slice(0, 50)
        const result = await prisma.foodLog.deleteMany({
          where: { userId: user.id, id: { in: ids } },
        })
        deletedCount = result.count

        console.log(
          'AGENT_DEBUG',
          JSON.stringify({
            hypothesisId: 'A',
            location: 'app/api/food-log/delete/route.ts:POST:sweep',
            message: 'Delete-by-id duplicate sweep executed',
            data: { requestedIdPrefix: id.slice(0, 8), needleLen: needle.length, candidateDatesCount: candidateDates.length, deletedCount },
            timestamp: Date.now(),
          }),
        )
      } else {
        await prisma.foodLog.delete({ where: { id: id as any } })
        deletedCount = 1
        console.log(
          'AGENT_DEBUG',
          JSON.stringify({
            hypothesisId: 'A',
            location: 'app/api/food-log/delete/route.ts:POST:sweep',
            message: 'Delete-by-id duplicate sweep skipped (insufficient seed); deleted single row',
            data: { requestedIdPrefix: id.slice(0, 8), needleLen: needle.length, deletedCount },
            timestamp: Date.now(),
          }),
        )
      }
    } catch (sweepErr) {
      // Fall back to single-row delete if sweep fails for any reason.
      try {
        await prisma.foodLog.delete({ where: { id: id as any } })
        deletedCount = Math.max(deletedCount, 1)
      } catch {}
      console.warn('AGENT_DEBUG', JSON.stringify({ hypothesisId: 'A', location: 'app/api/food-log/delete/route.ts:POST:sweep', message: 'Duplicate sweep failed; fell back to single-row delete', data: { requestedIdPrefix: id.slice(0, 8) }, timestamp: Date.now() }))
    }

    return NextResponse.json({ success: true, deleted: deletedCount })
  } catch (error) {
    console.error('POST /api/food-log/delete error', error)
    return NextResponse.json({ error: 'Failed to delete log' }, { status: 500 })
  }
}

