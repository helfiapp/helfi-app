import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const email = String(session?.user?.email || '').trim().toLowerCase()

    if (!email) {
      return NextResponse.json({ error: 'Please sign in again before changing your password.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const currentPassword = String(body?.currentPassword || '')
    const newPassword = String(body?.newPassword || '')

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current password and new password are required.' }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters long.' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: 'This account does not have a password yet. Please use the password reset page to create one.' },
        { status: 400 },
      )
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!matches) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: 'Password could not be changed. Please try again.' }, { status: 500 })
  }
}
