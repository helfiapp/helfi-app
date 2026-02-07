import jwt from 'jsonwebtoken'

let cachedSecret: { value: string; expiresAtMs: number } | null = null

const readEnv = () => {
  const clientId = process.env.APPLE_CLIENT_ID?.trim() || ''
  const teamId = process.env.APPLE_TEAM_ID?.trim() || ''
  const keyId = process.env.APPLE_KEY_ID?.trim() || ''
  const rawPrivateKey = process.env.APPLE_PRIVATE_KEY || ''
  // Vercel env vars often store multiline keys with literal "\n".
  const privateKey = rawPrivateKey.replace(/\\n/g, '\n').trim()

  if (!clientId || !teamId || !keyId || !privateKey) {
    return null
  }

  return { clientId, teamId, keyId, privateKey }
}

/**
 * Apple OAuth requires a client_secret which is a signed JWT (ES256).
 * This helper builds it from APPLE_* environment variables.
 *
 * Returns null if Apple OAuth isn't configured in this environment.
 */
export const getAppleClientSecret = () => {
  const now = Date.now()
  if (cachedSecret && cachedSecret.expiresAtMs > now + 60_000) {
    return cachedSecret.value
  }

  const env = readEnv()
  if (!env) return null

  // Apple allows a max of 6 months for the client_secret JWT expiry.
  const sixMonthsSeconds = 60 * 60 * 24 * 180
  const iat = Math.floor(now / 1000)
  const exp = iat + sixMonthsSeconds

  const value = jwt.sign(
    {},
    env.privateKey,
    {
      algorithm: 'ES256',
      keyid: env.keyId,
      issuer: env.teamId,
      subject: env.clientId,
      audience: 'https://appleid.apple.com',
      expiresIn: sixMonthsSeconds,
    }
  )

  cachedSecret = { value, expiresAtMs: now + sixMonthsSeconds * 1000 }
  return value
}
