import { prisma } from '@/lib/prisma'
import { calculateExerciseCalories } from '@/lib/exercise/calories'
import { getHealthProfileForUser } from '@/lib/exercise/health-profile'

export type ExerciseIngestSource = 'FITBIT' | 'GARMIN'

export type IngestExerciseEntryInput = {
  userId: string
  source: ExerciseIngestSource
  deviceId: string
  localDate: string // YYYY-MM-DD
  startTime?: Date | null
  durationMinutes: number
  calories?: number | null
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

  if (calories === null && met !== null && Number.isFinite(met) && met > 0) {
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
  } as const

  if (existing) {
    const entry = await prisma.exerciseEntry.update({
      where: { id: existing.id },
      data,
    })
    return { created: false, entry }
  }

  const entry = await prisma.exerciseEntry.create({ data })
  return { created: true, entry }
}

