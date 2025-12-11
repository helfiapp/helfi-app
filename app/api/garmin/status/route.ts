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
  })

  return NextResponse.json({
    connected: !!account,
    garminUserId: account?.providerAccountId || null,
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
