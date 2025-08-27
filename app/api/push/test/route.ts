import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Ensure table exists and load subscription
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
  const subscription = rows[0].subscription

  // Configure web-push
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || ''
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
  }
  webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

  const payload = JSON.stringify({
    title: 'Helfi test notification',
    body: 'Push is working. Tap to open your daily check‑in.',
    url: '/check-in'
  })

  try {
    await webpush.sendNotification(subscription, payload)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('push test error', e?.body || e?.message || e)
    return NextResponse.json({ error: 'Failed to send push' }, { status: 500 })
  }
}


