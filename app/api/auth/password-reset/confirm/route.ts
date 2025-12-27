import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    const token = String(body?.token || '').trim()
    const password = String(body?.password || '')

    if (!email || !token || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 })
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    })

    if (!record || record.email !== email) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
    }

    if (record.expires < new Date()) {
      await prisma.passwordResetToken.deleteMany({ where: { email } })
      return NextResponse.json({ error: 'Reset link expired' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        emailVerified: user.emailVerified ?? new Date(),
      },
    })

    await prisma.passwordResetToken.deleteMany({ where: { email } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Password reset confirm error:', error)
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
  }
}
