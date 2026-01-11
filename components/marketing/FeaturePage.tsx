import Image from 'next/image'
import Link from 'next/link'

import type { FeaturePageContent } from '@/data/feature-pages'
import PublicHeader from '@/components/marketing/PublicHeader'
import MockupCarousel from '@/components/marketing/MockupCarousel'
import MockupGallery from '@/components/marketing/MockupGallery'

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
  const showHeroImage = page.showHeroImage === true
  const showSegmentImages = page.showSegmentImages === true
  const heroIsPhoto = page.heroImage.kind === 'photo'
  const isExpandedOverview = page.overviewLayout === 'expanded'
  const overviewAlignClass = (page.overviewAlign ?? 'center') === 'start' ? 'items-start' : 'items-center'
  const hasBanner = !!page.bannerImage
  const hasCarousel = !!page.carouselImages && page.carouselImages.length > 0
  const bannerLayout = page.bannerLayout ?? 'carousel'
  const ctaPlacement = page.ctaPlacement ?? 'text'
  const overviewPaddingClass = page.overviewSpacing === 'spacious' ? 'pt-16 md:pt-20' : 'pt-10'
  const ctaButtonsClass = ctaPlacement === 'image' ? 'mt-6 flex flex-wrap gap-3' : 'flex flex-wrap gap-3 mt-8'

  const ctaButtons = (
    <div className={ctaButtonsClass}>
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
  )

  const overviewContent = (
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
      {ctaPlacement === 'text' && ctaButtons}
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-helfi-green/5 via-white to-blue-50">
      <PublicHeader />

      <main>
        {hasBanner && page.bannerImage && (
          <section id="gallery" className="relative w-full overflow-hidden">
            <div className="absolute inset-0">
              <Image
                src={page.bannerImage.src}
                alt={page.bannerImage.alt}
                fill
                sizes="100vw"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-black/35" />
            </div>
            <div className="relative z-10 px-6 py-12 md:py-16">
              <div className="max-w-6xl mx-auto">
                {hasCarousel && page.carouselImages ? (
                  bannerLayout === 'grid' ? (
                    <MockupGallery images={page.carouselImages} />
                  ) : (
                    <MockupCarousel images={page.carouselImages} />
                  )
                ) : (
                  <div className="h-36 md:h-44" />
                )}
              </div>
            </div>
          </section>
        )}
        <section id="overview" className={`px-6 ${overviewPaddingClass} pb-12`}>
          <div className="max-w-6xl mx-auto">
            {isExpandedOverview ? (
              <>
                <div className={`grid gap-10 lg:grid-cols-[1.1fr_0.9fr] ${overviewAlignClass}`}>
                  {overviewContent}
                  {showHeroImage && (
                    <div>
                      <div
                        className={
                          heroIsPhoto
                            ? 'rounded-3xl overflow-hidden shadow-lg'
                            : 'rounded-3xl p-4 bg-transparent shadow-none border border-transparent'
                        }
                      >
                        <Image
                          src={page.heroImage.src}
                          alt={page.heroImage.alt}
                          width={page.heroImage.width ?? 1450}
                          height={page.heroImage.height ?? 2936}
                          sizes="(min-width: 1024px) 40vw, 90vw"
                          className={
                            heroIsPhoto
                              ? 'w-full h-auto object-cover'
                              : 'w-full h-auto max-h-[520px] object-contain rounded-2xl'
                          }
                          priority
                        />
                      </div>
                      {ctaPlacement === 'image' && ctaButtons}
                    </div>
                  )}
                </div>
                <div className="mt-10 grid gap-6 md:grid-cols-2">
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
                  </aside>
                  <aside className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8">
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
                  </aside>
                </div>
              </>
            ) : (
              <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] items-start">
                {overviewContent}
                <div className="space-y-6">
                  {showHeroImage && (
                    <div>
                      <div className="rounded-3xl p-4 bg-transparent shadow-none border border-transparent">
                        <Image
                          src={page.heroImage.src}
                          alt={page.heroImage.alt}
                          width={page.heroImage.width ?? 1450}
                          height={page.heroImage.height ?? 2936}
                          sizes="(min-width: 1024px) 35vw, 90vw"
                          className="w-full h-auto max-h-[520px] object-contain rounded-2xl"
                          priority
                        />
                      </div>
                      {ctaPlacement === 'image' && ctaButtons}
                    </div>
                  )}
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
              </div>
            )}
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
              {page.segments.map((segment, index) => {
                const shouldShowImages = showSegmentImages || segment.showImage === true
                const segmentImages = shouldShowImages
                  ? (segment.images && segment.images.length > 0 ? segment.images : [segment.image])
                  : []
                const hasImages = segmentImages.length > 0
                const isPhotoGallery = segmentImages.some((image) => image.kind === 'photo')
                const shouldUseSideLayout = hasImages && (segment.imageLayout === 'side' || !isPhotoGallery)
                const imageFirst = segment.imagePlacement === 'left'
                const imageGridClass = segmentImages.length > 1 ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4'
                const imageStackClass = `${segmentImages.length > 1 ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4'}${
                  segment.alignImageWithHeading ? ' mt-6' : ''
                }`
                const imageSizeClass = segment.imageSize === 'large' ? 'max-h-[560px]' : 'max-h-[520px]'

                const textBlock = (
                  <div>
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
                )

                return (
                  <div
                    key={segment.title}
                    className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm"
                  >
                    {!shouldUseSideLayout && isPhotoGallery ? (
                      <div>
                        {textBlock}
                        {hasImages && (
                          <div className={`mt-6 ${imageGridClass}`}>
                            {segmentImages.map((image) => (
                              <div
                                key={`${segment.title}-${image.src}`}
                                className="rounded-2xl overflow-hidden shadow-sm border border-gray-100"
                              >
                                <Image
                                  src={image.src}
                                  alt={image.alt}
                                  width={image.width ?? 1200}
                                  height={image.height ?? 896}
                                  sizes="(min-width: 768px) 45vw, 100vw"
                                  className="w-full h-auto object-cover"
                                  loading="lazy"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : shouldUseSideLayout ? (
                      <div className={hasImages ? 'grid gap-8 lg:grid-cols-[1.15fr_0.85fr] items-start' : ''}>
                        {imageFirst && hasImages && (
                          <div className={imageStackClass}>
                            {segmentImages.map((image) => (
                              <div
                                key={`${segment.title}-${image.src}`}
                                className="rounded-2xl bg-transparent shadow-none overflow-hidden"
                              >
                                <Image
                                  src={image.src}
                                  alt={image.alt}
                                  width={image.width ?? 1450}
                                  height={image.height ?? 2936}
                                  sizes="(min-width: 1024px) 30vw, 90vw"
                                  className={`w-full h-auto ${imageSizeClass} object-contain`}
                                  loading="lazy"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        {textBlock}
                        {!imageFirst && hasImages && (
                          <div className={imageStackClass}>
                            {segmentImages.map((image) => (
                              <div
                                key={`${segment.title}-${image.src}`}
                                className="rounded-2xl bg-transparent shadow-none overflow-hidden"
                              >
                                <Image
                                  src={image.src}
                                  alt={image.alt}
                                  width={image.width ?? 1450}
                                  height={image.height ?? 2936}
                                  sizes="(min-width: 1024px) 30vw, 90vw"
                                  className={`w-full h-auto ${imageSizeClass} object-contain`}
                                  loading="lazy"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className={hasImages ? 'grid gap-8 lg:grid-cols-[1.15fr_0.85fr] items-start' : ''}>
                        {textBlock}
                        {hasImages && (
                          <div className={imageStackClass}>
                            {segmentImages.map((image) => (
                              <div
                                key={`${segment.title}-${image.src}`}
                                className="rounded-2xl bg-transparent shadow-none overflow-hidden"
                              >
                                <Image
                                  src={image.src}
                                  alt={image.alt}
                                  width={image.width ?? 1450}
                                  height={image.height ?? 2936}
                                  sizes="(min-width: 1024px) 30vw, 90vw"
                                  className={`w-full h-auto ${imageSizeClass} object-contain`}
                                  loading="lazy"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
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
