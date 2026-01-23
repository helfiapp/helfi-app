import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { normalizeSubscriptionList } from '@/lib/push-subscriptions'
import { isSubscriptionActive } from '@/lib/subscription-utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type TimeSnapshot = {
  timeZone: string
  ok: boolean
  current: string
  localDate: string
}

function snapshotInTimeZone(now: Date, timeZone: string): TimeSnapshot {
  try {
    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)
    const hh = timeParts.find((p) => p.type === 'hour')?.value || '00'
    const mm = timeParts.find((p) => p.type === 'minute')?.value || '00'

    const dateParts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const year = dateParts.find((p) => p.type === 'year')?.value || '1970'
    const month = dateParts.find((p) => p.type === 'month')?.value || '01'
    const day = dateParts.find((p) => p.type === 'day')?.value || '01'

    return {
      timeZone,
      ok: true,
      current: `${hh}:${mm}`,
      localDate: `${year}-${month}-${day}`,
    }
  } catch {
    const fallback = 'UTC'
    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: fallback,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)
    const hh = timeParts.find((p) => p.type === 'hour')?.value || '00'
    const mm = timeParts.find((p) => p.type === 'minute')?.value || '00'

    const dateParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: fallback,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const year = dateParts.find((p) => p.type === 'year')?.value || '1970'
    const month = dateParts.find((p) => p.type === 'month')?.value || '01'
    const day = dateParts.find((p) => p.type === 'day')?.value || '01'

    return {
      timeZone: fallback,
      ok: false,
      current: `${hh}:${mm}`,
      localDate: `${year}-${month}-${day}`,
    }
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { subscription: true, creditTopUps: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await ensureMoodTables()

  const settingsRows: Array<{
    enabled: boolean
    time1: string
    time2: string
    time3: string
    time4: string
    timezone: string
    frequency: number
  }> = await prisma.$queryRawUnsafe(
    `SELECT enabled, time1, time2, time3, time4, timezone, frequency
     FROM MoodReminderSettings
     WHERE userId = $1
     LIMIT 1`,
    user.id,
  )

  const settings = settingsRows[0] || {
    enabled: false,
    time1: '20:00',
    time2: '12:00',
    time3: '18:00',
    time4: '09:00',
    timezone: 'UTC',
    frequency: 1,
  }
  const now = new Date()
  const hasSubscription = isSubscriptionActive(user.subscription, now)
  const hasPurchasedCredits = (user.creditTopUps || []).some(
    (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
  )
  const maxFrequency = (hasSubscription || hasPurchasedCredits) ? 4 : 1
  const resolvedFrequency = Math.max(1, Math.min(maxFrequency, settings.frequency || 1))

  const nowUtc = new Date()
  const snapshot = snapshotInTimeZone(nowUtc, settings.timezone || 'UTC')
  const backfillWindow = Math.max(1, Math.min(60, parseInt(process.env.REMINDER_LAG_MINUTES || '10', 10)))

  const reminderTimes: string[] = []
  if (resolvedFrequency >= 1) reminderTimes.push(settings.time1 || '20:00')
  if (resolvedFrequency >= 2) reminderTimes.push(settings.time2 || '12:00')
  if (resolvedFrequency >= 3) reminderTimes.push(settings.time3 || '18:00')
  if (resolvedFrequency >= 4) reminderTimes.push(settings.time4 || '09:00')

  let shouldSend = false
  let matchedReminder = ''
  let matchReason = ''

  if (!settings.enabled) {
    matchReason = 'reminders_disabled'
  } else {
    const [ch, cm] = snapshot.current.split(':').map((v) => parseInt(v, 10))
    const currentTotalMinutes = ch * 60 + cm

    for (const reminderTime of reminderTimes) {
      const [rh, rm] = reminderTime.split(':').map((v) => parseInt(v, 10))
      if (Number.isNaN(rh) || Number.isNaN(rm)) continue

      if (rh === ch && rm === cm) {
        shouldSend = true
        matchedReminder = reminderTime
        matchReason = 'exact_match'
        break
      }

      const reminderTotalMinutes = rh * 60 + rm
      let minutesDiff = currentTotalMinutes - reminderTotalMinutes
      if (minutesDiff < 0) minutesDiff += 1440
      if (minutesDiff >= 1 && minutesDiff <= backfillWindow) {
        shouldSend = true
        matchedReminder = reminderTime
        matchReason = `late_cron_${minutesDiff}m`
        break
      }

      let minutesAhead = reminderTotalMinutes - currentTotalMinutes
      if (minutesAhead < 0) minutesAhead += 1440
      if (minutesAhead === 1) {
        shouldSend = true
        matchedReminder = reminderTime
        matchReason = 'early_send_1m'
        break
      }
    }
  }

  const deliveryRows: Array<{ reminderTime: string; sentDate: string; sentAt: string }> =
    await prisma.$queryRawUnsafe(
      `SELECT reminderTime, sentDate::text AS "sentDate", sentAt::text AS "sentAt"
       FROM MoodReminderDeliveryLog
       WHERE userId = $1
       ORDER BY sentAt DESC
       LIMIT 5`,
      user.id,
    )

  const subscriptionRows: Array<{ subscription: any; updatedAt: string }> = await prisma.$queryRawUnsafe(
    `SELECT subscription, updatedAt::text AS "updatedAt" FROM PushSubscriptions WHERE userId = $1 LIMIT 1`,
    user.id,
  )

  return NextResponse.json({
    userId: user.id,
    nowUtc: nowUtc.toISOString(),
    settings,
    maxFrequency,
    snapshot,
    reminderTimes,
    match: {
      shouldSend,
      matchedReminder,
      reason: matchReason || 'no_match',
      backfillWindowMinutes: backfillWindow,
    },
    subscription: {
      present: subscriptionRows.length > 0 && normalizeSubscriptionList(subscriptionRows[0]?.subscription).length > 0,
      updatedAt: subscriptionRows[0]?.updatedAt || null,
      count: subscriptionRows.length ? normalizeSubscriptionList(subscriptionRows[0]?.subscription).length : 0,
    },
    recentDeliveries: deliveryRows,
  })
}
