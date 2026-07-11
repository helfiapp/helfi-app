import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fitbitApiRequest, getFitbitUserId } from '@/lib/fitbit-api'
import { ingestExerciseEntry } from '@/lib/exercise/ingest'
import { parseFitbitActivitiesToIngest } from '@/lib/exercise/fitbit-workouts'
import { extractGarminWorkouts } from '@/lib/exercise/garmin-workouts'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizeLocalDate(input: string) {
  const trimmed = (input || '').trim()
  if (!DATE_RE.test(trimmed)) return null
  return trimmed
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id || (await getUserIdFromNativeAuth(request))
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const date = normalizeLocalDate(body?.date || '')
  if (!date) {
    return NextResponse.json({ error: 'Missing or invalid date (YYYY-MM-DD)' }, { status: 400 })
  }

  const sources: string[] = Array.isArray(body?.sources) ? body.sources : []
  const wantFitbit = sources.length === 0 || sources.includes('FITBIT')
  const wantGarmin = sources.length === 0 || sources.includes('GARMIN')

  let created = 0
  let updated = 0
  const errors: Array<{ source: string; message: string }> = []

  if (wantFitbit) {
    try {
      const fitbitUserId = await getFitbitUserId(userId)
      if (fitbitUserId) {
        const resp = await fitbitApiRequest(
          userId,
          `/1/user/${fitbitUserId}/activities/list.json?afterDate=${date}&sort=asc&offset=0&limit=100`,
        )
        if (resp?.ok) {
          const payload = await resp.json()

          // Store raw payload for debugging/consistency (daily bucket)
          await prisma.fitbitData.upsert({
            where: {
              userId_date_dataType: {
                userId,
                date: new Date(date),
                dataType: 'activity',
              },
            },
            update: { value: payload, syncedAt: new Date() },
            create: {
              userId,
              date: new Date(date),
              dataType: 'activity',
              value: payload,
            },
          })

          const workouts = parseFitbitActivitiesToIngest({ date, payload })
          for (const w of workouts as any[]) {
            const res = await ingestExerciseEntry({
              userId,
              source: 'FITBIT',
              deviceId: `fitbit:${w.deviceId}`,
              localDate: date,
              startTime: w.startTime,
              durationMinutes: w.durationMinutes,
              calories: w.calories,
              label: w.label,
              rawPayload: w.raw,
            })
            if (res.entry) {
              if (res.created) created += 1
              else updated += 1
            }
          }
        }
      }
    } catch (error: any) {
      errors.push({ source: 'FITBIT', message: error?.message || 'Fitbit sync failed' })
    }
  }

  if (wantGarmin) {
    try {
      const hasGarmin = await prisma.account.findFirst({
        where: { userId, provider: 'garmin' },
        select: { id: true },
      })

      if (hasGarmin) {
        const recent = await prisma.garminWebhookLog.findMany({
          where: { userId },
          orderBy: { receivedAt: 'desc' },
          take: 250,
        })

        for (const row of recent) {
          const workouts = extractGarminWorkouts(row.payload)
          for (const w of workouts) {
            // Best-effort date filter using startTime in UTC.
            if (w.startTime) {
              const d = `${w.startTime.getUTCFullYear()}-${String(w.startTime.getUTCMonth() + 1).padStart(2, '0')}-${String(w.startTime.getUTCDate()).padStart(2, '0')}`
              if (d !== date) continue
            }

            const res = await ingestExerciseEntry({
              userId,
              source: 'GARMIN',
              deviceId: `garmin:${w.deviceId}`,
              localDate: date,
              startTime: w.startTime,
              durationMinutes: w.durationMinutes,
              calories: w.calories,
              label: w.label,
              rawPayload: w.raw,
            })
            if (res.entry) {
              if (res.created) created += 1
              else updated += 1
            }
          }
        }
      }
    } catch (error: any) {
      errors.push({ source: 'GARMIN', message: error?.message || 'Garmin import failed' })
    }
  }

  const entries = await prisma.exerciseEntry.findMany({
    where: { userId, localDate: date },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    include: { exerciseType: true },
  })
  const exerciseCalories = entries.reduce((sum, e) => sum + (Number(e.calories) || 0), 0)

  return NextResponse.json({
    date,
    created,
    updated,
    exerciseCalories,
    entries,
    errors,
  })
}
