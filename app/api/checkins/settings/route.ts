import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // For now, read from a simple table if exists; otherwise return defaults
  try {
    // @ts-ignore: allow raw read without schema coupling
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT time1, time2, time3, timezone, COALESCE(frequency, 3) as frequency FROM CheckinSettings WHERE userId = $1 LIMIT 1`,
      user.id
    )
    if (rows?.length) return NextResponse.json(rows[0])
  } catch {}

  return NextResponse.json({ time1: '12:30', time2: '18:30', time3: '21:30', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, frequency: 3 })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { time1, time2, time3, timezone, frequency } = await req.json()

  // Auto-create table if missing (safe add-only)
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS CheckinSettings (
        userId TEXT PRIMARY KEY,
        time1 TEXT NOT NULL,
        time2 TEXT NOT NULL,
        time3 TEXT NOT NULL,
        timezone TEXT NOT NULL,
        frequency INTEGER NOT NULL DEFAULT 3
      )
    `)
    await prisma.$executeRawUnsafe(
      `INSERT INTO CheckinSettings (userId, time1, time2, time3, timezone, frequency)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (userId) DO UPDATE SET time1=EXCLUDED.time1, time2=EXCLUDED.time2, time3=EXCLUDED.time3, timezone=EXCLUDED.timezone, frequency=EXCLUDED.frequency`,
      user.id, time1, time2, time3, timezone, Math.min(3, Math.max(1, Number(frequency || 3)))
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('checkins settings save error', e)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}


