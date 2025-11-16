import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

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
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Fitbit Connection Failed</title>
          </head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'FITBIT_ERROR', error: '${error}' }, '*')
                setTimeout(() => window.close(), 2000)
              } else {
                window.location.href = '/devices?fitbit_error=${encodeURIComponent(error)}'
              }
            </script>
            <div style="text-align: center; padding: 40px; font-family: Arial, sans-serif;">
              <h2>❌ Connection Failed</h2>
              <p>Error: ${error}</p>
              <p>This window will close automatically.</p>
            </div>
          </body>
        </html>
      `
      return new NextResponse(errorHtml, {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    if (!code || !state) {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Fitbit Connection Failed</title>
          </head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'FITBIT_ERROR', error: 'missing_params' }, '*')
                setTimeout(() => window.close(), 2000)
              } else {
                window.location.href = '/devices?fitbit_error=missing_params'
              }
            </script>
            <div style="text-align: center; padding: 40px; font-family: Arial, sans-serif;">
              <h2>❌ Connection Failed</h2>
              <p>Missing required parameters.</p>
              <p>This window will close automatically.</p>
            </div>
          </body>
        </html>
      `
      return new NextResponse(errorHtml, {
        headers: { 'Content-Type': 'text/html' },
      })
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

    // Return a page that will redirect and close popup
    // Since window.opener might be lost after Fitbit redirects, we'll use a redirect approach
    // The parent window will poll for connection status
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fitbit Connected</title>
          <meta http-equiv="refresh" content="2;url=/devices?fitbit_connected=true">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background: linear-gradient(135deg, #10b981 0%, #059669 100%); display: flex; align-items: center; justify-content: center; min-height: 100vh;">
          <div style="text-align: center; padding: 40px; color: white;">
            <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
            <h2 style="margin: 0 0 10px 0; font-size: 24px;">Fitbit Connected Successfully!</h2>
            <p style="margin: 0; opacity: 0.9;">Redirecting you back to Helfi...</p>
            <p style="margin-top: 20px; font-size: 14px; opacity: 0.8;">You can close this window if it doesn't close automatically.</p>
          </div>
          <script>
            // Try to notify parent and close popup
            try {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: 'FITBIT_CONNECTED', success: true }, '*')
                setTimeout(() => {
                  try {
                    window.close()
                  } catch (e) {
                    // If we can't close, redirect parent
                    if (window.opener) {
                      window.opener.location.href = '/devices?fitbit_connected=true'
                    }
                  }
                }, 1000)
              } else {
                // Not a popup or opener lost, redirect this window
                setTimeout(() => {
                  window.location.href = '/devices?fitbit_connected=true'
                }, 2000)
              }
            } catch (e) {
              // Fallback: redirect this window
              setTimeout(() => {
                window.location.href = '/devices?fitbit_connected=true'
              }, 2000)
            }
          </script>
        </body>
      </html>
    `

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (error) {
    console.error('❌ Fitbit callback error:', error)
    return NextResponse.redirect(
      new URL('/devices?fitbit_error=callback_failed', request.nextUrl.origin)
    )
  }
}

