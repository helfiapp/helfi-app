import type { MetadataRoute } from 'next'

import { getSiteUrl } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        disallow: [
          '/api/',
          '/admin-panel',
          '/main-admin',
          '/dashboard',
          '/onboarding',
          '/insights',
          '/food',
          '/check-in',
          '/mood',
          '/notifications',
          '/settings',
          '/account',
          '/billing',
          '/profile',
          '/chat',
          '/chat-log',
          '/devices',
          '/health-tracking',
          '/lab-reports',
          '/medical-images',
          '/symptoms',
          '/support',
          '/auth/',
          '/pwa-entry',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
