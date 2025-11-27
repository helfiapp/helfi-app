import { prisma } from '@/lib/prisma'

export interface FitbitTokens {
  access_token: string
  refresh_token: string
  expires_at: number | null
  token_type: string
}

/**
 * Get Fitbit account tokens for a user, refreshing if necessary
 */
export async function getFitbitTokens(userId: string): Promise<FitbitTokens | null> {
  // Find Fitbit account for user
  const fitbitAccount = await prisma.account.findFirst({
    where: {
      userId,
      provider: 'fitbit',
    },
  })

  if (!fitbitAccount || !fitbitAccount.access_token || !fitbitAccount.refresh_token) {
    return null
  }

  // Check if token needs refresh (expires within 5 minutes)
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = fitbitAccount.expires_at || 0

  if (expiresAt - now < 300) {
    // Token expired or expiring soon, refresh it
    const refreshed = await refreshFitbitToken(fitbitAccount.refresh_token, userId)
    if (!refreshed) {
      return null
    }
    return refreshed
  }

  return {
    access_token: fitbitAccount.access_token,
    refresh_token: fitbitAccount.refresh_token,
    expires_at: fitbitAccount.expires_at,
    token_type: fitbitAccount.token_type || 'Bearer',
  }
}

/**
 * Refresh Fitbit access token
 */
async function refreshFitbitToken(
  refreshToken: string,
  userId: string
): Promise<FitbitTokens | null> {
  const clientId = process.env.FITBIT_CLIENT_ID
  const clientSecret = process.env.FITBIT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('❌ Fitbit credentials not configured')
    return null
  }

  try {
    const response = await fetch('https://api.fitbit.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error('❌ Fitbit token refresh failed:', errorData)
      return null
    }

    const tokens = await response.json()
    const expiresAt = tokens.expires_in
      ? Math.floor(Date.now() / 1000) + tokens.expires_in
      : null

    // Update tokens in database
    const fitbitAccount = await prisma.account.findFirst({
      where: {
        userId,
        provider: 'fitbit',
      },
    })

    if (fitbitAccount) {
      await prisma.account.update({
        where: { id: fitbitAccount.id },
        data: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || refreshToken,
          expires_at: expiresAt,
          token_type: tokens.token_type,
        },
      })
    }

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || refreshToken,
      expires_at: expiresAt,
      token_type: tokens.token_type,
    }
  } catch (error) {
    console.error('❌ Error refreshing Fitbit token:', error)
    return null
  }
}

/**
 * Make authenticated request to Fitbit API
 */
export async function fitbitApiRequest(
  userId: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response | null> {
  const tokens = await getFitbitTokens(userId)
  if (!tokens) {
    return null
  }

  const url = endpoint.startsWith('http') ? endpoint : `https://api.fitbit.com${endpoint}`

  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      ...options.headers,
    },
  })
}

/**
 * Get Fitbit user ID for a user
 */
export async function getFitbitUserId(userId: string): Promise<string | null> {
  const fitbitAccount = await prisma.account.findFirst({
    where: {
      userId,
      provider: 'fitbit',
    },
  })

  return fitbitAccount?.providerAccountId || null
}

