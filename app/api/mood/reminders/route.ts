import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { scheduleAllMoodReminders } from '@/lib/qstash'

export const dynamic = 'force-dynamic'

function normalizeTime(input: unknown, fallback: string) {
  const s = String(input ?? '').trim()
  if (!s) return fallback
  const m24 = s.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (m24) return `${m24[1]}:${m24[2]}`
  return fallback
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function normalizeTimezone(input: unknown) {
  const tz = String(input ?? '').trim()
  if (!tz) return 'UTC'
  if (tz.length > 64) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await ensureMoodTables()

  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT enabled, time1, time2, time3, timezone, frequency
     FROM MoodReminderSettings
     WHERE userId = $1
     LIMIT 1`,
    user.id,
  )

  const row = rows[0] || null
  return NextResponse.json({
    enabled: row?.enabled ?? false,
    time1: row?.time1 ?? '20:00',
    time2: row?.time2 ?? '12:00',
    time3: row?.time3 ?? '18:00',
    timezone: row?.timezone ?? 'UTC',
    frequency: row?.frequency ?? 1,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => ({} as any))
  const enabled = !!body?.enabled
  const frequency = clampInt(body?.frequency, 1, 3, 1)
  const time1 = normalizeTime(body?.time1, '20:00')
  const time2 = normalizeTime(body?.time2, '12:00')
  const time3 = normalizeTime(body?.time3, '18:00')
  const timezone = normalizeTimezone(body?.timezone)

  await ensureMoodTables()

  await prisma.$queryRawUnsafe(
    `INSERT INTO MoodReminderSettings (userId, enabled, time1, time2, time3, timezone, frequency)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (userId) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       time1 = EXCLUDED.time1,
       time2 = EXCLUDED.time2,
       time3 = EXCLUDED.time3,
       timezone = EXCLUDED.timezone,
       frequency = EXCLUDED.frequency`,
    user.id,
    enabled,
    time1,
    time2,
    time3,
    timezone,
    frequency,
  )

  let scheduleResults: any[] = []
  if (enabled) {
    scheduleResults = await scheduleAllMoodReminders(user.id, {
      time1,
      time2,
      time3,
      timezone,
      frequency,
    }).catch((error) => {
      console.error('[MOOD] Failed to schedule reminders via QStash', error)
      return []
    })
    const failedSchedules = scheduleResults.filter((result) => !result.scheduled)
    if (failedSchedules.length > 0) {
      console.error('[MOOD] QStash scheduling failures detected', { failedSchedules })
    }
  }

  return NextResponse.json({ success: true, scheduleResults })
}
