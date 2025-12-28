import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import { normalizeSubscriptionList, removeSubscriptionsByEndpoint, sendToSubscriptions } from '@/lib/push-subscriptions'
import { isSchedulerAuthorized } from '@/lib/scheduler-auth'

// Upstash QStash will POST here. This simply reuses our notifyOwner pathway,
// which resolves owner's subscription and performs the web-push delivery.
export async function POST(req: NextRequest) {
  try {
    if (!isSchedulerAuthorized(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { event, userEmail, userName, amount, currency, planName, creditAmount } = body || {}
    if (!event || !userEmail) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    // Log receipt
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS OwnerPushLog (
          createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
          event TEXT,
          userEmail TEXT,
          status TEXT,
          info TEXT
        )
      `)
      await prisma.$executeRawUnsafe(
        `INSERT INTO OwnerPushLog (event, userEmail, status, info) VALUES ($1, $2, $3, $4)`,
        event,
        userEmail,
        'received_qstash',
        null
      )
    } catch {}

    // Direct delivery using same underlying mechanism as reminders
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
    const privateKey = process.env.VAPID_PRIVATE_KEY || ''
    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'vapid_not_configured' }, { status: 500 })
    }
    webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

    // Resolve owner subscription
    const ownerEmail = (process.env.OWNER_EMAIL || 'admin@helfi.ai').toLowerCase()

    // Find owner userId in User table (AdminUser accounts map by email)
    const owner = await prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true }
    })
    if (!owner?.id) {
      return NextResponse.json({ error: 'owner_not_found' }, { status: 404 })
    }

    // Ensure PushSubscriptions exists and fetch subscription
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS PushSubscriptions (
        userId TEXT PRIMARY KEY,
        subscription JSONB NOT NULL
      )
    `)
    const subRows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
      `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
      owner.id
    )
    if (!subRows.length) {
      return NextResponse.json({ error: 'no_owner_subscription' }, { status: 400 })
    }
    const subscriptions = normalizeSubscriptionList(subRows[0].subscription)
    if (!subscriptions.length) {
      return NextResponse.json({ error: 'no_owner_subscription' }, { status: 400 })
    }

    // Build payload
    const titleMap: Record<string, string> = {
      signup: '🎉 New User Signup',
      subscription: '💰 New Subscription',
      credit_purchase: '💳 Credit Purchase',
    }
    const bodyText =
      event === 'signup'
        ? `${userName || (userEmail || '').split('@')[0]} just signed up!`
        : event === 'subscription'
        ? `${userName || (userEmail || '').split('@')[0]} purchased ${planName || 'Premium'}`
        : `${userName || (userEmail || '').split('@')[0]} bought ${creditAmount ? `${creditAmount} credits` : 'credits'}` +
          (amount ? ` (${(amount / 100).toFixed(2)} ${currency || 'USD'})` : '')

    const payload = JSON.stringify({
      title: titleMap[event] || 'Helfi Update',
      body: bodyText,
      url: '/admin-panel',
    })

    const { sent, errors, goneEndpoints } = await sendToSubscriptions(subscriptions, (sub) =>
      webpush.sendNotification(sub, payload)
    )
    if (goneEndpoints.length) {
      const remaining = removeSubscriptionsByEndpoint(subscriptions, goneEndpoints)
      await prisma.$executeRawUnsafe(
        `UPDATE PushSubscriptions SET subscription = $2::jsonb, updatedAt = NOW() WHERE userId = $1`,
        owner.id,
        JSON.stringify(remaining)
      )
    }
    if (!sent) {
      return NextResponse.json({ error: 'push_failed', details: errors }, { status: 500 })
    }
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO OwnerPushLog (event, userEmail, status, info) VALUES ($1, $2, $3, $4)`,
        event,
        userEmail,
        'sent_qstash',
        null
      )
    } catch {}

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[OWNER PUSH API] error', e?.stack || e)
    return NextResponse.json({ error: 'owner_push_error', message: e?.message || String(e) }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
