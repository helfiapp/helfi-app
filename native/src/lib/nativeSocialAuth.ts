import { API_BASE_URL } from '../config'
import { NativeAuthSession } from '../state/AppModeContext'
import * as WebBrowser from 'expo-web-browser'

export type SocialProvider = 'google' | 'apple'
export type SocialMode = 'signin' | 'signup'
const NATIVE_SOCIAL_REDIRECT_URL = 'helfi://auth-complete'

export function buildNativeSocialStartUrl(provider: SocialProvider, mode: SocialMode) {
  const url = new URL(`${API_BASE_URL}/api/native-auth/oauth/start`)
  url.searchParams.set('provider', provider)
  url.searchParams.set('mode', mode)
  return url.toString()
}

export function parseNativeSocialCompleteUrl(url: string):
  | { ok: true; session: NativeAuthSession }
  | { ok: false; error: string } {
  try {
    if (!url.startsWith('helfi://auth-complete')) {
      return { ok: false, error: 'Invalid sign-in response.' }
    }

    const parsed = new URL(url)
    const error = String(parsed.searchParams.get('error') || '').trim()
    if (error) {
      const readable =
        error === 'provider_not_available'
          ? 'This sign in option is not available right now.'
          : error === 'missing_session'
            ? 'Sign in did not finish. Please try again.'
            : error === 'missing_secret'
              ? 'Server sign in is not configured.'
              : 'Sign in failed. Please try again.'
      return { ok: false, error: readable }
    }

    const token = String(parsed.searchParams.get('token') || '').trim()
    const expiresAtRaw = Number(parsed.searchParams.get('expiresAt'))
    const id = String(parsed.searchParams.get('id') || '').trim()
    const email = String(parsed.searchParams.get('email') || '').trim()
    const nameRaw = parsed.searchParams.get('name')
    const imageRaw = parsed.searchParams.get('image')

    if (!token || !id || !email || !Number.isFinite(expiresAtRaw)) {
      return { ok: false, error: 'Sign in response is incomplete. Please try again.' }
    }

    return {
      ok: true,
      session: {
        token,
        expiresAt: expiresAtRaw,
        user: {
          id,
          email,
          name: nameRaw && nameRaw.trim() ? nameRaw.trim() : null,
          image: imageRaw && imageRaw.trim() ? imageRaw.trim() : null,
        },
      },
    }
  } catch {
    return { ok: false, error: 'Sign in response could not be read.' }
  }
}

export async function runNativeSocialAuth(provider: SocialProvider, mode: SocialMode): Promise<string | null> {
  const isLocalApi = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_BASE_URL)
  if (provider === 'apple' && isLocalApi) {
    throw new Error('Apple sign in can only be tested after this update is live. Google can be tested locally.')
  }

  const startUrl = buildNativeSocialStartUrl(provider, mode)
  const result = await WebBrowser.openAuthSessionAsync(startUrl, NATIVE_SOCIAL_REDIRECT_URL)
  if (result.type !== 'success') return null
  return typeof result.url === 'string' ? result.url : null
}
