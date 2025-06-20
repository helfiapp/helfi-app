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
  const [currentProfileImage, setCurrentProfileImage] = useState<string | null>(null)

  // Profile data with proper localStorage integration
  const userName = session?.user?.name || 'User';

  // Load profile image from localStorage and session
  useEffect(() => {
    const savedImage = localStorage.getItem('userProfileImage');
    if (savedImage) {
      setCurrentProfileImage(savedImage);
    } else if (session?.user?.image) {
      setCurrentProfileImage(session.user.image);
    }
  }, [session]);

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
        setCurrentProfileImage(imageData)
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

  // Profile image with fallback logic
  const displayImage = selectedImage || currentProfileImage;

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
                {displayImage ? (
                  <Image
                    src={displayImage}
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
                    {displayImage ? (
                      <Image
                        src={displayImage}
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
                  <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">View Profile</Link>
                  <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                  <Link href="/privacy" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Privacy Settings</Link>
                  <Link href="/help" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
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
                {displayImage ? (
                  <Image
                    src={displayImage}
                    alt="Profile"
                    width={40}
                    height={40}
                    className="rounded-full border-2 border-helfi-green shadow-sm object-cover w-10 h-10"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full border-2 border-helfi-green shadow-sm bg-helfi-green flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                )}
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100 animate-fade-in">
                  <div className="flex items-center px-4 py-3 border-b border-gray-100">
                    {displayImage ? (
                      <Image
                        src={displayImage}
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
                      <div className="text-sm text-gray-500 truncate">{session?.user?.email}</div>
                    </div>
                  </div>
                  <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">View Profile</Link>
                  <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                  <Link href="/privacy" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Privacy Settings</Link>
                  <Link href="/help" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
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
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 pt-24">
        <div className="text-center">
          {/* Large Profile Avatar */}
          <div className="mb-8">
            {displayImage ? (
              <Image
                src={displayImage}
                alt="Profile"
                width={200}
                height={200}
                className="w-48 h-48 md:w-56 md:h-56 rounded-full mx-auto object-cover border-4 border-helfi-green shadow-lg"
              />
            ) : (
              <div className="w-48 h-48 md:w-56 md:h-56 rounded-full mx-auto bg-helfi-green flex items-center justify-center border-4 border-helfi-green shadow-lg">
                <svg className="w-24 h-24 md:w-28 md:h-28 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{userName}</h1>
          <p className="text-gray-600 mb-8">{session?.user?.email}</p>

          {/* Upload Section */}
          <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Choose New Image</h2>
            
            {/* Upload Area */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 mb-6 hover:border-helfi-green transition-colors">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
                disabled={uploading}
              />
              <label 
                htmlFor="image-upload"
                className={`cursor-pointer flex flex-col items-center ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-lg font-medium text-gray-700 mb-2">
                  {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                </p>
                <p className="text-sm text-gray-500">PNG, JPG, GIF up to 10MB</p>
              </label>
            </div>

            {/* Status Messages */}
            {uploadError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex">
                  <svg className="w-5 h-5 text-red-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className="text-red-700 text-sm">{uploadError}</p>
                </div>
              </div>
            )}

            {uploadSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <div className="flex">
                  <svg className="w-5 h-5 text-green-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <p className="text-green-700 text-sm">Profile image updated successfully!</p>
                </div>
              </div>
            )}

            {uploading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                  <p className="text-blue-700 text-sm">Processing your image...</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link 
                href="/profile"
                className="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors text-center font-medium"
              >
                Back to Profile
              </Link>
              {selectedImage && (
                <button
                  onClick={handleSave}
                  disabled={uploading}
                  className="flex-1 bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Saving...' : 'Save Profile Image'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
} 