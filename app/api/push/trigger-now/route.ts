import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import { publishWithQStash } from '@/lib/qstash'
import { dedupeSubscriptions, normalizeSubscriptionList, removeSubscriptionsByEndpoint, sendToSubscriptions } from '@/lib/push-subscriptions'
import { isSchedulerAuthorized } from '@/lib/scheduler-auth'

// Manual trigger endpoint - bypasses cron and sends reminder immediately
export async function POST(req: NextRequest) {
  const isScheduler = isSchedulerAuthorized(req)
  if (!isScheduler) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const publishResult = await publishWithQStash('/api/push/trigger-now', { userId: user.id })
    if (!publishResult.ok) {
      return NextResponse.json({ error: 'Failed to enqueue reminder' }, { status: 500 })
    }
    return NextResponse.json({ enqueued: true })
  }

  const body = await req.json().catch(() => ({}))
  const userId = String(body?.userId || '')
  if (!userId) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  try {
    // Get subscription
    const subRows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
      `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
      user.id
    )
    if (!subRows.length) {
      return NextResponse.json({ error: 'No push subscription found' }, { status: 400 })
    }
    const subscriptions = dedupeSubscriptions(normalizeSubscriptionList(subRows[0].subscription))
    if (!subscriptions.length) {
      return NextResponse.json({ error: 'No push subscription found' }, { status: 400 })
    }

    // Get settings
    const settingsRows: Array<{ enabled: boolean; time1: string; time2: string; time3: string; timezone: string; frequency: number }> =
      await prisma.$queryRawUnsafe(
        `SELECT enabled, time1, time2, time3, timezone, frequency FROM CheckinSettings WHERE userId = $1`,
        user.id
      )
    const settings = settingsRows[0] || {
      enabled: true,
      time1: '12:30',
      time2: '18:30',
      time3: '21:30',
      timezone: 'Australia/Melbourne',
      frequency: 3
    }
    if (settings.enabled === false) {
      return NextResponse.json({ error: 'Reminders are turned off' }, { status: 400 })
    }

    // Configure web-push
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
    const privateKey = process.env.VAPID_PRIVATE_KEY || ''
    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
    }
    webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

    // Send notification
    const payload = JSON.stringify({
      title: 'Time for your Helfi check‑in',
      body: 'Rate your selected issues for today in under a minute.',
      url: '/check-in'
    })
    
    const { sent, errors, goneEndpoints } = await sendToSubscriptions(subscriptions, (sub) =>
      webpush.sendNotification(sub, payload)
    )
    if (goneEndpoints.length) {
      const remaining = removeSubscriptionsByEndpoint(subscriptions, goneEndpoints)
      await prisma.$executeRawUnsafe(
        `UPDATE PushSubscriptions SET subscription = $2::jsonb, updatedAt = NOW() WHERE userId = $1`,
        user.id,
        JSON.stringify(remaining)
      )
    }
    if (!sent) {
      return NextResponse.json({ error: 'Failed to send reminder', details: errors }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Reminder sent immediately',
      reminderTime: settings.time1,
      timezone: settings.timezone
    })
  } catch (e: any) {
    console.error('[TRIGGER-NOW] Error:', e)
    return NextResponse.json({ 
      error: 'Failed to send reminder', 
      details: e?.body || e?.message || String(e) 
    }, { status: 500 })
  }
}
