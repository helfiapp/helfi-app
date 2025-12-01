import { NextRequest, NextResponse } from 'next/server'
import { decode } from 'next-auth/jwt'

const SECRET = process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024'

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json().catch(() => ({}))
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const decoded = await decode({ token, secret: SECRET }).catch(() => null)
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

    // Use SameSite=None; Secure for iOS PWA compatibility
    response.cookies.set('__Secure-next-auth.session-token', token, {
      httpOnly: true,
      sameSite: secure ? 'none' : 'lax', // SameSite=None required for iOS PWA cookie persistence
      secure,
      path: '/',
      maxAge,
    })
    response.cookies.set('next-auth.session-token', token, {
      httpOnly: true,
      sameSite: secure ? 'none' : 'lax', // SameSite=None required for iOS PWA cookie persistence
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
