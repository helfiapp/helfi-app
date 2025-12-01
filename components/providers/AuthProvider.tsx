'use client'

import { SessionProvider } from 'next-auth/react'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      // Avoid surprise logouts when the app is backgrounded on mobile.
      // Let NextAuth handle session cookies; we just keep a light heartbeat.
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
      refetchInterval={15 * 60}
    >
      {children}
    </SessionProvider>
  )
}
