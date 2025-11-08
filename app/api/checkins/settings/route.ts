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
      `SELECT time1, timezone FROM CheckinSettings WHERE userId = $1 LIMIT 1`,
      user.id
    )
    if (rows?.length) {
      return NextResponse.json({ 
        time1: rows[0].time1 || '21:00', 
        timezone: rows[0].timezone || 'Australia/Melbourne' 
      })
    }
  } catch {}

  return NextResponse.json({ time1: '21:00', timezone: 'Australia/Melbourne' })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  let { time1, timezone } = body as any

  // Normalize time on the server to avoid client formatting issues
  const normalizeTime = (input?: string): string => {
    if (!input) return '21:00'
    const s = String(input).trim().toLowerCase()
    const m24 = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
    if (m24) return `${m24[1].padStart(2,'0')}:${m24[2]}`
    const m12 = s.match(/^([0-1]?\d):([0-5]\d)\s*(am|pm)$/)
    if (m12) {
      let h = parseInt(m12[1], 10)
      const mm = m12[2]
      const ap = m12[3]
      if (ap === 'pm' && h !== 12) h += 12
      if (ap === 'am' && h === 12) h = 0
      return `${String(h).padStart(2,'0')}:${mm}`
    }
    // Fallback: digits HHMM
    const digits = s.replace(/[^0-9]/g, '')
    if (digits.length >= 3) {
      const h = parseInt(digits.slice(0, digits.length - 2), 10)
      const mm = parseInt(digits.slice(-2), 10)
      return `${String(Math.max(0, Math.min(23, h))).padStart(2,'0')}:${String(Math.max(0, Math.min(59, mm))).padStart(2,'0')}`
    }
    return '21:00'
  }

  time1 = normalizeTime(time1)
  timezone = (timezone && String(timezone).trim()) || 'Australia/Melbourne'

  // Auto-create table if missing (simplified schema - only time1 needed)
  try {
    console.log('Saving CheckinSettings for', user.id, { time1, timezone })
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS CheckinSettings (
        userId TEXT PRIMARY KEY,
        time1 TEXT NOT NULL,
        timezone TEXT NOT NULL
      )
    `)
    // Ensure timezone column exists (for backward compatibility)
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Australia/Melbourne'`).catch(() => {})
    // Update existing records to use time1 as the reminder time
    await prisma.$executeRawUnsafe(
      `INSERT INTO CheckinSettings (userId, time1, timezone)
       VALUES ($1,$2,$3)
       ON CONFLICT (userId) DO UPDATE SET time1=EXCLUDED.time1, timezone=EXCLUDED.timezone`,
      user.id, time1, timezone
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('checkins settings save error', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to save settings', detail: message }, { status: 500 })
  }
}


