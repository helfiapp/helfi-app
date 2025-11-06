'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

function triggerHaptic() {
  try {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
    const pref = typeof window !== 'undefined' ? localStorage.getItem('hapticsEnabled') : null
    const enabled = pref === null ? true : pref === 'true'
    if (!reduced && enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }
  } catch {
    // ignore haptic errors
  }
}

export default function InsightsBottomNav() {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (showMore && moreRef.current && !moreRef.current.contains(target)) {
        setShowMore(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [showMore])
  const items: Array<{ href: string; label: string; svg: JSX.Element; active: boolean }> = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      svg: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
        </svg>
      ),
      active: pathname === '/dashboard',
    },
    {
      href: '/insights',
      label: 'Insights',
      svg: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      ),
      active: pathname.startsWith('/insights'),
    },
    {
      href: '/food',
      label: 'Food',
      svg: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      active: pathname === '/food',
    },
    // Intake moved to More menu
    {
      href: '/settings',
      label: 'Settings',
      svg: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      active: pathname === '/settings',
    },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
      <div className="flex items-center justify-around">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1"
            onClick={triggerHaptic}
          >
            <div className={`icon ${item.active ? 'text-helfi-green' : 'text-gray-400'}`}>{item.svg}</div>
            <span className={`label text-xs mt-1 truncate ${item.active ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>
              {item.label}
            </span>
          </Link>
        ))}
        <div ref={moreRef} className="relative pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1">
          <button
            onPointerDown={() => { triggerHaptic(); setShowMore((s) => !s) }}
            className="flex flex-col items-center focus:outline-none"
          >
            <div className={`icon ${showMore ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${showMore ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>More</span>
          </button>
          {showMore && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg w-56 p-2 z-[100]">
              <Link href="/symptoms" className="block px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50" onClick={() => setShowMore(false)}>Symptom Analysis</Link>
              <Link href="/onboarding?step=1" className="block px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50" onClick={() => setShowMore(false)}>Intake</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
