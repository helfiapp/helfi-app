import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

const normalizeEmail = (email?: string | null) => {
  const trimmed = (email || '').trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

const ensureAdmin = (request: NextRequest) => {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin) {
    return null
  }
  return admin
}

const ensurePartnerOutreachSchema = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PartnerOutreachContact" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "email" TEXT,
      "company" TEXT NOT NULL,
      "region" TEXT,
      "notes" TEXT,
      "sourceUrl" TEXT,
      "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "PartnerOutreachContact_pkey" PRIMARY KEY ("id")
    );
  `)
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PartnerOutreachContact_email_key"
    ON "PartnerOutreachContact"("email");
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PartnerOutreachContact_company_idx"
    ON "PartnerOutreachContact"("company");
  `)
}

export async function GET(request: NextRequest) {
  const admin = ensureAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensurePartnerOutreachSchema()
    const contacts = await prisma.partnerOutreachContact.findMany({
      orderBy: [{ company: 'asc' }, { name: 'asc' }]
    })

    return NextResponse.json({ contacts })
  } catch (error: any) {
    console.error('Error fetching partner outreach contacts:', error)
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const admin = ensureAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensurePartnerOutreachSchema()
    const body = await request.json()
    const contacts = Array.isArray(body?.contacts) ? body.contacts : [body]

    const normalized = contacts
      .map((contact: any) => ({
        name: (contact?.name || '').trim(),
        email: normalizeEmail(contact?.email),
        company: (contact?.company || '').trim(),
        region: contact?.region ? String(contact.region).trim() : null,
        notes: contact?.notes ? String(contact.notes).trim() : null,
        sourceUrl: contact?.sourceUrl ? String(contact.sourceUrl).trim() : null,
        unsubscribed: Boolean(contact?.unsubscribed)
      }))
      .filter((contact: any) => contact.name && contact.company)

    if (normalized.length === 0) {
      return NextResponse.json({ error: 'No valid contacts provided' }, { status: 400 })
    }

    const result = await prisma.partnerOutreachContact.createMany({
      data: normalized,
      skipDuplicates: true
    })

    return NextResponse.json({ createdCount: result.count })
  } catch (error: any) {
    console.error('Error creating partner outreach contacts:', error)
    return NextResponse.json({ error: 'Failed to create contacts' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const admin = ensureAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Contact ID is required' }, { status: 400 })
    }

    await prisma.partnerOutreachContact.delete({ where: { id } })

    return NextResponse.json({ message: 'Contact deleted' })
  } catch (error: any) {
    console.error('Error deleting partner outreach contact:', error)
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 })
  }
}
