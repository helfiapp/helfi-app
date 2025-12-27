import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

const LOGIN_TTL_MS = 5 * 60 * 1000

async function ensureAdminQrLoginTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AdminQrLogin" (
      token TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      adminId TEXT,
      email TEXT,
      expiresAt BIGINT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
      approvedAt TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "AdminQrLogin_status_idx" ON "AdminQrLogin"(status)`
  ).catch(() => {})
}

async function cleanupExpired() {
  const now = Date.now()
  await prisma.$executeRawUnsafe(`DELETE FROM "AdminQrLogin" WHERE "expiresAt" < $1`, now)
}

export async function GET(request: NextRequest) {
  try {
    await ensureAdminQrLoginTable()
    await cleanupExpired()

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = Date.now() + LOGIN_TTL_MS

    await prisma.$executeRawUnsafe(
      `INSERT INTO "AdminQrLogin" (token, status, expiresAt) VALUES ($1, $2, $3)`,
      token,
      'PENDING',
      expiresAt
    )

    const origin = request.headers.get('origin') || request.headers.get('host')
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (origin ? `${protocol}://${origin}` : 'https://helfi.ai')

    return NextResponse.json({
      token,
      url: `${baseUrl}/admin-panel/qr-login?token=${token}`,
      expiresAt
    })
  } catch (error: any) {
    console.error('[ADMIN QR LOGIN] start error', error)
    return NextResponse.json({ error: 'Failed to create QR login' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
