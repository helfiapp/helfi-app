import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Lightweight audit endpoint to catch cases where todaysFoods snapshots
// were never written into the permanent FoodLog history. Intended to be
// called by a scheduled job (e.g., Vercel Cron) with a shared secret.
export async function GET(req: NextRequest) {
  const secret = process.env.AUDIT_SECRET
  const authHeader = req.headers.get('authorization') || ''
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const lookbackDays = 7
  const since = new Date()
  since.setDate(since.getDate() - lookbackDays)

  try {
    // Pull recent todaysFoods snapshots
    const snapshots = await prisma.healthGoal.findMany({
      where: {
        name: '__TODAYS_FOODS_DATA__',
        updatedAt: { gte: since },
      },
      select: {
        userId: true,
        category: true,
        updatedAt: true,
      },
    })

    const missing: Array<{
      userId: string
      localDate: string
      reason: string
    }> = []
    let parsedSnapshots = 0

    for (const snap of snapshots) {
      let foods: any[] = []
      try {
        const parsed = JSON.parse(snap.category || '{}')
        foods = Array.isArray(parsed?.foods) ? parsed.foods : []
      } catch {
        missing.push({
          userId: snap.userId,
          localDate: 'unknown',
          reason: 'Failed to parse todaysFoods snapshot',
        })
        continue
      }

      parsedSnapshots += 1
      const byDate = new Map<string, any[]>()
      for (const f of foods) {
        const date =
          (typeof f?.localDate === 'string' && f.localDate.length >= 8
            ? f.localDate
            : null) ||
          null
        if (!date) continue
        if (!byDate.has(date)) byDate.set(date, [])
        byDate.get(date)?.push(f)
      }

      for (const [date, entries] of byDate.entries()) {
        // Check if FoodLog has at least as many rows for that date
        const count = await prisma.foodLog.count({
          where: { userId: snap.userId, localDate: date },
        })
        if (count < entries.length) {
          missing.push({
            userId: snap.userId,
            localDate: date,
            reason: `Expected >=${entries.length} entries from snapshot; found ${count} in FoodLog`,
          })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      checkedSnapshots: parsedSnapshots,
      missingCount: missing.length,
      missing,
    })
  } catch (error) {
    console.error('❌ Audit /api/audit/food-log error', error)
    return NextResponse.json({ error: 'Audit failed', details: String(error) }, { status: 500 })
  }
}
