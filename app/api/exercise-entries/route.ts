import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateExerciseCalories } from '@/lib/exercise/calories'
import { getHealthProfileForUser } from '@/lib/exercise/health-profile'
import { inferMetAndLabel } from '@/lib/exercise/met'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizeLocalDate(input: string) {
  const trimmed = (input || '').trim()
  if (!DATE_RE.test(trimmed)) return null
  return trimmed
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = normalizeLocalDate(request.nextUrl.searchParams.get('date') || '')
  if (!date) {
    return NextResponse.json({ error: 'Missing or invalid date (YYYY-MM-DD)' }, { status: 400 })
  }

  const entries = await prisma.exerciseEntry.findMany({
    where: { userId: session.user.id, localDate: date },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    include: { exerciseType: true },
  })

  const exerciseCalories = entries.reduce((sum, e) => sum + (Number(e.calories) || 0), 0)
  return NextResponse.json({ date, exerciseCalories, entries })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const exerciseTypeId = Number(body?.exerciseTypeId)
  const durationMinutes = Number(body?.durationMinutes)
  const distanceKmRaw = body?.distanceKm
  const distanceKm = distanceKmRaw === null || distanceKmRaw === undefined ? null : Number(distanceKmRaw)
  const caloriesOverrideRaw = body?.caloriesOverride
  const caloriesOverride =
    caloriesOverrideRaw === null || caloriesOverrideRaw === undefined || caloriesOverrideRaw === ''
      ? null
      : Number(caloriesOverrideRaw)
  const date = normalizeLocalDate(body?.date || '')
  const startTime = body?.startTime ? new Date(String(body.startTime)) : null

  if (!Number.isFinite(exerciseTypeId) || exerciseTypeId <= 0) {
    return NextResponse.json({ error: 'Invalid exerciseTypeId' }, { status: 400 })
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 24 * 60) {
    return NextResponse.json({ error: 'Invalid durationMinutes' }, { status: 400 })
  }
  if (distanceKm !== null && (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 500)) {
    return NextResponse.json({ error: 'Invalid distanceKm' }, { status: 400 })
  }
  if (
    caloriesOverride !== null &&
    (!Number.isFinite(caloriesOverride) || caloriesOverride <= 0 || caloriesOverride > 50_000)
  ) {
    return NextResponse.json({ error: 'Invalid caloriesOverride' }, { status: 400 })
  }
  if (!date) {
    return NextResponse.json({ error: 'Missing or invalid date (YYYY-MM-DD)' }, { status: 400 })
  }
  if (startTime && Number.isNaN(startTime.getTime())) {
    return NextResponse.json({ error: 'Invalid startTime' }, { status: 400 })
  }

  const type = await prisma.exerciseType.findUnique({ where: { id: exerciseTypeId } })
  if (!type) {
    return NextResponse.json({ error: 'Exercise type not found' }, { status: 404 })
  }

  const inferred = inferMetAndLabel({
    exerciseName: type.name,
    baseMet: type.met,
    durationMinutes,
    distanceKm: distanceKm ?? null,
  })

  const caloriesOverrideRounded = caloriesOverride !== null ? Math.round(caloriesOverride) : null
  let calories: number

  if (caloriesOverrideRounded !== null) {
    if (caloriesOverrideRounded <= 0 || caloriesOverrideRounded > 50_000) {
      return NextResponse.json({ error: 'Invalid caloriesOverride' }, { status: 400 })
    }
    calories = caloriesOverrideRounded
  } else {
    const health = await getHealthProfileForUser(session.user.id)
    if (!health.weightKg) {
      return NextResponse.json(
        { error: 'Please update your weight in Health Setup to log exercise calories.' },
        { status: 400 },
      )
    }
    calories = calculateExerciseCalories({
      met: inferred.met,
      weightKg: health.weightKg,
      durationMinutes: inferred.durationMinutes,
    })
  }

  const rawPayload =
    caloriesOverrideRounded !== null ? { caloriesOverride: caloriesOverrideRounded } : undefined

  const entry = await prisma.exerciseEntry.create({
    data: {
      userId: session.user.id,
      localDate: date,
      startTime,
      durationMinutes: inferred.durationMinutes,
      distanceKm: distanceKm !== null ? distanceKm : null,
      source: 'MANUAL',
      exerciseTypeId: type.id,
      label: inferred.label,
      met: inferred.met,
      calories,
      rawPayload,
    },
  })

  const entries = await prisma.exerciseEntry.findMany({
    where: { userId: session.user.id, localDate: date },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    include: { exerciseType: true },
  })
  const exerciseCalories = entries.reduce((sum, e) => sum + (Number(e.calories) || 0), 0)

  return NextResponse.json({ entry, date, exerciseCalories })
}
