import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type RangeKey = '7d' | '1m' | '2m' | '6m' | 'all' | 'custom'

type BillingUser = {
  id: string
  email: string
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
  const targetMonth = d.getUTCMonth() - months
  const firstOfTarget = new Date(Date.UTC(d.getUTCFullYear(), targetMonth, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()))
  const lastDayTargetMonth = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate()
  const safeDay = Math.min(d.getUTCDate(), lastDayTargetMonth)
  return new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth(), safeDay, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()))
}

function getRangeFromRequest(req: NextRequest): { key: RangeKey; start: Date | null; end: Date | null } | { error: string } {
  const url = new URL(req.url)
  const key = (url.searchParams.get('range') || '7d') as RangeKey
  const now = new Date()

  if (key === 'all') return { key, start: null, end: null }
  if (key === '7d') return { key, start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now }
  if (key === '1m') return { key, start: subtractMonthsUtc(now, 1), end: now }
  if (key === '2m') return { key, start: subtractMonthsUtc(now, 2), end: now }
  if (key === '6m') return { key, start: subtractMonthsUtc(now, 6), end: now }

  if (key === 'custom') {
    const start = parseIsoDateOnly(url.searchParams.get('start') || '')
    const endStart = parseIsoDateOnly(url.searchParams.get('end') || '')
    if (!start || !endStart) {
      return { error: 'Invalid custom range. Use start=YYYY-MM-DD&end=YYYY-MM-DD.' }
    }
    const end = endOfUtcDay(endStart)
    if (start.getTime() > end.getTime()) {
      return { error: 'Invalid custom range. Start date must be before end date.' }
    }
    return { key, start, end }
  }

  return { error: 'Invalid range. Use range=7d|1m|2m|6m|all|custom.' }
}

async function getBillingUser(request: NextRequest): Promise<BillingUser | null> {
  const session = await getServerSession(authOptions)
  const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
  if (sessionEmail) {
    const user = await prisma.user.findUnique({
      where: { email: sessionEmail },
      select: { id: true, email: true },
    })
    if (user?.id && user?.email) return user
  }

  const nativeUserId = await getUserIdFromNativeAuth(request)
  if (!nativeUserId) return null

  const user = await prisma.user.findUnique({
    where: { id: nativeUserId },
    select: { id: true, email: true },
  })
  if (!user?.id || !user?.email) return null
  return user
}

export async function GET(request: NextRequest) {
  try {
    const user = await getBillingUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const range = getRangeFromRequest(request)
    if ('error' in range) {
      return NextResponse.json({ error: range.error }, { status: 400 })
    }

    const where: any = {
      userId: user.id,
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
      },
    })

    const foodActionIds = new Set<string>()
    const insightsRunIds = new Set<string>()

    let symptomAnalysis = 0
    let medicalImageAnalysis = 0
    let insightsLanding = 0
    let chatLight = 0

    for (const ev of events) {
      const f = String(ev.feature || '')

      if ((f === 'food:image-analysis' || f === 'food:text-analysis' || f === 'food:analyze-packaged') && !f.includes('reanalysis')) {
        if (typeof ev.scanId === 'string' && ev.scanId.trim()) {
          foodActionIds.add(ev.scanId.trim())
        }
        continue
      }

      if (f === 'symptoms:analysis') {
        symptomAnalysis += 1
        continue
      }

      if (f === 'medical-image:analysis') {
        medicalImageAnalysis += 1
        continue
      }

      if (f === 'symptoms:chat' || f === 'medical-image:chat') {
        chatLight += 1
        continue
      }

      if (f.startsWith('insights:') && f !== 'insights:ask' && f !== 'insights:unknown') {
        if (typeof ev.runId === 'string' && ev.runId.trim()) {
          insightsRunIds.add(ev.runId.trim())
        } else if (f === 'insights:landing-generate') {
          insightsLanding += 1
        }
      }
    }

    return NextResponse.json({
      ok: true,
      range: {
        key: range.key,
        start: range.start ? range.start.toISOString() : null,
        end: range.end ? range.end.toISOString() : null,
      },
      usage: {
        foodAnalysis: foodActionIds.size,
        symptomAnalysis,
        medicalImageAnalysis,
        insightsGeneration: insightsRunIds.size + insightsLanding,
        chatLight,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to load usage data',
        message: error?.message || 'Unknown error',
      },
      { status: 500 },
    )
  }
}
