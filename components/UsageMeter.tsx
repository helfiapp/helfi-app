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
          // Show usage meter if user has access (subscription OR credits)
          if (data.hasAccess === true) {
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
          } else {
            setHasAccess(false)
          }
        }
      } catch {
        // ignore errors
      } finally {
        setLoading(false)
      }
    }
    loadStatus()
    
    // Refresh every 30 seconds to keep usage meter updated
    const interval = setInterval(loadStatus, 30000)
    return () => clearInterval(interval)
  }, [session, refreshTrigger]) // Added refreshTrigger to dependencies

  // Don't render if not authenticated, still loading, or no access
  if (!session || loading || !hasAccess) {
    return null
  }

  // Calculate precise percent used when we know wallet cents (subscription case).
  // Fallback to server-reported percentage when only top-ups are present.
  const percentUsedPrecise =
    monthlyCapCents > 0
      ? (monthlyUsedCents / Math.max(1, monthlyCapCents)) * 100
      : (walletPercentUsed ?? 0)
  const clampedUsed = Math.min(100, Math.max(0, percentUsedPrecise))
  const percentRemainingPrecise = Math.max(0, 100 - clampedUsed)
  // Non-inline variants show integer rounding to keep UI calm
  const displayPercentUsed = Math.round(clampedUsed)
  // Inline variant shows 0.1% precision so each analysis visibly reduces the meter
  const displayPercentRemainingInline = Number(percentRemainingPrecise.toFixed(1))
  
  // Check if credits are low (5% or less remaining)
  const isLowCredits = percentRemainingPrecise <= 5

  if (inline) {
    // Inline version for AI feature pages - numeric credits remaining
    const creditsDisplayInline = creditsTotal ?? Math.round(totalAvailableCents)
    return (
      <div className={`mt-2 ${className}`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">Credits remaining</span>
          <span className={`text-xs font-semibold ${isLowCredits ? 'text-red-600' : 'text-gray-700'}`}>
            {creditsDisplayInline?.toLocaleString()}
          </span>
        </div>
        {isLowCredits && creditsDisplayInline !== null && creditsDisplayInline <= 5 && (
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
    // Compact version for headers - numeric credits remaining (no bar)
    const creditsDisplay = creditsTotal ?? Math.round(totalAvailableCents) // fallback to cents if credits missing
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Credits remaining</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {creditsDisplay?.toLocaleString()}
        </span>
      </div>
    )
  }

  // Full version for sidebar - numeric credits remaining (no bar)
  const creditsDisplay = creditsTotal ?? Math.round(totalAvailableCents) // fallback to cents if credits missing
  return (
    <div className={`px-4 py-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Credits remaining</span>
        <span className="text-xs font-semibold text-gray-900 dark:text-white">
          {creditsDisplay?.toLocaleString()}
        </span>
      </div>
      {showResetDate && walletRefreshAt && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
          Resets {new Date(walletRefreshAt).toLocaleDateString()}
        </p>
      )}
    </div>
  )
}


