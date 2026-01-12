'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { clearClientCache, isCacheFresh, readClientCache, writeClientCache } from '@/lib/client-cache'
import { markAppHidden } from '@/lib/app-visibility'

interface UserData {
  profileImage?: string
  todaysFoods?: any[]
  favorites?: any[]
  profileInfo?: any
  healthGoals?: any
  gender?: string
  [key: string]: any
}

interface UserDataContextType {
  userData: UserData | null
  profileImage: string | null
  isLoading: boolean
  updateUserData: (newData: Partial<UserData>, options?: { trackLocal?: boolean }) => void
  updateProfileImage: (image: string) => void
  refreshData: () => Promise<void>
}

const UserDataContext = createContext<UserDataContextType | undefined>(undefined)

const USER_DATA_CACHE_TTL_MS = 5 * 60_000
const HEALTH_SETUP_GRACE_MS = 2 * 60_000
const LOCAL_OVERRIDE_GRACE_MS = 30 * 1000
const HEALTH_SETUP_KEYS = new Set([
  'goalChoice',
  'goalIntensity',
  'goalTargetWeightKg',
  'goalTargetWeightUnit',
  'goalPaceKgPerWeek',
  'goalCalorieTarget',
  'goalMacroSplit',
  'goalMacroMode',
  'goalFiberTarget',
  'goalSugarMax',
  'dietTypes',
  'dietType',
  'weight',
  'height',
  'birthdate',
  'bodyType',
  'exerciseFrequency',
  'exerciseTypes',
  'diabetesType',
  'allergies',
  'healthCheckSettings',
  'healthSetupUpdatedAt',
])

const valuesMatch = (a: any, b: any) => {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

const getHealthSetupVersion = (data: any) => {
  const raw = Number(data?.healthSetupUpdatedAt || 0)
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

const hasOwnKey = (value: any, key: string) =>
  value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const userDataRef = useRef<UserData | null>(null)
  const pendingLocalUpdatesRef = useRef<Record<string, number>>({})

  // Profile image is either the saved Cloudinary image or the auth provider image.
  // We intentionally do NOT provide a graphic default here so UI components can
  // render a professional icon fallback when no real image exists.
  const profileImage = userData?.profileImage || (session?.user?.image ?? '')

  const userEmail = session?.user?.email || ''
  const cacheKey = useMemo(() => (userEmail ? `user-data:${userEmail}` : ''), [userEmail])
  useEffect(() => {
    userDataRef.current = userData
  }, [userData])

  // Load data once and cache it
  const loadData = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!session) return
    const cached = cacheKey ? readClientCache<UserData>(cacheKey) : null
    const hadCached = !!cached?.data
    if (cached?.data) {
      setUserData(cached.data)
    }

    const fetchLatest = async () => {
      try {
        const response = await fetch('/api/user-data', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        })

        if (response.ok) {
          const result = await response.json()

          if (result.data) {
            try {
              const cachedGoal = String(cached?.data?.goalChoice || '').trim().toLowerCase()
              const freshGoal = String(result.data?.goalChoice || '').trim().toLowerCase()
              const cachedIntensity = String(cached?.data?.goalIntensity || '').trim().toLowerCase()
              const freshIntensity = String(result.data?.goalIntensity || '').trim().toLowerCase()
              const goalChanged = cachedGoal && freshGoal && cachedGoal !== freshGoal
              const intensityChanged = cachedIntensity && freshIntensity && cachedIntensity !== freshIntensity
              if (goalChanged || intensityChanged) {
                window.dispatchEvent(new CustomEvent('userData:goalSync', { detail: { goal: freshGoal } }))
              }
            } catch {
              // Ignore sync notice errors
            }
            const localSnapshot = userDataRef.current
            let merged = result.data
            if (localSnapshot) {
              const overrides: Record<string, any> = {}
              const now = Date.now()
              const localHealthVersion = getHealthSetupVersion(localSnapshot)
              const serverHealthVersion = getHealthSetupVersion(merged)
              const preferLocalHealth =
                localHealthVersion > 0 && (serverHealthVersion === 0 || localHealthVersion > serverHealthVersion)

              if (preferLocalHealth) {
                HEALTH_SETUP_KEYS.forEach((key) => {
                  if (!hasOwnKey(localSnapshot, key)) return
                  if (valuesMatch(localSnapshot[key], merged[key])) return
                  overrides[key] = localSnapshot[key]
                })
              }

              Object.entries(pendingLocalUpdatesRef.current).forEach(([key, touchedAt]) => {
                const grace = HEALTH_SETUP_KEYS.has(key) ? HEALTH_SETUP_GRACE_MS : LOCAL_OVERRIDE_GRACE_MS
                if (!touchedAt || now - touchedAt > grace) {
                  delete pendingLocalUpdatesRef.current[key]
                  return
                }
                if (!hasOwnKey(localSnapshot, key)) return
                if (valuesMatch(localSnapshot[key], merged[key])) {
                  delete pendingLocalUpdatesRef.current[key]
                  return
                }
                overrides[key] = localSnapshot[key]
              })
              if (Object.keys(overrides).length > 0) {
                merged = { ...merged, ...overrides }
              }
            }
            setUserData(merged)
            if (cacheKey) {
              writeClientCache(cacheKey, merged)
            }
          }
        }
      } catch (error) {
        console.error('UserDataProvider: Error loading data:', error)
      }
    }

    if (!force && cached && isCacheFresh(cached, USER_DATA_CACHE_TTL_MS)) {
      setIsLoading(false)
      // Keep data in sync across devices, even when the cache is fresh.
      void fetchLatest()
      return
    }

    if (!hadCached) {
      setIsLoading(true)
    }

    try {
      await fetchLatest()
    } finally {
      setIsLoading(false)
    }
  }, [cacheKey, session])

  // Refresh data
  const refreshData = useCallback(async () => {
    await loadData({ force: true })
  }, [loadData])

  // Update user data
  const updateUserData = (newData: Partial<UserData>, options?: { trackLocal?: boolean }) => {
    const trackLocal = options?.trackLocal !== false
    const now = Date.now()
    if (trackLocal) {
      Object.keys(newData || {}).forEach((key) => {
        pendingLocalUpdatesRef.current[key] = now
      })
    }
    setUserData(prev => {
      const next = prev ? { ...prev, ...newData } : (newData as UserData)
      if (cacheKey) {
        writeClientCache(cacheKey, next)
      }
      return next
    })
  }

  // Update profile image specifically
  const updateProfileImage = (image: string) => {
    const now = Date.now()
    pendingLocalUpdatesRef.current.profileImage = now
    setUserData(prev => {
      const next = prev ? { ...prev, profileImage: image } : ({ profileImage: image } as UserData)
      if (cacheKey) {
        writeClientCache(cacheKey, next)
      }
      return next
    })
  }

  // Load data on mount and session change
  useEffect(() => {
    if (status === 'loading') return
    if (session) {
      loadData()
    } else {
      setUserData(null)
      setIsLoading(false)
      clearClientCache('user-data:')
    }
  }, [session, status, loadData])

  // Keep data fresh when the user returns to the app or tab.
  useEffect(() => {
    if (!session) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const handleFocus = () => {
      refreshData()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markAppHidden()
        return
      }
      if (document.visibilityState === 'visible') {
        refreshData()
      }
    }
    const handlePageHide = () => {
      markAppHidden()
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [session, refreshData])

  // Allow other parts of the app to force a refresh (e.g., after insights updates)
  useEffect(() => {
    const handler = () => {
      refreshData()
    }
    window.addEventListener('userData:refresh', handler)
    return () => window.removeEventListener('userData:refresh', handler)
  }, [refreshData])

  const value: UserDataContextType = {
    userData,
    profileImage,
    isLoading,
    updateUserData,
    updateProfileImage,
    refreshData
  }

  return (
    <UserDataContext.Provider value={value}>
      {children}
    </UserDataContext.Provider>
  )
}

export function useUserData() {
  const context = useContext(UserDataContext)
  if (context === undefined) {
    throw new Error('useUserData must be used within a UserDataProvider')
  }
  return context
} 
