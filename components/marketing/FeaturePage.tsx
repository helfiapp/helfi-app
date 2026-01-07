import Image from 'next/image'
import Link from 'next/link'

import type { FeaturePageContent, FeaturePageSegment } from '@/data/feature-pages'
import PublicHeader from '@/components/marketing/PublicHeader'

type FeaturePageProps = {
  page: FeaturePageContent
  related?: Array<{ label: string; href: string }>
}

function PhoneFrame({
  image,
  priority = false,
  size = 'section',
}: {
  image: FeaturePageSegment['image']
  priority?: boolean
  size?: 'hero' | 'section'
}) {
  const sizeClass =
    size === 'hero'
      ? 'max-w-[260px] sm:max-w-[300px] lg:max-w-[340px]'
      : 'max-w-[220px] sm:max-w-[260px] lg:max-w-[300px]'

  return (
    <div className={`relative w-full ${sizeClass} mx-auto`}>
      <div className="relative aspect-[9/19] rounded-[2.6rem] border border-gray-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
        <div className="absolute inset-2 rounded-[2.1rem] overflow-hidden bg-white">
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes="(max-width: 768px) 70vw, 320px"
            className="object-cover"
            priority={priority}
          />
        </div>
      </div>
    </div>
  )
}

export default function FeaturePage({ page, related }: FeaturePageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-slate-50">
      <PublicHeader />

      <main>
        <section className="px-6 pt-10 pb-16">
          <div className="max-w-6xl mx-auto grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <div>
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
              <div className="space-y-4 text-base text-gray-600 leading-relaxed mb-8">
                {page.overview.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
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
            <PhoneFrame image={page.heroImage} priority size="hero" />
          </div>
        </section>

        <section className="px-6 pb-20">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2">
                  Key capabilities
                </p>
                <h2 className="text-3xl font-bold text-gray-900">
                  Built for deeper health context
                </h2>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
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

        <section className="px-6 pb-20">
          <div className="max-w-6xl mx-auto space-y-16">
            {page.segments.map((segment, index) => {
              const isReversed = index % 2 === 1
              return (
                <div
                  key={segment.title}
                  className={`grid gap-10 lg:grid-cols-[1fr_1fr] items-center ${
                    isReversed ? 'lg:grid-flow-col-dense' : ''
                  }`}
                >
                  <div className={isReversed ? 'lg:col-start-2' : ''}>
                    <p className="text-xs uppercase tracking-[0.2em] text-helfi-green mb-3">
                      Step {String(index + 1).padStart(2, '0')}
                    </p>
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">
                      {segment.title}
                    </h2>
                    <p className="text-base text-gray-600 leading-relaxed mb-5">
                      {segment.description}
                    </p>
                    {segment.details && segment.details.length > 0 && (
                      <div className="space-y-4 text-sm text-gray-600 leading-relaxed mb-6">
                        {segment.details.map((detail) => (
                          <p key={detail}>{detail}</p>
                        ))}
                      </div>
                    )}
                    <ul className="space-y-3 text-sm text-gray-700">
                      {segment.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-3">
                          <span className="mt-1 h-2 w-2 rounded-full bg-helfi-green" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={isReversed ? 'lg:col-start-1' : ''}>
                    <PhoneFrame image={segment.image} size="section" />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="px-6 pb-20">
          <div className="max-w-6xl mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm p-10 md:p-12">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">
              Outcomes
            </p>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              What this feature unlocks
            </h3>
            <ul className="grid gap-4 md:grid-cols-2 text-sm text-gray-700 leading-relaxed">
              {page.outcomes.map((outcome) => (
                <li key={outcome} className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-helfi-green" />
                  <span>{outcome}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-6 pb-20">
          <div className="max-w-6xl mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm p-10 md:p-12 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Ready to see it in action?
              </h3>
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
          <section className="px-6 pb-20">
            <div className="max-w-6xl mx-auto">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">
                Explore more features
              </h3>
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
