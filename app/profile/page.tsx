'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import BottomNav from '../../components/BottomNav'

export default function ProfilePage() {
  const { data: session } = useSession()
  const [onboardingData, setOnboardingData] = useState<any>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)

  // Profile data with better fallback - use SVG icon if no image
  const userImage = session?.user?.image;
  const userName = session?.user?.name || 'User';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('#profile-dropdown')) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick);
    } else {
      document.removeEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  useEffect(() => {
    // Load onboarding data
    const data = localStorage.getItem('onboardingData')
    if (data) {
      try {
        setOnboardingData(JSON.parse(data))
      } catch (error) {
        console.error('Error loading onboarding data:', error)
      }
    }
  }, [])

  const handleEditOnboarding = () => {
    if (onboardingData) {
      localStorage.setItem('onboardingData', JSON.stringify(onboardingData))
    }
    localStorage.setItem('isEditing', 'true')
    window.location.href = '/onboarding'
  }

  const handleResetData = () => {
    localStorage.removeItem('onboardingData')
    setOnboardingData(null)
    setShowResetDialog(false)
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      {/* Navigation Header */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
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
            <div className="ml-4">
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">Profile</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Manage your account information</p>
            </div>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/dashboard" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Dashboard
            </Link>
            <Link href="/profile" className="text-helfi-green font-medium">
              Profile
            </Link>
            
            {/* Desktop Profile Avatar & Dropdown */}
            <div className="relative ml-6" id="profile-dropdown">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="focus:outline-none"
                aria-label="Open profile menu"
              >
                {userImage ? (
                  <Image
                    src={userImage}
                    alt="Profile"
                    width={48}
                    height={48}
                    className="rounded-full border-2 border-helfi-green shadow-sm object-cover w-12 h-12"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full border-2 border-helfi-green shadow-sm bg-helfi-green flex items-center justify-center">
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                )}
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100 animate-fade-in">
                  <div className="flex items-center px-4 py-3 border-b border-gray-100">
                    {userImage ? (
                      <Image
                        src={userImage}
                        alt="Profile"
                        width={40}
                        height={40}
                        className="rounded-full object-cover mr-3"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-helfi-green flex items-center justify-center mr-3">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-gray-900">{userName}</div>
                      <div className="text-xs text-gray-500">{session?.user?.email || 'user@email.com'}</div>
                    </div>
                  </div>
                  <Link href="/profile" className="block px-4 py-2 text-helfi-green hover:bg-gray-50 font-medium">Profile</Link>
                  <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                  <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Upload/Change Profile Image</Link>
                  <Link href="/billing" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Subscription & Billing</Link>
                  <Link href="/notifications" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Notifications</Link>
                  <Link href="/privacy" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Privacy Settings</Link>
                  <Link href="/help" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
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

          {/* Mobile Navigation */}
          <div className="md:hidden flex items-center space-x-3">
            <div className="relative" id="mobile-profile-dropdown">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="focus:outline-none"
                aria-label="Open profile menu"
              >
                {userImage ? (
                  <Image
                    src={userImage}
                    alt="Profile"
                    width={40}
                    height={40}
                    className="rounded-full border-2 border-helfi-green shadow-sm object-cover w-10 h-10"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full border-2 border-helfi-green shadow-sm bg-helfi-green flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                )}
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl py-2 z-50 border border-gray-100 animate-fade-in">
                  <div className="flex items-center px-4 py-3 border-b border-gray-100">
                    {userImage ? (
                      <Image
                        src={userImage}
                        alt="Profile"
                        width={36}
                        height={36}
                        className="rounded-full object-cover mr-3"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-helfi-green flex items-center justify-center mr-3">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{userName}</div>
                      <div className="text-xs text-gray-500 truncate">{session?.user?.email || 'user@email.com'}</div>
                    </div>
                  </div>
                  <div className="py-1">
                    <Link href="/dashboard" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 text-sm">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v0" />
                        </svg>
                        Dashboard
                      </div>
                    </Link>
                    <Link href="/profile" className="block px-4 py-3 text-helfi-green hover:bg-gray-50 text-sm font-medium">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-3 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile
                      </div>
                    </Link>
                    <Link href="/account" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 text-sm">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Account Settings
                      </div>
                    </Link>
                    <Link href="/help" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 text-sm">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Help & Support
                      </div>
                    </Link>
                  </div>
                  <div className="border-t border-gray-100 pt-1">
                    <button
                      onClick={() => signOut()}
                      className="block w-full text-left px-4 py-3 text-red-600 hover:bg-red-50 font-semibold text-sm"
                    >
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Logout
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-8">
          {/* Profile Header */}
          <div className="flex flex-col md:flex-row md:items-center md:space-x-6 mb-8">
            <div className="relative mx-auto md:mx-0 mb-6 md:mb-0">
              {userImage ? (
                <Image
                  src={userImage}
                  alt="Profile"
                  width={120}
                  height={120}
                  className="rounded-full border-4 border-helfi-green shadow-lg object-cover w-30 h-30"
                />
              ) : (
                <div className="w-30 h-30 rounded-full border-4 border-helfi-green shadow-lg bg-helfi-green flex items-center justify-center">
                  <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
              )}
              <Link 
                href="/profile/image"
                className="absolute bottom-0 right-0 bg-helfi-green text-white rounded-full p-2 shadow-lg hover:bg-helfi-green/90 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </Link>
            </div>
            <div className="text-center md:text-left flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{userName}</h1>
              <p className="text-gray-600 mb-6">{session?.user?.email}</p>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Profile Information</h2>
              
              <div className="flex flex-col space-y-3">
                <button
                  onClick={handleEditOnboarding}
                  className="btn-mobile-primary w-full"
                >
                  ✏️ Edit Profile
                </button>
                <button
                  onClick={() => setShowResetDialog(true)}
                  className="bg-red-100 text-red-700 px-4 py-3 rounded-lg hover:bg-red-200 transition-colors font-medium w-full"
                >
                  🔄 Reset All Data
                </button>
              </div>
            </div>
          </div>

          {/* Profile Information */}
          {onboardingData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-gray-500">Gender:</span>
                    <span className="ml-2 text-gray-900 capitalize">{onboardingData.gender || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Weight:</span>
                    <span className="ml-2 text-gray-900">{onboardingData.weight || 'Not specified'} {onboardingData.unit === 'metric' ? 'kg' : 'lbs'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Height:</span>
                    <span className="ml-2 text-gray-900">{onboardingData.height || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Body Type:</span>
                    <span className="ml-2 text-gray-900 capitalize">{onboardingData.bodyType || 'Not specified'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Health & Fitness</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-gray-500">Exercise Frequency:</span>
                    <span className="ml-2 text-gray-900">{onboardingData.exerciseFrequency || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Exercise Types:</span>
                    <span className="ml-2 text-gray-900">{onboardingData.exerciseTypes?.join(', ') || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Health Goals:</span>
                    <div className="mt-1">
                      {onboardingData.healthGoals?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {onboardingData.healthGoals.map((goal: string, index: number) => (
                            <span key={index} className="bg-helfi-green/10 text-helfi-green px-2 py-1 rounded text-xs">
                              {goal}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-900">Not specified</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/profile/image" className="bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition-colors">
              <div className="flex items-center space-x-3">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div>
                  <h4 className="font-medium text-gray-900">Change Photo</h4>
                  <p className="text-sm text-gray-600">Update your profile picture</p>
                </div>
              </div>
            </Link>

            <Link href="/notifications" className="bg-green-50 border border-green-200 rounded-lg p-4 hover:bg-green-100 transition-colors">
              <div className="flex items-center space-x-3">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM4.868 19.462A17.173 17.173 0 003 12C3 5.373 8.373 0 15 0s12 5.373 12 12-5.373 12-12 12a11.99 11.99 0 01-8.132-3.538z" />
                </svg>
                <div>
                  <h4 className="font-medium text-gray-900">Notifications</h4>
                  <p className="text-sm text-gray-600">Manage your preferences</p>
                </div>
              </div>
            </Link>

            <Link href="/privacy" className="bg-purple-50 border border-purple-200 rounded-lg p-4 hover:bg-purple-100 transition-colors">
              <div className="flex items-center space-x-3">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <div>
                  <h4 className="font-medium text-gray-900">Privacy</h4>
                  <p className="text-sm text-gray-600">Control your data</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Reset All Health Data</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-700 mb-4">
                Are you sure you want to reset all your health data? This will permanently delete:
              </p>
              <ul className="text-sm text-gray-600 space-y-1 ml-4">
                <li>• Personal information (weight, height, body type)</li>
                <li>• Exercise preferences and frequency</li>
                <li>• Health goals and situations</li>
                <li>• Supplement and medication data</li>
                <li>• All progress and insights</li>
              </ul>
              <p className="text-red-600 font-medium text-sm mt-4">
                This action cannot be undone. You will need to complete the onboarding process again.
              </p>
            </div>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={handleResetData}
                className="btn-mobile-danger"
              >
                Yes, Reset All Data
              </button>
              <button
                onClick={() => setShowResetDialog(false)}
                className="btn-mobile-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
} 