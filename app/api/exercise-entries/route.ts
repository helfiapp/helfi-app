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
  const date = normalizeLocalDate(body?.date || '')
  const startTime = body?.startTime ? new Date(String(body.startTime)) : null

  if (!Number.isFinite(exerciseTypeId) || exerciseTypeId <= 0) {
    return NextResponse.json({ error: 'Invalid exerciseTypeId' }, { status: 400 })
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 24 * 60) {
    return NextResponse.json({ error: 'Invalid durationMinutes' }, { status: 400 })
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

  const calories = calculateExerciseCalories({
    met: type.met,
    weightKg: health.weightKg,
    durationMinutes: Math.floor(durationMinutes),
  })

  const entry = await prisma.exerciseEntry.create({
    data: {
      userId: session.user.id,
      localDate: date,
      startTime,
      durationMinutes: Math.floor(durationMinutes),
      source: 'MANUAL',
      exerciseTypeId: type.id,
      label: type.name,
      met: type.met,
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
