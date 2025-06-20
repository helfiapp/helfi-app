'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import BottomNav from '../../components/BottomNav'
import Header from '../../components/ui/Header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AIInsightsPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [onboardingData, setOnboardingData] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()
  }, [])

  useEffect(() => {
    const savedData = localStorage.getItem('onboardingData')
    if (savedData) {
      try {
        setOnboardingData(JSON.parse(savedData))
      } catch (error) {
        console.error('Error parsing onboarding data:', error)
      }
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  const insights = [
    {
      title: "Health Score Analysis",
      description: "Based on your current health data, you're maintaining good overall wellness.",
      score: 85,
      trend: "up",
      recommendation: "Continue your current supplement routine and consider adding more cardio exercise."
    },
    {
      title: "Supplement Optimization",
      description: "Your Vitamin D3 timing could be optimized for better absorption.",
      score: 72,
      trend: "stable",
      recommendation: "Take Vitamin D3 with a meal containing healthy fats for improved absorption."
    },
    {
      title: "Exercise Pattern Analysis",
      description: "Your walking routine is consistent, which is excellent for cardiovascular health.",
      score: 90,
      trend: "up",
      recommendation: "Consider adding 2 days of strength training to complement your cardio routine."
    }
  ]

  const healthTrends = [
    { metric: "Energy Levels", value: "Improving", change: "+12%" },
    { metric: "Sleep Quality", value: "Good", change: "+5%" },
    { metric: "Supplement Adherence", value: "Excellent", change: "98%" },
    { metric: "Exercise Consistency", value: "Very Good", change: "+8%" }
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Header 
        title="AI Insights" 
        subtitle="Personalized health recommendations powered by AI"
      />

      <div className="max-w-6xl mx-auto px-4 py-6 pt-24">
        {onboardingData ? (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle size="md">Overall Health Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-4">
                    <div className="text-3xl font-bold text-green-600">85</div>
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-green-600 h-2 rounded-full" style={{ width: '85%' }}></div>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">Excellent</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle size="md">Active Goals</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600 mb-1">
                    {onboardingData.healthGoals?.length || 0}
                  </div>
                  <p className="text-sm text-gray-600">Health goals being tracked</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle size="md">Insights Generated</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600 mb-1">12</div>
                  <p className="text-sm text-gray-600">This month</p>
                </CardContent>
              </Card>
            </div>

            {/* AI Insights */}
            <Card>
              <CardHeader>
                <CardTitle>Personalized AI Insights</CardTitle>
                <CardDescription>
                  Based on your health data, goals, and patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {insights.map((insight, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 mb-1">{insight.title}</h3>
                          <p className="text-gray-600 text-sm">{insight.description}</p>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <div className="text-lg font-bold text-green-600">{insight.score}</div>
                          <div className={`w-4 h-4 ${insight.trend === 'up' ? 'text-green-500' : 'text-gray-400'}`}>
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm text-blue-800">
                          <span className="font-medium">Recommendation:</span> {insight.recommendation}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Health Trends */}
            <Card>
              <CardHeader>
                <CardTitle>Health Trends</CardTitle>
                <CardDescription>Your progress over the last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {healthTrends.map((trend, index) => (
                    <div key={index} className="text-center p-4 border border-gray-200 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2">{trend.metric}</h4>
                      <div className="text-lg font-semibold text-green-600 mb-1">{trend.value}</div>
                      <div className="text-sm text-gray-500">{trend.change}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Action Items */}
            <Card>
              <CardHeader>
                <CardTitle>Recommended Actions</CardTitle>
                <CardDescription>Steps to improve your health score</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Update your daily vitals</p>
                      <p className="text-sm text-gray-600">Track weight, blood pressure, and heart rate</p>
                    </div>
                    <Link href="/health-tracking">
                      <Button size="sm">Track Now</Button>
                    </Link>
                  </div>
                  
                  <div className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Review your health goals</p>
                      <p className="text-sm text-gray-600">Update or add new health objectives</p>
                    </div>
                    <Link href="/onboarding">
                      <Button size="sm" variant="outline">Review</Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* No Data State */
          <Card className="text-center py-12">
            <CardContent>
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Complete Your Health Profile</h2>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                Add your health information to get personalized AI insights and recommendations.
              </p>
              <Link href="/onboarding">
                <Button size="lg">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Start Health Profile
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      <BottomNav />
    </div>
  )
} 