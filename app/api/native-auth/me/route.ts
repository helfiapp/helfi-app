import { prisma } from '@/lib/prisma'
import { getToken } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'

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

    const user = await prisma.user.findUnique({
      where: { id: String(token.id || token.sub) },
      select: { id: true, email: true, name: true, image: true },
    })
    if (!user || user.email !== token.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const res = NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
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

