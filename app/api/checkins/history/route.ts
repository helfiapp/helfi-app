import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCheckinUser } from '@/app/api/checkins/_auth'

let checkinTablesEnsured = false

async function ensureCheckinTables() {
  if (checkinTablesEnsured) return
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
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS CheckinRatings (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        issueId TEXT NOT NULL,
        date TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        value INTEGER,
        note TEXT,
        isNa BOOLEAN DEFAULT false
      )
    `)
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS note TEXT`).catch(() => {})
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS isNa BOOLEAN DEFAULT false`).catch(() => {})
    checkinTablesEnsured = true
  } catch (error) {
    console.error('[checkins] Failed to ensure tables', error)
  }
}

export async function GET(req: NextRequest) {
  const user = await getCheckinUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureCheckinTables()

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start') || '1970-01-01'
  const end = searchParams.get('end') || new Date().toISOString().slice(0,10)

  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT r.id, r.date, r.timestamp, r.issueId AS "issueId", i.name, i.polarity, r.value, r.note, r.isNa AS "isNa"
       FROM CheckinRatings r
       JOIN CheckinIssues i ON i.id = r.issueId
       WHERE r.userId = $1 AND r.date BETWEEN $2 AND $3
       ORDER BY r.timestamp DESC, i.name ASC`,
      user.id, start, end
    )
    return NextResponse.json({ history: rows })
  } catch (e) {
    console.error('checkins history error', e)
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 })
  }
}
