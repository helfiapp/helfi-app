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

  // Profile data
  const userImage = session?.user?.image || 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749922074/WOMAN_TALKING_INTO_HER_PHONE_zi9fh8.jpg';
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
      {/* Mobile-first Design: Top header for desktop, bottom nav for mobile */}
      
      {/* Desktop Navigation Header */}
      <nav className="hidden md:block bg-white border-b border-gray-200 px-4 py-3">
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
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">Health Dashboard</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Welcome back, {userName}</p>
            </div>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/dashboard" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Dashboard
            </Link>
            <Link href="/health-tracking" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Health Tracking
            </Link>
            <Link href="/insights" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              AI Insights
            </Link>
            <Link href="/reports" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Reports
            </Link>
            <Link href="/onboarding?step=1" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Health Info
            </Link>
            
            {/* Desktop Profile Avatar & Dropdown */}
            <div className="relative ml-6" id="profile-dropdown">
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
                  className="rounded-full border-2 border-helfi-green shadow-sm object-cover w-12 h-12"
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
                      className="rounded-full object-cover mr-3"
                    />
                    <div>
                      <div className="font-semibold text-gray-900">{userName}</div>
                      <div className="text-xs text-gray-500">{session?.user?.email || 'user@email.com'}</div>
                    </div>
                  </div>
                  <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
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
        </div>
      </nav>

      {/* Mobile Top Header - Minimal */}
      <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <Image
            src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
            alt="Helfi Logo"
            width={40}
            height={40}
            className="object-contain"
            priority
          />
        </div>
        
        {/* Mobile Profile */}
        <div className="relative" id="mobile-profile-dropdown">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="focus:outline-none"
            aria-label="Open profile menu"
          >
            <Image
              src={session?.user?.image || 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749922074/WOMAN_TALKING_INTO_HER_PHONE_zi9fh8.jpg'}
              alt="Profile"
              width={36}
              height={36}
              className="rounded-full border-2 border-helfi-green shadow-sm object-cover"
            />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100">
              <div className="flex items-center px-4 py-3 border-b border-gray-100">
                <Image
                  src={session?.user?.image || 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749922074/WOMAN_TALKING_INTO_HER_PHONE_zi9fh8.jpg'}
                  alt="Profile"
                  width={40}
                  height={40}
                  className="rounded-full object-cover mr-3"
                />
                <div>
                  <div className="font-semibold text-gray-900">{userName}</div>
                  <div className="text-xs text-gray-500">{session?.user?.email || 'user@email.com'}</div>
                </div>
              </div>
              <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
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
                      <div className="text-2xl mb-1">🔵</div>
                      <div className="text-xs font-medium text-gray-700">Oura Ring</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-blue-600">Connect</div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer group">
                    <div className="text-center">
                      <div className="text-2xl mb-1">🏔️</div>
                      <div className="text-xs font-medium text-gray-700">Garmin</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-blue-600">Connect</div>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer group">
                    <div className="text-center">
                      <div className="text-2xl mb-1">🤖</div>
                      <div className="text-xs font-medium text-gray-700">Google Fit</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-blue-600">Connect</div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer group">
                    <div className="text-center">
                      <div className="text-2xl mb-1">⚖️</div>
                      <div className="text-xs font-medium text-gray-700">Withings</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-blue-600">Connect</div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer group">
                    <div className="text-center">
                      <div className="text-2xl mb-1">❄️</div>
                      <div className="text-xs font-medium text-gray-700">Polar</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-blue-600">Connect</div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer group">
                    <div className="text-center">
                      <div className="text-2xl mb-1">📱</div>
                      <div className="text-xs font-medium text-gray-700">Samsung</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-blue-600">Connect</div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="flex items-start space-x-3">
                    <div className="text-blue-600 text-lg">💡</div>
                    <div>
                      <h4 className="font-medium text-blue-900 mb-1">What data can we access?</h4>
                      <ul className="text-sm text-blue-700 space-y-1">
                        <li>• Heart rate, steps, and activity levels</li>
                        <li>• Sleep quality and recovery metrics</li>
                        <li>• Workout intensity and calories burned</li>
                        <li>• Blood oxygen and stress indicators</li>
                      </ul>
                      <p className="text-xs text-blue-600 mt-2 font-medium">
                        🔒 Your data is encrypted and never shared with third parties
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Onboarding Data Section */}
            {onboardingData && (
              <div className="mt-8 bg-gray-50 rounded-lg p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Profile Information</h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleEditOnboarding}
                      className="w-full bg-helfi-green text-white px-4 py-3 rounded-lg hover:bg-helfi-green/90 transition-colors text-sm font-medium"
                    >
                      ✏️ Edit Profile
                    </button>
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      className="w-full bg-red-500 text-white px-4 py-3 rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
                    >
                      🔄 Reset All Data
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Gender:</strong> {onboardingData.gender}
                  </div>
                  <div>
                    <strong>Weight:</strong> {onboardingData.weight} {onboardingData.unit === 'metric' ? 'kg' : 'lbs'}
                  </div>
                  <div>
                    <strong>Height:</strong> {onboardingData.height || `${onboardingData.feet}'${onboardingData.inches}"`}
                  </div>
                  <div>
                    <strong>Body Type:</strong> {onboardingData.bodyType}
                  </div>
                  <div>
                    <strong>Exercise Frequency:</strong> {onboardingData.exerciseFrequency}
                  </div>
                  <div>
                    <strong>Exercise Types:</strong> {(onboardingData.exerciseTypes || []).join(', ')}
                  </div>
                  <div className="md:col-span-2">
                    <strong>Health Goals:</strong> {(onboardingData.goals || []).join(', ')}
                  </div>
                  {onboardingData.healthIssues && (
                    <div className="md:col-span-2">
                      <strong>Health Issues:</strong> {onboardingData.healthIssues}
                    </div>
                  )}
                  {onboardingData.healthProblems && (
                    <div className="md:col-span-2">
                      <strong>Health Problems:</strong> {onboardingData.healthProblems}
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <strong>Supplements:</strong> {(onboardingData.supplements || []).map((s: any) => 
                      `${s.name} (${s.dosage}, ${Array.isArray(s.timing) ? s.timing.join(', ') : s.timing})`
                    ).join('; ') || 'None'}
                  </div>
                  <div className="md:col-span-2">
                    <strong>Medications:</strong> {(onboardingData.medications || []).map((m: any) => 
                      `${m.name} (${m.dosage}, ${Array.isArray(m.timing) ? m.timing.join(', ') : m.timing})`
                    ).join('; ') || 'None'}
                  </div>
                </div>
              </div>
            )}

            {!onboardingData && (
              <div className="mt-8 text-center">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-yellow-800 mb-2">Complete Your Profile</h3>
                  <p className="text-yellow-700 mb-4">
                    To get personalized health insights, please complete your onboarding profile.
                  </p>
                  <button
                    onClick={handleEditOnboarding}
                    className="bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green/90 transition-colors"
                  >
                    Start Profile Setup
                  </button>
                </div>
              </div>
            )}

            <div className="text-center mt-8">
              <div className="inline-flex items-center px-4 py-2 bg-helfi-green/10 text-helfi-green rounded-full text-sm">
                ✨ Your health journey starts here - Features launching soon!
              </div>
            </div>

            {session?.user && (
              <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  Logged in as: <span className="font-medium">{session.user.email}</span>
                </p>
              </div>
            )}

            {/* Reset Confirmation Modal */}
            {showResetConfirm && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md mx-4">
                  <h3 className="text-lg font-semibold text-red-600 mb-4">⚠️ Reset All Data</h3>
                  <p className="text-gray-700 mb-6">
                    Are you sure you want to reset all your data? This will permanently delete all your:
                  </p>
                  <ul className="text-sm text-gray-600 mb-6 space-y-1">
                    <li>• Profile information</li>
                    <li>• Health goals and preferences</li>
                    <li>• Supplement and medication data</li>
                    <li>• Health situation details</li>
                    <li>• Blood results uploads</li>
                  </ul>
                  <p className="text-red-600 font-medium mb-6">
                    This action cannot be undone!
                  </p>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowResetConfirm(false)}
                      className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResetData}
                      className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                    >
                      Yes, Reset All
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
          
          {/* Dashboard */}
          <Link href="/dashboard" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-helfi-green">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            </div>
            <span className="text-xs text-helfi-green font-medium mt-1">Dashboard</span>
          </Link>

          {/* Health Tracking */}
          <Link href="/health-tracking" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-xs text-gray-500 mt-1">Health</span>
          </Link>

          {/* Health Info (Onboarding) */}
          <Link href="/onboarding?step=1" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="text-xs text-gray-500 mt-1">Profile</span>
          </Link>

          {/* AI Insights */}
          <Link href="/insights" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-xs text-gray-500 mt-1">Insights</span>
          </Link>

          {/* Reports */}
          <Link href="/reports" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-xs text-gray-500 mt-1">Reports</span>
          </Link>

        </div>
      </nav>
    </div>
  )
} 