'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/ui/Header'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import BottomNav from '../../components/BottomNav'

// Removed Supabase client

export default function HealthTrackingPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [onboardingData, setOnboardingData] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [trackingData, setTrackingData] = useState<any>({})
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const router = useRouter()

  useEffect(() => {
    // Simplified auth
    setUser({ email: 'info@sonicweb.com.au' })
    setLoading(false)
  }, [])

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

    // Load tracking data
    const tracking = localStorage.getItem('healthTracking')
    if (tracking) {
      try {
        setTrackingData(JSON.parse(tracking))
      } catch (error) {
        console.error('Error loading tracking data:', error)
      }
    }
  }, [])

  const saveTrackingData = (newData: any) => {
    const updatedData = { ...trackingData, ...newData }
    setTrackingData(updatedData)
    localStorage.setItem('healthTracking', JSON.stringify(updatedData))
  }

  const getTodayData = () => {
    const today = new Date().toISOString().split('T')[0]
    return trackingData[today] || {}
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { id: 'supplements', label: 'Supplements', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
    { id: 'symptoms', label: 'Symptoms', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
    { id: 'vitals', label: 'Vitals', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' }
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading health tracking...</p>
        </div>
      </div>
    )
  }

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const todayData = getTodayData()

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Header 
        title="Health Tracking" 
        subtitle="Monitor your daily health metrics"
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto">
        {!onboardingData ? (
          /* No Health Profile State */
          <Card className="text-center py-12">
            <CardContent>
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Complete Your Profile First</h2>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                Add your health information and goals to start tracking your daily health metrics effectively.
              </p>
              <Button onClick={() => router.push('/onboarding')} size="lg">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Complete Health Profile
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Date Selector */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Daily Health Tracking</h2>
                    <p className="text-gray-600">Monitor your progress for {userName}</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <label className="text-sm font-medium text-gray-700">Date:</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tab Navigation */}
            <div className="flex flex-wrap border-b border-gray-200 bg-white rounded-t-lg">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-green-500 text-green-600 bg-green-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-b-lg shadow-sm">
              {activeTab === 'overview' && (
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Quick Stats */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Today's Progress</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Supplements Taken</span>
                          <span className="font-semibold text-green-600">
                            {todayData.supplementsTaken || 0} / {onboardingData.supplements?.length || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Symptoms Logged</span>
                          <span className="font-semibold text-blue-600">
                            {todayData.symptomsLogged || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Vitals Recorded</span>
                          <span className="font-semibold text-purple-600">
                            {todayData.vitalsRecorded || 0}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Recent Activity */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Recent Activity</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {todayData.recentActivity?.length > 0 ? (
                            todayData.recentActivity.map((activity: any, index: number) => (
                              <div key={index} className="flex items-center space-x-3 p-2 bg-gray-50 rounded-lg">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span className="text-sm text-gray-700">{activity}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-gray-500 text-sm">No activity recorded today</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Goals Progress */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Goals Progress</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {onboardingData.healthGoals?.map((goal: string, index: number) => (
                            <div key={index} className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-700">{goal}</span>
                                <span className="text-gray-500">75%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className="bg-green-500 h-2 rounded-full" style={{ width: '75%' }}></div>
                              </div>
                            </div>
                          )) || (
                            <p className="text-gray-500 text-sm">No goals set</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {activeTab === 'supplements' && (
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Supplement Tracking</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {onboardingData.supplements?.map((supplement: any, index: number) => (
                      <Card key={index}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-gray-900">{supplement.name}</h4>
                              <p className="text-sm text-gray-600">{supplement.dosage}</p>
                              <p className="text-xs text-gray-500">
                                {Array.isArray(supplement.timing) ? supplement.timing.join(', ') : supplement.timing}
                              </p>
                            </div>
                            <div className="flex flex-col items-center space-y-2">
                              <input
                                type="checkbox"
                                checked={todayData[`supplement_${index}`] || false}
                                onChange={(e) => {
                                  const newData = {
                                    [selectedDate]: {
                                      ...trackingData[selectedDate],
                                      [`supplement_${index}`]: e.target.checked,
                                      supplementsTaken: onboardingData.supplements.filter((_: any, i: number) => 
                                        i === index ? e.target.checked : trackingData[selectedDate]?.[`supplement_${i}`]
                                      ).length
                                    }
                                  }
                                  saveTrackingData(newData)
                                }}
                                className="w-5 h-5 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
                              />
                              <span className="text-xs text-gray-500">Taken</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )) || (
                      <div className="col-span-2 text-center py-8">
                        <p className="text-gray-500">No supplements to track</p>
                        <Button variant="outline" className="mt-4" onClick={() => router.push('/onboarding')}>
                          Add Supplements
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'symptoms' && (
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Symptom Tracking</h3>
                  <Card>
                    <CardContent className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Energy Level (1-10)
                          </label>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            value={todayData.energyLevel || 5}
                            onChange={(e) => {
                              const newData = {
                                [selectedDate]: {
                                  ...trackingData[selectedDate],
                                  energyLevel: parseInt(e.target.value)
                                }
                              }
                              saveTrackingData(newData)
                            }}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>Low</span>
                            <span>{todayData.energyLevel || 5}</span>
                            <span>High</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Mood (1-10)
                          </label>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            value={todayData.mood || 5}
                            onChange={(e) => {
                              const newData = {
                                [selectedDate]: {
                                  ...trackingData[selectedDate],
                                  mood: parseInt(e.target.value)
                                }
                              }
                              saveTrackingData(newData)
                            }}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>Poor</span>
                            <span>{todayData.mood || 5}</span>
                            <span>Great</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Sleep Quality (1-10)
                          </label>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            value={todayData.sleepQuality || 5}
                            onChange={(e) => {
                              const newData = {
                                [selectedDate]: {
                                  ...trackingData[selectedDate],
                                  sleepQuality: parseInt(e.target.value)
                                }
                              }
                              saveTrackingData(newData)
                            }}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>Poor</span>
                            <span>{todayData.sleepQuality || 5}</span>
                            <span>Excellent</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Pain Level (0-10)
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="10"
                            value={todayData.painLevel || 0}
                            onChange={(e) => {
                              const newData = {
                                [selectedDate]: {
                                  ...trackingData[selectedDate],
                                  painLevel: parseInt(e.target.value)
                                }
                              }
                              saveTrackingData(newData)
                            }}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>None</span>
                            <span>{todayData.painLevel || 0}</span>
                            <span>Severe</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Additional Notes
                        </label>
                        <textarea
                          value={todayData.notes || ''}
                          onChange={(e) => {
                            const newData = {
                              [selectedDate]: {
                                ...trackingData[selectedDate],
                                notes: e.target.value
                              }
                            }
                            saveTrackingData(newData)
                          }}
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          placeholder="How are you feeling today? Any symptoms or observations..."
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === 'vitals' && (
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Vital Signs</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Weight</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            value={todayData.weight || ''}
                            onChange={(e) => {
                              const newData = {
                                [selectedDate]: {
                                  ...trackingData[selectedDate],
                                  weight: e.target.value
                                }
                              }
                              saveTrackingData(newData)
                            }}
                            placeholder={onboardingData?.weight || "0"}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                          <span className="text-sm text-gray-500">
                            {onboardingData.unit === 'metric' ? 'kg' : 'lbs'}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Blood Pressure</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            value={todayData.systolic || ''}
                            onChange={(e) => {
                              const newData = {
                                [selectedDate]: {
                                  ...trackingData[selectedDate],
                                  systolic: e.target.value
                                }
                              }
                              saveTrackingData(newData)
                            }}
                            placeholder="120"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                          <span className="text-gray-500">/</span>
                          <input
                            type="number"
                            value={todayData.diastolic || ''}
                            onChange={(e) => {
                              const newData = {
                                [selectedDate]: {
                                  ...trackingData[selectedDate],
                                  diastolic: e.target.value
                                }
                              }
                              saveTrackingData(newData)
                            }}
                            placeholder="80"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                          <span className="text-sm text-gray-500">mmHg</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Heart Rate</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            value={todayData.heartRate || ''}
                            onChange={(e) => {
                              const newData = {
                                [selectedDate]: {
                                  ...trackingData[selectedDate],
                                  heartRate: e.target.value
                                }
                              }
                              saveTrackingData(newData)
                            }}
                            placeholder="72"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                          <span className="text-sm text-gray-500">bpm</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </div>

            {/* Save Button */}
            <Card>
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600">
                      Data is automatically saved as you enter it
                    </p>
                  </div>
                  <div className="flex space-x-3">
                    <Button variant="outline">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      View Reports
                    </Button>
                    <Button>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      All Done for Today
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
} 