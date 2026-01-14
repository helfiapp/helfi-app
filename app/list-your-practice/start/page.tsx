'use client'

import Link from 'next/link'
import PublicHeader from '@/components/marketing/PublicHeader'

export default function ListYourPracticeStartPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/40 to-white">
      <PublicHeader />
      <main className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <section className="pt-10 pb-8">
            <div className="bg-white/90 border border-emerald-100 rounded-3xl p-8 md:p-12 shadow-sm text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">List your practice</p>
              <h1 className="text-4xl md:text-5xl font-bold text-helfi-black mt-4">
                Start your practitioner listing
              </h1>
              <p className="text-lg text-gray-600 mt-4 max-w-2xl mx-auto">
                Create an account to manage your listing, subscriptions, and boosts. If you already have an
                account, just sign in.
              </p>
            </div>
          </section>

          <section className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">New to Helfi?</h2>
              <p className="text-sm text-gray-600 mb-5">
                Create your practitioner account and start your listing.
              </p>
              <Link
                href="/auth/signin?context=practitioner&mode=signup&next=/practitioner"
                className="inline-flex items-center justify-center w-full px-5 py-3 rounded-full bg-helfi-green text-white font-semibold hover:bg-helfi-green/90 transition-colors"
              >
                Create practitioner account
              </Link>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Already have an account?</h2>
              <p className="text-sm text-gray-600 mb-5">
                Sign in to manage your listing and boosts.
              </p>
              <Link
                href="/auth/signin?context=practitioner&next=/practitioner"
                className="inline-flex items-center justify-center w-full px-5 py-3 rounded-full border-2 border-emerald-200 text-emerald-800 font-semibold hover:border-emerald-300 hover:text-emerald-900 transition-colors"
              >
                Sign in
              </Link>
            </div>
          </section>

          <section className="mt-8">
            <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-6 text-center">
              <p className="text-sm text-gray-600">
                Not ready yet?{' '}
                <Link href="/list-your-practice" className="text-helfi-green font-semibold hover:underline">
                  See what we offer
                </Link>
                .
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
