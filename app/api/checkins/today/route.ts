import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

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
    await prisma.$executeRawUnsafe(`
      DELETE FROM CheckinIssues a
      USING CheckinIssues b
      WHERE a.id > b.id AND a.userId = b.userId AND a.name = b.name
    `).catch(() => {})
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS checkinissues_user_name_idx ON CheckinIssues (userId, name)
    `).catch(() => {})
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS id TEXT`).catch(() => {})
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP NOT NULL DEFAULT NOW()`).catch(() => {})
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ALTER COLUMN value DROP NOT NULL`).catch(() => {})
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS note TEXT`).catch(() => {})
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS isNa BOOLEAN DEFAULT false`).catch(() => {})
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_checkinratings_user_date ON CheckinRatings(userId, date)`).catch(() => {})
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_checkinratings_timestamp ON CheckinRatings(timestamp DESC)`).catch(() => {})
    checkinTablesEnsured = true
  } catch (error) {
    console.error('[checkins] Failed to ensure tables', error)
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await ensureCheckinTables()

  const today = new Date().toISOString().slice(0,10)

  try {
    // await prisma.$executeRawUnsafe(`
    //   CREATE TABLE IF NOT EXISTS CheckinIssues (
    //     id TEXT PRIMARY KEY,
    //     userId TEXT NOT NULL,
    //     name TEXT NOT NULL,
    //     polarity TEXT NOT NULL
    //   )
    // `)
    // await prisma.$executeRawUnsafe(`
    //   CREATE TABLE IF NOT EXISTS CheckinRatings (
    //     id TEXT PRIMARY KEY,
    //     userId TEXT NOT NULL,
    //     issueId TEXT NOT NULL,
    //     date TEXT NOT NULL,
    //     timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    //     value INTEGER,
    //     note TEXT,
    //     isNa BOOLEAN DEFAULT false
    //   )
    // `)
    // // Migrate old schema: add timestamp and id columns if they don't exist
    // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS id TEXT`).catch(() => {})
    // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP NOT NULL DEFAULT NOW()`).catch(() => {})
    // // Ensure columns exist for older tables
    // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ALTER COLUMN value DROP NOT NULL`).catch(()=>{})
    // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS note TEXT`).catch(()=>{})
    // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS isNa BOOLEAN DEFAULT false`).catch(()=>{})
    
    // // Migrate existing records: generate IDs and timestamps for records without them
    // await prisma.$executeRawUnsafe(`
    //   UPDATE CheckinRatings 
    //   SET id = COALESCE(id, gen_random_uuid()::text),
    //       timestamp = COALESCE(timestamp, NOW())
    //   WHERE id IS NULL OR timestamp IS NULL
    // `).catch(() => {})
    
    // // Create indexes for better query performance
    // await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_checkinratings_user_date ON CheckinRatings(userId, date)`).catch(() => {})
    // await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_checkinratings_timestamp ON CheckinRatings(timestamp DESC)`).catch(() => {})
  } catch {}

  let issues: any[] = await prisma.$queryRawUnsafe(`SELECT id, name, polarity FROM CheckinIssues WHERE userId = $1`, user.id)
  
  // If no issues found in CheckinIssues, sync from HealthGoal table
  if (issues.length === 0) {
    try {
      // Try to get selected issues from __SELECTED_ISSUES__ record
      const selectedIssuesRecord = await prisma.healthGoal.findFirst({
        where: {
          userId: user.id,
          name: '__SELECTED_ISSUES__'
        }
      })
      
      let issueNames: string[] = []
      
      if (selectedIssuesRecord?.category) {
        try {
          const parsed = JSON.parse(selectedIssuesRecord.category)
          if (Array.isArray(parsed)) {
            issueNames = parsed.map((name: any) => String(name || '').trim()).filter(Boolean)
          }
        } catch {}
      }
      
      // Fallback: get from regular health goals if no selected issues found
      if (issueNames.length === 0) {
        const healthGoals = await prisma.healthGoal.findMany({
          where: {
            userId: user.id,
            name: { notIn: ['__EXERCISE_DATA__', '__HEALTH_SITUATIONS_DATA__', '__SELECTED_ISSUES__'] }
          }
        })
        issueNames = healthGoals.map(goal => goal.name.trim()).filter(Boolean)
      }
      
      // Sync issues to CheckinIssues table
      if (issueNames.length > 0) {
        // Ensure unique constraint exists
        // await prisma.$executeRawUnsafe(`
        //   CREATE UNIQUE INDEX IF NOT EXISTS checkinissues_user_name_idx ON CheckinIssues (userId, name)
        // `).catch(() => {})
        
        for (const issueName of issueNames) {
          const polarity = /pain|ache|anxiety|depress|fatigue|nausea|bloat|insomnia|brain fog|headache|migraine|cramp|stress|itch|rash|acne|diarrh|constipat|gas|heartburn/i.test(issueName) ? 'negative' : 'positive'
          const id = crypto.randomUUID()
          try {
            await prisma.$queryRawUnsafe(
              `INSERT INTO CheckinIssues (id, userId, name, polarity) VALUES ($1,$2,$3,$4)
               ON CONFLICT (userId, name) DO UPDATE SET polarity=EXCLUDED.polarity`,
              id, user.id, issueName, polarity
            )
          } catch (e) {
            // Ignore conflicts, continue with next issue
            console.error('Error syncing issue:', issueName, e)
          }
        }
        
        // Reload issues after sync
        issues = await prisma.$queryRawUnsafe(`SELECT id, name, polarity FROM CheckinIssues WHERE userId = $1`, user.id)
      }
    } catch (e) {
      console.error('Error syncing health goals to CheckinIssues:', e)
    }
  }
  
  // Get the most recent check-in for today (show latest entry per issue)
  const allRatings: any[] = await prisma.$queryRawUnsafe(`
    SELECT issueId, value, note, isNa, timestamp
    FROM CheckinRatings 
    WHERE userId = $1 AND date = $2 
    ORDER BY timestamp DESC
  `, user.id, today)
  
  // Group by issueId and take the most recent one
  const ratingsMap = new Map<string, any>()
  for (const rating of allRatings) {
    if (!ratingsMap.has(rating.issueId)) {
      ratingsMap.set(rating.issueId, rating)
    }
  }
  const ratings = Array.from(ratingsMap.values())

  return NextResponse.json({ issues, ratings })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await ensureCheckinTables()

  const body = await req.json().catch(() => ({}))
  const ratings = Array.isArray(body?.ratings) ? body.ratings : []
  const today = new Date().toISOString().slice(0,10)
  const now = new Date().toISOString()

  try {
    // await prisma.$executeRawUnsafe(`
    //   CREATE TABLE IF NOT EXISTS CheckinRatings (
    //     id TEXT PRIMARY KEY,
    //     userId TEXT NOT NULL,
    //     issueId TEXT NOT NULL,
    //     date TEXT NOT NULL,
    //     timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    //     value INTEGER,
    //     note TEXT,
    //     isNa BOOLEAN DEFAULT false
    //   )
    // `)
    // // Migrate old schema: add timestamp and id columns if they don't exist
    // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS id TEXT`).catch(() => {})
    // await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP NOT NULL DEFAULT NOW()`).catch(() => {})
    // // Ensure columns/nullability exist for older tables
    // try { await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS note TEXT`) } catch(_) {}
    // try { await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS isNa BOOLEAN DEFAULT false`) } catch(_) {}
    // try { await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ALTER COLUMN value DROP NOT NULL`) } catch(_) {}
    
    for (const r of ratings as Array<{ issueId?: string, value?: number | null, note?: string, isNa?: boolean }>) {
      if (!r?.issueId) continue
      const clamped = (r.value === null || r.value === undefined) ? null : Math.max(0, Math.min(6, Number(r.value)))
      const id = crypto.randomUUID()
      await prisma.$executeRawUnsafe(
        `DELETE FROM CheckinRatings WHERE userId = $1 AND issueId = $2 AND date = $3`,
        user.id, r.issueId, today
      )
      await prisma.$queryRawUnsafe(
        `INSERT INTO CheckinRatings (id, userId, issueId, date, timestamp, value, note, isNa) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        id, user.id, r.issueId, today, now, clamped, String(r.note || ''), !!r.isNa
      )
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('checkins save error', e)
    return NextResponse.json({ error: 'Failed to save ratings', detail: (e as any)?.message || null }, { status: 500 })
  }
}
