import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPractitionerContactSummaryEmail } from '@/lib/practitioner-emails'

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

async function ensurePreferencesTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PractitionerNotificationPreference" (
      "practitionerAccountId" TEXT PRIMARY KEY,
      "weeklySummaryEnabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

async function getWeeklySummaryEnabled(accountId: string): Promise<boolean> {
  await ensurePreferencesTable()
  const rows = await prisma.$queryRawUnsafe<Array<{ weeklySummaryEnabled: boolean }>>(
    `SELECT "weeklySummaryEnabled"
     FROM "PractitionerNotificationPreference"
     WHERE "practitionerAccountId" = $1`,
    accountId
  )
  if (!rows.length) return true
  return Boolean(rows[0].weeklySummaryEnabled)
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const account = await prisma.practitionerAccount.findUnique({
    where: { userId: session.user.id },
    select: { id: true, contactEmail: true },
  })

  if (!account) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
  }

  const weeklySummaryEnabled = await getWeeklySummaryEnabled(account.id)
  if (!weeklySummaryEnabled) {
    return NextResponse.json({ error: 'Weekly summary emails are turned off.' }, { status: 400 })
  }

  const listing = await prisma.practitionerListing.findFirst({
    where: { practitionerAccountId: account.id },
    select: { id: true, displayName: true, slug: true },
  })

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
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

  const events = rows
    .map((row) => {
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
      const listingId = String(payload?.listingId || '').trim()
      if (!listingId) return null
      return {
        listingId,
        action: row.action || payload?.action || '',
        timestamp: new Date(row.timestamp),
      }
    })
    .filter(Boolean)
    .filter((event: any) => event.listingId === listing.id) as Array<{ listingId: string; action: string; timestamp: Date }>

  if (!events.length) {
    return NextResponse.json({ sent: 0, events: 0, message: 'No recent activity yet.' })
  }

  await sendPractitionerContactSummaryEmail({
    toEmail: account.contactEmail,
    displayName: listing.displayName,
    slug: listing.slug,
    rangeStart,
    rangeEnd,
    events,
  })

  return NextResponse.json({ sent: 1, events: events.length })
}
