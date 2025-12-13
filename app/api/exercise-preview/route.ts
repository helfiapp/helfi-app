import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getHealthProfileForUser } from '@/lib/exercise/health-profile'
import { calculateExerciseCalories } from '@/lib/exercise/calories'
import { inferMetAndLabel } from '@/lib/exercise/met'

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

  if (!Number.isFinite(exerciseTypeId) || exerciseTypeId <= 0) {
    return NextResponse.json({ error: 'Invalid exerciseTypeId' }, { status: 400 })
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 24 * 60) {
    return NextResponse.json({ error: 'Invalid durationMinutes' }, { status: 400 })
  }
  if (distanceKm !== null && (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 500)) {
    return NextResponse.json({ error: 'Invalid distanceKm' }, { status: 400 })
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

  const inferred = inferMetAndLabel({
    exerciseName: type.name,
    baseMet: type.met,
    durationMinutes,
    distanceKm: distanceKm ?? null,
  })

  const calories = calculateExerciseCalories({
    met: inferred.met,
    weightKg: health.weightKg,
    durationMinutes: inferred.durationMinutes,
  })

  return NextResponse.json({
    calories,
    met: inferred.met,
    label: inferred.label,
  })
}

