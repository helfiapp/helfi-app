'use client'

import Link from 'next/link'
import PublicHeader from '@/components/marketing/PublicHeader'

const TERMS_VERSION = '2025-12-22'

export default function AffiliateTermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/40 to-white">
      <PublicHeader />
      <main className="px-6 pb-20">
        <div className="max-w-6xl mx-auto">
          <section className="pt-8 pb-10">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Affiliate program</p>
                <h1 className="text-4xl md:text-5xl font-bold text-helfi-black mt-3">Affiliate Program Terms</h1>
                <p className="text-lg text-gray-600 mt-4 max-w-2xl">
                  Clear, simple terms for how the Helfi affiliate program works, how commissions are earned,
                  and how payouts are handled.
                </p>
              </div>
              <div className="bg-white/80 border border-emerald-100 rounded-2xl px-6 py-4 shadow-sm">
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Version</div>
                <div className="text-lg font-semibold text-gray-900 mt-1">{TERMS_VERSION}</div>
              </div>
            </div>
          </section>

          <section className="grid lg:grid-cols-[1.2fr_0.8fr] gap-8 items-start">
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">How the program works</h2>
                <p className="text-gray-600 leading-relaxed">
                  To join, create a Helfi account, submit the affiliate application, and accept these terms.
                  Applications are screened automatically; some may require manual review. If approved, your
                  affiliate link and dashboard appear in the affiliate portal.
                </p>
                <ol className="mt-4 space-y-2 text-sm text-gray-600 list-decimal pl-5">
                  <li>Create an account and submit your application.</li>
                  <li>Get approved and receive your unique tracking link.</li>
                  <li>Share your link and track results in the affiliate portal.</li>
                </ol>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Attribution & commissions</h2>
                <ul className="space-y-2 text-sm text-gray-600 list-disc pl-5">
                  <li>Attribution is last-click with a 30-day window.</li>
                  <li>Only the final affiliate click before purchase earns a commission.</li>
                  <li>Clicks without a successful purchase earn no commission.</li>
                  <li>Commissions are 50% of net revenue (after Stripe fees).</li>
                  <li>Subscriptions pay on the first payment only (no recurring commissions).</li>
                  <li>Top-ups pay a one-time commission per purchase.</li>
                </ul>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Payouts & timing</h2>
                <ul className="space-y-2 text-sm text-gray-600 list-disc pl-5">
                  <li>Commissions become payable 30 days after the transaction date (Net-30).</li>
                  <li>Payouts run monthly once commissions clear.</li>
                  <li>The minimum payout threshold is $50 USD; balances roll over.</li>
                  <li>Payouts are processed through Stripe Connect.</li>
                </ul>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Refunds & disputes</h2>
                <ul className="space-y-2 text-sm text-gray-600 list-disc pl-5">
                  <li>Refunds are only issued where required under Australian Consumer Law.</li>
                  <li>Refunded or disputed transactions within 30 days void the commission.</li>
                </ul>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Promotion rules</h2>
                <ul className="space-y-2 text-sm text-gray-600 list-disc pl-5">
                  <li>No spam, misleading claims, or impersonation.</li>
                  <li>No unauthorized coupon code sites or incentive traffic.</li>
                  <li>Affiliates must comply with applicable laws and platform policies.</li>
                </ul>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Privacy & reporting</h2>
                <ul className="space-y-2 text-sm text-gray-600 list-disc pl-5">
                  <li>Affiliate reporting is anonymized; no customer PII is shared.</li>
                  <li>Reports show totals and trends, not individual customer details.</li>
                </ul>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Quick facts</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li><span className="font-semibold text-gray-900">Commission:</span> 50% net revenue</li>
                  <li><span className="font-semibold text-gray-900">Attribution:</span> 30-day last-click</li>
                  <li><span className="font-semibold text-gray-900">Payout timing:</span> Net-30, monthly runs</li>
                  <li><span className="font-semibold text-gray-900">Minimum payout:</span> $50 USD</li>
                  <li><span className="font-semibold text-gray-900">Tracking link:</span> /r/{'{affiliateCode}'}</li>
                  <li><span className="font-semibold text-gray-900">Reporting:</span> Anonymized only</li>
                </ul>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to apply?</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Start your application or visit the affiliate portal if you are already approved.
                </p>
                <div className="flex flex-col gap-3">
                  <Link
                    href="/affiliate/apply"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-helfi-green text-white font-semibold"
                  >
                    Back to Application
                  </Link>
                  <Link href="/affiliate" className="text-sm text-gray-600 hover:text-gray-900 underline text-center">
                    Affiliate Portal
                  </Link>
                </div>
              </div>

              <div className="bg-white/70 rounded-2xl p-6 border border-emerald-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Need help?</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Visit our help center for support with your application or affiliate dashboard.
                </p>
                <Link
                  href="/help"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-emerald-200 text-gray-700 font-semibold hover:border-helfi-green/60 hover:text-helfi-green transition-colors"
                >
                  Go to Help
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
