'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

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

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Profile image is either the saved Cloudinary image or the auth provider image.
  // We intentionally do NOT provide a graphic default here so UI components can
  // render a professional icon fallback when no real image exists.
  const profileImage = userData?.profileImage || (session?.user?.image ?? '')

  // Load data once and cache it
  const loadData = async () => {
    if (!session) return

    try {
      console.log('🚀 UserDataProvider: Loading user data...')
      const startTime = Date.now()
      
      const response = await fetch('/api/user-data', {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
      
      if (response.ok) {
        const result = await response.json()
        console.log(`🚀 UserDataProvider: Data loaded in ${Date.now() - startTime}ms`)
        
        if (result.data) {
          setUserData(result.data)
        }
      }
    } catch (error) {
      console.error('UserDataProvider: Error loading data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Refresh data
  const refreshData = async () => {
    setIsLoading(true)
    await loadData()
  }

  // Update user data
  const updateUserData = (newData: Partial<UserData>) => {
    setUserData(prev => prev ? { ...prev, ...newData } : newData as UserData)
  }

  // Update profile image specifically
  const updateProfileImage = (image: string) => {
    setUserData(prev => prev ? { ...prev, profileImage: image } : { profileImage: image })
  }

  // Load data on mount and session change
  useEffect(() => {
    if (session) {
      loadData()
    } else {
      setUserData(null)
      setIsLoading(false)
    }
  }, [session])

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
