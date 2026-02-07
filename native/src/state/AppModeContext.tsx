import React, { createContext, useContext, useMemo, useState } from 'react'

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
  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
}

export function useAppMode() {
  const ctx = useContext(AppModeContext)
  if (!ctx) {
    throw new Error('useAppMode must be used inside <AppModeProvider>')
  }
  return ctx
}
