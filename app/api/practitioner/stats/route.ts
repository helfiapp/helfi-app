import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ACTION_KEYS = ['profile_view', 'call', 'website', 'email'] as const

type ActionKey = (typeof ACTION_KEYS)[number]

type ActionCounts = Record<ActionKey, number>

function emptyCounts(): ActionCounts {
  return {
    profile_view: 0,
    call: 0,
    website: 0,
    email: 0,
  }
}

async function ensureAnalyticsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
      id TEXT PRIMARY KEY,
      "timestamp" TIMESTAMPTZ NOT NULL,
      "action" TEXT,
      "type" TEXT,
      "userId" TEXT,
      payload JSONB NOT NULL
    )
  `)
}

function normalizeCounts(rows: Array<{ action: string | null; count: bigint | number | string }>) {
  const counts = emptyCounts()
  rows.forEach((row) => {
    const action = String(row.action || '').trim().toLowerCase()
    if (!ACTION_KEYS.includes(action as ActionKey)) return
    const value = typeof row.count === 'bigint' ? Number(row.count) : Number(row.count || 0)
    counts[action as ActionKey] = value
  })
  return counts
}

function totalFromCounts(counts: ActionCounts) {
  return ACTION_KEYS.reduce((sum, key) => sum + counts[key], 0)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const account = await prisma.practitionerAccount.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!account) {
    return NextResponse.json({ stats: null })
  }

  const listing = await prisma.practitionerListing.findFirst({
    where: { practitionerAccountId: account.id },
    select: { id: true },
  })

  if (!listing) {
    return NextResponse.json({ stats: null })
  }

  await ensureAnalyticsTable()

  const rangeEnd = new Date()
  const rangeStart = new Date(rangeEnd.getTime() - 7 * 24 * 60 * 60 * 1000)

  const rows = await prisma.$queryRawUnsafe<
    Array<{ action: string | null; count: bigint | number | string }>
  >(
    `SELECT "action", COUNT(*) AS count
     FROM "AnalyticsEvent"
     WHERE "type" = $1
       AND payload->>'listingId' = $2
       AND "timestamp" >= $3
       AND "timestamp" <= $4
     GROUP BY "action"`,
    'practitioner-contact',
    listing.id,
    rangeStart,
    rangeEnd
  )

  const counts = normalizeCounts(rows)

  return NextResponse.json({
    stats: {
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      counts,
      total: totalFromCounts(counts),
    },
  })
}
