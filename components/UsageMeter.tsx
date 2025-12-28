'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface UsageMeterProps {
  compact?: boolean // Compact version for headers
  showResetDate?: boolean // Show reset date below meter
  inline?: boolean // Inline version next to typical cost (reverse mode)
  className?: string // Additional CSS classes
  refreshTrigger?: number // When this changes, force a refresh
}

export default function UsageMeter({ compact = false, showResetDate = false, inline = false, className = '', refreshTrigger = 0 }: UsageMeterProps) {
  const { data: session } = useSession()
  const [walletPercentUsed, setWalletPercentUsed] = useState<number | null>(null)
  const [walletRefreshAt, setWalletRefreshAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const [totalAvailableCents, setTotalAvailableCents] = useState<number>(0)
  const [monthlyUsedCents, setMonthlyUsedCents] = useState<number>(0)
  const [monthlyCapCents, setMonthlyCapCents] = useState<number>(0)
  // Credits (credits == cents) - numeric remaining for display
  const [creditsTotal, setCreditsTotal] = useState<number | null>(null)
  const [creditsDailyRemaining, setCreditsDailyRemaining] = useState<number | null>(null)
  const [creditsAdditionalRemaining, setCreditsAdditionalRemaining] = useState<number | null>(null)
  const [creditData, setCreditData] = useState<any>(null) // Store full API response for free credits check
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

  useEffect(() => {
    const loadStatus = async () => {
      if (!session?.user) {
        setLoading(false)
        return
      }
      try {
        // Add timestamp to prevent caching when refreshTrigger changes
        const cacheBuster = refreshTrigger > 0 ? `?t=${Date.now()}` : ''
        const res = await fetch(`/api/credit/status${cacheBuster}`, { 
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        })
        if (res.ok) {
          const data = await res.json()
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
  }, [session, refreshTrigger, eventTick]) // include eventTick for global refresh

  // Don't render if not authenticated, still loading, or no access
  if (!session || loading || !hasAccess) {
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
