'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'

export default function ProfileImage() {
  const { data: session } = useSession()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [currentProfileImage, setCurrentProfileImage] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Profile data - using consistent green avatar
  const defaultAvatar = 'data:image/svg+xml;base64,' + btoa(`
    <svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="64" fill="#10B981"/>
      <circle cx="64" cy="48" r="20" fill="white"/>
      <path d="M64 76c-13.33 0-24 5.34-24 12v16c0 8.84 7.16 16 16 16h16c8.84 0 16-7.16 16-16V88c0-6.66-10.67-12-24-12z" fill="white"/>
    </svg>
  `);
  const userImage = currentProfileImage || session?.user?.image || defaultAvatar;
  const userName = session?.user?.name || 'User';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('#profile-dropdown')) {
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

  // Load current profile image on mount
  useEffect(() => {
    const loadCurrentImage = async () => {
      try {
        console.log('Profile/Image page - Loading profile image from database...');
        const response = await fetch('/api/user-data', {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        if (response.ok) {
          const result = await response.json();
          console.log('Profile/Image page - API response:', { hasData: !!result.data, hasProfileImage: !!(result.data?.profileImage) });
          if (result.data && result.data.profileImage) {
            console.log('Profile/Image page - Setting profile image from database (Cloudinary URL)');
            setCurrentProfileImage(result.data.profileImage);
            
            // Clean up old localStorage entries (migration cleanup)
            if (session?.user?.id) {
              localStorage.removeItem(`profileImage_${session.user.id}`);
            }
          } else {
            console.log('Profile/Image page - No profile image found in database response');
          }
        } else {
          console.error('Profile/Image page - API call failed:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Error loading profile image:', error);
      }
    };

    loadCurrentImage();
  }, [session?.user?.id]);

  // Auto-save when image changes
  useEffect(() => {
    if (!selectedImage) return;

    const saveImage = async () => {
      setSaveStatus('saving');
      
      try {
        // Upload to Cloudinary via new API
        const formData = new FormData();
        formData.append('image', selectedImage);
        
        console.log('Uploading image to Cloudinary...');
        const response = await fetch('/api/upload-profile-image', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        
        if (result.success) {
          console.log('Cloudinary upload successful:', result);
          
          // Set the Cloudinary URL as the profile image
          setCurrentProfileImage(result.imageUrl);
          
          // Clear localStorage (no longer needed with Cloudinary)
          if (session?.user?.id) {
            localStorage.removeItem(`profileImage_${session.user.id}`);
          }
          
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
          
          console.log('Image optimization stats:', result.optimizations);
        } else {
          throw new Error(result.error || 'Upload failed');
        }
      } catch (error) {
        console.error('Error uploading image:', error);
        setSaveStatus('idle');
        alert('Failed to upload image. Please try again.');
      }
    };

    saveImage();
  }, [selectedImage, session?.user?.id]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }

      setSelectedImage(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    try {
      // Check if camera is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Camera not supported on this device or browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
        };
        setShowCamera(true);
      }
          } catch (error: any) {
        console.error('Error accessing camera:', error);
        let errorMessage = 'Unable to access camera. ';
        
        if (error?.name === 'NotAllowedError') {
          errorMessage += 'Please allow camera permissions in your browser settings.';
        } else if (error?.name === 'NotFoundError') {
          errorMessage += 'No camera found on this device.';
        } else if (error?.name === 'NotSupportedError') {
          errorMessage += 'Camera not supported on this browser.';
        } else {
          errorMessage += 'Please check your camera and permissions.';
        }
        
        alert(errorMessage);
      }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      if (context) {
        context.drawImage(video, 0, 0);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' });
            setSelectedImage(file);
            
            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => {
              setImagePreview(e.target?.result as string);
            };
            reader.readAsDataURL(file);
            
            // Stop camera
            stopCamera();
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
  };

  const removeCurrentImage = async () => {
    if (confirm('Are you sure you want to remove your profile picture?')) {
      setSaveStatus('saving');
      
      try {
        // Remove profile image (set to null in database)
        const response = await fetch('/api/user-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileImage: null })
        });

        if (response.ok) {
          // Clear localStorage (no longer needed)
          if (session?.user?.id) {
            localStorage.removeItem(`profileImage_${session.user.id}`);
          }
          
          setCurrentProfileImage(null);
          setSelectedImage(null);
          setImagePreview(null);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        } else {
          throw new Error('Failed to remove image');
        }
      } catch (error) {
        console.error('Error removing image:', error);
        setSaveStatus('idle');
        alert('Failed to remove image. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Profile Dropdown */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Back button - clean and minimal */}
            <Link 
              href="/profile" 
              className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-medium">Back</span>
            </Link>

            {/* Page title - centered and clean */}
            <div className="text-center">
              <h1 className="text-xl font-semibold text-gray-900">Profile Picture</h1>
            </div>

            {/* Profile Dropdown and Save Status */}
            <div className="flex items-center space-x-4">
              {/* Auto-save status - subtle and clean */}
              <div className="flex items-center">
                {saveStatus === 'saving' && (
                  <div className="flex items-center text-blue-600">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                    <span className="text-sm">Saving...</span>
                  </div>
                )}
                {saveStatus === 'saved' && (
                  <div className="flex items-center text-green-600">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm">Saved</span>
                  </div>
                )}
              </div>

              {/* Profile Avatar & Dropdown */}
              <div className="relative dropdown-container" id="profile-dropdown">
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="focus:outline-none"
                  aria-label="Open profile menu"
                >
                  <Image
                    src={userImage}
                    alt="Profile"
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full border-2 border-helfi-green shadow-sm object-cover"
                  />
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100">
                    <div className="flex items-center px-4 py-3 border-b border-gray-100">
                      <Image
                        src={userImage}
                        alt="Profile"
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full object-cover mr-3"
                      />
                      <div>
                        <div className="font-semibold text-gray-900">{userName}</div>
                        <div className="text-xs text-gray-500">{session?.user?.email || 'user@email.com'}</div>
                      </div>
                    </div>
                    <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
                    <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                    <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50 bg-gray-50 font-medium">Upload/Change Profile Photo</Link>
                    <Link href="/billing" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Subscription & Billing</Link>
                    <Link href="/notifications" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Notifications</Link>
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
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Content header */}
          <div className="px-8 py-6 border-b border-gray-100">
            <div className="text-center">
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Upload Profile Picture</h2>
              <p className="text-gray-600">Changes are automatically saved</p>
            </div>
          </div>
          
          {/* Current Profile Picture Section */}
          <div className="px-8 py-12 text-center border-b border-gray-100">
            <div className="w-32 h-32 mx-auto mb-8 relative">
              {(imagePreview || currentProfileImage) ? (
                <div className="relative">
                  <Image
                    src={imagePreview || currentProfileImage || ''}
                    alt="Profile Picture"
                    width={128}
                    height={128}
                    className="w-32 h-32 object-cover rounded-full border-3 border-gray-200 shadow-sm"
                  />
                  {imagePreview && (
                    <div className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full p-1.5 shadow-sm">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full bg-gray-100 rounded-full flex items-center justify-center border-3 border-gray-200">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                </div>
              )}
            </div>
            
            <div className="space-y-3">
              <p className="text-lg font-medium text-gray-900">
                {imagePreview ? 'New Profile Picture' : currentProfileImage ? 'Current Profile Picture' : 'No Profile Picture'}
              </p>
              {imagePreview && (
                <p className="text-sm text-green-600 font-medium">✓ Automatically saved</p>
              )}
              {imagePreview && (
                <button
                  onClick={() => {
                    setImagePreview(null);
                    setSelectedImage(null);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Remove preview
                </button>
              )}
            </div>
          </div>

          {/* Camera Modal */}
          {showCamera && (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold">Take a Photo</h3>
                  <p className="text-sm text-gray-600">Position your face in the frame and tap capture</p>
                </div>
                <div className="relative mb-4">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full rounded-lg"
                  />
                  {/* Overlay guide for face positioning */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 border-2 border-white border-dashed rounded-full opacity-50"></div>
                  </div>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={stopCamera}
                    className="flex-1 bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 transition-colors font-medium"
                  >
                    🔴 Stop Camera
                  </button>
                  <button
                    onClick={capturePhoto}
                    className="flex-1 bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium"
                  >
                    📷 Capture Photo
                  </button>
                </div>
                <div className="mt-3 text-center">
                  <p className="text-xs text-gray-500">
                    🔒 Camera will automatically stop after taking a photo for your privacy
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Upload Options - Google-style clean design */}
          <div className="px-8 py-8 space-y-8">
            {/* Upload from device */}
            <div className="border border-gray-200 rounded-xl p-6 hover:border-gray-300 hover:shadow-sm transition-all">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">Upload from device</h3>
                  <p className="text-sm text-gray-600">PNG, JPG up to 5MB</p>
                </div>
              </div>
              <div className="flex justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all cursor-pointer font-medium"
                >
                  Choose Photo
                </label>
              </div>
            </div>

            {/* Take photo - Hidden on mobile, shown on desktop only */}
            <div className="hidden md:block border border-gray-200 rounded-xl p-6 hover:border-gray-300 hover:shadow-sm transition-all">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">Take a photo</h3>
                  <p className="text-sm text-gray-600">Use your webcam camera</p>
                </div>
                <button 
                  onClick={startCamera}
                  className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all font-medium"
                >
                  Open Camera
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {(currentProfileImage || imagePreview) && (
            <div className="flex justify-center mt-8">
              <button 
                onClick={removeCurrentImage}
                className="bg-red-100 text-red-700 px-6 py-2 rounded-lg hover:bg-red-200 transition-colors"
              >
                Remove Picture
              </button>
            </div>
          )}

          {/* Hidden canvas for photo capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </div>
  )
} 