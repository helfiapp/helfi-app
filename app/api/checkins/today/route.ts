import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const today = new Date().toISOString().slice(0,10)

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS CheckinIssues (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        name TEXT NOT NULL,
        polarity TEXT NOT NULL
      )
    `)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS CheckinRatings (
        userId TEXT NOT NULL,
        issueId TEXT NOT NULL,
        date TEXT NOT NULL,
        value INTEGER NOT NULL,
        PRIMARY KEY (userId, issueId, date)
      )
    `)
  } catch {}

  const issues: any[] = await prisma.$queryRawUnsafe(`SELECT id, name, polarity FROM CheckinIssues WHERE userId = $1`, user.id)
  const ratings: any[] = await prisma.$queryRawUnsafe(`SELECT issueId, value FROM CheckinRatings WHERE userId = $1 AND date = $2`, user.id, today)

  return NextResponse.json({ issues, ratings })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { ratings } = await req.json()
  const today = new Date().toISOString().slice(0,10)

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS CheckinRatings (
        userId TEXT NOT NULL,
        issueId TEXT NOT NULL,
        date TEXT NOT NULL,
        value INTEGER NOT NULL,
        PRIMARY KEY (userId, issueId, date)
      )
    `)
    for (const r of ratings as Array<{ issueId: string, value: number }>) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO CheckinRatings (userId, issueId, date, value) VALUES ($1,$2,$3,$4)
         ON CONFLICT (userId, issueId, date) DO UPDATE SET value=EXCLUDED.value`,
        user.id, r.issueId, today, Math.max(0, Math.min(6, Number(r.value)))
      )
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('checkins save error', e)
    return NextResponse.json({ error: 'Failed to save ratings' }, { status: 500 })
  }
}


