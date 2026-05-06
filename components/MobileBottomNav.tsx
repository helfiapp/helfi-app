'use client'

import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import MobileMoreMenu from '@/components/MobileMoreMenu'

function triggerHaptic() {
  try {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
    const pref = typeof window !== 'undefined' ? localStorage.getItem('hapticsEnabled') : null
    const enabled = pref === null ? true : pref === 'true'
    if (!reduced && enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }
  } catch {
    // Ignore haptic errors
  }
}

function NavItem({
  href,
  label,
  active,
  children,
}: {
  href: string
  label: string
  active: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1"
      onClick={triggerHaptic}
    >
      <div className={`icon ${active ? 'text-helfi-green' : 'text-gray-400 dark:text-gray-500'}`}>
        {children}
      </div>
      <span
        className={`label text-xs mt-1 truncate ${
          active ? 'text-helfi-green font-bold' : 'text-gray-400 dark:text-gray-500 font-medium'
        }`}
      >
        {label}
      </span>
    </Link>
  )
}

export default function MobileBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 z-40">
      <div className="flex items-center justify-around">
        <NavItem href="/dashboard" label="Dashboard" active={pathname === '/dashboard'}>
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
          </svg>
        </NavItem>

        <NavItem href="/insights" label="Insights" active={pathname.startsWith('/insights')}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </NavItem>

        <NavItem href="/food" label="Food" active={pathname.startsWith('/food')}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </NavItem>

        <MobileMoreMenu />

        <NavItem href="/settings" label="Settings" active={pathname.startsWith('/settings')}>
          <Cog6ToothIcon className="w-6 h-6 flex-shrink-0" style={{ minWidth: '24px', minHeight: '24px' }} />
        </NavItem>
      </div>
    </nav>
  )
}
