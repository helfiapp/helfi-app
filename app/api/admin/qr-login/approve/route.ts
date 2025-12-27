import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

async function cleanupExpired() {
  const now = new Date()
  await prisma.adminQrLogin.deleteMany({
    where: { expiresAt: { lt: now } }
  })
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

    await prisma.adminQrLogin.update({
      where: { token },
      data: {
        status: 'APPROVED',
        adminId: admin.adminId,
        email: admin.email.toLowerCase(),
        approvedAt: new Date()
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[ADMIN QR LOGIN] approve error', error)
    return NextResponse.json({ error: 'Failed to approve QR login' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
