'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { useEffect } from 'react'

function SessionKeepAlive() {
  const { status } = useSession()

  useEffect(() => {
    if (status === 'loading') return

    const pingSession = async () => {
      try {
        await fetch('/api/auth/session', { cache: 'no-store' })
      } catch (error) {
        console.warn('Session heartbeat failed', error)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        pingSession()
      }
    }

    // Keep session warm while the app is open
    const interval = window.setInterval(pingSession, 5 * 60 * 1000) // every 5 minutes
    document.addEventListener('visibilitychange', handleVisibility)
    pingSession()

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
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
