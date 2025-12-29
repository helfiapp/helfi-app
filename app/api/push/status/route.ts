import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeSubscriptionList } from '@/lib/push-subscriptions'

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })

    // Ensure tables exist and check current records
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS PushSubscriptions (
        userId TEXT PRIMARY KEY,
        subscription JSONB NOT NULL
      )
    `)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS CheckinSettings (
        userId TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT true,
        time1 TEXT NOT NULL,
        time2 TEXT NOT NULL,
        time3 TEXT NOT NULL,
        timezone TEXT NOT NULL,
        frequency INTEGER NOT NULL DEFAULT 3
      )
    `)

    const subRows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
      `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
      user.id
    )
    const settingsRows: Array<{ enabled: boolean; time1: string; time2: string; time3: string; timezone: string; frequency: number }> =
      await prisma.$queryRawUnsafe(
        `SELECT enabled, time1, time2, time3, timezone, frequency FROM CheckinSettings WHERE userId = $1`,
        user.id
      )

    const subscriptionCount = subRows.length ? normalizeSubscriptionList(subRows[0].subscription).length : 0
    const hasSubscription = subscriptionCount > 0
    const hasSettings = settingsRows.length > 0

    return NextResponse.json({
      ok: true,
      userId: user.id,
      hasSubscription,
      subscriptionCount,
      hasSettings,
      settings: hasSettings ? settingsRows[0] : null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
