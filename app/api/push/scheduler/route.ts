import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import crypto from 'crypto'

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

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || ''
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
  }
  webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

  // Ensure required tables exist with full schema
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
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS PushSubscriptions (
      userId TEXT PRIMARY KEY,
      subscription JSONB NOT NULL
    )
  `)
  
  // Migrate old schema if needed
  await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time2 TEXT NOT NULL DEFAULT '18:00'`).catch(() => {})
  await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time3 TEXT NOT NULL DEFAULT '21:00'`).catch(() => {})
  await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS frequency INTEGER NOT NULL DEFAULT 3`).catch(() => {})

  // Load all users with subscriptions and their reminder settings
  const rows: Array<{
    userId: string
    time1: string
    time2: string
    time3: string
    timezone: string
    frequency: number
    subscription: any
  }> = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT 
      p.userId as userId, 
      COALESCE(s.time1, '12:30') as time1,
      COALESCE(s.time2, '18:30') as time2,
      COALESCE(s.time3, '21:30') as time3,
      COALESCE(s.timezone, 'Australia/Melbourne') as timezone,
      COALESCE(s.frequency, 3) as frequency,
      p.subscription
    FROM PushSubscriptions p
    LEFT JOIN CheckinSettings s ON s.userId = p.userId
  `)

  // Determine current HH:MM in each user's timezone and match against their reminder times
  const nowUtc = new Date()
  const sentTo: string[] = []
  const errors: Array<{ userId: string, error: string }> = []
  const debugLog: Array<{ userId: string, timezone: string, currentTime: string, reminderTimes: string[], matched: boolean, reason?: string }> = []

  console.log(`[SCHEDULER] Cron triggered at UTC: ${nowUtc.toISOString()}, Processing ${rows.length} users`)

  // Log scheduler execution to database for tracking
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS SchedulerLogs (
        id TEXT PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        utcTime TEXT NOT NULL,
        usersProcessed INTEGER NOT NULL,
        notificationsSent INTEGER NOT NULL,
        errors INTEGER NOT NULL,
        debugInfo JSONB
      )
    `)
    const logId = crypto.randomUUID()
    await prisma.$executeRawUnsafe(
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

      // Build array of reminder times based on frequency
      const reminderTimes: string[] = []
      if (r.frequency >= 1) reminderTimes.push(r.time1 || '12:30')
      if (r.frequency >= 2) reminderTimes.push(r.time2 || '18:30')
      if (r.frequency >= 3) reminderTimes.push(r.time3 || '21:30')

      // Check if current time matches any reminder time
      // Cron runs every 5 minutes at :00, :05, :10, :15, :20, :25, :30, :35, :40, :45, :50, :55
      // We need to match exactly at those times
      let shouldSend = false
      let matchReason = ''
      
      for (const reminderTime of reminderTimes) {
        const [rh, rm] = reminderTime.split(':').map(Number)
        const [ch, cm] = [parseInt(hh, 10), parseInt(mm, 10)]
        
        // Check if reminder time exactly matches current time (within the 5-minute cron window)
        // Since cron runs at :00, :05, :10, etc., we check if current minute matches reminder minute exactly
        if (rh === ch && rm === cm) {
          shouldSend = true
          matchReason = `Matched reminder ${reminderTime} at current time ${current}`
          break
        }
      }

      debugLog.push({
        userId: r.userId,
        timezone: tz,
        currentTime: current,
        reminderTimes,
        matched: shouldSend,
        reason: shouldSend ? matchReason : `No match: current=${current}, reminders=${reminderTimes.join(', ')}`
      })

      if (!shouldSend) {
        const shortId = (r.userId ?? 'unknown').toString().slice(0, 8)
        console.log(`[SCHEDULER] User ${shortId}... (${tz}): No match - current=${current}, reminders=${reminderTimes.join(', ')}`)
        continue
      }

      const shortId = (r.userId ?? 'unknown').toString().slice(0, 8)
      console.log(`[SCHEDULER] User ${shortId}... (${tz}): Sending notification - matched ${matchReason}`)

      const payload = JSON.stringify({
        title: 'Time for your Helfi check‑in',
        body: 'Rate your selected issues for today in under a minute.',
        url: '/check-in'
      })
      await webpush.sendNotification(r.subscription, payload)
      sentTo.push(r.userId)
      console.log(`[SCHEDULER] ✅ Notification sent to user ${shortId}...`)
    } catch (e: any) {
      const errorMsg = e?.body || e?.message || String(e)
      const shortId = (r.userId ?? 'unknown').toString().slice(0, 8)
      console.error(`[SCHEDULER] ❌ Error for user ${shortId}...:`, errorMsg)
      errors.push({ userId: r.userId, error: errorMsg })
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
      await prisma.$executeRawUnsafe(`
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


