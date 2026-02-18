import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type HealthTipUser = {
  id: string
  email: string
}

async function getHealthTipUser(req: NextRequest): Promise<HealthTipUser | null> {
  const session = await getServerSession(authOptions)
  const sessionEmail = String(session?.user?.email || '')
    .trim()
    .toLowerCase()
  if (sessionEmail) {
    const user = await prisma.user.findUnique({
      where: { email: sessionEmail },
      select: { id: true, email: true },
    })
    if (user?.id && user?.email) return user
  }

  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  if (!secret) return null
  const token = await getToken({ req, secret }).catch(() => null)
  const tokenEmail = String(token?.email || '')
    .trim()
    .toLowerCase()
  if (!tokenEmail) return null
  const tokenUser = await prisma.user.findUnique({
    where: { email: tokenEmail },
    select: { id: true, email: true },
  })
  if (tokenUser?.id && tokenUser?.email) return tokenUser
  return null
}

export async function GET(req: NextRequest) {
  const user = await getHealthTipUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    safetyNote: string | null
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
       metadata->'suggestedQuestions' AS "suggestedQuestions",
       metadata->>'safetyNote' AS "safetyNote"
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
    const safetyNote =
      typeof tip.safetyNote === 'string' && tip.safetyNote.trim().length > 0
        ? tip.safetyNote.trim()
        : ''
    return {
      ...tip,
      suggestedQuestions: suggestions,
      safetyNote,
    }
  })

  return NextResponse.json({ tips: tipsWithSuggestions })
}

export async function DELETE(req: NextRequest) {
  const user = await getHealthTipUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray((body as any)?.ids)
    ? (body as any).ids
        .filter((value: unknown): value is string => typeof value === 'string')
        .map((value: string) => value.trim())
        .filter((value: string) => value.length > 0)
        .slice(0, 200)
    : []

  if (!ids.length) {
    return NextResponse.json({ error: 'No history items selected.' }, { status: 400 })
  }

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

  const deleted: Array<{ id: string }> = await prisma.$queryRawUnsafe(
    `DELETE FROM HealthTips
     WHERE userId = $1
       AND id = ANY($2::text[])
     RETURNING id`,
    user.id,
    ids
  )

  return NextResponse.json({
    success: true,
    deletedCount: deleted.length,
    deletedIds: deleted.map((row) => row.id),
  })
}
