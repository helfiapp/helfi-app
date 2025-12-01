'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { useEffect } from 'react'

function SessionKeepAlive() {
  const { status } = useSession()

  useEffect(() => {
    if (status === 'loading') return
    let isActive = true
    let restoreInFlight = false

    const REMEMBER_FLAG = 'helfi:rememberMe'
    const REMEMBER_EMAIL = 'helfi:rememberEmail'
    const REFRESH_TOKEN = 'helfi:refreshToken'
    const LEGACY_REMEMBER_TOKEN = 'helfi:rememberToken'
    const REMEMBER_TOKEN_EXP = 'helfi:rememberTokenExp'
    const LAST_MANUAL_SIGNOUT = 'helfi:lastManualSignOut'
    const LAST_SESSION_RESTORE = 'helfi:lastSessionRestore'

    const sendSwMessage = (message: any) => {
      try {
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage(message)
        } else if (navigator.serviceWorker?.ready) {
          navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage(message)).catch(() => {})
        }
      } catch {
        // ignore messaging failures
      }
    }

    const markManualSignOut = () => {
      try {
        localStorage.setItem(LAST_MANUAL_SIGNOUT, Date.now().toString())
        localStorage.removeItem(REMEMBER_FLAG)
        localStorage.removeItem(REMEMBER_EMAIL)
        localStorage.removeItem(REFRESH_TOKEN)
        localStorage.removeItem(LEGACY_REMEMBER_TOKEN)
        localStorage.removeItem(REMEMBER_TOKEN_EXP)
        sendSwMessage({ type: 'CLEAR_REFRESH_TOKEN' })
      } catch {
        // ignore storage issues
      }
    }

    // Patch fetch once so any NextAuth signOut call clears the remember-me flag before redirecting.
    if (typeof window !== 'undefined' && !(window as any).__helfiSignOutPatched) {
      const originalFetch = window.fetch.bind(window)
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : ''
        if (url.includes('/api/auth/signout')) {
          markManualSignOut()
        }
        return originalFetch(input as any, init)
      }
      ;(window as any).__helfiSignOutPatched = true
    }

    const readRememberState = () => {
      try {
        return {
          remembered: localStorage.getItem(REMEMBER_FLAG) === '1',
          email: localStorage.getItem(REMEMBER_EMAIL) || '',
          token: localStorage.getItem(REFRESH_TOKEN) || localStorage.getItem(LEGACY_REMEMBER_TOKEN) || '',
          tokenExp: parseInt(localStorage.getItem(REMEMBER_TOKEN_EXP) || '0', 10),
          manualSignOutAt: parseInt(localStorage.getItem(LAST_MANUAL_SIGNOUT) || '0', 10),
          lastRestoreAt: parseInt(localStorage.getItem(LAST_SESSION_RESTORE) || '0', 10),
        }
      } catch {
        return { remembered: false, email: '', token: '', tokenExp: 0, manualSignOutAt: 0, lastRestoreAt: 0 }
      }
    }

    const shouldRespectManualSignOut = (manualSignOutAt: number) => {
      if (!manualSignOutAt) return false
      const FIVE_MINUTES = 5 * 60 * 1000
      return Date.now() - manualSignOutAt < FIVE_MINUTES
    }

    const ensureSession = async (_reason: string) => {
      if (!isActive) return

      let sessionRes: Response | null = null
      try {
        sessionRes = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' })
      } catch (error) {
        console.warn('Session heartbeat failed', error)
        return
      }

      const sessionData = await sessionRes.json().catch(() => null)
      const hasSession = sessionRes.ok && sessionData?.user
      const { remembered, email, token, tokenExp, manualSignOutAt, lastRestoreAt } = readRememberState()
      const now = Date.now()

      if (hasSession) {
        // Keep the remembered email in sync so we can reissue a cookie later if iOS drops it.
        try {
          if (!remembered) {
            localStorage.setItem(REMEMBER_FLAG, '1')
          }
          if (!email && sessionData?.user?.email) {
            localStorage.setItem(REMEMBER_EMAIL, sessionData.user.email.toLowerCase())
          }
        } catch {
          // ignore storage errors
        }
        return
      }

      if (!remembered || !email) return
      if (restoreInFlight) return
      if (shouldRespectManualSignOut(manualSignOutAt)) return

      if (now - lastRestoreAt < 15_000) return // throttle re-issue attempts

      restoreInFlight = true
      try {
        sendSwMessage({ type: 'REFRESH_SESSION_NOW' })
        localStorage.setItem(LAST_SESSION_RESTORE, now.toString())
        localStorage.removeItem(LAST_MANUAL_SIGNOUT)
      } catch (error) {
        console.warn('Session restore failed', error)
      } finally {
        restoreInFlight = false
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        ensureSession('visibility')
      }
    }

    const handleFocus = () => ensureSession('focus')
    const handlePageShow = () => ensureSession('pageshow')

    // Keep session warm while the app is open and re-issue a cookie if iOS evicts it on resume.
    const interval = window.setInterval(() => ensureSession('interval'), 5 * 60 * 1000) // every 5 minutes
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageShow)
    ensureSession('init')

    return () => {
      isActive = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [status])

  return null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      // Avoid surprise logouts when the app is backgrounded on mobile.
      // Keep a cached session for an hour and refresh periodically in the background
      // instead of refetching on every focus change.
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
      refetchInterval={15 * 60} // Light heartbeat to keep tokens fresh without spamming
    >
      <SessionKeepAlive />
      {children}
    </SessionProvider>
  )
}
