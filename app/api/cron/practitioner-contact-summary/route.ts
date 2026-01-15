import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPractitionerContactSummaryEmail } from '@/lib/practitioner-emails'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const expected = process.env.SCHEDULER_SECRET || ''
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null
  return isVercelCron || (expected && authHeader === `Bearer ${expected}`)
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

function normalizePayload(value: any): any {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return { raw: value }
    }
  }
  return value
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureAnalyticsTable()

  const rangeEnd = new Date()
  const rangeStart = new Date(rangeEnd.getTime() - 7 * 24 * 60 * 60 * 1000)

  const rows = await prisma.$queryRawUnsafe<
    Array<{ action: string | null; timestamp: Date; payload: any }>
  >(
    `SELECT "action", "timestamp", payload
     FROM "AnalyticsEvent"
     WHERE "timestamp" >= $1 AND "type" = $2
     ORDER BY "timestamp" ASC`,
    rangeStart,
    'practitioner-contact'
  )

  if (!rows.length) {
    return NextResponse.json({ sent: 0, events: 0 })
  }

  const events = rows
    .map((row) => {
      const payload = normalizePayload(row.payload)
      const listingId = String(payload?.listingId || '').trim()
      if (!listingId) return null
      return {
        listingId,
        action: row.action || payload?.action || '',
        timestamp: new Date(row.timestamp),
      }
    })
    .filter(Boolean) as Array<{ listingId: string; action: string; timestamp: Date }>

  const listingIds = Array.from(new Set(events.map((event) => event.listingId)))
  if (!listingIds.length) {
    return NextResponse.json({ sent: 0, events: rows.length })
  }

  const listings = await prisma.practitionerListing.findMany({
    where: { id: { in: listingIds } },
    include: { practitionerAccount: true },
  })

  const listingMap = new Map(listings.map((listing) => [listing.id, listing]))
  let sent = 0

  for (const listingId of listingIds) {
    const listing = listingMap.get(listingId)
    if (!listing?.practitionerAccount?.contactEmail) continue
    const listingEvents = events
      .filter((event) => event.listingId === listingId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    if (!listingEvents.length) continue
    sendPractitionerContactSummaryEmail({
      toEmail: listing.practitionerAccount.contactEmail,
      displayName: listing.displayName,
      slug: listing.slug,
      rangeStart,
      rangeEnd,
      events: listingEvents,
    })
    sent += 1
  }

  return NextResponse.json({ sent, events: rows.length })
}
