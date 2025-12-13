import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fitbitApiRequest, getFitbitUserId } from '@/lib/fitbit-api'
import { ingestExerciseEntry } from '@/lib/exercise/ingest'
import { parseFitbitActivitiesToIngest } from '@/lib/exercise/fitbit-workouts'

/**
 * Sync Fitbit data for the authenticated user
 * POST /api/fitbit/sync
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const fitbitUserId = await getFitbitUserId(session.user.id)
    if (!fitbitUserId) {
      return NextResponse.json(
        { error: 'Fitbit account not connected' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const date = body.date || new Date().toISOString().split('T')[0] // Default to today
    const dataTypes = body.dataTypes || ['steps', 'heartrate', 'sleep', 'weight'] // Default to all

    const syncedData: any = {}

    // Sync steps
    if (dataTypes.includes('steps')) {
      const stepsResponse = await fitbitApiRequest(
        session.user.id,
        `/1/user/${fitbitUserId}/activities/date/${date}.json`
      )

      if (stepsResponse?.ok) {
        const stepsData = await stepsResponse.json()
        await prisma.fitbitData.upsert({
          where: {
            userId_date_dataType: {
              userId: session.user.id,
              date: new Date(date),
              dataType: 'steps',
            },
          },
          update: {
            value: stepsData.summary || stepsData,
            syncedAt: new Date(),
          },
          create: {
            userId: session.user.id,
            date: new Date(date),
            dataType: 'steps',
            value: stepsData.summary || stepsData,
          },
        })
        syncedData.steps = stepsData.summary || stepsData
      }
    }

    // Sync heart rate
    if (dataTypes.includes('heartrate')) {
      const hrResponse = await fitbitApiRequest(
        session.user.id,
        `/1/user/${fitbitUserId}/activities/heart/date/${date}/1d.json`
      )

      if (hrResponse?.ok) {
        const hrData = await hrResponse.json()
        await prisma.fitbitData.upsert({
          where: {
            userId_date_dataType: {
              userId: session.user.id,
              date: new Date(date),
              dataType: 'heartrate',
            },
          },
          update: {
            value: hrData,
            syncedAt: new Date(),
          },
          create: {
            userId: session.user.id,
            date: new Date(date),
            dataType: 'heartrate',
            value: hrData,
          },
        })
        syncedData.heartrate = hrData
      }
    }

    // Sync sleep
    if (dataTypes.includes('sleep')) {
      const sleepResponse = await fitbitApiRequest(
        session.user.id,
        `/1.2/user/${fitbitUserId}/sleep/date/${date}.json`
      )

      if (sleepResponse?.ok) {
        const sleepData = await sleepResponse.json()
        await prisma.fitbitData.upsert({
          where: {
            userId_date_dataType: {
              userId: session.user.id,
              date: new Date(date),
              dataType: 'sleep',
            },
          },
          update: {
            value: sleepData,
            syncedAt: new Date(),
          },
          create: {
            userId: session.user.id,
            date: new Date(date),
            dataType: 'sleep',
            value: sleepData,
          },
        })
        syncedData.sleep = sleepData
      }
    }

    // Sync weight
    if (dataTypes.includes('weight')) {
      const weightResponse = await fitbitApiRequest(
        session.user.id,
        `/1/user/${fitbitUserId}/body/log/weight/date/${date}.json`
      )

      if (weightResponse?.ok) {
        const weightData = await weightResponse.json()
        await prisma.fitbitData.upsert({
          where: {
            userId_date_dataType: {
              userId: session.user.id,
              date: new Date(date),
              dataType: 'weight',
            },
          },
          update: {
            value: weightData,
            syncedAt: new Date(),
          },
          create: {
            userId: session.user.id,
            date: new Date(date),
            dataType: 'weight',
            value: weightData,
          },
        })
        syncedData.weight = weightData
      }
    }

    // Sync activity/workouts (and ingest into Food Diary exercise log)
    if (dataTypes.includes('activity')) {
      const activityResponse = await fitbitApiRequest(
        session.user.id,
        `/1/user/${fitbitUserId}/activities/list.json?afterDate=${date}&sort=asc&offset=0&limit=100`
      )

      if (activityResponse?.ok) {
        const activityData = await activityResponse.json()
        await prisma.fitbitData.upsert({
          where: {
            userId_date_dataType: {
              userId: session.user.id,
              date: new Date(date),
              dataType: 'activity',
            },
          },
          update: {
            value: activityData,
            syncedAt: new Date(),
          },
          create: {
            userId: session.user.id,
            date: new Date(date),
            dataType: 'activity',
            value: activityData,
          },
        })
        syncedData.activity = activityData

        const workouts = parseFitbitActivitiesToIngest({ date, payload: activityData })
        for (const w of workouts as any[]) {
          await ingestExerciseEntry({
            userId: session.user.id,
            source: 'FITBIT',
            deviceId: `fitbit:${w.deviceId}`,
            localDate: date,
            startTime: w.startTime,
            durationMinutes: w.durationMinutes,
            calories: w.calories,
            label: w.label,
            rawPayload: w.raw,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      synced: syncedData,
      date,
    })
  } catch (error) {
    console.error('❌ Fitbit sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync Fitbit data' },
      { status: 500 }
    )
  }
}

/**
 * Get synced Fitbit data for the authenticated user
 * GET /api/fitbit/data
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const dataType = searchParams.get('dataType') // Optional filter

    const where: any = {
      userId: session.user.id,
      date: new Date(date),
    }

    if (dataType) {
      where.dataType = dataType
    }

    const data = await prisma.fitbitData.findMany({
      where,
      orderBy: {
        syncedAt: 'desc',
      },
    })

    return NextResponse.json({
      success: true,
      data,
      date,
    })
  } catch (error) {
    console.error('❌ Error fetching Fitbit data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Fitbit data' },
      { status: 500 }
    )
  }
}
