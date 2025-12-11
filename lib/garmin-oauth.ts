import crypto from 'crypto'

const DEFAULT_GARMIN_API_BASE_URL = 'https://apis.garmin.com/wellness-api/rest'
const DEFAULT_GARMIN_AUTHORIZE_URL = 'https://connect.garmin.com/oauth2Confirm'
const DEFAULT_GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token'

export type GarminOAuthTokens = {
  access_token: string
  refresh_token: string
  token_type: string
  scope?: string
  expires_in?: number
  refresh_token_expires_in?: number
}

export type GarminUserInfo = {
  userId: string | null
}

function getGarminApiBaseUrl() {
  return process.env.GARMIN_API_BASE_URL || DEFAULT_GARMIN_API_BASE_URL
}

function getGarminAuthorizeUrl() {
  return process.env.GARMIN_OAUTH_AUTHORIZE_URL || DEFAULT_GARMIN_AUTHORIZE_URL
}

function getGarminTokenUrl() {
  return process.env.GARMIN_OAUTH_TOKEN_URL || DEFAULT_GARMIN_TOKEN_URL
}

function getGarminClient() {
  const clientId = process.env.GARMIN_CONSUMER_KEY || process.env.GARMIN_CLIENT_ID
  const clientSecret = process.env.GARMIN_CONSUMER_SECRET || process.env.GARMIN_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Garmin client id/secret are not configured')
  }

  return { clientId, clientSecret }
}

function base64UrlEncode(buffer: Buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function generatePkcePair() {
  const codeVerifier = base64UrlEncode(crypto.randomBytes(48))
  const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest())
  return { codeVerifier, codeChallenge }
}

export async function exchangeGarminCodeForTokens(code: string, codeVerifier: string, redirectUri: string) {
  const { clientId, clientSecret } = getGarminClient()
  const tokenUrl = getGarminTokenUrl()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: codeVerifier,
  })

  if (redirectUri) {
    body.set('redirect_uri', redirectUri)
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const json = (await response.json()) as GarminOAuthTokens
  if (!response.ok || !json.access_token) {
    console.error('❌ Garmin token exchange failed', { status: response.status, body: json })
    throw new Error(`Garmin token exchange failed (${response.status})`)
  }

  return json
}

export async function refreshGarminTokens(refreshToken: string) {
  const { clientId, clientSecret } = getGarminClient()
  const tokenUrl = getGarminTokenUrl()
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const json = (await response.json()) as GarminOAuthTokens
  if (!response.ok || !json.access_token) {
    console.error('❌ Garmin token refresh failed', { status: response.status, body: json })
    throw new Error(`Garmin token refresh failed (${response.status})`)
  }

  return json
}

export async function fetchGarminUserId(accessToken: string): Promise<GarminUserInfo> {
  const baseUrl = getGarminApiBaseUrl()
  const resp = await fetch(`${baseUrl}/user/id`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!resp.ok) {
    console.warn('⚠️ Garmin user id fetch failed', resp.status, await resp.text())
    return { userId: null }
  }
  try {
    const data = (await resp.json()) as { userId?: string }
    return { userId: data.userId || null }
  } catch {
    return { userId: null }
  }
}

export async function registerGarminUser(accessToken: string, uploadStartTimestampMs: number) {
  const baseUrl = getGarminApiBaseUrl()
  const data = { uploadStartTimestamp: `${uploadStartTimestampMs}` }

  return fetch(`${baseUrl}/user/registration`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(data),
  })
}

export async function deregisterGarminUser(accessToken: string) {
  const baseUrl = getGarminApiBaseUrl()
  return fetch(`${baseUrl}/user/registration`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}

export function buildGarminAuthorizeUrl(codeChallenge: string, state: string, redirectUri: string) {
  const { clientId } = getGarminClient()
  const authorizeUrl = new URL(getGarminAuthorizeUrl())
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  authorizeUrl.searchParams.set('state', state)
  if (redirectUri) {
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  }
  return authorizeUrl.toString()
}

export function parseOAuthHeader(header: string | null) {
  if (!header) return null
  const cleaned = header.replace(/^OAuth\s*/i, '')
  const params: Record<string, string> = {}

  cleaned.split(',').forEach((pair) => {
    const [rawKey, rawValue] = pair.trim().split('=')
    if (!rawKey || !rawValue) return
    params[rawKey] = decodeURIComponent(rawValue.replace(/"/g, ''))
  })

  return params
}

export function parseBearerToken(header: string | null) {
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export function assertGarminConfigured() {
  const clientId = process.env.GARMIN_CONSUMER_KEY || process.env.GARMIN_CLIENT_ID
  const clientSecret = process.env.GARMIN_CONSUMER_SECRET || process.env.GARMIN_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Garmin credentials are not configured in the environment')
  }
  return { clientId, clientSecret }
}
