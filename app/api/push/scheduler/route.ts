import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'

// This endpoint is intended to be triggered by a cron (e.g., Vercel Cron) every 5 minutes.
// It finds users whose reminder time matches the current time in their timezone and sends a push.

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const expected = process.env.SCHEDULER_SECRET || ''
  const isVercelCron = (req.headers.get('x-vercel-cron') || '').toString() === '1'
  if (!(isVercelCron || (expected && authHeader === `Bearer ${expected}`))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

      // Check if current time matches any reminder time (within 5-minute window)
      // Since cron runs every 5 minutes, we check if reminder time is within the current 5-minute bucket
      const shouldSend = reminderTimes.some(reminderTime => {
        const [rh, rm] = reminderTime.split(':').map(Number)
        const [ch, cm] = [parseInt(hh, 10), parseInt(mm, 10)]
        
        // Round current time down to nearest 5-minute mark (e.g., 12:33 -> 12:30)
        const currentRoundedMinutes = Math.floor(cm / 5) * 5
        
        // Check if reminder time matches the rounded current time
        return rh === ch && rm === currentRoundedMinutes
      })

      if (!shouldSend) continue

      const payload = JSON.stringify({
        title: 'Time for your Helfi check‑in',
        body: 'Rate your selected issues for today in under a minute.',
        url: '/check-in'
      })
      await webpush.sendNotification(r.subscription, payload)
      sentTo.push(r.userId)
    } catch (e: any) {
      errors.push({ userId: r.userId, error: e?.body || e?.message || String(e) })
    }
  }

  return NextResponse.json({ success: true, sent: sentTo.length, errors })
}

// Allow Vercel Cron (GET) to trigger the same logic safely
export async function GET(req: NextRequest) {
  return POST(req)
}


