'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'

export default function Dashboard() {
  const { data: session } = useSession()
  const [onboardingData, setOnboardingData] = useState<any>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [profileImage, setProfileImage] = useState<string | null>(null)

  // Profile data - using consistent green avatar
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
        console.log('Loading user data from database...');
        const response = await fetch('/api/user-data', {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            console.log('Successfully loaded data from database:', result.data);
            setOnboardingData(result.data);
            // Load profile image from database and cache it
            if (result.data.profileImage) {
              setProfileImage(result.data.profileImage);
              // Cache in localStorage for instant loading on other pages
              localStorage.setItem('cachedProfileImage', result.data.profileImage);
            }
          }
        } else if (response.status === 404) {
          console.log('No existing data found for user in database');
          setOnboardingData(null);
        } else if (response.status === 401) {
          console.log('User not authenticated - redirecting to login');
          // Don't use localStorage fallback, force proper authentication
          setOnboardingData(null);
        } else {
          console.error('Failed to load data from database:', response.status, response.statusText);
          setOnboardingData(null);
        }
      } catch (error) {
        console.error('Error loading user data from database:', error);
        // No localStorage fallback - force database-only approach
        setOnboardingData(null);
      }
    };

    // Load cached profile image immediately for instant display
    const cachedImage = localStorage.getItem('cachedProfileImage');
    if (cachedImage) {
      setProfileImage(cachedImage);
    }

    loadUserData();
  }, []);

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header - First Row */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
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
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100 animate-fade-in">
                <div className="flex items-center px-4 py-3 border-b border-gray-100">
                  <Image
                    src={userImage}
                    alt="Profile"
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover mr-3"
                  />
                  <div>
                    <div className="font-semibold text-gray-900">{userName}</div>
                    <div className="text-xs text-gray-500">{session?.user?.email || 'user@email.com'}</div>
                  </div>
                </div>
                <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Upload/Change Profile Photo</Link>
                <Link href="/billing" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Subscription & Billing</Link>
                <Link href="/notifications" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Notifications</Link>
                <Link href="/privacy" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Privacy Settings</Link>
                <Link href="/help" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
                <div className="border-t border-gray-100 my-2"></div>
                <Link href="/reports" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Reports</Link>
                <button
                  onClick={() => signOut()}
                  className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50 font-semibold"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Second Row - Page Title Centered */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-lg md:text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 hidden sm:block">Welcome back, {userName}</p>
        </div>
      </div>

      {/* Main Content - Add padding bottom for mobile nav */}
      <main className="flex-1 pb-20 md:pb-0">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-helfi-black mb-4">
                Welcome to Your Health Dashboard
              </h1>
              <p className="text-gray-600">
                Your personalized health intelligence platform is being built!
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-helfi-green/5 p-6 rounded-lg border-2 border-helfi-green/20">
                <h3 className="font-semibold text-helfi-black mb-2">🎯 Health Tracking</h3>
                <p className="text-sm text-gray-600">Track your daily metrics and progress</p>
                <div className="mt-4 text-center">
                  <span className="text-2xl font-bold text-helfi-green">Coming Soon</span>
                </div>
              </div>

              <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-200">
                <h3 className="font-semibold text-helfi-black mb-2">🤖 AI Insights</h3>
                <p className="text-sm text-gray-600">Personalized health recommendations</p>
                <div className="mt-4 text-center">
                  <span className="text-2xl font-bold text-blue-600">Coming Soon</span>
                </div>
              </div>

              <div className="bg-purple-50 p-6 rounded-lg border-2 border-purple-200">
                <h3 className="font-semibold text-helfi-black mb-2">📊 Reports</h3>
                <p className="text-sm text-gray-600">Weekly health analysis and trends</p>
                <div className="mt-4 text-center">
                  <span className="text-2xl font-bold text-purple-600">Coming Soon</span>
                </div>
              </div>
            </div>

            {/* Device Integration Section */}
            {onboardingData && (
              <div className="mb-8 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-6 border border-blue-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-helfi-black mb-2">📱 Connect Your Devices</h3>
                    <p className="text-sm text-gray-600">Sync your smartwatch and fitness devices for better health insights</p>
                  </div>
                  <div className="text-green-600 text-sm font-medium">
                    Enhanced Analytics
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer group">
                    <div className="text-center">
                      <div className="text-2xl mb-1">⌚</div>
                      <div className="text-xs font-medium text-gray-700">Apple Watch</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-blue-600">Connect</div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer group">
                    <div className="text-center">
                      <div className="text-2xl mb-1">🏃</div>
                      <div className="text-xs font-medium text-gray-700">Fitbit</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-blue-600">Connect</div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer group">
                    <div className="text-center">
                      <div className="text-2xl mb-1">💪</div>
                      <div className="text-xs font-medium text-gray-700">Garmin</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-blue-600">Connect</div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer group">
                    <div className="text-center">
                      <div className="text-2xl mb-1">📊</div>
                      <div className="text-xs font-medium text-gray-700">Other</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-blue-600">Connect</div>
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
              {onboardingData ? (
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
                      <h3 className="text-lg font-semibold text-blue-900 mb-2">🚀 Get Started</h3>
                      <p className="text-blue-700 mb-4">
                        Complete your health profile to unlock personalized insights and tracking
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
                    Start Health Profile Setup
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

      {/* Mobile Bottom Navigation - Inspired by Google, Facebook, Amazon mobile apps */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          
          {/* Dashboard (Active) */}
          <Link href="/dashboard" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-helfi-green">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            </div>
            <span className="text-xs text-helfi-green mt-1 font-bold truncate">Dashboard</span>
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

          {/* Settings */}
          <Link href="/settings" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Settings</span>
          </Link>

        </div>
      </nav>
    </div>
  )
} 