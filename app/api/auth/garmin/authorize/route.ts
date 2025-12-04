export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { assertGarminConfigured, requestGarminRequestToken } from '@/lib/garmin-oauth'

/**
 * Initiate Garmin OAuth 1.0a flow
 * GET /api/auth/garmin/authorize
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized - please sign in first' }, { status: 401 })
    }

    assertGarminConfigured()
    const callbackUrl =
      process.env.GARMIN_REDIRECT_URI ||
      new URL('/api/auth/garmin/callback', request.nextUrl.origin).toString()

    const token = await requestGarminRequestToken(callbackUrl)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    // Persist the temporary request token/secret so we can verify on callback
    await prisma.garminRequestToken.upsert({
      where: { oauthToken: token.oauthToken },
      update: {
        userId: session.user.id,
        oauthTokenSecret: token.oauthTokenSecret,
        expiresAt,
      },
      create: {
        userId: session.user.id,
        oauthToken: token.oauthToken,
        oauthTokenSecret: token.oauthTokenSecret,
        expiresAt,
      },
    })

    const authUrl = `https://connect.garmin.com/oauthConfirm?oauth_token=${encodeURIComponent(token.oauthToken)}`
    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('❌ Garmin authorization init failed:', error)
    return NextResponse.json({ error: 'Failed to start Garmin authorization' }, { status: 500 })
  }
}
