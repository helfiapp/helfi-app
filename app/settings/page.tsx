'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Header from '@/components/ui/Header'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import BottomNav from '../../components/BottomNav'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: false,
    activityTracking: true,
    locationServices: false
  })
  const [notificationSettings, setNotificationSettings] = useState({
    push: true,
    email: true,
    healthReminders: true,
    weeklyReports: false
  })
  const [dataRetention, setDataRetention] = useState('1_year')
  const [language, setLanguage] = useState('en')
  const [theme, setTheme] = useState('light')
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()
  }, [])

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

      const savedLanguage = localStorage.getItem('language')
      if (savedLanguage) {
        setLanguage(savedLanguage)
      }

      const savedTheme = localStorage.getItem('theme')
      if (savedTheme) {
        setTheme(savedTheme)
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

  // Handle language change
  const handleLanguageChange = (value: string) => {
    setLanguage(value)
    localStorage.setItem('language', value)
  }

  // Handle theme change
  const handleThemeChange = (value: string) => {
    setTheme(value)
    localStorage.setItem('theme', value)
  }

  // Modern toggle switch component
  const ToggleSwitch = ({ 
    enabled, 
    onToggle, 
    disabled = false,
    size = 'md'
  }: { 
    enabled: boolean
    onToggle: () => void
    disabled?: boolean
    size?: 'sm' | 'md' | 'lg'
  }) => {
    const sizes = {
      sm: 'h-5 w-9',
      md: 'h-6 w-11',
      lg: 'h-7 w-12'
    }

    const switchSizes = {
      sm: 'h-3 w-3',
      md: 'h-4 w-4',
      lg: 'h-5 w-5'
    }

    const translateX = {
      sm: enabled ? 'translate-x-4' : 'translate-x-1',
      md: enabled ? 'translate-x-5' : 'translate-x-1',
      lg: enabled ? 'translate-x-5' : 'translate-x-1'
    }

    return (
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex ${sizes[size]} items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
          enabled ? 'bg-green-500' : 'bg-gray-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block ${switchSizes[size]} transform rounded-full bg-white transition-transform duration-200 ${translateX[size]}`}
        />
      </button>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Header 
        title="Settings" 
        subtitle="Manage your preferences and privacy"
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto pt-24">
        <div className="space-y-6">
          {/* Account Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Account Overview</CardTitle>
              <CardDescription>Your account information and basic settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'}
                  </h3>
                  <p className="text-gray-600">{user?.email}</p>
                  <p className="text-sm text-green-600 mt-1">✓ Account Verified</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* App Preferences */}
          <Card>
            <CardHeader>
              <CardTitle>App Preferences</CardTitle>
              <CardDescription>Customize your app experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Language Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Language
                </label>
                <select 
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="it">Italiano</option>
                  <option value="pt">Português</option>
                </select>
              </div>

              {/* Theme Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Theme
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full sm:w-96">
                  <button
                    onClick={() => handleThemeChange('light')}
                    className={`p-3 border rounded-lg text-left transition-all ${
                      theme === 'light' 
                        ? 'border-green-500 bg-green-50 text-green-900' 
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-white border border-gray-300 rounded"></div>
                      <span className="text-sm font-medium">Light</span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleThemeChange('dark')}
                    className={`p-3 border rounded-lg text-left transition-all ${
                      theme === 'dark' 
                        ? 'border-green-500 bg-green-50 text-green-900' 
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-gray-800 rounded"></div>
                      <span className="text-sm font-medium">Dark</span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleThemeChange('auto')}
                    className={`p-3 border rounded-lg text-left transition-all ${
                      theme === 'auto' 
                        ? 'border-green-500 bg-green-50 text-green-900' 
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-gradient-to-r from-white to-gray-800 rounded"></div>
                      <span className="text-sm font-medium">Auto</span>
                    </div>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Control how and when you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div className="flex-1 pr-4">
                  <h3 className="font-medium text-gray-900">Push Notifications</h3>
                  <p className="text-sm text-gray-600">Receive notifications on your device</p>
                </div>
                <ToggleSwitch 
                  enabled={notificationSettings.push} 
                  onToggle={() => handleNotificationToggle('push')}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex-1 pr-4">
                  <h3 className="font-medium text-gray-900">Email Notifications</h3>
                  <p className="text-sm text-gray-600">Receive updates via email</p>
                </div>
                <ToggleSwitch 
                  enabled={notificationSettings.email} 
                  onToggle={() => handleNotificationToggle('email')}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex-1 pr-4">
                  <h3 className="font-medium text-gray-900">Health Reminders</h3>
                  <p className="text-sm text-gray-600">Daily reminders for supplements and tracking</p>
                </div>
                <ToggleSwitch 
                  enabled={notificationSettings.healthReminders} 
                  onToggle={() => handleNotificationToggle('healthReminders')}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex-1 pr-4">
                  <h3 className="font-medium text-gray-900">Weekly Reports</h3>
                  <p className="text-sm text-gray-600">Receive weekly health insights and progress reports</p>
                </div>
                <ToggleSwitch 
                  enabled={notificationSettings.weeklyReports} 
                  onToggle={() => handleNotificationToggle('weeklyReports')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Privacy Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Privacy & Security</CardTitle>
              <CardDescription>Manage your privacy and data security settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div className="flex-1 pr-4">
                  <h3 className="font-medium text-gray-900">Profile Visibility</h3>
                  <p className="text-sm text-gray-600">Allow others to see your basic profile information</p>
                </div>
                <ToggleSwitch 
                  enabled={privacySettings.profileVisibility} 
                  onToggle={() => handlePrivacyToggle('profileVisibility')}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex-1 pr-4">
                  <h3 className="font-medium text-gray-900">Activity Tracking</h3>
                  <p className="text-sm text-gray-600">Track app usage for better recommendations</p>
                </div>
                <ToggleSwitch 
                  enabled={privacySettings.activityTracking} 
                  onToggle={() => handlePrivacyToggle('activityTracking')}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex-1 pr-4">
                  <h3 className="font-medium text-gray-900">Location Services</h3>
                  <p className="text-sm text-gray-600">Use location for personalized health insights</p>
                </div>
                <ToggleSwitch 
                  enabled={privacySettings.locationServices} 
                  onToggle={() => handlePrivacyToggle('locationServices')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Data Management */}
          <Card>
            <CardHeader>
              <CardTitle>Data Management</CardTitle>
              <CardDescription>Control how your data is stored and managed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data Retention Period
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  Choose how long to keep your health data before automatic deletion
                </p>
                <select 
                  value={dataRetention}
                  onChange={(e) => handleDataRetentionChange(e.target.value)}
                  className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900"
                >
                  <option value="never">Never delete</option>
                  <option value="1_year">After 1 year</option>
                  <option value="2_years">After 2 years</option>
                  <option value="5_years">After 5 years</option>
                </select>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <h4 className="font-medium text-gray-900 mb-3">Data Export & Deletion</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button variant="outline" className="justify-start">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export All Data
                  </Button>
                  <Button variant="destructive" className="justify-start">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete All Data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Account Actions</CardTitle>
              <CardDescription>Manage your account and subscription</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button variant="outline" className="justify-start h-auto py-3">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <div className="text-left">
                      <div className="font-medium">Change Password</div>
                      <div className="text-sm text-gray-500">Update your account password</div>
                    </div>
                  </div>
                </Button>

                <Button variant="outline" className="justify-start h-auto py-3">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.012-3.016A6.5 6.5 0 1121.5 10.5h-5.478z" />
                    </svg>
                    <div className="text-left">
                      <div className="font-medium">Two-Factor Auth</div>
                      <div className="text-sm text-gray-500">Add extra security layer</div>
                    </div>
                  </div>
                </Button>

                <Button variant="outline" className="justify-start h-auto py-3">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <div className="text-left">
                      <div className="font-medium">Billing Settings</div>
                      <div className="text-sm text-gray-500">Manage subscription</div>
                    </div>
                  </div>
                </Button>

                <Button variant="outline" className="justify-start h-auto py-3">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-left">
                      <div className="font-medium">Help & Support</div>
                      <div className="text-sm text-gray-500">Get help and contact us</div>
                    </div>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* App Information */}
          <Card>
            <CardHeader>
              <CardTitle>App Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Version:</span>
                  <span className="ml-2 text-gray-600">1.0.0</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Last Updated:</span>
                  <span className="ml-2 text-gray-600">{new Date().toLocaleDateString()}</span>
                </div>
                <div className="sm:col-span-2 pt-3 border-t border-gray-200">
                  <div className="flex flex-wrap gap-4">
                    <button className="text-green-600 hover:text-green-700 font-medium">Privacy Policy</button>
                    <button className="text-green-600 hover:text-green-700 font-medium">Terms of Service</button>
                    <button className="text-green-600 hover:text-green-700 font-medium">Rate App</button>
                    <button className="text-green-600 hover:text-green-700 font-medium">Contact Support</button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <BottomNav />
    </div>
  )
} 