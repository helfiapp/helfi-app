'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/ui/Header'
import BottomNav from '../../components/BottomNav'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function BillingPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const userName = user?.user_metadata?.name || user?.email || 'User'

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Header 
        title="Subscription & Billing" 
        subtitle="Manage your subscription"
      />

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 py-6 pt-24">
        {/* Current Plan */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Current Plan</h2>
          <div className="bg-white rounded-lg shadow-sm p-6">
          
          <div className="bg-gradient-to-r from-helfi-green to-green-600 rounded-lg p-6 text-white mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold mb-2">AI Health Coach</h3>
                <p className="text-green-100 mb-4">Full access to AI health insights and personalized recommendations</p>
                <div className="flex items-center space-x-4">
                  <span className="text-2xl font-bold">$12</span>
                  <span className="text-green-100">/month</span>
                </div>
              </div>
              <div className="text-right">
                <div className="bg-white/20 rounded-lg px-3 py-1 text-sm">
                  Active
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 border border-gray-200 rounded-lg">
              <div className="text-2xl font-bold text-helfi-green mb-2">∞</div>
              <div className="text-sm text-gray-600">AI Health Insights</div>
            </div>
            <div className="text-center p-4 border border-gray-200 rounded-lg">
              <div className="text-2xl font-bold text-helfi-green mb-2">24/7</div>
              <div className="text-sm text-gray-600">Health Monitoring</div>
            </div>
            <div className="text-center p-4 border border-gray-200 rounded-lg">
              <div className="text-2xl font-bold text-helfi-green mb-2">✓</div>
              <div className="text-sm text-gray-600">Device Integration</div>
            </div>
          </div>
        </div>
        </div>

        {/* Billing Information */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Billing Information</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Method</h3>
              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <path d="M2 8h20v2H2z"/>
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">•••• •••• •••• 4242</div>
                    <div className="text-sm text-gray-600">Expires 12/25</div>
                  </div>
                </div>
                <button className="text-helfi-green hover:underline">Update</button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Billing Address</h3>
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="text-gray-900 mb-1">123 Health Street</div>
                <div className="text-gray-900 mb-1">San Francisco, CA 94102</div>
                <div className="text-gray-900">United States</div>
                <button className="text-helfi-green hover:underline mt-2">Update Address</button>
              </div>
            </div>
          </div>
        </div>

        {/* Billing History */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Billing History</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">AI Health Coach - January 2024</div>
                <div className="text-sm text-gray-600">Jan 1, 2024</div>
              </div>
              <div className="text-right">
                <div className="font-medium text-gray-900">$12.00</div>
                <button className="text-helfi-green hover:underline text-sm">Download</button>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">AI Health Coach - December 2023</div>
                <div className="text-sm text-gray-600">Dec 1, 2023</div>
              </div>
              <div className="text-right">
                <div className="font-medium text-gray-900">$12.00</div>
                <button className="text-helfi-green hover:underline text-sm">Download</button>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">AI Health Coach - November 2023</div>
                <div className="text-sm text-gray-600">Nov 1, 2023</div>
              </div>
              <div className="text-right">
                <div className="font-medium text-gray-900">$12.00</div>
                <button className="text-helfi-green hover:underline text-sm">Download</button>
              </div>
            </div>
          </div>
        </div>

        {/* Plan Management */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Plan Management</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">Next Billing Date</h3>
                <p className="text-sm text-gray-600">Your next payment of $12.00 will be charged on February 1, 2024</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">Change Plan</h3>
                <p className="text-sm text-gray-600">Upgrade or downgrade your subscription</p>
              </div>
              <Link href="/pricing" className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors inline-block text-center">
                View Plans
              </Link>
            </div>

            <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
              <div>
                <h3 className="font-medium text-red-900">Cancel Subscription</h3>
                <p className="text-sm text-red-600">Cancel your subscription (access continues until end of billing period)</p>
              </div>
              <button className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">
                Cancel Plan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
} 