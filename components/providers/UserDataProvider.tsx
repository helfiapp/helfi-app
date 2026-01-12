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
  updateUserData: (newData: Partial<UserData>) => void
  updateProfileImage: (image: string) => void
  refreshData: () => Promise<void>
}

const UserDataContext = createContext<UserDataContextType | undefined>(undefined)

const USER_DATA_CACHE_TTL_MS = 5 * 60_000

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const lastLocalUpdateRef = useRef(0)

  // Profile image is either the saved Cloudinary image or the auth provider image.
  // We intentionally do NOT provide a graphic default here so UI components can
  // render a professional icon fallback when no real image exists.
  const profileImage = userData?.profileImage || (session?.user?.image ?? '')

  const userEmail = session?.user?.email || ''
  const cacheKey = useMemo(() => (userEmail ? `user-data:${userEmail}` : ''), [userEmail])

  // Load data once and cache it
  const loadData = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!session) return
    const requestStartedAt = Date.now()

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
            const localUpdatedAfterRequest = lastLocalUpdateRef.current > requestStartedAt
            if (localUpdatedAfterRequest) {
              setUserData(prev => {
                const next = prev ? { ...result.data, ...prev } : result.data
                if (cacheKey) {
                  writeClientCache(cacheKey, next)
                }
                return next
              })
            } else {
              setUserData(result.data)
              if (cacheKey) {
                writeClientCache(cacheKey, result.data)
              }
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
  const updateUserData = (newData: Partial<UserData>) => {
    lastLocalUpdateRef.current = Date.now()
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
    lastLocalUpdateRef.current = Date.now()
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
