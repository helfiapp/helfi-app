'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

interface UsageMeterProps {
  compact?: boolean // Compact version for headers
  showResetDate?: boolean // Show reset date below meter
  className?: string // Additional CSS classes
}

export default function UsageMeter({ compact = false, showResetDate = false, className = '' }: UsageMeterProps) {
  const { data: session } = useSession()
  const [walletPercentUsed, setWalletPercentUsed] = useState<number | null>(null)
  const [walletRefreshAt, setWalletRefreshAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadStatus = async () => {
      if (!session?.user) {
        setLoading(false)
        return
      }
      try {
        const res = await fetch('/api/credit/status', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (typeof data.percentUsed === 'number') {
            setWalletPercentUsed(data.percentUsed)
          }
          if (data.refreshAt) {
            setWalletRefreshAt(data.refreshAt)
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
  }, [session])

  // Don't render if not authenticated or still loading
  if (!session || loading) {
    return null
  }

  // If no percentage data, show 0% or hide
  const percent = walletPercentUsed ?? 0
  const displayPercent = Math.min(100, Math.max(0, percent))

  if (compact) {
    // Compact version for headers - horizontal layout
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Usage</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {displayPercent}%
          </span>
        </div>
        <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-1.5 transition-all ${
              displayPercent >= 90 ? 'bg-red-500' : 
              displayPercent >= 70 ? 'bg-yellow-500' : 
              'bg-helfi-green'
            }`}
            style={{ width: `${displayPercent}%` }}
          />
        </div>
      </div>
    )
  }

  // Full version for sidebar - vertical layout
  return (
    <div className={`px-4 py-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Monthly usage</span>
        <span className="text-xs font-semibold text-gray-900 dark:text-white">
          {displayPercent}%
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 transition-all ${
            displayPercent >= 90 ? 'bg-red-500' : 
            displayPercent >= 70 ? 'bg-yellow-500' : 
            'bg-helfi-green'
          }`}
          style={{ width: `${displayPercent}%` }}
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

