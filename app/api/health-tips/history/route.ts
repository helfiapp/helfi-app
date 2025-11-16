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

  // Work out the effective timezone for this user (match scheduling)
  let effectiveTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Melbourne'
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS HealthTipSettings (
        userId TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT true,
        time1 TEXT NOT NULL,
        time2 TEXT NOT NULL,
        time3 TEXT NOT NULL,
        timezone TEXT NOT NULL,
        frequency INTEGER NOT NULL DEFAULT 1,
        focusFood BOOLEAN NOT NULL DEFAULT true,
        focusSupplements BOOLEAN NOT NULL DEFAULT true,
        focusLifestyle BOOLEAN NOT NULL DEFAULT true
      )
    `)
    const rows: Array<{ timezone: string }> = await prisma.$queryRawUnsafe(
      `SELECT timezone FROM HealthTipSettings WHERE userId = $1`,
      user.id
    )
    if (rows.length > 0 && rows[0].timezone) {
      effectiveTimezone = rows[0].timezone
    }
  } catch {
    // ignore – fall back to environment timezone above
  }

  // Default to the last 30 local days when no explicit range is provided
  const now = new Date()
  const localFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: effectiveTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const endParam = searchParams.get('end')
  const startParam = searchParams.get('start')

  const endParts = localFormatter.formatToParts(now)
  const todayStr = `${endParts.find((p) => p.type === 'year')?.value}-${endParts
    .find((p) => p.type === 'month')
    ?.value}-${endParts.find((p) => p.type === 'day')?.value}`

  const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const startParts = localFormatter.formatToParts(startDate)
  const defaultStartStr = `${startParts.find((p) => p.type === 'year')?.value}-${startParts
    .find((p) => p.type === 'month')
    ?.value}-${startParts.find((p) => p.type === 'day')?.value}`

  const start = startParam || defaultStartStr
  const end = endParam || todayStr

  const tips: Array<{
    id: string
    tipDate: string
    sentAt: Date
    title: string
    body: string
    category: string
    costCents: number | null
    chargeCents: number | null
    suggestedQuestions: any
  }> = await prisma.$queryRawUnsafe(
    `SELECT 
       id,
       tipDate AS "tipDate",
       sentAt AS "sentAt",
       title,
       body,
       category,
       costCents,
       chargeCents,
       metadata->'suggestedQuestions' AS "suggestedQuestions"
     FROM HealthTips
     WHERE userId = $1 AND tipDate BETWEEN $2::date AND $3::date
     ORDER BY tipDate DESC, sentAt DESC`,
    user.id,
    start,
    end
  )

  const tipsWithSuggestions = tips.map((tip) => {
    const raw = tip.suggestedQuestions
    const suggestions =
      Array.isArray(raw) && raw.length > 0
        ? raw.filter((q) => typeof q === 'string' && q.trim().length > 0).slice(0, 3)
        : []
    return {
      ...tip,
      suggestedQuestions: suggestions,
    }
  })

  return NextResponse.json({ tips: tipsWithSuggestions })
}


