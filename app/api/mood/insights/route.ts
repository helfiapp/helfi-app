import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureMoodTables } from '@/app/api/mood/_db'

export const dynamic = 'force-dynamic'

type Insight = {
  id: string
  title: string
  detail: string
  confidence: 'low' | 'medium' | 'high'
  sampleSize: number
}

function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length)
  if (n < 3) return null
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0, k = 0
  for (let i = 0; i < n; i++) {
    const xi = x[i]
    const yi = y[i]
    if (xi == null || yi == null || isNaN(xi) || isNaN(yi)) continue
    k++
    sumX += xi
    sumY += yi
    sumXY += xi * yi
    sumXX += xi * xi
    sumYY += yi * yi
  }
  if (k < 3) return null
  const cov = sumXY - (sumX * sumY) / k
  const varX = sumXX - (sumX * sumX) / k
  const varY = sumYY - (sumY * sumY) / k
  if (varX <= 0 || varY <= 0) return null
  return cov / Math.sqrt(varX * varY)
}

function confidenceFromSample(sampleSize: number): 'low' | 'medium' | 'high' {
  if (sampleSize >= 21) return 'high'
  if (sampleSize >= 7) return 'medium'
  return 'low'
}

function strengthLabel(r: number | null): string {
  if (r == null) return 'No clear pattern yet'
  const a = Math.abs(r)
  if (a >= 0.7) return 'a stronger tendency'
  if (a >= 0.4) return 'a moderate tendency'
  if (a >= 0.2) return 'a mild tendency'
  return 'a very small tendency'
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const period = (searchParams.get('period') || 'month').toLowerCase()

  const end = new Date().toISOString().slice(0, 10)
  const start = (() => {
    const d = new Date()
    if (period === 'week') d.setDate(d.getDate() - 6)
    else if (period === 'today') d.setDate(d.getDate() - 0)
    else d.setDate(d.getDate() - 29)
    return d.toISOString().slice(0, 10)
  })()

  try {
    await ensureMoodTables()
    const entries: Array<{ localDate: string; timestamp: string; mood: number; context: any }> =
      (await prisma.$queryRawUnsafe(
        `SELECT localDate, timestamp, mood, context
         FROM MoodEntries
         WHERE userId = $1 AND localDate BETWEEN $2 AND $3
         ORDER BY timestamp ASC`,
        user.id,
        start,
        end,
      )) as any

    // Time-of-day buckets (local time is not available; approximate using timestamp hour)
    const buckets = new Map<'morning' | 'afternoon' | 'evening' | 'night', number[]>()
    const bucketOfHour = (h: number) => {
      if (h >= 5 && h <= 11) return 'morning' as const
      if (h >= 12 && h <= 17) return 'afternoon' as const
      if (h >= 18 && h <= 23) return 'evening' as const
      return 'night' as const
    }
    for (const e of entries) {
      const ctxHourRaw = (e as any)?.context?.localHour
      const ctxHour = Number(ctxHourRaw)
      const hour = Number.isFinite(ctxHour) ? Math.max(0, Math.min(23, Math.round(ctxHour))) : new Date(e.timestamp).getHours()
      const b = bucketOfHour(hour)
      if (!buckets.has(b)) buckets.set(b, [])
      buckets.get(b)!.push(Number(e.mood))
    }
    const bucketAverages = Array.from(buckets.entries()).map(([bucket, arr]) => ({
      bucket,
      avg: arr.reduce((a, b) => a + b, 0) / arr.length,
      n: arr.length,
    }))
    bucketAverages.sort((a, b) => b.avg - a.avg)
    const bestBucket = bucketAverages[0]

    // Per-day mood average
    const byDay = new Map<string, number[]>()
    for (const e of entries) {
      if (!byDay.has(e.localDate)) byDay.set(e.localDate, [])
      byDay.get(e.localDate)!.push(Number(e.mood))
    }
    const dayKeys = Array.from(byDay.keys()).sort()
    const moodDailyAvg = dayKeys.map((d) => {
      const arr = byDay.get(d) || []
      const avg = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length)
      return { date: d, avg }
    })

    // Join with steps/sleep and meals count
    const dates = dayKeys
    const dateObjects = dates.map((d) => new Date(`${d}T00:00:00.000Z`))
    const fitbit = await prisma.fitbitData.findMany({
      where: { userId: user.id, date: { in: dateObjects }, dataType: { in: ['steps', 'sleep'] } },
      select: { date: true, dataType: true, value: true },
    }).catch(() => [])

    const mealsCounts = await prisma.foodLog.groupBy({
      by: ['localDate'],
      where: { userId: user.id, localDate: { in: dates } },
      _count: { _all: true },
    }).catch(() => [])

    const stepsByDate = new Map<string, number>()
    const sleepByDate = new Map<string, number>()
    for (const row of fitbit as any[]) {
      const d = new Date(row.date).toISOString().slice(0, 10)
      if (row.dataType === 'steps') {
        const v = (row.value?.steps ?? row.value ?? null) as any
        const n = Number(v)
        if (Number.isFinite(n)) stepsByDate.set(d, n)
      }
      if (row.dataType === 'sleep') {
        const v = (row.value?.minutes ?? row.value?.totalMinutesAsleep ?? row.value?.sleepMinutes ?? row.value ?? null) as any
        const n = Number(v)
        if (Number.isFinite(n)) sleepByDate.set(d, n)
      }
    }

    const mealsByDate = new Map<string, number>()
    for (const row of mealsCounts as any[]) {
      mealsByDate.set(String(row.localDate), Number(row._count?._all ?? 0))
    }

    const xMood: number[] = []
    const xSleep: number[] = []
    const xSteps: number[] = []
    const xMeals: number[] = []
    for (const day of moodDailyAvg) {
      const sleep = sleepByDate.get(day.date)
      const steps = stepsByDate.get(day.date)
      const meals = mealsByDate.get(day.date)
      xMood.push(day.avg)
      xSleep.push(sleep ?? NaN)
      xSteps.push(steps ?? NaN)
      xMeals.push(meals ?? NaN)
    }

    const sleepMoodR = pearson(xSleep, xMood)
    const stepsMoodR = pearson(xSteps, xMood)
    const mealsMoodR = pearson(xMeals, xMood)

    const sampleSize = moodDailyAvg.length
    const conf = confidenceFromSample(sampleSize)

    const insights: { sleep: Insight[]; nutrition: Insight[]; supplements: Insight[]; activity: Insight[]; stress: Insight[] } =
      { sleep: [], nutrition: [], supplements: [], activity: [], stress: [] }

    if (bestBucket && bestBucket.n >= 3) {
      insights.stress.push({
        id: 'time-of-day',
        title: `You tend to feel best in the ${bestBucket.bucket}`,
        detail: `Based on ${bestBucket.n} check-ins, your average mood is highest in the ${bestBucket.bucket}.`,
        confidence: confidenceFromSample(bestBucket.n),
        sampleSize: bestBucket.n,
      })
    }

    insights.sleep.push({
      id: 'sleep-vs-mood',
      title: 'Sleep and mood show a tendency together',
      detail: `Across ${sampleSize} day(s), sleep hours and mood show ${strengthLabel(sleepMoodR)}. This is a pattern hint, not a rule.`,
      confidence: conf,
      sampleSize,
    })

    insights.activity.push({
      id: 'steps-vs-mood',
      title: 'Activity and mood may move together',
      detail: `Across ${sampleSize} day(s), daily steps and mood show ${strengthLabel(stepsMoodR)}. Consider it a directional signal.`,
      confidence: conf,
      sampleSize,
    })

    insights.nutrition.push({
      id: 'meals-vs-mood',
      title: 'Eating patterns may relate to mood',
      detail: `Across ${sampleSize} day(s), days with more logged meals show ${strengthLabel(mealsMoodR)} with mood. This is a tendency, not a claim.`,
      confidence: conf,
      sampleSize,
    })

    // Supplements aren't reliably trackable per-day yet for correlation, so keep this empty for now.
    insights.supplements = []

    return NextResponse.json({
      range: { start, end },
      insights,
      meta: { sampleSize },
    })
  } catch (e) {
    console.error('mood insights error', e)
    return NextResponse.json({ error: 'Failed to load insights' }, { status: 500 })
  }
}
