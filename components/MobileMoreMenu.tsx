'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export default function MobileMoreMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()

  useEffect(() => {
    function onDocClick(e: MouseEvent | TouchEvent) {
      const target = e.target as HTMLElement
      if (open && ref.current && menuRef.current && 
          !ref.current.contains(target) && 
          !menuRef.current.contains(target)) {
        setOpen(false)
      }
    }
    // Use capture phase and multiple event types for better mobile support
    document.addEventListener('mousedown', onDocClick, true)
    document.addEventListener('touchstart', onDocClick, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick, true)
      document.removeEventListener('touchstart', onDocClick, true)
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

  const handleToggle = () => {
    triggerHaptic()
    setOpen((s) => !s)
  }

  const navigate = (href: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOpen(false)
    setTimeout(() => {
      try { router.push(href) } catch {}
      try { if (typeof window !== 'undefined') window.location.href = href } catch {}
    }, 100)
  }

  return (
    <div ref={ref} className="relative pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1">
      <button
        onClick={handleToggle}
        className="flex flex-col items-center focus:outline-none w-full"
        type="button"
      >
        <div className={`icon ${open ? 'text-helfi-green' : 'text-gray-400'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
        </div>
        <span className={`label text-xs mt-1 truncate ${open ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>More</span>
      </button>
      {open && (
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
            onMouseDown={(e) => navigate('/onboarding?step=1', e)}
            onTouchStart={(e) => navigate('/onboarding?step=1', e)}
            type="button"
          >
            Intake
          </button>
        </div>
      )}
    </div>
  )
}


