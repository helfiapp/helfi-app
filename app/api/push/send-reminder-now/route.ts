import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import { publishWithQStash } from '@/lib/qstash'
import { dedupeSubscriptions, normalizeSubscriptionList, removeSubscriptionsByEndpoint, sendToSubscriptions } from '@/lib/push-subscriptions'
import { isSchedulerAuthorized } from '@/lib/scheduler-auth'
import { createInboxNotification } from '@/lib/notification-inbox'

export async function POST(req: NextRequest) {
  const isScheduler = isSchedulerAuthorized(req)
  if (!isScheduler) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const publishResult = await publishWithQStash('/api/push/send-reminder-now', {
      userId: user.id,
    })
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

  // Ensure subscription exists
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS PushSubscriptions (
      userId TEXT PRIMARY KEY,
      subscription JSONB NOT NULL
    )
  `)
  const rows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
    `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
    user.id
  )
  if (!rows.length) return NextResponse.json({ error: 'No subscription' }, { status: 400 })
  const subscriptions = dedupeSubscriptions(normalizeSubscriptionList(rows[0].subscription))
  if (!subscriptions.length) return NextResponse.json({ error: 'No subscription' }, { status: 400 })

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || ''
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
  }
  webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

  const payload = JSON.stringify({
    title: 'Time for your Helfi check‑in',
    body: 'Rate your selected issues for today in under a minute.',
    url: '/check-in'
  })
  try {
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
      console.error('send-reminder-now error', errors.map((e) => e.message).join('; '))
      return NextResponse.json({ error: 'Failed to send reminder' }, { status: 500 })
    }
    await createInboxNotification({
      userId: user.id,
      title: 'Time for your Helfi check-in',
      body: 'Rate your selected issues for today in under a minute.',
      url: '/check-in',
      type: 'checkin_reminder',
      source: 'push',
      eventKey: `checkin:manual:${Date.now()}`,
    }).catch(() => {})
    return NextResponse.json({ success: true, sent })
  } catch (e: any) {
    console.error('send-reminder-now error', e?.body || e?.message || e)
    return NextResponse.json({ error: 'Failed to send reminder' }, { status: 500 })
  }
}
