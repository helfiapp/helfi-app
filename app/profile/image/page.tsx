'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import BottomNav from '../../../components/BottomNav'

export default function ProfileImagePage() {
  const { data: session } = useSession()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [showCropper, setShowCropper] = useState(false)

  // Profile data with better fallback - use SVG icon if no image
  const userImage = session?.user?.image;
  const userName = session?.user?.name || 'User';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('#profile-dropdown') && 
          !(e.target as HTMLElement).closest('#mobile-profile-dropdown')) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick);
    } else {
      document.removeEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setUploadError(null)
    setUploadSuccess(false)
    
    if (file) {
      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        setUploadError('File size must be less than 10MB. Please choose a smaller image.')
        return
      }
      
      // Validate file type with detailed error message
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(file.type.toLowerCase())) {
        setUploadError(`Unsupported file format: ${file.type}. Please use JPG, PNG, GIF, or WebP images.`)
        return
      }
      
      const reader = new FileReader()
      reader.onload = (e) => {
        const imageData = e.target?.result as string
        setSelectedImage(imageData)
        setShowCropper(true)
        // Auto-save after a short delay
        setTimeout(() => {
          handleAutoSave(imageData)
        }, 1000)
      }
      reader.onerror = () => {
        setUploadError('Failed to read the image file. Please try again.')
      }
      reader.readAsDataURL(file)
    }
  }

  const handleAutoSave = async (imageData: string) => {
    setUploading(true)
    setUploadError(null)
    
    try {
      // Simulate upload delay
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Store the image in localStorage (in production, you'd get a URL from your backend)
      localStorage.setItem('userProfileImage', imageData)
      
      setUploadSuccess(true)
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setUploadSuccess(false)
      }, 3000)
      
    } catch (error) {
      console.error('Error uploading image:', error)
      setUploadError('Failed to save image. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!selectedImage) return
    
    setUploading(true)
    try {
      // In a real app, you'd upload to your backend/cloud storage here
      // For now, we'll simulate the upload and store in localStorage
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Store the image in localStorage (in production, you'd get a URL from your backend)
      localStorage.setItem('userProfileImage', selectedImage)
      
      // Update the session data (this is a simulation - in production you'd update via API)
      if (session?.user) {
        // Force a page refresh to update the session display
        window.location.reload()
      }
      
      alert('Profile image updated successfully!')
    } catch (error) {
      console.error('Error uploading image:', error)
      alert('Failed to upload image. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      {/* Fixed Navigation Header */}
      <nav className="fixed-header safe-area-top px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center min-w-0">
            <Link href="/" className="w-12 h-12 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
              <Image
                src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
                alt="Helfi Logo"
                width={48}
                height={48}
                className="w-full h-full object-contain"
                priority
              />
            </Link>
            <div className="ml-3 min-w-0">
              <h1 className="text-lg font-semibold text-gray-900 truncate">Profile Image</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Upload new picture</p>
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
                {(selectedImage || userImage) ? (
                  <Image
                    src={selectedImage || userImage!}
                    alt="Profile"
                    width={48}
                    height={48}
                    className="rounded-full border-2 border-helfi-green shadow-sm object-cover w-12 h-12"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full border-2 border-helfi-green shadow-sm bg-helfi-green flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                )}
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100 animate-fade-in">
                  <div className="flex items-center px-4 py-3 border-b border-gray-100">
                    {userImage ? (
                      <Image
                        src={userImage}
                        alt="Profile"
                        width={40}
                        height={40}
                        className="rounded-full object-cover mr-3"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-helfi-green flex items-center justify-center mr-3">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{userName}</div>
                      <div className="text-xs text-gray-500 truncate">{session?.user?.email || 'user@email.com'}</div>
                    </div>
                  </div>
                  <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
                  <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                  <button
                    onClick={() => signOut()}
                    className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50 font-semibold"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden flex items-center space-x-3">
            <div className="relative" id="mobile-profile-dropdown">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="focus:outline-none"
                aria-label="Open profile menu"
              >
                {userImage ? (
                  <Image
                    src={userImage}
                    alt="Profile"
                    width={40}
                    height={40}
                    className="rounded-full border-2 border-helfi-green shadow-sm object-cover w-10 h-10"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full border-2 border-helfi-green shadow-sm bg-helfi-green flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                )}
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl py-2 z-50 border border-gray-100 animate-fade-in">
                  <div className="flex items-center px-4 py-3 border-b border-gray-100">
                    {userImage ? (
                      <Image
                        src={userImage}
                        alt="Profile"
                        width={36}
                        height={36}
                        className="rounded-full object-cover mr-3"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-helfi-green flex items-center justify-center mr-3">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{userName}</div>
                      <div className="text-xs text-gray-500 truncate">{session?.user?.email || 'user@email.com'}</div>
                    </div>
                  </div>
                  <div className="py-1">
                    <Link href="/dashboard" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 text-sm">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v0" />
                        </svg>
                        Dashboard
                      </div>
                    </Link>
                    <Link href="/profile" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 text-sm">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile
                      </div>
                    </Link>
                    <Link href="/account" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 text-sm">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Account Settings
                      </div>
                    </Link>
                    <Link href="/help" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 text-sm">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Help & Support
                      </div>
                    </Link>
                  </div>
                  <div className="border-t border-gray-100 pt-1">
                    <button
                      onClick={() => signOut()}
                      className="block w-full text-left px-4 py-3 text-red-600 hover:bg-red-50 font-semibold text-sm"
                    >
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Logout
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-20 px-4 pb-8">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-xl shadow-sm p-6">
            {/* Current Image */}
            <div className="text-center mb-8">
              <div className="relative inline-block">
                {(selectedImage || userImage) ? (
                  <Image
                    src={selectedImage || userImage!}
                    alt="Profile"
                    width={120}
                    height={120}
                    className="rounded-full border-4 border-helfi-green shadow-lg object-cover w-30 h-30 mx-auto"
                  />
                ) : (
                  <div className="w-30 h-30 rounded-full border-4 border-helfi-green shadow-lg bg-helfi-green flex items-center justify-center mx-auto">
                    <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                )}
                {selectedImage && (
                  <div className="absolute -top-2 -right-2 bg-helfi-green text-white rounded-full p-2 shadow-lg">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mt-4">{userName}</h3>
            </div>

            {/* Upload Section */}
            <div className="space-y-6">
              {/* Error Message */}
              {uploadError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-red-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-red-700 font-medium">{uploadError}</p>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {uploadSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-green-700 font-medium">Profile image updated successfully!</p>
                  </div>
                </div>
              )}

              {/* Upload Progress */}
              {uploading && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3"></div>
                    <p className="text-blue-700 font-medium">Saving your image...</p>
                  </div>
                </div>
              )}

              <div>
                <label className="mobile-form-label">
                  Choose New Image
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-helfi-green transition-colors">
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="image-upload"
                  />
                  <label htmlFor="image-upload" className="cursor-pointer">
                    <div className="space-y-3">
                      <svg className="w-12 h-12 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <div className="text-gray-600">
                        <span className="font-semibold text-helfi-green">Click to upload</span> or drag and drop
                      </div>
                      <div className="text-sm text-gray-500">
                        JPG, PNG, GIF, WebP up to 10MB
                      </div>
                      <div className="text-xs text-blue-600 font-medium">
                        ✨ Auto-saves when you select an image
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Image Guidelines */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-semibold text-blue-900 mb-3">Image Guidelines</h4>
                <ul className="text-sm text-blue-800 space-y-2">
                  <li>• Use a clear, high-quality image</li>
                  <li>• Square images work best (1:1 ratio)</li>
                  <li>• Face should be clearly visible</li>
                  <li>• Maximum file size: 10MB</li>
                  <li>• Supported formats: JPG, PNG, GIF, WebP</li>
                  <li>• Images are automatically saved when uploaded</li>
                </ul>
              </div>

              {/* Action Buttons - Mobile Optimized */}
              <div className="mobile-button-group space-y-3">
                <Link
                  href="/profile"
                  className="btn-mobile-primary"
                >
                  Back to Profile
                </Link>
                
                {selectedImage && (
                  <button
                    onClick={() => {
                      setSelectedImage(null)
                      setShowCropper(false)
                      setUploadError(null)
                      setUploadSuccess(false)
                    }}
                    className="btn-mobile-secondary"
                  >
                    Choose Different Image
                  </button>
                )}
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