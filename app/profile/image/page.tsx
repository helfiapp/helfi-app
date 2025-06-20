'use client'

import React from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'

export default function ProfileImage() {
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
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">Profile Picture</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Upload or change your profile picture</p>
            </div>
          </div>
          
          <Link href="/profile" className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors">
            Back to Profile
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Upload Profile Picture</h2>
          
          {/* Current Profile Picture */}
          <div className="text-center mb-8">
            <div className="w-32 h-32 bg-helfi-green rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <p className="text-gray-600">Current profile picture</p>
          </div>

          {/* Upload Options */}
          <div className="space-y-6">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Upload a new picture</h3>
              <p className="text-gray-600 mb-4">PNG, JPG up to 5MB</p>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="bg-helfi-green text-white px-6 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors cursor-pointer"
              >
                Choose File
              </label>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-500 mb-4">Or take a photo</p>
              <button className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition-colors">
                📷 Take Photo
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4 mt-8">
            <button className="flex-1 bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition-colors">
              Remove Picture
            </button>
            <button className="flex-1 bg-helfi-green text-white px-6 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 