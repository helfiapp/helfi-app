import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function ensurePushSubscriptionsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS PushSubscriptions (
      userId TEXT PRIMARY KEY,
      subscription JSONB NOT NULL,
      updatedAt TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)
  await prisma.$executeRawUnsafe(
    `ALTER TABLE PushSubscriptions ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP NOT NULL DEFAULT NOW()`
  ).catch(() => {})
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  try {
    await ensurePushSubscriptionsTable()
    await prisma.$executeRawUnsafe(`DELETE FROM PushSubscriptions WHERE userId = $1`, user.id)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('push unsubscribe error', e)
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }
}


