'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { useUserData } from '@/components/providers/UserDataProvider'

export default function Profile() {
  const { data: session } = useSession()
  const { userData, profileImage, updateUserData, updateProfileImage, refreshData } = useUserData()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: session?.user?.email || '',
    bio: '',
    dateOfBirth: '',
    gender: ''
  })

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

  // Load cached data from provider (no API call needed!)
  useEffect(() => {
    if (userData && session) {
      console.log('Profile page - Loading data from UserDataProvider cache (no API call)...');
      // Use cached data from provider instead of making API call
      const mergedData = {
        firstName: userData.profileInfo?.firstName || '',
        lastName: userData.profileInfo?.lastName || '',
        bio: userData.profileInfo?.bio || '',
        dateOfBirth: userData.profileInfo?.dateOfBirth || '',
        gender: userData.profileInfo?.gender || userData.gender || '',
        email: session?.user?.email || ''
      };
      setProfileData(mergedData);
      console.log('Profile page - Data loaded from cache instantly!');
    } else if (!userData && session) {
      // Fallback to localStorage while provider loads
      const savedProfile = localStorage.getItem('profileData');
      if (savedProfile) {
        try {
          const parsed = JSON.parse(savedProfile);
          setProfileData(prev => ({
            ...prev,
            ...parsed,
            email: session?.user?.email || prev.email
          }));
          console.log('Profile page - Loaded from localStorage fallback');
        } catch (e) {
          console.error('Error parsing saved profile:', e);
        }
      }
    }
  }, [userData, session]);

  // Auto-save when data changes
  useEffect(() => {
    if (!profileData.firstName && !profileData.lastName && !profileData.bio) return; // Don't save empty initial state
    
    setSaveStatus('saving');
    const saveTimer = setTimeout(async () => {
      try {
        // Save to database
        const response = await fetch('/api/user-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileInfo: profileData })
        });

        if (response.ok) {
          // Successful save to database - update provider cache too!
          updateUserData({ profileInfo: profileData });
          localStorage.setItem('profileData', JSON.stringify(profileData));
          setSaveStatus('saved');
          console.log('Profile auto-saved successfully to database and cache updated!');
        } else {
          throw new Error(`Failed to save: ${response.status} ${response.statusText}`);
        }
        
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (error) {
        console.error('Error saving profile to database:', error);
        // Save to localStorage as fallback
        localStorage.setItem('profileData', JSON.stringify(profileData));
        setSaveStatus('saved');
        console.log('Profile saved to localStorage as fallback');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    }, 1000); // Debounce saves by 1 second

    return () => clearTimeout(saveTimer);
  }, [profileData]);

  const updateProfileData = (field: string, value: string) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
  };

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
                <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50 bg-gray-50 font-medium">Profile</Link>
                <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Upload/Change Profile Photo</Link>
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
      </nav>

      {/* Second Row - Page Title Centered */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-lg md:text-xl font-semibold text-gray-900">Profile</h1>
          <p className="text-sm text-gray-500 hidden sm:block">Manage your personal information</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Profile Information</h2>
            
            {/* Auto-save Notice */}
            <div className="text-sm text-gray-500">
              Changes are saved automatically
            </div>
          </div>
          
          {/* Auto-save Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-blue-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-blue-700 text-sm">
                <span className="font-medium">Auto-save enabled:</span> Your changes are automatically saved as you type.
              </p>
            </div>
          </div>
          
          {/* Profile Photo */}
          <div className="mb-8 text-center">
            <Image
              src={userImage}
              alt={userName}
              width={96}
              height={96}
              className="w-24 h-24 rounded-full object-cover mx-auto mb-4"
              priority
            />
            <Link href="/profile/image" className="text-helfi-green hover:underline">
              Change Profile Photo
            </Link>
          </div>

          {/* Profile Form */}
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                <input
                  type="text"
                  value={profileData.firstName}
                  onChange={(e) => updateProfileData('firstName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-helfi-green focus:border-helfi-green"
                  placeholder="Enter your first name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                <input
                  type="text"
                  value={profileData.lastName}
                  onChange={(e) => updateProfileData('lastName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-helfi-green focus:border-helfi-green"
                  placeholder="Enter your last name"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
              <textarea
                rows={4}
                value={profileData.bio}
                onChange={(e) => updateProfileData('bio', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-helfi-green focus:border-helfi-green"
                placeholder="Tell us about yourself..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                <input
                  type="date"
                  value={profileData.dateOfBirth}
                  onChange={(e) => updateProfileData('dateOfBirth', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-helfi-green focus:border-helfi-green"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                <select 
                  value={profileData.gender}
                  onChange={(e) => updateProfileData('gender', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-helfi-green focus:border-helfi-green"
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer-not-to-say">Prefer not to say</option>
                </select>
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