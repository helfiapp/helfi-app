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
  if (value === null || value === undefined || typeof value === 'boolean') return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function isCalendarDate(value: string) {
  if (!DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function readSelectedSource(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid activity source')
  const item = value as Record<string, unknown>
  const sourceId = typeof item.sourceId === 'string' ? item.sourceId.trim() : ''
  const sourceName = typeof item.sourceName === 'string' ? item.sourceName.trim() : ''
  if (!sourceId || sourceId.length > 255 || !/^[A-Za-z0-9._-]+$/.test(sourceId) ||
      !sourceName || sourceName.length > 128 || /[\u0000-\u001f\u007f]/.test(sourceName)) {
    throw new Error('Invalid activity source')
  }
  return { sourceId, sourceName }
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
  let selectedSource: ReturnType<typeof readSelectedSource>
  try { selectedSource = readSelectedSource(body?.selectedSource) } catch {
    return NextResponse.json({ error: 'Invalid activity source' }, { status: 400 })
  }

  if (source !== 'APPLE_HEALTH') {
    return NextResponse.json({ error: 'Unsupported source' }, { status: 400 })
  }
  if (!isCalendarDate(date)) {
    return NextResponse.json({ error: 'Missing or invalid date (YYYY-MM-DD)' }, { status: 400 })
  }
  if (caloriesKcal === null || caloriesKcal <= 0 || caloriesKcal > 50_000) {
    return NextResponse.json({ error: 'No Apple Health activity calories found for this date' }, { status: 400 })
  }
  if ((steps !== null && steps < 0) || (distanceKm !== null && distanceKm < 0)) {
    return NextResponse.json({ error: 'Activity readings must not be negative' }, { status: 400 })
  }

  const result = await ingestExerciseEntry({
    userId,
    source: 'APPLE_HEALTH',
    deviceId: `apple-health:${date}`,
    localDate: date,
    durationMinutes,
    calories: caloriesKcal,
    distanceKm,
    label: selectedSource ? `${selectedSource.sourceName} via Apple Health` : 'Apple Health activity',
    rawPayload: {
      source: 'APPLE_HEALTH',
      steps: steps !== null ? Math.max(0, Math.round(steps)) : null,
      distanceKm: distanceKm !== null ? Math.max(0, distanceKm) : null,
      caloriesKcal,
      selectedSource,
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
