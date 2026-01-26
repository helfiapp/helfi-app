import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { dedupeSubscriptions, normalizeSubscriptionList, removeSubscriptionsByEndpoint, sendToSubscriptions } from '@/lib/push-subscriptions'
import { createInboxNotification } from '@/lib/notification-inbox'
import { isSubscriptionActive } from '@/lib/subscription-utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const expected = process.env.SCHEDULER_SECRET || ''
    const vercelCronHeader = req.headers.get('x-vercel-cron')
    const isVercelCron = vercelCronHeader !== null

    if (!(isVercelCron || (expected && authHeader === `Bearer ${expected}`))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (process.env.QSTASH_TOKEN) {
      return NextResponse.json({ skipped: 'qstash_enabled' })
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
    const privateKey = process.env.VAPID_PRIVATE_KEY || ''
    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
    }
    webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

    await ensureMoodTables()

    const rows: Array<{
      userId: string | null
      enabled: boolean
      time1: string
      time2: string
      time3: string
      time4: string
      timezone: string
      frequency: number
      subscription: any
    }> = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT
        p.userId AS "userId",
        COALESCE(s.enabled, FALSE) AS enabled,
        COALESCE(s.time1, '20:00') AS time1,
        COALESCE(s.time2, '12:00') AS time2,
        COALESCE(s.time3, '18:00') AS time3,
        COALESCE(s.time4, '09:00') AS time4,
        COALESCE(s.timezone, 'UTC') AS timezone,
        COALESCE(s.frequency, 1) AS frequency,
        p.subscription
      FROM PushSubscriptions p
      LEFT JOIN MoodReminderSettings s ON s.userId = p.userId
    `)

    const nowUtc = new Date()
    const sentTo: string[] = []
    const errors: Array<{ userId: string; error: string }> = []

    const nowForPaid = new Date()
    const userIds = rows.map((row) => row.userId).filter((id): id is string => !!id)
    const paidUserIds = new Set<string>()
    if (userIds.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        include: { subscription: true, creditTopUps: true },
      })
      for (const user of users) {
        const hasSubscription = isSubscriptionActive(user.subscription, nowForPaid)
        const hasPurchasedCredits = (user.creditTopUps || []).some(
          (topUp: any) => topUp.expiresAt > nowForPaid && (topUp.amountCents - topUp.usedCents) > 0
        )
        if (hasSubscription || hasPurchasedCredits) {
          paidUserIds.add(user.id)
        }
      }
    }

    const backfillWindow = Math.max(1, Math.min(60, parseInt(process.env.REMINDER_LAG_MINUTES || '10', 10)))

    for (const r of rows) {
      try {
        if (!r.userId) continue
        if (!r.enabled) continue

        const subscriptions = dedupeSubscriptions(normalizeSubscriptionList(r.subscription))
        if (!subscriptions.length) {
          errors.push({ userId: r.userId, error: 'no_subscription' })
          continue
        }

        const tz = r.timezone || 'UTC'
        const fmt = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        const parts = fmt.formatToParts(nowUtc)
        const hh = parts.find((p) => p.type === 'hour')?.value || '00'
        const mm = parts.find((p) => p.type === 'minute')?.value || '00'
        const current = `${hh}:${mm}`

        const dateParts = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(nowUtc)
        const year = dateParts.find((p) => p.type === 'year')?.value || '1970'
        const month = dateParts.find((p) => p.type === 'month')?.value || '01'
        const day = dateParts.find((p) => p.type === 'day')?.value || '01'
        const localDate = `${year}-${month}-${day}`

        const maxFrequency = paidUserIds.has(r.userId) ? 4 : 1
        const resolvedFrequency = Math.max(1, Math.min(maxFrequency, r.frequency || 1))
        const reminderTimes: string[] = []
        if (resolvedFrequency >= 1) reminderTimes.push(r.time1 || '20:00')
        if (resolvedFrequency >= 2) reminderTimes.push(r.time2 || '12:00')
        if (resolvedFrequency >= 3) reminderTimes.push(r.time3 || '18:00')
        if (resolvedFrequency >= 4) reminderTimes.push(r.time4 || '09:00')

        let shouldSend = false
        let matchedReminder = ''

        for (const reminderTime of reminderTimes) {
          const [rh, rm] = reminderTime.split(':').map(Number)
          const [ch, cm] = [parseInt(hh, 10), parseInt(mm, 10)]
          if (rh === ch && rm === cm) {
            shouldSend = true
            matchedReminder = reminderTime
            break
          }

          const currentTotalMinutes = ch * 60 + cm
          const reminderTotalMinutes = rh * 60 + rm
          let minutesDiff = currentTotalMinutes - reminderTotalMinutes
          if (minutesDiff < 0) minutesDiff += 1440
          if (minutesDiff >= 1 && minutesDiff <= backfillWindow) {
            shouldSend = true
            matchedReminder = reminderTime
            break
          }

          let minutesAhead = reminderTotalMinutes - currentTotalMinutes
          if (minutesAhead < 0) minutesAhead += 1440
          if (minutesAhead === 1) {
            shouldSend = true
            matchedReminder = reminderTime
            break
          }
        }

        if (!shouldSend) continue

        const alreadySent: Array<{ exists: number }> = await prisma.$queryRawUnsafe(
          `SELECT 1 as exists
           FROM MoodReminderDeliveryLog
           WHERE userId = $1 AND reminderTime = $2 AND sentDate = $3::date
           LIMIT 1`,
          r.userId,
          matchedReminder,
          localDate,
        )

        if (alreadySent.length > 0) continue

        const payload = JSON.stringify({
          title: 'Quick mood check‑in',
          body: 'How are you feeling right now? It takes 10 seconds.',
          url: '/mood/quick',
        })

        const { sent, errors: sendErrors, goneEndpoints } = await sendToSubscriptions(subscriptions, (sub) =>
          webpush.sendNotification(sub, payload)
        )
        if (goneEndpoints.length) {
          const remaining = removeSubscriptionsByEndpoint(subscriptions, goneEndpoints)
          await prisma.$executeRawUnsafe(
            `UPDATE PushSubscriptions SET subscription = $2::jsonb, updatedAt = NOW() WHERE userId = $1`,
            r.userId,
            JSON.stringify(remaining)
          )
        }
        if (!sent) {
          const msg = sendErrors.map((err) => err.message).join('; ')
          errors.push({ userId: r.userId, error: msg || 'push_failed' })
          continue
        }
        sentTo.push(r.userId)

        await prisma.$queryRawUnsafe(
          `INSERT INTO MoodReminderDeliveryLog (userId, reminderTime, sentDate, sentAt)
           VALUES ($1, $2, $3::date, NOW())
           ON CONFLICT (userId, reminderTime, sentDate) DO UPDATE SET sentAt = NOW()`,
          r.userId,
          matchedReminder,
          localDate,
        )
        await createInboxNotification({
          userId: r.userId,
          title: 'Quick mood check-in',
          body: 'How are you feeling right now? It takes 10 seconds.',
          url: '/mood/quick',
          type: 'mood_reminder',
          source: 'push',
          eventKey: `mood:${localDate}:${matchedReminder}`,
        }).catch(() => {})
      } catch (e: any) {
        errors.push({ userId: r.userId ?? 'unknown', error: e?.body || e?.message || String(e) })
      }
    }

    return NextResponse.json({ success: true, sent: sentTo.length, errors, timestamp: nowUtc.toISOString() })
  } catch (e: any) {
    return NextResponse.json({ error: 'scheduler_crash', message: e?.message || String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
