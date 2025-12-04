'use client'
import { Cog6ToothIcon, UserIcon } from '@heroicons/react/24/outline'

import React, { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import MobileMoreMenu from '@/components/MobileMoreMenu'
import UsageMeter from '@/components/UsageMeter'
import FitbitSummary from '@/components/devices/FitbitSummary'

export default function Dashboard() {
  // ⚠️ HEALTH SETUP GUARD RAIL
  // Dashboard onboarding logic is tightly coupled to HEALTH_SETUP_PROTECTION.md:
  // - Onboarding is "complete" only when gender, weight, height, and at least one health goal exist.
  // - Brand-new users may be redirected to /onboarding, but only if
  //   sessionStorage.onboardingDeferredThisSession !== '1' (user has NOT chosen "I'll do it later").
  // - The green "Onboarding Complete" card must only show when onboardingComplete === true.
  // Do NOT loosen these checks or remove the deferral flag without reading
  // HEALTH_SETUP_PROTECTION.md and getting explicit user approval.
  const { data: session } = useSession()
  const pathname = usePathname()
  const { profileImage: providerProfileImage } = useUserData()
  const [onboardingData, setOnboardingData] = useState<any>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [deviceInterest, setDeviceInterest] = useState<{ appleWatch?: boolean; fitbit?: boolean; garmin?: boolean; samsung?: boolean; googleFit?: boolean; oura?: boolean; polar?: boolean }>({})
  const [savingInterest, setSavingInterest] = useState<string | null>(null)
  const [fitbitConnected, setFitbitConnected] = useState(false)
  const [fitbitLoading, setFitbitLoading] = useState(false)
  const [garminConnected, setGarminConnected] = useState(false)
  const popupRef = useRef<Window | null>(null)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Profile data - prefer real photos; fall back to professional icon instead of inline SVG
  const hasProfileImage = !!(providerProfileImage || profileImage || session?.user?.image)
  const userImage = (providerProfileImage || profileImage || session?.user?.image || '') as string
  const userName = session?.user?.name || 'User';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Check if click is outside both the button and the dropdown content
      if (!target.closest('.dropdown-container')) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [dropdownOpen]);

  // Load existing data from database (cross-device sync)
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // 🔍 DASHBOARD PERFORMANCE MEASUREMENT START
        console.log('🚀 DASHBOARD LOADING PERFORMANCE TRACKING')
        console.time('⏱️ Dashboard Data Loading')
        const dashboardStartTime = Date.now()
        
        console.log('📤 Loading user data from database...');
        const response = await fetch('/api/user-data', {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        const dataLoadTime = Date.now() - dashboardStartTime
        console.log('📈 Dashboard API Response:', {
          duration: dataLoadTime + 'ms',
          status: response.status,
          statusText: response.statusText
        })
        
        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            console.log('✅ Successfully loaded data from database');
            console.log('📊 Dashboard Data Summary:', {
              hasProfileImage: !!result.data.profileImage,
              hasHealthGoals: !!result.data.goals?.length,
              hasSupplements: !!result.data.supplements?.length,
              hasMedications: !!result.data.medications?.length,
              dataSize: JSON.stringify(result.data).length + ' characters'
            });
            
            // Define onboarding completion using the same rule as Insights:
            // 1) basic profile data present, and 2) at least one health goal selected.
            const hasBasicProfile = !!(result.data.gender && result.data.weight && result.data.height)
            const hasHealthGoals = !!(result.data.goals && result.data.goals.length > 0)
            const onboardingComplete = hasBasicProfile && hasHealthGoals

            // For truly brand-new users with no meaningful data at all, redirect
            // into onboarding on first visit, but respect "I'll do it later"
            // for the current browser session.
            if (!onboardingComplete && !hasBasicProfile && !hasHealthGoals && !result.data.supplements?.length && !result.data.medications?.length) {
              const deferred = typeof window !== 'undefined' && sessionStorage.getItem('onboardingDeferredThisSession') === '1'
              if (!deferred) {
                console.log('🎯 Brand new user detected - redirecting to onboarding')
                window.location.href = '/onboarding'
                return
              } else {
                console.log('⏳ Onboarding deferred this session — staying on dashboard')
              }
            }

            setOnboardingData({ ...result.data, onboardingComplete });
            // Load device interest flags if present
            if (result.data.deviceInterest && typeof result.data.deviceInterest === 'object') {
              setDeviceInterest(result.data.deviceInterest)
            }
            
            // Check Fitbit connection status
            checkFitbitStatus()
            // Check Garmin connection status
            checkGarminStatus()
            
            // Load profile image from database and cache it
            if (result.data.profileImage) {
              setProfileImage(result.data.profileImage);
              // Cache in localStorage for instant loading on other pages (user-specific)
              if (session?.user?.id) {
                localStorage.setItem(`cachedProfileImage_${session.user.id}`, result.data.profileImage);
              }
            }
          } else {
            // No data at all - definitely a new user
            const deferred = typeof window !== 'undefined' && sessionStorage.getItem('onboardingDeferredThisSession') === '1';
            if (!deferred) {
              console.log('🎯 No user data found - redirecting new user to onboarding');
              window.location.href = '/onboarding';
              return;
            } else {
              console.log('⏳ Onboarding deferred with no data — staying on dashboard');
            }
          }
        } else if (response.status === 404) {
          console.log('ℹ️ No existing data found for user in database - redirecting to onboarding');
          window.location.href = '/onboarding';
          return;
        } else if (response.status === 401) {
          console.log('⚠️ User not authenticated - redirecting to login');
          // Don't use localStorage fallback, force proper authentication
          setOnboardingData(null);
        } else {
          console.error('❌ Failed to load data from database:', response.status, response.statusText);
          setOnboardingData(null);
        }
        
        console.timeEnd('⏱️ Dashboard Data Loading')
        console.log('🏁 Dashboard loading completed in', Date.now() - dashboardStartTime + 'ms')
      } catch (error) {
        console.timeEnd('⏱️ Dashboard Data Loading')
        console.error('💥 Error loading user data from database:', error);
        // No localStorage fallback - force database-only approach
        setOnboardingData(null);
      }
    };

    // Load cached profile image immediately for instant display (user-specific)
    if (session?.user?.id) {
      const cachedImage = localStorage.getItem(`cachedProfileImage_${session.user.id}`);
      if (cachedImage) {
        setProfileImage(cachedImage);
      }
    }

    if (session) {
      loadUserData();
    }

    // Listen for messages from popup window (Fitbit OAuth)
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FITBIT_CONNECTED' && event.data.success) {
        checkFitbitStatus()
        setFitbitLoading(false)
      } else if (event.data?.type === 'FITBIT_ERROR') {
        alert('Fitbit connection failed: ' + event.data.error)
        setFitbitLoading(false)
      }
    }
    window.addEventListener('message', handleMessage)
    
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [session]);

  const handleEditOnboarding = () => {
    // Navigate directly to onboarding - data will be loaded from database
    console.log('Navigating to edit onboarding, data will be loaded from database')
    window.location.href = '/onboarding'
  }

  const handleResetData = async () => {
    try {
      // Delete from database
      const response = await fetch('/api/user-data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        console.log('Data successfully deleted from database');
        setOnboardingData(null)
        setShowResetConfirm(false)
        // Redirect to onboarding to start fresh
        window.location.href = '/onboarding'
      } else {
        console.error('Failed to delete from database:', response.status, response.statusText);
        alert('Failed to reset data. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting from database:', error);
      alert('Failed to reset data. Please try again.');
    }
  }

  const saveDeviceInterest = async (next: any) => {
    try {
      setSavingInterest('saving')
      await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceInterest: next })
      })
      // Reload from server to ensure persistence and UI stays selected
      try {
        const res = await fetch('/api/user-data', { cache: 'no-cache' })
        if (res.ok) {
          const json = await res.json()
          if (json?.data?.deviceInterest) setDeviceInterest(json.data.deviceInterest)
        }
      } catch {}
    } catch (e) {
      console.error('Failed to save device interest', e)
    } finally {
      setSavingInterest(null)
    }
  }

  const checkFitbitStatus = async () => {
    try {
      const response = await fetch('/api/fitbit/status')
      if (response.ok) {
        const data = await response.json()
        setFitbitConnected(data.connected)
        return data.connected
      }
      return false
    } catch (error) {
      console.error('Error checking Fitbit status:', error)
      return false
    }
  }

  const checkGarminStatus = async () => {
    try {
      const response = await fetch('/api/garmin/status')
      if (response.ok) {
        const data = await response.json()
        setGarminConnected(!!data.connected)
        return !!data.connected
      }
      return false
    } catch (error) {
      console.error('Error checking Garmin status:', error)
      return false
    }
  }

  const handleConnectFitbit = async () => {
    setFitbitLoading(true)
    try {
      // Open Fitbit OAuth in a popup window so users can still see Helfi
      const width = 600
      const height = 700
      const left = window.screen.width / 2 - width / 2
      const top = window.screen.height / 2 - height / 2
      
      const popup = window.open(
        '/api/auth/fitbit/authorize',
        'Fitbit Authorization',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
      )

      if (!popup) {
        alert('Please allow popups for this site to connect Fitbit')
        setFitbitLoading(false)
        return
      }

      popupRef.current = popup

      // Check if popup is closed (user cancelled)
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed)
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current)
            checkIntervalRef.current = null
          }
          setFitbitLoading(false)
          // Check status in case they completed it quickly
          setTimeout(() => checkFitbitStatus(), 1000)
        }
      }, 500)

      // Poll for connection status - check every 2 seconds
      checkIntervalRef.current = setInterval(async () => {
        const connected = await checkFitbitStatus()
        if (connected) {
          clearInterval(checkClosed)
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current)
            checkIntervalRef.current = null
          }
          // Try to close popup if still open
          if (popup && !popup.closed) {
            try {
              popup.close()
            } catch (e) {
              // Popup might be on different origin, ignore
            }
          }
          setFitbitLoading(false)
        }
      }, 2000)

      // Cleanup after 5 minutes
      setTimeout(() => {
        clearInterval(checkClosed)
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current)
          checkIntervalRef.current = null
        }
        setFitbitLoading(false)
      }, 300000)
    } catch (error) {
      console.error('Error connecting Fitbit:', error)
      alert('Failed to connect Fitbit. Please try again.')
      setFitbitLoading(false)
    }
  }

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [])

  const toggleInterest = (key: 'appleWatch' | 'fitbit' | 'garmin' | 'samsung' | 'googleFit' | 'oura' | 'polar') => {
    // Don't toggle Fitbit interest if it's already connected
    if (key === 'fitbit' && fitbitConnected) {
      return
    }
    setDeviceInterest((prev) => {
      const next = { ...prev, [key]: !prev?.[key] }
      // Fire-and-forget save; keep UI responsive even if request is slow
      saveDeviceInterest(next)
      return next
    })
  }

  const handleSignOut = async () => {
    // Clear user-specific localStorage before signing out
    if (session?.user?.id) {
      localStorage.removeItem(`profileImage_${session.user.id}`);
      localStorage.removeItem(`cachedProfileImage_${session.user.id}`);
    }
    await signOut({ callbackUrl: '/auth/signin' })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation Header - Mobile: Logo + Profile Row, Desktop: Logo + Actions Row */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-3">
        <div className="max-w-7xl mx-auto">
          {/* Mobile: Logo and Profile Row */}
          <div className="md:hidden flex items-center justify-between mb-3">
            <Link href="/" className="w-20 h-20 cursor-pointer hover:opacity-80 transition-opacity">
              <Image
                src="/mobile-assets/LOGOS/helfi-01-01.png"
                alt="Helfi Logo"
                width={72}
                height={72}
                className="w-full h-full object-contain"
                priority
              />
            </Link>
            <div className="flex items-center gap-2">
              <Link 
                href="/billing" 
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-helfi-green border border-helfi-green/30 rounded-md hover:bg-helfi-green/5 transition-all"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Upgrade
              </Link>
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
                      <UserIcon className="w-5 h-5 text-white" aria-hidden="true" />
                    </div>
                  )}
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100 animate-fade-in">
                    <div className="flex items-center px-4 py-3 border-b border-gray-100">
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
                          <UserIcon className="w-5 h-5 text-white" aria-hidden="true" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-gray-900">{userName}</div>
                        <div className="text-xs text-gray-500">{session?.user?.email || 'user@email.com'}</div>
                      </div>
                    </div>
                    <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
                    <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                    <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Upload/Change Profile Photo</Link>
                    <Link href="/billing" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Subscription & Billing</Link>
                    <Link href="/notifications" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Notifications</Link>
                    <Link href="/privacy" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Privacy Settings</Link>
                    <Link href="/support" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
                    <div className="border-t border-gray-100 my-2"></div>
                    <Link href="/reports" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Reports</Link>
                    <button 
                      onClick={handleSignOut}
                      className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50 font-semibold"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Desktop: Logo + Actions Row */}
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center">
            <Link href="/" className="w-20 h-20 md:w-24 md:h-24 cursor-pointer hover:opacity-80 transition-opacity">
              <Image
                src="/mobile-assets/LOGOS/helfi-01-01.png"
                alt="Helfi Logo"
                width={96}
                height={96}
                className="w-full h-full object-contain"
                priority
              />
            </Link>
            </div>
            
            <div className="flex items-center gap-3">
              <Link 
                href="/billing" 
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-helfi-green border border-helfi-green/30 rounded-md hover:bg-helfi-green/5 hover:border-helfi-green/50 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Upgrade
              </Link>
              <div className="relative dropdown-container" id="profile-dropdown-desktop">
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="focus:outline-none"
                  aria-label="Open profile menu"
                >
                  {hasProfileImage ? (
                    <Image
                      src={userImage}
                      alt="Profile"
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full border-2 border-helfi-green shadow-sm object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-helfi-green shadow-sm flex items-center justify-center">
                      <UserIcon className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                  )}
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100 animate-fade-in">
                    <div className="flex items-center px-4 py-3 border-b border-gray-100">
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
                          <UserIcon className="w-5 h-5 text-white" aria-hidden="true" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-gray-900">{userName}</div>
                        <div className="text-xs text-gray-500">{session?.user?.email || 'user@email.com'}</div>
                      </div>
                    </div>
                    <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
                    <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                    <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Upload/Change Profile Photo</Link>
                    <Link href="/billing" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Subscription & Billing</Link>
                    <Link href="/notifications" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Notifications</Link>
                    <Link href="/privacy" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Privacy Settings</Link>
                    <Link href="/support" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
                    <div className="border-t border-gray-100 my-2"></div>
                    <Link href="/reports" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Reports</Link>
                    <button 
                      onClick={handleSignOut}
                      className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50 font-semibold"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Page Title Row - Mobile: Below Logo/Profile, Desktop: Centered */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-3 md:py-4">
        <div className="max-w-7xl mx-auto">
          {/* Mobile: Credits Meter + Dashboard Title */}
          <div className="md:hidden space-y-2">
            <div className="flex justify-center">
              <UsageMeter compact={true} />
            </div>
            <div className="text-center">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Dashboard</h1>
            </div>
          </div>
          
          {/* Desktop: Centered Title */}
          <div className="hidden md:block text-center">
            <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Welcome back, {userName}</p>
          </div>
        </div>
      </div>

      {/* Main Content - Add padding bottom for mobile nav */}
      <main className="flex-1 pb-24 md:pb-8">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6 md:py-8">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-helfi-black mb-4">
                Welcome to Your Health Dashboard
              </h1>
              <p className="text-gray-600">
                Your personalized health intelligence platform is being built!
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
              <Link href="/check-in" className="block">
              <div className="bg-white md:bg-emerald-50 p-5 md:p-6 rounded-2xl border border-gray-100 md:border-2 md:border-emerald-200 hover:md:border-emerald-300 shadow-sm md:shadow-none transition-colors">
                <h3 className="text-[17px] font-semibold text-helfi-black mb-1.5">✅ Daily Check-In</h3>
                <p className="text-[13px] text-gray-600">Rate your health issues for today</p>
                <div className="mt-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">Active</span>
                </div>
              </div>
              </Link>

              <Link href="/health-tracking" className="block">
              <div className="bg-white md:bg-helfi-green/5 p-5 md:p-6 rounded-2xl border border-gray-100 md:border-2 md:border-helfi-green/20 hover:md:border-helfi-green/40 shadow-sm md:shadow-none transition-colors">
                <h3 className="text-[17px] font-semibold text-helfi-black mb-1.5">🎯 Health Tracking</h3>
                <p className="text-[13px] text-gray-600">Track your daily metrics and progress</p>
                <div className="mt-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-helfi-green/10 text-helfi-green">Coming Soon</span>
                </div>
              </div>
              </Link>

              <Link href="/insights" className="block">
              <div className="bg-white md:bg-blue-50 p-5 md:p-6 rounded-2xl border border-gray-100 md:border-2 md:border-blue-200 hover:md:border-blue-300 shadow-sm md:shadow-none transition-colors">
                <h3 className="text-[17px] font-semibold text-helfi-black mb-1.5">🤖 AI Insights</h3>
                <p className="text-[13px] text-gray-600">Personalized health recommendations</p>
                <div className="mt-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-600">Coming Soon</span>
                </div>
              </div>
              </Link>

              <Link href="/reports" className="block">
              <div className="bg-white md:bg-purple-50 p-5 md:p-6 rounded-2xl border border-gray-100 md:border-2 md:border-purple-200 hover:md:border-purple-300 shadow-sm md:shadow-none transition-colors">
                <h3 className="text-[17px] font-semibold text-helfi-black mb-1.5">📊 Reports</h3>
                <p className="text-[13px] text-gray-600">Weekly health analysis and trends</p>
                <div className="mt-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 text-purple-600">Coming Soon</span>
                </div>
              </div>
              </Link>
            </div>

            {/* Fitbit Mini Summary */}
            {fitbitConnected && (
              <div className="mb-6">
                <FitbitSummary rangeDays={7} />
              </div>
            )}

            {/* Device Integration Section */}
            {onboardingData && (
              <div className="mb-8 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-4 md:p-6 border border-blue-200">
                <div className="mb-3 md:mb-4">
                  {/* Mobile: centered heading and badge */}
                  <div className="md:hidden text-center">
                    <h3 className="text-[17px] font-semibold text-helfi-black">📱 Connect Your Devices</h3>
                    <div className="text-[12px] text-green-600 font-medium mt-1">Enhanced Analytics</div>
                  </div>
                  {/* Desktop: left title, right badge */}
                  <div className="hidden md:flex items-center justify-between">
                    <h3 className="text-[17px] font-semibold text-helfi-black">📱 Connect Your Devices</h3>
                    <span className="text-[12px] md:text-sm text-green-600 font-medium whitespace-nowrap">Enhanced Analytics</span>
                  </div>
                  <p className="text-[13px] text-gray-600 text-center mt-2">Sync your smartwatch and fitness devices for better health insights</p>
                </div>
                
                {/* Mobile grouped list */}
                <div className="md:hidden mb-4">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
                    {/* Fitbit - First since it's the only working integration */}
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">🏃</div>
                        <div className="flex-1">
                          <div className="text-[15px] font-medium text-gray-900">Fitbit</div>
                          <div className="text-[12px] text-gray-500">Activity & sleep</div>
                        </div>
                        {fitbitConnected && (
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        )}
                      </div>
                      {fitbitConnected ? (
                        <Link href="/devices" className="mt-3 w-full text-center text-[13px] px-3.5 py-2 rounded-full bg-emerald-600 text-white block">Connected ✓</Link>
                      ) : (
                        <button onClick={handleConnectFitbit} className={`mt-3 w-full text-center text-[13px] px-3.5 py-2 rounded-full bg-helfi-green text-white hover:bg-green-600 transition-colors`} disabled={fitbitLoading}>
                          {fitbitLoading ? 'Connecting...' : 'Connect Fitbit'}
                        </button>
                      )}
                    </div>
                    {/* Apple Watch */}
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">⌚</div>
                        <div>
                          <div className="text-[15px] font-medium text-gray-900">Apple Watch</div>
                          <div className="text-[12px] text-gray-500">Sync with Apple Health</div>
                        </div>
                      </div>
                      <button onClick={() => toggleInterest('appleWatch')} className={`mt-3 w-full text-center text-[13px] px-3.5 py-2 rounded-full ${deviceInterest.appleWatch ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} disabled={!!savingInterest}>{deviceInterest.appleWatch ? 'Interested ✓' : "I'm interested"}</button>
                    </div>
                  {/* Garmin */}
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">💪</div>
                      <div>
                        <div className="text-[15px] font-medium text-gray-900">Garmin</div>
                        <div className="text-[12px] text-gray-500">Training metrics</div>
                      </div>
                    </div>
                    {garminConnected ? (
                      <Link href="/devices" className="mt-3 w-full text-center text-[13px] px-3.5 py-2 rounded-full bg-emerald-600 text-white block">
                        Connected ✓
                      </Link>
                    ) : (
                      <Link href="/devices" className="mt-3 w-full text-center text-[13px] px-3.5 py-2 rounded-full bg-helfi-green text-white block hover:bg-green-600 transition-colors">
                        Connect Garmin
                      </Link>
                    )}
                  </div>
                    {/* Samsung Health */}
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">📱</div>
                        <div>
                          <div className="text-[15px] font-medium text-gray-900">Samsung Health</div>
                          <div className="text-[12px] text-gray-500">Android health sync</div>
                        </div>
                      </div>
                      <button onClick={() => toggleInterest('samsung')} className={`mt-3 w-full text-center text-[13px] px-3.5 py-2 rounded-full ${deviceInterest.samsung ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} disabled={!!savingInterest}>{deviceInterest.samsung ? 'Interested ✓' : "I'm interested"}</button>
                    </div>
                    {/* Google Fit */}
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">🤖</div>
                        <div>
                          <div className="text-[15px] font-medium text-gray-900">Google Fit</div>
                          <div className="text-[12px] text-gray-500">Android fitness</div>
                        </div>
                      </div>
                      <button onClick={() => toggleInterest('googleFit')} className={`mt-3 w-full text-center text-[13px] px-3.5 py-2 rounded-full ${deviceInterest.googleFit ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} disabled={!!savingInterest}>{deviceInterest.googleFit ? 'Interested ✓' : "I'm interested"}</button>
                    </div>
                    {/* Oura Ring */}
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">💍</div>
                        <div>
                          <div className="text-[15px] font-medium text-gray-900">Oura Ring</div>
                          <div className="text-[12px] text-gray-500">Recovery & sleep</div>
                        </div>
                      </div>
                      <button onClick={() => toggleInterest('oura')} className={`mt-3 w-full text-center text-[13px] px-3.5 py-2 rounded-full ${deviceInterest.oura ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} disabled={!!savingInterest}>{deviceInterest.oura ? 'Interested ✓' : "I'm interested"}</button>
                    </div>
                    {/* Polar */}
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">🧭</div>
                        <div>
                          <div className="text-[15px] font-medium text-gray-900">Polar</div>
                          <div className="text-[12px] text-gray-500">Heart rate & sport</div>
                        </div>
                      </div>
                      <button onClick={() => toggleInterest('polar')} className={`mt-3 w-full text-center text-[13px] px-3.5 py-2 rounded-full ${deviceInterest.polar ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} disabled={!!savingInterest}>{deviceInterest.polar ? 'Interested ✓' : "I'm interested"}</button>
                    </div>
                  </div>
                </div>

                {/* Desktop grid */}
                <div className="hidden md:grid grid-cols-4 gap-4 mb-4">
                  {/* Fitbit - First since it's the only working integration */}
                  <div className={`bg-white p-4 rounded-2xl border ${fitbitConnected ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-100'} shadow-sm transition-colors`}>
                    <div className="text-center">
                      <div className="text-2xl mb-1">🏃</div>
                      <div className="text-xs font-medium text-gray-700 mb-2 flex items-center justify-center gap-1">
                        Fitbit
                        {fitbitConnected && <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>}
                      </div>
                      {fitbitConnected ? (
                        <Link
                          href="/devices"
                          className="w-full inline-flex items-center justify-center text-[12px] px-3.5 py-1.5 rounded-full bg-emerald-600 text-white"
                        >
                          Connected ✓
                        </Link>
                      ) : (
                        <button
                          onClick={handleConnectFitbit}
                          className="w-full inline-flex items-center justify-center text-[12px] px-3.5 py-1.5 rounded-full bg-helfi-green text-white hover:bg-green-600 transition-colors"
                          disabled={fitbitLoading}
                        >
                          {fitbitLoading ? 'Connecting...' : 'Connect Fitbit'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Apple Watch */}
                  <div className={`bg-white p-4 rounded-2xl border ${deviceInterest.appleWatch ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-100'} shadow-sm transition-colors`}> 
                    <div className="text-center">
                      <div className="text-2xl mb-1">⌚</div>
                      <div className="text-xs font-medium text-gray-700 mb-2">Apple Watch</div>
                      <button
                        onClick={() => toggleInterest('appleWatch')}
                        className={`w-full inline-flex items-center justify-center text-[12px] px-3.5 py-1.5 rounded-full ${
                          deviceInterest.appleWatch ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        disabled={!!savingInterest}
                      >
                        {deviceInterest.appleWatch ? 'Interested ✓' : "I'm interested"}
                      </button>
                    </div>
                  </div>

                  {/* Garmin */}
                  <div className={`bg-white p-4 rounded-2xl border ${garminConnected ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-100'} shadow-sm transition-colors`}>
                    <div className="text-center">
                      <div className="text-2xl mb-1">💪</div>
                      <div className="text-xs font-medium text-gray-700 mb-2 flex items-center justify-center gap-1">
                        Garmin
                        {garminConnected && <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>}
                      </div>
                      {garminConnected ? (
                        <Link
                          href="/devices"
                          className="w-full inline-flex items-center justify-center text-[12px] px-3.5 py-1.5 rounded-full bg-emerald-600 text-white"
                        >
                          Connected ✓
                        </Link>
                      ) : (
                        <Link
                          href="/devices"
                          className="w-full inline-flex items-center justify-center text-[12px] px-3.5 py-1.5 rounded-full bg-helfi-green text-white hover:bg-green-600 transition-colors"
                        >
                          Connect Garmin
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Samsung Health */}
                  <div className={`bg-white p-4 rounded-2xl border ${deviceInterest.samsung ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-100'} shadow-sm transition-colors`}>
                    <div className="text-center">
                      <div className="text-2xl mb-1">📱</div>
                      <div className="text-xs font-medium text-gray-700 mb-2">Samsung Health</div>
                      <button
                        onClick={() => toggleInterest('samsung')}
                        className={`w-full inline-flex items-center justify-center text-[12px] px-3.5 py-1.5 rounded-full ${
                          deviceInterest.samsung ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        disabled={!!savingInterest}
                      >
                        {deviceInterest.samsung ? 'Interested ✓' : "I'm interested"}
                      </button>
                    </div>
                  </div>

                  {/* Google Fit */}
                  <div className={`bg-white p-4 rounded-2xl border ${deviceInterest.googleFit ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-100'} shadow-sm transition-colors`}>
                    <div className="text-center">
                      <div className="text-2xl mb-1">🤖</div>
                      <div className="text-xs font-medium text-gray-700 mb-2">Google Fit</div>
                      <button
                        onClick={() => toggleInterest('googleFit')}
                        className={`w-full inline-flex items-center justify-center text-[12px] px-3.5 py-1.5 rounded-full ${
                          deviceInterest.googleFit ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        disabled={!!savingInterest}
                      >
                        {deviceInterest.googleFit ? 'Interested ✓' : "I'm interested"}
                      </button>
                    </div>
                  </div>

                  {/* Oura Ring */}
                  <div className={`bg-white p-4 rounded-2xl border ${deviceInterest.oura ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-100'} shadow-sm transition-colors`}>
                    <div className="text-center">
                      <div className="text-2xl mb-1">💍</div>
                      <div className="text-xs font-medium text-gray-700 mb-2">Oura Ring</div>
                      <button
                        onClick={() => toggleInterest('oura')}
                        className={`w-full inline-flex items-center justify-center text-[12px] px-3.5 py-1.5 rounded-full ${
                          deviceInterest.oura ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        disabled={!!savingInterest}
                      >
                        {deviceInterest.oura ? 'Interested ✓' : "I'm interested"}
                      </button>
                    </div>
                  </div>

                  {/* Polar */}
                  <div className={`bg-white p-4 rounded-2xl border ${deviceInterest.polar ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-100'} shadow-sm transition-colors`}>
                    <div className="text-center">
                      <div className="text-2xl mb-1">🧭</div>
                      <div className="text-xs font-medium text-gray-700 mb-2">Polar</div>
                      <button
                        onClick={() => toggleInterest('polar')}
                        className={`w-full inline-flex items-center justify-center text-[12px] px-3.5 py-1.5 rounded-full ${
                          deviceInterest.polar ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        disabled={!!savingInterest}
                      >
                        {deviceInterest.polar ? 'Interested ✓' : "I'm interested"}
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="text-xs text-gray-500 text-center">
                  Device integration coming soon - enhanced health monitoring with real-time data
                </div>
              </div>
            )}

            {/* Data Status Section */}
            <div className="mb-8">
              {onboardingData?.onboardingComplete ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-green-900 mb-2">✅ Onboarding Complete</h3>
                      <p className="text-green-700 mb-4">
                        Your health profile has been created and synced across all devices
                      </p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {onboardingData.personalInfo && (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                            Personal Info ✓
                          </span>
                        )}
                        {onboardingData.physicalMetrics && (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                            Physical Metrics ✓
                          </span>
                        )}
                        {onboardingData.healthGoals && (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                            Health Goals ✓
                          </span>
                        )}
                        {onboardingData.medications && onboardingData.medications.length > 0 && (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                            Medications ✓
                          </span>
                        )}
                        {onboardingData.supplements && onboardingData.supplements.length > 0 && (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                            Supplements ✓
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-green-600">
                      <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-3 mt-4">
                    <button 
                      onClick={handleEditOnboarding}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Edit Health Information
                    </button>
                    <button 
                      onClick={() => setShowResetConfirm(true)}
                      className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Reset All Data
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-blue-900 mb-2">🚀 Complete your Health Setup</h3>
                      <p className="text-blue-700 mb-4">
                        Finish your health profile to unlock personalized insights and tracking
                      </p>
                    </div>
                    <div className="text-blue-600">
                      <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
                      </svg>
                    </div>
                  </div>
                  
                  <Link 
                    href="/onboarding"
                    className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    {onboardingData ? 'Continue Health Setup' : 'Start Health Profile Setup'}
                  </Link>
                </div>
              )}
            </div>

            {/* Reset Confirmation Modal */}
            {showResetConfirm && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md mx-4">
                  <h3 className="text-lg font-bold text-red-900 mb-4">⚠️ Reset All Data</h3>
                  <p className="text-gray-700 mb-6">
                    This will permanently delete all your health data, including:
                  </p>
                  <ul className="text-sm text-gray-600 mb-6 space-y-1">
                    <li>• Personal information</li>
                    <li>• Physical metrics</li>
                    <li>• Health goals</li>
                    <li>• Medications and supplements</li>
                    <li>• Profile image</li>
                  </ul>
                  <p className="text-red-600 font-medium mb-6">
                    This action cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button 
                      onClick={handleResetData}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Yes, Reset Everything
                    </button>
                    <button 
                      onClick={() => setShowResetConfirm(false)}
                      className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation - with pressed, ripple and active states */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          
          {/* Dashboard (Active) */}
          <Link href="/dashboard" className={`pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1`} onClick={() => {
            try {
              const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
              const pref = localStorage.getItem('hapticsEnabled')
              const enabled = pref === null ? true : pref === 'true'
              if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10)
            } catch {}
          }}>
            <div className={`icon ${pathname === '/dashboard' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/dashboard' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Dashboard</span>
          </Link>

          {/* Insights */}
          <Link href="/insights" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => {
            try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {}
          }}>
            <div className={`icon ${pathname === '/insights' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/insights' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Insights</span>
          </Link>

          {/* Food */}
          <Link href="/food" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => {
            try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {}
          }}>
            <div className={`icon ${pathname === '/food' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/food' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Food</span>
          </Link>

          {/* Intake (Onboarding) */}
          <MobileMoreMenu />

          {/* Settings */}
          <Link href="/settings" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => {
            try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {}
          }}>
            <div className={`icon ${pathname === '/settings' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <Cog6ToothIcon className="w-6 h-6 flex-shrink-0" style={{ minWidth: '24px', minHeight: '24px' }} />
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/settings' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Settings</span>
          </Link>

        </div>
      </nav>
    </div>
  )
} 
