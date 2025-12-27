import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { partnerOutreachSeed } from '@/lib/partner-outreach-seed'

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

export async function POST(request: NextRequest) {
  const admin = ensureAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensurePartnerOutreachSchema()
    const data = partnerOutreachSeed.map(entry => ({
      name: entry.name.trim(),
      email: entry.email.trim().toLowerCase(),
      company: entry.company.trim(),
      region: entry.region ? entry.region.trim() : null,
      notes: entry.notes ? entry.notes.trim() : null,
      sourceUrl: entry.sourceUrl ? entry.sourceUrl.trim() : null,
      unsubscribed: false
    }))

    const result = await prisma.partnerOutreachContact.createMany({
      data,
      skipDuplicates: true
    })

    return NextResponse.json({ createdCount: result.count })
  } catch (error: any) {
    console.error('Error initializing partner outreach contacts:', error)
    return NextResponse.json({ error: 'Failed to initialize contacts' }, { status: 500 })
  }
}
