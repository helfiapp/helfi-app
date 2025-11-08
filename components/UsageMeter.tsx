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

  // Calculate percent remaining (for reverse mode) and percent used
  const percentUsed = walletPercentUsed ?? 0
  const percentRemaining = Math.max(0, 100 - percentUsed)
  const displayPercentUsed = Math.min(100, Math.max(0, percentUsed))
  const displayPercentRemaining = Math.min(100, Math.max(0, percentRemaining))
  
  // Check if credits are low (5% or less remaining)
  const isLowCredits = percentRemaining <= 5

  if (inline) {
    // Inline version for AI feature pages - reverse mode (starts full, gets shorter)
    return (
      <div className={`mt-2 ${className}`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">Credits remaining</span>
          <span className={`text-xs font-semibold ${
            isLowCredits ? 'text-red-600' : 'text-gray-700'
          }`}>
            {displayPercentRemaining.toFixed(0)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden relative">
          {/* Background bar - shows remaining (green) */}
          <div
            className={`h-2 transition-all duration-300 ${
              isLowCredits ? 'bg-red-500' : 'bg-helfi-green'
            }`}
            style={{ width: `${displayPercentRemaining}%` }}
          />
        </div>
        {isLowCredits && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2">
            <p className="text-xs text-red-800 font-medium mb-1">⚠️ Low Credits Warning</p>
            <p className="text-xs text-red-700 mb-2">
              You're running low on credits ({displayPercentRemaining.toFixed(0)}% remaining). 
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
    // Compact version for headers - horizontal layout (forward mode)
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Usage</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {displayPercentUsed}%
          </span>
        </div>
        <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-1.5 transition-all ${
              displayPercentUsed >= 90 ? 'bg-red-500' : 
              displayPercentUsed >= 70 ? 'bg-yellow-500' : 
              'bg-helfi-green'
            }`}
            style={{ width: `${displayPercentUsed}%` }}
          />
        </div>
      </div>
    )
  }

  // Full version for sidebar - vertical layout (forward mode)
  return (
    <div className={`px-4 py-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Monthly usage</span>
        <span className="text-xs font-semibold text-gray-900 dark:text-white">
          {displayPercentUsed}%
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 transition-all ${
            displayPercentUsed >= 90 ? 'bg-red-500' : 
            displayPercentUsed >= 70 ? 'bg-yellow-500' : 
            'bg-helfi-green'
          }`}
          style={{ width: `${displayPercentUsed}%` }}
        />
      </div>
      {showResetDate && walletRefreshAt && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
          Resets {new Date(walletRefreshAt).toLocaleDateString()}
        </p>
      )}
    </div>
  )
}

