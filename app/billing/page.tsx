'use client'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import MobileMoreMenu from '@/components/MobileMoreMenu'
import UsageMeter from '@/components/UsageMeter'
import PageHeader from '@/components/PageHeader'
import ConfirmationModal from '@/components/ConfirmationModal'
import MessageModal from '@/components/MessageModal'

export default function BillingPage() {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(true)
  const [currentPlan, setCurrentPlan] = useState('free')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const router = useRouter()
  const [profileImage, setProfileImage] = useState<string>('')
  const [subscription, setSubscription] = useState<any>(null)
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false)
  const [isManagingSubscription, setIsManagingSubscription] = useState(false)
  const [isCreatingPortalSession, setIsCreatingPortalSession] = useState(false)
  
  // Modal states
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [messageModalContent, setMessageModalContent] = useState<{ title: string; message: string; type?: 'success' | 'error' | 'info' }>({ title: '', message: '' })

  // Stripe checkout
  const [isCreatingCheckout, setIsCreatingCheckout] = useState<string | null>(null)
  const startCheckout = async (plan: string, quantity: number = 1) => {
    try {
      setIsCreatingCheckout(plan)
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, quantity }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // Show user-friendly error message
        const errorMessage = data?.message || data?.error || 'Checkout error'
        setMessageModalContent({
          title: 'Checkout Error',
          message: errorMessage,
          type: 'error'
        })
        setShowMessageModal(true)
        return
      }
      const { url } = await res.json()
      if (url) {
        window.location.href = url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (e: any) {
      setMessageModalContent({
        title: 'Error',
        message: e?.message || 'Failed to start checkout',
        type: 'error'
      })
      setShowMessageModal(true)
    } finally {
      setIsCreatingCheckout(null)
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Check if click is outside both the button and the dropdown content
      if (!target.closest('.dropdown-container')) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [dropdownOpen]);

  // Load profile image from database
  useEffect(() => {
    const loadProfileImage = async () => {
      try {
        const response = await fetch('/api/user-data');
        if (response.ok) {
          const result = await response.json();
          if (result.data && result.data.profileImage) {
            setProfileImage(result.data.profileImage);
          }
        }
      } catch (error) {
        console.error('Error loading profile image:', error);
      }
    };

    if (session) {
      loadProfileImage();
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      setLoading(false)
    }
  }, [session])

  // Load subscription status
  useEffect(() => {
    const loadSubscription = async () => {
      try {
        const res = await fetch('/api/billing/subscription')
        if (res.ok) {
          const data = await res.json()
          console.log('Subscription data:', data) // Debug log
          if (data.hasSubscription && data.isActive) {
            setSubscription(data.subscription)
            setHasActiveSubscription(true)
            setCurrentPlan(data.subscription?.tier || 'free')
          } else {
            setHasActiveSubscription(false)
            setSubscription(null)
          }
        } else {
          console.error('Failed to load subscription:', res.status)
        }
      } catch (error) {
        console.error('Error loading subscription:', error)
      }
    }
    if (session) {
      loadSubscription()
    }
  }, [session])

  // If returning from Stripe, confirm top-up (no useSearchParams to keep static safe)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    const sid = params.get('session_id')
    if (checkout === 'success' && sid) {
      fetch(`/api/billing/confirm?session_id=${encodeURIComponent(sid)}`)
        .then(() => {
          // Reload subscription after successful checkout
          fetch('/api/billing/subscription')
            .then(res => res.json())
            .then(data => {
              if (data.hasSubscription && data.isActive) {
                setSubscription(data.subscription)
                setCurrentPlan(data.subscription.tier)
              }
            })
            .catch(() => {})
        })
        .catch(() => {})
    }
  }, [])

  // Handle subscription management
  const handleCancelSubscription = async () => {
    setShowCancelConfirm(true)
  }

  const confirmCancelSubscription = async () => {
    setShowCancelConfirm(false)
    setIsManagingSubscription(true)
    try {
      const res = await fetch('/api/billing/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      
      if (res.ok) {
        const data = await res.json()
        
        // Format the cancellation date message
        let message = data.message || 'Subscription canceled successfully'
        if (data.cancellationDate) {
          const cancelDate = new Date(data.cancellationDate)
          const formattedDate = cancelDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })
          message = `Your subscription will remain active until ${formattedDate}. After that date, your subscription will be canceled and you'll lose access to premium features.`
        }
        
        setMessageModalContent({
          title: 'Subscription Canceled',
          message,
          type: 'success'
        })
        setShowMessageModal(true)
        
        // Reload subscription status
        const subRes = await fetch('/api/billing/subscription')
        if (subRes.ok) {
          const subData = await subRes.json()
          if (subData.hasSubscription && subData.isActive) {
            setSubscription(subData.subscription)
            setHasActiveSubscription(true)
          } else {
            setHasActiveSubscription(false)
            setSubscription(null)
          }
        }
      } else {
        const error = await res.json().catch(() => ({}))
        setMessageModalContent({
          title: 'Error',
          message: error.message || error.error || error.details?.message || 'Failed to cancel subscription',
          type: 'error'
        })
        setShowMessageModal(true)
      }
    } catch (error: any) {
      console.error('Cancel subscription error:', error)
      setMessageModalContent({
        title: 'Error',
        message: error?.message || 'Failed to cancel subscription',
        type: 'error'
      })
      setShowMessageModal(true)
    } finally {
      setIsManagingSubscription(false)
    }
  }

  const handleChangePlan = async (newPlan: string, action: 'upgrade' | 'downgrade') => {
    setIsManagingSubscription(true)
    try {
      const res = await fetch('/api/billing/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, newPlan }),
      })
      
      if (res.ok) {
        const data = await res.json()
        setMessageModalContent({
          title: 'Success',
          message: data.message || `Subscription ${action === 'upgrade' ? 'upgraded' : 'downgraded'} successfully`,
          type: 'success'
        })
        setShowMessageModal(true)
        // Reload subscription status
        const subRes = await fetch('/api/billing/subscription')
        if (subRes.ok) {
          const subData = await subRes.json()
          if (subData.hasSubscription && subData.isActive) {
            setSubscription(subData.subscription)
            setHasActiveSubscription(true)
            setCurrentPlan(subData.subscription.tier)
          } else {
            setHasActiveSubscription(false)
            setSubscription(null)
          }
        }
      } else {
        const error = await res.json().catch(() => ({}))
        setMessageModalContent({
          title: 'Error',
          message: error.message || error.error || error.details?.message || `Failed to ${action} subscription`,
          type: 'error'
        })
        setShowMessageModal(true)
      }
    } catch (error: any) {
      console.error(`${action} subscription error:`, error)
      setMessageModalContent({
        title: 'Error',
        message: error?.message || `Failed to ${action} subscription`,
        type: 'error'
      })
      setShowMessageModal(true)
    } finally {
      setIsManagingSubscription(false)
    }
  }

  const handleManagePortal = async () => {
    setIsCreatingPortalSession(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // Show the actual error message from the API
        const errorMessage = data?.message || data?.error || 'Could not open subscription management. Please try again.'
        setMessageModalContent({
          title: 'Error',
          message: errorMessage,
          type: 'error'
        })
        setShowMessageModal(true)
        return
      }
      const data = await res.json()
      if (data?.url) {
        window.location.href = data.url
      } else {
        setMessageModalContent({
          title: 'Error',
          message: 'Could not open subscription management. Please try again.',
          type: 'error'
        })
        setShowMessageModal(true)
      }
    } catch (err: any) {
      console.error('Portal error:', err)
      setMessageModalContent({
        title: 'Error',
        message: err?.message || 'Could not open subscription management. Please try again.',
        type: 'error'
      })
      setShowMessageModal(true)
    } finally {
      setIsCreatingPortalSession(false)
    }
  }

  const handleSignOut = async () => {
    // Clear user-specific localStorage before signing out
    if (session?.user?.id) {
      localStorage.removeItem(`profileImage_${session.user.id}`);
      localStorage.removeItem(`cachedProfileImage_${session.user.id}`);
    }
    await signOut({ callbackUrl: '/auth/signin' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Subscription & Billing" />

      {/* Main Content */}
              <div className="max-w-6xl mx-auto px-6 py-8 pb-24 md:pb-8">
        {/* Test mode note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-900">
          Stripe Sandbox is enabled for testing. Use test card 4242 4242 4242 4242, any future expiry, any CVC and ZIP.
        </div>

        {/* Current Subscription */}
        {hasActiveSubscription && subscription && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8 border-2 border-green-500">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Current Subscription</h2>
                <p className="text-gray-600 mt-1">
                  {subscription.tier} 
                  {subscription.credits > 0 && ` - ${subscription.credits.toLocaleString()} credits/month`}
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Status</div>
                <div className="text-lg font-semibold text-green-600">Active</div>
              </div>
            </div>
            
            {subscription.stripeCurrentPeriodEnd && (
              <div className="mb-4 text-sm text-gray-600">
                Next billing date: {new Date(subscription.stripeCurrentPeriodEnd).toLocaleDateString()}
              </div>
            )}

            {subscription.stripeCancelAtPeriodEnd && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                ⚠️ Your subscription will be canceled at the end of the current billing period.
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleManagePortal}
                disabled={isCreatingPortalSession}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingPortalSession ? 'Opening portal…' : 'Manage subscription'}
              </button>

              {!subscription.stripeCancelAtPeriodEnd && (
                <button
                  onClick={handleCancelSubscription}
                  disabled={isManagingSubscription}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isManagingSubscription ? 'Processing...' : 'Cancel Subscription'}
                </button>
              )}
              
              {/* Upgrade/Downgrade options */}
              {(!subscription.monthlyPriceCents || subscription.monthlyPriceCents !== 1000) && (
                <button
                  onClick={() => handleChangePlan('plan_10_monthly', (subscription.monthlyPriceCents || 0) > 1000 ? 'downgrade' : 'upgrade')}
                  disabled={isManagingSubscription}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {(subscription.monthlyPriceCents || 0) > 1000 ? 'Downgrade to $10/month' : 'Switch to $10/month'}
                </button>
              )}
              
              {(!subscription.monthlyPriceCents || subscription.monthlyPriceCents !== 2000) && (
                <button
                  onClick={() => handleChangePlan('plan_20_monthly', (subscription.monthlyPriceCents || 0) > 2000 ? 'downgrade' : 'upgrade')}
                  disabled={isManagingSubscription}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {(subscription.monthlyPriceCents || 0) > 2000 ? 'Downgrade to $20/month' : 'Switch to $20/month'}
                </button>
              )}
              
              {(!subscription.monthlyPriceCents || subscription.monthlyPriceCents !== 3000) && (
                <button
                  onClick={() => handleChangePlan('plan_30_monthly', (subscription.monthlyPriceCents || 0) > 3000 ? 'downgrade' : 'upgrade')}
                  disabled={isManagingSubscription}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {(subscription.monthlyPriceCents || 0) > 3000 ? 'Downgrade to $30/month' : 'Switch to $30/month'}
                </button>
              )}
              
              {(!subscription.monthlyPriceCents || subscription.monthlyPriceCents !== 5000) && (
                <button
                  onClick={() => handleChangePlan('plan_50_monthly', (subscription.monthlyPriceCents || 0) > 5000 ? 'downgrade' : 'upgrade')}
                  disabled={isManagingSubscription}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {(subscription.monthlyPriceCents || 0) > 5000 ? 'Downgrade to $50/month' : 'Switch to $50/month'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Available Plans */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Plans</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* $10 plan */}
            <div className="border border-gray-200 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">$10 / month</h3>
              <p className="text-3xl font-bold text-gray-900 mb-1">Monthly wallet: 700 credits</p>
              <p className="text-xs text-gray-500 mb-4">Credits refresh monthly. No rollover.</p>
              <ul className="space-y-2 mb-6 text-sm text-gray-600">
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> All features unlocked</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Percentage‑based usage meter</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Top‑ups valid 12 months</li>
              </ul>
              <button
                onClick={() => startCheckout('plan_10_monthly')}
                disabled={isCreatingCheckout === 'plan_10_monthly'}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors disabled:opacity-60"
              >
                {isCreatingCheckout === 'plan_10_monthly' ? 'Redirecting…' : 'Choose $10 Plan'}
              </button>
            </div>

            {/* $20 plan */}
            <div className="border border-gray-200 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">$20 / month</h3>
              <p className="text-3xl font-bold text-gray-900 mb-1">Monthly wallet: 1,400 credits</p>
              <p className="text-xs text-gray-500 mb-4">Credits refresh monthly. No rollover.</p>
              <ul className="space-y-2 mb-6 text-sm text-gray-600">
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> All features unlocked</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Percentage‑based usage meter</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Top‑ups valid 12 months</li>
              </ul>
              <button
                onClick={() => startCheckout('plan_20_monthly')}
                disabled={isCreatingCheckout === 'plan_20_monthly'}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors disabled:opacity-60"
              >
                {isCreatingCheckout === 'plan_20_monthly' ? 'Redirecting…' : 'Choose $20 Plan'}
              </button>
            </div>

            {/* $30 plan */}
            <div className="border-2 border-helfi-green rounded-2xl p-8 relative shadow-sm hover:shadow-lg transition-shadow bg-white">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-helfi-green text-white px-3 py-1 rounded-full text-sm font-medium">Most Popular</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">$30 / month</h3>
              <p className="text-3xl font-bold text-gray-900 mb-1">Monthly wallet: 2,100 credits</p>
              <p className="text-xs text-gray-500 mb-4">Credits refresh monthly. No rollover.</p>
              <ul className="space-y-2 mb-6 text-sm text-gray-600">
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> All features unlocked</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Percentage‑based usage meter</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Top‑ups valid 12 months</li>
              </ul>
              <button
                onClick={() => startCheckout('plan_30_monthly')}
                disabled={isCreatingCheckout === 'plan_30_monthly'}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors disabled:opacity-60"
              >
                {isCreatingCheckout === 'plan_30_monthly' ? 'Redirecting…' : 'Choose $30 Plan'}
              </button>
            </div>

            {/* $50 plan */}
            <div className="border border-gray-200 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">$50 / month</h3>
              <p className="text-3xl font-bold text-gray-900 mb-1">Monthly wallet: 3,500 credits</p>
              <p className="text-xs text-gray-500 mb-4">Credits refresh monthly. No rollover.</p>
              <ul className="space-y-2 mb-6 text-sm text-gray-600">
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> All features unlocked</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Percentage‑based usage meter</li>
                <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Top‑ups valid 12 months</li>
              </ul>
              <button
                onClick={() => startCheckout('plan_50_monthly')}
                disabled={isCreatingCheckout === 'plan_50_monthly'}
                className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-60"
              >
                {isCreatingCheckout === 'plan_50_monthly' ? 'Redirecting…' : 'Choose $50 Plan'}
              </button>
            </div>
          </div>
        </div>

        {/* Credits */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Buy Extra Credits</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Try with $5 (250 credits)</h3>
              <p className="text-sm text-gray-600 mb-6">One‑time top‑up. Credits valid for 12 months.</p>
              <button
                onClick={() => startCheckout('credits_250')}
                disabled={isCreatingCheckout === 'credits_250'}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors disabled:opacity-60"
              >
                {isCreatingCheckout === 'credits_250' ? 'Redirecting…' : 'Buy $5 Credits'}
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">$10 (500 credits)</h3>
              <p className="text-sm text-gray-600 mb-6">One‑time top‑up. Credits valid for 12 months.</p>
              <button
                onClick={() => startCheckout('credits_500')}
                disabled={isCreatingCheckout === 'credits_500'}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors disabled:opacity-60"
              >
                {isCreatingCheckout === 'credits_500' ? 'Redirecting…' : 'Buy $10 Credits'}
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">$20 (1,000 credits)</h3>
              <p className="text-sm text-gray-600 mb-6">One‑time top‑up. Credits valid for 12 months.</p>
              <button
                onClick={() => startCheckout('credits_1000')}
                disabled={isCreatingCheckout === 'credits_1000'}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors disabled:opacity-60"
              >
                {isCreatingCheckout === 'credits_1000' ? 'Redirecting…' : 'Buy $20 Credits'}
              </button>
            </div>
          </div>
        </div>

        {/* Billing History */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Billing History</h2>
          <div className="text-center py-8">
            <p className="text-gray-500">No billing history available.</p>
            <p className="text-sm text-gray-400 mt-2">Your billing history will appear here after your first payment.</p>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          
          {/* Dashboard */}
          <Link href="/dashboard" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Dashboard</span>
          </Link>

          {/* Insights */}
          <Link href="/insights" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Insights</span>
          </Link>

          {/* Food */}
          <Link href="/food" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Food</span>
          </Link>

          <MobileMoreMenu />

          {/* Settings */}
          <Link href="/settings" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <Cog6ToothIcon className="w-6 h-6 flex-shrink-0" style={{ minWidth: '24px', minHeight: '24px' }} />
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Settings</span>
          </Link>

        </div>
      </nav>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={confirmCancelSubscription}
        title="Cancel Subscription"
        message="Are you sure you want to cancel your subscription? It will remain active until the end of the current billing period."
        confirmText="Yes, Cancel Subscription"
        cancelText="Keep Subscription"
        confirmButtonClass="bg-red-500 hover:bg-red-600"
        isLoading={isManagingSubscription}
      />

      {/* Message Modal */}
      <MessageModal
        isOpen={showMessageModal}
        onClose={() => setShowMessageModal(false)}
        title={messageModalContent.title}
        message={messageModalContent.message}
        type={messageModalContent.type}
      />
    </div>
  )
} 
