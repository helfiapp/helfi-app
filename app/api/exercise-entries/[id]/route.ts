import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { calculateExerciseCalories } from '@/lib/exercise/calories'
import { getHealthProfileForUser } from '@/lib/exercise/health-profile'
import { inferMetAndLabel } from '@/lib/exercise/met'

type RouteParams = {
  params: { id: string }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = String(params.id || '')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const existing = await prisma.exerciseEntry.findUnique({ where: { id } })
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.exerciseEntry.delete({ where: { id } })

  const entries = await prisma.exerciseEntry.findMany({
    where: { userId: session.user.id, localDate: existing.localDate },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  })
  const exerciseCalories = entries.reduce((sum, e) => sum + (Number(e.calories) || 0), 0)

  return NextResponse.json({ success: true, date: existing.localDate, exerciseCalories })
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = String(params.id || '')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const existing = await prisma.exerciseEntry.findUnique({
    where: { id },
    include: { exerciseType: true },
  })
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.source !== 'MANUAL') {
    return NextResponse.json({ error: 'Only manual exercise entries can be edited.' }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const hasCaloriesOverride = body && Object.prototype.hasOwnProperty.call(body, 'caloriesOverride')
  const caloriesOverrideRaw = hasCaloriesOverride ? body.caloriesOverride : undefined
  const caloriesOverride =
    caloriesOverrideRaw === null || caloriesOverrideRaw === undefined || caloriesOverrideRaw === ''
      ? null
      : Number(caloriesOverrideRaw)

  const durationMinutes = body?.durationMinutes !== undefined ? Number(body.durationMinutes) : existing.durationMinutes
  const hasDistanceKm = body && Object.prototype.hasOwnProperty.call(body, 'distanceKm')
  const distanceKm = hasDistanceKm
    ? body.distanceKm === null || body.distanceKm === undefined
      ? null
      : Number(body.distanceKm)
    : existing.distanceKm

  const hasStartTime = body && Object.prototype.hasOwnProperty.call(body, 'startTime')
  const startTimeRaw = hasStartTime ? body.startTime : undefined
  const startTime =
    !hasStartTime ? existing.startTime : startTimeRaw ? new Date(String(startTimeRaw)) : null

  const exerciseTypeId =
    body?.exerciseTypeId !== undefined && body?.exerciseTypeId !== null ? Number(body.exerciseTypeId) : existing.exerciseTypeId

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 24 * 60) {
    return NextResponse.json({ error: 'Invalid durationMinutes' }, { status: 400 })
  }
  if (distanceKm !== null && (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 500)) {
    return NextResponse.json({ error: 'Invalid distanceKm' }, { status: 400 })
  }
  if (
    hasCaloriesOverride &&
    caloriesOverride !== null &&
    (!Number.isFinite(caloriesOverride) || caloriesOverride <= 0 || caloriesOverride > 50_000)
  ) {
    return NextResponse.json({ error: 'Invalid caloriesOverride' }, { status: 400 })
  }
  if (startTime && Number.isNaN(startTime.getTime())) {
    return NextResponse.json({ error: 'Invalid startTime' }, { status: 400 })
  }
  if (exerciseTypeId !== null && exerciseTypeId !== undefined && (!Number.isFinite(exerciseTypeId) || exerciseTypeId <= 0)) {
    return NextResponse.json({ error: 'Invalid exerciseTypeId' }, { status: 400 })
  }

  const type =
    exerciseTypeId && exerciseTypeId !== existing.exerciseTypeId
      ? await prisma.exerciseType.findUnique({ where: { id: exerciseTypeId } })
      : existing.exerciseType

  if (!type) {
    return NextResponse.json({ error: 'Exercise type not found' }, { status: 404 })
  }

  const inferred = inferMetAndLabel({
    exerciseName: type.name,
    baseMet: type.met,
    durationMinutes,
    distanceKm: distanceKm ?? null,
  })

  const existingOverrideRaw = (existing.rawPayload as any)?.caloriesOverride
  const existingOverride = Number(existingOverrideRaw)
  const hasExistingOverride = Number.isFinite(existingOverride) && existingOverride > 0 && existingOverride <= 50_000
  const caloriesOverrideRounded = caloriesOverride !== null ? Math.round(caloriesOverride) : null
  const effectiveOverride = hasCaloriesOverride
    ? caloriesOverrideRounded
    : hasExistingOverride
      ? Math.round(existingOverride)
      : null

  let calories: number
  if (effectiveOverride !== null) {
    if (!Number.isFinite(effectiveOverride) || effectiveOverride <= 0 || effectiveOverride > 50_000) {
      return NextResponse.json({ error: 'Invalid caloriesOverride' }, { status: 400 })
    }
    calories = effectiveOverride
  } else {
    const health = await getHealthProfileForUser(session.user.id)
    const weightToUse = health.weightKg
    if (!weightToUse) {
      return NextResponse.json(
        { error: 'Please update your weight in Health Setup to log exercise calories.' },
        { status: 400 },
      )
    }
    calories = calculateExerciseCalories({
      met: inferred.met,
      weightKg: weightToUse,
      durationMinutes: inferred.durationMinutes,
    })
  }

  let nextRawPayload = existing.rawPayload
  if (hasCaloriesOverride) {
    const base =
      existing.rawPayload && typeof existing.rawPayload === 'object' && !Array.isArray(existing.rawPayload)
        ? { ...(existing.rawPayload as Record<string, any>) }
        : {}
    if (caloriesOverrideRounded !== null) {
      base.caloriesOverride = caloriesOverrideRounded
    } else {
      delete base.caloriesOverride
    }
    nextRawPayload = Object.keys(base).length > 0 ? base : null
  }
  const rawPayloadUpdate = hasCaloriesOverride
    ? nextRawPayload === null
      ? Prisma.DbNull
      : nextRawPayload
    : undefined

  const updated = await prisma.exerciseEntry.update({
    where: { id: existing.id },
    data: {
      startTime,
      durationMinutes: inferred.durationMinutes,
      distanceKm: distanceKm !== null ? distanceKm : null,
      exerciseTypeId: type.id,
      label: inferred.label,
      met: inferred.met,
      calories,
      rawPayload: rawPayloadUpdate,
    },
    include: { exerciseType: true },
  })

  const entries = await prisma.exerciseEntry.findMany({
    where: { userId: session.user.id, localDate: existing.localDate },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    include: { exerciseType: true },
  })
  const exerciseCalories = entries.reduce((sum, e) => sum + (Number(e.calories) || 0), 0)

  return NextResponse.json({ success: true, entry: updated, date: existing.localDate, exerciseCalories, entries })
}
