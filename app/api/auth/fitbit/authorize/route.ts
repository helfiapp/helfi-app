export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Initiate Fitbit OAuth flow
 * GET /api/auth/fitbit/authorize
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in first' },
        { status: 401 }
      )
    }

    const clientId = process.env.FITBIT_CLIENT_ID
    const redirectUri = process.env.FITBIT_REDIRECT_URI || 'https://helfi.ai/api/auth/fitbit/callback'
    const scopes = 'activity heartrate sleep profile weight'
    
    if (!clientId) {
      return NextResponse.json(
        { error: 'Fitbit client ID not configured' },
        { status: 500 }
      )
    }

    // Generate state parameter for CSRF protection
    const state = Buffer.from(JSON.stringify({ userId: session.user.id })).toString('base64')
    
    // Store state in session/cookie for verification
    const authUrl = `https://www.fitbit.com/oauth2/authorize?` +
      `response_type=code&` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${encodeURIComponent(state)}`

    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('❌ Fitbit authorization error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate Fitbit authorization' },
      { status: 500 }
    )
  }
}
