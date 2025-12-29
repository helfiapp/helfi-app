import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET

async function cleanupExpired() {
  const now = new Date()
  await prisma.adminQrLogin.deleteMany({
    where: { expiresAt: { lt: now } }
  })
}

export async function GET(request: NextRequest) {
  try {
    if (!JWT_SECRET) {
      return NextResponse.json({ error: 'Admin login secret not configured' }, { status: 500 })
    }
    const { searchParams } = new URL(request.url)
    const token = (searchParams.get('token') || '').trim()
    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 })
    }

    await cleanupExpired()

    const entry = await prisma.adminQrLogin.findUnique({
      where: { token }
    })

    if (!entry) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 })
    }

    if (!entry.expiresAt || entry.expiresAt.getTime() < Date.now()) {
      await prisma.adminQrLogin.delete({ where: { token } })
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

    await prisma.adminQrLogin.delete({ where: { token } })

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
