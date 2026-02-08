import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

const SECRET = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET

export async function GET(req: NextRequest) {
  try {
    if (!SECRET) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const token = await getToken({ req, secret: SECRET }).catch(() => null)
    if (!token?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const res = NextResponse.json(
      {
        ok: true,
        user: {
          id: token.id || token.sub || null,
          email: String(token.email),
          name: token.name ? String(token.name) : null,
          image: token.image ? String(token.image) : null,
        },
      },
      { status: 200 }
    )
    res.headers.set('cache-control', 'no-store')
    return res
  } catch (error) {
    console.error('Native me failed:', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}

