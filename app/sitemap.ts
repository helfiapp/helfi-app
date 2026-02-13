import type { MetadataRoute } from 'next'

import { featurePages } from '@/data/feature-pages'
import { getSiteUrl } from '@/lib/site-url'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl()
  const now = new Date()

  const staticRoutes: Array<{
    path: string
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
    priority: number
  }> = [
    { path: '/', changeFrequency: 'weekly', priority: 1 },
    { path: '/features', changeFrequency: 'weekly', priority: 0.9 },
    { path: '/faq', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/privacy', changeFrequency: 'yearly', priority: 0.4 },
    { path: '/terms', changeFrequency: 'yearly', priority: 0.4 },
    { path: '/affiliate/terms', changeFrequency: 'yearly', priority: 0.4 },
    { path: '/practitioners', changeFrequency: 'daily', priority: 0.8 },
    { path: '/list-your-practice', changeFrequency: 'weekly', priority: 0.7 },
    { path: '/list-your-practice/start', changeFrequency: 'weekly', priority: 0.6 },
  ]

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  const featureEntries: MetadataRoute.Sitemap = featurePages.map((page) => ({
    url: `${siteUrl}/features/${page.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  return [...staticEntries, ...featureEntries]
}
