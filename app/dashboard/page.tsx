'use client'
import { Cog6ToothIcon, UserIcon } from '@heroicons/react/24/outline'

import React, { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import { isCacheFresh, readClientCache, writeClientCache } from '@/lib/client-cache'
import MobileMoreMenu from '@/components/MobileMoreMenu'
import UsageMeter from '@/components/UsageMeter'
import FitbitSummary from '@/components/devices/FitbitSummary'

const DASHBOARD_CACHE_TTL_MS = 5 * 60_000

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
  const cacheKey = session?.user?.email ? `dashboard-data:${session.user.email}` : ''
  const [onboardingData, setOnboardingData] = useState<any>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [affiliateMenu, setAffiliateMenu] = useState<{ label: string; href: string } | null>(null)
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [deviceInterest, setDeviceInterest] = useState<{ fitbit?: boolean; garmin?: boolean; googleFit?: boolean; oura?: boolean; polar?: boolean; huawei?: boolean }>({})
  const [savingInterest, setSavingInterest] = useState(false)
  const [fitbitConnected, setFitbitConnected] = useState(false)
  const [fitbitLoading, setFitbitLoading] = useState(false)
  const [garminConnected, setGarminConnected] = useState(false)
  const garminConnectEnabled = process.env.NEXT_PUBLIC_GARMIN_CONNECT_ENABLED === 'true'
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

  useEffect(() => {
    if (!session?.user?.email) {
      setAffiliateMenu(null)
      return
    }
    let cancelled = false
    setAffiliateMenu({ label: 'Become an Affiliate', href: '/affiliate/apply' })
    const loadAffiliateMenu = async () => {
      try {
        const res = await fetch('/api/affiliate/application', { cache: 'no-store' })
        const data = await res.json().catch(() => ({} as any))
        if (!res.ok) return
        const hasAffiliate = !!data?.affiliate
        const hasApplication = !!data?.application
        const menu = hasAffiliate
          ? { label: 'Affiliate Portal', href: '/affiliate' }
          : hasApplication
            ? { label: 'Affiliate Application', href: '/affiliate/apply' }
            : { label: 'Become an Affiliate', href: '/affiliate/apply' }
        if (!cancelled) setAffiliateMenu(menu)
      } catch {
        // ignore
      }
    }
    loadAffiliateMenu()
    return () => {
      cancelled = true
    }
  }, [session?.user?.email])

  // Load existing data from database (cross-device sync)
  useEffect(() => {
    const applyUserData = (data: any, allowRedirect: boolean) => {
      if (!data) return

      console.log('✅ Successfully loaded data from database');
      console.log('📊 Dashboard Data Summary:', {
        hasProfileImage: !!data.profileImage,
        hasHealthGoals: !!data.goals?.length,
        hasSupplements: !!data.supplements?.length,
        hasMedications: !!data.medications?.length,
        dataSize: JSON.stringify(data).length + ' characters'
      })

      // Define onboarding completion using the same rule as Insights:
      // 1) basic profile data present, and 2) at least one health goal selected.
      const hasBasicProfile = !!(data.gender && data.weight && data.height)
      const hasHealthGoals = !!(data.goals && data.goals.length > 0)
      const onboardingComplete = hasBasicProfile && hasHealthGoals

      // For truly brand-new users with no meaningful data at all, redirect
      // into onboarding on first visit, but respect "I'll do it later"
      // for the current browser session.
      if (
        allowRedirect &&
        !onboardingComplete &&
        !hasBasicProfile &&
        !hasHealthGoals &&
        !data.supplements?.length &&
        !data.medications?.length
      ) {
        const deferred =
          typeof window !== 'undefined' && sessionStorage.getItem('onboardingDeferredThisSession') === '1'
        if (!deferred) {
          console.log('🎯 Brand new user detected - redirecting to onboarding')
          window.location.href = '/onboarding'
          return
        }
        console.log('⏳ Onboarding deferred this session — staying on dashboard')
      }

      setOnboardingData({ ...data, onboardingComplete })
      // Load device interest flags if present
      if (data.deviceInterest && typeof data.deviceInterest === 'object') {
        setDeviceInterest(data.deviceInterest)
      }

      // Check Fitbit connection status
      checkFitbitStatus()
      // Check Garmin connection status
      if (garminConnectEnabled) checkGarminStatus()

      // Load profile image from database and cache it
      if (data.profileImage) {
        setProfileImage(data.profileImage)
        // Cache in localStorage for instant loading on other pages (user-specific)
        if (session?.user?.id) {
          localStorage.setItem(`cachedProfileImage_${session.user.id}`, data.profileImage)
        }
      }
    }

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
            applyUserData(result.data, true)
            if (cacheKey) {
              writeClientCache(cacheKey, result.data)
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

    const cached = cacheKey ? readClientCache<any>(cacheKey) : null
    const cachedData = cached?.data
    if (cachedData) {
      applyUserData(cachedData, false)
    }
    const cachedIsEmpty =
      !!cachedData &&
      !cachedData.gender &&
      !cachedData.weight &&
      !cachedData.height &&
      !(cachedData.goals && cachedData.goals.length > 0) &&
      !(cachedData.supplements && cachedData.supplements.length > 0) &&
      !(cachedData.medications && cachedData.medications.length > 0)
    const shouldFetch =
      !cached ||
      !isCacheFresh(cached, DASHBOARD_CACHE_TTL_MS) ||
      cachedIsEmpty
    if (session && shouldFetch) {
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
  }, [session, cacheKey]);

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
      setSavingInterest(true)
      const res = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceInterest: next })
      })
      if (!res.ok) {
        throw new Error('Device interest update failed')
      }
      setDeviceInterest(next)
    } catch (e) {
      console.error('Failed to save device interest', e)
    } finally {
      setSavingInterest(false)
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
    if (!garminConnectEnabled) {
      setGarminConnected(false)
      return false
    }
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

  const toggleInterest = (key: 'fitbit' | 'garmin' | 'googleFit' | 'oura' | 'polar' | 'huawei') => {
    // Don't toggle Fitbit interest if it's already connected
    if (key === 'fitbit' && fitbitConnected) {
      return
    }
    const next = { ...deviceInterest, [key]: !deviceInterest?.[key] }
    saveDeviceInterest(next)
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
    <div className="min-h-screen min-h-[100svh] bg-gray-50 dark:bg-gray-900">
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
                className="w-full h-full object-contain dark:hidden"
                priority
              />
              <Image
                src="/mobile-assets/LOGOS/helfi-01-06.png"
                alt="Helfi Logo"
                width={72}
                height={72}
                className="w-full h-full object-contain hidden dark:block"
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
                    {affiliateMenu && (
                      <Link href={affiliateMenu.href} className="block px-4 py-2 text-gray-700 hover:bg-gray-50">
                        {affiliateMenu.label}
                      </Link>
                    )}
                    <Link href="/notifications" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Notifications</Link>
                    <Link href="/privacy" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Privacy Settings</Link>
                    <Link href="/support" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
                    <div className="border-t border-gray-100 my-2"></div>
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
                className="w-full h-full object-contain dark:hidden"
                priority
              />
              <Image
                src="/mobile-assets/LOGOS/helfi-01-06.png"
                alt="Helfi Logo"
                width={96}
                height={96}
                className="w-full h-full object-contain hidden dark:block"
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
                    {affiliateMenu && (
                      <Link href={affiliateMenu.href} className="block px-4 py-2 text-gray-700 hover:bg-gray-50">
                        {affiliateMenu.label}
                      </Link>
                    )}
                    <Link href="/notifications" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Notifications</Link>
                    <Link href="/privacy" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Privacy Settings</Link>
                    <Link href="/support" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
                    <div className="border-t border-gray-100 my-2"></div>
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
          <div className="bg-transparent md:bg-white rounded-none md:rounded-lg shadow-none md:shadow-sm p-0 md:p-8">
            <div className="text-center mb-8 space-y-3 py-4">
              <h1 className="text-3xl md:text-5xl font-extrabold text-helfi-black dark:text-white tracking-tight">
                Welcome to Your <span className="text-helfi-green">Health Dashboard</span>
              </h1>
              <p className="text-gray-600 text-base md:text-lg max-w-2xl mx-auto mt-2 px-4 md:px-0">
                Your personalized health intelligence platform is being built to help you optimize your well-being.
              </p>
            </div>

            <div className="md:hidden flex items-center justify-between mb-4 px-2 py-1">
              <h3 className="font-bold text-lg text-helfi-black dark:text-white">Daily Tools</h3>
              <span className="text-[10px] font-bold text-helfi-green uppercase tracking-wider">Slide to view</span>
            </div>

            <div className="flex overflow-x-auto gap-4 pb-2 mb-8 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 scrollbar-none">
              <Link href="/check-in" className="group block min-w-[260px] md:min-w-0">
                <div className="p-5 md:p-6 rounded-3xl md:rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 hover:shadow-lg transition-all cursor-pointer">
                  <div className="flex items-center space-x-3 mb-4">
                    <span className="material-symbols-outlined text-emerald-500">check_circle</span>
                    <h3 className="font-bold text-lg text-helfi-black dark:text-white">Daily Check-In</h3>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                    Rate your health issues and track symptoms for today.
                  </p>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
                    Active
                  </span>
                </div>
              </Link>

              <Link href="/mood" className="group block min-w-[260px] md:min-w-0">
                <div className="p-5 md:p-6 rounded-3xl md:rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 hover:shadow-lg transition-all cursor-pointer">
                  <div className="flex items-center space-x-3 mb-4">
                    <span className="material-symbols-outlined text-amber-500">mood</span>
                    <h3 className="font-bold text-lg text-helfi-black dark:text-white">Mood Tracker</h3>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                    Track your daily mood patterns and emotional health.
                  </p>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50">
                    Active
                  </span>
                </div>
              </Link>

              <Link href="/health-tracking" className="group block min-w-[260px] md:min-w-0">
                <div className="p-5 md:p-6 rounded-3xl md:rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 hover:shadow-lg transition-all cursor-pointer">
                  <div className="flex items-center space-x-3 mb-4">
                    <span className="material-symbols-outlined text-rose-500">track_changes</span>
                    <h3 className="font-bold text-lg text-helfi-black dark:text-white">Health Tracking</h3>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                    Monitor daily biometric metrics and fitness progress.
                  </p>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50">
                    Active
                  </span>
                </div>
              </Link>

              <Link href="/insights" className="group block min-w-[260px] md:min-w-0">
                <div className="p-5 md:p-6 rounded-3xl md:rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 hover:shadow-lg transition-all cursor-pointer">
                  <div className="flex items-center space-x-3 mb-4">
                    <span className="material-symbols-outlined text-indigo-500">auto_awesome</span>
                    <h3 className="font-bold text-lg text-helfi-black dark:text-white">AI Insights</h3>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                    Personalized, data-driven health recommendations.
                  </p>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
                    Active
                  </span>
                </div>
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
              <Link href="/food" className="block">
                <div className="w-full text-center px-4 py-3 rounded-2xl font-semibold text-sm bg-[#FF803E] text-white hover:bg-[#E67237] transition-colors">
                  Track Calories
                </div>
              </Link>
              <Link href="/food/water" className="block">
                <div className="w-full text-center px-4 py-3 rounded-2xl font-semibold text-sm bg-[#0099FF] text-white hover:bg-[#0086E6] transition-colors">
                  Log Water Intake
                </div>
              </Link>
              <Link href="/chat" className="block">
                <div className="w-full text-center px-4 py-3 rounded-2xl font-semibold text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                  Talk to AI
                </div>
              </Link>
              <Link href="/health-tips" className="block">
                <div className="w-full text-center px-4 py-3 rounded-2xl font-semibold text-sm bg-[#4DAF50] text-white hover:bg-[#439A45] transition-colors">
                  Health Tips
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
              <section className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 md:p-8 border border-slate-200 dark:border-slate-700 shadow-sm mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 space-y-3 md:space-y-0">
                  <div>
                    <div className="flex items-center space-x-3">
                      <span className="material-symbols-outlined text-slate-400">devices</span>
                      <h2 className="text-2xl font-bold tracking-tight text-helfi-black dark:text-white">Connect Your Devices</h2>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                      Sync activity and sleep data from your favorite wearables.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-500 font-semibold text-sm">
                    <span className="material-symbols-outlined text-lg">auto_graph</span>
                    <span>Enhanced Analytics Available</span>
                  </div>
                </div>

                <div className="md:hidden space-y-3">
                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 flex items-center justify-center bg-white dark:bg-slate-700 rounded-xl shadow-sm">
                        <img src="/brands/fitbit.png" alt="Fitbit" className="h-6 w-auto" />
                      </div>
                      <span className="font-semibold text-sm">Fitbit</span>
                    </div>
                    {fitbitConnected ? (
                      <Link href="/devices" className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-full">
                        Connected ✓
                      </Link>
                    ) : (
                      <button
                        onClick={handleConnectFitbit}
                        className="px-4 py-2 bg-helfi-green text-white text-xs font-bold rounded-full"
                        disabled={fitbitLoading}
                      >
                        {fitbitLoading ? 'Connecting...' : 'Connect'}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 flex items-center justify-center bg-white dark:bg-slate-700 rounded-xl shadow-sm">
                        <img src="/brands/garmin-connect.jpg" alt="Garmin Connect" className="h-6 w-auto" />
                      </div>
                      <span className="font-semibold text-sm">Garmin Connect</span>
                    </div>
                    {!garminConnectEnabled ? (
                      <button
                        onClick={() => toggleInterest('garmin')}
                        className={`px-4 py-2 text-xs font-bold rounded-full ${
                          deviceInterest.garmin ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                        disabled={!!savingInterest}
                      >
                        {deviceInterest.garmin ? 'Interested ✓' : 'Connect'}
                      </button>
                    ) : garminConnected ? (
                      <Link href="/devices" className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-full">
                        Connected ✓
                      </Link>
                    ) : (
                      <Link href="/devices" className="px-4 py-2 bg-helfi-green text-white text-xs font-bold rounded-full">
                        Connect
                      </Link>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 flex items-center justify-center bg-white dark:bg-slate-700 rounded-xl shadow-sm">
                        <img src="/brands/google-fit.png" alt="Google Fit" className="h-6 w-auto" />
                      </div>
                      <span className="font-semibold text-sm">Google Fit</span>
                    </div>
                    <button
                      onClick={() => toggleInterest('googleFit')}
                      className={`px-4 py-2 text-xs font-bold rounded-full ${
                        deviceInterest.googleFit ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                      disabled={!!savingInterest}
                    >
                      {deviceInterest.googleFit ? 'Interested ✓' : "I'm interested"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 flex items-center justify-center bg-white dark:bg-slate-700 rounded-xl shadow-sm">
                        <img src="/brands/oura-ring.png" alt="Oura Ring" className="h-6 w-auto" />
                      </div>
                      <span className="font-semibold text-sm">Oura Ring</span>
                    </div>
                    <button
                      onClick={() => toggleInterest('oura')}
                      className={`px-4 py-2 text-xs font-bold rounded-full ${
                        deviceInterest.oura ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                      disabled={!!savingInterest}
                    >
                      {deviceInterest.oura ? 'Interested ✓' : "I'm interested"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 flex items-center justify-center bg-white dark:bg-slate-700 rounded-xl shadow-sm">
                        <img src="/brands/polar.png" alt="Polar" className="h-6 w-auto" />
                      </div>
                      <span className="font-semibold text-sm">Polar</span>
                    </div>
                    <button
                      onClick={() => toggleInterest('polar')}
                      className={`px-4 py-2 text-xs font-bold rounded-full ${
                        deviceInterest.polar ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                      disabled={!!savingInterest}
                    >
                      {deviceInterest.polar ? 'Interested ✓' : "I'm interested"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 flex items-center justify-center bg-white dark:bg-slate-700 rounded-xl shadow-sm">
                        <img src="/brands/huawei-health.png" alt="Huawei Health" className="h-6 w-auto" />
                      </div>
                      <span className="font-semibold text-sm">Huawei Health</span>
                    </div>
                    <button
                      onClick={() => toggleInterest('huawei')}
                      className={`px-4 py-2 text-xs font-bold rounded-full ${
                        deviceInterest.huawei ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                      disabled={!!savingInterest}
                    >
                      {deviceInterest.huawei ? 'Interested ✓' : "I'm interested"}
                    </button>
                  </div>
                </div>

                <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl flex flex-col items-center text-center border border-slate-100 dark:border-slate-800/50">
                    <div className="h-12 w-full flex items-center justify-center mb-6">
                      <img src="/brands/fitbit.png" alt="Fitbit" className="h-8 w-auto object-contain" />
                    </div>
                    <span className="text-sm font-semibold mb-6">Fitbit</span>
                    {fitbitConnected ? (
                      <Link href="/devices" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold">
                        Connected ✓
                      </Link>
                    ) : (
                      <button
                        onClick={handleConnectFitbit}
                        className="w-full bg-helfi-green hover:bg-green-600 text-white py-3 rounded-xl font-bold transition-all"
                        disabled={fitbitLoading}
                      >
                        {fitbitLoading ? 'Connecting...' : 'Connect'}
                      </button>
                    )}
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl flex flex-col items-center text-center border border-slate-100 dark:border-slate-800/50">
                    <div className="h-12 w-full flex items-center justify-center mb-6">
                      <img src="/brands/garmin-connect.jpg" alt="Garmin Connect" className="h-8 w-auto object-contain rounded-md" />
                    </div>
                    <span className="text-sm font-semibold mb-6">Garmin Connect</span>
                    {!garminConnectEnabled ? (
                      <button
                        onClick={() => toggleInterest('garmin')}
                        className={`w-full py-3 rounded-xl font-bold transition-all ${
                          deviceInterest.garmin ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                        disabled={!!savingInterest}
                      >
                        {deviceInterest.garmin ? 'Interested ✓' : 'Connect'}
                      </button>
                    ) : garminConnected ? (
                      <Link href="/devices" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold">
                        Connected ✓
                      </Link>
                    ) : (
                      <Link href="/devices" className="w-full bg-helfi-green hover:bg-green-600 text-white py-3 rounded-xl font-bold">
                        Connect
                      </Link>
                    )}
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl flex flex-col items-center text-center border border-slate-100 dark:border-slate-800/50">
                    <div className="h-12 w-full flex items-center justify-center mb-6">
                      <img src="/brands/google-fit.png" alt="Google Fit" className="h-8 w-auto object-contain" />
                    </div>
                    <span className="text-sm font-semibold mb-6">Google Fit</span>
                    <button
                      onClick={() => toggleInterest('googleFit')}
                      className={`w-full py-3 rounded-xl font-bold transition-all ${
                        deviceInterest.googleFit ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                      disabled={!!savingInterest}
                    >
                      {deviceInterest.googleFit ? 'Interested ✓' : "I'm interested"}
                    </button>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl flex flex-col items-center text-center border border-slate-100 dark:border-slate-800/50">
                    <div className="h-12 w-full flex items-center justify-center mb-6">
                      <img src="/brands/oura-ring.png" alt="Oura Ring" className="h-8 w-auto object-contain" />
                    </div>
                    <span className="text-sm font-semibold mb-6">Oura Ring</span>
                    <button
                      onClick={() => toggleInterest('oura')}
                      className={`w-full py-3 rounded-xl font-bold transition-all ${
                        deviceInterest.oura ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                      disabled={!!savingInterest}
                    >
                      {deviceInterest.oura ? 'Interested ✓' : "I'm interested"}
                    </button>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl flex flex-col items-center text-center border border-slate-100 dark:border-slate-800/50">
                    <div className="h-12 w-full flex items-center justify-center mb-6">
                      <img src="/brands/polar.png" alt="Polar" className="h-8 w-auto object-contain" />
                    </div>
                    <span className="text-sm font-semibold mb-6">Polar</span>
                    <button
                      onClick={() => toggleInterest('polar')}
                      className={`w-full py-3 rounded-xl font-bold transition-all ${
                        deviceInterest.polar ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                      disabled={!!savingInterest}
                    >
                      {deviceInterest.polar ? 'Interested ✓' : "I'm interested"}
                    </button>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl flex flex-col items-center text-center border border-slate-100 dark:border-slate-800/50">
                    <div className="h-12 w-full flex items-center justify-center mb-6">
                      <img src="/brands/huawei-health.png" alt="Huawei Health" className="h-8 w-auto object-contain" />
                    </div>
                    <span className="text-sm font-semibold mb-6">Huawei Health</span>
                    <button
                      onClick={() => toggleInterest('huawei')}
                      className={`w-full py-3 rounded-xl font-bold transition-all ${
                        deviceInterest.huawei ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                      disabled={!!savingInterest}
                    >
                      {deviceInterest.huawei ? 'Interested ✓' : "I'm interested"}
                    </button>
                  </div>
                </div>
                <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8">
                  Selected integrations are available now. Other integrations are under review for security compliance.
                </p>
              </section>
            )}

            {/* Data Status Section */}
            <div className="mb-8">
              {onboardingData?.onboardingComplete ? (
                <section className="bg-[#ECFDF5] dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 rounded-[2rem] p-6 md:p-8 shadow-sm">
                  <div className="flex flex-col lg:flex-row items-center justify-between gap-10">
                    <div className="flex flex-col md:flex-row items-center md:items-start gap-8 text-center md:text-left">
                      <div className="h-20 w-20 bg-helfi-green rounded-full flex items-center justify-center text-white shadow-xl shadow-emerald-300/40 flex-shrink-0">
                        <span className="material-symbols-outlined text-4xl">verified</span>
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Onboarding Complete</h2>
                        <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-xl leading-relaxed">
                          Your health profile has been successfully created and synced across all your connected devices.
                        </p>
                        <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                          {onboardingData.personalInfo && (
                            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 shadow-sm">
                              Personal Info <span className="material-symbols-outlined text-[14px] ml-1.5">check</span>
                            </span>
                          )}
                          {onboardingData.physicalMetrics && (
                            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 shadow-sm">
                              Physical Metrics <span className="material-symbols-outlined text-[14px] ml-1.5">check</span>
                            </span>
                          )}
                          {onboardingData.healthGoals && (
                            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 shadow-sm">
                              Health Goals <span className="material-symbols-outlined text-[14px] ml-1.5">check</span>
                            </span>
                          )}
                          {onboardingData.medications && onboardingData.medications.length > 0 && (
                            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 shadow-sm">
                              Medications <span className="material-symbols-outlined text-[14px] ml-1.5">check</span>
                            </span>
                          )}
                          {onboardingData.supplements && onboardingData.supplements.length > 0 && (
                            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 shadow-sm">
                              Supplements <span className="material-symbols-outlined text-[14px] ml-1.5">check</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                      <button
                        onClick={handleEditOnboarding}
                        className="bg-helfi-green hover:bg-emerald-600 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg shadow-emerald-300/30 flex items-center justify-center space-x-2 whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-xl">edit</span>
                        <span>Edit Health Info</span>
                      </button>
                      <button
                        onClick={() => setShowResetConfirm(true)}
                        className="bg-[#334155] dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white px-8 py-4 rounded-xl font-bold transition-all flex items-center justify-center space-x-2 shadow-lg shadow-slate-900/10 whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-xl">refresh</span>
                        <span>Reset All Data</span>
                      </button>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 rounded-[2rem] p-6 md:p-8 shadow-sm">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                      <h3 className="text-xl font-semibold text-blue-900 dark:text-white mb-2">Complete your Health Setup</h3>
                      <p className="text-blue-700 dark:text-slate-300 mb-4">
                        Finish your health profile to unlock personalized insights and tracking.
                      </p>
                    </div>
                    <Link
                      href="/onboarding"
                      className="inline-flex items-center justify-center bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors font-semibold whitespace-nowrap"
                    >
                      {onboardingData ? 'Continue Health Setup' : 'Start Health Profile Setup'}
                    </Link>
                  </div>
                </section>
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
