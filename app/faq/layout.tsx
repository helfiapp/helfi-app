import type { Metadata } from 'next'

import { absoluteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'FAQ | Helfi',
  description: 'Find quick answers about Helfi, including setup, tracking, billing, and privacy.',
  alternates: {
    canonical: absoluteUrl('/faq'),
  },
  openGraph: {
    title: 'FAQ | Helfi',
    description: 'Find quick answers about Helfi, including setup, tracking, billing, and privacy.',
    url: absoluteUrl('/faq'),
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'FAQ | Helfi',
    description: 'Find quick answers about Helfi, including setup, tracking, billing, and privacy.',
  },
}

export default function FAQLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
