export const APP_NAME = 'Helfi'

function normalizeApiBaseUrl(value: string | undefined): string {
  const raw = String(value || '').trim()
  const cleaned = raw.replace(/\/+$/, '')
  // Default to live so billing checkout always uses the working Stripe setup.
  if (!cleaned) return 'https://helfi.ai'

  // Allow localhost during simulator/dev testing only.
  const isLocalDevHost = /^(https?:\/\/localhost(:\d+)?|https?:\/\/127\.0\.0\.1(:\d+)?|http:\/\/10\.0\.2\.2(:\d+)?)$/i.test(cleaned)
  if (isLocalDevHost && __DEV__) return cleaned

  // Prevent accidental use of preview URLs in native app builds.
  // Preview deployments can have mismatched auth/billing behavior.
  if (/\.vercel\.app/i.test(cleaned)) return 'https://helfi.ai'

  // Allow only known stable environments.
  if (/^https:\/\/helfi\.ai$/i.test(cleaned)) return 'https://helfi.ai'
  if (/^https:\/\/stg\.helfi\.ai$/i.test(cleaned)) return 'https://stg.helfi.ai'

  // Any unknown host falls back to live for billing reliability.
  return 'https://helfi.ai'
}

export const API_BASE_URL = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL)
