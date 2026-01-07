import Link from 'next/link'
import type { Metadata } from 'next'

import PublicHeader from '@/components/marketing/PublicHeader'
import { featurePages } from '@/data/feature-pages'

export const metadata: Metadata = {
  title: 'Features | Helfi',
  description: 'Explore the Helfi health platform and dive into each core feature.',
}

export default function FeaturesIndexPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-slate-50">
      <PublicHeader />

      <main className="px-6 pt-10 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-4">
              Features
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-5">
              Explore the Helfi platform
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed">
              Each feature page breaks down a core module with step-by-step segments and mobile mockups.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featurePages.map((page) => (
              <Link
                key={page.slug}
                href={`/features/${page.slug}`}
                className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm hover:border-helfi-green/40 hover:shadow-md transition-all"
              >
                <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">
                  Feature page
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-helfi-green transition-colors">
                  {page.title}
                </h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {page.summary}
                </p>
              </Link>
            ))}
          </div>

          <div className="mt-16 bg-white rounded-3xl border border-gray-100 shadow-sm p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Start building your weekly report
              </h3>
              <p className="text-gray-600">
                Create an account to begin tracking. The first week powers your first report.
              </p>
            </div>
            <Link
              href="/auth/signin?mode=signup"
              className="px-6 py-3 rounded-full bg-helfi-green text-white font-semibold hover:bg-helfi-green/90 transition-colors"
            >
              Create account
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
