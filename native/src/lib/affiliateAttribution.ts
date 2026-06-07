import AsyncStorage from '@react-native-async-storage/async-storage'

import { API_BASE_URL } from '../config'

const STORAGE_KEY = 'helfi_affiliate_attribution_v1'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type NativeAffiliateAttribution = {
  code: string
  clickId: string
  visitorId: string
  clickedAtMs: number
}

function extractAffiliateCodeFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(String(rawUrl || ''))
    const match = parsed.pathname.match(/^\/r\/([^/?#]+)/i)
    return match?.[1] ? decodeURIComponent(match[1]).trim().toLowerCase() : ''
  } catch {
    return ''
  }
}

function isFresh(attribution: NativeAffiliateAttribution): boolean {
  const clickedAtMs = Number(attribution.clickedAtMs || 0)
  return clickedAtMs > 0 && Date.now() - clickedAtMs <= MAX_AGE_MS
}

export async function readFreshAffiliateAttribution(): Promise<NativeAffiliateAttribution | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as NativeAffiliateAttribution
    if (!parsed?.code || !parsed?.clickId || !parsed?.visitorId || !isFresh(parsed)) {
      await AsyncStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function recordAffiliateClickFromUrl(rawUrl: string): Promise<void> {
  const code = extractAffiliateCodeFromUrl(rawUrl)
  if (!code) return

  const existing = await readFreshAffiliateAttribution()
  const res = await fetch(`${API_BASE_URL}/api/affiliate/native-click`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      visitorId: existing?.visitorId,
    }),
  })
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok || !data?.attribution) return

  const attribution = data.attribution as NativeAffiliateAttribution
  if (!attribution?.code || !attribution?.clickId || !attribution?.visitorId) return
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(attribution))
}
