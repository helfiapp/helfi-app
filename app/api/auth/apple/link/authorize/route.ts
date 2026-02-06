export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import crypto from 'crypto'

const sanitizeNextTarget = (value: string | null) => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) return null
  if (trimmed.startsWith('//')) return null
  if (trimmed.startsWith('/api/')) return null
  return trimmed
}

/**
 * Start Apple "link login" flow for a user who is already signed in.
 * Apple will send the user back to /api/auth/apple/link/callback.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/auth/signin?message=sign_in_required', request.nextUrl.origin))
  }

  const appleClientId = process.env.APPLE_CLIENT_ID
  if (!appleClientId) {
    return NextResponse.redirect(new URL('/auth/link-apple?error=apple_not_configured', request.nextUrl.origin))
  }

  const nextParam = sanitizeNextTarget(request.nextUrl.searchParams.get('next')) || '/onboarding'
  const nonce = crypto.randomBytes(16).toString('hex')

  // Keep this simple: we encode the signed-in userId into state and verify it against session on callback.
  const state = Buffer.from(
    JSON.stringify({
      userId: session.user.id,
      next: nextParam,
      nonce,
      ts: Date.now(),
    })
  ).toString('base64')

  const redirectUri = `${request.nextUrl.origin}/api/auth/apple/link/callback`
  const authUrl =
    'https://appleid.apple.com/auth/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      response_mode: 'form_post',
      client_id: appleClientId,
      redirect_uri: redirectUri,
      scope: 'name email',
      state,
      nonce,
    }).toString()

  return NextResponse.redirect(authUrl)
}

