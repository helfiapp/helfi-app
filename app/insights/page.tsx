'use client'

import React from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'

export default function Insights() {
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
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">AI Health Insights</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Personalized health recommendations</p>
            </div>
          </div>
          
          <Link href="/dashboard" className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors">
            Back to Dashboard
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Your AI Health Insights</h2>
          
          {/* Insights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                  <span className="text-white text-sm">💧</span>
                </div>
                <h3 className="font-semibold text-blue-900">Hydration</h3>
              </div>
              <p className="text-blue-800 text-sm">
                Consider increasing your daily water intake to 8-10 glasses for optimal health.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-3">
                  <span className="text-white text-sm">🏃</span>
                </div>
                <h3 className="font-semibold text-green-900">Exercise</h3>
              </div>
              <p className="text-green-800 text-sm">
                Your current exercise routine is excellent! Keep up the great work.
              </p>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center mr-3">
                  <span className="text-white text-sm">😴</span>
                </div>
                <h3 className="font-semibold text-orange-900">Sleep</h3>
              </div>
              <p className="text-orange-800 text-sm">
                Try to maintain a consistent sleep schedule for better recovery.
              </p>
            </div>
          </div>
        </div>

        {/* Coming Soon */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-helfi-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🤖</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">More Insights Coming Soon</h3>
            <p className="text-gray-600 mb-4">
              We're working on advanced AI insights based on your health data, supplements, and lifestyle factors.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
              <p className="text-blue-800 text-sm">
                Complete your onboarding to get personalized AI recommendations!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 