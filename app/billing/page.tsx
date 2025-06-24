'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

export default function BillingPage() {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(true)
  const [currentPlan, setCurrentPlan] = useState('free')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [profileImage, setProfileImage] = useState<string>('')
  const router = useRouter()

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

  // Load profile image from database
  useEffect(() => {
    const loadProfileImage = async () => {
      try {
        const response = await fetch('/api/user-data');
        if (response.ok) {
          const result = await response.json();
          if (result.data && result.data.profileImage) {
            setProfileImage(result.data.profileImage);
          }
        }
      } catch (error) {
        console.error('Error loading profile image:', error);
      }
    };

    if (session) {
      loadProfileImage();
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      setLoading(false)
    }
  }, [session])

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header - First Row */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/dashboard" className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors">
              Back to Dashboard
            </Link>
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
          </div>

          {/* Logo on the right */}
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
        </div>
      </nav>

      {/* Second Row - Page Title and Profile */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div></div> {/* Empty div for spacing */}
          
          {/* Centered Page Title */}
          <div className="text-center">
            <h1 className="text-lg md:text-xl font-semibold text-gray-900">Subscription & Billing</h1>
            <p className="text-sm text-gray-500 hidden sm:block">Manage your subscription and billing information</p>
          </div>
          
          {/* Desktop Profile Avatar & Dropdown */}
          <div className="hidden md:flex">
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
                  <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
                  <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                  <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Upload/Change Profile Photo</Link>
                  <Link href="/billing" className="block px-4 py-2 text-gray-700 hover:bg-gray-50 bg-gray-50 font-medium">Subscription & Billing</Link>
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

          {/* Mobile Profile - Show on mobile */}
          <div className="md:hidden">
            <div className="relative dropdown-container" id="mobile-profile-dropdown">
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
                  className="w-9 h-9 rounded-full border-2 border-helfi-green shadow-sm object-cover"
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
                      className="w-10 h-10 rounded-full object-cover mr-3"
                    />
                    <div>
                      <div className="font-semibold text-gray-900">{userName}</div>
                      <div className="text-xs text-gray-500">{session?.user?.email || 'user@email.com'}</div>
                    </div>
                  </div>
                  <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
                  <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                  <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Upload/Change Profile Photo</Link>
                  <Link href="/billing" className="block px-4 py-2 text-gray-700 hover:bg-gray-50 bg-gray-50 font-medium">Subscription & Billing</Link>
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
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Current Plan */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Current Plan</h2>
          <div className="bg-helfi-green/10 border border-helfi-green/20 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-helfi-green">Free Plan</h3>
                <p className="text-gray-600 mt-2">Basic health tracking and insights</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-helfi-green">$0</p>
                <p className="text-gray-600">per month</p>
              </div>
            </div>
          </div>
        </div>

        {/* Available Plans */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Available Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Free Plan */}
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Free</h3>
              <p className="text-3xl font-bold text-gray-900 mb-4">$0<span className="text-sm font-normal">/month</span></p>
              <ul className="space-y-2 mb-6">
                <li className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Basic health tracking
                </li>
                <li className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Weekly insights
                </li>
                <li className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Basic reports
                </li>
              </ul>
              <button className="w-full bg-gray-100 text-gray-400 px-4 py-2 rounded-lg cursor-not-allowed">
                Current Plan
              </button>
            </div>

            {/* Pro Plan */}
            <div className="border-2 border-helfi-green rounded-lg p-6 relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-helfi-green text-white px-3 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Pro</h3>
              <p className="text-3xl font-bold text-gray-900 mb-4">$9.99<span className="text-sm font-normal">/month</span></p>
              <ul className="space-y-2 mb-6">
                <li className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Advanced health tracking
                </li>
                <li className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Daily AI insights
                </li>
                <li className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Detailed analytics
                </li>
                <li className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Device integrations
                </li>
              </ul>
              <button className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors">
                Upgrade to Pro
              </button>
            </div>

            {/* Premium Plan */}
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Premium</h3>
              <p className="text-3xl font-bold text-gray-900 mb-4">$12.99<span className="text-sm font-normal">/month</span></p>
              <ul className="space-y-2 mb-6">
                <li className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Everything in Pro
                </li>
                <li className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Personal health coach
                </li>
                <li className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Priority support
                </li>
                <li className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Custom meal plans
                </li>
              </ul>
              <button className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
                Upgrade to Premium
              </button>
            </div>
          </div>
        </div>

        {/* Billing History */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Billing History</h2>
          <div className="text-center py-8">
            <p className="text-gray-500">No billing history available.</p>
            <p className="text-sm text-gray-400 mt-2">Your billing history will appear here after your first payment.</p>
          </div>
        </div>
      </div>
    </div>
  )
} 