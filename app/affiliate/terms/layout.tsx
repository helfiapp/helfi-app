import type { Metadata } from 'next'

import { absoluteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'Affiliate Program Terms | Helfi',
  description: 'Review Helfi affiliate program terms, commission rules, and payout details.',
  alternates: {
    canonical: absoluteUrl('/affiliate/terms'),
  },
  openGraph: {
    title: 'Affiliate Program Terms | Helfi',
    description: 'Review Helfi affiliate program terms, commission rules, and payout details.',
    url: absoluteUrl('/affiliate/terms'),
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Affiliate Program Terms | Helfi',
    description: 'Review Helfi affiliate program terms, commission rules, and payout details.',
  },
}

export default function AffiliateTermsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
