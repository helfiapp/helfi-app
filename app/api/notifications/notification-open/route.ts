import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE_NAME = 'helfi-notification-open'
const COOKIE_TTL_SECONDS = 120

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_TTL_SECONDS,
    secure: request.nextUrl.protocol === 'https:',
  })
  return response
}
