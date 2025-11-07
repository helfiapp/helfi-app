'use client'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [showMore, setShowMore] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const navigate = (href: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowMore(false)
    setTimeout(() => {
      try { router.push(href) } catch {}
      try { if (typeof window !== 'undefined') window.location.href = href } catch {}
    }, 100)
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent | TouchEvent) {
      const target = e.target as HTMLElement
      if (showMore && moreRef.current && menuRef.current && 
          !moreRef.current.contains(target) && 
          !menuRef.current.contains(target)) {
        setShowMore(false)
      }
    }
    // Use capture phase and multiple event types for better mobile support
    document.addEventListener('mousedown', onDocClick, true)
    document.addEventListener('touchstart', onDocClick, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick, true)
      document.removeEventListener('touchstart', onDocClick, true)
    }
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
      svg: (<Cog6ToothIcon className="w-6 h-6" />),
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
            onClick={() => { triggerHaptic(); setShowMore((s) => !s) }}
            className="flex flex-col items-center focus:outline-none"
            type="button"
          >
            <div className={`icon ${showMore ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${showMore ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>More</span>
          </button>
          {showMore && (
            <div ref={menuRef} className="fixed bottom-16 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-lg shadow-lg w-56 p-2 z-[999]">
              <button 
                className="w-full text-left block px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation" 
                onMouseDown={(e) => navigate('/symptoms', e)}
                onTouchStart={(e) => navigate('/symptoms', e)}
                type="button"
              >
                Symptom Analysis
              </button>
              <button 
                className="w-full text-left block px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation" 
                onMouseDown={(e) => navigate('/medical-images', e)}
                onTouchStart={(e) => navigate('/medical-images', e)}
                type="button"
              >
                Medical Images
              </button>
              <button 
                className="w-full text-left block px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation" 
                onMouseDown={(e) => navigate('/onboarding?step=1', e)}
                onTouchStart={(e) => navigate('/onboarding?step=1', e)}
                type="button"
              >
                Intake
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
