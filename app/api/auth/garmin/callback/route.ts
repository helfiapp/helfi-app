export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  assertGarminConfigured,
  exchangeGarminAccessToken,
  registerGarminUser,
} from '@/lib/garmin-oauth'

/**
 * Garmin OAuth callback
 * GET /api/auth/garmin/callback
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const oauthToken = url.searchParams.get('oauth_token')
  const oauthVerifier = url.searchParams.get('oauth_verifier')

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/devices?garmin_error=unauthorized', request.nextUrl.origin))
  }

  if (!oauthToken || !oauthVerifier) {
    return NextResponse.redirect(new URL('/devices?garmin_error=missing_params', request.nextUrl.origin))
  }

  try {
    assertGarminConfigured()

    const requestToken = await prisma.garminRequestToken.findUnique({
      where: { oauthToken },
    })

    if (!requestToken || requestToken.userId !== session.user.id) {
      return NextResponse.redirect(new URL('/devices?garmin_error=invalid_request_token', request.nextUrl.origin))
    }

    const access = await exchangeGarminAccessToken(
      oauthToken,
      requestToken.oauthTokenSecret,
      oauthVerifier
    )

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
          providerAccountId: access.garminUserId || access.oauthToken,
          access_token: access.oauthToken,
          refresh_token: access.oauthTokenSecret, // store token secret here
          token_type: 'oauth1',
          scope: 'garmin_wellness',
        },
      })
    } else {
      await prisma.account.create({
        data: {
          userId: session.user.id,
          type: 'oauth',
          provider: 'garmin',
          providerAccountId: access.garminUserId || access.oauthToken,
          access_token: access.oauthToken,
          refresh_token: access.oauthTokenSecret,
          token_type: 'oauth1',
          scope: 'garmin_wellness',
        },
      })
    }

    // Delete the short-lived request token
    await prisma.garminRequestToken.delete({
      where: { oauthToken },
    })

    // Register the user for push notifications starting 30 days back
    const uploadStart = Date.now() - 30 * 24 * 60 * 60 * 1000
    try {
      const registration = await registerGarminUser(access.oauthToken, access.oauthTokenSecret, uploadStart)
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

    return new NextResponse(successHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (error) {
    console.error('❌ Garmin callback error:', error)
    return NextResponse.redirect(new URL('/devices?garmin_error=callback_failed', request.nextUrl.origin))
  }
}
