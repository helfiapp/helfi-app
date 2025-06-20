'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/ui/Header'
import BottomNav from '../../components/BottomNav'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AccountPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [accountData, setAccountData] = useState({
    fullName: '',
    email: ''
  })
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const userName = user?.user_metadata?.name || user?.email || 'User'

  // Load saved data on mount
  useEffect(() => {
    const savedAccountData = localStorage.getItem('accountSettings')
    const saved2FA = localStorage.getItem('twoFactorEnabled')
    
    if (savedAccountData) {
      try {
        setAccountData(JSON.parse(savedAccountData))
      } catch (error) {
        console.error('Error loading account data:', error)
      }
    } else {
      // Initialize with session data
      setAccountData({
        fullName: user?.user_metadata?.name || '',
        email: user?.email || ''
      })
    }
    
    if (saved2FA) {
      setTwoFactorEnabled(saved2FA === 'true')
    }
  }, [user])

  // Auto-save when data changes
  useEffect(() => {
    if (!accountData.fullName && !accountData.email) return // Don't save empty initial state
    
    setSaveStatus('saving')
    const saveTimer = setTimeout(() => {
      try {
        localStorage.setItem('accountSettings', JSON.stringify(accountData))
        localStorage.setItem('twoFactorEnabled', twoFactorEnabled.toString())
        setSaveStatus('saved')
        
        // Hide saved status after 2 seconds
        setTimeout(() => {
          setSaveStatus('idle')
        }, 2000)
      } catch (error) {
        console.error('Error saving account settings:', error)
        setSaveStatus('idle')
      }
    }, 1000) // Debounce saves by 1 second

    return () => clearTimeout(saveTimer)
  }, [accountData, twoFactorEnabled])



  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Header 
        title="Account Settings" 
        subtitle="Manage your account preferences"
      />

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 py-6 pt-24">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Account Settings</h2>
            
            {/* Save Status Indicator */}
            <div className="flex items-center">
              {saveStatus === 'saving' && (
                <div className="flex items-center text-blue-600">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                  <span className="text-sm font-medium">Saving...</span>
                </div>
              )}
              {saveStatus === 'saved' && (
                <div className="flex items-center text-green-600">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium">Saved</span>
                </div>
              )}
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
          
          {/* Account Information */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={accountData.fullName}
                  onChange={(e) => setAccountData({ ...accountData, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-helfi-green focus:border-helfi-green"
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={accountData.email}
                  onChange={(e) => setAccountData({ ...accountData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  disabled
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
              </div>
            </div>
          </div>

          {/* Security Settings */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Security</h3>
            <div className="space-y-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="mb-3">
                  <h4 className="font-medium text-gray-900">Password</h4>
                  <p className="text-sm text-gray-600">Change your account password</p>
                </div>
                <button className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium">
                  Change Password
                </button>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="mb-3">
                  <h4 className="font-medium text-gray-900">Two-Factor Authentication</h4>
                  <p className="text-sm text-gray-600">Add an extra layer of security to your account</p>
                </div>
                <button
                  onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${twoFactorEnabled ? 'bg-helfi-green text-white hover:bg-helfi-green/90' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  {twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                </button>
              </div>
            </div>
          </div>

          {/* Account Actions */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Actions</h3>
            <div className="space-y-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="mb-3">
                  <h4 className="font-medium text-gray-900">Export Data</h4>
                  <p className="text-sm text-gray-600">Download a copy of your health data</p>
                </div>
                <button className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 transition-colors font-medium">
                  Export Data
                </button>
              </div>
              <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                <div className="mb-3">
                  <h4 className="font-medium text-red-900">Delete Account</h4>
                  <p className="text-sm text-red-600">Permanently delete your account and all data</p>
                </div>
                <button className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium">
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
} 