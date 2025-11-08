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
        value INTEGER,
        note TEXT,
        isNa BOOLEAN DEFAULT false,
        PRIMARY KEY (userId, issueId, date)
      )
    `)
    // Ensure columns exist for older tables
    await prisma.$executeRawUnsafe(`
      ALTER TABLE CheckinRatings ALTER COLUMN value DROP NOT NULL;
    `).catch(()=>{})
    await prisma.$executeRawUnsafe(`
      ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS note TEXT;
    `).catch(()=>{})
    await prisma.$executeRawUnsafe(`
      ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS isNa BOOLEAN DEFAULT false;
    `).catch(()=>{})
    // Migrate earlier schema variants to current shape
    // 1) Ensure note column exists
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS note TEXT`)
    // 2) Ensure isNa column exists
    await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS isNa BOOLEAN DEFAULT false`)
    // 3) Ensure value column is nullable (some earlier tables had NOT NULL)
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ALTER COLUMN value DROP NOT NULL`)
    } catch { /* ignore if already nullable */ }
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
        await prisma.$executeRawUnsafe(`
          CREATE UNIQUE INDEX IF NOT EXISTS checkinissues_user_name_idx ON CheckinIssues (userId, name)
        `).catch(() => {})
        
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
        value INTEGER,
        note TEXT,
        isNa BOOLEAN DEFAULT false,
        PRIMARY KEY (userId, issueId, date)
      )
    `)
    // Ensure columns/nullability exist for older tables
    try { await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS note TEXT`) } catch(_) {}
    try { await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ADD COLUMN IF NOT EXISTS isNa BOOLEAN DEFAULT false`) } catch(_) {}
    try { await prisma.$executeRawUnsafe(`ALTER TABLE CheckinRatings ALTER COLUMN value DROP NOT NULL`) } catch(_) {}
    for (const r of ratings as Array<{ issueId: string, value?: number | null, note?: string, isNa?: boolean }>) {
      const clamped = (r.value === null || r.value === undefined) ? null : Math.max(0, Math.min(6, Number(r.value)))
      await prisma.$executeRawUnsafe(
        `INSERT INTO CheckinRatings (userId, issueId, date, value, note, isNa) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (userId, issueId, date) DO UPDATE SET value=EXCLUDED.value, note=EXCLUDED.note, isNa=EXCLUDED.isNa`,
        user.id, r.issueId, today, clamped, String(r.note || ''), !!r.isNa
      )
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('checkins save error', e)
    return NextResponse.json({ error: 'Failed to save ratings' }, { status: 500 })
  }
}


