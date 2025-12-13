import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateExerciseCalories } from '@/lib/exercise/calories'
import { getHealthProfileForUser } from '@/lib/exercise/health-profile'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizeLocalDate(input: string) {
  const trimmed = (input || '').trim()
  if (!DATE_RE.test(trimmed)) return null
  return trimmed
}

function distanceBasedMet(params: { name: string; speedKmh: number }) {
  const n = (params.name || '').toLowerCase()
  const s = params.speedKmh
  if (!Number.isFinite(s) || s <= 0) return null

  if (n.includes('walk')) {
    if (s < 4) return 2.8
    if (s < 5.5) return 3.3
    if (s < 6.8) return 4.3
    return 6.5
  }

  if (n.includes('run') || n.includes('jog')) {
    if (s < 8.5) return 7.0
    if (s < 9.5) return 8.3
    if (s < 11.5) return 9.8
    return 11.5
  }

  if (n.includes('cycl') || n.includes('bike')) {
    if (s < 16) return 4.0
    if (s < 22) return 8.0
    return 10.0
  }

  return null
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

  const health = await getHealthProfileForUser(session.user.id)
  if (!health.weightKg) {
    return NextResponse.json(
      { error: 'Please update your weight in Health Setup to log exercise calories.' },
      { status: 400 },
    )
  }

  const durationMinsInt = Math.floor(durationMinutes)
  let met = type.met
  let label = type.name
  if (distanceKm !== null && Number.isFinite(distanceKm) && distanceKm > 0) {
    const speedKmh = distanceKm / (durationMinsInt / 60)
    const inferredMet = distanceBasedMet({ name: type.name, speedKmh })
    if (inferredMet) {
      met = inferredMet
      const base =
        type.name.toLowerCase().includes('walk')
          ? 'Walking'
          : type.name.toLowerCase().includes('run') || type.name.toLowerCase().includes('jog')
          ? 'Running'
          : type.name.toLowerCase().includes('cycl') || type.name.toLowerCase().includes('bike')
          ? 'Cycling'
          : type.name
      label = `${base} (${Math.round(speedKmh * 10) / 10} km/h)`
    }
  }

  const calories = calculateExerciseCalories({
    met,
    weightKg: health.weightKg,
    durationMinutes: durationMinsInt,
  })

  const entry = await prisma.exerciseEntry.create({
    data: {
      userId: session.user.id,
      localDate: date,
      startTime,
      durationMinutes: durationMinsInt,
      distanceKm: distanceKm !== null ? distanceKm : null,
      source: 'MANUAL',
      exerciseTypeId: type.id,
      label,
      met,
      calories,
    },
  })

  const entries = await prisma.exerciseEntry.findMany({
    where: { userId: session.user.id, localDate: date },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  })
  const exerciseCalories = entries.reduce((sum, e) => sum + (Number(e.calories) || 0), 0)

  return NextResponse.json({ entry, date, exerciseCalories })
}
