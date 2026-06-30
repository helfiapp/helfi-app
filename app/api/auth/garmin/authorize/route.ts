export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { verifyNativeDeviceOauthTicket } from '@/lib/native-device-oauth-ticket'
import {
  assertGarminConfigured,
  buildGarminAuthorizeUrl,
  generatePkcePair,
} from '@/lib/garmin-oauth'

/**
 * Initiate Garmin OAuth 2.0 PKCE flow
 * GET /api/auth/garmin/authorize
 */
export async function GET(request: NextRequest) {
  try {
    const garminConnectEnabled = process.env.NEXT_PUBLIC_GARMIN_CONNECT_ENABLED === 'true'
    if (!garminConnectEnabled) {
      return NextResponse.redirect(new URL('/devices?garmin_error=disabled', request.nextUrl.origin))
    }

    const nativeTicket = request.nextUrl.searchParams.get('nativeTicket')
    const nativePayload = verifyNativeDeviceOauthTicket(nativeTicket, 'garmin')
    const session = await getServerSession(authOptions)
    const userId = nativePayload?.userId || session?.user?.id
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized - please sign in first' }, { status: 401 })
    }

    assertGarminConfigured()
    const callbackUrl =
      process.env.GARMIN_REDIRECT_URI ||
      new URL('/api/auth/garmin/callback', request.nextUrl.origin).toString()

    const { codeVerifier, codeChallenge } = generatePkcePair()
    const state = crypto.randomUUID()
    const authUrl = buildGarminAuthorizeUrl(codeChallenge, state, callbackUrl)
    const response = NextResponse.redirect(authUrl)
    response.cookies.set(
      'garmin_pkce',
      JSON.stringify({
        state,
        codeVerifier,
        userId,
        nativeTicket: nativePayload ? nativeTicket : null,
        exp: Date.now() + 15 * 60 * 1000,
      }),
      {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60,
      }
    )
    return response
  } catch (error) {
    console.error('❌ Garmin authorization init failed:', error)
    return NextResponse.json(
      { error: 'Failed to start Garmin authorization', detail: (error as Error)?.message },
      { status: 500 }
    )
  }
}
