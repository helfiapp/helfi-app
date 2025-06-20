'use client'

import React from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'

export default function Reports() {
  const { data: session } = useSession()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/dashboard" className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors mr-4">
              Back to Dashboard
            </Link>
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
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">Health Reports</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Weekly health analysis and trends</p>
            </div>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/dashboard" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Dashboard
            </Link>
            <Link href="/health-tracking" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Health Tracking
            </Link>
            <Link href="/insights" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              AI Insights
            </Link>
            <Link href="/reports" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Reports
            </Link>
            <Link href="/onboarding?step=1" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Health Info
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
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
            <div className="bg-purple-50 p-6 rounded-lg border-2 border-purple-200">
              <h3 className="font-semibold text-helfi-black mb-2">📊 Weekly Summary</h3>
              <p className="text-sm text-gray-600 mb-4">Get a comprehensive overview of your weekly health data</p>
              <div className="mt-4 text-center">
                <span className="text-xl font-bold text-purple-600">Coming Soon</span>
              </div>
            </div>

            <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-200">
              <h3 className="font-semibold text-helfi-black mb-2">📈 Progress Tracking</h3>
              <p className="text-sm text-gray-600 mb-4">Monitor your progress toward health goals</p>
              <div className="mt-4 text-center">
                <span className="text-xl font-bold text-blue-600">Coming Soon</span>
              </div>
            </div>

            <div className="bg-green-50 p-6 rounded-lg border-2 border-green-200">
              <h3 className="font-semibold text-helfi-black mb-2">📋 Detailed Analysis</h3>
              <p className="text-sm text-gray-600 mb-4">In-depth analysis of health patterns and trends</p>
              <div className="mt-4 text-center">
                <span className="text-xl font-bold text-green-600">Coming Soon</span>
              </div>
            </div>

            <div className="bg-orange-50 p-6 rounded-lg border-2 border-orange-200">
              <h3 className="font-semibold text-helfi-black mb-2">🎯 Goal Assessment</h3>
              <p className="text-sm text-gray-600 mb-4">Evaluate progress toward your health objectives</p>
              <div className="mt-4 text-center">
                <span className="text-xl font-bold text-orange-600">Coming Soon</span>
              </div>
            </div>

            <div className="bg-red-50 p-6 rounded-lg border-2 border-red-200">
              <h3 className="font-semibold text-helfi-black mb-2">⚡ Insights Dashboard</h3>
              <p className="text-sm text-gray-600 mb-4">Key insights and recommendations from your data</p>
              <div className="mt-4 text-center">
                <span className="text-xl font-bold text-red-600">Coming Soon</span>
              </div>
            </div>

            <div className="bg-yellow-50 p-6 rounded-lg border-2 border-yellow-200">
              <h3 className="font-semibold text-helfi-black mb-2">📅 Monthly Report</h3>
              <p className="text-sm text-gray-600 mb-4">Comprehensive monthly health summary and trends</p>
              <div className="mt-4 text-center">
                <span className="text-xl font-bold text-yellow-600">Coming Soon</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 