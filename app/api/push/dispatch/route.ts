import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import { scheduleAllActiveReminders, scheduleReminderWithQStash } from '@/lib/qstash'
import { normalizeSubscriptionList, removeSubscriptionsByEndpoint, sendToSubscriptions } from '@/lib/push-subscriptions'
import { isSchedulerAuthorized } from '@/lib/scheduler-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DispatchPayload = {
  userId: string
  reminderTime: string // "HH:MM"
  timezone: string
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

    // Ensure subscription exists
    // await prisma.$executeRawUnsafe(`
    //   CREATE TABLE IF NOT EXISTS PushSubscriptions (
    //     userId TEXT PRIMARY KEY,
    //     subscription JSONB NOT NULL
    //   )
    // `)
    const rows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
      `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
      userId
    )
    if (!rows.length) {
      return NextResponse.json({ error: 'no_subscription' }, { status: 400 })
    }
    const subscriptions = normalizeSubscriptionList(rows[0].subscription)
    if (!subscriptions.length) {
      return NextResponse.json({ error: 'no_subscription' }, { status: 400 })
    }

    // Load the latest reminder settings for this user to validate stale schedules
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
    const settingsRows: Array<{ enabled: boolean; time1: string; time2: string; time3: string; timezone: string; frequency: number | null }> =
      await prisma.$queryRawUnsafe(
        `SELECT enabled, time1, time2, time3, timezone, frequency FROM CheckinSettings WHERE userId = $1`,
        userId
      )
    const settings = settingsRows[0]
    if (settings && settings.enabled === false) {
      return NextResponse.json({ skipped: 'disabled' })
    }
    const resolvedFrequency = Math.max(1, Math.min(3, settings?.frequency ?? 3))
    const activeTimes: string[] = []
    if (resolvedFrequency >= 1 && settings?.time1) activeTimes.push(settings.time1)
    if (resolvedFrequency >= 2 && settings?.time2) activeTimes.push(settings.time2)
    if (resolvedFrequency >= 3 && settings?.time3) activeTimes.push(settings.time3)
    const timezoneToUse = settings?.timezone || timezone

    const reminderStillActive = settings ? activeTimes.includes(reminderTime) : true
    const timezoneStillMatches = settings ? settings.timezone === timezone : true

    if (!reminderStillActive || !timezoneStillMatches) {
      console.log('[DISPATCH] Skipping stale reminder job', {
        userId,
        reminderTime,
        incomingTimezone: timezone,
        latestTimezone: settings?.timezone,
        activeTimes,
        reason: reminderStillActive ? 'timezone_changed' : 'time_removed',
      })
      if (settings) {
        try {
          await scheduleAllActiveReminders(userId, {
            time1: settings.time1,
            time2: settings.time2,
            time3: settings.time3,
            timezone: settings.timezone,
            frequency: resolvedFrequency,
          })
        } catch (err) {
          console.error('[DISPATCH] Failed to reschedule active reminders after stale job', err)
        }
      }
      return NextResponse.json({ skipped: 'stale_schedule' })
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
    const privateKey = process.env.VAPID_PRIVATE_KEY || ''
    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'vapid_not_configured' }, { status: 500 })
    }
    webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

    // Delivery log table for de-duplication
    // await prisma.$executeRawUnsafe(`
    //   CREATE TABLE IF NOT EXISTS ReminderDeliveryLog (
    //     userId TEXT NOT NULL,
    //     reminderTime TEXT NOT NULL,
    //     sentDate DATE NOT NULL,
    //     sentAt TIMESTAMP NOT NULL DEFAULT NOW(),
    //     PRIMARY KEY (userId, reminderTime, sentDate)
    //   )
    // `)

    // Compute local date for de-dup (based on the user's tz)
    const now = new Date()
    const effectiveTimezone = timezoneToUse || 'UTC'
    const dateParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: effectiveTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const localDate = `${dateParts.find(p => p.type==='year')?.value}-${dateParts.find(p=>p.type==='month')?.value}-${dateParts.find(p=>p.type==='day')?.value}`

    const already: Array<{ exists: number }> = await prisma.$queryRawUnsafe(
      `SELECT 1 as exists FROM ReminderDeliveryLog WHERE userId = $1 AND reminderTime = $2 AND sentDate = $3::date LIMIT 1`,
      userId,
      reminderTime,
      localDate
    )
    if (!already.length) {
      // Send push
      const payload = JSON.stringify({
        title: 'Time for your Helfi check‑in',
        body: 'Rate your selected issues for today in under a minute.',
        url: '/check-in',
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
        return NextResponse.json({ error: 'push_failed', details: errors }, { status: 500 })
      }
      await prisma.$queryRawUnsafe(
        `INSERT INTO ReminderDeliveryLog (userId, reminderTime, sentDate, sentAt)
         VALUES ($1, $2, $3::date, NOW())
         ON CONFLICT (userId, reminderTime, sentDate) DO UPDATE SET sentAt = NOW()`,
        userId,
        reminderTime,
        localDate
      )
    }

    // Schedule the next occurrence for this same reminder
    const nextSchedule = await scheduleReminderWithQStash(userId, reminderTime, effectiveTimezone).catch((error) => {
      console.error('[DISPATCH] Failed to schedule next reminder via QStash', error)
      return { scheduled: false, reason: 'exception' }
    })
    if (!nextSchedule?.scheduled) {
      console.error('[DISPATCH] QStash scheduling returned failure', {
        userId,
        reminderTime,
        timezone,
        reason: nextSchedule?.reason,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[DISPATCH] error', e?.stack || e)
    return NextResponse.json({ error: 'dispatch_error', message: e?.message || String(e) }, { status: 500 })
  }
}
