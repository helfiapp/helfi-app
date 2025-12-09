'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'

export type FoodDiaryTab = 'diary' | 'favourites'
export type FoodNavMode = 'food' | 'app'

interface FoodDiaryNavProps {
  mode: FoodNavMode
  activeFoodTab: FoodDiaryTab
  onSelectFoodTab: (tab: FoodDiaryTab) => void
  onModeChange?: (mode: FoodNavMode) => void
  showModeToggle?: boolean
  variant?: 'mobile' | 'desktop'
}

function triggerHaptic() {
  try {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const pref = typeof localStorage !== 'undefined' ? localStorage.getItem('hapticsEnabled') : null
    const enabled = pref === null ? true : pref === 'true'
    if (!reduced && enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }
  } catch {
    // best-effort only
  }
}

const foodTabs: Array<{ key: FoodDiaryTab; label: string; icon: React.ReactNode }> = [
  {
    key: 'diary',
    label: 'Diary',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h12M3 17h9" />
      </svg>
    ),
  },
  {
    key: 'favourites',
    label: 'Favourites',
    icon: (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
      </svg>
    ),
  },
]

const appTabs: Array<{ href: string; label: string; icon: React.ReactNode }> = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
      </svg>
    ),
  },
  {
    href: '/insights',
    label: 'Insights',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    href: '/food',
    label: 'Food',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    href: '/more',
    label: 'More',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.607 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

export function FoodDiaryNav({
  mode,
  activeFoodTab,
  onSelectFoodTab,
  onModeChange,
  showModeToggle = false,
  variant = 'mobile',
}: FoodDiaryNavProps) {
  const pathname = usePathname()
  const isAppMode = mode === 'app'
  const containerLayout =
    variant === 'desktop'
      ? 'justify-start gap-3'
      : 'justify-around gap-4'

  const renderFoodTab = (tab: (typeof foodTabs)[number]) => {
    const isActive = activeFoodTab === tab.key
    return (
      <button
        key={tab.key}
        type="button"
        onClick={() => {
          triggerHaptic()
          onSelectFoodTab(tab.key)
        }}
        className={`pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1 ${
          isActive ? 'text-helfi-green' : 'text-gray-400'
        }`}
        aria-label={tab.label}
      >
        <div className={`icon ${isActive ? 'text-helfi-green' : 'text-gray-400'}`}>{tab.icon}</div>
        <span
          className={`label text-xs mt-1 truncate ${
            isActive ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'
          }`}
        >
          {tab.label}
        </span>
      </button>
    )
  }

  const renderAppTab = (tab: (typeof appTabs)[number]) => {
    const isActive = pathname === tab.href
    return (
      <Link
        key={tab.href}
        href={tab.href}
        className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1"
        onClick={triggerHaptic}
        aria-label={tab.label}
      >
        <div className={`icon ${isActive ? 'text-helfi-green' : 'text-gray-400'}`}>{tab.icon}</div>
        <span
          className={`label text-xs mt-1 truncate ${
            isActive ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'
          }`}
        >
          {tab.label}
        </span>
      </Link>
    )
  }

  return (
    <div className={`flex items-center ${containerLayout} w-full`}>
      <div className={`flex items-center ${variant === 'desktop' ? 'gap-2' : 'flex-1 justify-around'} w-full`}>
        {isAppMode ? appTabs.map(renderAppTab) : foodTabs.map(renderFoodTab)}
      </div>
      {showModeToggle && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic()
            onModeChange?.(isAppMode ? 'food' : 'app')
          }}
          className="ml-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-200 bg-white text-xs font-semibold text-gray-700 shadow-sm"
          aria-label={isAppMode ? 'Switch to Food mode' : 'Switch to Main navigation mode'}
        >
          <span>{isAppMode ? 'Food' : 'Main'}</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}
    </div>
  )
}

