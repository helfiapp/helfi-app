export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  assertGarminConfigured,
  exchangeGarminCodeForTokens,
  fetchGarminUserId,
  registerGarminUser,
} from '@/lib/garmin-oauth'

/**
 * Garmin OAuth callback
 * GET /api/auth/garmin/callback
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const pkceCookie = request.cookies.get('garmin_pkce')?.value

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/devices?garmin_error=unauthorized', request.nextUrl.origin))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/devices?garmin_error=missing_params', request.nextUrl.origin))
  }

  try {
    assertGarminConfigured()

    if (!pkceCookie) {
      return NextResponse.redirect(new URL('/devices?garmin_error=invalid_request_token', request.nextUrl.origin))
    }

    let parsedPkce: { state: string; codeVerifier: string; userId: string; exp: number } | null = null
    try {
      parsedPkce = JSON.parse(pkceCookie)
    } catch {
      parsedPkce = null
    }

    if (!parsedPkce || parsedPkce.state !== state || parsedPkce.userId !== session.user.id) {
      return NextResponse.redirect(new URL('/devices?garmin_error=invalid_request_token', request.nextUrl.origin))
    }

    const callbackUrl =
      process.env.GARMIN_REDIRECT_URI ||
      new URL('/api/auth/garmin/callback', request.nextUrl.origin).toString()

    const tokenResponse = await exchangeGarminCodeForTokens(code, parsedPkce.codeVerifier, callbackUrl)
    const expiresAt = tokenResponse.expires_in
      ? Math.floor(Date.now() / 1000) + tokenResponse.expires_in
      : null

    const userInfo = await fetchGarminUserId(tokenResponse.access_token)

    // Store Garmin tokens on the Account table (provider = garmin)
    const existingAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: 'garmin',
      },
    })

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          providerAccountId: userInfo.userId || existingAccount.providerAccountId,
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token,
          token_type: tokenResponse.token_type || 'bearer',
          scope: tokenResponse.scope || existingAccount.scope,
          expires_at: expiresAt ?? existingAccount.expires_at,
        },
      })
    } else {
      await prisma.account.create({
        data: {
          userId: session.user.id,
          type: 'oauth',
          provider: 'garmin',
          providerAccountId: userInfo.userId || tokenResponse.access_token,
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token,
          token_type: tokenResponse.token_type || 'bearer',
          scope: tokenResponse.scope || 'garmin_wellness',
          expires_at: expiresAt ?? undefined,
        },
      })
    }

    // Register the user for push notifications starting 30 days back
    const uploadStart = Date.now() - 30 * 24 * 60 * 60 * 1000
    try {
      const registration = await registerGarminUser(tokenResponse.access_token, uploadStart)
      if (!registration.ok) {
        console.warn('⚠️ Garmin registration failed:', registration.status, await registration.text())
      }
    } catch (regError) {
      console.warn('⚠️ Garmin registration error:', regError)
    }

    const successHtml = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: sans-serif; padding: 20px;">
          <h3>Garmin Connected</h3>
          <p>You can close this window.</p>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'GARMIN_CONNECTED', success: true }, '*');
                window.opener.location.href = '/devices?garmin_connected=true';
              }
            } catch (e) {}
            setTimeout(function() { window.location.href = '/devices?garmin_connected=true'; }, 500);
          </script>
        </body>
      </html>
    `

    const successResponse = new NextResponse(successHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
    successResponse.cookies.set('garmin_pkce', '', { maxAge: 0, path: '/' })
    return successResponse
  } catch (error) {
    console.error('❌ Garmin callback error:', error)
    return NextResponse.redirect(new URL('/devices?garmin_error=callback_failed', request.nextUrl.origin))
  }
}
