export function buildNativeSessionCookie(token: string) {
  const safe = String(token || '').trim()
  if (!safe) return ''
  return [
    `next-auth.session-token=${safe}`,
    `authjs.session-token=${safe}`,
    `__Secure-next-auth.session-token=${safe}`,
    `__Secure-authjs.session-token=${safe}`,
  ].join('; ')
}

export function buildNativeAuthHeaders(
  token: string,
  options?: {
    json?: boolean
    includeCookie?: boolean
  },
) {
  const safe = String(token || '').trim()
  const headers: Record<string, string> = {
    authorization: `Bearer ${safe}`,
    'x-native-token': safe,
    'cache-control': 'no-store',
  }

  if (options?.includeCookie) {
    const cookie = buildNativeSessionCookie(safe)
    if (cookie) headers.Cookie = cookie
  }
  if (options?.json) {
    headers['content-type'] = 'application/json'
  }
  return headers
}
