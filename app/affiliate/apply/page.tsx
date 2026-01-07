'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

export default function AffiliateApplyPage() {
  const termsVersion = '2025-12-22'
  const { data: session, status } = useSession()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [primaryChannel, setPrimaryChannel] = useState('')
  const [primaryChannelOther, setPrimaryChannelOther] = useState('')
  const [audienceSize, setAudienceSize] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [promotionMethod, setPromotionMethod] = useState('')
  const [notes, setNotes] = useState('')

  const loadStatus = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/affiliate/application', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to load application status')
      setStatus(json)
    } catch (e: any) {
      setError(e?.message || 'Failed to load application status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!session?.user) return
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/affiliate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          website,
          primaryChannel,
          primaryChannelOther,
          audienceSize,
          termsAccepted,
          termsVersion,
          promotionMethod,
          notes,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Application failed')
      await loadStatus()
    } catch (e: any) {
      setError(e?.message || 'Application failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Affiliate Application</h1>
          <p className="text-gray-600 mt-2">Loading your account…</p>
        </div>
      </div>
    )
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Affiliate Application</h1>
          <p className="text-gray-600 mt-2">
            Create an account to start your application or sign in if you already have one.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              replace
              className="px-5 py-2.5 rounded-full bg-helfi-green text-white font-semibold hover:bg-helfi-green/90 transition-colors"
              href="/auth/signin?mode=signup"
            >
              Create account
            </Link>
            <Link
              replace
              className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 font-semibold hover:border-helfi-green/60 hover:text-helfi-green transition-colors"
              href="/auth/signin"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const alreadyAffiliate = !!status?.affiliate

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Affiliate Application</h1>
            <p className="text-gray-600 mt-1">Applications are screened automatically; some require manual review.</p>
          </div>
          <Link href="/affiliate" className="text-sm text-gray-600 hover:text-gray-900 underline">
            Back to portal
          </Link>
        </div>

        {loading && <div className="bg-white rounded-xl p-6 shadow-sm">Loading…</div>}
        {error && <div className="bg-white rounded-xl p-6 shadow-sm text-red-600">{error}</div>}

        {!loading && !error && alreadyAffiliate && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">You’re approved</h2>
            <p className="text-gray-600 mt-2">Your affiliate link is ready.</p>
            <div className="mt-4">
              <Link href="/affiliate" className="inline-flex items-center px-4 py-2 rounded-lg bg-helfi-green text-white">
                Go to Dashboard
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && !alreadyAffiliate && status?.application && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Application Status</h2>
            <div className="mt-2 text-sm text-gray-700">
              <div>Status: <span className="font-semibold">{status.application.status}</span></div>
              <div>Risk: <span className="font-semibold">{status.application.riskLevel || '—'}</span></div>
              <div>Recommendation: <span className="font-semibold">{status.application.recommendation || '—'}</span></div>
            </div>
            <p className="text-gray-600 mt-3">{status.application.aiReasoning || 'We’ll review your application and get back to you.'}</p>
          </div>
        )}

        {!loading && !error && !alreadyAffiliate && !status?.application && (
          <form onSubmit={submit} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Website (optional)</label>
              <input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2"
                placeholder="https://…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Primary promotion channel</label>
              <select
                value={primaryChannel}
                onChange={e => {
                  const next = e.target.value
                  setPrimaryChannel(next)
                  if (next !== 'OTHER') setPrimaryChannelOther('')
                }}
                className="mt-1 w-full border rounded-lg px-3 py-2 bg-white"
                required
              >
                <option value="" disabled>Select a channel</option>
                <option value="WEBSITE">Website / Blog</option>
                <option value="YOUTUBE">YouTube</option>
                <option value="SOCIAL">Instagram / TikTok / Social</option>
                <option value="NEWSLETTER">Email Newsletter</option>
                <option value="PODCAST">Podcast</option>
                <option value="COMMUNITY">Community / Forum</option>
                <option value="PAID_ADS">Paid Ads</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            {primaryChannel === 'OTHER' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Please specify</label>
                <input
                  value={primaryChannelOther}
                  onChange={e => setPrimaryChannelOther(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  placeholder="Tell us the channel"
                  required
                  minLength={2}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">Audience size (optional)</label>
              <select
                value={audienceSize}
                onChange={e => setAudienceSize(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 bg-white"
              >
                <option value="">Select range</option>
                <option value="UNDER_1K">Under 1k</option>
                <option value="1K_10K">1k–10k</option>
                <option value="10K_50K">10k–50k</option>
                <option value="50K_250K">50k–250k</option>
                <option value="250K_PLUS">250k+</option>
                <option value="UNKNOWN">Prefer not to say</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">How will you promote Helfi?</label>
              <textarea
                value={promotionMethod}
                onChange={e => setPromotionMethod(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2"
                rows={5}
                placeholder="Be specific (content plan, audience fit, examples, etc.)"
                required
                minLength={10}
              />
            </div>
            <label className="flex items-start gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                required
              />
              <span>
                I agree to the{' '}
                <Link href="/affiliate/terms" className="text-helfi-green underline">
                  Affiliate Program Terms
                </Link>
                .
              </span>
            </label>
            <div>
              <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2" rows={3} />
            </div>
            <button
              disabled={submitting}
              className="w-full px-4 py-2 rounded-lg bg-helfi-green text-white disabled:opacity-50"
              type="submit"
            >
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
