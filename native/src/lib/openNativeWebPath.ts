import { Alert, Linking } from 'react-native'

import { API_BASE_URL } from '../config'

function normalizePath(path: string): string {
  const raw = String(path || '').trim()
  if (!raw || !raw.startsWith('/')) return '/dashboard?helfiNative=1'
  if (raw.startsWith('//')) return '/dashboard?helfiNative=1'

  const [pathname, query = ''] = raw.split('?')
  const params = new URLSearchParams(query)
  if (!params.has('helfiNative')) {
    params.set('helfiNative', '1')
  }

  const queryString = params.toString()
  return queryString ? `${pathname}?${queryString}` : pathname
}

function normalizeToken(token: string | null | undefined): string {
  return String(token || '')
    .trim()
    .replace(/^"+|"+$/g, '')
}

function buildNativeCookieHeader(token: string): string {
  return [
    `next-auth.session-token=${token}`,
    `authjs.session-token=${token}`,
    `__Secure-next-auth.session-token=${token}`,
    `__Secure-authjs.session-token=${token}`,
  ].join('; ')
}

export async function openNativeWebPath(opts: {
  token?: string | null
  path: string
  errorTitle?: string
}) {
  const url = buildNativeWebUrl({ token: opts.token, path: opts.path })

  try {
    await Linking.openURL(url)
  } catch {
    Alert.alert(opts.errorTitle || 'Could not open page', 'Please try again.')
  }
}

export function buildNativeWebUrl(opts: { token?: string | null; path: string }) {
  const safePath = normalizePath(opts.path)
  return `${API_BASE_URL}${safePath}`
}

export function buildNativeWebSource(opts: { token?: string | null; path: string }) {
  const token = normalizeToken(opts.token)
  const uri = buildNativeWebUrl({ token, path: opts.path })
  if (!token) return { uri }

  return {
    uri,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-native-token': token,
      Cookie: buildNativeCookieHeader(token),
    },
  }
}
