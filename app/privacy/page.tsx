'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import BottomNav from '../../components/BottomNav'

export default function PrivacyPage() {
  const { data: session } = useSession()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Profile data with better fallback
  const userImage = session?.user?.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(session?.user?.name || 'User')}&background=22c55e&color=ffffff&rounded=true&size=128`;
  const userName = session?.user?.name || 'User';

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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Privacy & Data Control</h2>
          
          <div className="space-y-8">
            {/* Data Sharing */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Sharing</h3>
              <div className="space-y-4">
                <div className="p-4 border border-gray-200 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Health Data Sharing</h4>
                  <p className="text-sm text-gray-600 mb-3">Control who can access your health information</p>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-helfi-green focus:border-helfi-green">
                    <option>Only me</option>
                    <option>Healthcare providers only</option>
                    <option>Family members</option>
                    <option>Research (anonymized)</option>
                  </select>
                </div>
                
                <div className="p-4 border border-gray-200 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Analytics & Insights</h4>
                  <p className="text-sm text-gray-600 mb-3">Allow anonymized data for improving health insights</p>
                  <div className="flex items-center">
                    <input type="checkbox" id="analytics" className="mr-2" defaultChecked />
                    <label htmlFor="analytics" className="text-sm text-gray-700">
                      Help improve Helfi by sharing anonymized health patterns
                    </label>
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
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-helfi-green focus:border-helfi-green">
                  <option>Never delete</option>
                  <option>After 1 year</option>
                  <option>After 2 years</option>
                  <option>After 5 years</option>
                </select>
              </div>
            </div>

            {/* Privacy Controls */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Privacy Controls</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="font-medium text-gray-900">Profile Visibility</h4>
                    <p className="text-sm text-gray-600">Make your profile visible to other users</p>
                  </div>
                  <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200">
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-1" />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="font-medium text-gray-900">Activity Tracking</h4>
                    <p className="text-sm text-gray-600">Track app usage for personalization</p>
                  </div>
                  <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-helfi-green">
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-6" />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="font-medium text-gray-900">Location Services</h4>
                    <p className="text-sm text-gray-600">Use location for health insights</p>
                  </div>
                  <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200">
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-1" />
                  </button>
                </div>
              </div>
            </div>

            {/* Data Rights */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Data Rights</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left">
                  <h4 className="font-medium text-gray-900 mb-2">Download My Data</h4>
                  <p className="text-sm text-gray-600">Get a copy of all your data</p>
                </button>
                
                <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left">
                  <h4 className="font-medium text-gray-900 mb-2">Correct My Data</h4>
                  <p className="text-sm text-gray-600">Request corrections to your information</p>
                </button>
                
                <button className="p-4 border border-red-200 rounded-lg hover:bg-red-50 text-left bg-red-50">
                  <h4 className="font-medium text-red-900 mb-2">Delete My Data</h4>
                  <p className="text-sm text-red-600">Permanently delete all your data</p>
                </button>
                
                <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left">
                  <h4 className="font-medium text-gray-900 mb-2">Data Portability</h4>
                  <p className="text-sm text-gray-600">Transfer your data to another service</p>
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-8">
            <button className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button className="bg-helfi-green text-white px-6 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors">
              Save Settings
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
} 