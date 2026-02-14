import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import MedicalDisclaimerBanner from '@/components/marketing/MedicalDisclaimerBanner'
import PublicFooter from '@/components/marketing/PublicFooter'
import PublicHeader from '@/components/marketing/PublicHeader'
import { newsPosts } from '@/data/news-posts'
import { absoluteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'Helfi News | Product Updates and Health Tracking Guides',
  description:
    'Read the latest Helfi updates, food tracking guides, and health insights articles.',
  alternates: {
    canonical: absoluteUrl('/news'),
  },
  openGraph: {
    title: 'Helfi News',
    description:
      'Product updates, feature news, and practical health tracking articles from the Helfi team.',
    url: absoluteUrl('/news'),
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Helfi News | Product Updates and Health Tracking Guides',
    description:
      'Read the latest Helfi updates, food tracking guides, and health insights articles.',
    images: [absoluteUrl('/news-images/blog-banner.png')],
  },
}

const sortedPosts = [...newsPosts].sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
)

const featuredPost = sortedPosts[0]
const secondaryPosts = sortedPosts.slice(1)

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatReadingTime(value: string) {
  const match = value.match(/\d+/)
  if (!match) return value
  return `About ${match[0]} minutes`
}

export default function NewsPage() {
  const newsListingSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Blog',
        name: 'Helfi News',
        description: 'Latest product updates and health tracking guides from Helfi.',
        url: absoluteUrl('/news'),
        publisher: {
          '@type': 'Organization',
          name: 'Helfi',
          url: absoluteUrl('/'),
        },
      },
      {
        '@type': 'ItemList',
        itemListElement: sortedPosts.map((post, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: absoluteUrl(`/news/${post.slug}`),
          item: {
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.excerpt,
            datePublished: new Date(post.publishedAt).toISOString(),
            dateModified: new Date(post.updatedAt).toISOString(),
          },
        })),
      },
    ],
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/60 via-white to-sky-50/40">
      <MedicalDisclaimerBanner />
      <PublicHeader />

      <main className="px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-[1160px] mx-auto pt-10 md:pt-14">
          <section className="mb-9">
            <div className="relative w-full overflow-hidden rounded-3xl border border-emerald-100 shadow-sm">
              <Image
                src="/news-images/blog-banner.png"
                alt="Helfi News banner"
                width={1584}
                height={672}
                className="w-full h-auto object-cover"
                priority
              />
            </div>
          </section>

          <p className="text-xs uppercase tracking-[0.22em] text-emerald-700 font-semibold">News</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
            Latest product updates and health tracking guides
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-3xl">
            A better way to follow what is new at Helfi, what we are building next, and practical tips to
            get more value from your daily tracking.
          </p>

          <section className="mt-10">
            <Link
              href={`/news/${featuredPost.slug}`}
              className="group block rounded-3xl border border-emerald-100 bg-white/95 shadow-sm hover:shadow-md transition-all overflow-hidden"
            >
              <div className="grid md:grid-cols-[1.2fr_0.8fr]">
                <div className="p-7 md:p-10">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    <span>{featuredPost.category}</span>
                    <span className="text-gray-400">•</span>
                    <span>{formatDate(featuredPost.publishedAt)}</span>
                    <span className="text-gray-400">•</span>
                    <span>Reading time: {formatReadingTime(featuredPost.readingTime)}</span>
                  </div>
                  <h2 className="mt-4 text-3xl md:text-4xl font-bold text-gray-900 leading-tight group-hover:text-emerald-700 transition-colors">
                    {featuredPost.title}
                  </h2>
                  <p className="mt-4 text-lg text-gray-600 leading-relaxed">{featuredPost.excerpt}</p>
                  <span className="inline-flex items-center mt-6 text-sm font-semibold text-emerald-700 group-hover:text-emerald-800">
                    Read article →
                  </span>
                </div>
                <div className="relative min-h-[240px] md:min-h-[320px] p-7 md:p-8 flex flex-col justify-end overflow-hidden">
                  <Image
                    src="/news-images/what-is-next-for-helfi.png"
                    alt="What is next for Helfi"
                    fill
                    className="object-cover"
                    sizes="(min-width: 768px) 35vw, 100vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/15 to-transparent" />
                  <p className="relative text-white/95 text-sm uppercase tracking-[0.18em] font-semibold">
                    Featured story
                  </p>
                  <p className="relative text-white text-2xl font-bold mt-3">What is next for Helfi</p>
                </div>
              </div>
            </Link>
          </section>

          <section className="mt-9 grid gap-5 md:grid-cols-3">
            {secondaryPosts.map((post) => (
              <article
                key={post.slug}
                className="rounded-2xl border border-gray-100 bg-white/95 p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{post.category}</p>
                <h2 className="mt-3 text-xl font-semibold text-gray-900 leading-snug">{post.title}</h2>
                <p className="mt-3 text-sm text-gray-600 leading-6">{post.excerpt}</p>
                <p className="mt-4 text-xs text-gray-500">
                  {formatDate(post.publishedAt)} • Reading time: {formatReadingTime(post.readingTime)}
                </p>
                <Link
                  href={`/news/${post.slug}`}
                  className="inline-flex items-center mt-5 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Read article →
                </Link>
              </article>
            ))}
          </section>
        </div>
      </main>

      <PublicFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(newsListingSchema),
        }}
      />
    </div>
  )
}
