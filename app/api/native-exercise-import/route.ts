import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { ingestExerciseEntry } from '@/lib/exercise/ingest'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'

export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function getRequestUserId(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUserId = typeof session?.user?.id === 'string' ? session.user.id : null
  if (sessionUserId) return sessionUserId
  return getUserIdFromNativeAuth(request)
}

function toFiniteNumber(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

export async function POST(request: NextRequest) {
  const userId = await getRequestUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const source = String(body?.source || '').trim().toUpperCase()
  const date = String(body?.date || '').trim()
  const caloriesKcal = toFiniteNumber(body?.caloriesKcal)
  const distanceKm = toFiniteNumber(body?.distanceKm)
  const steps = toFiniteNumber(body?.steps)
  const durationMinutes = Math.max(1, Math.min(24 * 60, Math.round(toFiniteNumber(body?.durationMinutes) || 1)))

  if (source !== 'APPLE_HEALTH') {
    return NextResponse.json({ error: 'Unsupported source' }, { status: 400 })
  }
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Missing or invalid date (YYYY-MM-DD)' }, { status: 400 })
  }
  if (caloriesKcal === null || caloriesKcal <= 0 || caloriesKcal > 50_000) {
    return NextResponse.json({ error: 'No Apple Health activity calories found for this date' }, { status: 400 })
  }

  const result = await ingestExerciseEntry({
    userId,
    source: 'APPLE_HEALTH',
    deviceId: `apple-health:${date}`,
    localDate: date,
    durationMinutes,
    calories: Math.round(caloriesKcal),
    label: 'Apple Health activity',
    rawPayload: {
      source: 'APPLE_HEALTH',
      steps: steps !== null ? Math.max(0, Math.round(steps)) : null,
      distanceKm: distanceKm !== null ? Math.max(0, distanceKm) : null,
      caloriesKcal,
    },
  })

  if (!result.entry) {
    return NextResponse.json({ error: 'No Apple Health activity found for this date' }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    created: result.created,
    entry: result.entry,
  })
}
