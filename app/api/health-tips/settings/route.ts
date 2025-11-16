import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scheduleHealthTipWithQStash } from '@/lib/qstash'

/**
 * Health Tip Settings
 *
 * Lets users control:
 * - enabled: whether AI health tips are active
 * - frequency: 1–3 tips per day
 * - time1, time2, time3: local reminder times (HH:MM, 24h)
 * - timezone: IANA timezone string
 * - focus flags: which categories to prioritise (food, supplements, lifestyle)
 */

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Ensure table exists with full schema
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS HealthTipSettings (
      userId TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT true,
      time1 TEXT NOT NULL,
      time2 TEXT NOT NULL,
      time3 TEXT NOT NULL,
      timezone TEXT NOT NULL,
      frequency INTEGER NOT NULL DEFAULT 1,
      focusFood BOOLEAN NOT NULL DEFAULT true,
      focusSupplements BOOLEAN NOT NULL DEFAULT true,
      focusLifestyle BOOLEAN NOT NULL DEFAULT true
    )
  `)

  // Defensive migrations for new columns in case table was created with an older shape
  await prisma.$executeRawUnsafe(
    `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true`
  ).catch(() => {})
  await prisma.$executeRawUnsafe(
    `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS time2 TEXT NOT NULL DEFAULT '15:30'`
  ).catch(() => {})
  await prisma.$executeRawUnsafe(
    `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS time3 TEXT NOT NULL DEFAULT '20:30'`
  ).catch(() => {})
  await prisma.$executeRawUnsafe(
    `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS frequency INTEGER NOT NULL DEFAULT 1`
  ).catch(() => {})
  await prisma.$executeRawUnsafe(
    `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS focusFood BOOLEAN NOT NULL DEFAULT true`
  ).catch(() => {})
  await prisma.$executeRawUnsafe(
    `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS focusSupplements BOOLEAN NOT NULL DEFAULT true`
  ).catch(() => {})
  await prisma.$executeRawUnsafe(
    `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS focusLifestyle BOOLEAN NOT NULL DEFAULT true`
  ).catch(() => {})

  const rows: Array<{
    enabled: boolean
    time1: string
    time2: string
    time3: string
    timezone: string
    frequency: number
    focusFood: boolean
    focusSupplements: boolean
    focusLifestyle: boolean
  }> = await prisma.$queryRawUnsafe(
    `SELECT enabled, time1, time2, time3, timezone, frequency, focusFood, focusSupplements, focusLifestyle
     FROM HealthTipSettings
     WHERE userId = $1`,
    user.id
  )

  if (rows.length > 0) {
    return NextResponse.json(rows[0])
  }

  // Default settings when user has never configured health tips
  const defaultTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Melbourne'

  return NextResponse.json({
    enabled: false,
    time1: '11:30',
    time2: '15:30',
    time3: '20:30',
    timezone: defaultTimezone,
    frequency: 1,
    focusFood: true,
    focusSupplements: true,
    focusLifestyle: true,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  let {
    enabled,
    time1,
    time2,
    time3,
    timezone,
    frequency,
    focusFood,
    focusSupplements,
    focusLifestyle,
  } = body as any

  const normalizeTime = (input?: string, defaultValue = '11:30'): string => {
    if (!input) return defaultValue
    const s = String(input).trim().toLowerCase()
    // 24h HH:MM
    const m24 = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
    if (m24) return `${m24[1].padStart(2, '0')}:${m24[2]}`
    // 12h like 7:30 pm
    const m12 = s.match(/^([0-1]?\d):([0-5]\d)\s*(am|pm)$/)
    if (m12) {
      let h = parseInt(m12[1], 10)
      const mm = m12[2]
      const ap = m12[3]
      if (ap === 'pm' && h !== 12) h += 12
      if (ap === 'am' && h === 12) h = 0
      return `${String(h).padStart(2, '0')}:${mm}`
    }
    // Fallback: strip non-digits and interpret as HHMM
    const digits = s.replace(/[^0-9]/g, '')
    if (digits.length >= 3) {
      const h = parseInt(digits.slice(0, digits.length - 2), 10)
      const mm = parseInt(digits.slice(-2), 10)
      const hhClamped = Math.max(0, Math.min(23, h))
      const mmClamped = Math.max(0, Math.min(59, mm))
      return `${String(hhClamped).padStart(2, '0')}:${String(mmClamped).padStart(
        2,
        '0'
      )}`
    }
    return defaultValue
  }

  enabled = !!enabled
  time1 = normalizeTime(time1, '11:30')
  time2 = normalizeTime(time2, '15:30')
  time3 = normalizeTime(time3, '20:30')
  timezone =
    (timezone && String(timezone).trim()) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'Australia/Melbourne'
  frequency = Math.max(1, Math.min(3, parseInt(String(frequency || 1), 10)))
  focusFood = focusFood !== false
  focusSupplements = focusSupplements !== false
  focusLifestyle = focusLifestyle !== false

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS HealthTipSettings (
        userId TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT true,
        time1 TEXT NOT NULL,
        time2 TEXT NOT NULL,
        time3 TEXT NOT NULL,
        timezone TEXT NOT NULL,
        frequency INTEGER NOT NULL DEFAULT 1,
        focusFood BOOLEAN NOT NULL DEFAULT true,
        focusSupplements BOOLEAN NOT NULL DEFAULT true,
        focusLifestyle BOOLEAN NOT NULL DEFAULT true
      )
    `)

    // Defensive migrations
    await prisma.$executeRawUnsafe(
      `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true`
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS time2 TEXT NOT NULL DEFAULT '15:30'`
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS time3 TEXT NOT NULL DEFAULT '20:30'`
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS frequency INTEGER NOT NULL DEFAULT 1`
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS focusFood BOOLEAN NOT NULL DEFAULT true`
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS focusSupplements BOOLEAN NOT NULL DEFAULT true`
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS focusLifestyle BOOLEAN NOT NULL DEFAULT true`
    ).catch(() => {})

    await prisma.$executeRawUnsafe(
      `INSERT INTO HealthTipSettings (userId, enabled, time1, time2, time3, timezone, frequency, focusFood, focusSupplements, focusLifestyle)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (userId) DO UPDATE SET
         enabled          = EXCLUDED.enabled,
         time1            = EXCLUDED.time1,
         time2            = EXCLUDED.time2,
         time3            = EXCLUDED.time3,
         timezone         = EXCLUDED.timezone,
         frequency        = EXCLUDED.frequency,
         focusFood        = EXCLUDED.focusFood,
         focusSupplements = EXCLUDED.focusSupplements,
         focusLifestyle   = EXCLUDED.focusLifestyle`,
      user.id,
      enabled,
      time1,
      time2,
      time3,
      timezone,
      frequency,
      focusFood,
      focusSupplements,
      focusLifestyle
    )

    // Schedule AI health tip notifications only when enabled
    let scheduleResults: any[] = []
    if (enabled && frequency > 0) {
      const times: string[] = []
      if (frequency >= 1) times.push(time1)
      if (frequency >= 2) times.push(time2)
      if (frequency >= 3) times.push(time3)

      const tasks = times.map((t) =>
        scheduleHealthTipWithQStash(user.id, t, timezone).then((result) => ({
          reminderTime: t,
          ...result,
        }))
      )
      scheduleResults = await Promise.all(tasks).catch((error) => {
        console.error('[HEALTH_TIPS] Failed to schedule tips via QStash', error)
        return []
      })
    }

    return NextResponse.json({ success: true, scheduleResults })
  } catch (e) {
    console.error('health tips settings save error', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to save health tip settings', detail: message },
      { status: 500 }
    )
  }
}


