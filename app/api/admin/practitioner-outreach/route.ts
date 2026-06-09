import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

const STATUSES = new Set(['NOT_REVIEWED', 'APPROVED', 'SENT', 'REPLIED', 'BOUNCED', 'UNSUBSCRIBED', 'DO_NOT_CONTACT'])
const ALL_COUNTRIES = '__all_countries__'
const ALL_CATEGORIES = '__all_categories__'
const ALL_STATUSES = '__all_statuses__'
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

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

function ensureAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  return extractAdminFromHeaders(authHeader)
}

function parsePositiveInteger(value: string | null, fallback: number, max?: number) {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return max ? Math.min(parsed, max) : parsed
}

function addParam(params: unknown[], value: unknown) {
  params.push(value)
  return `$${params.length}`
}

function buildContactWhere(searchParams: URLSearchParams, options: { includeCategory?: boolean; includeStatus?: boolean; includeSearch?: boolean } = {}) {
  const params: unknown[] = []
  const conditions: string[] = []
  const country = cleanText(searchParams.get('country'))
  const category = cleanText(searchParams.get('category'))
  const status = cleanText(searchParams.get('status'))?.toUpperCase()
  const search = cleanText(searchParams.get('search'))

  if (country && country !== ALL_COUNTRIES) {
    conditions.push(`"country" = ${addParam(params, country)}`)
  }

  if (options.includeCategory !== false && category && category !== ALL_CATEGORIES) {
    conditions.push(`COALESCE(NULLIF(TRIM("category"), ''), 'Uncategorised') = ${addParam(params, category)}`)
  }

  if (options.includeStatus !== false && status && status !== ALL_STATUSES && STATUSES.has(status)) {
    if (status === 'UNSUBSCRIBED') {
      conditions.push(`("unsubscribed" = true OR "status" = 'UNSUBSCRIBED')`)
    } else {
      conditions.push(`"status" = ${addParam(params, status)} AND "unsubscribed" = false`)
    }
  }

  if (options.includeSearch !== false && search) {
    const searchParam = addParam(params, `%${search}%`)
    conditions.push(`(
      "practiceName" ILIKE ${searchParam}
      OR COALESCE("name", '') ILIKE ${searchParam}
      OR COALESCE("email", '') ILIKE ${searchParam}
      OR COALESCE("phone", '') ILIKE ${searchParam}
      OR COALESCE("city", '') ILIKE ${searchParam}
      OR COALESCE("region", '') ILIKE ${searchParam}
      OR COALESCE("practitionerType", '') ILIKE ${searchParam}
      OR COALESCE("subcategory", '') ILIKE ${searchParam}
    )`)
  }

  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
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
      "phone" TEXT,
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
  await prisma.$executeRawUnsafe(`ALTER TABLE "PractitionerOutreachContact" ADD COLUMN IF NOT EXISTS "phone" TEXT;`)
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PractitionerOutreachContact_email_key"
    ON "PractitionerOutreachContact"("email")
    WHERE "email" IS NOT NULL;
  `)
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "PractitionerOutreachContact_sourceUrl_key";`)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PractitionerOutreachContact_sourceUrl_idx"
    ON "PractitionerOutreachContact"("sourceUrl")
    WHERE "sourceUrl" IS NOT NULL;
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PractitionerOutreachContact_country_status_idx"
    ON "PractitionerOutreachContact"("country", "status");
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PractitionerOutreachContact_category_idx"
    ON "PractitionerOutreachContact"("category", "subcategory");
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PractitionerOutreachContact_lastSentAt_idx"
    ON "PractitionerOutreachContact"("lastSentAt");
  `)
}

export async function GET(request: NextRequest) {
  const admin = ensureAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensurePractitionerOutreachSchema()

  const page = parsePositiveInteger(request.nextUrl.searchParams.get('page'), 1)
  const pageSize = parsePositiveInteger(request.nextUrl.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const offset = (page - 1) * pageSize
  const contactWhere = buildContactWhere(request.nextUrl.searchParams)
  const categoryWhere = buildContactWhere(request.nextUrl.searchParams, {
    includeCategory: false,
    includeStatus: false,
    includeSearch: false,
  })

  const contacts = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      "id", "name", "email", "practiceName", "country", "category", "subcategory", "region", "city",
      "practitionerType", "phone", "website", "emailType", "sourceUrl", "relevanceNotes",
      "safetyBasis", "doNotContactNotice", "status", "unsubscribed",
      "lastSentAt", "sentCount", "lastError", "createdAt", "updatedAt"
    FROM "PractitionerOutreachContact"
    ${contactWhere.whereSql}
    ORDER BY "country" ASC, "category" ASC, "subcategory" ASC, "practiceName" ASC, "name" ASC
    LIMIT ${addParam(contactWhere.params, pageSize)} OFFSET ${addParam(contactWhere.params, offset)}
  `, ...contactWhere.params)

  const totalRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "PractitionerOutreachContact" ${contactWhere.whereSql}`,
    ...contactWhere.params.slice(0, -2)
  )

  const totalContactRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM "PractitionerOutreachContact"
  `

  const countryCountRows = await prisma.$queryRaw<Array<{ country: string; count: bigint }>>`
    SELECT "country", COUNT(*)::bigint AS count
    FROM "PractitionerOutreachContact"
    GROUP BY "country"
    ORDER BY "country" ASC
  `

  const categoryCountRows = await prisma.$queryRawUnsafe<Array<{ category: string; count: bigint }>>(`
    SELECT COALESCE(NULLIF(TRIM("category"), ''), 'Uncategorised') AS category, COUNT(*)::bigint AS count
    FROM "PractitionerOutreachContact"
    ${categoryWhere.whereSql}
    GROUP BY COALESCE(NULLIF(TRIM("category"), ''), 'Uncategorised')
    ORDER BY category ASC
  `, ...categoryWhere.params)

  const countryCounts = countryCountRows.reduce((counts: Record<string, number>, row) => {
    counts[row.country || 'Unknown'] = Number(row.count || 0)
    return counts
  }, {})

  const categoryCounts = categoryCountRows.reduce((counts: Record<string, number>, row) => {
    counts[row.category || 'Uncategorised'] = Number(row.count || 0)
    return counts
  }, {})

  return NextResponse.json({
    contacts,
    page,
    pageSize,
    total: Number(totalRows[0]?.count || 0),
    totalContacts: Number(totalContactRows[0]?.count || 0),
    countryCounts,
    categoryCounts,
  })
}

export async function POST(request: NextRequest) {
  const admin = ensureAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensurePractitionerOutreachSchema()
  const body = await request.json().catch(() => ({}))
  const contacts = Array.isArray(body?.contacts) ? body.contacts : [body]
  let savedCount = 0

  for (const contact of contacts) {
    const email = normalizeEmail(contact?.email)
    const practiceName = cleanText(contact?.practiceName || contact?.company)
    const country = cleanText(contact?.country)
    if (!practiceName || !country || !email) continue

    const id = crypto.randomUUID()
    const name = cleanText(contact?.name)
    const category = cleanText(contact?.category)
    const subcategory = cleanText(contact?.subcategory)
    const region = cleanText(contact?.region)
    const city = cleanText(contact?.city)
    const practitionerType = cleanText(contact?.practitionerType)
    const phone = cleanText(contact?.phone)
    const website = cleanText(contact?.website)
    const emailType = cleanText(contact?.emailType)
    const sourceUrl = cleanText(contact?.sourceUrl)
    const relevanceNotes = cleanText(contact?.relevanceNotes || contact?.notes)
    const safetyBasis = cleanText(contact?.safetyBasis)
    const doNotContactNotice = Boolean(contact?.doNotContactNotice)
    const status = cleanStatus(contact?.status)

    if (email) {
      await prisma.$executeRaw`
        INSERT INTO "PractitionerOutreachContact" (
          "id", "name", "email", "practiceName", "country", "category", "subcategory", "region", "city",
          "practitionerType", "phone", "website", "emailType", "sourceUrl", "relevanceNotes",
          "safetyBasis", "doNotContactNotice", "status", "unsubscribed", "updatedAt"
        )
        VALUES (
          ${id}, ${name}, ${email}, ${practiceName}, ${country}, ${category}, ${subcategory}, ${region}, ${city},
          ${practitionerType}, ${phone}, ${website}, ${emailType}, ${sourceUrl}, ${relevanceNotes},
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
          "phone" = EXCLUDED."phone",
          "website" = EXCLUDED."website",
          "emailType" = EXCLUDED."emailType",
          "sourceUrl" = EXCLUDED."sourceUrl",
          "relevanceNotes" = EXCLUDED."relevanceNotes",
          "safetyBasis" = EXCLUDED."safetyBasis",
          "doNotContactNotice" = EXCLUDED."doNotContactNotice",
          "status" = EXCLUDED."status",
          "updatedAt" = NOW()
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO "PractitionerOutreachContact" (
          "id", "name", "email", "practiceName", "country", "category", "subcategory", "region", "city",
          "practitionerType", "phone", "website", "emailType", "sourceUrl", "relevanceNotes",
          "safetyBasis", "doNotContactNotice", "status", "unsubscribed", "updatedAt"
        )
        SELECT
          ${id}, ${name}, ${email}, ${practiceName}, ${country}, ${category}, ${subcategory}, ${region}, ${city},
          ${practitionerType}, ${phone}, ${website}, ${emailType}, ${sourceUrl}, ${relevanceNotes},
          ${safetyBasis}, ${doNotContactNotice}, ${status}, false, NOW()
        WHERE ${sourceUrl} IS NULL OR NOT EXISTS (
          SELECT 1 FROM "PractitionerOutreachContact"
          WHERE "sourceUrl" = ${sourceUrl}
        )
      `
    }
    savedCount += 1
  }

  return NextResponse.json({ savedCount })
}

export async function PATCH(request: NextRequest) {
  const admin = ensureAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensurePractitionerOutreachSchema()
  const body = await request.json().catch(() => ({}))
  const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : []
  const status = cleanStatus(body?.status)

  if (ids.length === 0) {
    return NextResponse.json({ error: 'No contacts selected' }, { status: 400 })
  }

  for (const id of ids) {
    await prisma.$executeRaw`
      UPDATE "PractitionerOutreachContact"
      SET
        "status" = ${status},
        "unsubscribed" = CASE WHEN ${status} = 'UNSUBSCRIBED' THEN true ELSE "unsubscribed" END,
        "updatedAt" = NOW()
      WHERE "id" = ${id}
    `
  }

  return NextResponse.json({ updatedCount: ids.length })
}

export async function DELETE(request: NextRequest) {
  const admin = ensureAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensurePractitionerOutreachSchema()
  const cleanupMissingEmail = request.nextUrl.searchParams.get('missingEmail') === 'true'
  if (cleanupMissingEmail) {
    const country = cleanText(request.nextUrl.searchParams.get('country'))
    const deletedRows = country
      ? await prisma.$executeRaw`
          DELETE FROM "PractitionerOutreachContact"
          WHERE "country" = ${country}
            AND ("email" IS NULL OR TRIM("email") = '')
        `
      : await prisma.$executeRaw`
          DELETE FROM "PractitionerOutreachContact"
          WHERE "email" IS NULL OR TRIM("email") = ''
        `

    return NextResponse.json({ deletedCount: Number(deletedRows || 0) })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Contact ID is required' }, { status: 400 })
  }

  await prisma.$executeRaw`
    DELETE FROM "PractitionerOutreachContact"
    WHERE "id" = ${id}
  `

  return NextResponse.json({ success: true })
}
