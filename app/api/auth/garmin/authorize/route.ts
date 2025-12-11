export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
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
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized - please sign in first' }, { status: 401 })
    }

    assertGarminConfigured()
    const callbackUrl =
      process.env.GARMIN_REDIRECT_URI ||
      new URL('/api/auth/garmin/callback', request.nextUrl.origin).toString()

    const { codeVerifier, codeChallenge } = generatePkcePair()
    const state = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    // Persist the temporary verifier/state so we can verify on callback
    await prisma.garminRequestToken.upsert({
      where: { oauthToken: state },
      update: {
        userId: session.user.id,
        oauthTokenSecret: codeVerifier,
        expiresAt,
      },
      create: {
        userId: session.user.id,
        oauthToken: state,
        oauthTokenSecret: codeVerifier,
        expiresAt,
      },
    })

    const authUrl = buildGarminAuthorizeUrl(codeChallenge, state, callbackUrl)
    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('❌ Garmin authorization init failed:', {
      message: (error as Error)?.message,
      stack: (error as Error)?.stack,
    })
    return NextResponse.json({ error: 'Failed to start Garmin authorization' }, { status: 500 })
  }
}
