export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import jwt from 'jsonwebtoken'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAppleClientSecret } from '@/lib/apple-client-secret'

const decodeState = (state: string) => {
  const raw = Buffer.from(state, 'base64').toString()
  return JSON.parse(raw) as { userId?: string; next?: string; nonce?: string; ts?: number }
}

const sanitizeNextTarget = (value: unknown) => {
  if (typeof value !== 'string') return '/onboarding'
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) return '/onboarding'
  if (trimmed.startsWith('//')) return '/onboarding'
  if (trimmed.startsWith('/api/')) return '/onboarding'
  return trimmed
}

type CallbackParams = { code?: string | null; state?: string | null; error?: string | null }

async function handleCallback(params: CallbackParams, request: NextRequest) {
  const fallbackNext = '/onboarding'

  if (params.error) {
    return NextResponse.redirect(
      new URL(`/auth/link-apple?error=${encodeURIComponent(String(params.error))}`, request.nextUrl.origin)
    )
  }

  const code = params.code
  const state = params.state

  if (typeof code !== 'string' || typeof state !== 'string') {
    return NextResponse.redirect(new URL('/auth/link-apple?error=missing_params', request.nextUrl.origin))
  }

  let decoded: { userId?: string; next?: string; nonce?: string; ts?: number }
  try {
    decoded = decodeState(state)
  } catch {
    return NextResponse.redirect(new URL('/auth/link-apple?error=invalid_state', request.nextUrl.origin))
  }

  const nextTarget = sanitizeNextTarget(decoded.next)

  const session = await getServerSession(authOptions)
  if (!session?.user?.id || decoded.userId !== session.user.id) {
    return NextResponse.redirect(new URL('/auth/link-apple?error=session_mismatch', request.nextUrl.origin))
  }

  const appleClientId = process.env.APPLE_CLIENT_ID
  const appleClientSecret = getAppleClientSecret()
  if (!appleClientId || !appleClientSecret) {
    return NextResponse.redirect(new URL('/auth/link-apple?error=apple_not_configured', request.nextUrl.origin))
  }

  const redirectUri = `${request.nextUrl.origin}/api/auth/apple/link/callback`

  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: appleClientId,
      client_secret: appleClientSecret,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '')
    console.error('❌ Apple token exchange failed:', tokenRes.status, text.slice(0, 500))
    return NextResponse.redirect(new URL('/auth/link-apple?error=token_exchange_failed', request.nextUrl.origin))
  }

  const tokens = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    id_token?: string
    token_type?: string
    error?: string
  }

  if (!tokens?.id_token) {
    return NextResponse.redirect(new URL('/auth/link-apple?error=missing_id_token', request.nextUrl.origin))
  }

  const idTokenPayload = jwt.decode(tokens.id_token) as any
  const appleSub = idTokenPayload?.sub as string | undefined
  const appleNonce = idTokenPayload?.nonce as string | undefined

  if (!appleSub) {
    return NextResponse.redirect(new URL('/auth/link-apple?error=invalid_id_token', request.nextUrl.origin))
  }

  if (decoded.nonce && appleNonce && decoded.nonce !== appleNonce) {
    return NextResponse.redirect(new URL('/auth/link-apple?error=nonce_mismatch', request.nextUrl.origin))
  }

  const expiresAt = typeof tokens.expires_in === 'number' ? Math.floor(Date.now() / 1000) + tokens.expires_in : null

  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: 'apple',
        providerAccountId: appleSub,
      },
    },
    update: {
      userId: session.user.id,
      type: 'oauth',
      access_token: tokens.access_token || null,
      refresh_token: tokens.refresh_token || null,
      expires_at: expiresAt,
      token_type: tokens.token_type || null,
      id_token: tokens.id_token || null,
      scope: 'name email',
    },
    create: {
      userId: session.user.id,
      type: 'oauth',
      provider: 'apple',
      providerAccountId: appleSub,
      access_token: tokens.access_token || null,
      refresh_token: tokens.refresh_token || null,
      expires_at: expiresAt,
      token_type: tokens.token_type || null,
      id_token: tokens.id_token || null,
      scope: 'name email',
    },
  })

  return NextResponse.redirect(new URL(nextTarget || fallbackNext, request.nextUrl.origin))
}

/**
 * Apple sends a POST (form_post) with code + state.
 * We exchange the code for tokens, then link the Apple identity to the *current* logged-in Helfi user.
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    return handleCallback(
      {
        code: typeof form.get('code') === 'string' ? (form.get('code') as string) : null,
        state: typeof form.get('state') === 'string' ? (form.get('state') as string) : null,
        error: typeof form.get('error') === 'string' ? (form.get('error') as string) : null,
      },
      request
    )
  } catch (e) {
    console.error('❌ Apple link callback failed:', e)
    return NextResponse.redirect(new URL('/auth/link-apple?error=callback_failed', request.nextUrl.origin))
  }
}

export async function GET(request: NextRequest) {
  return handleCallback(
    {
      code: request.nextUrl.searchParams.get('code'),
      state: request.nextUrl.searchParams.get('state'),
      error: request.nextUrl.searchParams.get('error'),
    },
    request
  )
}
