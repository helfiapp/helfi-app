import type { Metadata } from 'next'
import Link from 'next/link'

import PublicHeader from '@/components/marketing/PublicHeader'

export const metadata: Metadata = {
  title: 'Helfi News',
  description: 'Latest Helfi updates, feature releases, and platform improvements.',
}

const updates = [
  {
    title: 'Food Tracking Improvements',
    description:
      'New food section upgrades, section deep links, and improved feature walkthroughs.',
    href: '/features/nutrition-food',
    date: 'Latest update',
  },
  {
    title: 'AI Insights and Weekly Reports',
    description:
      'Clearer weekly summaries and easier pathways to turn insights into action.',
    href: '/features/ai-insights',
    date: 'Latest update',
  },
  {
    title: 'Health Tracking and Wearables',
    description:
      'Better visibility of daily health data and wearable-connected progress views.',
    href: '/features/health-tracking',
    date: 'Latest update',
  },
]

export default function NewsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/50 via-white to-cyan-50/30">
      <PublicHeader />

      <main className="px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">Latest News</p>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Helfi News</h1>
          <p className="text-lg text-gray-600 max-w-3xl">
            Stay up to date with the latest Helfi feature releases, improvements, and product updates.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {updates.map((item) => (
              <article key={item.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <p className="text-xs text-helfi-green font-semibold mb-3">{item.date}</p>
                <h2 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h2>
                <p className="text-sm text-gray-600 leading-relaxed mb-5">{item.description}</p>
                <Link
                  href={item.href}
                  className="inline-flex items-center text-sm font-semibold text-helfi-green hover:text-helfi-green/80"
                >
                  Read update →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
