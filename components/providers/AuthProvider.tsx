'use client'

// Temporarily disabled NextAuth to fix authentication issues
// import { SessionProvider } from 'next-auth/react'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Temporarily return children directly without SessionProvider
  return <>{children}</>
  // return <SessionProvider>{children}</SessionProvider>
} 