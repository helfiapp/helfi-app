import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { scheduleAllMoodReminders, scheduleMoodReminderWithQStash } from '@/lib/qstash'

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
    const requireSignature = !!process.env.QSTASH_REQUIRE_SIGNATURE
    if (requireSignature) {
      const sig = req.headers.get('Upstash-Signature')
      if (!sig) {
        return NextResponse.json({ error: 'missing_signature' }, { status: 401 })
      }
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

    const already: Array<{ exists: number }> = await prisma.$queryRawUnsafe(
      `SELECT 1 as exists FROM MoodReminderDeliveryLog WHERE userId = $1 AND reminderTime = $2 AND sentDate = $3::date LIMIT 1`,
      userId,
      reminderTime,
      localDate,
    )

    if (!already.length) {
      const payload = JSON.stringify({
        title: 'Quick mood check‑in',
        body: 'How are you feeling right now? It takes 10 seconds.',
        url: '/mood/quick',
      })
      await webpush.sendNotification(subscriptionRows[0].subscription, payload)

      await prisma.$queryRawUnsafe(
        `INSERT INTO MoodReminderDeliveryLog (userId, reminderTime, sentDate, sentAt)
         VALUES ($1, $2, $3::date, NOW())
         ON CONFLICT (userId, reminderTime, sentDate) DO UPDATE SET sentAt = NOW()`,
        userId,
        reminderTime,
        localDate,
      )
    }

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
