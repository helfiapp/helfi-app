'use client'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'

import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import UsageMeter from '@/components/UsageMeter'
import SupportChatWidget from '@/components/support/SupportChatWidget'
import WeeklyReportReadyModal from '@/components/WeeklyReportReadyModal'

function storePendingNotificationId(id?: string | null) {
  if (!id || typeof window === 'undefined') return
  try {
    sessionStorage.setItem('helfi:pending-notification-id', id)
  } catch {
    // Ignore storage errors
  }
}

function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }
    }

    window.addEventListener('scroll', toggleVisibility)
    return () => window.removeEventListener('scroll', toggleVisibility)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  return (
    <button
      onClick={scrollToTop}
      className={`fixed bottom-5 right-5 z-50 hidden md:inline-flex bg-helfi-green text-white p-3 rounded-full shadow-lg hover:bg-helfi-green/90 transition-all duration-300 transform ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0'
      }`}
      aria-label="Back to top"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    </button>
  )
}

// Desktop Sidebar Navigation Component  
type SidebarNavigateEvent = Event | ReactMouseEvent<HTMLAnchorElement>

function DesktopSidebar({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate: (href: string, e: SidebarNavigateEvent) => void
}) {
  return (
    <aside
      data-helfi-sidebar="true"
      className="hidden md:fixed md:inset-y-0 md:left-0 md:z-[9999] md:w-64 md:flex md:flex-col pointer-events-auto"
    >
      <div className="flex flex-col flex-grow bg-[#1f2937] text-white border-r border-gray-800 pt-5 pb-4 overflow-y-auto">
        {/* Logo */}
        <div className="flex items-center flex-shrink-0 px-4">
          <img
            className="h-12 w-auto"
            src="/mobile-assets/LOGOS/helfi-01-06.png"
            alt="Helfi"
          />
        </div>
        
        {/* Usage Meter */}
        <div className="px-4 pt-4 border-b border-gray-700 pb-4">
          <UsageMeter showResetDate={true} />
        </div>
        
        {/* Navigation */}
        <nav className="mt-8 flex-1 px-4 space-y-1">
          <a
            href="/dashboard"
            onClick={(e) => onNavigate('/dashboard', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
            <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
            </svg>
            Dashboard
          </a>
          
          <a
            href="/insights"
            onClick={(e) => onNavigate('/insights', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
            <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Insights
          </a>

          <a
            href="/chat"
            onClick={(e) => onNavigate('/chat', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
            <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Talk to AI
          </a>
          
          <a
            href="/health-tips"
            onClick={(e) => onNavigate('/health-tips', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
            <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7H7m0 0V5a2 2 0 012-2h6m-8 4v6m0 0h6m-6 0H5a2 2 0 01-2-2V7m10-4h2a2 2 0 012 2v8a2 2 0 01-2 2h-2m0 0H9m4 0v2a2 2 0 01-2 2H9" />
            </svg>
            Health Tips
          </a>
          
          <a
            href="/food"
            onClick={(e) => onNavigate('/food', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
            <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Food Diary
          </a>
          
          <a
            href="/symptoms"
            onClick={(e) => onNavigate('/symptoms', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
            <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6m9 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Symptom Analysis
          </a>

          <a
            href="/medical-images"
            onClick={(e) => onNavigate('/medical-images', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
            <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Medical Image Analyzer
          </a>

          <a
            href="/health-tracking"
            onClick={(e) => onNavigate('/health-tracking', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
            <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Health Tracking
          </a>
          
          <a
            href="/devices"
            onClick={(e) => onNavigate('/devices', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
            <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7V5a2 2 0 012-2h6a2 2 0 012 2v2" />
            </svg>
            Devices
          </a>
          
          <a
            href="/onboarding?step=1"
            onClick={(e) => onNavigate('/onboarding?step=1', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
            <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Health Intake
          </a>
          
          <div className="border-t border-gray-700 mt-6 pt-6">
          <a
            href="/check-in"
            onClick={(e) => onNavigate('/check-in', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
              <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Today's Check-in
            </a>
          <a
            href="/check-in/history"
            onClick={(e) => onNavigate('/check-in/history', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
              <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M5 19h14M7 11v8m10-8v8" />
              </svg>
              Rating History
            </a>
          <a
            href="/mood"
            onClick={(e) => onNavigate('/mood', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
              <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9 9 0 110-18 9 9 0 010 18z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.5 10.5h.01M15.5 10.5h.01" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 15c1 1 2.2 1.5 3 1.5s2-.5 3-1.5" />
              </svg>
              Mood Tracker
            </a>
          <a
            href="/mood/quick"
            onClick={(e) => onNavigate('/mood/quick', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
              <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Quick Mood Check‑In
            </a>
          <a
            href="/profile"
            onClick={(e) => onNavigate('/profile', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
              <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </a>
          <a
            href="/settings"
            onClick={(e) => onNavigate('/settings', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
              <Cog6ToothIcon className="text-gray-300 group-hover:text-white mr-3 h-6 w-6 flex-shrink-0" style={{ minWidth: '24px', minHeight: '24px' }} />
              Settings
            </a>
          <a
            href="/billing"
            onClick={(e) => onNavigate('/billing', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
              <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              Billing
            </a>
          <a
            href="/help"
            onClick={(e) => onNavigate('/help', e)}
            className="text-gray-100 hover:text-white hover:bg-gray-700/80 group flex items-center px-2 py-2 text-base font-medium rounded-md"
          >
              <svg className="text-gray-300 group-hover:text-white mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Help & Support
            </a>
            
          </div>
        </nav>
      </div>
    </aside>
  )
}

interface LayoutWrapperProps {
  children: ReactNode
}

export default function LayoutWrapper({ children }: LayoutWrapperProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()
  const [showHealthSetupReminder, setShowHealthSetupReminder] = useState(false)
  const [goalSyncNotice, setGoalSyncNotice] = useState<string | null>(null)
  const lastLocationRef = useRef('')
  const sidebarNavLockRef = useRef(0)
  const [sidebarPortal, setSidebarPortal] = useState<HTMLElement | null>(null)
  const goalSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Pages that should ALWAYS be public (no sidebar regardless of auth status)
  const publicPages = [
    '/',
    '/healthapp',
    '/auth/signin',
    '/auth/verify',
    '/auth/check-email',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/onboarding',
    '/privacy',
    '/terms',
    '/help',
    '/faq',
    '/affiliate/apply',
    '/affiliate/terms',
  ]

  const isFeaturePath = pathname.startsWith('/features')
  const isPublicPage = publicPages.includes(pathname) || isFeaturePath
  const isChatPage = pathname === '/chat'
  
  // Admin panel paths should never show user sidebar
  const isAdminPanelPath =
    pathname.startsWith('/admin-panel') || pathname.startsWith('/main-admin')

  // Dark mode is only allowed inside the signed-in app.
  // Keep public/auth pages in light mode even if the user enabled dark mode previously.
  const isOnboardingPath = pathname.startsWith('/onboarding')
  const themeAllowed =
    status === 'authenticated' &&
    !isAdminPanelPath &&
    (!isPublicPage || isOnboardingPath)

  useEffect(() => {
    if (typeof document === 'undefined') return

    if (!themeAllowed) {
      document.documentElement.classList.remove('dark')
      return
    }

    try {
      const enabled = localStorage.getItem('darkMode') === 'true'
      document.documentElement.classList.toggle('dark', enabled)
    } catch {
      // Ignore storage errors
    }
  }, [themeAllowed])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (href: string) => {
      try {
        const target = new URL(href, window.location.origin)
        if (target.origin !== window.location.origin) return
        const next = `${target.pathname}${target.search}${target.hash}`
        router.push(next)
      } catch {
        try {
          window.location.assign(href)
        } catch {
          // Ignore navigation errors
        }
      }
    }
    ;(window as any).__helfiNavigate = handler
    return () => {
      try {
        if ((window as any).__helfiNavigate === handler) {
          delete (window as any).__helfiNavigate
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }, [router])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => {
      setGoalSyncNotice('We refreshed your goal from your latest saved data to keep devices in sync.')
      if (goalSyncTimeoutRef.current) {
        clearTimeout(goalSyncTimeoutRef.current)
      }
      goalSyncTimeoutRef.current = setTimeout(() => {
        setGoalSyncNotice(null)
      }, 6000)
    }
    window.addEventListener('userData:goalSync', handler as EventListener)
    return () => {
      window.removeEventListener('userData:goalSync', handler as EventListener)
      if (goalSyncTimeoutRef.current) {
        clearTimeout(goalSyncTimeoutRef.current)
        goalSyncTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    let portal = document.getElementById('desktop-sidebar-portal') as HTMLElement | null
    if (!portal) {
      portal = document.createElement('div')
      portal.id = 'desktop-sidebar-portal'
      document.body.appendChild(portal)
    }
    setSidebarPortal(portal)
  }, [])

  // ⚠️ HEALTH SETUP GUARD RAIL
  // The 5-minute global Health Setup reminder must:
  // - Only appear for authenticated users on non-public, non-admin pages.
  // - Use GET /api/health-setup-status to respect account-wide "Don't ask me again".
  // - Show at most once per browser session via sessionStorage.helfiHealthSetupReminderShownThisSession.
  // Do NOT convert this into a hard block or change the timing/behaviour without
  // reading HEALTH_SETUP_PROTECTION.md and obtaining explicit user approval.

  // One-time per-session reminder: if a user has been using the app
  // for more than ~5 minutes without completing Health Setup, gently prompt
  // them to finish it. Users can permanently opt out of this reminder for
  // their account by choosing "Don't ask me again".
  useEffect(() => {
    if (status !== 'authenticated') return
    if (isPublicPage || isAdminPanelPath) return
    if ((session as any)?.user?.needsVerification) return

    try {
      if (sessionStorage.getItem('helfiHealthSetupReminderShownThisSession') === '1') {
        return
      }
    } catch {
      // Ignore storage errors
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/health-setup-status', { method: 'GET' })
        if (!res.ok) return
        const data = await res.json()
        const complete = !!data.complete
        const reminderDisabled = !!data.reminderDisabled

        if (!complete && !reminderDisabled) {
          setShowHealthSetupReminder(true)
          try {
            sessionStorage.setItem('helfiHealthSetupReminderShownThisSession', '1')
          } catch {
            // Ignore
          }
        }
      } catch {
        // Non-blocking; ignore failures
      }
    }, 5 * 60 * 1000)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pathname, isAdminPanelPath, isPublicPage, session])

  // Track the last in-app page the user visited (for “resume where I left off”).
  // We only store non-public, non-admin paths so onboarding / auth pages are excluded.
  useEffect(() => {
    if (status !== 'authenticated') return
    if (isPublicPage || isAdminPanelPath) return
    if (typeof window === 'undefined') return
    try {
      const fullPath = window.location.pathname + window.location.search
      localStorage.setItem('helfi:lastPath', fullPath)
      // Mirror the last path into a simple cookie so the server can redirect
      const encoded = encodeURIComponent(fullPath)
      const maxAgeSeconds = 5 * 365 * 24 * 60 * 60 // ~5 years
      document.cookie = `helfi-last-path=${encoded}; path=/; max-age=${maxAgeSeconds}; samesite=lax`
    } catch {
      // Ignore storage errors
    }
  }, [status, pathname, isAdminPanelPath, isPublicPage])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (status !== 'authenticated') return
    if (isPublicPage || isAdminPanelPath) return

    const locationKey = `${window.location.pathname}?${window.location.search}`
    if (lastLocationRef.current === locationKey) return
    lastLocationRef.current = locationKey

    try {
      const params = new URLSearchParams(window.location.search)
      const pendingId = params.get('notificationId')
      const notificationOpen = params.get('notificationOpen') === '1'
      let shouldCheckPending = notificationOpen

      try {
        if (sessionStorage.getItem('helfi:notification-open') === '1') {
          shouldCheckPending = true
        }
      } catch {
        // Ignore storage errors
      }

      if (pendingId) {
        storePendingNotificationId(pendingId)
      }

      if (shouldCheckPending) {
        fetch('/api/notifications/pending-open', { cache: 'no-store' as any })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (!data) return
            const url = typeof data?.url === 'string' ? data.url : ''
            const pending = typeof data?.id === 'string' ? data.id : ''
            if (pending) storePendingNotificationId(pending)
            if (!url) return
            const target = new URL(url, window.location.origin).href
            if (window.location.href === target) return
            window.location.href = target
          })
          .catch(() => {})
      }

      if (pendingId || notificationOpen) {
        params.delete('notificationId')
        params.delete('notificationOpen')
        const query = params.toString()
        const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`
        window.history.replaceState(null, '', nextUrl)
      }

      if (shouldCheckPending) {
        try {
          sessionStorage.removeItem('helfi:notification-open')
        } catch {
          // Ignore storage errors
        }
      }
    } catch {
      // Ignore URL errors
    }
  })

  // Show sidebar only if:
  // 1. User is authenticated (status === 'authenticated') AND
  // 2. Current page is not in publicPages list AND
  // 3. Current page is not an admin panel path
  const shouldShowSidebar =
    status === 'authenticated' &&
    !isAdminPanelPath &&
    (!isPublicPage || isOnboardingPath)

  const handleSidebarNavigate = useCallback(
    (href: string, e: SidebarNavigateEvent) => {
      try {
        e.preventDefault()
      } catch {}
      if (typeof href !== 'string' || !href) return
      const now = Date.now()
      if (now - sidebarNavLockRef.current < 350) return
      sidebarNavLockRef.current = now

      // Health Setup / Onboarding: if there are unsaved changes, ask the user once
      // before leaving the section (the onboarding page owns the popup).
      if (isOnboardingPath) {
        try {
          const hasUnsaved =
            !!(window as any).__helfiOnboardingPhysicalHasUnsavedChanges ||
            !!(window as any).__helfiOnboardingHasUnsavedChanges
          const autoUpdateFlag = (window as any).__helfiOnboardingAutoUpdateOnExit
          const allowBackgroundExit = autoUpdateFlag !== false
          if (hasUnsaved) {
            if (!allowBackgroundExit) {
              window.postMessage({ type: 'OPEN_ONBOARDING_UPDATE_POPUP', navigateTo: href }, '*')
              return
            }
          }
        } catch {
          // fall through
        }
      }

      try {
        router.push(href)
      } catch {
        window.location.assign(href)
      }
    },
    [isOnboardingPath, router]
  )

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!shouldShowSidebar || !isOnboardingPath) return
    if ((window as any).__helfiOnboardingSidebarOverride) return

    const handler = (event: Event) => {
      const target = event.target as Element | null
      if (!target) return
      const sidebar = document.querySelector('[data-helfi-sidebar="true"]') as HTMLElement | null
      if (!sidebar || !sidebar.contains(target)) return
      const anchor = (target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href) return
      try {
        event.preventDefault()
      } catch {}
      try {
        ;(event as Event).stopPropagation?.()
      } catch {}
      handleSidebarNavigate(href, event)
    }

    document.addEventListener('pointerdown', handler, true)
    document.addEventListener('mousedown', handler, true)
    document.addEventListener('click', handler, true)
    return () => {
      document.removeEventListener('pointerdown', handler, true)
      document.removeEventListener('mousedown', handler, true)
      document.removeEventListener('click', handler, true)
    }
  }, [shouldShowSidebar, isOnboardingPath, handleSidebarNavigate])

  // Don't show sidebar while session is loading to prevent flickering
  if (status === 'loading') {
    return (
      <div className="min-h-screen">
        {children}
      </div>
    )
  }
  
  // Check if authenticated user needs email verification
  if (status === 'authenticated' && session?.user?.needsVerification && !isPublicPage && !isAdminPanelPath) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-helfi-green-light/10 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="mb-4">
            <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Email Verification Required</h2>
          <p className="text-gray-600 mb-4">
            Please check your email for a verification link. You must verify your email address before accessing your account.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-blue-700 text-sm">
              📧 Verification email sent to: <strong>{session?.user?.email}</strong>
            </p>
          </div>
          <div className="space-y-3">
            <button
              onClick={async () => {
                try {
                  const response = await fetch('/api/auth/resend-verification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: session?.user?.email })
                  })
                  
                  if (response.ok) {
                    alert('✅ Verification email sent! Please check your inbox.')
                  } else {
                    const error = await response.json()
                    alert(`❌ Failed to send email: ${error.error}`)
                  }
                } catch (error) {
                  alert('❌ Failed to send verification email. Please try again.')
                }
              }}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              📧 Resend Verification Email
            </button>
            <button
              onClick={() => window.location.href = '/auth/signin'}
              className="w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    )
  }
  
  if (status === 'unauthenticated' && !isPublicPage && !isAdminPanelPath) {
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/signin'
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Redirecting...</p>
        </div>
      </div>
    )
  }
  
  if (shouldShowSidebar) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        {/* Desktop Sidebar - Only for authenticated users on app pages */}
        {sidebarPortal
          ? createPortal(
              <DesktopSidebar pathname={pathname} onNavigate={handleSidebarNavigate} />,
              sidebarPortal
            )
          : null}
        
        {/* Main Content */}
        <div
          className={`md:pl-64 flex flex-col flex-1 relative ${
            isChatPage ? 'overflow-hidden h-[100dvh]' : 'overflow-y-auto'
          }`}
        >
          {goalSyncNotice && (
            <div className="fixed top-4 right-4 z-50 max-w-xs w-full mx-4 md:mx-0">
              <div className="bg-white border border-emerald-200 shadow-lg rounded-lg p-3">
                <div className="text-sm font-semibold text-gray-900">Goal updated</div>
                <div className="text-xs text-gray-600 mt-1">{goalSyncNotice}</div>
              </div>
            </div>
          )}
          {showHealthSetupReminder && (
            <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full mx-4 md:mx-0">
              <div className="bg-white border border-helfi-green/30 shadow-xl rounded-lg p-4">
                <h2 className="text-sm font-semibold text-helfi-black dark:text-white mb-1">
                  Complete your Health Setup for accurate insights
                </h2>
                <p className="text-xs text-gray-600 mb-3">
                  Helfi can only give you precise health guidance when your Health Setup is finished.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHealthSetupReminder(false)
                      router.push('/onboarding?step=1')
                    }}
                    className="flex-1 bg-helfi-green text-white text-sm px-3 py-2 rounded-md hover:bg-helfi-green-dark transition-colors"
                  >
                    Complete Health Setup
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowHealthSetupReminder(false)
                      try {
                        await fetch('/api/health-setup-status', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ disableReminder: true }),
                        })
                      } catch {
                        // Non-blocking; if this fails we may remind again in a future session
                      }
                    }}
                    className="flex-1 bg-gray-100 text-gray-700 text-sm px-3 py-2 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    Don&apos;t ask me again
                  </button>
                </div>
              </div>
            </div>
          )}
          {children}
          <SupportChatWidget />
          <WeeklyReportReadyModal />
        </div>
      </div>
    )
  }

  // Public pages or unauthenticated users - no sidebar
  const showBackToTop = status !== 'authenticated'
  return (
    <div className="min-h-screen">
      {children}
      <SupportChatWidget />
      {showBackToTop && <BackToTopButton />}
    </div>
  )
} 
