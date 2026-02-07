import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { API_BASE_URL } from '../config'
import { clearSessionToken, getSessionToken } from '../auth/session'

export type AppMode = 'signedOut' | 'signedIn' | 'demo'

type AppModeContextValue = {
  mode: AppMode
  setMode: (mode: AppMode) => void
  userEmail: string | null
  setUserEmail: (email: string | null) => void
}

const AppModeContext = createContext<AppModeContextValue | null>(null)

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AppMode>('signedOut')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const value = useMemo(() => ({ mode, setMode, userEmail, setUserEmail }), [mode, userEmail])

  useEffect(() => {
    // On app start, try to restore an existing session token so the user stays logged in.
    ;(async () => {
      const token = await getSessionToken()
      if (!token) return

      // Validate token with the backend. If it's expired/invalid, clear it so we don't get stuck.
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/native/me`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          await clearSessionToken()
          setMode('signedOut')
          return
        }
        const data = await res.json().catch(() => ({}))
        if (data?.user?.email) {
          setUserEmail(String(data.user.email))
        }
        setMode('signedIn')
      } catch {
        // If offline, keep the token and stay signed out for now.
        // (We can improve this later with a friendlier offline experience.)
      }
    })()
  }, [])

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
}

export function useAppMode() {
  const ctx = useContext(AppModeContext)
  if (!ctx) {
    throw new Error('useAppMode must be used inside <AppModeProvider>')
  }
  return ctx
}
