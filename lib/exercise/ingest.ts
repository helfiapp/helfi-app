import { prisma } from '@/lib/prisma'
import { calculateExerciseCalories } from '@/lib/exercise/calories'
import { getHealthProfileForUser } from '@/lib/exercise/health-profile'

export type ExerciseIngestSource = 'FITBIT' | 'GARMIN' | 'APPLE_HEALTH'

export type IngestExerciseEntryInput = {
  userId: string
  source: ExerciseIngestSource
  deviceId: string
  localDate: string // YYYY-MM-DD
  startTime?: Date | null
  durationMinutes: number
  calories?: number | null
  distanceKm?: number | null
  met?: number | null
  label: string
  rawPayload?: any
}

export async function ingestExerciseEntry(input: IngestExerciseEntryInput) {
  const durationMinutes = Math.max(1, Math.min(24 * 60, Math.floor(input.durationMinutes)))
  const deviceCalories = Number(input.calories)
  const met = input.met !== null && input.met !== undefined ? Number(input.met) : null

  let calories =
    Number.isFinite(deviceCalories) && deviceCalories > 0 ? deviceCalories : null

  if (calories === null && input.source !== 'APPLE_HEALTH' && met !== null && Number.isFinite(met) && met > 0) {
    const health = await getHealthProfileForUser(input.userId)
    if (health.weightKg) {
      calories = calculateExerciseCalories({
        met,
        weightKg: health.weightKg,
        durationMinutes,
      })
    }
  }

  if (calories === null || !Number.isFinite(calories) || calories <= 0) {
    return { created: false, entry: null as any }
  }

  const existing = await prisma.exerciseEntry.findFirst({
    where: { userId: input.userId, source: input.source, deviceId: input.deviceId },
  })

  const data = {
    userId: input.userId,
    localDate: input.localDate,
    startTime: input.startTime ?? null,
    durationMinutes,
    source: input.source,
    deviceId: input.deviceId,
    label: input.label,
    met: met !== null && Number.isFinite(met) && met > 0 ? met : 0,
    calories,
    rawPayload: input.rawPayload ?? null,
    ...(input.source === 'APPLE_HEALTH' ? {
      distanceKm: typeof input.distanceKm === 'number' && Number.isFinite(input.distanceKm) && input.distanceKm >= 0
        ? input.distanceKm : null,
    } : {}),
  } as const

  if (existing) {
    const entry = await prisma.exerciseEntry.update({
      where: { id: existing.id },
      data,
    })
    return { created: false, entry }
  }

  try {
    const entry = await prisma.exerciseEntry.create({ data })
    return { created: true, entry }
  } catch (error: any) {
    // Two foreground/manual imports can both observe no row. The existing
    // compound unique key prevents duplicates; refresh that same account's
    // daily Apple row if another import created it first.
    if (input.source !== 'APPLE_HEALTH' || error?.code !== 'P2002') throw error
    const concurrent = await prisma.exerciseEntry.findUnique({
      where: {
        userId_source_deviceId: {
          userId: input.userId, source: input.source, deviceId: input.deviceId,
        },
      },
    })
    if (!concurrent) throw error
    const entry = await prisma.exerciseEntry.update({ where: { id: concurrent.id }, data })
    return { created: false, entry }
  }
}
