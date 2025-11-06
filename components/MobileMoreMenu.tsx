'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export default function MobileMoreMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (open && ref.current && !ref.current.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [open])

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

  const handleToggle = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    triggerHaptic()
    setOpen((s) => !s)
  }

  return (
    <div ref={ref} className="relative pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1">
      <button
        onClick={handleToggle}
        onTouchStart={handleToggle}
        className="flex flex-col items-center focus:outline-none w-full"
        type="button"
      >
        <div className={`icon ${open ? 'text-helfi-green' : 'text-gray-400'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
        </div>
        <span className={`label text-xs mt-1 truncate ${open ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>More</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg w-56 p-2 z-[100]" onClick={(e) => e.stopPropagation()}>
          <Link href="/symptoms" className="block px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50" onClick={() => setOpen(false)}>Symptom Analysis</Link>
          <Link href="/onboarding?step=1" className="block px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50" onClick={() => setOpen(false)}>Intake</Link>
        </div>
      )}
    </div>
  )
}


