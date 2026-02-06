import jwt from 'jsonwebtoken'

type AppleSecretEnv = {
  clientId: string
  teamId: string
  keyId: string
  privateKey: string
}

const readAppleEnv = (): AppleSecretEnv | null => {
  const clientId = process.env.APPLE_CLIENT_ID
  const teamId = process.env.APPLE_TEAM_ID
  const keyId = process.env.APPLE_KEY_ID
  const privateKeyRaw = process.env.APPLE_PRIVATE_KEY

  if (!clientId || !teamId || !keyId || !privateKeyRaw) return null

  // Vercel often stores multiline keys with "\n" escapes.
  const privateKey = privateKeyRaw.includes('\\n') ? privateKeyRaw.replace(/\\n/g, '\n') : privateKeyRaw

  return { clientId, teamId, keyId, privateKey }
}

let cached: { secret: string; expSeconds: number } | null = null

export const getAppleClientSecret = (): string | null => {
  const env = readAppleEnv()
  if (!env) return null

  const nowSeconds = Math.floor(Date.now() / 1000)

  // If we have a token that is valid for at least another hour, reuse it.
  if (cached && cached.expSeconds - nowSeconds > 60 * 60) {
    return cached.secret
  }

  // Apple allows up to 6 months. We choose ~180 days.
  const expSeconds = nowSeconds + 180 * 24 * 60 * 60

  const secret = jwt.sign(
    {
      iss: env.teamId,
      iat: nowSeconds,
      exp: expSeconds,
      aud: 'https://appleid.apple.com',
      sub: env.clientId,
    },
    env.privateKey,
    {
      algorithm: 'ES256',
      keyid: env.keyId,
    }
  )

  cached = { secret, expSeconds }
  return secret
}

