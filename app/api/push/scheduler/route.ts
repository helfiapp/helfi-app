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

  // Ensure required tables exist (simplified schema - only time1 needed)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CheckinSettings (
      userId TEXT PRIMARY KEY,
      time1 TEXT NOT NULL,
      timezone TEXT NOT NULL
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS PushSubscriptions (
      userId TEXT PRIMARY KEY,
      subscription JSONB NOT NULL
    )
  `)

  // Load all users with subscriptions (use default 9pm for everyone)
  const rows: Array<{
    userid: string
    timezone: string
    subscription: any
  }> = await prisma.$queryRawUnsafe(`
    SELECT s.userId as userId, COALESCE(s.timezone, 'Australia/Melbourne') as timezone, p.subscription
    FROM CheckinSettings s
    JOIN PushSubscriptions p ON p.userId = s.userId
    UNION
    SELECT p.userId as userId, 'Australia/Melbourne' as timezone, p.subscription
    FROM PushSubscriptions p
    WHERE p.userId NOT IN (SELECT userId FROM CheckinSettings)
  `)

  // Determine current HH:MM in each user's timezone and match one of their times
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

      // Always use default 9pm (21:00) for all users
      const reminderTime = '21:00'
      const shouldSend = current === reminderTime
      if (!shouldSend) continue

      const payload = JSON.stringify({
        title: 'Time for your Helfi check‑in',
        body: 'Rate your selected issues for today in under a minute.',
        url: '/check-in'
      })
      await webpush.sendNotification(r.subscription, payload)
      sentTo.push(r.userid)
    } catch (e: any) {
      errors.push({ userId: (r as any).userid || (r as any).userId, error: e?.body || e?.message || String(e) })
    }
  }

  return NextResponse.json({ success: true, sent: sentTo.length, errors })
}

// Allow Vercel Cron (GET) to trigger the same logic safely
export async function GET(req: NextRequest) {
  return POST(req)
}


