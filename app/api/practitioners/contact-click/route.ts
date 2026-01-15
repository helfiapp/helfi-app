import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyTrackingToken } from '@/lib/practitioner-tracking'

const ALLOWED_ACTIONS = new Set(['profile_view', 'call', 'website', 'email'])

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const listingId = String(body?.listingId || '').trim()
    const action = String(body?.action || '').trim().toLowerCase()
    const token = String(body?.token || '').trim()

    if (!listingId || !action || !token) {
      return NextResponse.json({ success: false, error: 'Missing fields.' }, { status: 400 })
    }

    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 })
    }

    if (!verifyTrackingToken(listingId, token)) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 })
    }

    const listing = await prisma.practitionerListing.findUnique({
      where: { id: listingId },
      select: { id: true },
    })
    if (!listing) {
      return NextResponse.json({ success: false, error: 'Listing not found.' }, { status: 404 })
    }

    await ensureAnalyticsTable()

    const now = new Date()
    const eventId = `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`
    const payload = {
      id: eventId,
      timestamp: now.toISOString(),
      action,
      type: 'practitioner-contact',
      listingId,
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "AnalyticsEvent" (id, "timestamp", "action", "type", "userId", payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      payload.id,
      now,
      payload.action,
      payload.type,
      null,
      JSON.stringify(payload)
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[practitioner-contact-click] Failed to log', error)
    return NextResponse.json({ success: false, error: 'Failed to log.' }, { status: 500 })
  }
}
