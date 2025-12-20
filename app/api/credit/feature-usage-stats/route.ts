import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type RangeKey = '7d' | '1m' | '2m' | '6m' | 'all' | 'custom'

type UsageKey =
  | 'foodAnalysis'
  | 'symptomAnalysis'
  | 'medicalImageAnalysis'
  | 'insightsGeneration'
  | 'chatLight'

type UsageStatsResponse = {
  range: {
    key: RangeKey
    start: string | null
    end: string | null
  }
  usage: Record<UsageKey, number>
}

function parseIsoDateOnly(value: string): Date | null {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999))
}

function subtractMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth()
  const day = d.getUTCDate()
  const hours = d.getUTCHours()
  const minutes = d.getUTCMinutes()
  const seconds = d.getUTCSeconds()
  const ms = d.getUTCMilliseconds()

  const targetMonth = month - months
  const firstOfTarget = new Date(Date.UTC(year, targetMonth, 1, hours, minutes, seconds, ms))
  const lastDayTargetMonth = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate()
  const safeDay = Math.min(day, lastDayTargetMonth)
  return new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth(), safeDay, hours, minutes, seconds, ms))
}

function getRangeFromRequest(req: NextRequest): { key: RangeKey; start: Date | null; end: Date | null } | { error: string } {
  const url = new URL(req.url)
  const key = (url.searchParams.get('range') || '7d') as RangeKey
  const now = new Date()

  if (key === 'all') {
    return { key, start: null, end: null }
  }

  if (key === '7d') {
    return { key, start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now }
  }
  if (key === '1m') {
    return { key, start: subtractMonthsUtc(now, 1), end: now }
  }
  if (key === '2m') {
    return { key, start: subtractMonthsUtc(now, 2), end: now }
  }
  if (key === '6m') {
    return { key, start: subtractMonthsUtc(now, 6), end: now }
  }

  if (key === 'custom') {
    const startRaw = url.searchParams.get('start') || ''
    const endRaw = url.searchParams.get('end') || ''
    const start = parseIsoDateOnly(startRaw)
    const endStartOfDay = parseIsoDateOnly(endRaw)
    if (!start || !endStartOfDay) {
      return { error: 'Invalid custom range. Use start=YYYY-MM-DD&end=YYYY-MM-DD.' }
    }
    const end = endOfUtcDay(endStartOfDay)
    if (start.getTime() > end.getTime()) {
      return { error: 'Invalid custom range. Start date must be before end date.' }
    }
    return { key, start, end }
  }

  return { error: 'Invalid range. Use range=7d|1m|2m|6m|all|custom.' }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const range = getRangeFromRequest(req)
  if ('error' in range) {
    return NextResponse.json({ error: range.error }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      totalFoodAnalysisCount: true,
      monthlyFoodAnalysisUsed: true,
    },
  })

  const where: any = {
    userId: session.user.id,
    success: true,
  }
  if (range.start && range.end) {
    where.createdAt = { gte: range.start, lte: range.end }
  } else if (range.start) {
    where.createdAt = { gte: range.start }
  } else if (range.end) {
    where.createdAt = { lte: range.end }
  }

  const events = await prisma.aIUsageEvent.findMany({
    where,
    select: {
      feature: true,
      scanId: true,
      runId: true,
      createdAt: true,
    },
  })

  // Food "times used" should match what the user experiences (including cached results),
  // not just the number of AI calls. The most reliable proxy we have today is FoodLog
  // creation count in the selected time window.
  const foodLogWhere: any = { userId: session.user.id }
  if (range.start && range.end) {
    foodLogWhere.createdAt = { gte: range.start, lte: range.end }
  } else if (range.start) {
    foodLogWhere.createdAt = { gte: range.start }
  } else if (range.end) {
    foodLogWhere.createdAt = { lte: range.end }
  }
  // Best-effort filter to focus on analyzed entries (most analyzed entries have nutrients/items).
  foodLogWhere.OR = [{ nutrients: { not: null } }, { items: { not: null } }, { imageUrl: { not: null } }]
  const foodLogCount = await prisma.foodLog.count({ where: foodLogWhere }).catch(async () => {
    // Fallback: count all food logs if JSON filtering isn't supported on this DB version.
    const fallbackWhere: any = { userId: session.user.id }
    if (foodLogWhere.createdAt) fallbackWhere.createdAt = foodLogWhere.createdAt
    return prisma.foodLog.count({ where: fallbackWhere })
  })

  const foodActionIds = new Set<string>()
  let symptomCount = 0
  let medicalCount = 0
  let chatLightCount = 0

  const insightsRunIds = new Set<string>()
  let insightsLandingCount = 0

  for (const ev of events) {
    const f = String(ev.feature || '')

    // Food photo analysis (AI calls only): keep this for fallback/debug, but prefer FoodLog count.
    if (
      (f === 'food:image-analysis' || f === 'food:text-analysis' || f === 'food:analyze-packaged') &&
      !f.includes('reanalysis')
    ) {
      // Some endpoints double-log the same run; only trust scanId-based events for food.
      if (typeof ev.scanId === 'string' && ev.scanId.trim().length > 0) {
        foodActionIds.add(ev.scanId.trim())
      }
      continue
    }

    if (f === 'symptoms:analysis') {
      symptomCount += 1
      continue
    }

    if (f === 'medical-image:analysis') {
      medicalCount += 1
      continue
    }

    if (f === 'symptoms:chat' || f === 'medical-image:chat') {
      chatLightCount += 1
      continue
    }

    // Insights generation: count one per runId when present, otherwise only count the single-call landing generation.
    if (f.startsWith('insights:') && f !== 'insights:ask' && f !== 'insights:unknown') {
      if (typeof ev.runId === 'string' && ev.runId.trim().length > 0) {
        insightsRunIds.add(ev.runId.trim())
      } else if (f === 'insights:landing-generate') {
        insightsLandingCount += 1
      }
    }
  }

  const payload: UsageStatsResponse = {
    range: {
      key: range.key,
      start: range.start ? range.start.toISOString() : null,
      end: range.end ? range.end.toISOString() : null,
    },
    usage: {
      foodAnalysis:
        range.key === 'all'
          ? Math.max(
              Number(foodLogCount || 0),
              Number(user?.totalFoodAnalysisCount || 0),
              Number(user?.monthlyFoodAnalysisUsed || 0),
              Number(foodActionIds.size || 0)
            )
          : Math.max(Number(foodLogCount || 0), Number(foodActionIds.size || 0)),
      symptomAnalysis: symptomCount,
      medicalImageAnalysis: medicalCount,
      insightsGeneration: insightsRunIds.size + insightsLandingCount,
      chatLight: chatLightCount,
    },
  }

  return NextResponse.json(payload)
}
