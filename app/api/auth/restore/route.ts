import { NextRequest, NextResponse } from 'next/server'
import { decode, encode } from 'next-auth/jwt'

const SECRET = process.env.NEXTAUTH_SECRET

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!SECRET) {
      return NextResponse.json({ error: 'Auth secret not configured' }, { status: 500 })
    }
    const { token } = await req.json().catch(() => ({}))
    const headerToken = req.headers.get('x-helfi-refresh-token') || req.headers.get('x-helfi-remember-token')
    const sessionToken = token || headerToken

    if (!sessionToken || typeof sessionToken !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const decoded = await decode({ token: sessionToken, secret: SECRET }).catch(() => null)
    if (!decoded || !decoded.exp || typeof decoded.exp !== 'number') {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    const exp = decoded.exp as number
    const ttlSeconds = Math.max(exp - nowSeconds, 5)
    if (ttlSeconds <= 0) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true })
    const secure = process.env.NODE_ENV === 'production'
    const maxAge = ttlSeconds
    const sameSite = secure ? 'none' : 'lax'

    const needsSessionEncode = (decoded as any)?.kind === 'refresh'
    const cookieValue = needsSessionEncode
      ? await encode({
          token: {
            sub: (decoded as any)?.sub,
            id: (decoded as any)?.id || (decoded as any)?.sub,
            email: (decoded as any)?.email,
            name: (decoded as any)?.name,
            image: (decoded as any)?.image,
            iat: nowSeconds,
            exp: nowSeconds + maxAge,
          },
          secret: SECRET,
          maxAge,
        })
      : sessionToken

    // Use SameSite=None; Secure for iOS PWA compatibility
    response.cookies.set('__Secure-next-auth.session-token', cookieValue, {
      httpOnly: true,
      sameSite,
      secure,
      path: '/',
      maxAge,
    })
    response.cookies.set('next-auth.session-token', cookieValue, {
      httpOnly: true,
      sameSite,
      secure,
      path: '/',
      maxAge,
    })

    return response
  } catch (err) {
    console.error('Auth restore failed', err)
    return NextResponse.json({ error: 'Restore failed' }, { status: 500 })
  }
}
