import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { ensureFitbitDataSchema } from '@/lib/fitbit-db'

/**
 * Seed demo Fitbit data for testing
 * POST /api/fitbit/demo/seed
 * Requires admin authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Ensure FitbitData schema exists (idempotent)
    await ensureFitbitDataSchema()

    // Check admin authentication
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    // Allow temporary admin token during transition
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      )
    }

    // Get current user session
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'User session required' },
        { status: 401 }
      )
    }

    const userId = session.user.id

    // Check if user already has Fitbit account connected
    const existingAccount = await prisma.account.findFirst({
      where: {
        userId,
        provider: 'fitbit',
      },
    })

    // If no Fitbit account exists, create a demo one
    if (!existingAccount) {
      try {
        await prisma.account.create({
          data: {
            userId,
            type: 'oauth',
            provider: 'fitbit',
            providerAccountId: 'demo-user-' + userId.substring(0, 8),
            access_token: 'demo-token',
            refresh_token: 'demo-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 86400 * 365, // 1 year from now
            token_type: 'Bearer',
            scope: 'activity heartrate sleep profile weight',
          },
        })
      } catch (accountError: any) {
        console.error('❌ Error creating demo Fitbit account:', accountError)
        // If account creation fails but it's a unique constraint error, continue
        // (account might have been created between check and create)
        if (!accountError?.code?.includes('P2002')) {
          throw accountError
        }
      }
    }

    // Generate 30 days of demo data
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Normalize today to midnight
    const dataTypes = ['steps', 'heartrate', 'sleep', 'weight']
    const created: string[] = []

    for (let i = 0; i < 30; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      const dateForDb = new Date(dateStr + 'T00:00:00.000Z') // Ensure UTC midnight
      
      try {

      // Steps data - varies between 5000-15000 steps
      const steps = Math.floor(Math.random() * 10000) + 5000
      await prisma.fitbitData.upsert({
        where: {
          userId_date_dataType: {
            userId,
            date: dateForDb,
            dataType: 'steps',
          },
        },
        update: {
          value: {
            summary: {
              steps: steps,
              'caloriesOut': Math.floor(steps * 0.04),
              'distance': [
                { activity: 'total', distance: Math.round((steps * 0.0008) * 100) / 100 }
              ],
              'floors': Math.floor(steps / 200),
              'elevation': Math.floor(steps / 100),
            },
          },
          syncedAt: new Date(),
        },
        create: {
          userId,
          date: dateForDb,
          dataType: 'steps',
          value: {
            summary: {
              steps: steps,
              'caloriesOut': Math.floor(steps * 0.04),
              'distance': [
                { activity: 'total', distance: Math.round((steps * 0.0008) * 100) / 100 }
              ],
              'floors': Math.floor(steps / 200),
              'elevation': Math.floor(steps / 100),
            },
          },
        },
      })
      created.push(`steps-${dateStr}`)

      // Heart rate data - resting HR between 55-75 bpm
      const restingHR = Math.floor(Math.random() * 20) + 55
      await prisma.fitbitData.upsert({
        where: {
          userId_date_dataType: {
            userId,
            date: dateForDb,
            dataType: 'heartrate',
          },
        },
        update: {
          value: {
            'activities-heart': [
              {
                dateTime: dateStr,
                value: {
                  restingHeartRate: restingHR,
                  heartRateZones: [
                    { name: 'Out of Range', min: 30, max: 102, minutes: Math.floor(Math.random() * 200) + 400 },
                    { name: 'Fat Burn', min: 102, max: 138, minutes: Math.floor(Math.random() * 60) + 20 },
                    { name: 'Cardio', min: 138, max: 170, minutes: Math.floor(Math.random() * 30) },
                    { name: 'Peak', min: 170, max: 220, minutes: Math.floor(Math.random() * 10) },
                  ],
                },
              },
            ],
          },
          syncedAt: new Date(),
        },
        create: {
          userId,
          date: dateForDb,
          dataType: 'heartrate',
          value: {
            'activities-heart': [
              {
                dateTime: dateStr,
                value: {
                  restingHeartRate: restingHR,
                  heartRateZones: [
                    { name: 'Out of Range', min: 30, max: 102, minutes: Math.floor(Math.random() * 200) + 400 },
                    { name: 'Fat Burn', min: 102, max: 138, minutes: Math.floor(Math.random() * 60) + 20 },
                    { name: 'Cardio', min: 138, max: 170, minutes: Math.floor(Math.random() * 30) },
                    { name: 'Peak', min: 170, max: 220, minutes: Math.floor(Math.random() * 10) },
                  ],
                },
              },
            ],
          },
        },
      })
      created.push(`heartrate-${dateStr}`)

      // Sleep data - 6-9 hours of sleep
      const sleepMinutes = Math.floor(Math.random() * 180) + 360 // 6-9 hours
      const sleepStart = new Date(date)
      sleepStart.setHours(22 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0)
      const sleepEnd = new Date(sleepStart)
      sleepEnd.setMinutes(sleepEnd.getMinutes() + sleepMinutes)

      await prisma.fitbitData.upsert({
        where: {
          userId_date_dataType: {
            userId,
            date: dateForDb,
            dataType: 'sleep',
          },
        },
        update: {
          value: {
            sleep: [
              {
                dateOfSleep: dateStr,
                duration: sleepMinutes * 60000, // milliseconds
                efficiency: Math.floor(Math.random() * 15) + 85, // 85-100%
                minutesAsleep: sleepMinutes - Math.floor(Math.random() * 30),
                minutesAwake: Math.floor(Math.random() * 30),
                startTime: sleepStart.toISOString(),
                endTime: sleepEnd.toISOString(),
                timeInBed: sleepMinutes,
                type: 'stages',
                levels: {
                  summary: {
                    deep: { minutes: Math.floor(sleepMinutes * 0.2), thirtyDayAvgMinutes: Math.floor(sleepMinutes * 0.2) },
                    light: { minutes: Math.floor(sleepMinutes * 0.5), thirtyDayAvgMinutes: Math.floor(sleepMinutes * 0.5) },
                    rem: { minutes: Math.floor(sleepMinutes * 0.2), thirtyDayAvgMinutes: Math.floor(sleepMinutes * 0.2) },
                    wake: { minutes: Math.floor(sleepMinutes * 0.1), thirtyDayAvgMinutes: Math.floor(sleepMinutes * 0.1) },
                  },
                },
              },
            ],
            summary: {
              totalSleepRecords: 1,
              totalMinutesAsleep: sleepMinutes,
              totalTimeInBed: sleepMinutes,
            },
          },
          syncedAt: new Date(),
        },
        create: {
          userId,
          date: dateForDb,
          dataType: 'sleep',
          value: {
            sleep: [
              {
                dateOfSleep: dateStr,
                duration: sleepMinutes * 60000,
                efficiency: Math.floor(Math.random() * 15) + 85,
                minutesAsleep: sleepMinutes - Math.floor(Math.random() * 30),
                minutesAwake: Math.floor(Math.random() * 30),
                startTime: sleepStart.toISOString(),
                endTime: sleepEnd.toISOString(),
                timeInBed: sleepMinutes,
                type: 'stages',
                levels: {
                  summary: {
                    deep: { minutes: Math.floor(sleepMinutes * 0.2), thirtyDayAvgMinutes: Math.floor(sleepMinutes * 0.2) },
                    light: { minutes: Math.floor(sleepMinutes * 0.5), thirtyDayAvgMinutes: Math.floor(sleepMinutes * 0.5) },
                    rem: { minutes: Math.floor(sleepMinutes * 0.2), thirtyDayAvgMinutes: Math.floor(sleepMinutes * 0.2) },
                    wake: { minutes: Math.floor(sleepMinutes * 0.1), thirtyDayAvgMinutes: Math.floor(sleepMinutes * 0.1) },
                  },
                },
              },
            ],
            summary: {
              totalSleepRecords: 1,
              totalMinutesAsleep: sleepMinutes,
              totalTimeInBed: sleepMinutes,
            },
          },
        },
      })
      created.push(`sleep-${dateStr}`)

      // Weight data - varies slightly around 70kg (154 lbs)
      if (i % 2 === 0) { // Every other day
        const weight = Math.round((70 + (Math.random() * 2 - 1)) * 10) / 10 // 69-71 kg
        await prisma.fitbitData.upsert({
          where: {
            userId_date_dataType: {
              userId,
              date: dateForDb,
              dataType: 'weight',
            },
          },
          update: {
            value: {
              weight: [
                {
                  bmi: Math.round((weight / (1.75 * 1.75)) * 10) / 10,
                  date: dateStr,
                  logId: Date.now(),
                  time: '08:00:00',
                  weight: weight,
                  source: 'API',
                },
              ],
            },
            syncedAt: new Date(),
          },
          create: {
            userId,
            date: dateForDb,
            dataType: 'weight',
            value: {
              weight: [
                {
                  bmi: Math.round((weight / (1.75 * 1.75)) * 10) / 10,
                  date: dateStr,
                  logId: Date.now(),
                  time: '08:00:00',
                  weight: weight,
                  source: 'API',
                },
              ],
            },
          },
        })
        created.push(`weight-${dateStr}`)
      }
      } catch (dayError: any) {
        console.error(`❌ Error creating demo data for date ${dateStr}:`, dayError)
        // Continue with other days even if one fails
        // But log the error for debugging
        throw new Error(`Failed to create demo data for ${dateStr}: ${dayError?.message || 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Demo data seeded successfully - ${created.length} records created`,
      recordsCreated: created.length,
      dateRange: {
        start: new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      },
    })
  } catch (error: any) {
    console.error('❌ Error seeding demo Fitbit data:', error)
    const errorMessage = error?.message || 'Unknown error'
    const errorCode = error?.code || 'UNKNOWN'
    const errorDetails = error?.stack || String(error)
    console.error('Error code:', errorCode)
    console.error('Error message:', errorMessage)
    console.error('Error details:', errorDetails)
    
    // Return detailed error in development, generic in production
    const details = process.env.NODE_ENV === 'development' 
      ? `${errorMessage} (Code: ${errorCode})`
      : errorMessage.includes('Unique constraint') 
        ? 'Data already exists. Try clearing demo data first.'
        : 'Failed to seed demo data'
    
    return NextResponse.json(
      { 
        error: 'Failed to seed demo data',
        details
      },
      { status: 500 }
    )
  }
}

/**
 * Clear demo Fitbit data
 * DELETE /api/fitbit/demo/seed
 * Requires admin authentication
 */
export async function DELETE(request: NextRequest) {
  try {
    // Ensure FitbitData schema exists (idempotent)
    await ensureFitbitDataSchema()

    // Check admin authentication
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    // Allow temporary admin token during transition
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      )
    }

    // Get current user session
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'User session required' },
        { status: 401 }
      )
    }

    const userId = session.user.id

    // Delete all Fitbit data for this user
    const deleted = await prisma.fitbitData.deleteMany({
      where: { userId },
    })

    // Optionally delete the demo Fitbit account
    const demoAccount = await prisma.account.findFirst({
      where: {
        userId,
        provider: 'fitbit',
        providerAccountId: { startsWith: 'demo-user-' },
      },
    })

    if (demoAccount) {
      await prisma.account.delete({
        where: { id: demoAccount.id },
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Demo data cleared successfully',
      recordsDeleted: deleted.count,
      accountDeleted: !!demoAccount,
    })
  } catch (error) {
    console.error('Error clearing demo Fitbit data:', error)
    return NextResponse.json(
      { error: 'Failed to clear demo data' },
      { status: 500 }
    )
  }
}

