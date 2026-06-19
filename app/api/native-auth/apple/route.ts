import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import { createRemoteJWKSet, jwtVerify } from 'jose'

import { ensureFreeCreditColumns, NEW_USER_FREE_CREDITS } from '@/lib/free-credits'
import { prisma } from '@/lib/prisma'

const SECRET = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const APPLE_ISSUER = 'https://appleid.apple.com'
const APPLE_KEYS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function getAppleAudiences() {
  return Array.from(
    new Set(
      [
        process.env.APPLE_BUNDLE_ID,
        process.env.EXPO_PUBLIC_APPLE_BUNDLE_ID,
        'ai.helfi.app',
        process.env.APPLE_CLIENT_ID,
      ]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean),
    ),
  )
}

function formatName(fullName: any, email: string) {
  const given = typeof fullName?.givenName === 'string' ? fullName.givenName.trim() : ''
  const family = typeof fullName?.familyName === 'string' ? fullName.familyName.trim() : ''
  const joined = [given, family].filter(Boolean).join(' ').trim()
  if (joined) return joined
  return email ? email.split('@')[0] : 'Helfi user'
}

async function createSession(user: { id: string; email: string; name: string | null; image: string | null }) {
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
    secret: SECRET!,
    maxAge: SESSION_MAX_AGE_SECONDS,
  })

  return {
    ok: true,
    token,
    expiresAt: exp * 1000,
    user: { id: user.id, email: user.email, name: user.name, image: user.image },
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!SECRET) {
      return NextResponse.json({ error: 'Server sign in is not configured.' }, { status: 500 })
    }

    const body = await req.json().catch(() => ({}))
    const identityToken = typeof body?.identityToken === 'string' ? body.identityToken.trim() : ''
    if (!identityToken) {
      return NextResponse.json({ error: 'Apple sign in did not return a token.' }, { status: 400 })
    }

    const { payload } = await jwtVerify(identityToken, APPLE_KEYS, {
      issuer: APPLE_ISSUER,
      audience: getAppleAudiences(),
    })

    const appleUserId = typeof payload.sub === 'string' ? payload.sub.trim() : ''
    if (!appleUserId) {
      return NextResponse.json({ error: 'Apple sign in did not return an account id.' }, { status: 400 })
    }

    const tokenEmail = normalizeEmail(payload.email)
    const bodyEmail = normalizeEmail(body?.email)
    const email = tokenEmail || bodyEmail
    const name = formatName(body?.fullName, email)

    let user = await prisma.user.findFirst({
      where: {
        accounts: {
          some: {
            provider: 'apple',
            providerAccountId: appleUserId,
          },
        },
      },
      select: { id: true, email: true, name: true, image: true },
    })

    if (!user) {
      if (!email) {
        return NextResponse.json(
          { error: 'Apple did not share an email address for this sign in. Please use email login, then try Apple again.' },
          { status: 400 },
        )
      }

      const existingByEmail = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, image: true },
      })

      if (existingByEmail) {
        user = existingByEmail
      } else {
        await ensureFreeCreditColumns()
        user = await prisma.user.create({
          data: {
            email,
            name,
            emailVerified: new Date(),
            termsAccepted: true,
            ...NEW_USER_FREE_CREDITS,
          },
          select: { id: true, email: true, name: true, image: true },
        })
      }

      await prisma.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: 'apple',
            providerAccountId: appleUserId,
          },
        },
        update: {
          id_token: identityToken,
          access_token: typeof body?.authorizationCode === 'string' ? body.authorizationCode : null,
          token_type: 'Bearer',
        },
        create: {
          userId: user.id,
          type: 'oauth',
          provider: 'apple',
          providerAccountId: appleUserId,
          id_token: identityToken,
          access_token: typeof body?.authorizationCode === 'string' ? body.authorizationCode : null,
          token_type: 'Bearer',
        },
      })
    } else {
      await prisma.account.updateMany({
        where: {
          provider: 'apple',
          providerAccountId: appleUserId,
        },
        data: {
          id_token: identityToken,
          access_token: typeof body?.authorizationCode === 'string' ? body.authorizationCode : null,
          token_type: 'Bearer',
        },
      })
    }

    if (email && !user.email.includes('@privaterelay.appleid.com')) {
      await prisma.user
        .update({
          where: { id: user.id },
          data: {
            emailVerified: new Date(),
            name: user.name || name,
          },
        })
        .catch(() => null)
    }

    const latestUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, image: true },
    })
    if (!latestUser) {
      return NextResponse.json({ error: 'Apple sign in failed. Please try again.' }, { status: 500 })
    }

    const res = NextResponse.json(await createSession(latestUser), { status: 200 })
    res.headers.set('cache-control', 'no-store')
    return res
  } catch (error) {
    console.error('Native Apple sign in failed:', error)
    return NextResponse.json({ error: 'Apple sign in failed. Please try again.' }, { status: 500 })
  }
}
