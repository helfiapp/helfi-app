import { NextRequest } from 'next/server'
import { decode } from 'next-auth/jwt'

const SECRETS = [process.env.NEXTAUTH_SECRET, process.env.AUTH_SECRET]
  .map((value) => String(value || '').trim())
  .filter(Boolean)

const SALTS: Array<string | undefined> = [
  undefined,
  'next-auth.jwt',
  'authjs.jwt',
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
]

function extractNativeToken(req: NextRequest): string {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const nativeHeader = req.headers.get('x-native-token') || req.headers.get('X-Native-Token') || ''

  if (nativeHeader) {
    return nativeHeader.trim().replace(/^"+|"+$/g, '')
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return (match?.[1] || '').trim().replace(/^"+|"+$/g, '')
}

export async function getUserIdFromNativeAuth(req: NextRequest): Promise<string | null> {
  if (!SECRETS.length) return null

  const token = extractNativeToken(req)
  if (!token) return null

  for (const secret of SECRETS) {
    for (const salt of SALTS) {
      try {
        const payload: any = salt
          ? await decode({ token, secret, salt })
          : await decode({ token, secret })
        const userId = payload?.sub || payload?.id
        if (typeof userId === 'string' && userId) {
          return userId
        }
      } catch {
        // Try the next secret/salt combination.
      }
    }
  }

  return null
}
