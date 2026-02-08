import React, { createContext, useContext, useMemo, useState } from 'react'

export type AppMode = 'signedOut' | 'signedIn'

type AppModeContextValue = {
  mode: AppMode
  setMode: (mode: AppMode) => void
}

const AppModeContext = createContext<AppModeContextValue | null>(null)

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AppMode>('signedOut')
  const value = useMemo(() => ({ mode, setMode }), [mode])
  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
}

export function useAppMode() {
  const ctx = useContext(AppModeContext)
  if (!ctx) {
    throw new Error('useAppMode must be used inside <AppModeProvider>')
  }
  return ctx
}
