'use client'

import Link from 'next/link'
import PublicHeader from '@/components/marketing/PublicHeader'

export default function ListYourPracticePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/40 to-white">
      <PublicHeader />
      <main className="px-6 pb-20">
        <div className="max-w-6xl mx-auto">
          <section className="pt-10 pb-12">
            <div className="bg-white/80 border border-emerald-100 rounded-3xl p-8 md:p-12 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Practitioner directory</p>
              <h1 className="text-4xl md:text-5xl font-bold text-helfi-black mt-4">
                List your practice on Helfi
              </h1>
              <p className="text-lg text-gray-600 mt-4 max-w-3xl">
                Reach people searching for trusted care. You get{' '}
                <span className="font-semibold text-gray-900">2 months free</span>, then it is{' '}
                <span className="font-semibold text-gray-900">$4.95/month</span> (USD). No card is needed to start.
                Your free period begins only after your listing is approved.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Link
                  href="/list-your-practice/start"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-helfi-green text-white font-semibold text-base hover:bg-helfi-green/90 transition-colors"
                >
                  Start your listing
                </Link>
                <Link
                  href="/practitioners"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-full border-2 border-emerald-200 text-emerald-800 font-semibold text-base hover:border-emerald-300 hover:text-emerald-900 transition-colors"
                >
                  Find a practitioner
                </Link>
              </div>
              <div className="mt-4 text-sm text-gray-600">
                Already have a practitioner account?{' '}
                <Link href="/auth/signin?context=practitioner&next=/practitioner" className="text-emerald-700 font-semibold hover:underline">
                  Sign in here
                </Link>
                .
              </div>
            </div>
          </section>

          <section className="grid lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">What you get</h2>
              <ul className="space-y-2 text-sm text-gray-600 list-disc pl-5">
                <li>A public profile that shows in search and on the map.</li>
                <li>Category and location filters so patients can find you quickly.</li>
                <li>Worldwide reach with fair placement by country.</li>
                <li>Optional boost upgrades for higher visibility.</li>
                <li>Listing stays hidden (not deleted) if payment lapses.</li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Safety review</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                Every listing is reviewed for safety and fraud. If it looks good, it goes live and you are emailed
                right away. If it needs a closer look, the listing stays hidden until a staff member reviews it.
                We will email you to explain that it is under review, and we will email you again once approved.
              </p>
            </div>
          </section>

          <section className="mt-10 grid lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">How it works</h2>
              <ol className="space-y-2 text-sm text-gray-600 list-decimal pl-5">
                <li>Create your listing and submit it.</li>
                <li>Our system runs an automated review process.</li>
                <li>If approved, your listing goes live and your free 2 months start.</li>
                <li>If flagged, your listing stays hidden until staff approves it.</li>
                <li>Manage your listing, subscription, and boosts in your dashboard.</li>
              </ol>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Pricing (USD)</h2>
              <div className="text-sm text-gray-600 space-y-3">
                <div>
                  <div className="font-semibold text-gray-900">Listing subscription</div>
                  <div>
                    <span className="font-semibold text-gray-900">2 months free</span> (starts after approval), then{' '}
                    <span className="font-semibold text-gray-900">$4.95/month</span> per listing.
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Boosts (7 days)</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="border border-emerald-100 rounded-lg px-3 py-2">5 km - $5</div>
                    <div className="border border-emerald-100 rounded-lg px-3 py-2">10 km - $10</div>
                    <div className="border border-emerald-100 rounded-lg px-3 py-2">25 km - $15</div>
                    <div className="border border-emerald-100 rounded-lg px-3 py-2">50 km - $20</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Boosts are optional and only available while your listing subscription is active.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-10 grid lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Radius and visibility</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                You choose how far you want to appear from your location: 5 km, 10 km, 25 km, or 50 km.
                The default is 10 km. This keeps results fair and local, even for online-only listings.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Boost fairness</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                Boosted listings rotate fairly within the same category and country. This means no one is
                permanently at the top, and visibility stays balanced.
              </p>
            </div>
          </section>

          <section className="mt-12">
            <div className="bg-emerald-50/70 border border-emerald-100 rounded-3xl p-8 md:p-12 text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Ready to list your practice?</h2>
              <p className="text-gray-600 mt-3 text-lg">
                Start your listing now. It takes a few minutes, and approval is usually quick.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/list-your-practice/start"
                  className="px-8 py-4 rounded-full bg-helfi-green text-white font-semibold text-lg hover:bg-helfi-green/90 transition-colors"
                >
                  Start your listing
                </Link>
                <Link
                  href="/practitioners"
                  className="px-8 py-4 rounded-full border-2 border-emerald-200 text-emerald-800 font-semibold text-lg hover:border-emerald-300 hover:text-emerald-900 transition-colors"
                >
                  See practitioners
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
