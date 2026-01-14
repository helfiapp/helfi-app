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

export async function GET(request: NextRequest) {
  const open = request.cookies.get(COOKIE_NAME)?.value === '1'
  const response = NextResponse.json({ open })
  if (open) {
    response.cookies.set(COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      secure: request.nextUrl.protocol === 'https:',
    })
  }
  return response
}
