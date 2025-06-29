'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { useUserData } from '@/components/providers/UserDataProvider'

// Global dark mode function type
declare global {
  interface Window {
    toggleDarkMode: (enabled: boolean) => void;
  }
}

export default function Settings() {
  const { data: session } = useSession()
  const { userData, profileImage } = useUserData()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  
  // Settings states with automatic saving
  const [darkMode, setDarkMode] = useState(false)
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(false)
  const [profileVisibility, setProfileVisibility] = useState('private')
  const [dataAnalytics, setDataAnalytics] = useState(true)
  
  // iOS detection for push notifications
  const [isIOS, setIsIOS] = useState(false)

  // Initialize settings from localStorage
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode')
    const savedEmailNotifications = localStorage.getItem('emailNotifications')
    const savedPushNotifications = localStorage.getItem('pushNotifications')
    const savedProfileVisibility = localStorage.getItem('profileVisibility')
    const savedDataAnalytics = localStorage.getItem('dataAnalytics')
    
    if (savedDarkMode) setDarkMode(savedDarkMode === 'true')
    if (savedEmailNotifications) setEmailNotifications(savedEmailNotifications === 'true')
    if (savedPushNotifications) setPushNotifications(savedPushNotifications === 'true')
    if (savedProfileVisibility) setProfileVisibility(savedProfileVisibility)
    if (savedDataAnalytics) setDataAnalytics(savedDataAnalytics === 'true')
    
    // Detect iOS devices
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(isIOSDevice)
    
    // Listen for dark mode changes from other sources
    const handleDarkModeChange = (e: CustomEvent) => {
      setDarkMode(e.detail)
    }
    
    window.addEventListener('darkModeChanged', handleDarkModeChange as EventListener)
    return () => window.removeEventListener('darkModeChanged', handleDarkModeChange as EventListener)
  }, [])

  // Auto-save dark mode changes
  useEffect(() => {
    localStorage.setItem('darkMode', darkMode.toString())
    if (window.toggleDarkMode) {
      window.toggleDarkMode(darkMode)
    }
  }, [darkMode])

  // Auto-save email notifications
  useEffect(() => {
    localStorage.setItem('emailNotifications', emailNotifications.toString())
    // TODO: Send to backend API to update user preferences
  }, [emailNotifications])

  // Auto-save push notifications
  useEffect(() => {
    localStorage.setItem('pushNotifications', pushNotifications.toString())
    // TODO: Send to backend API to update user preferences
  }, [pushNotifications])

  // Auto-save profile visibility
  useEffect(() => {
    localStorage.setItem('profileVisibility', profileVisibility)
    // TODO: Send to backend API to update user preferences
  }, [profileVisibility])

  // Auto-save data analytics with comprehensive tracking
  useEffect(() => {
    localStorage.setItem('dataAnalytics', dataAnalytics.toString())
    
    // Track analytics events if user has opted in
    if (dataAnalytics && session?.user?.email) {
      const analyticsEvent = {
        userId: session.user.email,
        action: 'settings_page_interaction',
        timestamp: new Date().toISOString(),
        page: '/settings',
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        settings: {
          darkMode,
          emailNotifications,
          pushNotifications,
          profileVisibility,
          dataAnalytics
        },
        deviceInfo: {
          platform: navigator.platform,
          language: navigator.language,
          cookieEnabled: navigator.cookieEnabled
        }
      }
      
      // Send to analytics API
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analyticsEvent)
      }).catch(err => console.log('📊 Analytics tracking error:', err))
    }
  }, [dataAnalytics, session, darkMode, emailNotifications, pushNotifications, profileVisibility])

  // Track individual setting changes
  const trackSettingChange = (settingName: string, newValue: any) => {
    if (dataAnalytics && session?.user?.email) {
      const changeEvent = {
        userId: session.user.email,
        action: `setting_changed_${settingName}`,
        timestamp: new Date().toISOString(),
        page: '/settings',
        data: {
          setting: settingName,
          newValue,
          previousValue: settingName === 'darkMode' ? !newValue : 
                        settingName === 'emailNotifications' ? !newValue :
                        settingName === 'pushNotifications' ? !newValue :
                        settingName === 'dataAnalytics' ? !newValue : 'unknown'
        }
      }
      
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changeEvent)
      }).catch(err => console.log('📊 Setting change tracking error:', err))
    }
  }

  // Handle push notifications toggle with iOS detection
  const handlePushNotificationToggle = (enabled: boolean) => {
    if (isIOS && enabled) {
      alert('Push notifications are not available on iOS Safari. This is an Apple limitation to encourage native app downloads. Push notifications work great on Android and desktop browsers!')
      return
    }
    
    setPushNotifications(enabled)
    
    // Request actual push notification permission for non-iOS devices
    if (enabled && !isIOS && 'Notification' in window) {
      Notification.requestPermission().then(permission => {
        if (permission !== 'granted') {
          setPushNotifications(false)
          alert('Push notifications were denied. Please enable them in your browser settings.')
        }
      })
    }
  }

  // Profile data - using consistent green avatar from UserDataProvider
  const defaultAvatar = 'data:image/svg+xml;base64,' + btoa(`
    <svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="64" fill="#10B981"/>
      <circle cx="64" cy="48" r="20" fill="white"/>
      <path d="M64 76c-13.33 0-24 5.34-24 12v16c0 8.84 7.16 16 16 16h16c8.84 0 16-7.16 16-16V88c0-6.66-10.67-12-24-12z" fill="white"/>
    </svg>
  `);
  const userImage = profileImage || session?.user?.image || defaultAvatar;
  const userName = session?.user?.name || 'User';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [dropdownOpen]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation Header */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo on the left */}
          <div className="flex items-center">
            <Link href="/" className="w-16 h-16 md:w-20 md:h-20 cursor-pointer hover:opacity-80 transition-opacity">
              <Image
                src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
                alt="Helfi Logo"
                width={80}
                height={80}
                className="w-full h-full object-contain"
                priority
              />
            </Link>
          </div>
          
          {/* Profile Avatar & Dropdown on the right */}
          <div className="relative dropdown-container" id="profile-dropdown">
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="focus:outline-none"
              aria-label="Open profile menu"
            >
              <Image
                src={userImage}
                alt="Profile"
                width={48}
                height={48}
                className="w-12 h-12 rounded-full border-2 border-helfi-green shadow-sm object-cover"
              />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-lg py-2 z-50 border border-gray-100 dark:border-gray-700 animate-fade-in">
                <div className="flex items-center px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <Image
                    src={userImage}
                    alt="Profile"
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover mr-3"
                  />
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">{userName}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{session?.user?.email || 'user@email.com'}</div>
                  </div>
                </div>
                <Link href="/profile" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Profile</Link>
                <Link href="/account" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Account Settings</Link>
                <Link href="/profile/image" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Upload/Change Profile Photo</Link>
                <Link href="/billing" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Subscription & Billing</Link>
                <Link href="/notifications" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Notifications</Link>
                <Link href="/privacy" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Privacy Settings</Link>
                <Link href="/help" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Help & Support</Link>
                <button
                  onClick={() => signOut()}
                  className="block w-full text-left px-4 py-2 text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Second Row - Page Title Centered */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">Manage your app preferences</p>
        </div>
      </div>

      {/* Main Content - Fixed bottom padding for mobile navigation */}
      <div className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="space-y-6">
          {/* General Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">General Settings</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">Dark Mode</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Switch to dark theme</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={darkMode}
                                          onChange={(e) => {
                        setDarkMode(e.target.checked)
                        trackSettingChange('darkMode', e.target.checked)
                      }}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">Email Notifications</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Receive updates via email</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={emailNotifications}
                                            onChange={(e) => {
                          setEmailNotifications(e.target.checked)
                          trackSettingChange('emailNotifications', e.target.checked)
                        }}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">Push Notifications</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {isIOS 
                      ? 'Not available on iOS Safari (Apple limitation)' 
                      : 'Get push notifications on your device'
                    }
                  </p>
                </div>
                <label className={`relative inline-flex items-center ${isIOS ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={pushNotifications}
                    disabled={isIOS}
                    onChange={(e) => handlePushNotificationToggle(e.target.checked)}
                  />
                  <div className={`w-11 h-6 ${isIOS ? 'bg-gray-100 dark:bg-gray-600' : 'bg-gray-200'} peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${isIOS ? '' : 'peer-checked:bg-helfi-green'} ${isIOS ? 'opacity-50' : ''}`}></div>
                </label>
              </div>
            </div>
          </div>

          {/* Privacy Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Privacy Settings</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">Profile Visibility</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Make your profile visible to others</p>
                </div>
                <select 
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  value={profileVisibility}
                  onChange={(e) => {
                    setProfileVisibility(e.target.value)
                    trackSettingChange('profileVisibility', e.target.value)
                  }}
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                  <option value="friends">Friends Only</option>
                </select>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">Data Analytics</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Help us improve by sharing anonymous usage data</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={dataAnalytics}
                    onChange={(e) => {
                      setDataAnalytics(e.target.checked)
                      trackSettingChange('dataAnalytics', e.target.checked)
                    }}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Account Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Account Actions</h2>
            
            <div className="space-y-4">
              <Link href="/account" className="flex items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-helfi-green transition-colors">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-white">Account Settings</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Manage your account information</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              
              <Link href="/billing" className="flex items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-helfi-green transition-colors">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-white">Subscription & Billing</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Manage your subscription</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              
              <Link href="/help" className="flex items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-helfi-green transition-colors">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-white">Help & Support</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Get help and contact support</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>


        </div>
      </div>

      {/* Mobile Bottom Navigation - Inspired by Google, Facebook, Amazon mobile apps */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          
          {/* Dashboard */}
          <Link href="/dashboard" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Dashboard</span>
          </Link>

          {/* Insights */}
          <Link href="/insights" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Insights</span>
          </Link>

          {/* Food */}
          <Link href="/food" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Food</span>
          </Link>

          {/* Intake (Onboarding) */}
          <Link href="/onboarding?step=1" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Intake</span>
          </Link>

          {/* Settings (Active) */}
          <Link href="/settings" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-helfi-green">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-xs text-helfi-green mt-1 font-bold truncate">Settings</span>
          </Link>

        </div>
      </nav>
    </div>
  )
} 