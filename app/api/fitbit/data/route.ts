import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureFitbitDataSchema } from '@/lib/fitbit-db'

type DataType = 'steps' | 'heartrate' | 'sleep' | 'weight'

function parseDate(input: string | null): Date | null {
  if (!input) return null
  // Expecting YYYY-MM-DD
  const [y, m, d] = input.split('-').map((v) => parseInt(v, 10))
  if (!y || !m || !d) return null
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  return isNaN(dt.getTime()) ? null : dt
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Get aggregated Fitbit data for a date range.
 * GET /api/fitbit/data?start=YYYY-MM-DD&end=YYYY-MM-DD&dataTypes=steps,heartrate,sleep,weight
 * Defaults: last 30 days, all data types.
 *
 * Response:
 * {
 *   success: true,
 *   range: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' },
 *   series: {
 *     steps: [{ date: 'YYYY-MM-DD', steps: number, calories?: number, distanceKm?: number }],
 *     heartrate: [{ date: 'YYYY-MM-DD', restingHeartRate?: number, zones?: any }],
 *     sleep: [{ date: 'YYYY-MM-DD', minutes?: number, efficiency?: number, stages?: any }],
 *     weight: [{ date: 'YYYY-MM-DD', weightKg?: number }]
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Ensure FitbitData table exists (idempotent)
    await ensureFitbitDataSchema()

    const searchParams = request.nextUrl.searchParams
    const dataTypesParam = (searchParams.get('dataTypes') || '').trim()
    const requestedTypes = dataTypesParam
      ? dataTypesParam.split(',').map((s) => s.trim().toLowerCase()) as DataType[]
      : (['steps', 'heartrate', 'sleep', 'weight'] as DataType[])

    const endParam = parseDate(searchParams.get('end'))
    const startParam = parseDate(searchParams.get('start'))

    // Default to last 30 days if not supplied
    const endDate = endParam || new Date()
    const startDate =
      startParam ||
      new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate() - 29))

    // Build inclusive window
    const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()))
    const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()))

    const data = await prisma.fitbitData.findMany({
      where: {
        userId: session.user.id,
        date: { gte: start, lte: end },
        dataType: { in: requestedTypes },
      },
      orderBy: [{ date: 'asc' }, { dataType: 'asc' }],
    })

    // Initialize series scaffolding by date
    const series: {
      steps: Array<{ date: string; steps?: number; calories?: number; distanceKm?: number }>
      heartrate: Array<{ date: string; restingHeartRate?: number; zones?: any }>
      sleep: Array<{ date: string; minutes?: number; efficiency?: number; stages?: any }>
      weight: Array<{ date: string; weightKg?: number }>
    } = { steps: [], heartrate: [], sleep: [], weight: [] }

    // Map to quick lookup by date+type
    const byKey = new Map<string, any>()
    data.forEach((row) => {
      try {
        // Ensure row.date is a Date object
        const dateObj = row.date instanceof Date ? row.date : new Date(row.date)
        const key = `${formatYmd(dateObj)}|${row.dataType}`
        byKey.set(key, row.value)
      } catch (dateError) {
        console.error('❌ Error processing row date:', dateError, 'Row:', row)
        // Skip malformed rows
      }
    })

    // Walk the range and extract values per day
    const cursor = new Date(start)
    while (cursor <= end) {
      const ymd = formatYmd(cursor)

      if (requestedTypes.includes('steps')) {
        const val = byKey.get(`${ymd}|steps`)
        // Steps can come from activities summary or daily totals
        let steps: number | undefined
        let calories: number | undefined
        let distanceKm: number | undefined
        if (val?.steps != null) steps = Number(val.steps)
        if (val?.summary?.steps != null) steps = Number(val.summary.steps)
        if (val?.summary?.caloriesOut != null) calories = Number(val.summary.caloriesOut)
        const distArray = val?.summary?.distances
        if (Array.isArray(distArray)) {
          const total = distArray.find((d: any) => d.activity === 'total')
          distanceKm = total ? Number(total.distance) : undefined
        }
        series.steps.push({ date: ymd, steps, calories, distanceKm })
      }

      if (requestedTypes.includes('heartrate')) {
        const val = byKey.get(`${ymd}|heartrate`)
        let restingHeartRate: number | undefined
        let zones: any
        if (Array.isArray(val?.['activities-heart'])) {
          const day = val['activities-heart'][0]
          restingHeartRate = day?.value?.restingHeartRate
          zones = day?.value?.heartRateZones
        }
        series.heartrate.push({ date: ymd, restingHeartRate, zones })
      }

      if (requestedTypes.includes('sleep')) {
        const val = byKey.get(`${ymd}|sleep`)
        // Fitbit sleep endpoint returns arrays; aggregate minutes
        let minutes: number | undefined
        let efficiency: number | undefined
        let stages: any
        if (Array.isArray(val?.sleep) && val.sleep.length > 0) {
          minutes = val.sleep.reduce((sum: number, s: any) => sum + (s.minutesAsleep || s.duration / 60000 || 0), 0)
          // pick the first for efficiency if present
          efficiency = val.sleep[0]?.efficiency
          stages = val.summary?.stages || undefined
        }
        series.sleep.push({ date: ymd, minutes, efficiency, stages })
      }

      if (requestedTypes.includes('weight')) {
        const val = byKey.get(`${ymd}|weight`)
        // Weight logs array; use latest entry of the day if exists
        let weightKg: number | undefined
        const logs = Array.isArray(val?.weight) ? val.weight : []
        if (logs.length > 0) {
          const last = logs[logs.length - 1]
          weightKg = last?.weight
        }
        series.weight.push({ date: ymd, weightKg })
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    return NextResponse.json({
      success: true,
      range: { start: formatYmd(start), end: formatYmd(end) },
      series,
    })
  } catch (error: any) {
    console.error('❌ Fitbit data range error:', error)
    console.error('Error message:', error?.message)
    console.error('Error stack:', error?.stack)
    console.error('Error code:', error?.code)
    
    const errorMessage = error?.message || 'Unknown error'
    const errorDetails = process.env.NODE_ENV === 'development' 
      ? `${errorMessage} (${error?.code || 'no code'})`
      : 'Failed to load Fitbit data'
    
    return NextResponse.json(
      { 
        error: 'Failed to load Fitbit data',
        details: errorDetails
      }, 
      { status: 500 }
    )
  }
}


