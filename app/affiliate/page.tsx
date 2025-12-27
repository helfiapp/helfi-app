'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

type AffiliateMeResponse =
  | { ok: true; affiliate: null }
  | {
      ok: true
      affiliate: {
        id: string
        code: string
        status: 'ACTIVE' | 'SUSPENDED'
        stripeConnectAccountId: string | null
        stripeConnectDetailsSubmitted: boolean
        stripeConnectChargesEnabled: boolean
        stripeConnectPayoutsEnabled: boolean
        stripeConnectOnboardedAt: string | null
        createdAt: string
      }
      referralLink: string
      stats: {
        clicks: number
        uniqueVisitors: number
        conversionsByType: Record<string, number>
        commissionTotalsByStatus: Record<string, number>
        payableNowCents: number
      }
      events: Array<{
        occurredAt: string
        type: string
        currency: string
        amountGrossCents: number
        stripeFeeCents: number
        amountNetCents: number
        commission: null | { status: string; commissionCents: number; payableAt: string; paidAt: string | null }
      }>
    }

function formatMoney(cents: number, currency: string) {
  const amount = cents / 100
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency.toUpperCase() }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`
  }
}

export default function AffiliateDashboardPage() {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AffiliateMeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connectLoading, setConnectLoading] = useState(false)

  const fullReferralUrl = useMemo(() => {
    if (!data || !('referralLink' in data)) return ''
    if (typeof window === 'undefined') return data.referralLink
    return `${window.location.origin}${data.referralLink}`
  }, [data])

  useEffect(() => {
    if (!session?.user) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/affiliate/me', { cache: 'no-store' })
        const json = (await res.json().catch(() => ({}))) as AffiliateMeResponse
        if (!res.ok) throw new Error((json as any)?.error || 'Failed to load affiliate data')
        setData(json)
      } catch (e: any) {
        setError(e?.message || 'Failed to load affiliate data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [session])

  const startConnectOnboarding = async () => {
    try {
      setConnectLoading(true)
      const res = await fetch('/api/affiliate/connect/onboard', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to start Stripe Connect onboarding')
      if (json?.url) window.location.href = json.url
    } catch (e: any) {
      alert(e?.message || 'Failed to start Stripe Connect onboarding')
    } finally {
      setConnectLoading(false)
    }
  }

  const copyLink = async () => {
    if (!fullReferralUrl) return
    try {
      await navigator.clipboard.writeText(fullReferralUrl)
      alert('Copied referral link')
    } catch {
      alert('Could not copy link')
    }
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Affiliate</h1>
          <p className="text-gray-600 mt-2">
            Please <Link className="text-helfi-green underline" href="/auth/signin">sign in</Link> to access your affiliate portal.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Affiliate Portal</h1>
            <p className="text-gray-600 mt-1">Track clicks, sales, and commissions (Net-30).</p>
          </div>
          <Link href="/billing" className="text-sm text-gray-600 hover:text-gray-900 underline">
            Billing
          </Link>
        </div>

        {loading && <div className="bg-white rounded-xl p-6 shadow-sm">Loading…</div>}
        {error && <div className="bg-white rounded-xl p-6 shadow-sm text-red-600">{error}</div>}

        {!loading && !error && data && 'affiliate' in data && data.affiliate === null && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Not enrolled</h2>
            <p className="text-gray-600 mt-2">Apply to join the Helfi affiliate program.</p>
            <div className="mt-4">
              <Link href="/affiliate/apply" className="inline-flex items-center px-4 py-2 rounded-lg bg-helfi-green text-white">
                Apply Now
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && data && 'affiliate' in data && data.affiliate && (
          <>
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="text-sm text-gray-500">Your referral link</div>
                  <div className="mt-1 font-mono text-sm break-all">{fullReferralUrl}</div>
                  <div className="mt-2 text-xs text-gray-500">Last-click attribution, 30-day window.</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={copyLink} className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50">
                    Copy
                  </button>
                  <a href={fullReferralUrl} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm" target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-xs text-gray-500">Clicks</div>
                <div className="text-2xl font-semibold">{data.stats.clicks}</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-xs text-gray-500">Unique Visitors</div>
                <div className="text-2xl font-semibold">{data.stats.uniqueVisitors}</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-xs text-gray-500">Sales</div>
                <div className="text-2xl font-semibold">
                  {(data.stats.conversionsByType?.SUBSCRIPTION_INITIAL || 0) + (data.stats.conversionsByType?.TOPUP || 0)}
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-xs text-gray-500">Payable Now</div>
                <div className="text-2xl font-semibold">{formatMoney(data.stats.payableNowCents, 'aud')}</div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Payout Setup (Stripe Connect)</h2>
              <p className="text-gray-600 mt-2">
                Payouts are processed monthly on a Net-30 basis once your payable balance reaches $50 USD.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className="text-sm text-gray-700">
                  Status:{' '}
                  {data.affiliate.stripeConnectPayoutsEnabled ? (
                    <span className="text-helfi-green font-semibold">Ready</span>
                  ) : (
                    <span className="text-amber-600 font-semibold">Action required</span>
                  )}
                </div>
                <button
                  onClick={startConnectOnboarding}
                  disabled={connectLoading}
                  className="px-4 py-2 rounded-lg bg-helfi-green text-white disabled:opacity-50"
                >
                  {connectLoading ? 'Opening…' : 'Set Up Payouts'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Net</th>
                      <th className="py-2 pr-4">Commission</th>
                      <th className="py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.length === 0 && (
                      <tr>
                        <td className="py-3 text-gray-500" colSpan={5}>
                          No conversions yet.
                        </td>
                      </tr>
                    )}
                    {data.events.map((e, idx) => (
                      <tr key={`${e.occurredAt}-${idx}`} className="border-t">
                        <td className="py-2 pr-4 whitespace-nowrap">{new Date(e.occurredAt).toLocaleString()}</td>
                        <td className="py-2 pr-4">{e.type === 'TOPUP' ? 'Top-up' : 'Subscription (first month)'}</td>
                        <td className="py-2 pr-4">{formatMoney(e.amountNetCents, e.currency)}</td>
                        <td className="py-2 pr-4">
                          {e.commission ? formatMoney(e.commission.commissionCents, e.currency) : '—'}
                        </td>
                        <td className="py-2 pr-4">{e.commission?.status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
