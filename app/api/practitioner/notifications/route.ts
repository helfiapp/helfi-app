import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
    return NextResponse.json({ preferences: null })
  }

  const weeklySummaryEnabled = await getWeeklySummaryEnabled(account.id)

  return NextResponse.json({
    preferences: {
      weeklySummaryEnabled,
    },
  })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const account = await prisma.practitionerAccount.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!account) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  if (typeof body?.weeklySummaryEnabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid preference.' }, { status: 400 })
  }

  await ensurePreferencesTable()

  await prisma.$executeRawUnsafe(
    `INSERT INTO "PractitionerNotificationPreference" ("practitionerAccountId", "weeklySummaryEnabled", "createdAt", "updatedAt")
     VALUES ($1, $2, now(), now())
     ON CONFLICT ("practitionerAccountId")
     DO UPDATE SET "weeklySummaryEnabled" = EXCLUDED."weeklySummaryEnabled", "updatedAt" = now()`,
    account.id,
    body.weeklySummaryEnabled
  )

  return NextResponse.json({
    preferences: {
      weeklySummaryEnabled: body.weeklySummaryEnabled,
    },
  })
}
