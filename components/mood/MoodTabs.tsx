'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function MoodTabs() {
  const pathname = usePathname()
  const isCheckIn = pathname === '/mood'
  const isHistory = pathname === '/mood/history'
  const isJournal = pathname === '/mood/journal'
  const isInsights = pathname === '/mood/insights'
  const isPrefs = pathname === '/mood/preferences'

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4">
      <div className="bg-white dark:bg-gray-800 rounded-t-xl border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-end px-2 pt-2">
          <Link
            href="/mood/preferences"
            className={`px-3 py-1 rounded-full border text-xs font-semibold transition-colors ${
              isPrefs
                ? 'border-helfi-green text-helfi-green'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
            aria-label="Preferences"
          >
            <span className="material-symbols-outlined align-middle text-[18px]">settings</span>
          </Link>
        </div>
        <div className="px-1 pb-1">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <Link
              href="/mood"
              className={`flex-shrink-0 px-4 py-3 text-center font-medium whitespace-nowrap transition-colors ${
                isCheckIn
                  ? 'text-helfi-green border-b-2 border-helfi-green'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Check‑in
            </Link>
            <Link
              href="/mood/history"
              className={`flex-shrink-0 px-4 py-3 text-center font-medium whitespace-nowrap transition-colors ${
                isHistory
                  ? 'text-helfi-green border-b-2 border-helfi-green'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              History
            </Link>
            <Link
              href="/mood/journal"
              className={`flex-shrink-0 px-4 py-3 text-center font-medium whitespace-nowrap transition-colors ${
                isJournal
                  ? 'text-helfi-green border-b-2 border-helfi-green'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Journal
            </Link>
            <Link
              href="/mood/insights"
              className={`flex-shrink-0 px-4 py-3 text-center font-medium whitespace-nowrap transition-colors ${
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
    </div>
  )
}
