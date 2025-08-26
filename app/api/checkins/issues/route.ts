import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  try {
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT id, name, polarity FROM CheckinIssues WHERE userId = $1`, user.id)
    return NextResponse.json({ issues: rows })
  } catch {
    return NextResponse.json({ issues: [] })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { issues } = await req.json() as { issues: Array<{ name: string, polarity?: 'positive'|'negative' }> }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS CheckinIssues (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        name TEXT NOT NULL,
        polarity TEXT NOT NULL,
        UNIQUE (userId, name)
      )
    `)

    for (const item of issues) {
      const name = String(item.name || '').trim()
      if (!name) continue
      const polarity = (item.polarity === 'negative' || /pain|ache|anxiety|depress|fatigue|nausea|bloat|insomnia|brain fog|headache|migraine|cramp|stress|itch|rash|acne|diarrh|constipat|gas|heartburn/i.test(name)) ? 'negative' : 'positive'
      const id = crypto.randomUUID()
      await prisma.$executeRawUnsafe(
        `INSERT INTO CheckinIssues (id, userId, name, polarity) VALUES ($1,$2,$3,$4)
         ON CONFLICT (userId, name) DO UPDATE SET polarity=EXCLUDED.polarity`,
        id, user.id, name, polarity
      )
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('checkins issues save error', e)
    return NextResponse.json({ error: 'Failed to save issues' }, { status: 500 })
  }
}


