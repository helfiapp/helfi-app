import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeMealCategory } from '../route'
import { deleteFoodPhotosIfUnused } from '@/lib/food-photo-storage'

// Atomic delete endpoint (Food Diary ghost-entry hardening)
//
// Goal: delete DB rows (including conservative duplicate sweeps) AND update the server
// todaysFoods snapshot (__TODAYS_FOODS_DATA__) in the same request so iOS PWA background/resume
// can't resurrect stale cards after refresh.
//
// This endpoint is designed to be idempotent-ish: if the row is already gone, it still succeeds
// and will apply the snapshot update if provided.
export async function POST(request: NextRequest) {
  try {
    let userEmail: string | null = null
    try {
      const session = await getServerSession(authOptions)
      userEmail = session?.user?.email ?? null
    } catch (sessionError) {
      console.error('POST /api/food-log/delete-atomic - getServerSession failed (will try JWT fallback):', sessionError)
    }

    // Match /api/food-log patterns: JWT fallback because getServerSession can be unreliable on some clients.
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
        console.error('POST /api/food-log/delete-atomic - JWT fallback failed:', tokenError)
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

    const requestedIdRaw = (body as any)?.id
    const requestedId = typeof requestedIdRaw === 'string' ? requestedIdRaw.trim() : requestedIdRaw ? String(requestedIdRaw) : ''

    const rawDesc = typeof (body as any)?.description === 'string' ? String((body as any).description).trim() : ''
    const rawCategory = typeof (body as any)?.category === 'string' ? String((body as any).category).trim() : ''
    const category = rawCategory ? normalizeMealCategory(rawCategory) : null

    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    const snapshotDateRaw = typeof (body as any)?.snapshotDate === 'string' ? String((body as any).snapshotDate).slice(0, 10) : ''
    const snapshotDate = datePattern.test(snapshotDateRaw) ? snapshotDateRaw : ''

    const datesRaw = Array.isArray((body as any)?.dates) ? ((body as any).dates as any[]) : []
    const dates = Array.from(
      new Set(
        datesRaw
          .map((d) => (typeof d === 'string' ? d.slice(0, 10) : ''))
          .filter((d) => datePattern.test(d)),
      ),
    ).slice(0, 12)

    const snapshotFoodsRaw = Array.isArray((body as any)?.snapshotFoods) ? ((body as any).snapshotFoods as any[]) : null

    const deletedIds = new Set<string>()
    let deletedCount = 0
    const imageUrlsToCheck = new Set<string>()

    // 1) Delete by id + conservative duplicate sweep (fast path + anti-ghost).
    if (requestedId) {
      try {
        const existing = await prisma.foodLog.findUnique({ where: { id: requestedId as any } })
        if (existing && existing.userId === user.id) {
          if (typeof existing.imageUrl === 'string' && existing.imageUrl.trim()) {
            imageUrlsToCheck.add(existing.imageUrl.trim())
          }
          const rawText = String(existing.description || existing.name || '').trim()
          const normalizeDesc = (value: string) => value.split('\n')[0].trim().toLowerCase()
          const targetDesc = normalizeDesc(rawText)
          const needle = rawText.split('\n')[0].trim().slice(0, 140)
          const createdAt = existing.createdAt instanceof Date ? existing.createdAt : new Date(existing.createdAt as any)
          const createdAtMs = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.getTime() : NaN
          const targetCategory = normalizeMealCategory((existing as any).meal ?? (existing as any).category) || 'uncategorized'
          const targetMs = Number.isFinite(createdAtMs) ? createdAtMs : null
          const targetLocalDate = typeof (existing as any).localDate === 'string' ? String((existing as any).localDate) : ''

          const shouldSweep = needle.length >= 12 && Number.isFinite(createdAtMs)
          if (shouldSweep) {
            const MATCH_WINDOW_MS = 5000
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
                  { id: requestedId as any },
                  {
                    createdAt: { gte: windowStart, lte: windowEnd },
                    OR: [
                      { description: { contains: needle, mode: 'insensitive' } },
                      { name: { contains: needle, mode: 'insensitive' } },
                    ],
                  },
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
              select: { id: true, imageUrl: true, description: true, name: true, createdAt: true, meal: true, category: true, localDate: true },
            })

            const filtered = duplicates.filter((row) => {
              const rowDesc = normalizeDesc(String(row.description || row.name || ''))
              if (!rowDesc || rowDesc !== targetDesc) return false
              const rowCategory = normalizeMealCategory((row as any)?.meal ?? (row as any)?.category) || 'uncategorized'
              const catMatches =
                rowCategory === targetCategory ||
                rowCategory === 'uncategorized' ||
                targetCategory === 'uncategorized'
              if (!catMatches) return false
              if (targetLocalDate) {
                const rowLocalDate = typeof (row as any)?.localDate === 'string' ? String((row as any).localDate) : ''
                if (rowLocalDate && rowLocalDate !== targetLocalDate) return false
              }
              if (targetMs !== null) {
                const rowMs = row.createdAt ? new Date(row.createdAt as any).getTime() : NaN
                if (!Number.isFinite(rowMs)) return false
                if (Math.abs(rowMs - targetMs) > MATCH_WINDOW_MS) return false
              }
              return true
            })

            filtered.forEach((row) => {
              if (typeof row.imageUrl === 'string' && row.imageUrl.trim()) {
                imageUrlsToCheck.add(row.imageUrl.trim())
              }
            })
            const ids = Array.from(new Set([requestedId, ...filtered.map((d) => d.id)])).slice(0, 50)
            if (ids.length > 0) {
              const result = await prisma.foodLog.deleteMany({
                where: { userId: user.id, id: { in: ids } },
              })
              deletedCount += result.count
              ids.forEach((id) => deletedIds.add(String(id)))
            }
          } else {
            await prisma.foodLog.delete({ where: { id: requestedId as any } })
            deletedCount += 1
            deletedIds.add(String(requestedId))
          }
        }
      } catch (err) {
        // Best-effort: if id delete fails, fall through to description delete + snapshot update.
        console.warn('AGENT_DEBUG', JSON.stringify({ hypothesisId: 'A', location: 'app/api/food-log/delete-atomic/route.ts:POST:id', message: 'Delete-by-id/sweep failed (best-effort)', data: { idPrefix: String(requestedId).slice(0, 8) }, timestamp: Date.now() }))
      }
    }

    // 2) Delete by description/category across dates (server-side sweep, safer than client multi-fetch).
    // Caller provides `dates` (usually selected day + nearby days). We also support a conservative
    // uncategorized sweep on the target day only, because some server rows may miss meal/category.
    const descForServer = rawDesc ? rawDesc.slice(0, 220) : ''
    const targetDay = snapshotDate || (dates[0] || '')
    if (descForServer) {
      try {
        const categoriesToTry: (string | null)[] = []
        if (category) {
          categoriesToTry.push(category)
          if (category !== 'uncategorized' && targetDay) {
            categoriesToTry.push('uncategorized')
          }
        } else {
          categoriesToTry.push(null)
        }

        for (const cat of categoriesToTry) {
          const whereClause: any = {
            userId: user.id,
            OR: [
              { description: { contains: descForServer, mode: 'insensitive' } },
              { name: { contains: descForServer, mode: 'insensitive' } },
            ],
          }
          if (cat) {
            whereClause.AND = whereClause.AND || []
            whereClause.AND.push({ meal: normalizeMealCategory(cat) })
          }
          if (dates.length > 0) {
            whereClause.AND = whereClause.AND || []
            whereClause.AND.push({ localDate: { in: cat === 'uncategorized' && targetDay ? [targetDay] : dates } })
          }

          const matches = await prisma.foodLog.findMany({
            where: whereClause,
            select: { id: true, imageUrl: true },
            take: 50,
          })

          matches.forEach((row) => {
            if (typeof row.imageUrl === 'string' && row.imageUrl.trim()) {
              imageUrlsToCheck.add(row.imageUrl.trim())
            }
          })
          const ids = Array.from(new Set(matches.map((m) => String(m.id)))).filter(Boolean).slice(0, 50)
          if (ids.length > 0) {
            const result = await prisma.foodLog.deleteMany({
              where: { userId: user.id, id: { in: ids } },
            })
            deletedCount += result.count
            ids.forEach((id) => deletedIds.add(id))
          }
        }
      } catch (err) {
        console.warn('AGENT_DEBUG', JSON.stringify({ hypothesisId: 'A', location: 'app/api/food-log/delete-atomic/route.ts:POST:desc', message: 'Delete-by-description sweep failed (best-effort)', timestamp: Date.now() }))
      }
    }

    // 3) Snapshot sync: if client provided snapshotFoods, write them now; otherwise attempt to
    // remove deleted ids from the existing snapshot record.
    let snapshotUpdated = false
    let snapshotCount: number | null = null
    try {
      const snapshotKeyName = '__TODAYS_FOODS_DATA__'

      const writeSnapshotFoods = async (foods: any[]) => {
        await prisma.healthGoal.deleteMany({
          where: { userId: user.id, name: snapshotKeyName },
        })
        if (foods.length > 0) {
          await prisma.healthGoal.create({
            data: {
              userId: user.id,
              name: snapshotKeyName,
              category: JSON.stringify({ foods }),
              currentRating: 0,
            },
          })
        }
      }

      if (snapshotFoodsRaw && snapshotFoodsRaw.length >= 0 && snapshotDate) {
        // Trust client to have already minimized/limited; we only ensure date scoping + cap.
        const scoped = snapshotFoodsRaw
          .filter((e) => e && typeof e === 'object')
          .map((e) => ({
            ...e,
            localDate:
              typeof (e as any)?.localDate === 'string' && (e as any).localDate.length >= 8
                ? String((e as any).localDate).slice(0, 10)
                : snapshotDate,
          }))
          .filter((e) => String((e as any).localDate || '') === snapshotDate)
        const capped = scoped.slice(0, 300)
        await writeSnapshotFoods(capped)
        snapshotUpdated = true
        snapshotCount = capped.length
      } else if (deletedIds.size > 0) {
        const existing = await prisma.healthGoal.findFirst({
          where: { userId: user.id, name: snapshotKeyName },
          select: { id: true, category: true },
        })
        if (existing?.category) {
          let parsed: any = null
          try {
            parsed = JSON.parse(String(existing.category))
          } catch {}
          const foods = Array.isArray(parsed?.foods) ? parsed.foods : []
          const filtered = foods.filter((f: any) => {
            const dbId = f && (f.dbId || f.id) ? String(f.dbId || '') : ''
            if (dbId && deletedIds.has(dbId)) return false
            return true
          })
          await writeSnapshotFoods(filtered)
          snapshotUpdated = true
          snapshotCount = filtered.length
        }
      }
    } catch (err) {
      console.warn('AGENT_DEBUG', JSON.stringify({ hypothesisId: 'A', location: 'app/api/food-log/delete-atomic/route.ts:POST:snapshot', message: 'Snapshot sync failed (best-effort)', timestamp: Date.now() }))
    }

    try {
      await deleteFoodPhotosIfUnused(Array.from(imageUrlsToCheck))
    } catch (cleanupError) {
      console.warn('AGENT_DEBUG', JSON.stringify({ hypothesisId: 'PHOTO_CLEAN', location: 'app/api/food-log/delete-atomic/route.ts:POST:cleanup', message: 'Food photo cleanup failed (non-blocking)', timestamp: Date.now() }))
      console.warn(cleanupError)
    }

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      deletedIds: Array.from(deletedIds),
      snapshotUpdated,
      snapshotCount,
    })
  } catch (error) {
    console.error('POST /api/food-log/delete-atomic error', error)
    return NextResponse.json({ error: 'Failed to delete log' }, { status: 500 })
  }
}
