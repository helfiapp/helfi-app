'use client'

import { SessionProvider } from 'next-auth/react'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      // Avoid surprise logouts when the app is backgrounded on mobile.
      // Keep a cached session for an hour and refresh periodically in the background
      // instead of refetching on every focus change.
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
      clientMaxAge={60 * 60} // 1 hour cache window before we re-check the session
      refetchInterval={15 * 60} // Light heartbeat to keep tokens fresh without spamming
    >
      {children}
    </SessionProvider>
  )
}
