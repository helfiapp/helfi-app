'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import BottomNav from '../../components/BottomNav'

export default function PrivacyPage() {
  const { data: session } = useSession()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Privacy controls state
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: false,
    activityTracking: true,
    locationServices: false
  })
  
  // Data retention and sharing state
  const [dataRetention, setDataRetention] = useState('never')
  const [healthDataSharing, setHealthDataSharing] = useState('only_me')
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true)

  // Profile data with better fallback
  const userImage = session?.user?.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(session?.user?.name || 'User')}&background=22c55e&color=ffffff&rounded=true&size=128`;
  const userName = session?.user?.name || 'User';

  // Load saved preferences
  useEffect(() => {
    try {
      const savedPrivacy = localStorage.getItem('privacySettings')
      if (savedPrivacy) {
        setPrivacySettings(JSON.parse(savedPrivacy))
      }
      
      const savedRetention = localStorage.getItem('dataRetention')
      if (savedRetention) {
        setDataRetention(savedRetention)
      }
      
      const savedSharing = localStorage.getItem('healthDataSharing')
      if (savedSharing) {
        setHealthDataSharing(savedSharing)
      }
      
      const savedAnalytics = localStorage.getItem('analyticsEnabled')
      if (savedAnalytics !== null) {
        setAnalyticsEnabled(JSON.parse(savedAnalytics))
      }
    } catch (error) {
      console.error('Error loading privacy settings:', error)
    }
  }, [])

  // Save preferences when changed
  const handlePrivacyToggle = (setting: keyof typeof privacySettings) => {
    const newSettings = {
      ...privacySettings,
      [setting]: !privacySettings[setting]
    }
    setPrivacySettings(newSettings)
    localStorage.setItem('privacySettings', JSON.stringify(newSettings))
  }

  const handleDataRetentionChange = (value: string) => {
    setDataRetention(value)
    localStorage.setItem('dataRetention', value)
  }

  const handleHealthDataSharingChange = (value: string) => {
    setHealthDataSharing(value)
    localStorage.setItem('healthDataSharing', value)
  }

  const handleAnalyticsToggle = () => {
    const newValue = !analyticsEnabled
    setAnalyticsEnabled(newValue)
    localStorage.setItem('analyticsEnabled', JSON.stringify(newValue))
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
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">Privacy Settings</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Control your data and privacy</p>
            </div>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/dashboard" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Dashboard
            </Link>
            <Link href="/profile" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Profile
            </Link>
            <Link href="/privacy" className="text-helfi-green font-medium">
              Privacy Settings
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
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-4 md:py-8">
        <div className="bg-white rounded-lg shadow-sm p-4 md:p-8">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">Privacy & Data Control</h2>
          
          <div className="space-y-6 md:space-y-8">
            {/* Privacy Controls - Featured prominently for mobile */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Privacy Controls</h3>
              <div className="space-y-3 md:space-y-4">
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50 md:bg-white">
                  <div className="pr-4">
                    <h4 className="font-medium text-gray-900">Profile Visibility</h4>
                    <p className="text-sm text-gray-600">Make your profile visible to other users</p>
                  </div>
                  <ToggleSwitch 
                    enabled={privacySettings.profileVisibility} 
                    onToggle={() => handlePrivacyToggle('profileVisibility')}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50 md:bg-white">
                  <div className="pr-4">
                    <h4 className="font-medium text-gray-900">Activity Tracking</h4>
                    <p className="text-sm text-gray-600">Track app usage for personalization</p>
                  </div>
                  <ToggleSwitch 
                    enabled={privacySettings.activityTracking} 
                    onToggle={() => handlePrivacyToggle('activityTracking')}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50 md:bg-white">
                  <div className="pr-4">
                    <h4 className="font-medium text-gray-900">Location Services</h4>
                    <p className="text-sm text-gray-600">Use location for health insights</p>
                  </div>
                  <ToggleSwitch 
                    enabled={privacySettings.locationServices} 
                    onToggle={() => handlePrivacyToggle('locationServices')}
                  />
                </div>
              </div>
            </div>

            {/* Data Sharing */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Sharing</h3>
              <div className="space-y-4">
                <div className="p-4 border border-gray-200 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Health Data Sharing</h4>
                  <p className="text-sm text-gray-600 mb-3">Control who can access your health information</p>
                  <select 
                    value={healthDataSharing}
                    onChange={(e) => handleHealthDataSharingChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-helfi-green focus:border-helfi-green"
                  >
                    <option value="only_me">Only me</option>
                    <option value="healthcare_providers">Healthcare providers only</option>
                    <option value="family">Family members</option>
                    <option value="research">Research (anonymized)</option>
                  </select>
                </div>
                
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="pr-4">
                      <h4 className="font-medium text-gray-900 mb-1">Analytics & Insights</h4>
                      <p className="text-sm text-gray-600">Allow anonymized data for improving health insights</p>
                    </div>
                    <ToggleSwitch 
                      enabled={analyticsEnabled} 
                      onToggle={handleAnalyticsToggle}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Data Retention */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Retention</h3>
              <div className="p-4 border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Automatic Data Deletion</h4>
                <p className="text-sm text-gray-600 mb-3">Automatically delete old health data</p>
                <select 
                  value={dataRetention}
                  onChange={(e) => handleDataRetentionChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-helfi-green focus:border-helfi-green"
                >
                  <option value="never">Never delete</option>
                  <option value="1_year">After 1 year</option>
                  <option value="2_years">After 2 years</option>
                  <option value="5_years">After 5 years</option>
                </select>
              </div>
            </div>

            {/* Data Rights */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Data Rights</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition-colors">
                  <h4 className="font-medium text-gray-900 mb-2">Download My Data</h4>
                  <p className="text-sm text-gray-600">Get a copy of all your data</p>
                </button>
                
                <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition-colors">
                  <h4 className="font-medium text-gray-900 mb-2">Correct My Data</h4>
                  <p className="text-sm text-gray-600">Request corrections to your information</p>
                </button>
                
                <button className="p-4 border border-red-200 rounded-lg hover:bg-red-50 text-left bg-red-50 transition-colors">
                  <h4 className="font-medium text-red-900 mb-2">Delete My Data</h4>
                  <p className="text-sm text-red-600">Permanently delete all your data</p>
                </button>
                
                <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition-colors">
                  <h4 className="font-medium text-gray-900 mb-2">Data Portability</h4>
                  <p className="text-sm text-gray-600">Transfer your data to another service</p>
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 mt-6 md:mt-8">
            <button className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition-colors order-2 sm:order-1">
              Reset to Defaults
            </button>
            <button className="bg-helfi-green text-white px-6 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors order-1 sm:order-2">
              Settings Saved
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
} 