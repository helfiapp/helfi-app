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

  // Ensure required tables exist
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

  // Load all users with settings + subscriptions
  const rows: Array<{
    userid: string
    time1: string
    time2: string
    time3: string
    timezone: string
    frequency: number
    subscription: any
  }> = await prisma.$queryRawUnsafe(`
    SELECT s.userId as userId, s.time1, s.time2, s.time3, s.timezone, s.frequency, p.subscription
    FROM CheckinSettings s
    JOIN PushSubscriptions p ON p.userId = s.userId
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

      const targets = [r.time1, r.time2, r.time3].filter(Boolean)
      const shouldSend = targets.includes(current)
      if (!shouldSend) continue

      // Respect frequency 1..3 (send only first N times)
      const allowed = Math.max(1, Math.min(3, Number(r.frequency || 3)))
      const index = targets.indexOf(current)
      if (index > allowed - 1) continue

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


