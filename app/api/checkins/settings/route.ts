import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publishWithQStash, scheduleAllActiveReminders } from '@/lib/qstash'
import { isSubscriptionActive } from '@/lib/subscription-utils'

async function ensureCheckinSettingsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CheckinSettings (
      userId TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT true,
      time1 TEXT NOT NULL,
      time2 TEXT NOT NULL,
      time3 TEXT NOT NULL,
      time4 TEXT NOT NULL,
      timezone TEXT NOT NULL,
      frequency INTEGER NOT NULL DEFAULT 3
    )
  `)

  await prisma
    .$executeRawUnsafe(
      `ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true`
    )
    .catch(() => {})
  await prisma
    .$executeRawUnsafe(
      `ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time2 TEXT NOT NULL DEFAULT '18:30'`
    )
    .catch(() => {})
  await prisma
    .$executeRawUnsafe(
      `ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time3 TEXT NOT NULL DEFAULT '21:30'`
    )
    .catch(() => {})
  await prisma
    .$executeRawUnsafe(
      `ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time4 TEXT NOT NULL DEFAULT '09:00'`
    )
    .catch(() => {})
  await prisma
    .$executeRawUnsafe(
      `ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS frequency INTEGER NOT NULL DEFAULT 3`
    )
    .catch(() => {})
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { subscription: true, creditTopUps: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await ensureCheckinSettingsTable()
  const now = new Date()
  const hasSubscription = isSubscriptionActive(user.subscription, now)
  const hasPurchasedCredits = (user.creditTopUps || []).some(
    (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
  )
  const isPaidUser = hasSubscription || hasPurchasedCredits
  const maxFrequency = isPaidUser ? 4 : 1

  // Ensure table exists with full schema
  // await prisma.$executeRawUnsafe(`
  //   CREATE TABLE IF NOT EXISTS CheckinSettings (
  //     userId TEXT PRIMARY KEY,
  //     time1 TEXT NOT NULL,
  //     time2 TEXT NOT NULL,
  //     time3 TEXT NOT NULL,
  //     timezone TEXT NOT NULL,
  //     frequency INTEGER NOT NULL DEFAULT 3
  //   )
  // `)
  
  // // Migrate old schema if needed
  // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time2 TEXT NOT NULL DEFAULT '18:00'`).catch(() => {})
  // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time3 TEXT NOT NULL DEFAULT '21:00'`).catch(() => {})
  // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS frequency INTEGER NOT NULL DEFAULT 3`).catch(() => {})

  // Load user's settings
  const rows: Array<{ enabled: boolean; time1: string; time2: string; time3: string; time4: string; timezone: string; frequency: number }> =
    await prisma.$queryRawUnsafe(
      `SELECT enabled, time1, time2, time3, time4, timezone, frequency FROM CheckinSettings WHERE userId = $1`,
      user.id
    )

  if (rows.length > 0) {
    const row = rows[0]
    return NextResponse.json({
      ...row,
      frequency: Math.min(Math.max(1, row.frequency), maxFrequency),
      maxFrequency,
      isPaidUser,
    })
  }

  // Return defaults if no settings exist
  const defaultFrequency = Math.min(3, maxFrequency)
  return NextResponse.json({
    enabled: true,
    time1: '12:30',
    time2: '18:30',
    time3: '21:30',
    time4: '09:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Melbourne',
    frequency: defaultFrequency,
    maxFrequency,
    isPaidUser,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { subscription: true, creditTopUps: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  let { enabled, time1, time2, time3, time4, timezone, frequency } = body as any

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

  enabled = typeof enabled === 'boolean' ? enabled : true
  // Normalize all times with sensible defaults
  time1 = normalizeTime(time1, '12:30')
  time2 = normalizeTime(time2, '18:30')
  time3 = normalizeTime(time3, '21:30')
  time4 = normalizeTime(time4, '09:00')
  timezone = (timezone && String(timezone).trim()) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Melbourne'
  const now = new Date()
  const hasSubscription = isSubscriptionActive(user.subscription, now)
  const hasPurchasedCredits = (user.creditTopUps || []).some(
    (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
  )
  const isPaidUser = hasSubscription || hasPurchasedCredits
  const maxFrequency = isPaidUser ? 4 : 1
  frequency = Math.max(1, Math.min(maxFrequency, parseInt(String(frequency || 1), 10)))

  // Auto-create table with full schema
  try {
    await ensureCheckinSettingsTable()
    console.log('Saving CheckinSettings for', user.id, { enabled, time1, time2, time3, timezone, frequency })
    // await prisma.$executeRawUnsafe(`
    //   CREATE TABLE IF NOT EXISTS CheckinSettings (
    //     userId TEXT PRIMARY KEY,
    //     time1 TEXT NOT NULL,
    //     time2 TEXT NOT NULL,
    //     time3 TEXT NOT NULL,
    //     timezone TEXT NOT NULL,
    //     frequency INTEGER NOT NULL DEFAULT 3
    //   )
    // `)
    
    // // Migrate old schema if needed
    // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time2 TEXT NOT NULL DEFAULT '18:00'`).catch(() => {})
    // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time3 TEXT NOT NULL DEFAULT '21:00'`).catch(() => {})
    // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS frequency INTEGER NOT NULL DEFAULT 3`).catch(() => {})
    
    // // Migrate existing records that only have time1
    // await prisma.$executeRawUnsafe(`
    //   UPDATE CheckinSettings 
    //   SET time2 = COALESCE(NULLIF(time2, ''), '18:00'),
    //       time3 = COALESCE(NULLIF(time3, ''), '21:00'),
    //       frequency = COALESCE(frequency, 3)
    //   WHERE time2 IS NULL OR time2 = '' OR time3 IS NULL OR time3 = ''
    // `).catch(() => {})

    // Save settings
    await prisma.$queryRawUnsafe(
      `INSERT INTO CheckinSettings (userId, enabled, time1, time2, time3, time4, timezone, frequency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (userId) DO UPDATE SET 
         enabled=EXCLUDED.enabled,
         time1=EXCLUDED.time1, 
         time2=EXCLUDED.time2, 
         time3=EXCLUDED.time3, 
         time4=EXCLUDED.time4,
         timezone=EXCLUDED.timezone,
         frequency=EXCLUDED.frequency`,
      user.id, enabled, time1, time2, time3, time4, timezone, frequency
    )
    // Schedule next occurrences for all active reminders and capture outcomes
    const scheduleResults = enabled
      ? await scheduleAllActiveReminders(user.id, { time1, time2, time3, time4, timezone, frequency }).catch((error) => {
          console.error('[CHECKINS] Failed to schedule reminders via QStash', error)
          return []
        })
      : []

    const failedSchedules = scheduleResults.filter((result) => !result.scheduled)
    if (failedSchedules.length > 0) {
      console.error('[CHECKINS] QStash scheduling failures detected', { failedSchedules })
    }

    // If user saved shortly after a reminder time, send one immediately to avoid waiting until tomorrow.
    try {
      if (!enabled) {
        return NextResponse.json({ success: true, scheduleResults })
      }
      const now = new Date()
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      const parts = fmt.formatToParts(now)
      const ch = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
      const cm = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10)
      const currentTotal = ch * 60 + cm
      const sendWindowMinutes = 5
      const candidates: string[] = []
      if (frequency >= 1) candidates.push(time1)
      if (frequency >= 2) candidates.push(time2)
      if (frequency >= 3) candidates.push(time3)
      if (frequency >= 4) candidates.push(time4)
      for (const t of candidates) {
        const [hh, mm] = t.split(':').map(v => parseInt(v, 10))
        const target = hh * 60 + mm
        let diff = currentTotal - target
        if (diff < 0) diff += 1440
        if (diff >= 0 && diff <= sendWindowMinutes) {
          const publishResult = await publishWithQStash('/api/push/dispatch', {
            userId: user.id,
            reminderTime: t,
            timezone,
          }).catch(() => ({ ok: false, reason: 'exception' }))
          if (!publishResult?.ok) {
            console.warn('[CHECKINS] Failed to enqueue immediate reminder via QStash', {
              userId: user.id,
              reminderTime: t,
              reason: publishResult?.reason,
            })
          }
          break
        }
      }
    } catch {}

    return NextResponse.json({ success: true, scheduleResults })
  } catch (e) {
    console.error('checkins settings save error', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to save settings', detail: message }, { status: 500 })
  }
}
