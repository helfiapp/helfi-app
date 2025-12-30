'use client'
import { Cog6ToothIcon, UserIcon } from '@heroicons/react/24/outline'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { useUserData } from '@/components/providers/UserDataProvider'
import MobileMoreMenu from '@/components/MobileMoreMenu'

// Global dark mode function type
declare global {
  interface Window {
    toggleDarkMode: (enabled: boolean) => void;
  }
}

type InstallPlatform = 'ios' | 'android' | 'other'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const getInstallPlatform = (): InstallPlatform => {
  if (typeof window === 'undefined') return 'other'
  const ua = window.navigator.userAgent || ''
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  return 'other'
}

const isStandaloneMode = () => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
}

export default function Settings() {
  const { data: session } = useSession()
  const { userData, profileImage } = useUserData()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const pathname = usePathname()
  
  // Settings states with automatic saving
  const [darkMode, setDarkMode] = useState(false)
  const [profileVisibility, setProfileVisibility] = useState('private')
  const [dataAnalytics, setDataAnalytics] = useState(true)
  const [hapticsEnabled, setHapticsEnabled] = useState(true)
  const [isIOS, setIsIOS] = useState(false)
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>('other')
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installOutcome, setInstallOutcome] = useState<'accepted' | 'dismissed' | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  // Prevent "auto-save" effects from overwriting stored values on first load
  const [localPrefsLoaded, setLocalPrefsLoaded] = useState(false)
  const [showPdf, setShowPdf] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string>('')
  const [exporting, setExporting] = useState(false)

  // Initialize settings from localStorage
  useEffect(() => {
    try {
      const savedDarkMode = localStorage.getItem('darkMode')
      const savedProfileVisibility = localStorage.getItem('profileVisibility')
      const savedDataAnalytics = localStorage.getItem('dataAnalytics')
      const savedHaptics = localStorage.getItem('hapticsEnabled')

      if (savedDarkMode !== null) setDarkMode(savedDarkMode === 'true')
      if (savedProfileVisibility) setProfileVisibility(savedProfileVisibility)
      if (savedDataAnalytics !== null) setDataAnalytics(savedDataAnalytics === 'true')
      if (savedHaptics !== null) setHapticsEnabled(savedHaptics === 'true')
    } catch {
      // If storage is blocked/unavailable, keep defaults
    }

    const isIOSDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(isIOSDevice)

    // Listen for dark mode changes from other sources
    const handleDarkModeChange = (e: CustomEvent) => {
      setDarkMode(e.detail)
    }

    window.addEventListener('darkModeChanged', handleDarkModeChange as EventListener)
    // Mark local settings as loaded (enables auto-save effects without overwriting on first paint)
    setLocalPrefsLoaded(true)
    return () => window.removeEventListener('darkModeChanged', handleDarkModeChange as EventListener)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setInstallPlatform(getInstallPlatform())
    setIsStandalone(isStandaloneMode())

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallOutcome('accepted')
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      setInstallOutcome(choice.outcome === 'accepted' ? 'accepted' : 'dismissed')
    } catch {
      setInstallOutcome('dismissed')
    }
  }

  // Auto-save dark mode changes
  useEffect(() => {
    if (!localPrefsLoaded) return
    localStorage.setItem('darkMode', darkMode.toString())
    if (window.toggleDarkMode) {
      window.toggleDarkMode(darkMode)
    }
  }, [darkMode, localPrefsLoaded])

  // Auto-save haptics changes
  useEffect(() => {
    if (!localPrefsLoaded) return
    localStorage.setItem('hapticsEnabled', hapticsEnabled.toString())
  }, [hapticsEnabled, localPrefsLoaded])


  // Auto-save profile visibility
  useEffect(() => {
    if (!localPrefsLoaded) return
    localStorage.setItem('profileVisibility', profileVisibility)
    // TODO: Send to backend API to update user preferences
  }, [profileVisibility, localPrefsLoaded])

  // Auto-save data analytics with comprehensive tracking
  useEffect(() => {
    if (!localPrefsLoaded) return
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
  }, [dataAnalytics, session, darkMode, profileVisibility, localPrefsLoaded])

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

  // Profile data - prefer real photos; fall back to professional icon
  const hasProfileImage = !!(profileImage || session?.user?.image)
  const userImage = (profileImage || session?.user?.image || '') as string
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
      {/* Header - No back button (main nav item) */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Page Title - Mobile only */}
          <h1 className="md:hidden flex-1 text-center text-lg font-semibold text-gray-900 dark:text-white">Settings</h1>
          <div className="hidden md:block"></div>

          {/* Profile Avatar & Dropdown */}
          <div className="relative dropdown-container" id="profile-dropdown">
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="focus:outline-none"
              aria-label="Open profile menu"
            >
              {hasProfileImage ? (
                <Image
                  src={userImage}
                  alt="Profile"
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full border-2 border-helfi-green shadow-sm object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-helfi-green shadow-sm flex items-center justify-center">
                  <UserIcon className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
              )}
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-lg py-2 z-50 border border-gray-100 dark:border-gray-700 animate-fade-in">
                <div className="flex items-center px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  {hasProfileImage ? (
                    <Image
                      src={userImage}
                      alt="Profile"
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full object-cover mr-3"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-helfi-green flex items-center justify-center mr-3">
                      <UserIcon className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                  )}
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
                <div className="border-t border-gray-100 dark:border-gray-700 my-2"></div>
                <button
                  onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                  className="block w-full text-left px-4 py-2 text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

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

              {!isIOS && (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Haptic Tap Feedback</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Light vibration on nav taps (Android supported)</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={hapticsEnabled}
                      onChange={(e) => {
                        setHapticsEnabled(e.target.checked)
                        trackSettingChange('hapticsEnabled', e.target.checked)
                      }}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
                  </label>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Add Helfi to your Home Screen</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Install the shortcut so it opens like an app and keeps you signed in.
                    </p>
                    {isStandalone && (
                      <p className="mt-2 text-xs text-helfi-green">You are already using the Home Screen app.</p>
                    )}
                  </div>
                  <button
                    onClick={() => setShowInstallGuide((v) => !v)}
                    className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    {showInstallGuide ? 'Hide steps' : 'Show steps'}
                  </button>
                </div>

                {showInstallGuide && (
                  <div className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                    {installPlatform === 'ios' && (
                      <>
                        <p className="font-medium text-gray-900 dark:text-white">iPhone or iPad</p>
                        <ol className="space-y-2">
                          <li className="flex gap-3">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">1</span>
                            <span>Tap the Share button in your browser.</span>
                          </li>
                          <li className="flex gap-3">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">2</span>
                            <span>Scroll and tap Add to Home Screen.</span>
                          </li>
                          <li className="flex gap-3">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">3</span>
                            <span>Tap Add. You are done.</span>
                          </li>
                        </ol>
                      </>
                    )}

                    {installPlatform === 'android' && (
                      <>
                        <p className="font-medium text-gray-900 dark:text-white">Android</p>
                        <ol className="space-y-2">
                          {deferredPrompt ? (
                            <>
                              <li className="flex gap-3">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">1</span>
                                <span>Tap Install below.</span>
                              </li>
                              <li className="flex gap-3">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">2</span>
                                <span>Confirm the install prompt.</span>
                              </li>
                              <li className="flex gap-3">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">3</span>
                                <span>Open Helfi from your Home Screen.</span>
                              </li>
                            </>
                          ) : (
                            <>
                              <li className="flex gap-3">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">1</span>
                                <span>Open the browser menu (three dots).</span>
                              </li>
                              <li className="flex gap-3">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">2</span>
                                <span>Tap Install app or Add to Home Screen.</span>
                              </li>
                              <li className="flex gap-3">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">3</span>
                                <span>Confirm the install.</span>
                              </li>
                            </>
                          )}
                        </ol>
                        {deferredPrompt && (
                          <button
                            onClick={handleInstallClick}
                            className="mt-3 w-full rounded-lg bg-helfi-green px-4 py-3 text-white transition-colors hover:bg-helfi-green-dark"
                          >
                            Install app
                          </button>
                        )}
                      </>
                    )}

                    {installPlatform === 'other' && (
                      <p>Open this page on your phone in Safari (iOS) or Chrome (Android) to install.</p>
                    )}

                    {installOutcome === 'accepted' && (
                      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                        Installed. You can open Helfi from your Home Screen.
                      </div>
                    )}
                    {installOutcome === 'dismissed' && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                        No problem. You can install it anytime from your browser menu.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Notifications</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">All alerts in one place</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Manage delivery, reminders, and quiet hours in one menu.
            </p>
            <Link
              href="/notifications"
              className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-4 hover:border-helfi-green transition-colors"
            >
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Open notification settings</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Delivery, reminders, AI insights, and more.</p>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Privacy Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Privacy Settings</h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">Download my data (PDF)</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Get a nicely formatted health summary</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      setExporting(true)
                      const res = await fetch('/api/export/pdf')
                      if (!res.ok) throw new Error('Export failed')
                      const blob = await res.blob()
                      const url = URL.createObjectURL(blob)
                      setPdfUrl(url)
                      setShowPdf(true)
                    } catch (e) {
                      alert('Could not start export.')
                    } finally {
                      setExporting(false)
                    }
                  }}
                  className="inline-flex px-3 py-2 rounded-md bg-helfi-green text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
                  disabled={exporting}
                >
                  {exporting ? 'Preparing…' : 'Download PDF'}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400">Opens in a new tab so you can return to the app.</p>
              </div>

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

      {/* Mobile Bottom Navigation - with pressed, ripple and active states */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          
          {/* Dashboard */}
          <Link href="/dashboard" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/dashboard' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/dashboard' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Dashboard</span>
          </Link>

          {/* Insights */}
          <Link href="/insights" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/insights' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/insights' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Insights</span>
          </Link>

          {/* Food */}
          <Link href="/food" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/food' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/food' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Food</span>
          </Link>

          {/* Intake (Onboarding) */}
          <MobileMoreMenu />

          {/* Settings (Active) */}
          <Link href="/settings" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/settings' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <Cog6ToothIcon className="w-6 h-6 flex-shrink-0" style={{ minWidth: '24px', minHeight: '24px' }} />
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/settings' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Settings</span>
          </Link>

        </div>
      </nav>

      {/* In-app PDF viewer with back button (mobile safe) */}
      {showPdf && (
        <div className="fixed inset-0 bg-white z-[999] flex flex-col">
          <div className="p-3 border-b flex items-center justify-between">
            <button onClick={()=>{ setShowPdf(false); if (pdfUrl) { URL.revokeObjectURL(pdfUrl); setPdfUrl('') } }} className="px-3 py-2 rounded-md bg-gray-200 text-gray-800 text-sm font-medium">Back</button>
            <a href={pdfUrl} download="helfi-health-summary.pdf" className="px-3 py-2 rounded-md bg-helfi-green text-white text-sm font-medium">Download</a>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe src={pdfUrl} className="w-full h-full" title="Helfi PDF" />
          </div>
        </div>
      )}
    </div>
  )
} 
