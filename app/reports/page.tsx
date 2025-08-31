'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { useUserData } from '@/components/providers/UserDataProvider'

export default function Reports() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const { userData, profileImage } = useUserData()
  const [dropdownOpen, setDropdownOpen] = useState(false)

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

  const [reports, setReports] = useState<any[]>([])
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false)

  useEffect(() => {
    async function loadPreview() {
      try {
        setLoadingPreview(true)
        const res = await fetch('/api/reports/weekly/list?preview=1', { cache: 'no-cache' })
        const data = await res.json().catch(() => ({}))
        if (data?.reports && Array.isArray(data.reports)) {
          setReports(data.reports)
        }
      } catch (e) {
        // ignore preview errors
      } finally {
        setLoadingPreview(false)
      }
    }
    loadPreview()
  }, [])

  // Profile image now loaded from UserDataProvider cache - no API call needed!

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header - CONSISTENT WITH OTHER PAGES */}
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
                <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
                <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Upload/Change Profile Photo</Link>
                <Link href="/billing" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Subscription & Billing</Link>
                <Link href="/notifications" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Notifications</Link>
                <Link href="/privacy" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Privacy Settings</Link>
                <Link href="/help" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                  className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50 font-semibold"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Second Row - Page Title Centered (CONSISTENT WITH OTHER PAGES) */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-lg md:text-xl font-semibold text-gray-900">Health Reports</h1>
          <p className="text-sm text-gray-500 hidden sm:block">Weekly health analysis and trends</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 pb-24 md:pb-8">
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
            {reports.length > 0 ? (
              reports.map((r) => (
                <div key={r.id} className="bg-purple-50 p-6 rounded-lg border-2 border-purple-200">
                  <h3 className="font-semibold text-helfi-black mb-1">📊 Weekly Summary</h3>
                  <p className="text-sm text-gray-600 mb-2">Week starting {r.weekStart}</p>
                  <div className="text-sm text-purple-800">{r.summary}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-600">{loadingPreview ? 'Loading preview…' : 'No reports yet.'}</div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation - with pressed, ripple and active states */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
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

          {/* Health */}
          <Link href="/health-tracking" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/health-tracking' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/health-tracking' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Health</span>
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

          {/* Insights */}
          <Link href="/insights" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/insights' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/insights' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Insights</span>
          </Link>

          {/* Reports (Active) */}
          <Link href="/reports" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/reports' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/reports' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Reports</span>
          </Link>

        </div>
      </nav>
    </div>
  )
} 