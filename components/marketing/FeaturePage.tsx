import Link from 'next/link'

import type { FeaturePageContent } from '@/data/feature-pages'
import PublicHeader from '@/components/marketing/PublicHeader'

type FeaturePageProps = {
  page: FeaturePageContent
  related?: Array<{ label: string; href: string }>
}

export default function FeaturePage({ page, related }: FeaturePageProps) {
  const sectionLinks = [
    { id: 'overview', label: 'Overview' },
    { id: 'capabilities', label: 'Capabilities' },
    { id: 'walkthrough', label: 'How it works' },
    { id: 'use-cases', label: 'Use cases' },
    { id: 'outcomes', label: 'Outcomes' },
  ]

  const highlights = page.outcomes.slice(0, 3)

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-slate-50">
      <PublicHeader />

      <main>
        <section id="overview" className="px-6 pt-10 pb-12">
          <div className="max-w-6xl mx-auto grid gap-10 lg:grid-cols-[1.2fr_0.8fr] items-start">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-4">
                Feature overview
              </p>
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight mb-5">
                {page.title}
              </h1>
              <p className="text-xl text-gray-700 mb-5">
                {page.subtitle}
              </p>
              <p className="text-base text-gray-600 leading-relaxed mb-5">
                {page.intro}
              </p>
              <div className="space-y-4 text-base text-gray-600 leading-relaxed">
                {page.overview.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 mt-8">
                <Link
                  href={page.primaryCta.href}
                  className="px-6 py-3 rounded-full bg-helfi-green text-white font-semibold hover:bg-helfi-green/90 transition-colors"
                >
                  {page.primaryCta.label}
                </Link>
                <Link
                  href={page.secondaryCta.href}
                  className="px-6 py-3 rounded-full border border-gray-200 text-gray-700 font-semibold hover:border-helfi-green/60 hover:text-helfi-green transition-colors"
                >
                  {page.secondaryCta.label}
                </Link>
              </div>
            </div>

            <aside className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">
                At a glance
              </p>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                What you get from this feature
              </h2>
              <ul className="space-y-2 text-sm text-gray-700">
                {highlights.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-helfi-green" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-gray-100 mt-6 pt-6">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">
                  Best for
                </p>
                <div className="space-y-3 text-sm text-gray-600">
                  {page.useCases.slice(0, 2).map((useCase) => (
                    <p key={useCase.title}>
                      <span className="font-semibold text-gray-900">{useCase.title}:</span> {useCase.description}
                    </p>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <div className="border-y border-gray-200 bg-white/80">
          <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center gap-4 text-sm">
            <span className="text-gray-500 font-medium">On this page</span>
            {sectionLinks.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className="text-gray-700 hover:text-helfi-green transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <section id="capabilities" className="px-6 py-16">
          <div className="max-w-6xl mx-auto">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">
              Key capabilities
            </p>
            <h2 className="text-3xl font-bold text-gray-900 mb-8">
              Built for deeper health context
            </h2>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {page.capabilities.map((capability) => (
                <div
                  key={capability.title}
                  className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm"
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {capability.title}
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {capability.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="walkthrough" className="px-6 pb-16">
          <div className="max-w-6xl mx-auto">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">
              How it works
            </p>
            <h2 className="text-3xl font-bold text-gray-900 mb-8">
              A detailed walkthrough
            </h2>
            <div className="space-y-8">
              {page.segments.map((segment, index) => (
                <div
                  key={segment.title}
                  className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-helfi-green mb-3">
                    Step {String(index + 1).padStart(2, '0')}
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">
                    {segment.title}
                  </h3>
                  <p className="text-base text-gray-600 leading-relaxed mb-4">
                    {segment.description}
                  </p>
                  {segment.details && segment.details.length > 0 && (
                    <div className="space-y-4 text-sm text-gray-600 leading-relaxed mb-5">
                      {segment.details.map((detail) => (
                        <p key={detail}>{detail}</p>
                      ))}
                    </div>
                  )}
                  <ul className="grid gap-y-2 text-sm text-gray-700">
                    {segment.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3">
                        <span className="mt-1 h-2 w-2 rounded-full bg-helfi-green" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="use-cases" className="px-6 pb-16">
          <div className="max-w-6xl mx-auto">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">
              Use cases
            </p>
            <h2 className="text-3xl font-bold text-gray-900 mb-8">
              Who this is for
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {page.useCases.map((useCase) => (
                <div key={useCase.title} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {useCase.title}
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {useCase.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="outcomes" className="px-6 pb-16">
          <div className="max-w-6xl mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm p-10 md:p-12">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">
              Outcomes
            </p>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              What this feature unlocks
            </h2>
            <ul className="grid gap-y-2 text-sm text-gray-700 leading-relaxed">
              {page.outcomes.map((outcome) => (
                <li key={outcome} className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-helfi-green" />
                  <span>{outcome}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-6 pb-16">
          <div className="max-w-6xl mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm p-10 md:p-12 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-3">
                Ready to see it in action?
              </h2>
              <p className="text-gray-600">
                Create an account and start tracking today. Your first week powers the weekly report.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={page.primaryCta.href}
                className="px-6 py-3 rounded-full bg-helfi-green text-white font-semibold hover:bg-helfi-green/90 transition-colors"
              >
                {page.primaryCta.label}
              </Link>
              <Link
                href={page.secondaryCta.href}
                className="px-6 py-3 rounded-full border border-gray-200 text-gray-700 font-semibold hover:border-helfi-green/60 hover:text-helfi-green transition-colors"
              >
                {page.secondaryCta.label}
              </Link>
            </div>
          </div>
        </section>

        {related && related.length > 0 && (
          <section className="px-6 pb-16">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">
                Explore more features
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {related.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:border-helfi-green/40 hover:shadow-md transition-all"
                  >
                    <div className="text-sm text-gray-500 mb-2">
                      Feature
                    </div>
                    <div className="text-lg font-semibold text-gray-900 group-hover:text-helfi-green transition-colors">
                      {item.label}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="px-6 pb-10">
        <div className="max-w-6xl mx-auto text-sm text-gray-500 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p>
            Helfi is not a medical device and does not provide medical advice.
          </p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-gray-700">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-700">Terms</Link>
            <Link href="/help" className="hover:text-gray-700">Help</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
