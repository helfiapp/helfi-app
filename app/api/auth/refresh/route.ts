import { NextRequest, NextResponse } from 'next/server'
import { decode, encode } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'

const SECRET = process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024'
const REFRESH_HEADER = 'x-helfi-refresh-token'
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60 // 7 days for session cookies; refresh token is long-lived

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const headerToken = req.headers.get(REFRESH_HEADER)
    const refreshToken = typeof body.token === 'string' && body.token.length > 0 ? body.token : headerToken

    if (!refreshToken) {
      return NextResponse.json({ error: 'Missing refresh token' }, { status: 400 })
    }

    const decoded = await decode({ token: refreshToken, secret: SECRET }).catch(() => null)
    const exp = (decoded as any)?.exp
    const nowSeconds = Math.floor(Date.now() / 1000)

    if (!decoded || !exp || typeof exp !== 'number' || exp <= nowSeconds) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    if ((decoded as any)?.kind && (decoded as any).kind !== 'refresh') {
      return NextResponse.json({ error: 'Wrong token kind' }, { status: 401 })
    }

    const userId = (decoded as any)?.sub as string
    if (!userId) {
      return NextResponse.json({ error: 'Invalid user' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const sessionExp = nowSeconds + SESSION_MAX_AGE_SECONDS
    const sessionToken = await encode({
      token: {
        sub: user.id,
        id: user.id,
        email: user.email,
        name: user.name || user.email.split('@')[0],
        image: user.image,
        iat: nowSeconds,
        exp: sessionExp,
      },
      secret: SECRET,
      maxAge: SESSION_MAX_AGE_SECONDS,
    })

    const response = NextResponse.json({ ok: true, sessionExpiresAt: sessionExp * 1000 })
    const secure = process.env.NODE_ENV === 'production'
    const sameSite = secure ? 'none' : 'lax'

    response.cookies.set('__Secure-next-auth.session-token', sessionToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
    response.cookies.set('next-auth.session-token', sessionToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    })

    return response
  } catch (err) {
    console.error('Refresh token exchange failed', err)
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 })
  }
}
