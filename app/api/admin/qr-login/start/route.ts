import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

const LOGIN_TTL_MS = 5 * 60 * 1000

async function cleanupExpired() {
  const now = new Date()
  await prisma.adminQrLogin.deleteMany({
    where: { expiresAt: { lt: now } }
  })
}

export async function GET(request: NextRequest) {
  try {
    await cleanupExpired()

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + LOGIN_TTL_MS)

    await prisma.adminQrLogin.create({
      data: {
        token,
        status: 'PENDING',
        expiresAt
      }
    })

    const origin = request.headers.get('origin') || request.headers.get('host')
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (origin ? `${protocol}://${origin}` : 'https://helfi.ai')

    return NextResponse.json({
      token,
      url: `${baseUrl}/admin-panel/qr-login?token=${token}`,
      expiresAt: expiresAt.getTime()
    })
  } catch (error: any) {
    console.error('[ADMIN QR LOGIN] start error', error)
    return NextResponse.json({ error: 'Failed to create QR login' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
