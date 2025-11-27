'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function triggerHaptic() {
  try {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
    const pref = typeof window !== 'undefined' ? localStorage.getItem('hapticsEnabled') : null
    const enabled = pref === null ? true : pref === 'true'
    if (!reduced && enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }
  } catch {}
}

export default function MobileMoreMenu() {
  const pathname = usePathname()
  const isActive = pathname === '/more'

  return (
    <Link
      href="/more"
      className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1"
      onClick={triggerHaptic}
    >
      <div className={`icon ${isActive ? 'text-helfi-green' : 'text-gray-400'}`}>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/>
        </svg>
      </div>
      <span className={`label text-xs mt-1 truncate ${isActive ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>More</span>
    </Link>
  )
}


