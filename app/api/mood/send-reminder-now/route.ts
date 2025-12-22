import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const rows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
    `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
    user.id,
  )
  if (!rows.length) return NextResponse.json({ error: 'No subscription' }, { status: 400 })

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || ''
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
  }
  webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

  const payload = JSON.stringify({
    title: 'Quick mood check‑in',
    body: 'How are you feeling right now? It takes 10 seconds.',
    url: '/mood/quick',
  })

  try {
    await webpush.sendNotification(rows[0].subscription, payload)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('mood send-reminder-now error', e?.body || e?.message || e)
    return NextResponse.json({ error: 'Failed to send reminder' }, { status: 500 })
  }
}
