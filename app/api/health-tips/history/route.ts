import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start') || '1970-01-01'
  const end = searchParams.get('end') || new Date().toISOString().slice(0, 10)

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
     WHERE userId = $1 AND tipDate BETWEEN $2::date AND $3::date
     ORDER BY tipDate DESC, sentAt DESC`,
    user.id,
    start,
    end
  )

  return NextResponse.json({ tips })
}


