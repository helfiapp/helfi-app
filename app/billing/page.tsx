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
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
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
    // Clear user-specific localStorage before signing out
    if (session?.user?.id) {
      localStorage.removeItem(`profileImage_${session.user.id}`);
      localStorage.removeItem(`cachedProfileImage_${session.user.id}`);
    }
    await signOut({ callbackUrl: '/auth/signin' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header - First Row */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/dashboard" className="text-gray-700 dark:text-gray-300 hover:text-helfi-green transition-colors font-medium">
              Dashboard
            </Link>
            <Link href="/insights" className="text-gray-700 dark:text-gray-300 hover:text-helfi-green transition-colors font-medium">
              AI Insights
            </Link>
            <Link href="/food" className="text-gray-700 dark:text-gray-300 hover:text-helfi-green transition-colors font-medium">
              Food
            </Link>
            <Link href="/onboarding?step=1" className="text-gray-700 dark:text-gray-300 hover:text-helfi-green transition-colors font-medium">
              Intake
            </Link>
            <Link href="/settings" className="text-gray-700 dark:text-gray-300 hover:text-helfi-green transition-colors font-medium">
              Settings
            </Link>
          </div>

          {/* Logo */}
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
                <Link href="/settings" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium">← Back to Settings</Link>
                <div className="border-t border-gray-100 dark:border-gray-700 my-2"></div>
                <Link href="/profile" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Profile</Link>
                <Link href="/account" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Account Settings</Link>
                <Link href="/profile/image" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Upload/Change Profile Photo</Link>
                <Link href="/billing" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 bg-gray-50 dark:bg-gray-700 font-medium">Subscription & Billing</Link>
                <Link href="/help" className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Help & Support</Link>
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

      {/* Second Row - Page Title Centered */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">Subscription & Billing</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">Manage your subscription and billing information</p>
        </div>
      </div>

      {/* Main Content */}
              <div className="max-w-6xl mx-auto px-6 py-8 pb-24 md:pb-8">
        {/* Current Plan */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Current Plan</h2>
          <div className="bg-helfi-green/10 border border-helfi-green/20 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-helfi-green">Free 7‑Day Trial</h3>
                <p className="text-gray-600 mt-2">Trial caps: 3 food photos/day, 1 re‑analysis/photo, 1 interaction/day</p>
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
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Plans</h2>
            <div className="flex items-center gap-2 text-sm">
              <span className={billingCycle === 'monthly' ? 'font-semibold text-gray-900' : 'text-gray-500'}>Monthly</span>
              <button
                onClick={() => setBillingCycle((v) => (v === 'monthly' ? 'yearly' : 'monthly'))}
                className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200"
                aria-label="Toggle yearly billing"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
              <span className={billingCycle === 'yearly' ? 'font-semibold text-gray-900' : 'text-gray-500'}>Yearly</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Free Plan */}
            <div className="border border-gray-200 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Free 7‑Day Trial</h3>
              <p className="text-3xl font-bold text-gray-900 mb-4">$0<span className="text-sm font-normal">/month</span></p>
              <ul className="space-y-2 mb-6 text-sm text-gray-600">
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> All core features for 7 days</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> 3 food photos/day</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> 1 re‑analysis per photo</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> 1 interaction check/day</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Medical image analysis not included</li>
              </ul>
              <button className="w-full bg-gray-100 text-gray-400 px-4 py-2 rounded-lg cursor-not-allowed">Current Plan</button>
            </div>

            {/* Premium */}
            <div className="border-2 border-helfi-green rounded-2xl p-8 relative shadow-sm hover:shadow-lg transition-shadow bg-white">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-helfi-green text-white px-3 py-1 rounded-full text-sm font-medium">Most Popular</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Premium</h3>
              <p className="text-3xl font-bold text-gray-900 mb-1">
                {billingCycle === 'monthly' ? '$20' : '$216'}
                <span className="text-sm font-normal">/{billingCycle === 'monthly' ? 'month' : 'year'}</span>
              </p>
              {billingCycle === 'yearly' && (
                <p className="text-xs text-gray-500 mb-4">$18/month billed yearly</p>
              )}
              <ul className="space-y-2 mb-6 text-sm text-gray-600">
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> 30 food photo analyses/day</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> 30 re‑analyses/day</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> 30 medical image analyses/day</li>
              </ul>
              <button
                onClick={() => {
                  alert('We are currently in the process of building this amazing application. If you would like to be notified the moment we go live, please sign up below on the homepage.')
                  window.location.href = '/#waitlist-signup'
                }}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors"
              >
                {billingCycle === 'monthly' ? 'Start 7‑Day Free Trial' : 'Start 7‑Day Free Trial'}
              </button>
            </div>

            {/* Premium Plus */}
            <div className="border border-gray-200 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Premium Plus</h3>
              <p className="text-3xl font-bold text-gray-900 mb-1">
                {billingCycle === 'monthly' ? '$30' : '$312'}
                <span className="text-sm font-normal">/{billingCycle === 'monthly' ? 'month' : 'year'}</span>
              </p>
              {billingCycle === 'yearly' && (
                <p className="text-xs text-gray-500 mb-4">$26/month billed yearly</p>
              )}
              <ul className="space-y-2 mb-6 text-sm text-gray-600">
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Everything in Premium</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Higher usage limits (set in app)</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Priority support</li>
              </ul>
              <button
                onClick={() => {
                  alert('We are currently in the process of building this amazing application. If you would like to be notified the moment we go live, please sign up below on the homepage.')
                  window.location.href = '/#waitlist-signup'
                }}
                className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                {billingCycle === 'monthly' ? 'Upgrade to Premium Plus' : 'Upgrade to Premium Plus'}
              </button>
            </div>
          </div>
        </div>

        {/* Credits */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Buy Extra Credits</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">100 Credits</h3>
              <p className="text-2xl font-bold text-gray-900 mb-4">$5</p>
              <p className="text-sm text-gray-600 mb-6">Use for additional AI analyses. Credits never expire.</p>
              <button
                onClick={() => {
                  alert('We are currently in the process of building this amazing application. If you would like to be notified the moment we go live, please sign up below on the homepage.')
                  window.location.href = '/#waitlist-signup'
                }}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors"
              >
                Buy 100 Credits – $5
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

      {/* Mobile Bottom Navigation */}
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