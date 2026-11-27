import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getCurrentNativeAuthSession, setCurrentNativeAuthSession } from '../lib/nativeAuthSession'

export type AppMode = 'signedOut' | 'signedIn'

export type NativeAuthUser = {
  id: string
  email: string
  name?: string | null
  image?: string | null
  isPractitioner?: boolean
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
  refreshProfile: (identity: NonNullable<ReturnType<typeof getCurrentNativeAuthSession>>, user: NativeAuthUser) => Promise<boolean>
}

const AppModeContext = createContext<AppModeContextValue | null>(null)

const AUTH_SESSION_KEY = 'helfi_auth_session_v1'
const REMEMBER_ME_HOURS = 24
const KEEP_ON_SIGN_OUT_KEYS = new Set(['helfi_has_seen_splash_v1'])

type StoredAuthSession = {
  mode: AppMode
  expiresAt: number
  token: string
  user: NativeAuthUser
}

async function clearStoredAccountData() {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const accountKeys = keys.filter((key) => {
      if (key === AUTH_SESSION_KEY || KEEP_ON_SIGN_OUT_KEYS.has(key)) return false
      return (
        key.startsWith('helfi_') ||
        key.startsWith('helfi:') ||
        key.startsWith('quietHours') ||
        key === 'profileVisibility' ||
        key === 'dataAnalytics'
      )
    })
    if (accountKeys.length) {
      await AsyncStorage.multiRemove(accountKeys)
    }
  } catch {
    // Best effort only. The auth session still clears below.
  }
}

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [mode, setMode] = useState<AppMode>('signedOut')
  const [session, setSession] = useState<NativeAuthSession | null>(null)
  const authRevision = useRef(0)
  const displaySession = useRef<NativeAuthSession | null>(null)
  const storageQueue = useRef(Promise.resolve())
  const queueStorage = (operation: () => Promise<void>) => {
    const pending = storageQueue.current.then(operation, operation)
    storageQueue.current = pending.catch(() => {})
    return pending
  }

  useEffect(() => {
    let cancelled = false
    const revision = authRevision.current

    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_SESSION_KEY)
        if (cancelled || revision !== authRevision.current) return
        if (!raw) return

        const stored = JSON.parse(raw) as StoredAuthSession
        if (stored?.mode !== 'signedIn') return
        if (typeof stored.expiresAt !== 'number') return
        if (typeof stored.token !== 'string' || !stored.token) return
        if (!stored.user?.id || !stored.user?.email) return

        if (Date.now() > stored.expiresAt) {
          await queueStorage(async () => {
            if (cancelled || revision !== authRevision.current) return
            await AsyncStorage.removeItem(AUTH_SESSION_KEY)
            await clearStoredAccountData()
          })
          return
        }

        if (!cancelled && revision === authRevision.current) {
          displaySession.current = stored
          setCurrentNativeAuthSession(stored)
          setMode('signedIn')
          setSession({ token: stored.token, expiresAt: stored.expiresAt, user: stored.user })
        }
      } catch {
        if (cancelled || revision !== authRevision.current) return
        // If storage is corrupted, just fall back to signed out.
        try {
          await queueStorage(async () => {
            if (cancelled || revision !== authRevision.current) return
            await AsyncStorage.removeItem(AUTH_SESSION_KEY)
            await clearStoredAccountData()
          })
        } catch {}
      }
    }

    hydrate().finally(() => {
      if (!cancelled) setHydrated(true)
    })

    return () => {
      cancelled = true
      setCurrentNativeAuthSession(null)
    }
  }, [])

  const signIn = async ({ rememberMe, session }: { rememberMe: boolean; session: NativeAuthSession }) => {
    const revision = ++authRevision.current
    setCurrentNativeAuthSession(null)
    await clearStoredAccountData()
    if (revision !== authRevision.current) return

    displaySession.current = session
    setCurrentNativeAuthSession(session)
    setMode('signedIn')
    setSession(session)

    if (!rememberMe) {
      // User explicitly doesn't want persistence.
      try {
        await queueStorage(async () => { if (revision === authRevision.current) await AsyncStorage.removeItem(AUTH_SESSION_KEY) })
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
      await queueStorage(async () => {
        if (revision === authRevision.current) await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(stored))
      })
    } catch {
      // If write fails, user is still signed in for this run.
    }
  }

  const signOut = async () => {
    authRevision.current++
    setCurrentNativeAuthSession(null)
    displaySession.current = null
    setMode('signedOut')
    setSession(null)
    try {
      await queueStorage(async () => {
        await AsyncStorage.removeItem(AUTH_SESSION_KEY)
        await clearStoredAccountData()
      })
    } catch {}
  }

  const refreshProfile: AppModeContextValue['refreshProfile'] = async (identity, user) => {
    if (getCurrentNativeAuthSession() !== identity || user.id !== identity.user.id || user.email !== displaySession.current?.user.email) return false
    // Display updates keep the existing authentication identity and remember-me deadline.
    const current = displaySession.current!
    displaySession.current = { ...current, user: { ...current.user, name: user.name, image: user.image } }
    setSession(displaySession.current)
    try {
      await queueStorage(async () => {
        const raw = await AsyncStorage.getItem(AUTH_SESSION_KEY)
        if (!raw || getCurrentNativeAuthSession() !== identity) return
        const stored = JSON.parse(raw) as StoredAuthSession
        if (stored.token !== identity.token || stored.user.id !== user.id || stored.user.email !== user.email) return
        await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
          ...stored, user: { ...stored.user, name: user.name, image: user.image },
        }))
      })
    } catch {
      // The current-run display remains valid when the optional remembered cache fails.
    }
    return getCurrentNativeAuthSession() === identity
  }

  const value = useMemo(() => ({ hydrated, mode, session, signIn, signOut, refreshProfile }), [hydrated, mode, session])
  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
}

export function useAppMode() {
  const ctx = useContext(AppModeContext)
  if (!ctx) {
    throw new Error('useAppMode must be used inside <AppModeProvider>')
  }
  return ctx
}
