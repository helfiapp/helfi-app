import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { practitionerOutreachSeed } from '@/lib/practitioner-outreach-seed'

const STATUSES = new Set(['NOT_REVIEWED', 'APPROVED', 'SENT', 'REPLIED', 'BOUNCED', 'UNSUBSCRIBED', 'DO_NOT_CONTACT'])

function ensureAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  return extractAdminFromHeaders(authHeader)
}

function normalizeEmail(email?: string | null) {
  const trimmed = (email || '').trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

function cleanText(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : null
}

function cleanStatus(value: unknown) {
  const status = typeof value === 'string' ? value.trim().toUpperCase() : 'NOT_REVIEWED'
  return STATUSES.has(status) ? status : 'NOT_REVIEWED'
}

async function ensurePractitionerOutreachSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PractitionerOutreachContact" (
      "id" TEXT NOT NULL,
      "name" TEXT,
      "email" TEXT,
      "practiceName" TEXT NOT NULL,
      "country" TEXT NOT NULL,
      "category" TEXT,
      "subcategory" TEXT,
      "region" TEXT,
      "city" TEXT,
      "practitionerType" TEXT,
      "website" TEXT,
      "emailType" TEXT,
      "sourceUrl" TEXT,
      "relevanceNotes" TEXT,
      "safetyBasis" TEXT,
      "doNotContactNotice" BOOLEAN NOT NULL DEFAULT false,
      "status" TEXT NOT NULL DEFAULT 'NOT_REVIEWED',
      "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
      "lastSentAt" TIMESTAMP(3),
      "sentCount" INTEGER NOT NULL DEFAULT 0,
      "lastError" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PractitionerOutreachContact_pkey" PRIMARY KEY ("id")
    );
  `)
  await prisma.$executeRawUnsafe(`ALTER TABLE "PractitionerOutreachContact" ADD COLUMN IF NOT EXISTS "category" TEXT;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "PractitionerOutreachContact" ADD COLUMN IF NOT EXISTS "subcategory" TEXT;`)
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PractitionerOutreachContact_email_key"
    ON "PractitionerOutreachContact"("email")
    WHERE "email" IS NOT NULL;
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PractitionerOutreachContact_country_status_idx"
    ON "PractitionerOutreachContact"("country", "status");
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PractitionerOutreachContact_category_idx"
    ON "PractitionerOutreachContact"("category", "subcategory");
  `)
}

export async function POST(request: NextRequest) {
  const admin = ensureAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensurePractitionerOutreachSchema()

  let savedCount = 0
  for (const contact of practitionerOutreachSeed) {
    const id = crypto.randomUUID()
    const email = normalizeEmail(contact.email)
    const name = cleanText(contact.name)
    const practiceName = cleanText(contact.practiceName)
    const country = cleanText(contact.country)
    const category = cleanText(contact.category)
    const subcategory = cleanText(contact.subcategory)
    const region = cleanText(contact.region)
    const city = cleanText(contact.city)
    const practitionerType = cleanText(contact.practitionerType)
    const website = cleanText(contact.website)
    const emailType = cleanText(contact.emailType)
    const sourceUrl = cleanText(contact.sourceUrl)
    const relevanceNotes = cleanText(contact.relevanceNotes)
    const safetyBasis = cleanText(contact.safetyBasis)
    const doNotContactNotice = Boolean(contact.doNotContactNotice)
    const status = cleanStatus(contact.status)

    if (!practiceName || !country || !email) continue

    await prisma.$executeRaw`
      INSERT INTO "PractitionerOutreachContact" (
        "id", "name", "email", "practiceName", "country", "category", "subcategory", "region", "city",
        "practitionerType", "website", "emailType", "sourceUrl", "relevanceNotes",
        "safetyBasis", "doNotContactNotice", "status", "unsubscribed", "updatedAt"
      )
      VALUES (
        ${id}, ${name}, ${email}, ${practiceName}, ${country}, ${category}, ${subcategory}, ${region}, ${city},
        ${practitionerType}, ${website}, ${emailType}, ${sourceUrl}, ${relevanceNotes},
        ${safetyBasis}, ${doNotContactNotice}, ${status}, false, NOW()
      )
      ON CONFLICT ("email") WHERE "email" IS NOT NULL DO UPDATE SET
        "name" = EXCLUDED."name",
        "practiceName" = EXCLUDED."practiceName",
        "country" = EXCLUDED."country",
        "category" = EXCLUDED."category",
        "subcategory" = EXCLUDED."subcategory",
        "region" = EXCLUDED."region",
        "city" = EXCLUDED."city",
        "practitionerType" = EXCLUDED."practitionerType",
        "website" = EXCLUDED."website",
        "emailType" = EXCLUDED."emailType",
        "sourceUrl" = EXCLUDED."sourceUrl",
        "relevanceNotes" = EXCLUDED."relevanceNotes",
        "safetyBasis" = EXCLUDED."safetyBasis",
        "doNotContactNotice" = EXCLUDED."doNotContactNotice",
        "status" = CASE
          WHEN "PractitionerOutreachContact"."status" IN ('SENT', 'REPLIED', 'UNSUBSCRIBED', 'DO_NOT_CONTACT')
            THEN "PractitionerOutreachContact"."status"
          ELSE EXCLUDED."status"
        END,
        "updatedAt" = NOW()
    `
    savedCount += 1
  }

  return NextResponse.json({ savedCount })
}
