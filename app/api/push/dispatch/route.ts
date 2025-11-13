import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import { scheduleReminderWithQStash } from '@/lib/qstash'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DispatchPayload = {
  userId: string
  reminderTime: string // "HH:MM"
  timezone: string
}

export async function POST(req: NextRequest) {
  try {
    // Optional simple verification: require Upstash signature header if configured
    const requireSignature = !!process.env.QSTASH_REQUIRE_SIGNATURE
    if (requireSignature) {
      const sig = req.headers.get('Upstash-Signature')
      if (!sig) {
        return NextResponse.json({ error: 'missing_signature' }, { status: 401 })
      }
      // In a follow-up we can add full Ed25519 signature verification using @upstash/qstash
    }

    const body = (await req.json().catch(() => ({}))) as Partial<DispatchPayload>
    const userId = String(body.userId || '')
    const reminderTime = String(body.reminderTime || '')
    const timezone = String(body.timezone || '')
    if (!userId || !reminderTime || !timezone) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    // Ensure subscription exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS PushSubscriptions (
        userId TEXT PRIMARY KEY,
        subscription JSONB NOT NULL
      )
    `)
    const rows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
      `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
      userId
    )
    if (!rows.length) {
      return NextResponse.json({ error: 'no_subscription' }, { status: 400 })
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
    const privateKey = process.env.VAPID_PRIVATE_KEY || ''
    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'vapid_not_configured' }, { status: 500 })
    }
    webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

    // Delivery log table for de-duplication
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ReminderDeliveryLog (
        userId TEXT NOT NULL,
        reminderTime TEXT NOT NULL,
        sentDate DATE NOT NULL,
        sentAt TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (userId, reminderTime, sentDate)
      )
    `)

    // Compute local date for de-dup (based on the user's tz)
    const now = new Date()
    const dateParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
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
      await webpush.sendNotification(rows[0].subscription, payload)
      await prisma.$executeRawUnsafe(
        `INSERT INTO ReminderDeliveryLog (userId, reminderTime, sentDate, sentAt)
         VALUES ($1, $2, $3::date, NOW())
         ON CONFLICT (userId, reminderTime, sentDate) DO UPDATE SET sentAt = NOW()`,
        userId,
        reminderTime,
        localDate
      )
    }

    // Schedule the next occurrence for this same reminder
    const nextSchedule = await scheduleReminderWithQStash(userId, reminderTime, timezone).catch((error) => {
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


