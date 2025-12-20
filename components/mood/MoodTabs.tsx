'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function MoodTabs() {
  const pathname = usePathname()
  const isCheckIn = pathname === '/mood'
  const isHistory = pathname === '/mood/history'
  const isInsights = pathname === '/mood/insights'

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4">
      <div className="bg-white dark:bg-gray-800 rounded-t-xl border-b border-gray-200 dark:border-gray-700">
        <div className="flex">
          <Link
            href="/mood"
            className={`flex-1 px-4 py-3 text-center font-medium transition-colors ${
              isCheckIn
                ? 'text-helfi-green border-b-2 border-helfi-green'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Check‑in
          </Link>
          <Link
            href="/mood/history"
            className={`flex-1 px-4 py-3 text-center font-medium transition-colors ${
              isHistory
                ? 'text-helfi-green border-b-2 border-helfi-green'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            History
          </Link>
          <Link
            href="/mood/insights"
            className={`flex-1 px-4 py-3 text-center font-medium transition-colors ${
              isInsights
                ? 'text-helfi-green border-b-2 border-helfi-green'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Insights
          </Link>
        </div>
      </div>
    </div>
  )
}

