'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface UsageMeterProps {
  compact?: boolean // Compact version for headers
  showResetDate?: boolean // Show reset date below meter
  inline?: boolean // Inline version next to typical cost (reverse mode)
  className?: string // Additional CSS classes
  refreshTrigger?: number // When this changes, force a refresh
  feature?: string // Optional feature tag for server call tracking
}

type CreditStatusCacheEntry = {
  data?: any
  inFlight?: Promise<any>
  fetchedAt?: number
}

const creditStatusCache: Record<string, CreditStatusCacheEntry> = {}
const CREDIT_STATUS_TTL_MS = 60 * 1000
const CREDIT_STATUS_EVENT_MIN_MS = 5 * 1000
const CREDIT_STATUS_STORAGE_PREFIX = 'helfi:credits:status'

const buildCreditStatusStorageKey = (userKey: string, feature?: string) =>
  `${CREDIT_STATUS_STORAGE_PREFIX}:${userKey}:${feature || 'all'}`

const buildLastCreditStatusStorageKey = (feature?: string) =>
  `${CREDIT_STATUS_STORAGE_PREFIX}:last:${feature || 'all'}`

const readStoredCreditStatus = (userKey: string, feature?: string): CreditStatusCacheEntry | null => {
  if (!userKey || typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(buildCreditStatusStorageKey(userKey, feature))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.data) return null
    return parsed
  } catch {
    return null
  }
}

const readLastStoredCreditStatus = (feature?: string): CreditStatusCacheEntry | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(buildLastCreditStatusStorageKey(feature))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.data) return null
    return parsed
  } catch {
    return null
  }
}

const writeStoredCreditStatus = (userKey: string, feature?: string, data?: any) => {
  if (!userKey || !data || typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      buildCreditStatusStorageKey(userKey, feature),
      JSON.stringify({ data, fetchedAt: Date.now() }),
    )
    window.sessionStorage.setItem(
      buildLastCreditStatusStorageKey(feature),
      JSON.stringify({ data, fetchedAt: Date.now() }),
    )
  } catch {
    // Ignore storage errors
  }
}

async function fetchCreditStatus(feature?: string, forceRefresh?: boolean): Promise<any | null> {
  const key = feature || 'all'
  const now = Date.now()
  const cached = creditStatusCache[key]
  if (!forceRefresh && cached?.data && cached.fetchedAt && now - cached.fetchedAt < CREDIT_STATUS_TTL_MS) {
    return cached.data
  }
  if (cached?.inFlight) {
    return cached.inFlight
  }
  const featureParam = feature ? `feature=${encodeURIComponent(feature)}` : ''
  const queryString = featureParam ? `?${featureParam}` : ''
  const request = fetch(`/api/credit/status${queryString}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  })
    .then(async (res) => {
      if (!res.ok) return null
      return await res.json()
    })
    .catch(() => null)

  creditStatusCache[key] = { ...cached, inFlight: request }
  const data = await request
  creditStatusCache[key] = { data: data ?? cached?.data, fetchedAt: Date.now() }
  return data
}

export default function UsageMeter({ compact = false, showResetDate = false, inline = false, className = '', refreshTrigger = 0, feature }: UsageMeterProps) {
  const { data: session } = useSession()
  const userCacheKey = (session as any)?.user?.id || (session as any)?.user?.email || ''
  const initialStatus = (() => {
    if (typeof window === 'undefined') return null
    const key = feature || 'all'
    const stored = userCacheKey ? readStoredCreditStatus(userCacheKey, feature) : null
    const lastStored = !stored?.data ? readLastStoredCreditStatus(feature) : null
    const cached = creditStatusCache[key]?.data ? { data: creditStatusCache[key]?.data, fetchedAt: creditStatusCache[key]?.fetchedAt } : null
    if (stored?.data) return stored
    if (lastStored?.data) return lastStored
    return cached
  })()
  const initialData = initialStatus?.data
  const initialCredits = initialData?.credits
  const [walletPercentUsed, setWalletPercentUsed] = useState<number | null>(
    typeof initialData?.percentUsed === 'number' ? initialData.percentUsed : null,
  )
  const [walletRefreshAt, setWalletRefreshAt] = useState<string | null>(initialData?.refreshAt || null)
  const [loading, setLoading] = useState(!initialData)
  const [hasAccess, setHasAccess] = useState(Boolean(initialData))
  const [totalAvailableCents, setTotalAvailableCents] = useState<number>(
    typeof initialData?.totalAvailableCents === 'number' ? initialData.totalAvailableCents : 0,
  )
  const [monthlyUsedCents, setMonthlyUsedCents] = useState<number>(
    typeof initialData?.monthlyUsedCents === 'number' ? initialData.monthlyUsedCents : 0,
  )
  const [monthlyCapCents, setMonthlyCapCents] = useState<number>(
    typeof initialData?.monthlyCapCents === 'number' ? initialData.monthlyCapCents : 0,
  )
  // Credits (credits == cents) - numeric remaining for display
  const [creditsTotal, setCreditsTotal] = useState<number | null>(
    typeof initialCredits?.total === 'number' ? initialCredits.total : null,
  )
  const [creditsDailyRemaining, setCreditsDailyRemaining] = useState<number | null>(
    typeof initialCredits?.dailyRemaining === 'number' ? initialCredits.dailyRemaining : null,
  )
  const [creditsAdditionalRemaining, setCreditsAdditionalRemaining] = useState<number | null>(
    typeof initialCredits?.additionalRemaining === 'number' ? initialCredits.additionalRemaining : null,
  )
  const [creditData, setCreditData] = useState<any>(initialData ?? null) // Store full API response for free credits check
  // Listen for global refresh events so sidebar meter updates immediately after charges
  const [eventTick, setEventTick] = useState(0)
  useEffect(() => {
    const handler = () => setEventTick((v) => v + 1)
    try {
      window.addEventListener('credits:refresh', handler)
      return () => window.removeEventListener('credits:refresh', handler)
    } catch {
      // SSR/no-window safe
      return () => {}
    }
  }, [])

  const applyCreditStatus = useCallback((data: any) => {
    if (!data) return
    // Treat any successful status response for a logged‑in user as
    // sufficient to show the meter. Billing enforcement lives in the
    // analyzer APIs; this meter is purely a visibility/UX layer.
    setHasAccess(true)
    if (typeof data.percentUsed === 'number') {
      setWalletPercentUsed(data.percentUsed)
    }
    if (data.refreshAt) {
      setWalletRefreshAt(data.refreshAt)
    }
    if (typeof data.totalAvailableCents === 'number') {
      setTotalAvailableCents(data.totalAvailableCents)
    }
    if (typeof data.monthlyUsedCents === 'number') {
      setMonthlyUsedCents(data.monthlyUsedCents)
    }
    if (typeof data.monthlyCapCents === 'number') {
      setMonthlyCapCents(data.monthlyCapCents)
    }
    if (data.credits) {
      if (typeof data.credits.total === 'number') setCreditsTotal(data.credits.total)
      if (typeof data.credits.dailyRemaining === 'number') setCreditsDailyRemaining(data.credits.dailyRemaining)
      if (typeof data.credits.additionalRemaining === 'number') setCreditsAdditionalRemaining(data.credits.additionalRemaining)
    }
    // Store full data for free credits check
    setCreditData(data)
  }, [])

  useEffect(() => {
    if (creditData) return
    const stored = userCacheKey ? readStoredCreditStatus(userCacheKey, feature) : readLastStoredCreditStatus(feature)
    if (stored?.data) {
      applyCreditStatus(stored.data)
      setLoading(false)
    }
  }, [userCacheKey, feature, creditData, applyCreditStatus])

  useEffect(() => {
    const loadStatus = async () => {
      if (!session?.user) {
        setLoading(false)
        return
      }
      try {
        const key = feature || 'all'
        const now = Date.now()
        const lastFetchedAt =
          creditStatusCache[key]?.fetchedAt ||
          readStoredCreditStatus(userCacheKey, feature)?.fetchedAt ||
          readLastStoredCreditStatus(feature)?.fetchedAt ||
          0
        const allowForceRefresh = now - lastFetchedAt >= CREDIT_STATUS_EVENT_MIN_MS
        const forceRefresh = Boolean((refreshTrigger || 0) > 0 || eventTick > 0) && allowForceRefresh
        const data = await fetchCreditStatus(feature, forceRefresh)
        if (data) {
          applyCreditStatus(data)
          if (userCacheKey) {
            writeStoredCreditStatus(userCacheKey, feature, data)
          }
        } else {
          setHasAccess(false)
        }
      } catch {
        // ignore errors
      } finally {
        setLoading(false)
      }
    }
    loadStatus()
    
    return () => {}
  }, [session, refreshTrigger, eventTick, feature, userCacheKey, applyCreditStatus]) // include eventTick for global refresh

  // Don't render if not authenticated, still loading, or no access
  if ((!session && !initialData) || loading || !hasAccess) {
    return null
  }

  // Credits (credits == cents) must reflect the sum of:
  // - subscription remaining
  // - active top-ups
  // - non-expiring additional credits (admin grants)
  const creditsRemaining = creditsTotal ?? Math.round(totalAvailableCents)

  // Get free credits status from API response
  const exhaustedFreeCredits = creditData?.exhaustedFreeCredits ?? false
  const freeCreditsTotal = creditData?.freeCredits?.total ?? 0
  const isPremiumPlan = creditData?.plan === 'PREMIUM' || monthlyCapCents > 0
  const hasPaidCredits = totalAvailableCents > 0 || (creditsAdditionalRemaining ?? 0) > 0
  const showFreeCredits = !isPremiumPlan && !hasPaidCredits && freeCreditsTotal > 0 && !exhaustedFreeCredits

  const freeCreditsBaseline = Math.max(15, freeCreditsTotal)
  const effectiveCreditsRemaining = showFreeCredits ? freeCreditsTotal : creditsRemaining

  // We anchor percent remaining to the subscription cap when present, but never allow
  // additional credits to incorrectly trigger "low credits" UI.
  const percentRemainingPrecise =
    showFreeCredits
      ? (effectiveCreditsRemaining / Math.max(1, freeCreditsBaseline)) * 100
      : monthlyCapCents > 0
      ? (creditsRemaining / Math.max(1, monthlyCapCents)) * 100
      : creditsRemaining > 0
      ? 100
      : 0
  const clampedRemaining = Math.min(100, Math.max(0, percentRemainingPrecise))
  // Inline variant shows 0.1% precision so each analysis visibly reduces the meter.
  const displayPercentRemainingInline = Number(clampedRemaining.toFixed(1))
  const displayPercentRemaining = Math.round(clampedRemaining)

  // Low credits: show red when remaining is genuinely low.
  // BUT: Only show warning if free credits are exhausted AND wallet credits are low
  const lowCreditsThreshold = Math.max(5, Math.ceil(monthlyCapCents > 0 ? monthlyCapCents * 0.05 : 0))
  const isLowCredits = effectiveCreditsRemaining <= lowCreditsThreshold && exhaustedFreeCredits

  if (inline) {
    // Inline version for AI feature pages - credits remaining with green bar (reverse fill)
    const creditsDisplayInline = effectiveCreditsRemaining
    const creditsRemainingPercent = displayPercentRemainingInline
    
    return (
      <div className={`mt-2 ${className}`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">
            {showFreeCredits ? 'Free uses remaining' : 'Credits remaining'}
          </span>
          <span className={`text-xs font-semibold ${isLowCredits ? 'text-red-600' : 'text-gray-700'}`}>
            {creditsDisplayInline?.toLocaleString()}
          </span>
        </div>
        {showFreeCredits && (
          <div className="mb-2 text-xs text-green-600 font-medium">
            {freeCreditsTotal} free credit{freeCreditsTotal !== 1 ? 's' : ''} remaining
          </div>
        )}
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden relative">
          {/* Background bar - shows remaining (green) */}
          <div
            className={`h-2 transition-all duration-300 ${
              isLowCredits ? 'bg-red-500' : 'bg-helfi-green'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, creditsRemainingPercent))}%` }}
          />
        </div>
        {/* Only show warning if free credits are exhausted AND wallet credits are low */}
        {creditsDisplayInline !== null && creditsDisplayInline <= 5 && exhaustedFreeCredits && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2">
            <p className="text-xs text-red-800 font-medium mb-1">⚠️ Low Credits Warning</p>
            <p className="text-xs text-red-700 mb-2">
              You're running low on credits ({creditsDisplayInline.toLocaleString()} remaining). 
              Purchase more credits or upgrade your subscription to continue using AI features.
            </p>
            <div className="flex gap-2">
              <Link
                href="/billing"
                className="flex-1 text-center text-xs font-medium text-red-800 bg-white border border-red-300 rounded px-2 py-1.5 hover:bg-red-50 transition-colors"
              >
                Upgrade Plan
              </Link>
              <Link
                href="/billing"
                className="flex-1 text-center text-xs font-medium text-white bg-red-600 rounded px-2 py-1.5 hover:bg-red-700 transition-colors"
              >
                Buy Credits
              </Link>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (compact) {
    // Compact version for headers - credits remaining with green bar (reverse fill)
    const creditsDisplay = effectiveCreditsRemaining
    const creditsRemainingPercent = displayPercentRemaining
    
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 transition-all duration-300 ${
              isLowCredits ? 'bg-red-500' : 'bg-helfi-green'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, creditsRemainingPercent))}%` }}
          />
        </div>
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {showFreeCredits ? 'Free uses remaining' : 'Credits remaining'}
        </span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {creditsDisplay?.toLocaleString()}
        </span>
      </div>
    )
  }

  // Full version for sidebar - credits remaining with green bar (reverse fill)
  const creditsDisplay = effectiveCreditsRemaining
  const creditsRemainingPercent = displayPercentRemaining
  
  return (
    <div className={`px-4 py-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-white">
          {showFreeCredits ? 'Free uses remaining' : 'Credits remaining'}
        </span>
        <span className="text-xs font-semibold text-white">
          {creditsDisplay?.toLocaleString()}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden mb-2">
        <div
          className={`h-2 transition-all duration-300 ${
            isLowCredits ? 'bg-red-500' : 'bg-helfi-green'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, creditsRemainingPercent))}%` }}
        />
      </div>
      {showFreeCredits && (
        <p className="text-xs text-gray-200 mt-1.5">
          {freeCreditsTotal} free use{freeCreditsTotal !== 1 ? 's' : ''} left
        </p>
      )}
      {showResetDate && walletRefreshAt && !showFreeCredits && (
        <p className="text-xs text-gray-200 mt-1.5">
          Resets {new Date(walletRefreshAt).toLocaleDateString()}
        </p>
      )}
    </div>
  )
}
