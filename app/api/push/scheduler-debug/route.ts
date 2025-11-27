import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Debug endpoint to check scheduler status and test timing
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  try {
    // Get user's settings
    const settingsRows: Array<{ time1: string; time2: string; time3: string; timezone: string; frequency: number }> =
      await prisma.$queryRawUnsafe(
        `SELECT time1, time2, time3, timezone, frequency FROM CheckinSettings WHERE userId = $1`,
        user.id
      )

    // Get subscription
    const subRows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
      `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
      user.id
    )

    // Calculate current time in user's timezone
    const nowUtc = new Date()
    const settings = settingsRows[0] || {
      time1: '12:30',
      time2: '18:30',
      time3: '21:30',
      timezone: 'Australia/Melbourne',
      frequency: 3
    }

    const tz = settings.timezone || 'Australia/Melbourne'
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(nowUtc)
    const hh = parts.find(p => p.type === 'hour')?.value || '00'
    const mm = parts.find(p => p.type === 'minute')?.value || '00'
    const current = `${hh}:${mm}`

    // Build reminder times
    const reminderTimes: string[] = []
    if (settings.frequency >= 1) reminderTimes.push(settings.time1)
    if (settings.frequency >= 2) reminderTimes.push(settings.time2)
    if (settings.frequency >= 3) reminderTimes.push(settings.time3)

    // Check if current time matches
    const matches = reminderTimes.map(reminderTime => {
      const [rh, rm] = reminderTime.split(':').map(Number)
      const [ch, cm] = [parseInt(hh, 10), parseInt(mm, 10)]
      return {
        reminderTime,
        currentTime: current,
        matches: rh === ch && rm === cm,
        details: `Reminder: ${rh}:${rm.toString().padStart(2, '0')}, Current: ${ch}:${cm.toString().padStart(2, '0')}`
      }
    })

    // Get recent scheduler logs
    let schedulerLogs: any[] = []
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS SchedulerLogs (
          id TEXT PRIMARY KEY,
          timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
          utcTime TEXT NOT NULL,
          usersProcessed INTEGER NOT NULL,
          notificationsSent INTEGER NOT NULL,
          errors INTEGER NOT NULL,
          debugInfo JSONB
        )
      `)
      schedulerLogs = await prisma.$queryRawUnsafe(`
        SELECT timestamp, utcTime, usersProcessed, notificationsSent, errors, debugInfo
        FROM SchedulerLogs
        ORDER BY timestamp DESC
        LIMIT 20
      `)
    } catch (e) {
      console.error('Failed to fetch scheduler logs:', e)
    }

    // Get recent QStash schedule attempts
    let qstashScheduleLogs: any[] = []
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS QstashScheduleLog (
          id TEXT PRIMARY KEY,
          createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
          userId TEXT,
          reminderTime TEXT,
          timezone TEXT,
          deltaMinutes INTEGER,
          notBeforeEpochSeconds BIGINT,
          scheduled BOOLEAN NOT NULL,
          httpStatus INTEGER,
          reason TEXT,
          responseSnippet TEXT
        )
      `)
      qstashScheduleLogs = await prisma.$queryRawUnsafe(`
        SELECT 
          createdAt,
          userId,
          reminderTime,
          timezone,
          deltaMinutes,
          notBeforeEpochSeconds::text AS "notBeforeEpochSeconds",
          scheduled,
          httpStatus,
          reason,
          responseSnippet,
          callbackUrl
        FROM QstashScheduleLog
        ORDER BY createdAt DESC
        LIMIT 20
      `)
    } catch (e) {
      console.error('Failed to fetch QStash schedule logs:', e)
    }

    return NextResponse.json({
      userId: user.id,
      hasSubscription: subRows.length > 0,
      settings: {
        time1: settings.time1,
        time2: settings.time2,
        time3: settings.time3,
        timezone: settings.timezone,
        frequency: settings.frequency
      },
      currentTime: {
        utc: nowUtc.toISOString(),
        local: current,
        timezone: tz
      },
      reminderTimes,
      matches,
      nextCronRuns: [
        'Every 5 minutes at :00, :05, :10, :15, :20, :25, :30, :35, :40, :45, :50, :55'
      ],
      recentSchedulerLogs: schedulerLogs,
      recentQstashScheduleLogs: qstashScheduleLogs
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

