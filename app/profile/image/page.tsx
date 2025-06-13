'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'

export default function ProfileImagePage() {
  const { data: session } = useSession()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Profile data with better fallback
  const userImage = session?.user?.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(session?.user?.name || 'User')}&background=22c55e&color=ffffff&rounded=true&size=128`;
  const userName = session?.user?.name || 'User';

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    setUploading(true)
    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 2000))
    setUploading(false)
    // In a real app, you'd upload to your backend here
    alert('Profile image updated successfully!')
  }

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
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">Change Profile Image</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Upload a new profile picture</p>
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
            
            {/* Desktop Profile Avatar & Dropdown */}
            <div className="relative ml-6" id="profile-dropdown">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="focus:outline-none"
                aria-label="Open profile menu"
              >
                <Image
                  src={selectedImage || userImage}
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
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Upload Profile Image</h2>
          
          {/* Current Image */}
          <div className="text-center mb-8">
            <div className="relative inline-block">
              <Image
                src={selectedImage || userImage}
                alt="Profile"
                width={150}
                height={150}
                className="rounded-full border-4 border-helfi-green shadow-lg object-cover w-38 h-38 mx-auto"
              />
              {selectedImage && (
                <div className="absolute top-0 right-0 bg-helfi-green text-white rounded-full p-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mt-4">{userName}</h3>
            <p className="text-gray-600">{session?.user?.email}</p>
          </div>

          {/* Upload Section */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Choose New Image
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-helfi-green transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="image-upload"
                />
                <label htmlFor="image-upload" className="cursor-pointer">
                  <div className="space-y-2">
                    <svg className="w-12 h-12 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div className="text-gray-600">
                      <span className="font-medium text-helfi-green">Click to upload</span> or drag and drop
                    </div>
                    <div className="text-sm text-gray-500">
                      PNG, JPG, GIF up to 10MB
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Image Guidelines */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Image Guidelines</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Use a clear, high-quality image</li>
                <li>• Square images work best (1:1 ratio)</li>
                <li>• Face should be clearly visible</li>
                <li>• Maximum file size: 10MB</li>
                <li>• Supported formats: JPG, PNG, GIF</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between space-x-4">
              <Link
                href="/profile"
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </Link>
              
              <div className="flex space-x-3">
                {selectedImage && (
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="bg-red-100 text-red-700 px-6 py-2 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    Remove
                  </button>
                )}
                
                <button
                  onClick={handleSave}
                  disabled={!selectedImage || uploading}
                  className={`px-6 py-2 rounded-lg transition-colors ${
                    selectedImage && !uploading
                      ? 'bg-helfi-green text-white hover:bg-helfi-green/90'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {uploading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Uploading...</span>
                    </div>
                  ) : (
                    'Save Image'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 