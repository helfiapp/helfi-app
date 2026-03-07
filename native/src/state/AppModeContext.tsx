import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type AppMode = 'signedOut' | 'signedIn'

export type NativeAuthUser = {
  id: string
  email: string
  name?: string | null
  image?: string | null
}

export type NativeAuthSession = {
  token: string
  // Milliseconds since epoch.
  expiresAt: number
  user: NativeAuthUser
}

type AppModeContextValue = {
  hydrated: boolean
  mode: AppMode
  session: NativeAuthSession | null
  signIn: (opts: { rememberMe: boolean; session: NativeAuthSession }) => Promise<void>
  signOut: () => Promise<void>
}

const AppModeContext = createContext<AppModeContextValue | null>(null)

const AUTH_SESSION_KEY = 'helfi_auth_session_v1'
const REMEMBER_ME_HOURS = 24

type StoredAuthSession = {
  mode: AppMode
  expiresAt: number
  token: string
  user: NativeAuthUser
}

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [mode, setMode] = useState<AppMode>('signedOut')
  const [session, setSession] = useState<NativeAuthSession | null>(null)

  useEffect(() => {
    let cancelled = false

    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_SESSION_KEY)
        if (!raw) return

        const stored = JSON.parse(raw) as StoredAuthSession
        if (stored?.mode !== 'signedIn') return
        if (typeof stored.expiresAt !== 'number') return
        if (typeof stored.token !== 'string' || !stored.token) return
        if (!stored.user?.id || !stored.user?.email) return

        if (Date.now() > stored.expiresAt) {
          await AsyncStorage.removeItem(AUTH_SESSION_KEY)
          return
        }

        if (!cancelled) {
          setMode('signedIn')
          setSession({ token: stored.token, expiresAt: stored.expiresAt, user: stored.user })
        }
      } catch {
        // If storage is corrupted, just fall back to signed out.
        try {
          await AsyncStorage.removeItem(AUTH_SESSION_KEY)
        } catch {}
      }
    }

    hydrate().finally(() => {
      if (!cancelled) setHydrated(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const signIn = async ({ rememberMe, session }: { rememberMe: boolean; session: NativeAuthSession }) => {
    setMode('signedIn')
    setSession(session)

    if (!rememberMe) {
      // User explicitly doesn't want persistence.
      try {
        await AsyncStorage.removeItem(AUTH_SESSION_KEY)
      } catch {}
      return
    }

    const expiresAt = Date.now() + REMEMBER_ME_HOURS * 60 * 60 * 1000
    const stored: StoredAuthSession = {
      mode: 'signedIn',
      // Respect our "remember me" window, even if the server token lasts longer.
      expiresAt: Math.min(expiresAt, session.expiresAt),
      token: session.token,
      user: session.user,
    }
    try {
      await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(stored))
    } catch {
      // If write fails, user is still signed in for this run.
    }
  }

  const signOut = async () => {
    setMode('signedOut')
    setSession(null)
    try {
      await AsyncStorage.removeItem(AUTH_SESSION_KEY)
    } catch {}
  }

  const value = useMemo(() => ({ hydrated, mode, session, signIn, signOut }), [hydrated, mode, session])
  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
}

export function useAppMode() {
  const ctx = useContext(AppModeContext)
  if (!ctx) {
    throw new Error('useAppMode must be used inside <AppModeProvider>')
  }
  return ctx
}
