'use client'

import React from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'

export default function Settings() {
  const { data: session } = useSession()

  return (
    <div className="min-h-screen bg-gray-50">
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
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">Settings</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Manage your app preferences</p>
            </div>
          </div>
          
          <Link href="/dashboard" className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors">
            Back to Dashboard
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* General Settings */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">General Settings</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">Dark Mode</h3>
                  <p className="text-sm text-gray-600">Switch to dark theme</p>
                </div>
                <input type="checkbox" className="rounded" />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">Email Notifications</h3>
                  <p className="text-sm text-gray-600">Receive updates via email</p>
                </div>
                <input type="checkbox" className="rounded" defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">Push Notifications</h3>
                  <p className="text-sm text-gray-600">Get push notifications on your device</p>
                </div>
                <input type="checkbox" className="rounded" />
              </div>
            </div>
          </div>

          {/* Privacy Settings */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Privacy Settings</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">Profile Visibility</h3>
                  <p className="text-sm text-gray-600">Make your profile visible to others</p>
                </div>
                <select className="px-3 py-1 border border-gray-300 rounded">
                  <option>Private</option>
                  <option>Public</option>
                  <option>Friends Only</option>
                </select>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">Data Analytics</h3>
                  <p className="text-sm text-gray-600">Help us improve by sharing anonymous usage data</p>
                </div>
                <input type="checkbox" className="rounded" defaultChecked />
              </div>
            </div>
          </div>

          {/* Account Actions */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Account Actions</h2>
            
            <div className="space-y-4">
              <Link href="/account" className="flex items-center p-3 border border-gray-200 rounded-lg hover:border-helfi-green transition-colors">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">Account Settings</h3>
                  <p className="text-sm text-gray-600">Manage your account information</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              
              <Link href="/billing" className="flex items-center p-3 border border-gray-200 rounded-lg hover:border-helfi-green transition-colors">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">Subscription & Billing</h3>
                  <p className="text-sm text-gray-600">Manage your subscription</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              
              <Link href="/help" className="flex items-center p-3 border border-gray-200 rounded-lg hover:border-helfi-green transition-colors">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">Help & Support</h3>
                  <p className="text-sm text-gray-600">Get help and contact support</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Save Button */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <button className="w-full bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium">
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 