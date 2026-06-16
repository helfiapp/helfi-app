import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'
import { publishWithQStash, scheduleAllActiveReminders } from '@/lib/qstash'
import { ensureCheckinTables } from '@/app/api/checkins/_db'
import { isSubscriptionActive } from '@/lib/subscription-utils'

async function getCheckinSettingsUser(req: NextRequest) {
  const nativeUserId = await getUserIdFromNativeAuth(req)
  if (nativeUserId) {
    return prisma.user.findUnique({
      where: { id: nativeUserId },
      include: { subscription: true, creditTopUps: true },
    })
  }

  const session = await getServerSession(authOptions)
  const email = String(session?.user?.email || '').trim().toLowerCase()
  if (!email) return null
  return prisma.user.findUnique({
    where: { email },
    include: { subscription: true, creditTopUps: true },
  })
}

export async function GET(req: NextRequest) {
  const user = await getCheckinSettingsUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureCheckinTables()
  const now = new Date()
  const hasSubscription = isSubscriptionActive(user.subscription, now)
  const hasPurchasedCredits = (user.creditTopUps || []).some(
    (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
  )
  const isPaidUser = hasSubscription || hasPurchasedCredits
  const maxFrequency = isPaidUser ? 4 : 1

  const rows: Array<{
    enabled: boolean
    time1: string
    time2: string
    time3: string
    time4: string
    timezone: string
    frequency: number
  }> = await prisma.$queryRawUnsafe(
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
  const user = await getCheckinSettingsUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  let { enabled, time1, time2, time3, time4, timezone, frequency } = body as any

  const normalizeTime = (input?: string, defaultValue: string = '21:00'): string => {
    if (!input) return defaultValue
    const s = String(input).trim().toLowerCase()
    const m24 = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
    if (m24) return `${m24[1].padStart(2, '0')}:${m24[2]}`
    const m12 = s.match(/^([0-1]?\d):([0-5]\d)\s*(am|pm)$/)
    if (m12) {
      let h = parseInt(m12[1], 10)
      const mm = m12[2]
      const ap = m12[3]
      if (ap === 'pm' && h !== 12) h += 12
      if (ap === 'am' && h === 12) h = 0
      return `${String(h).padStart(2, '0')}:${mm}`
    }
    const digits = s.replace(/[^0-9]/g, '')
    if (digits.length >= 3) {
      const h = parseInt(digits.slice(0, digits.length - 2), 10)
      const mm = parseInt(digits.slice(-2), 10)
      return `${String(Math.max(0, Math.min(23, h))).padStart(2, '0')}:${String(
        Math.max(0, Math.min(59, mm))
      ).padStart(2, '0')}`
    }
    return defaultValue
  }

  enabled = typeof enabled === 'boolean' ? enabled : true
  time1 = normalizeTime(time1, '12:30')
  time2 = normalizeTime(time2, '18:30')
  time3 = normalizeTime(time3, '21:30')
  time4 = normalizeTime(time4, '09:00')
  timezone =
    (timezone && String(timezone).trim()) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'Australia/Melbourne'

  const now = new Date()
  const hasSubscription = isSubscriptionActive(user.subscription, now)
  const hasPurchasedCredits = (user.creditTopUps || []).some(
    (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
  )
  const isPaidUser = hasSubscription || hasPurchasedCredits
  const maxFrequency = isPaidUser ? 4 : 1
  frequency = Math.max(1, Math.min(maxFrequency, parseInt(String(frequency || 1), 10)))

  try {
    await ensureCheckinTables()
    console.log('Saving CheckinSettings for', user.id, { enabled, time1, time2, time3, timezone, frequency })

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
      user.id,
      enabled,
      time1,
      time2,
      time3,
      time4,
      timezone,
      frequency
    )

    const scheduleResults = enabled
      ? await scheduleAllActiveReminders(user.id, { time1, time2, time3, time4, timezone, frequency }).catch(
          (error) => {
            console.error('[CHECKINS] Failed to schedule reminders via QStash', error)
            return []
          }
        )
      : []

    const failedSchedules = scheduleResults.filter((result) => !result.scheduled)
    if (failedSchedules.length > 0) {
      console.error('[CHECKINS] QStash scheduling failures detected', { failedSchedules })
    }

    try {
      if (!enabled) {
        return NextResponse.json({ success: true, scheduleResults })
      }
      const currentTime = new Date()
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      const parts = fmt.formatToParts(currentTime)
      const ch = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
      const cm = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)
      const currentTotal = ch * 60 + cm
      const sendWindowMinutes = 5
      const candidates: string[] = []
      if (frequency >= 1) candidates.push(time1)
      if (frequency >= 2) candidates.push(time2)
      if (frequency >= 3) candidates.push(time3)
      if (frequency >= 4) candidates.push(time4)
      for (const t of candidates) {
        const [hh, mm] = t.split(':').map((v) => parseInt(v, 10))
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
