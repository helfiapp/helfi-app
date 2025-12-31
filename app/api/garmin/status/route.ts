import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deregisterGarminUser, fetchGarminUserId } from '@/lib/garmin-oauth'
import { ensureGarminSchema } from '@/lib/garmin-db'

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

  let tokenValid = true
  if (account) {
    if (!account.access_token) {
      tokenValid = false
    } else {
      try {
        const tokenCheck = await fetchGarminUserId(account.access_token)
        const status = typeof tokenCheck?.status === 'number' ? tokenCheck.status : null
        if (status === 401 || status === 403) {
          tokenValid = false
        }
      } catch {
        // Keep existing status on transient failures.
      }
    }
  }

  let webhookCount = 0
  let lastWebhookAt: string | null = null
  let lastDataType: string | null = null

  try {
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

    const [count, lastWebhook] = await Promise.all([
      prisma.garminWebhookLog.count({ where: { userId: session.user.id } }),
      prisma.garminWebhookLog.findFirst({
        where: { userId: session.user.id },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true, dataType: true },
      }),
    ])

    webhookCount = count
    lastWebhookAt = lastWebhook?.receivedAt?.toISOString() || null
    lastDataType = lastWebhook?.dataType || null
  } catch (error: any) {
    // If Garmin tables aren’t present yet in prod, create them and return a minimal status.
    const message = String(error?.message || '')
    if (error?.code === 'P2021' || message.includes('does not exist') || message.includes('relation')) {
      try {
        await ensureGarminSchema()
      } catch {}
    } else {
      console.warn('⚠️ Garmin status enrichment failed:', error)
    }
  }

  return NextResponse.json({
    connected: !!account && tokenValid,
    garminUserId: account?.providerAccountId || null,
    webhookCount,
    lastWebhookAt,
    lastDataType,
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
