'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type AdminUser = {
  id: string
  email: string
  name?: string | null
  createdAt: string
  dailyAnalysisCredits?: number | null
  dailyAnalysisUsed?: number | null
  additionalCredits?: number | null
  totalAvailableCredits?: number | null
  totalAnalysisCount?: number | null
  dailyFoodAnalysisUsed?: number | null
  dailyFoodReanalysisUsed?: number | null
  dailyInteractionAnalysisUsed?: number | null
  monthlyMedicalImageAnalysisUsed?: number | null
  monthlySymptomAnalysisUsed?: number | null
  monthlyInsightsGenerationUsed?: number | null
  lastAnalysisResetDate?: string | null
  subscription?: {
    plan?: string | null
    monthlyPriceCents?: number | null
    startDate?: string | null
    endDate?: string | null
  } | null
}

export default function AdminUserPage() {
  const router = useRouter()
  const params = useParams()
  const userId = params.userId as string
  const [adminToken, setAdminToken] = useState('')
  const [user, setUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionInFlight, setActionInFlight] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const storedToken = sessionStorage.getItem('adminToken') || ''
    setAdminToken(storedToken)
  }, [])

  const loadUser = useCallback(async () => {
    if (!adminToken || !userId) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        userId,
        page: '1',
        limit: '1',
      })
      const response = await fetch(`/api/admin/user-management?${params.toString()}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      if (response.ok) {
        const result = await response.json()
        setUser(result.users?.[0] || null)
        if (!result.users?.length) {
          setError('User not found. Try returning to the users list and selecting again.')
        }
      } else if (response.status === 401) {
        setError('Admin login is required to view this user.')
      } else {
        setError('Unable to load this user right now.')
      }
    } catch (err) {
      console.error('Failed to load user:', err)
      setError('Unable to load this user right now.')
    } finally {
      setLoading(false)
    }
  }, [adminToken, userId])

  useEffect(() => {
    if (adminToken) {
      loadUser()
    } else {
      setLoading(false)
    }
  }, [adminToken, loadUser])

  const handleUserAction = async (action: string, data?: any) => {
    if (!user) return
    const key = `${action}:${user.id}`
    if (actionInFlight[key]) return
    setActionInFlight((prev) => ({ ...prev, [key]: true }))
    try {
      const response = await fetch('/api/admin/user-management', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ action, userId: user.id, data }),
      })
      const result = await response.json()
      if (response.ok) {
        await loadUser()
        if (action === 'refund_latest_payment') {
          const amountCents = typeof result?.refundedAmountCents === 'number' ? result.refundedAmountCents : null
          const currency = typeof result?.currency === 'string' ? result.currency.toUpperCase() : 'AUD'
          const amountText = amountCents != null ? `${currency} ${(amountCents / 100).toFixed(2)}` : 'the payment'
          alert(`Refund started for ${amountText}. Access and credits will be removed automatically.`)
        } else {
          const successMessage = result?.message || `User ${action} completed successfully`
          alert(successMessage)
        }
      } else {
        const errorMessage = result.error || 'Action failed. Please try again.'
        alert(`Action failed: ${errorMessage}`)
      }
    } catch (err) {
      console.error('Failed to run user action:', err)
      alert('Action failed. Please try again.')
    } finally {
      setActionInFlight((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const planLabel = useMemo(() => {
    if (!user?.subscription?.plan || user.subscription.plan !== 'PREMIUM') {
      return 'No Subscription'
    }
    const price = user.subscription.monthlyPriceCents || 0
    if (user.subscription.endDate) {
      const endDate = new Date(user.subscription.endDate)
      const startDate = new Date(user.subscription.startDate || user.createdAt)
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      const credits = Math.floor(price * 0.5)
      if (totalDays > 90) return `Permanent (${credits} credits/month)`
      return `${totalDays}-Day Access (${credits} credits)`
    }
    if (price === 1000) return '$10/month (700 credits)'
    if (price === 2000) return '$20/month (1,400 credits)'
    if (price === 3000) return '$30/month (2,100 credits)'
    if (price === 5000) return '$50/month (3,500 credits)'
    return `$${Math.round(price / 100)}/month`
  }, [user])

  const accessLabel = useMemo(() => {
    if (!user?.subscription) return 'No Subscription'
    if (user.subscription.endDate) {
      const endDate = new Date(user.subscription.endDate)
      return endDate.getFullYear() > 2050
        ? 'Permanent Access'
        : `Expires ${endDate.toLocaleDateString()}`
    }
    return 'Active Premium Subscription'
  }, [user])

  const nextRenewal = useMemo(() => {
    if (!user?.subscription?.startDate || user.subscription.endDate) return null
    const startDate = new Date(user.subscription.startDate)
    const now = new Date()
    const startYear = startDate.getUTCFullYear()
    const startMonth = startDate.getUTCMonth()
    const startDay = startDate.getUTCDate()
    const currentYear = now.getUTCFullYear()
    const currentMonth = now.getUTCMonth()
    const currentDay = now.getUTCDate()
    let monthsSinceStart = (currentYear - startYear) * 12 + (currentMonth - startMonth)
    if (currentDay < startDay) monthsSinceStart--
    const nextRenewalDate = new Date(Date.UTC(startYear, startMonth + monthsSinceStart + 1, startDay, 0, 0, 0, 0))
    return nextRenewalDate.toLocaleDateString()
  }, [user])

  if (!adminToken && !loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center max-w-lg">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Admin login required</h1>
          <p className="text-slate-600 mb-6">
            Please sign in to the admin panel before managing user accounts.
          </p>
          <button
            onClick={() => router.push('/admin-panel')}
            className="bg-emerald-600 text-white px-5 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Go to Admin Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            onClick={() => router.push('/admin-panel?tab=management')}
            className="text-sm text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-2"
          >
            <span className="text-lg">←</span>
            Back to Users
          </button>
          <button
            onClick={() => loadUser()}
            className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:border-slate-300 hover:text-slate-900 transition-colors"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="mt-10 text-slate-500">Loading user details…</div>
        ) : error ? (
          <div className="mt-10 bg-white border border-rose-200 text-rose-700 rounded-xl p-6">
            {error}
          </div>
        ) : user ? (
          <>
            <div className="mt-6 bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <h1 className="text-2xl font-semibold text-slate-900">
                    {user.name || user.email}
                  </h1>
                  <p className="text-slate-500">{user.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    user.subscription?.plan === 'PREMIUM' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {user.subscription?.plan === 'PREMIUM' ? 'Premium' : 'Free'}
                  </span>
                  {user.subscription?.endDate && new Date(user.subscription.endDate).getFullYear() > 2050 && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                      Permanent
                    </span>
                  )}
                  {user.subscription?.plan === 'PREMIUM' && !user.subscription?.endDate && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                      Paid
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Plan</div>
                  <div className="text-sm font-semibold text-slate-900">{planLabel}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Access</div>
                  <div className="text-sm font-semibold text-slate-900">{accessLabel}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Member Since</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Next Renewal</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {nextRenewal || '—'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900">Credits & Usage</h2>
                    <span className="text-xs text-slate-500">Total available credits</span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-6">
                    <div className="text-3xl font-semibold text-emerald-600">
                      {user.totalAvailableCredits !== undefined
                        ? user.totalAvailableCredits
                        : (user.additionalCredits || 0)}
                    </div>
                    <div className="text-sm text-slate-500">credits</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-xs text-slate-500">Daily usage</div>
                      <div className="text-sm font-semibold text-slate-900">
                        {user.dailyAnalysisUsed || 0}/{user.dailyAnalysisCredits || 3}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-xs text-slate-500">Total analyses</div>
                      <div className="text-sm font-semibold text-slate-900">{user.totalAnalysisCount || 0}</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-xs text-slate-500">Last reset</div>
                      <div className="text-sm font-semibold text-slate-900">
                        {user.lastAnalysisResetDate
                          ? new Date(user.lastAnalysisResetDate).toLocaleDateString()
                          : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-xs text-slate-500 mb-3">Monthly feature usage</div>
                    <div className="grid gap-3 md:grid-cols-2 text-sm">
                      <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <span>Food analysis</span>
                        <span className="font-semibold">{user.dailyFoodAnalysisUsed || 0}</span>
                      </div>
                      <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <span>Food reanalysis</span>
                        <span className="font-semibold">{user.dailyFoodReanalysisUsed || 0}</span>
                      </div>
                      <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <span>Medical image</span>
                        <span className="font-semibold">{user.monthlyMedicalImageAnalysisUsed || 0}</span>
                      </div>
                      <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <span>Interaction analysis</span>
                        <span className="font-semibold">{user.dailyInteractionAnalysisUsed || 0}</span>
                      </div>
                      <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <span>Symptom analysis</span>
                        <span className="font-semibold">{user.monthlySymptomAnalysisUsed || 0}</span>
                      </div>
                      <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <span>Insights generation</span>
                        <span className="font-semibold">{user.monthlyInsightsGenerationUsed || 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        const credits = prompt('Enter number of credits to add:')
                        if (credits && !isNaN(parseInt(credits)) && parseInt(credits) > 0) {
                          handleUserAction('add_credits', { creditAmount: parseInt(credits) })
                        }
                      }}
                      className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600 transition-colors"
                    >
                      Add credits
                    </button>
                    <button
                      onClick={() => {
                        const credits = prompt('Enter number of credits to remove:')
                        if (credits && !isNaN(parseInt(credits)) && parseInt(credits) > 0) {
                          if (confirm(`Are you sure you want to remove ${credits} credits?`)) {
                            handleUserAction('remove_credits', { creditAmount: parseInt(credits) })
                          }
                        }
                      }}
                      className="bg-rose-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-rose-600 transition-colors"
                    >
                      Remove credits
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Reset daily quota for this user?')) {
                          handleUserAction('reset_daily_quota')
                        }
                      }}
                      className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-slate-800 transition-colors"
                    >
                      Reset daily quota
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Grant subscription access</h2>
                  <div className="grid gap-3 md:grid-cols-4">
                    <button
                      onClick={() => handleUserAction('grant_subscription', { tier: '10' })}
                      className="bg-emerald-100 text-emerald-700 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-emerald-200 transition-colors"
                    >
                      $10/month
                      <div className="text-xs font-normal">700 credits</div>
                    </button>
                    <button
                      onClick={() => handleUserAction('grant_subscription', { tier: '20' })}
                      className="bg-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-emerald-300 transition-colors"
                    >
                      $20/month
                      <div className="text-xs font-normal">1,400 credits</div>
                    </button>
                    <button
                      onClick={() => handleUserAction('grant_subscription', { tier: '30' })}
                      className="bg-emerald-300 text-emerald-900 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-emerald-400 transition-colors"
                    >
                      $30/month
                      <div className="text-xs font-normal">2,100 credits</div>
                    </button>
                    <button
                      onClick={() => handleUserAction('grant_subscription', { tier: '50' })}
                      className="bg-slate-900 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors"
                    >
                      $50/month
                      <div className="text-xs font-normal text-slate-200">3,500 credits</div>
                    </button>
                  </div>

                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Temporary access</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      <button
                        onClick={() => handleUserAction('grant_trial', { trialDays: 7 })}
                        className="bg-blue-100 text-blue-700 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-blue-200 transition-colors"
                      >
                        7-day premium
                        <div className="text-xs font-normal">250 credits</div>
                      </button>
                      <button
                        onClick={() => handleUserAction('grant_trial', { trialDays: 30 })}
                        className="bg-blue-100 text-blue-700 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-blue-200 transition-colors"
                      >
                        30-day premium
                        <div className="text-xs font-normal">1,400 credits</div>
                      </button>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Quick credit packages</h3>
                    <div className="grid gap-3 md:grid-cols-3">
                      <button
                        onClick={() => handleUserAction('add_credits', { creditPackage: '250' })}
                        className="bg-purple-100 text-purple-700 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-purple-200 transition-colors"
                      >
                        250 credits
                        <div className="text-xs font-normal">$5</div>
                      </button>
                      <button
                        onClick={() => handleUserAction('add_credits', { creditPackage: '500' })}
                        className="bg-purple-100 text-purple-700 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-purple-200 transition-colors"
                      >
                        500 credits
                        <div className="text-xs font-normal">$10</div>
                      </button>
                      <button
                        onClick={() => handleUserAction('add_credits', { creditPackage: '1000' })}
                        className="bg-purple-100 text-purple-700 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-purple-200 transition-colors"
                      >
                        1,000 credits
                        <div className="text-xs font-normal">$20</div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-3">Plan controls</h2>
                  <div className="space-y-3">
                    {user.subscription?.plan === 'PREMIUM' ? (
                      <button
                        onClick={() => handleUserAction('deactivate')}
                        className="w-full bg-amber-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-600 transition-colors"
                      >
                        Remove subscription
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUserAction('activate')}
                        className="w-full bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 transition-colors"
                      >
                        Upgrade to premium
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
                          handleUserAction('delete_user')
                        }
                      }}
                      className="w-full bg-rose-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-rose-700 transition-colors"
                    >
                      Delete user
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-3">Refunds</h2>
                  <p className="text-sm text-slate-600 mb-4">
                    Refund the most recent payment. Access and credits are removed automatically.
                  </p>
                  <button
                    onClick={() => {
                      const raw = prompt('Refund amount in dollars (leave blank for full refund):')
                      if (raw === null) return
                      const trimmed = raw.trim()
                      let amountCents: number | null = null
                      if (trimmed) {
                        const parsed = Number(trimmed)
                        if (!Number.isFinite(parsed) || parsed <= 0) {
                          alert('Please enter a valid amount.')
                          return
                        }
                        amountCents = Math.round(parsed * 100)
                      }
                      const amountLabel = amountCents ? `$${(amountCents / 100).toFixed(2)}` : 'the full amount'
                      if (confirm(`Refund ${amountLabel} from the most recent payment for ${user.email}?`)) {
                        handleUserAction('refund_latest_payment', { amountCents })
                      }
                    }}
                    className="w-full bg-amber-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-600 transition-colors"
                  >
                    Refund latest payment
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-3">Account security</h2>
                  <p className="text-sm text-slate-600 mb-4">
                    Log this user out everywhere if their device is lost or they can’t log out.
                  </p>
                  <button
                    onClick={() => {
                      if (confirm(`Log ${user.email} out of all devices now?`)) {
                        handleUserAction('revoke_sessions')
                      }
                    }}
                    className="w-full bg-slate-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-slate-800 transition-colors"
                  >
                    Log out everywhere
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
