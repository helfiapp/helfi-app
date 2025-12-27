import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

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
}

async function cleanupExpired() {
  const now = Date.now()
  await prisma.$executeRawUnsafe(`DELETE FROM "AdminQrLogin" WHERE "expiresAt" < $1`, now)
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 })
    }

    await ensureAdminQrLoginTable()
    await cleanupExpired()

    const rows: Array<{ token: string; status: string; expiresAt: any }> = await prisma.$queryRawUnsafe(
      `SELECT token, status, expiresAt FROM "AdminQrLogin" WHERE token = $1`,
      token
    )

    if (!rows.length) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 })
    }

    const expiresAtMs =
      typeof (rows[0] as any).expiresAt === 'bigint'
        ? Number((rows[0] as any).expiresAt)
        : Number((rows[0] as any).expiresAt)

    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      await prisma.$executeRawUnsafe(`DELETE FROM "AdminQrLogin" WHERE token = $1`, token)
      return NextResponse.json({ error: 'Token expired' }, { status: 410 })
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "AdminQrLogin"
       SET status = $2, adminId = $3, email = $4, approvedAt = NOW()
       WHERE token = $1`,
      token,
      'APPROVED',
      admin.adminId,
      admin.email.toLowerCase()
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[ADMIN QR LOGIN] approve error', error)
    return NextResponse.json({ error: 'Failed to approve QR login' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
