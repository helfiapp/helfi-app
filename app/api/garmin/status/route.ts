import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deregisterGarminUser } from '@/lib/garmin-oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: 'garmin',
    },
    select: { providerAccountId: true, access_token: true, userId: true },
  })

  // Backfill: older Garmin deliveries may have been stored before we correctly mapped them to a Helfi user.
  // If we know the Garmin user id for this Helfi user, we can retro-attach recent logs.
  if (account?.providerAccountId) {
    const recentUnassigned = await prisma.garminWebhookLog.findMany({
      where: { userId: null },
      orderBy: { receivedAt: 'desc' },
      take: 200,
      select: { id: true, payload: true },
    })

    const matches: string[] = []
    for (const row of recentUnassigned) {
      const payload: any = row.payload
      const stack: any[] = [payload]
      let found = false
      while (stack.length && !found) {
        const node = stack.pop()
        if (!node) continue
        if (Array.isArray(node)) {
          for (const item of node) stack.push(item)
          continue
        }
        if (typeof node !== 'object') continue

        const possible = (node.userId ?? node.userid ?? node.user_id) as unknown
        if (typeof possible === 'string' && possible === account.providerAccountId) {
          found = true
          break
        }
        for (const v of Object.values(node)) stack.push(v)
      }
      if (found) matches.push(row.id)
      if (matches.length >= 50) break
    }

    if (matches.length) {
      await prisma.garminWebhookLog.updateMany({
        where: { id: { in: matches } },
        data: { userId: session.user.id },
      })
    }
  }

  const [webhookCount, lastWebhook] = await Promise.all([
    prisma.garminWebhookLog.count({ where: { userId: session.user.id } }),
    prisma.garminWebhookLog.findFirst({
      where: { userId: session.user.id },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true, dataType: true },
    }),
  ])

  return NextResponse.json({
    connected: !!account,
    garminUserId: account?.providerAccountId || null,
    webhookCount,
    lastWebhookAt: lastWebhook?.receivedAt?.toISOString() || null,
    lastDataType: lastWebhook?.dataType || null,
  })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: 'garmin',
    },
  })

  if (!account) {
    return NextResponse.json({ success: true, message: 'Not connected' })
  }

  try {
    if (account.access_token) {
      const resp = await deregisterGarminUser(account.access_token)
      if (!resp.ok) {
        console.warn('⚠️ Failed to deregister Garmin user:', resp.status, await resp.text())
      }
    }
  } catch (error) {
    console.warn('⚠️ Garmin deregistration error:', error)
  }

  await prisma.account.delete({ where: { id: account.id } })
  await prisma.garminWebhookLog.deleteMany({ where: { userId: session.user.id } })

  return NextResponse.json({ success: true })
}
