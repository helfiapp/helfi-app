import OAuth from 'oauth-1.0a'
import crypto from 'crypto'

const DEFAULT_GARMIN_API_BASE_URL = 'https://healthapi.garmin.com/wellness-api/rest'
const DEFAULT_GARMIN_OAUTH_BASE_URL = 'https://connectapi.garmin.com/oauth-service/oauth'

export type GarminTokenPair = {
  oauthToken: string
  oauthTokenSecret: string
}

export type GarminAccessToken = GarminTokenPair & {
  garminUserId?: string | null
}

function getGarminApiBaseUrl() {
  return process.env.GARMIN_API_BASE_URL || DEFAULT_GARMIN_API_BASE_URL
}

function getGarminOAuthBaseUrl() {
  return process.env.GARMIN_OAUTH_BASE_URL || DEFAULT_GARMIN_OAUTH_BASE_URL
}

function getOAuthClient() {
  const consumerKey = process.env.GARMIN_CONSUMER_KEY
  const consumerSecret = process.env.GARMIN_CONSUMER_SECRET

  if (!consumerKey || !consumerSecret) {
    throw new Error('Garmin consumer key/secret are not configured')
  }

  return new OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: 'HMAC-SHA1',
    hash_function(baseString, key) {
      return crypto.createHmac('sha1', key).update(baseString).digest('base64')
    },
  })
}

export function parseOAuthResponse(body: string) {
  const result: Record<string, string> = {}
  body.split('&').forEach((pair) => {
    const [key, value] = pair.split('=')
    if (key) {
      result[key] = decodeURIComponent(value || '')
    }
  })
  return result
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

export async function requestGarminRequestToken(callbackUrl: string): Promise<GarminTokenPair> {
  const oauth = getOAuthClient()
  const baseUrl = getGarminOAuthBaseUrl()

  const data = { oauth_callback: callbackUrl }
  const requestData = {
    url: `${baseUrl}/request_token`,
    method: 'POST',
    data,
  }

  const headers = oauth.toHeader(oauth.authorize(requestData))

  const response = await fetch(requestData.url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(data),
  })

  const body = await response.text()
  if (!response.ok) {
    console.error('❌ Garmin request_token error', {
      status: response.status,
      body,
    })
    throw new Error(`Garmin request_token failed (${response.status})`)
  }

  const parsed = parseOAuthResponse(body)
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error(`Garmin request_token response missing tokens: ${body}`)
  }

  return {
    oauthToken: parsed.oauth_token,
    oauthTokenSecret: parsed.oauth_token_secret,
  }
}

export async function exchangeGarminAccessToken(
  oauthToken: string,
  oauthTokenSecret: string,
  verifier: string
): Promise<GarminAccessToken> {
  const oauth = getOAuthClient()
  const baseUrl = getGarminOAuthBaseUrl()
  const token = { key: oauthToken, secret: oauthTokenSecret }
  const data = { oauth_verifier: verifier }

  const requestData = {
    url: `${baseUrl}/access_token`,
    method: 'POST',
    data,
  }

  const headers = oauth.toHeader(oauth.authorize(requestData, token))

  const response = await fetch(requestData.url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(data),
  })

  const body = await response.text()
  if (!response.ok) {
    console.error('❌ Garmin access_token error', {
      status: response.status,
      body,
    })
    throw new Error(`Garmin access_token failed (${response.status})`)
  }

  const parsed = parseOAuthResponse(body)
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error(`Garmin access_token response missing tokens: ${body}`)
  }

  return {
    oauthToken: parsed.oauth_token,
    oauthTokenSecret: parsed.oauth_token_secret,
    garminUserId: parsed.garmin_user_id || parsed.encoded_user_id || parsed.enc_user_id || null,
  }
}

export async function registerGarminUser(
  accessToken: string,
  accessTokenSecret: string,
  uploadStartTimestampMs: number
) {
  const oauth = getOAuthClient()
  const baseUrl = getGarminApiBaseUrl()
  const data = { uploadStartTimestamp: `${uploadStartTimestampMs}` }
  const token = { key: accessToken, secret: accessTokenSecret }

  const requestData = {
    url: `${baseUrl}/user/registration`,
    method: 'POST',
    data,
  }

  const headers = oauth.toHeader(oauth.authorize(requestData, token))

  return fetch(requestData.url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(data),
  })
}

export async function deregisterGarminUser(accessToken: string, accessTokenSecret: string) {
  const oauth = getOAuthClient()
  const baseUrl = getGarminApiBaseUrl()
  const data = {} as Record<string, string>
  const token = { key: accessToken, secret: accessTokenSecret }

  const requestData = {
    url: `${baseUrl}/user/registration`,
    method: 'DELETE',
    data,
  }

  const headers = oauth.toHeader(oauth.authorize(requestData, token))

  return fetch(requestData.url, {
    method: 'DELETE',
    headers: {
      ...headers,
    },
  })
}

export function assertGarminConfigured() {
  if (!process.env.GARMIN_CONSUMER_KEY || !process.env.GARMIN_CONSUMER_SECRET) {
    throw new Error('Garmin credentials are not configured in the environment')
  }
  return {
    consumerKey: process.env.GARMIN_CONSUMER_KEY,
    consumerSecret: process.env.GARMIN_CONSUMER_SECRET,
  }
}
