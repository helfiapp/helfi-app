import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import MedicalDisclaimerBanner from '@/components/marketing/MedicalDisclaimerBanner'
import PublicFooter from '@/components/marketing/PublicFooter'
import PublicHeader from '@/components/marketing/PublicHeader'
import { newsPostBySlug, newsPosts } from '@/data/news-posts'
import { absoluteUrl } from '@/lib/site-url'

type NewsArticlePageProps = {
  params: {
    slug: string
  }
}

export function generateStaticParams() {
  return newsPosts.map((post) => ({ slug: post.slug }))
}

export function generateMetadata({ params }: NewsArticlePageProps): Metadata {
  const post = newsPostBySlug.get(params.slug)

  if (!post) {
    return {
      title: 'Article not found | Helfi News',
    }
  }

  return {
    title: post.seoTitle,
    description: post.seoDescription,
    alternates: {
      canonical: `/news/${post.slug}`,
    },
    openGraph: {
      title: post.seoTitle,
      description: post.seoDescription,
      url: absoluteUrl(`/news/${post.slug}`),
      type: 'article',
      publishedTime: new Date(post.publishedAt).toISOString(),
      modifiedTime: new Date(post.updatedAt).toISOString(),
      authors: [post.author],
    },
  }
}

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

export default function NewsArticlePage({ params }: NewsArticlePageProps) {
  const post = newsPostBySlug.get(params.slug)

  if (!post) {
    notFound()
  }

  const relatedPosts = newsPosts.filter((item) => item.slug !== post.slug).slice(0, 3)

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.seoDescription,
    datePublished: new Date(post.publishedAt).toISOString(),
    dateModified: new Date(post.updatedAt).toISOString(),
    url: absoluteUrl(`/news/${post.slug}`),
    author: {
      '@type': 'Organization',
      name: post.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Helfi',
      url: absoluteUrl('/'),
    },
    mainEntityOfPage: absoluteUrl(`/news/${post.slug}`),
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/50 via-white to-white">
      <MedicalDisclaimerBanner />
      <PublicHeader mobileVariant="back" />

      <main className="px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-[900px] mx-auto pt-8 md:pt-12">
          <Link href="/news" className="inline-flex items-center text-sm font-semibold text-emerald-700 hover:text-emerald-800">
            ← Back to news
          </Link>

          <article className="mt-5">
            <p className="text-xs uppercase tracking-[0.16em] font-semibold text-emerald-700">{post.category}</p>
            <h1 className="mt-3 text-4xl md:text-5xl font-bold text-gray-900 leading-tight">{post.title}</h1>

            <p className="mt-4 text-sm text-gray-500">
              Published {formatDate(post.publishedAt)} • Updated {formatDate(post.updatedAt)} • Reading time: {formatReadingTime(post.readingTime)} • By {post.author}
            </p>

            {post.heroImage ? (
              <div className="mt-8 rounded-3xl overflow-hidden border border-emerald-100 shadow-sm">
                <Image
                  src={post.heroImage}
                  alt={post.heroImageAlt || post.title}
                  width={1584}
                  height={672}
                  className="w-full h-auto object-cover"
                  priority
                />
              </div>
            ) : (
              <div className="mt-8 rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-500 via-emerald-400 to-sky-400 min-h-[210px] md:min-h-[260px] px-7 py-8 flex items-end">
                <p className="text-white text-sm font-semibold uppercase tracking-[0.16em]">Hero image placeholder</p>
              </div>
            )}

            <div className="mt-8 space-y-9">
              {post.sections.map((section) => (
                <section key={section.heading} className="space-y-4">
                  <h2 className="text-2xl font-bold text-gray-900 leading-snug">{section.heading}</h2>

                  {section.paragraphs.map((paragraph, index) => (
                    <p key={index} className="text-lg leading-8 text-gray-700">
                      {paragraph}
                    </p>
                  ))}

                  {section.bullets && section.bullets.length > 0 ? (
                    <ul className="space-y-2.5">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-3 text-gray-700 text-lg leading-7">
                          <span className="mt-2 h-2.5 w-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>

            {post.internalLinks && post.internalLinks.length > 0 ? (
              <section className="mt-10 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 md:p-7">
                <h2 className="text-xl font-bold text-gray-900">Related Helfi links</h2>
                <ul className="mt-4 space-y-3">
                  {post.internalLinks.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-base font-semibold text-emerald-700 hover:text-emerald-800">
                        {link.label} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </article>

          <section className="mt-14 rounded-2xl border border-gray-100 bg-white p-6 md:p-8 shadow-sm">
            <h3 className="text-2xl font-bold text-gray-900">More from Helfi News</h3>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {relatedPosts.map((item) => (
                <Link
                  key={item.slug}
                  href={`/news/${item.slug}`}
                  className="overflow-hidden rounded-xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/40 transition-colors"
                >
                  {item.heroImage ? (
                    <div className="relative aspect-[16/9] w-full">
                      <Image
                        src={item.heroImage}
                        alt={item.heroImageAlt || item.title}
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 30vw, 100vw"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[16/9] w-full bg-gradient-to-br from-emerald-500 via-emerald-400 to-sky-400" />
                  )}
                  <div className="p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-emerald-700 font-semibold">{item.category}</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900 leading-6">{item.title}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleSchema),
        }}
      />

      <PublicFooter />
    </div>
  )
}
