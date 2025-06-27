'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

interface UserData {
  profileImage?: string
  todaysFoods?: any[]
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

  // Default avatar
  const defaultAvatar = 'data:image/svg+xml;base64,' + btoa(`
    <svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="64" fill="#10B981"/>
      <circle cx="64" cy="48" r="20" fill="white"/>
      <path d="M64 76c-13.33 0-24 5.34-24 12v16c0 8.84 7.16 16 16 16h16c8.84 0 16-7.16 16-16V88c0-6.66-10.67-12-24-12z" fill="white"/>
    </svg>
  `);

  const profileImage = userData?.profileImage || session?.user?.image || defaultAvatar

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