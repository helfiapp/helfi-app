import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'helfi-admin-secret-2024'

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = (searchParams.get('token') || '').trim()
    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 })
    }

    await ensureAdminQrLoginTable()
    await cleanupExpired()

    const rows: Array<{ status: string; adminId: string | null; email: string | null; expiresAt: any }> =
      await prisma.$queryRawUnsafe(
        `SELECT status, adminId, email, expiresAt FROM "AdminQrLogin" WHERE token = $1`,
        token
      )

    if (!rows.length) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 })
    }

    const entry = rows[0]
    const expiresAtMs =
      typeof (entry as any).expiresAt === 'bigint'
        ? Number((entry as any).expiresAt)
        : Number((entry as any).expiresAt)

    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      await prisma.$executeRawUnsafe(`DELETE FROM "AdminQrLogin" WHERE token = $1`, token)
      return NextResponse.json({ error: 'Token expired' }, { status: 410 })
    }

    if (entry.status !== 'APPROVED' || !entry.adminId || !entry.email) {
      return NextResponse.json({ status: 'PENDING' })
    }

    const adminUser = await prisma.adminUser.findUnique({
      where: { id: entry.adminId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true
      }
    })

    if (!adminUser || adminUser.isActive === false) {
      await prisma.$executeRawUnsafe(`DELETE FROM "AdminQrLogin" WHERE token = $1`, token)
      return NextResponse.json({ error: 'Admin user not found or inactive' }, { status: 404 })
    }

    const jwtToken = jwt.sign(
      {
        adminId: adminUser.id,
        email: adminUser.email,
        role: adminUser.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    await prisma.$executeRawUnsafe(`DELETE FROM "AdminQrLogin" WHERE token = $1`, token)

    return NextResponse.json({
      status: 'APPROVED',
      token: jwtToken,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role
      }
    })
  } catch (error: any) {
    console.error('[ADMIN QR LOGIN] status error', error)
    return NextResponse.json({ error: 'Failed to check QR login status' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
