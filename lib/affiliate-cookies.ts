import crypto from 'crypto'
import type { NextRequest } from 'next/server'

export const AFFILIATE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days

export const AFFILIATE_COOKIES = {
  code: 'helfi_aff_code',
  clickId: 'helfi_aff_click',
  visitorId: 'helfi_aff_vid',
  clickedAtMs: 'helfi_aff_ts',
} as const

export type AffiliateCookieData = {
  code: string
  clickId: string
  visitorId: string
  clickedAtMs: number
}

export function normalizeAffiliateCode(input: string): string {
  return input.trim().toLowerCase()
}

export function getOrCreateVisitorId(request: NextRequest): string {
  const existing = request.cookies.get(AFFILIATE_COOKIES.visitorId)?.value
  if (existing && existing.length >= 10) return existing
  return crypto.randomUUID()
}

export function getAffiliateCookieData(request: NextRequest): AffiliateCookieData | null {
  const code = request.cookies.get(AFFILIATE_COOKIES.code)?.value
  const clickId = request.cookies.get(AFFILIATE_COOKIES.clickId)?.value
  const visitorId = request.cookies.get(AFFILIATE_COOKIES.visitorId)?.value
  const clickedAtMsStr = request.cookies.get(AFFILIATE_COOKIES.clickedAtMs)?.value
  const clickedAtMs = clickedAtMsStr ? Number(clickedAtMsStr) : NaN

  if (!code || !clickId || !visitorId || !Number.isFinite(clickedAtMs)) return null
  return { code, clickId, visitorId, clickedAtMs }
}

export function isAffiliateAttributionFresh(clickedAtMs: number, nowMs: number = Date.now()): boolean {
  const ageSeconds = Math.floor((nowMs - clickedAtMs) / 1000)
  return ageSeconds >= 0 && ageSeconds <= AFFILIATE_COOKIE_MAX_AGE_SECONDS
}

