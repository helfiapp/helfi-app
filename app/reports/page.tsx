'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'

export default function Reports() {
  const { data: session } = useSession()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Profile data - using consistent green avatar
  const defaultAvatar = 'data:image/svg+xml;base64,' + btoa(`
    <svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="64" fill="#10B981"/>
      <circle cx="64" cy="48" r="20" fill="white"/>
      <path d="M64 76c-13.33 0-24 5.34-24 12v16c0 8.84 7.16 16 16 16h16c8.84 0 16-7.16 16-16V88c0-6.66-10.67-12-24-12z" fill="white"/>
    </svg>
  `);
  const userImage = session?.user?.image || defaultAvatar;
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/dashboard" className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors mr-4">
              Back to Dashboard
            </Link>
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
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">Health Reports</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Weekly health analysis and trends</p>
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
              src={userImage}
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

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 pb-20 md:pb-8">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-helfi-black mb-4">
              Health Reports
            </h1>
            <p className="text-gray-600">
              Comprehensive analysis of your health trends and progress over time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-purple-50 p-6 rounded-lg border-2 border-purple-200">
              <h3 className="font-semibold text-helfi-black mb-2">📊 Weekly Summary</h3>
              <p className="text-sm text-gray-600 mb-4">Get a comprehensive overview of your weekly health data</p>
              <div className="mt-4 text-center">
                <span className="text-xl font-bold text-purple-600">Coming Soon</span>
              </div>
            </div>

            <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-200">
              <h3 className="font-semibold text-helfi-black mb-2">📈 Progress Tracking</h3>
              <p className="text-sm text-gray-600 mb-4">Monitor your progress toward health goals</p>
              <div className="mt-4 text-center">
                <span className="text-xl font-bold text-blue-600">Coming Soon</span>
              </div>
            </div>

            <div className="bg-green-50 p-6 rounded-lg border-2 border-green-200">
              <h3 className="font-semibold text-helfi-black mb-2">📋 Detailed Analysis</h3>
              <p className="text-sm text-gray-600 mb-4">In-depth analysis of health patterns and trends</p>
              <div className="mt-4 text-center">
                <span className="text-xl font-bold text-green-600">Coming Soon</span>
              </div>
            </div>

            <div className="bg-orange-50 p-6 rounded-lg border-2 border-orange-200">
              <h3 className="font-semibold text-helfi-black mb-2">🎯 Goal Assessment</h3>
              <p className="text-sm text-gray-600 mb-4">Evaluate progress toward your health objectives</p>
              <div className="mt-4 text-center">
                <span className="text-xl font-bold text-orange-600">Coming Soon</span>
              </div>
            </div>

            <div className="bg-red-50 p-6 rounded-lg border-2 border-red-200">
              <h3 className="font-semibold text-helfi-black mb-2">⚡ Insights Dashboard</h3>
              <p className="text-sm text-gray-600 mb-4">Key insights and recommendations from your data</p>
              <div className="mt-4 text-center">
                <span className="text-xl font-bold text-red-600">Coming Soon</span>
              </div>
            </div>

            <div className="bg-yellow-50 p-6 rounded-lg border-2 border-yellow-200">
              <h3 className="font-semibold text-helfi-black mb-2">📅 Monthly Report</h3>
              <p className="text-sm text-gray-600 mb-4">Comprehensive monthly health summary and trends</p>
              <div className="mt-4 text-center">
                <span className="text-xl font-bold text-yellow-600">Coming Soon</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation - Inspired by Google, Facebook, Amazon mobile apps */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
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

          {/* Health */}
          <Link href="/health-tracking" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Health</span>
          </Link>

          {/* Profile */}
          <Link href="/profile" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Profile</span>
          </Link>

          {/* Insights */}
          <Link href="/insights" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Insights</span>
          </Link>

          {/* Reports (Active) */}
          <Link href="/reports" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-helfi-green">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
              </svg>
            </div>
            <span className="text-xs text-helfi-green mt-1 font-bold truncate">Reports</span>
          </Link>

        </div>
      </nav>
    </div>
  )
} 