import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import crypto from 'crypto'
import { dedupeSubscriptions, normalizeSubscriptionList, removeSubscriptionsByEndpoint, sendToSubscriptions } from '@/lib/push-subscriptions'
import { createInboxNotification } from '@/lib/notification-inbox'
import { isSubscriptionActive } from '@/lib/subscription-utils'

// Force dynamic execution - prevent caching for cron jobs
export const dynamic = 'force-dynamic'
// Ensure Node.js runtime (web-push requires Node, not Edge)
export const runtime = 'nodejs'

// This endpoint is intended to be triggered by a cron (e.g., Vercel Cron) every 5 minutes.
// It finds users whose reminder time matches the current time in their timezone and sends a push.

export async function POST(req: NextRequest) {
  try {
  const authHeader = req.headers.get('authorization') || ''
  const expected = process.env.SCHEDULER_SECRET || ''
  
  // Check for Vercel cron header
  // Vercel sends x-vercel-cron header when triggering cron jobs
  const vercelCronHeader = req.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null // Header exists (even if empty, Vercel sets it)
  
  // Also check all headers for debugging
  const allHeaders: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    allHeaders[key] = value
  })
  
  // Log authentication attempt for debugging
  console.log('[SCHEDULER] Auth check:', {
    hasVercelCronHeader: vercelCronHeader !== null,
    vercelCronValue: vercelCronHeader,
    isVercelCron,
    hasAuthHeader: !!authHeader,
    hasExpectedSecret: !!expected,
    method: req.method,
    url: req.url,
    allHeaders: Object.keys(allHeaders)
  })
  
  if (!(isVercelCron || (expected && authHeader === `Bearer ${expected}`))) {
    console.error('[SCHEDULER] ❌ Unauthorized - missing x-vercel-cron header or valid Bearer token')
    console.error('[SCHEDULER] Received headers:', JSON.stringify(allHeaders, null, 2))
    return NextResponse.json({ error: 'Unauthorized', debug: { hasVercelCronHeader: vercelCronHeader !== null, headers: Object.keys(allHeaders) } }, { status: 401 })
  }
  
  console.log('[SCHEDULER] ✅ Authorized - proceeding with notification check')

  if (process.env.QSTASH_TOKEN) {
    return NextResponse.json({ skipped: 'qstash_enabled' })
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || ''
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
  }
  webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

  // Ensure required tables exist with full schema
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
  // await prisma.$executeRawUnsafe(`
  //   CREATE TABLE IF NOT EXISTS PushSubscriptions (
  //     userId TEXT PRIMARY KEY,
  //     subscription JSONB NOT NULL
  //   )
  // `)
  // await prisma.$executeRawUnsafe(`
  //   CREATE TABLE IF NOT EXISTS ReminderDeliveryLog (
  //     userId TEXT NOT NULL,
  //     reminderTime TEXT NOT NULL,
  //     sentDate DATE NOT NULL,
  //     sentAt TIMESTAMP NOT NULL DEFAULT NOW(),
  //     PRIMARY KEY (userId, reminderTime, sentDate)
  //   )
  // `)
  
  // // Migrate old schema if needed
  // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time2 TEXT NOT NULL DEFAULT '18:00'`).catch(() => {})
  // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time3 TEXT NOT NULL DEFAULT '21:00'`).catch(() => {})
  // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS frequency INTEGER NOT NULL DEFAULT 3`).catch(() => {})

  // Load all users with subscriptions and their reminder settings
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
      COALESCE(s.enabled, true) AS enabled,
      COALESCE(s.time1, '12:30') AS time1,
      COALESCE(s.time2, '18:30') AS time2,
      COALESCE(s.time3, '21:30') AS time3,
      COALESCE(s.time4, '09:00') AS time4,
      COALESCE(s.timezone, 'Australia/Melbourne') AS timezone,
      COALESCE(s.frequency, 3) AS frequency,
      p.subscription
    FROM PushSubscriptions p
    LEFT JOIN CheckinSettings s ON s.userId = p.userId
  `)

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

  // Determine current HH:MM in each user's timezone and match against their reminder times
  const nowUtc = new Date()
  const sentTo: string[] = []
  const errors: Array<{ userId: string, error: string }> = []
  const debugLog: Array<{ userId: string, timezone: string, currentTime: string, reminderTimes: string[], matched: boolean, reason?: string }> = []

  console.log(`[SCHEDULER] Cron triggered at UTC: ${nowUtc.toISOString()}, Processing ${rows.length} users`)

  // Log scheduler execution to database for tracking
  try {
    // await prisma.$executeRawUnsafe(`
    //   CREATE TABLE IF NOT EXISTS SchedulerLogs (
    //     id TEXT PRIMARY KEY,
    //     timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    //     utcTime TEXT NOT NULL,
    //     usersProcessed INTEGER NOT NULL,
    //     notificationsSent INTEGER NOT NULL,
    //     errors INTEGER NOT NULL,
    //     debugInfo JSONB
    //   )
    // `)
    const logId = crypto.randomUUID()
    await prisma.$queryRawUnsafe(
      `INSERT INTO SchedulerLogs (id, timestamp, utcTime, usersProcessed, notificationsSent, errors, debugInfo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      logId,
      nowUtc,
      nowUtc.toISOString(),
      rows.length,
      0, // Will update after processing
      0, // Will update after processing
      JSON.stringify({ cronTriggered: true })
    )
  } catch (e) {
    console.error('[SCHEDULER] Failed to log execution:', e)
  }

  for (const r of rows) {
    try {
      if (!r.enabled) {
        debugLog.push({
          userId: r.userId || 'unknown',
          timezone: r.timezone || 'UTC',
          currentTime: 'n/a',
          reminderTimes: [],
          matched: false,
          reason: 'disabled',
        })
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
      const hh = parts.find(p => p.type === 'hour')?.value || '00'
      const mm = parts.find(p => p.type === 'minute')?.value || '00'
      const current = `${hh}:${mm}`

      const dateParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(nowUtc)
      const year = dateParts.find(p => p.type === 'year')?.value || '1970'
      const month = dateParts.find(p => p.type === 'month')?.value || '01'
      const day = dateParts.find(p => p.type === 'day')?.value || '01'
      const localDate = `${year}-${month}-${day}`

      const maxFrequency = r.userId && paidUserIds.has(r.userId) ? 4 : 1
      const resolvedFrequency = Math.max(1, Math.min(maxFrequency, r.frequency || 1))
      // Build array of reminder times based on frequency
      const reminderTimes: string[] = []
      if (resolvedFrequency >= 1) reminderTimes.push(r.time1 || '12:30')
      if (resolvedFrequency >= 2) reminderTimes.push(r.time2 || '18:30')
      if (resolvedFrequency >= 3) reminderTimes.push(r.time3 || '21:30')
      if (resolvedFrequency >= 4) reminderTimes.push(r.time4 || '09:00')

      // Matching: Exact match, up to N minutes after (catch late cron), or 1 minute early
      let shouldSend = false
      let matchReason = ''
      let matchedReminder = ''
      const backfillWindow = Math.max(1, Math.min(60, parseInt(process.env.REMINDER_LAG_MINUTES || '10', 10)))
      
      for (const reminderTime of reminderTimes) {
        const [rh, rm] = reminderTime.split(':').map(Number)
        const [ch, cm] = [parseInt(hh, 10), parseInt(mm, 10)]
        
        // Exact match: current time equals reminder time
        if (rh === ch && rm === cm) {
          shouldSend = true
          matchedReminder = reminderTime
          matchReason = `EXACT MATCH: reminder ${reminderTime} at current time ${current}`
          break
        }
        
        // Within backfillWindow minutes after: catch late cron (e.g., cron runs late)
        const currentTotalMinutes = ch * 60 + cm
        const reminderTotalMinutes = rh * 60 + rm
        let minutesDiff = currentTotalMinutes - reminderTotalMinutes
        if (minutesDiff < 0) minutesDiff += 1440 // wrap-around safe
        
        if (minutesDiff >= 1 && minutesDiff <= backfillWindow) {
          shouldSend = true
          matchedReminder = reminderTime
          matchReason = `LATE CRON CATCH: reminder ${reminderTime} was ${minutesDiff} minute(s) ago (current ${current}), sending now (window ${backfillWindow}m)`
          break
        }

        // One minute early: send proactively
        let minutesAhead = reminderTotalMinutes - currentTotalMinutes
        if (minutesAhead < 0) minutesAhead += 1440
        if (minutesAhead === 1) {
          shouldSend = true
          matchedReminder = reminderTime
          matchReason = `EARLY SEND: reminder ${reminderTime} is in 1 minute (current ${current}), sending now`
          break
        }
      }

      const shortId = (r.userId ?? 'unknown').toString().slice(0, 8)
      debugLog.push({
        userId: r.userId ?? 'unknown',
        timezone: tz,
        currentTime: current,
        reminderTimes,
        matched: shouldSend,
        reason: shouldSend ? matchReason : `No match: current=${current}, reminders=${reminderTimes.join(', ')}`
      })

      if (!shouldSend) {
        console.log(`[SCHEDULER] User ${shortId}... (${tz}): No match - current=${current}, reminders=${reminderTimes.join(', ')}`)
        continue
      }

      if (!r.userId) {
        console.warn('[SCHEDULER] Skipping send because userId is null')
        continue
      }

      const subscriptions = dedupeSubscriptions(normalizeSubscriptionList(r.subscription))
      if (!subscriptions.length) {
        errors.push({ userId: r.userId ?? 'unknown', error: 'no_subscription' })
        continue
      }

      const alreadySent: Array<{ exists: number }> = await prisma.$queryRawUnsafe(
        `SELECT 1 as exists FROM ReminderDeliveryLog WHERE userId = $1 AND reminderTime = $2 AND sentDate = $3::date LIMIT 1`,
        r.userId,
        matchedReminder,
        localDate
      )

      if (alreadySent.length > 0) {
        console.log(`[SCHEDULER] User ${shortId}... (${tz}): Reminder ${matchedReminder} already sent today (${localDate}), skipping duplicate.`)
        continue
      }

      console.log(`[SCHEDULER] User ${shortId}... (${tz}): Sending notification - matched ${matchReason}`)

      const payload = JSON.stringify({
        title: 'Time for your Helfi check‑in',
        body: 'Rate your selected issues for today in under a minute.',
        url: '/check-in'
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
        errors.push({ userId: r.userId ?? 'unknown', error: msg || 'push_failed' })
        continue
      }
      sentTo.push(r.userId ?? 'unknown')
      await prisma.$queryRawUnsafe(
        `INSERT INTO ReminderDeliveryLog (userId, reminderTime, sentDate, sentAt)
         VALUES ($1, $2, $3::date, NOW())
         ON CONFLICT (userId, reminderTime, sentDate) DO UPDATE SET sentAt = NOW()`,
        r.userId,
        matchedReminder,
        localDate
      )
      await createInboxNotification({
        userId: r.userId,
        title: 'Time for your Helfi check-in',
        body: 'Rate your selected issues for today in under a minute.',
        url: '/check-in',
        type: 'checkin_reminder',
        source: 'push',
        eventKey: `checkin:${localDate}:${matchedReminder}`,
      }).catch(() => {})
      console.log(`[SCHEDULER] ✅ Notification sent to user ${shortId}...`)
    } catch (e: any) {
      const errorMsg = e?.body || e?.message || String(e)
      const shortId = (r.userId ?? 'unknown').toString().slice(0, 8)
      console.error(`[SCHEDULER] ❌ Error for user ${shortId}...:`, errorMsg)
      errors.push({ userId: r.userId ?? 'unknown', error: errorMsg })
    }
  }

  console.log(`[SCHEDULER] Complete: sent=${sentTo.length}, errors=${errors.length}`)

  // Update log with final counts
  try {
    // Find the most recent log entry and update it
    const recentLogs: any[] = await prisma.$queryRawUnsafe(`
      SELECT id FROM SchedulerLogs 
      WHERE timestamp >= NOW() - INTERVAL '1 minute'
      ORDER BY timestamp DESC
      LIMIT 1
    `)
    if (recentLogs.length > 0) {
      await prisma.$queryRawUnsafe(`
        UPDATE SchedulerLogs 
        SET notificationsSent = $1, errors = $2, debugInfo = $3::jsonb
        WHERE id = $4
      `, sentTo.length, errors.length, JSON.stringify({ debug: debugLog, sentTo, errors }), recentLogs[0].id)
    }
  } catch (e) {
    console.error('[SCHEDULER] Failed to update log:', e)
  }

  return NextResponse.json({ 
    success: true, 
    sent: sentTo.length, 
    errors,
    debug: debugLog,
    timestamp: nowUtc.toISOString()
  })
  } catch (e: any) {
    console.error('[SCHEDULER] Top-level error:', e?.stack || e)
    return NextResponse.json({ error: 'scheduler_crash', message: e?.message || String(e) }, { status: 500 })
  }
}

// Allow Vercel Cron (GET) to trigger the same logic safely
export async function GET(req: NextRequest) {
  return POST(req)
}
