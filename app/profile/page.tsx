'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Header from '@/components/ui/Header'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import BottomNav from '../../components/BottomNav'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [onboardingData, setOnboardingData] = useState<any>(null)
  const [userImage, setUserImage] = useState<string | null>(null)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', email: '' })
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) {
        setEditForm({
          name: user.user_metadata?.name || user.email?.split('@')[0] || '',
          email: user.email || ''
        })
      }
      setLoading(false)
    }
    getUser()
  }, [])

  // Load profile image from localStorage or user metadata
  useEffect(() => {
    const savedImage = localStorage.getItem('userProfileImage')
    if (savedImage) {
      setUserImage(savedImage)
    } else if (user?.user_metadata?.avatar_url) {
      setUserImage(user.user_metadata.avatar_url)
    }
  }, [user])

  useEffect(() => {
    // Load onboarding data
    const data = localStorage.getItem('onboardingData')
    if (data) {
      try {
        setOnboardingData(JSON.parse(data))
      } catch (error) {
        console.error('Error loading onboarding data:', error)
      }
    }
  }, [])

  const handleEditOnboarding = () => {
    if (onboardingData) {
      localStorage.setItem('onboardingData', JSON.stringify(onboardingData))
    }
    localStorage.setItem('isEditing', 'true')
    router.push('/onboarding')
  }

  const handleResetData = () => {
    localStorage.removeItem('onboardingData')
    localStorage.removeItem('healthTracking')
    localStorage.removeItem('userProfileImage')
    setOnboardingData(null)
    setUserImage(null)
    setShowResetDialog(false)
    alert('All data has been reset successfully!')
  }

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert('Image size must be less than 5MB')
        return
      }
      
      const reader = new FileReader()
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string
        setUserImage(imageUrl)
        localStorage.setItem('userProfileImage', imageUrl)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleEditProfile = () => {
    setShowEditProfile(true)
  }

  const handleSaveProfile = async () => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: { name: editForm.name }
      })
      
      if (error) throw error
      
      // Update local user state
      setUser((prev: any) => ({
        ...prev,
        user_metadata: { ...prev.user_metadata, name: editForm.name }
      }))
      
      setShowEditProfile(false)
      alert('Profile updated successfully!')
    } catch (error) {
      console.error('Error updating profile:', error)
      alert('Failed to update profile. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const userEmail = user?.email || ''

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Header 
        title="Profile" 
        subtitle="Manage your account and health information"
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto">
        <div className="space-y-6">
          {/* Profile Header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-6">
                <div className="flex justify-center sm:justify-start mb-4 sm:mb-0">
                  <div className="relative">
                    {userImage ? (
                      <img
                        src={userImage}
                        alt="Profile"
                        className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center border-4 border-white shadow-lg">
                        <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </div>
                    )}
                    <label className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full shadow-lg border-2 border-gray-100 flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </label>
                  </div>
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h1 className="text-2xl font-bold text-gray-900">{userName}</h1>
                  <p className="text-gray-600 mt-1">{userEmail}</p>
                  <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      ✓ Verified Account
                    </span>
                    {onboardingData && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        ✓ Profile Complete
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-center sm:justify-end">
                  <Button variant="outline" onClick={handleEditProfile}>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Profile
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {onboardingData ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Health Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Health Information</CardTitle>
                  <CardDescription>Your basic health profile</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Gender</label>
                      <p className="text-gray-900 font-medium">{onboardingData.gender || 'Not specified'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Body Type</label>
                      <p className="text-gray-900 font-medium">{onboardingData.bodyType || 'Not specified'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Weight</label>
                      <p className="text-gray-900 font-medium">
                        {onboardingData.weight ? `${onboardingData.weight} ${onboardingData.unit === 'metric' ? 'kg' : 'lbs'}` : 'Not specified'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Height</label>
                      <p className="text-gray-900 font-medium">
                        {onboardingData.height || (onboardingData.feet && onboardingData.inches ? `${onboardingData.feet}'${onboardingData.inches}"` : 'Not specified')}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Exercise Frequency</label>
                    <p className="text-gray-900 font-medium">{onboardingData.exerciseFrequency || 'Not specified'}</p>
                  </div>
                  {onboardingData.exerciseTypes && onboardingData.exerciseTypes.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Exercise Types</label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {onboardingData.exerciseTypes.map((type: string, index: number) => (
                          <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Health Goals */}
              <Card>
                <CardHeader>
                  <CardTitle>Health Goals</CardTitle>
                  <CardDescription>Your current health objectives</CardDescription>
                </CardHeader>
                <CardContent>
                  {onboardingData.healthGoals && onboardingData.healthGoals.length > 0 ? (
                    <div className="space-y-3">
                      {onboardingData.healthGoals.map((goal: string, index: number) => (
                        <div key={index} className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-green-800 font-medium">{goal}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-gray-500">No health goals set</p>
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button variant="outline" fullWidth onClick={handleEditOnboarding}>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Update Goals
                  </Button>
                </CardFooter>
              </Card>

              {/* Supplements */}
              <Card>
                <CardHeader>
                  <CardTitle>Supplements</CardTitle>
                  <CardDescription>Your current supplement regimen</CardDescription>
                </CardHeader>
                <CardContent>
                  {onboardingData.supplements && onboardingData.supplements.length > 0 ? (
                    <div className="space-y-3">
                      {onboardingData.supplements.map((supplement: any, index: number) => (
                        <div key={index} className="p-3 border border-gray-200 rounded-lg">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium text-gray-900">{supplement.name}</h4>
                              <p className="text-sm text-gray-600">{supplement.dosage}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-500">
                                {Array.isArray(supplement.timing) ? supplement.timing.join(', ') : supplement.timing}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      <p className="text-gray-500">No supplements added</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Medications */}
              <Card>
                <CardHeader>
                  <CardTitle>Medications</CardTitle>
                  <CardDescription>Your current medications</CardDescription>
                </CardHeader>
                <CardContent>
                  {onboardingData.medications && onboardingData.medications.length > 0 ? (
                    <div className="space-y-3">
                      {onboardingData.medications.map((medication: any, index: number) => (
                        <div key={index} className="p-3 border border-red-200 bg-red-50 rounded-lg">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium text-red-900">{medication.name}</h4>
                              <p className="text-sm text-red-700">{medication.dosage}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-red-600">
                                {Array.isArray(medication.timing) ? medication.timing.join(', ') : medication.timing}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <p className="text-gray-500">No medications added</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            /* No Health Data State */
            <Card className="text-center py-12">
              <CardContent>
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Complete Your Health Profile</h2>
                <p className="text-gray-600 mb-8 max-w-md mx-auto">
                  Add your health information to get personalized insights and track your progress effectively.
                </p>
                <Button onClick={handleEditOnboarding} size="lg">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Start Health Profile
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Account Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Account Actions</CardTitle>
              <CardDescription>Manage your profile and data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {onboardingData && (
                  <Button variant="outline" onClick={handleEditOnboarding} className="justify-start h-auto py-3">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <div className="text-left">
                        <div className="font-medium">Edit Health Info</div>
                        <div className="text-sm text-gray-500">Update your profile</div>
                      </div>
                    </div>
                  </Button>
                )}
                
                <Button variant="outline" className="justify-start h-auto py-3">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="text-left">
                      <div className="font-medium">Export Data</div>
                      <div className="text-sm text-gray-500">Download your info</div>
                    </div>
                  </div>
                </Button>

                <Button 
                  variant="destructive" 
                  onClick={() => setShowResetDialog(true)}
                  className="justify-start h-auto py-3"
                >
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <div className="text-left">
                      <div className="font-medium text-white">Reset Data</div>
                      <div className="text-sm text-white opacity-80">Clear all info</div>
                    </div>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Edit Profile Modal */}
          {showEditProfile && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <Card className="w-full max-w-md">
                <CardHeader>
                  <CardTitle>Edit Profile</CardTitle>
                  <CardDescription>
                    Update your profile information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="Enter your name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={editForm.email}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    fullWidth
                    onClick={() => setShowEditProfile(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    fullWidth
                    onClick={handleSaveProfile}
                  >
                    Save Changes
                  </Button>
                </CardFooter>
              </Card>
            </div>
          )}

          {/* Reset Confirmation Modal */}
          {showResetDialog && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <Card className="w-full max-w-md">
                <CardHeader>
                  <CardTitle className="text-red-600">Reset All Data</CardTitle>
                  <CardDescription>
                    This action cannot be undone. All your health data, goals, and preferences will be permanently deleted.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    fullWidth
                    onClick={() => setShowResetDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    fullWidth
                    onClick={handleResetData}
                  >
                    Yes, Reset Everything
                  </Button>
                </CardFooter>
              </Card>
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  )
} 