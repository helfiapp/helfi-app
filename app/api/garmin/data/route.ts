export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureGarminSchema } from '@/lib/garmin-db'

type DataType = 'steps' | 'heartrate' | 'sleep' | 'weight'

function parseDate(input: string | null): Date | null {
  if (!input) return null
  const [y, m, d] = input.split('-').map((v) => parseInt(v, 10))
  if (!y || !m || !d) return null
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  return Number.isNaN(dt.getTime()) ? null : dt
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function unwrapPayload(payload: any) {
  if (!payload) return payload
  if (typeof payload === 'object' && payload.data && typeof payload.data === 'object') return payload.data
  return payload
}

function payloadHasUserId(payload: any, expectedUserId: string) {
  const stack: any[] = [payload]
  while (stack.length) {
    const node = stack.pop()
    if (!node) continue
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item)
      continue
    }
    if (typeof node !== 'object') continue

    const possible = (node.userId ?? node.userid ?? node.user_id) as unknown
    if (typeof possible === 'string' && possible === expectedUserId) return true

    for (const v of Object.values(node)) stack.push(v)
  }
  return false
}

function toNumber(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function extractDateYmd(record: any): string | null {
  if (!record || typeof record !== 'object') return null

  const dateLike = [
    record.calendarDate,
    record.summaryDate,
    record.date,
    record.day,
    record.localDate,
    record.startDate,
  ].find((v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))

  if (typeof dateLike === 'string') return dateLike.slice(0, 10)

  const epochSeconds = toNumber(record.startTimeInSeconds ?? record.startTimestampInSeconds ?? record.startTimeSeconds)
  if (epochSeconds && epochSeconds > 0) {
    const dt = new Date(epochSeconds * 1000)
    return Number.isNaN(dt.getTime()) ? null : formatYmd(dt)
  }

  const epochMillis = toNumber(record.startTimeInMillis ?? record.startTimestampInMillis ?? record.startTimeMilliseconds)
  if (epochMillis && epochMillis > 0) {
    const dt = new Date(epochMillis)
    return Number.isNaN(dt.getTime()) ? null : formatYmd(dt)
  }

  return null
}

function findCandidateArrays(payload: any, baseType: string) {
  const candidates: any[][] = []
  if (!payload || typeof payload !== 'object') return candidates

  const keysToTry = [
    baseType,
    baseType.replace(/-/g, '_'),
    baseType.replace(/-/g, ''),
    baseType.endsWith('s') ? baseType.slice(0, -1) : `${baseType}s`,
  ]

  for (const key of keysToTry) {
    const v = (payload as any)[key]
    if (Array.isArray(v)) candidates.push(v)
  }

  if (candidates.length) return candidates

  for (const v of Object.values(payload)) {
    if (Array.isArray(v) && v.some((x) => x && typeof x === 'object')) {
      candidates.push(v as any[])
    }
  }

  return candidates
}

function extractMetricsFromRecord(baseType: string, record: any) {
  const ymd = extractDateYmd(record)
  if (!ymd) return null

  const normalizedType = baseType.toLowerCase()
  const out: {
    date: string
    steps?: number
    calories?: number
    distanceKm?: number
    restingHeartRate?: number
    sleepMinutes?: number
    weightKg?: number
  } = { date: ymd }

  // Steps / Daily summaries often carry steps, calories, distance, RHR.
  const steps =
    toNumber(record.steps ?? record.stepCount ?? record.totalSteps ?? record.stepsInDay) ??
    null
  if (steps != null && steps >= 0) out.steps = Math.round(steps)

  const calories =
    toNumber(record.activeKilocalories ?? record.totalKilocalories ?? record.kilocalories ?? record.calories) ??
    null
  if (calories != null && calories >= 0) out.calories = Math.round(calories)

  const distMeters =
    toNumber(record.distanceInMeters ?? record.distanceMeters ?? record.totalDistanceInMeters) ?? null
  if (distMeters != null && distMeters >= 0) out.distanceKm = distMeters / 1000

  const rhr =
    toNumber(
      record.restingHeartRateInBeatsPerMinute ??
        record.restingHeartRate ??
        record.restingHr ??
        record.rhr
    ) ?? null
  if (rhr != null && rhr > 0) out.restingHeartRate = Math.round(rhr)

  // Sleep endpoints usually carry a duration in seconds.
  if (normalizedType.includes('sleep')) {
    const sleepSeconds =
      toNumber(
        record.sleepTimeInSeconds ??
          record.totalSleepTimeInSeconds ??
          record.durationInSeconds ??
          record.sleepSeconds ??
          record.totalSleepSeconds
      ) ?? null
    if (sleepSeconds != null && sleepSeconds > 0) out.sleepMinutes = Math.round(sleepSeconds / 60)
  }

  // Body comps often carry weight in grams.
  if (normalizedType.includes('body') || normalizedType.includes('comp') || normalizedType.includes('weight')) {
    const grams = toNumber(record.weightInGrams) ?? null
    const kg =
      toNumber(record.weightInKiloGrams ?? record.weightKg) ??
      (grams != null ? grams / 1000 : null) ??
      null
    if (kg != null && kg > 0) out.weightKg = kg
  }

  // If we don’t know the endpoint, still accept common fields.
  if (!normalizedType.includes('sleep') && out.sleepMinutes == null) {
    const sleepSeconds = toNumber(record.sleepTimeInSeconds ?? record.totalSleepTimeInSeconds ?? record.durationInSeconds)
    if (sleepSeconds != null && sleepSeconds > 0) out.sleepMinutes = Math.round(sleepSeconds / 60)
  }

  return out
}

function isEpochType(baseType: string) {
  return baseType.toLowerCase().includes('epoch')
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Defensive: this repo doesn’t automatically run migrations on deploy.
  // Ensure Garmin tables exist before we query them.
  try {
    await ensureGarminSchema()
  } catch {}

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: 'garmin' },
    select: { providerAccountId: true },
  })

  const searchParams = request.nextUrl.searchParams
  const dataTypesParam = (searchParams.get('dataTypes') || '').trim()
  const requestedTypes = dataTypesParam
    ? (dataTypesParam.split(',').map((s) => s.trim().toLowerCase()) as DataType[])
    : (['steps', 'heartrate', 'sleep', 'weight'] as DataType[])

  const endParam = parseDate(searchParams.get('end'))
  const startParam = parseDate(searchParams.get('start'))

  const endDate = endParam || new Date()
  const startDate =
    startParam ||
    new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate() - 29))

  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()))
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()))

  const series: {
    steps: Array<{ date: string; steps?: number; calories?: number; distanceKm?: number }>
    heartrate: Array<{ date: string; restingHeartRate?: number }>
    sleep: Array<{ date: string; minutes?: number }>
    weight: Array<{ date: string; weightKg?: number }>
  } = { steps: [], heartrate: [], sleep: [], weight: [] }

  // Scaffold inclusive date range
  const dayCount = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1)
  const dates: string[] = []
  for (let i = 0; i < dayCount; i++) {
    const dt = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
    dates.push(formatYmd(dt))
  }
  for (const d of dates) {
    series.steps.push({ date: d })
    series.heartrate.push({ date: d })
    series.sleep.push({ date: d })
    series.weight.push({ date: d })
  }

  // Pull recent logs and derive daily metrics.
  const rawLogs = await prisma.garminWebhookLog.findMany({
    where: account?.providerAccountId
      ? {
          OR: [{ userId: session.user.id }, { userId: null }],
        }
      : { userId: session.user.id },
    orderBy: { receivedAt: 'desc' },
    take: 1500,
    select: { id: true, userId: true, dataType: true, payload: true, receivedAt: true },
  })

  // If we have a Garmin user id, attach any recent unassigned logs that obviously belong to this user.
  const extraIdsToAttach: string[] = []
  const logs = rawLogs.filter((l) => {
    if (l.userId === session.user.id) return true
    if (!account?.providerAccountId) return false
    if (l.userId != null) return false
    const ok = payloadHasUserId(l.payload, account.providerAccountId)
    if (ok) extraIdsToAttach.push(l.id)
    return ok
  })

  if (extraIdsToAttach.length) {
    await prisma.garminWebhookLog.updateMany({
      where: { id: { in: extraIdsToAttach.slice(0, 100) } },
      data: { userId: session.user.id },
    })
  }

  const byDate = new Map<string, ReturnType<typeof extractMetricsFromRecord> & {
    stepsEpochSum?: number
    caloriesEpochSum?: number
    distanceKmEpochSum?: number
    stepsSummary?: number
    caloriesSummary?: number
    distanceKmSummary?: number
  }>()

  for (const log of logs) {
    const baseType = (log.dataType || 'default').split('/')[0]
    const payload = unwrapPayload(log.payload)
    const arrays = findCandidateArrays(payload, baseType)
    const isEpoch = isEpochType(baseType)

    const considerRecords = (records: any[]) => {
      for (const record of records) {
        const extracted = extractMetricsFromRecord(baseType, record)
        if (!extracted) continue
        const date = extracted.date
        if (date < dates[0] || date > dates[dates.length - 1]) continue

        // We process newest logs first; only fill missing values so “latest wins”.
        const current = byDate.get(date) || ({ date } as any)
        const next: any = { ...current }

        if (isEpoch) {
          if (extracted.steps != null) next.stepsEpochSum = (next.stepsEpochSum ?? 0) + extracted.steps
          if (extracted.calories != null) next.caloriesEpochSum = (next.caloriesEpochSum ?? 0) + extracted.calories
          if (extracted.distanceKm != null) next.distanceKmEpochSum = (next.distanceKmEpochSum ?? 0) + extracted.distanceKm
        } else {
          if (next.stepsSummary == null && extracted.steps != null) next.stepsSummary = extracted.steps
          if (next.caloriesSummary == null && extracted.calories != null) next.caloriesSummary = extracted.calories
          if (next.distanceKmSummary == null && extracted.distanceKm != null) next.distanceKmSummary = extracted.distanceKm
        }
        if (next.restingHeartRate == null && extracted.restingHeartRate != null) next.restingHeartRate = extracted.restingHeartRate
        if (next.sleepMinutes == null && extracted.sleepMinutes != null) next.sleepMinutes = extracted.sleepMinutes
        if (next.weightKg == null && extracted.weightKg != null) next.weightKg = extracted.weightKg

        byDate.set(date, next)
      }
    }

    if (arrays.length) {
      for (const arr of arrays) considerRecords(arr)
    } else if (payload && typeof payload === 'object') {
      considerRecords([payload])
    }
  }

  // Apply extracted metrics into series
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i]
    const row: any = byDate.get(d)
    if (!row) continue

    if (requestedTypes.includes('steps')) {
      const steps = row.stepsSummary ?? row.stepsEpochSum
      const calories = row.caloriesSummary ?? row.caloriesEpochSum
      const distanceKm = row.distanceKmSummary ?? row.distanceKmEpochSum
      series.steps[i] = {
        date: d,
        steps: steps ?? undefined,
        calories: calories ?? undefined,
        distanceKm: distanceKm ?? undefined,
      }
    }
    if (requestedTypes.includes('heartrate')) {
      series.heartrate[i] = { date: d, restingHeartRate: row.restingHeartRate ?? undefined }
    }
    if (requestedTypes.includes('sleep')) {
      series.sleep[i] = { date: d, minutes: row.sleepMinutes ?? undefined }
    }
    if (requestedTypes.includes('weight')) {
      series.weight[i] = { date: d, weightKg: row.weightKg ?? undefined }
    }
  }

  return NextResponse.json({
    success: true,
    provider: 'garmin',
    range: { start: dates[0], end: dates[dates.length - 1] },
    series,
  })
}
