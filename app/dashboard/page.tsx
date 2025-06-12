'use client'

import React, { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

export default function Dashboard() {
  const { data: session } = useSession()
  const [onboardingData, setOnboardingData] = useState<any>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

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
    // Ensure data is saved before navigating
    if (onboardingData) {
      localStorage.setItem('onboardingData', JSON.stringify(onboardingData))
      console.log('Preserving existing data for edit:', onboardingData)
    }
    // Add a flag to indicate we're editing
    localStorage.setItem('isEditing', 'true')
    window.location.href = '/onboarding'
  }

  const handleResetData = () => {
    localStorage.removeItem('onboardingData')
    setOnboardingData(null)
    setShowResetConfirm(false)
    // Optionally redirect to onboarding
    window.location.href = '/onboarding'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-helfi-black mb-4">
              Welcome to Your Health Dashboard
            </h1>
            <p className="text-gray-600">
              Your personalized health intelligence platform is being built!
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-helfi-green/5 p-6 rounded-lg border-2 border-helfi-green/20">
              <h3 className="font-semibold text-helfi-black mb-2">🎯 Health Tracking</h3>
              <p className="text-sm text-gray-600">Track your daily metrics and progress</p>
              <div className="mt-4 text-center">
                <span className="text-2xl font-bold text-helfi-green">Coming Soon</span>
              </div>
            </div>

            <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-200">
              <h3 className="font-semibold text-helfi-black mb-2">🤖 AI Insights</h3>
              <p className="text-sm text-gray-600">Personalized health recommendations</p>
              <div className="mt-4 text-center">
                <span className="text-2xl font-bold text-blue-600">Coming Soon</span>
              </div>
            </div>

            <div className="bg-purple-50 p-6 rounded-lg border-2 border-purple-200">
              <h3 className="font-semibold text-helfi-black mb-2">📊 Reports</h3>
              <p className="text-sm text-gray-600">Weekly health analysis and trends</p>
              <div className="mt-4 text-center">
                <span className="text-2xl font-bold text-purple-600">Coming Soon</span>
              </div>
            </div>
          </div>

          {/* Onboarding Data Section */}
          {onboardingData && (
            <div className="mt-8 bg-gray-50 rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Your Profile Information</h3>
                <div className="space-x-3">
                  <button
                    onClick={handleEditOnboarding}
                    className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors text-sm"
                  >
                    ✏️ Edit Profile
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-sm"
                  >
                    🔄 Reset All Data
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Gender:</strong> {onboardingData.gender}
                </div>
                <div>
                  <strong>Weight:</strong> {onboardingData.weight} {onboardingData.unit === 'metric' ? 'kg' : 'lbs'}
                </div>
                <div>
                  <strong>Height:</strong> {onboardingData.height || `${onboardingData.feet}'${onboardingData.inches}"`}
                </div>
                <div>
                  <strong>Body Type:</strong> {onboardingData.bodyType}
                </div>
                <div>
                  <strong>Exercise Frequency:</strong> {onboardingData.exerciseFrequency}
                </div>
                <div>
                  <strong>Exercise Types:</strong> {(onboardingData.exerciseTypes || []).join(', ')}
                </div>
                <div className="md:col-span-2">
                  <strong>Health Goals:</strong> {(onboardingData.goals || []).join(', ')}
                </div>
                {onboardingData.healthIssues && (
                  <div className="md:col-span-2">
                    <strong>Health Issues:</strong> {onboardingData.healthIssues}
                  </div>
                )}
                {onboardingData.healthProblems && (
                  <div className="md:col-span-2">
                    <strong>Health Problems:</strong> {onboardingData.healthProblems}
                  </div>
                )}
                <div className="md:col-span-2">
                  <strong>Supplements:</strong> {(onboardingData.supplements || []).map((s: any) => 
                    `${s.name} (${s.dosage}, ${Array.isArray(s.timing) ? s.timing.join(', ') : s.timing})`
                  ).join('; ') || 'None'}
                </div>
                <div className="md:col-span-2">
                  <strong>Medications:</strong> {(onboardingData.medications || []).map((m: any) => 
                    `${m.name} (${m.dosage}, ${Array.isArray(m.timing) ? m.timing.join(', ') : m.timing})`
                  ).join('; ') || 'None'}
                </div>
              </div>
            </div>
          )}

          {!onboardingData && (
            <div className="mt-8 text-center">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">Complete Your Profile</h3>
                <p className="text-yellow-700 mb-4">
                  To get personalized health insights, please complete your onboarding profile.
                </p>
                <button
                  onClick={handleEditOnboarding}
                  className="bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green/90 transition-colors"
                >
                  Start Profile Setup
                </button>
              </div>
            </div>
          )}

          <div className="text-center mt-8">
            <div className="inline-flex items-center px-4 py-2 bg-helfi-green/10 text-helfi-green rounded-full text-sm">
              ✨ Your health journey starts here - Features launching soon!
            </div>
          </div>

          {session?.user && (
            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Logged in as: <span className="font-medium">{session.user.email}</span>
              </p>
            </div>
          )}

          {/* Reset Confirmation Modal */}
          {showResetConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md mx-4">
                <h3 className="text-lg font-semibold text-red-600 mb-4">⚠️ Reset All Data</h3>
                <p className="text-gray-700 mb-6">
                  Are you sure you want to reset all your data? This will permanently delete all your:
                </p>
                <ul className="text-sm text-gray-600 mb-6 space-y-1">
                  <li>• Profile information</li>
                  <li>• Health goals and preferences</li>
                  <li>• Supplement and medication data</li>
                  <li>• Health situation details</li>
                  <li>• Blood results uploads</li>
                </ul>
                <p className="text-red-600 font-medium mb-6">
                  This action cannot be undone!
                </p>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetData}
                    className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Yes, Reset All
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 