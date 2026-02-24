import Link from 'next/link'
import type { Metadata } from 'next'

import PublicHeader from '@/components/marketing/PublicHeader'
import PublicFooter from '@/components/marketing/PublicFooter'
import { absoluteUrl } from '@/lib/site-url'
import { featurePages } from '@/data/feature-pages'

export const metadata: Metadata = {
  title: 'Helfi Features | Food Tracking, AI Insights, and Health Tracking',
  description:
    'Explore Helfi features for food calorie tracking, calorie tracker app workflows, AI food tracker tools, and AI health report reviews.',
  keywords: [
    'health tracking app features',
    'food tracking features',
    'AI health insights',
    'food calorie tracking app',
    'calorie tracker app',
    'AI calorie tracker app',
    'AI food tracker app',
    'AI food calorie tracker app',
    'AI health report app',
    'hydration tracking app',
    'Helfi features',
  ],
  alternates: {
    canonical: absoluteUrl('/features'),
  },
  openGraph: {
    title: 'Helfi Features | Food Tracking, AI Insights, and Health Tracking',
    description:
      'Explore Helfi features for food calorie tracking, calorie tracker app workflows, AI food tracker tools, and AI health report reviews.',
    url: absoluteUrl('/features'),
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Helfi Features | Food Tracking, AI Insights, and Health Tracking',
    description:
      'Explore Helfi features for food calorie tracking, calorie tracker app workflows, AI food tracker tools, and AI health report reviews.',
  },
}

export default function FeaturesIndexPage() {
  const featuresSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Helfi Features',
        url: absoluteUrl('/features'),
        description:
          'Explore Helfi features for food calorie tracking, calorie tracker app workflows, AI food tracker tools, and AI health report reviews.',
      },
      {
        '@type': 'ItemList',
        itemListElement: featurePages.map((page, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: page.title,
          url: absoluteUrl(`/features/${page.slug}`),
        })),
      },
    ],
  }

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

          <div className="mt-12 rounded-3xl border border-gray-100 bg-white p-8 md:p-10 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">Also in news</p>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Guides to help you get more value from each feature</h2>
            <p className="text-gray-600 mb-6">
              These short reads explain how to use food tracking, weekly insights, and daily routine planning in real life.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <Link href="/news/complete-food-tracking-workflow" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                A better food tracking workflow for everyday life →
              </Link>
              <Link href="/news/weekly-health-insights-you-can-use" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                Weekly health insights you can actually use →
              </Link>
              <Link href="/news/meal-water-sleep-consistency" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                Meals, water, and sleep: build better weeks →
              </Link>
            </div>
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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(featuresSchema),
        }}
      />
      <PublicFooter />
    </div>
  )
}
