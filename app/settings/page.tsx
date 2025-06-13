'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import BottomNav from '../../components/BottomNav'

export default function SettingsPage() {
  const { data: session } = useSession()
  
  // Privacy controls state
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: false,
    activityTracking: true,
    locationServices: false
  })
  
  // Notification settings
  const [notificationSettings, setNotificationSettings] = useState({
    push: true,
    email: true,
    healthReminders: true,
    weeklyReports: false
  })
  
  // Data retention
  const [dataRetention, setDataRetention] = useState('never')

  // Profile data
  const userImage = session?.user?.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(session?.user?.name || 'User')}&background=22c55e&color=ffffff&rounded=true&size=128`;
  const userName = session?.user?.name || 'User';

  // Load saved preferences
  useEffect(() => {
    try {
      const savedPrivacy = localStorage.getItem('privacySettings')
      if (savedPrivacy) {
        setPrivacySettings(JSON.parse(savedPrivacy))
      }
      
      const savedNotifications = localStorage.getItem('notificationSettings')
      if (savedNotifications) {
        setNotificationSettings(JSON.parse(savedNotifications))
      }
      
      const savedRetention = localStorage.getItem('dataRetention')
      if (savedRetention) {
        setDataRetention(savedRetention)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }, [])

  // Handle privacy toggles
  const handlePrivacyToggle = (setting: keyof typeof privacySettings) => {
    const newSettings = {
      ...privacySettings,
      [setting]: !privacySettings[setting]
    }
    setPrivacySettings(newSettings)
    localStorage.setItem('privacySettings', JSON.stringify(newSettings))
  }

  // Handle notification toggles
  const handleNotificationToggle = (setting: keyof typeof notificationSettings) => {
    const newSettings = {
      ...notificationSettings,
      [setting]: !notificationSettings[setting]
    }
    setNotificationSettings(newSettings)
    localStorage.setItem('notificationSettings', JSON.stringify(newSettings))
  }

  // Handle data retention change
  const handleDataRetentionChange = (value: string) => {
    setDataRetention(value)
    localStorage.setItem('dataRetention', value)
  }

  // Toggle switch component
  const ToggleSwitch = ({ enabled, onToggle, disabled = false }: { enabled: boolean, onToggle: () => void, disabled?: boolean }) => (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-helfi-green focus:ring-offset-2 ${
        enabled ? 'bg-helfi-green' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="w-12 h-12">
              <Image
                src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
                alt="Helfi Logo"
                width={48}
                height={48}
                className="w-full h-full object-contain"
                priority
              />
            </Link>
            <h1 className="ml-3 text-xl font-semibold text-gray-900">Settings</h1>
          </div>
          <div className="flex items-center space-x-3">
            <Link href="/dashboard" className="text-helfi-green">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Settings Content */}
      <div className="px-4 py-6 space-y-6">
        
        {/* Data Retention */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Data Management</h2>
          </div>
          <div className="p-4">
            <div className="mb-4">
              <h3 className="font-medium text-gray-900 mb-2">Automatic Data Deletion</h3>
              <p className="text-sm text-gray-600 mb-3">Choose when to automatically delete old health data</p>
              <select 
                value={dataRetention}
                onChange={(e) => handleDataRetentionChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-helfi-green focus:border-helfi-green bg-white"
              >
                <option value="never">Never delete</option>
                <option value="1_year">After 1 year</option>
                <option value="2_years">After 2 years</option>
                <option value="5_years">After 5 years</option>
              </select>
            </div>
          </div>
        </div>

        {/* Privacy Controls */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Privacy Controls</h2>
          </div>
          <div className="divide-y divide-gray-100">
            <div className="flex items-center justify-between p-4">
              <div className="flex-1 pr-4">
                <h3 className="font-medium text-gray-900">Profile Visibility</h3>
                <p className="text-sm text-gray-600">Make your profile visible to other users</p>
              </div>
              <ToggleSwitch 
                enabled={privacySettings.profileVisibility} 
                onToggle={() => handlePrivacyToggle('profileVisibility')}
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex-1 pr-4">
                <h3 className="font-medium text-gray-900">Activity Tracking</h3>
                <p className="text-sm text-gray-600">Track app usage for personalization</p>
              </div>
              <ToggleSwitch 
                enabled={privacySettings.activityTracking} 
                onToggle={() => handlePrivacyToggle('activityTracking')}
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex-1 pr-4">
                <h3 className="font-medium text-gray-900">Location Services</h3>
                <p className="text-sm text-gray-600">Use location for health insights</p>
              </div>
              <ToggleSwitch 
                enabled={privacySettings.locationServices} 
                onToggle={() => handlePrivacyToggle('locationServices')}
              />
            </div>
          </div>
        </div>

        {/* Your Data Rights */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Your Data Rights</h2>
          </div>
          <div className="divide-y divide-gray-100">
            <Link href="/data-export" className="flex items-center justify-between p-4 hover:bg-gray-50">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Download My Data</h3>
                  <p className="text-sm text-gray-600">Get a copy of all your data</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link href="/data-correction" className="flex items-center justify-between p-4 hover:bg-gray-50">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Correct My Data</h3>
                  <p className="text-sm text-gray-600">Request corrections to your information</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <button className="flex items-center justify-between w-full p-4 hover:bg-red-50 text-left">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-red-900">Delete My Data</h3>
                  <p className="text-sm text-red-600">Permanently delete all your data</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="divide-y divide-gray-100">
            <Link href="/account" className="flex items-center justify-between p-4 hover:bg-gray-50">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Account Settings</h3>
                  <p className="text-sm text-gray-600">Manage your account details</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link href="/notifications" className="flex items-center justify-between p-4 hover:bg-gray-50">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM4.868 19.462A17.173 17.173 0 003 12C3 5.373 8.373 0 15 0s12 5.373 12-5.373 12-12 12a11.99 11.99 0 01-8.132-3.538z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Notifications</h3>
                  <p className="text-sm text-gray-600">Manage alert preferences</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link href="/help" className="flex items-center justify-between p-4 hover:bg-gray-50">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Help & Support</h3>
                  <p className="text-sm text-gray-600">Get help with the app</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <button 
              onClick={() => signOut()} 
              className="flex items-center justify-between w-full p-4 hover:bg-red-50 text-left"
            >
              <div className="flex items-center">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-red-900">Sign Out</h3>
                  <p className="text-sm text-red-600">Log out of your account</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
} 