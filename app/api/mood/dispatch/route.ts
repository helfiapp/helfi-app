import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { scheduleAllMoodReminders, scheduleMoodReminderWithQStash } from '@/lib/qstash'
import { dedupeSubscriptions, normalizeSubscriptionList, removeSubscriptionsByEndpoint, sendToSubscriptions } from '@/lib/push-subscriptions'
import { isSchedulerAuthorized } from '@/lib/scheduler-auth'
import { createInboxNotification } from '@/lib/notification-inbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DispatchPayload = {
  userId: string
  reminderTime: string
  timezone: string
}

function safeTimezone(input: string) {
  const tz = (input || 'UTC').trim()
  if (!tz) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

function localDateForTimezone(now: Date, timezone: string) {
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = dateParts.find((p) => p.type === 'year')?.value || '1970'
  const month = dateParts.find((p) => p.type === 'month')?.value || '01'
  const day = dateParts.find((p) => p.type === 'day')?.value || '01'
  return `${year}-${month}-${day}`
}

export async function POST(req: NextRequest) {
  try {
    if (!isSchedulerAuthorized(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as Partial<DispatchPayload>
    const userId = String(body.userId || '')
    const reminderTime = String(body.reminderTime || '')
    const timezone = String(body.timezone || '')
    if (!userId || !reminderTime || !timezone) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    await ensureMoodTables()

    const subscriptionRows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
      `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
      userId,
    )
    if (!subscriptionRows.length) {
      return NextResponse.json({ error: 'no_subscription' }, { status: 400 })
    }
    const subscriptions = dedupeSubscriptions(normalizeSubscriptionList(subscriptionRows[0].subscription))
    if (!subscriptions.length) {
      return NextResponse.json({ error: 'no_subscription' }, { status: 400 })
    }

    const settingsRows: Array<{
      enabled: boolean
      time1: string
      time2: string
      time3: string
      timezone: string
      frequency: number | null
    }> = await prisma.$queryRawUnsafe(
      `SELECT enabled, time1, time2, time3, timezone, frequency FROM MoodReminderSettings WHERE userId = $1`,
      userId,
    )
    const settings = settingsRows[0]
    const resolvedFrequency = Math.max(1, Math.min(3, settings?.frequency ?? 1))
    const activeTimes: string[] = []
    if (resolvedFrequency >= 1 && settings?.time1) activeTimes.push(settings.time1)
    if (resolvedFrequency >= 2 && settings?.time2) activeTimes.push(settings.time2)
    if (resolvedFrequency >= 3 && settings?.time3) activeTimes.push(settings.time3)
    const timezoneToUse = settings?.timezone || timezone

    const remindersEnabled = settings?.enabled ?? false
    const reminderStillActive = settings ? activeTimes.includes(reminderTime) : false
    const timezoneStillMatches = settings ? settings.timezone === timezone : false

    if (!remindersEnabled || !reminderStillActive || !timezoneStillMatches) {
      if (settings && settings.enabled) {
        const rescheduleTimezone = safeTimezone(settings.timezone)
        try {
          await scheduleAllMoodReminders(userId, {
            time1: settings.time1,
            time2: settings.time2,
            time3: settings.time3,
            timezone: rescheduleTimezone,
            frequency: resolvedFrequency,
          })
        } catch (err) {
          console.error('[MOOD_DISPATCH] Failed to reschedule active reminders after stale job', err)
        }
      }
      return NextResponse.json({
        skipped: 'stale_schedule',
        reason: remindersEnabled ? 'time_or_timezone_changed' : 'disabled',
      })
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
    const privateKey = process.env.VAPID_PRIVATE_KEY || ''
    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'vapid_not_configured' }, { status: 500 })
    }
    webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

    const now = new Date()
    const effectiveTimezone = safeTimezone(timezoneToUse)
    const localDate = localDateForTimezone(now, effectiveTimezone)

    const claim: Array<{ userId: string }> = await prisma.$queryRawUnsafe(
      `INSERT INTO MoodReminderDeliveryLog (userId, reminderTime, sentDate, sentAt)
       VALUES ($1, $2, $3::date, NOW())
       ON CONFLICT (userId, reminderTime, sentDate) DO NOTHING
       RETURNING userId`,
      userId,
      reminderTime,
      localDate,
    )

    if (!claim.length) {
      return NextResponse.json({ skipped: 'already_sent' })
    }

    const payload = JSON.stringify({
      title: 'Quick mood check‑in',
      body: 'How are you feeling right now? It takes 10 seconds.',
      url: '/mood/quick',
    })
    const { sent, errors, goneEndpoints } = await sendToSubscriptions(subscriptions, (sub) =>
      webpush.sendNotification(sub, payload)
    )
    if (goneEndpoints.length) {
      const remaining = removeSubscriptionsByEndpoint(subscriptions, goneEndpoints)
      await prisma.$executeRawUnsafe(
        `UPDATE PushSubscriptions SET subscription = $2::jsonb, updatedAt = NOW() WHERE userId = $1`,
        userId,
        JSON.stringify(remaining)
      )
    }
    if (!sent) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM MoodReminderDeliveryLog WHERE userId = $1 AND reminderTime = $2 AND sentDate = $3::date`,
        userId,
        reminderTime,
        localDate,
      ).catch(() => {})
      return NextResponse.json({ error: 'push_failed', details: errors }, { status: 500 })
    }

    await createInboxNotification({
      userId,
      title: 'Quick mood check-in',
      body: 'How are you feeling right now? It takes 10 seconds.',
      url: '/mood/quick',
      type: 'mood_reminder',
      source: 'push',
      eventKey: `mood:${localDate}:${reminderTime}`,
    }).catch(() => {})

    const nextSchedule = await scheduleMoodReminderWithQStash(userId, reminderTime, effectiveTimezone).catch(
      (error) => {
        console.error('[MOOD_DISPATCH] Failed to schedule next reminder via QStash', error)
        return { scheduled: false, reason: 'exception' }
      },
    )
    if (!nextSchedule?.scheduled) {
      console.error('[MOOD_DISPATCH] QStash scheduling returned failure', {
        userId,
        reminderTime,
        timezone: effectiveTimezone,
        reason: nextSchedule?.reason,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[MOOD_DISPATCH] error', e?.stack || e)
    return NextResponse.json({ error: 'dispatch_error', message: e?.message || String(e) }, { status: 500 })
  }
}
