import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { deleteNotificationsByType } from '@/lib/notification-inbox'
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

export async function GET(req: NextRequest) {
  const user = await getCheckinUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    SELECT issueId AS "issueId", value, note, isNa AS "isNa", timestamp
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
  const user = await getCheckinUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureCheckinTables()

  const body = await req.json().catch(() => ({}))
  const ratings = Array.isArray(body?.ratings) ? body.ratings : []
  const today = new Date().toISOString().slice(0,10)

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
    
    const normalizedRatings = (ratings as Array<{ issueId?: string, value?: number | null, note?: string, isNa?: boolean }>)
      .filter((rating) => Boolean(rating?.issueId))
      .map((rating) => {
        const numericValue = rating.value === null || rating.value === undefined
          ? null
          : Number(rating.value)
        return {
          id: crypto.randomUUID(),
          issueId: String(rating.issueId),
          value: numericValue === null || !Number.isFinite(numericValue)
            ? null
            : Math.max(0, Math.min(6, numericValue)),
          note: String(rating.note || ''),
          isNa: Boolean(rating.isNa),
        }
      })

    if (normalizedRatings.length > 0) {
      await prisma.$transaction(async (tx) => {
        const issueIds = normalizedRatings.map((rating) => rating.issueId)
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM CheckinRatings
            WHERE userId = ${user.id}
              AND date = ${today}
              AND issueId IN (${Prisma.join(issueIds)})`
        )

        const values = normalizedRatings.map((rating) => Prisma.sql`(
          ${rating.id}, ${user.id}, ${rating.issueId}, ${today}, NOW(),
          ${rating.value}, ${rating.note}, ${rating.isNa}
        )`)
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO CheckinRatings
            (id, userId, issueId, date, timestamp, value, note, isNa)
            VALUES ${Prisma.join(values)}`
        )
      })
    }
    await deleteNotificationsByType(user.id, ['checkin_reminder']).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('checkins save error', e)
    return NextResponse.json({ error: 'Failed to save ratings', detail: (e as any)?.message || null }, { status: 500 })
  }
}
