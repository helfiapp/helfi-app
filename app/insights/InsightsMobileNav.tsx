'use client'

import Link from 'next/link'

interface InsightsMobileNavProps {
  activePath: string
}

export default function InsightsMobileNav({ activePath }: InsightsMobileNavProps) {
  const items: Array<{ href: string; label: string; icon: MobileIcon; isActive: boolean }> = [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', isActive: activePath === '/dashboard' },
    { href: '/insights', label: 'Insights', icon: 'insights', isActive: activePath.startsWith('/insights') },
    { href: '/health-tracking', label: 'Tracking', icon: 'tracking', isActive: activePath === '/health-tracking' },
    { href: '/account', label: 'Account', icon: 'account', isActive: activePath.startsWith('/account') },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
      <div className="flex items-center justify-around">
        {items.map((item) => (
          <MobileNavLink key={item.href} {...item} />
        ))}
      </div>
    </nav>
  )
}

type MobileIcon = 'dashboard' | 'insights' | 'tracking' | 'account'

interface MobileNavLinkProps {
  href: string
  label: string
  icon: MobileIcon
  isActive: boolean
}

function MobileNavLink({ href, label, icon, isActive }: MobileNavLinkProps) {
  return (
    <Link
      href={href}
      className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1"
      onClick={() => {
        try {
          const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
          const pref = localStorage.getItem('hapticsEnabled')
          const enabled = pref === null ? true : pref === 'true'
          if (!reduced && enabled && 'vibrate' in navigator) {
            navigator.vibrate(10)
          }
        } catch {
          // ignore
        }
      }}
    >
      <div className={`icon ${isActive ? 'text-helfi-green' : 'text-gray-400'}`}>
        {icon === 'dashboard' && (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
          </svg>
        )}
        {icon === 'insights' && (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        )}
        {icon === 'tracking' && (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 11V3a1 1 0 112 0v8h8a1 1 0 010 2h-8v8a1 1 0 11-2 0v-8H3a1 1 0 110-2h8z" />
          </svg>
        )}
        {icon === 'account' && (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8V21h19.2v-1.8c0-3.2-6.4-4.8-9.6-4.8z" />
          </svg>
        )}
      </div>
      <span className={`label text-xs mt-1 truncate ${isActive ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>{label}</span>
    </Link>
  )
}

