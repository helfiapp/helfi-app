import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Ensure table exists
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS HealthTips (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      tipDate DATE NOT NULL,
      sentAt TIMESTAMP NOT NULL DEFAULT NOW(),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL,
      metadata JSONB,
      costCents INTEGER,
      chargeCents INTEGER
    )
  `)

  const today = new Date()
  const day = today.toISOString().slice(0, 10)

  const tips: Array<{
    id: string
    tipDate: string
    sentAt: Date
    title: string
    body: string
    category: string
    costCents: number | null
    chargeCents: number | null
  }> = await prisma.$queryRawUnsafe(
    `SELECT id, tipDate, sentAt, title, body, category, costCents, chargeCents
     FROM HealthTips
     WHERE userId = $1 AND tipDate = $2::date
     ORDER BY sentAt ASC`,
    user.id,
    day
  )

  return NextResponse.json({ tips })
}


