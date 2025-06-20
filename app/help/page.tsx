'use client'

import React from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'

export default function Help() {
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
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">Help & Support</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Get help with your health journey</p>
            </div>
          </div>
          
          <Link href="/dashboard" className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors">
            Back to Dashboard
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">How can we help you?</h2>
          
          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="p-4 border border-gray-200 rounded-lg hover:border-helfi-green transition-colors">
              <h3 className="font-semibold text-gray-900 mb-2">Contact Support</h3>
              <p className="text-gray-600 text-sm mb-3">Get personalized help from our team</p>
              <button className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors">
                Contact Us
              </button>
            </div>
            
            <div className="p-4 border border-gray-200 rounded-lg hover:border-helfi-green transition-colors">
              <h3 className="font-semibold text-gray-900 mb-2">FAQ</h3>
              <p className="text-gray-600 text-sm mb-3">Find answers to common questions</p>
              <button className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors">
                View FAQ
              </button>
            </div>
          </div>

          {/* Common Topics */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Common Topics</h3>
            <div className="space-y-3">
              <div className="p-3 border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-900">Getting Started</h4>
                <p className="text-sm text-gray-600">Learn how to set up your profile and start tracking</p>
              </div>
              <div className="p-3 border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-900">Data Privacy</h4>
                <p className="text-sm text-gray-600">How we protect and use your health data</p>
              </div>
              <div className="p-3 border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-900">AI Insights</h4>
                <p className="text-sm text-gray-600">Understanding your personalized health recommendations</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 