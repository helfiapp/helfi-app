import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import bcrypt from 'bcryptjs'

import { prisma } from '@/lib/prisma'

// Phone app login (separate from NextAuth's /api/auth/* catch-all):
// - Takes email + password
// - Returns a NextAuth-compatible JWT that the phone app can send as:
//   Authorization: Bearer <token>
//
// This lets the phone app call protected API routes without opening a browser.

const SECRET = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days

export async function POST(req: NextRequest) {
  try {
    if (!SECRET) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const body = await req.json().catch(() => ({}))
    const emailRaw = typeof body?.email === 'string' ? body.email : ''
    const passwordRaw = typeof body?.password === 'string' ? body.password : ''
    const accountTypeRaw = typeof body?.accountType === 'string' ? body.accountType : ''
    const practitionerIntent = accountTypeRaw.trim().toLowerCase() === 'practitioner'

    const email = emailRaw.trim().toLowerCase()
    const password = passwordRaw.trim()

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        passwordHash: true,
        emailVerified: true,
        practitionerAccount: { select: { id: true } },
      },
    })

    if (!user?.passwordHash) {
      // Avoid leaking if an account exists.
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const match = await bcrypt.compare(password, user.passwordHash)
    if (!match) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Keep behavior consistent with credentials provider (auto-verify on first successful password login).
    if (!user.emailVerified) {
      try {
        await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } })
      } catch {
        // Non-blocking.
      }
    }

    let hasPractitionerAccount = Boolean(user.practitionerAccount?.id)
    if (practitionerIntent && !hasPractitionerAccount) {
      try {
        await prisma.practitionerAccount.create({
          data: {
            userId: user.id,
            contactEmail: user.email.toLowerCase(),
          },
        })
        hasPractitionerAccount = true
      } catch {
        // Non-blocking: if it already exists due to a race, treat as practitioner account present.
        hasPractitionerAccount = true
      }
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    const exp = nowSeconds + SESSION_MAX_AGE_SECONDS
    const token = await encode({
      token: {
        sub: user.id,
        id: user.id,
        email: user.email,
        name: user.name || user.email.split('@')[0],
        image: user.image,
        iat: nowSeconds,
        exp,
      },
      secret: SECRET,
      maxAge: SESSION_MAX_AGE_SECONDS,
    })

    const res = NextResponse.json(
      {
        ok: true,
        token,
        expiresAt: exp * 1000,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          isPractitioner: hasPractitionerAccount,
        },
      },
      { status: 200 },
    )
    res.headers.set('cache-control', 'no-store')
    return res
  } catch (error) {
    console.error('Native login failed:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
