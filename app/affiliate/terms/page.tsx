'use client'

import Link from 'next/link'

const TERMS_VERSION = '2025-12-22'

export default function AffiliateTermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affiliate Program Terms</h1>
          <p className="text-sm text-gray-600 mt-1">Version {TERMS_VERSION}</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm space-y-4 text-sm text-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Attribution</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Last-click attribution with a 30‑day window.</li>
              <li>Only the final affiliate click before purchase earns a commission.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900">Commissions</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>50% of net revenue (after Stripe fees).</li>
              <li>Subscription: first payment only (no recurring commissions).</li>
              <li>Top‑ups: one‑time commission per purchase.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900">Payouts</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Net‑30 payout timing (paid 30 days after transaction date).</li>
              <li>$50 USD minimum payout threshold; balances roll over.</li>
              <li>Payouts are processed via Stripe Connect.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900">Refunds & Disputes</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Refunds only where required under Australian Consumer Law.</li>
              <li>Refunded or disputed transactions within 30 days void commission.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900">Promotion Rules</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>No spam, misleading claims, or impersonation.</li>
              <li>No unauthorized coupon code sites or incentive traffic.</li>
              <li>Affiliates must comply with applicable laws and platform policies.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900">Privacy</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Affiliate reporting is anonymized; no customer PII is shared.</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/affiliate/apply" className="inline-flex items-center px-4 py-2 rounded-lg bg-helfi-green text-white">
            Back to Application
          </Link>
          <Link href="/affiliate" className="text-sm text-gray-600 hover:text-gray-900 underline">
            Affiliate Portal
          </Link>
        </div>
      </div>
    </div>
  )
}
