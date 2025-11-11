import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Handle Fitbit OAuth callback
 * GET /api/auth/fitbit/callback
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      console.error('❌ Fitbit OAuth error:', error)
      return NextResponse.redirect(
        new URL('/devices?fitbit_error=' + encodeURIComponent(error), request.nextUrl.origin)
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/devices?fitbit_error=missing_params', request.nextUrl.origin)
      )
    }

    // Verify state and get userId
    let userId: string
    try {
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString())
      userId = decodedState.userId
    } catch (e) {
      console.error('❌ Invalid state parameter:', e)
      return NextResponse.redirect(
        new URL('/devices?fitbit_error=invalid_state', request.nextUrl.origin)
      )
    }

    // Verify user session matches state
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.id !== userId) {
      return NextResponse.redirect(
        new URL('/devices?fitbit_error=session_mismatch', request.nextUrl.origin)
      )
    }

    const clientId = process.env.FITBIT_CLIENT_ID
    const clientSecret = process.env.FITBIT_CLIENT_SECRET
    const redirectUri = process.env.FITBIT_REDIRECT_URI || 'https://helfi.ai/api/auth/fitbit/callback'

    if (!clientId || !clientSecret) {
      console.error('❌ Fitbit credentials not configured')
      return NextResponse.redirect(
        new URL('/devices?fitbit_error=config_missing', request.nextUrl.origin)
      )
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://api.fitbit.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error('❌ Fitbit token exchange failed:', errorData)
      return NextResponse.redirect(
        new URL('/devices?fitbit_error=token_exchange_failed', request.nextUrl.origin)
      )
    }

    const tokens = await tokenResponse.json()

    // Get Fitbit user profile to get user ID
    const profileResponse = await fetch('https://api.fitbit.com/1/user/-/profile.json', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    })

    if (!profileResponse.ok) {
      console.error('❌ Failed to fetch Fitbit profile')
      return NextResponse.redirect(
        new URL('/devices?fitbit_error=profile_fetch_failed', request.nextUrl.origin)
      )
    }

    const profile = await profileResponse.json()
    const fitbitUserId = profile.user.encodedId

    // Store or update Fitbit account in database
    const expiresAt = tokens.expires_in
      ? Math.floor(Date.now() / 1000) + tokens.expires_in
      : null

    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'fitbit',
          providerAccountId: fitbitUserId,
        },
      },
      update: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        token_type: tokens.token_type,
        scope: tokens.scope,
      },
      create: {
        userId: session.user.id,
        type: 'oauth',
        provider: 'fitbit',
        providerAccountId: fitbitUserId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        token_type: tokens.token_type,
        scope: tokens.scope,
      },
    })

    console.log('✅ Fitbit account linked successfully:', { userId: session.user.id, fitbitUserId })

    return NextResponse.redirect(
      new URL('/devices?fitbit_connected=true', request.nextUrl.origin)
    )
  } catch (error) {
    console.error('❌ Fitbit callback error:', error)
    return NextResponse.redirect(
      new URL('/devices?fitbit_error=callback_failed', request.nextUrl.origin)
    )
  }
}

