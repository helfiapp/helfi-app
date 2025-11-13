import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scheduleAllActiveReminders } from '@/lib/qstash'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Ensure table exists with full schema
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CheckinSettings (
      userId TEXT PRIMARY KEY,
      time1 TEXT NOT NULL,
      time2 TEXT NOT NULL,
      time3 TEXT NOT NULL,
      timezone TEXT NOT NULL,
      frequency INTEGER NOT NULL DEFAULT 3
    )
  `)
  
  // Migrate old schema if needed
  await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time2 TEXT NOT NULL DEFAULT '18:00'`).catch(() => {})
  await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time3 TEXT NOT NULL DEFAULT '21:00'`).catch(() => {})
  await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS frequency INTEGER NOT NULL DEFAULT 3`).catch(() => {})

  // Load user's settings
  const rows: Array<{ time1: string; time2: string; time3: string; timezone: string; frequency: number }> =
    await prisma.$queryRawUnsafe(
      `SELECT time1, time2, time3, timezone, frequency FROM CheckinSettings WHERE userId = $1`,
      user.id
    )

  if (rows.length > 0) {
    return NextResponse.json(rows[0])
  }

  // Return defaults if no settings exist
  return NextResponse.json({
    time1: '12:30',
    time2: '18:30',
    time3: '21:30',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Melbourne',
    frequency: 3
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  let { time1, time2, time3, timezone, frequency } = body as any

  // Normalize time on the server to avoid client formatting issues
  const normalizeTime = (input?: string, defaultValue: string = '21:00'): string => {
    if (!input) return defaultValue
    const s = String(input).trim().toLowerCase()
    const m24 = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
    if (m24) return `${m24[1].padStart(2,'0')}:${m24[2]}`
    const m12 = s.match(/^([0-1]?\d):([0-5]\d)\s*(am|pm)$/)
    if (m12) {
      let h = parseInt(m12[1], 10)
      const mm = m12[2]
      const ap = m12[3]
      if (ap === 'pm' && h !== 12) h += 12
      if (ap === 'am' && h === 12) h = 0
      return `${String(h).padStart(2,'0')}:${mm}`
    }
    // Fallback: digits HHMM
    const digits = s.replace(/[^0-9]/g, '')
    if (digits.length >= 3) {
      const h = parseInt(digits.slice(0, digits.length - 2), 10)
      const mm = parseInt(digits.slice(-2), 10)
      return `${String(Math.max(0, Math.min(23, h))).padStart(2,'0')}:${String(Math.max(0, Math.min(59, mm))).padStart(2,'0')}`
    }
    return defaultValue
  }

  // Normalize all times with sensible defaults
  time1 = normalizeTime(time1, '12:30')
  time2 = normalizeTime(time2, '18:30')
  time3 = normalizeTime(time3, '21:30')
  timezone = (timezone && String(timezone).trim()) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Melbourne'
  frequency = Math.max(1, Math.min(3, parseInt(String(frequency || 3), 10)))

  // Auto-create table with full schema
  try {
    console.log('Saving CheckinSettings for', user.id, { time1, time2, time3, timezone, frequency })
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS CheckinSettings (
        userId TEXT PRIMARY KEY,
        time1 TEXT NOT NULL,
        time2 TEXT NOT NULL,
        time3 TEXT NOT NULL,
        timezone TEXT NOT NULL,
        frequency INTEGER NOT NULL DEFAULT 3
      )
    `)
    
    // Migrate old schema if needed
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time2 TEXT NOT NULL DEFAULT '18:00'`).catch(() => {})
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time3 TEXT NOT NULL DEFAULT '21:00'`).catch(() => {})
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS frequency INTEGER NOT NULL DEFAULT 3`).catch(() => {})
    
    // Migrate existing records that only have time1
    await prisma.$executeRawUnsafe(`
      UPDATE CheckinSettings 
      SET time2 = COALESCE(NULLIF(time2, ''), '18:00'),
          time3 = COALESCE(NULLIF(time3, ''), '21:00'),
          frequency = COALESCE(frequency, 3)
      WHERE time2 IS NULL OR time2 = '' OR time3 IS NULL OR time3 = ''
    `).catch(() => {})

    // Save settings
    await prisma.$executeRawUnsafe(
      `INSERT INTO CheckinSettings (userId, time1, time2, time3, timezone, frequency)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (userId) DO UPDATE SET 
         time1=EXCLUDED.time1, 
         time2=EXCLUDED.time2, 
         time3=EXCLUDED.time3, 
         timezone=EXCLUDED.timezone,
         frequency=EXCLUDED.frequency`,
      user.id, time1, time2, time3, timezone, frequency
    )
    // Schedule next occurrences for all active reminders (best-effort, non-blocking)
    scheduleAllActiveReminders(user.id, { time1, time2, time3, timezone, frequency }).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('checkins settings save error', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to save settings', detail: message }, { status: 500 })
  }
}


