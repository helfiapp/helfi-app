'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'

export default function ProfileImage() {
  const { data: session } = useSession()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [currentProfileImage, setCurrentProfileImage] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load current profile image on mount
  useEffect(() => {
    const loadCurrentImage = async () => {
      try {
        const response = await fetch('/api/user-data');
        if (response.ok) {
          const result = await response.json();
          if (result.data && result.data.profileImage) {
            setCurrentProfileImage(result.data.profileImage);
          }
        } else {
          // Fallback to localStorage
          const savedImage = localStorage.getItem('profileImage');
          if (savedImage) {
            setCurrentProfileImage(savedImage);
          }
        }
      } catch (error) {
        console.error('Error loading profile image:', error);
        const savedImage = localStorage.getItem('profileImage');
        if (savedImage) {
          setCurrentProfileImage(savedImage);
        }
      }
    };

    loadCurrentImage();
  }, []);

  // Auto-save when image changes
  useEffect(() => {
    if (!selectedImage) return;

    const saveImage = async () => {
      setSaveStatus('saving');
      
      try {
        // Convert image to base64 for storage
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64Image = e.target?.result as string;
          
          try {
            // Save to database
            await fetch('/api/user-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ profileImage: base64Image })
            });

            // Also save to localStorage as backup
            localStorage.setItem('profileImage', base64Image);
            
            setCurrentProfileImage(base64Image);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
          } catch (error) {
            console.error('Error saving to database:', error);
            // Fallback to localStorage
            localStorage.setItem('profileImage', base64Image);
            setCurrentProfileImage(base64Image);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
          }
        };
        reader.readAsDataURL(selectedImage);
      } catch (error) {
        console.error('Error processing image:', error);
        setSaveStatus('idle');
      }
    };

    saveImage();
  }, [selectedImage]);

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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } // Front camera
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setShowCamera(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Unable to access camera. Please check permissions.');
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
        // Remove from database
        await fetch('/api/user-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileImage: null })
        });

        // Remove from localStorage
        localStorage.removeItem('profileImage');
        
        setCurrentProfileImage(null);
        setSelectedImage(null);
        setImagePreview(null);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (error) {
        console.error('Error removing image:', error);
        // Fallback to localStorage
        localStorage.removeItem('profileImage');
        setCurrentProfileImage(null);
        setSelectedImage(null);
        setImagePreview(null);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    }
  };

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
          
          <div className="flex items-center space-x-4">
            {/* Auto-save Status */}
            {saveStatus === 'saving' && (
              <div className="flex items-center text-blue-600">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                <span className="text-sm font-medium">Saving...</span>
              </div>
            )}
            {saveStatus === 'saved' && (
              <div className="flex items-center text-green-600">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium">Saved</span>
              </div>
            )}
            
            <Link href="/profile" className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors">
              Back to Profile
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Upload Profile Picture</h2>
            <div className="text-sm text-gray-500">
              Changes are saved automatically
            </div>
          </div>
          
          {/* Auto-save Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-blue-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-blue-700 text-sm">
                <span className="font-medium">Auto-save enabled:</span> Your profile picture is automatically saved when you select or capture an image.
              </p>
            </div>
          </div>
          
          {/* Current Profile Picture */}
          <div className="text-center mb-8">
            <div className="w-32 h-32 mx-auto mb-4 relative">
              {(imagePreview || currentProfileImage) ? (
                <div className="relative">
                  <Image
                    src={imagePreview || currentProfileImage || ''}
                    alt="Profile Picture"
                    width={128}
                    height={128}
                    className="w-full h-full object-cover rounded-full border-4 border-helfi-green"
                  />
                  {imagePreview && (
                    <div className="absolute -top-2 -right-2">
                      <div className="bg-green-100 text-green-800 rounded-full p-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full bg-helfi-green rounded-full flex items-center justify-center">
                  <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
              )}
            </div>
            <p className="text-gray-600">
              {imagePreview ? 'New profile picture (auto-saved)' : currentProfileImage ? 'Current profile picture' : 'No profile picture'}
            </p>
            {imagePreview && (
              <div className="mt-2">
                <button
                  onClick={() => {
                    setImagePreview(null);
                    setSelectedImage(null);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Remove preview
                </button>
              </div>
            )}
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
                    className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={capturePhoto}
                    className="flex-1 bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors"
                  >
                    📷 Capture
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Upload Options */}
          <div className="space-y-6">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-helfi-green transition-colors">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Upload a new picture</h3>
              <p className="text-gray-600 mb-4">PNG, JPG up to 5MB</p>
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
                className="bg-helfi-green text-white px-6 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors cursor-pointer inline-block"
              >
                Choose File
              </label>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-500 mb-4">Or take a photo</p>
              <button 
                onClick={startCamera}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition-colors"
              >
                📷 Take Photo
              </button>
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