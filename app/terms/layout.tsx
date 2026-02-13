import type { Metadata } from 'next'

import { absoluteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'Terms of Use | Helfi',
  description: 'Read the terms and conditions for using Helfi.',
  alternates: {
    canonical: absoluteUrl('/terms'),
  },
  openGraph: {
    title: 'Terms of Use | Helfi',
    description: 'Read the terms and conditions for using Helfi.',
    url: absoluteUrl('/terms'),
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Terms of Use | Helfi',
    description: 'Read the terms and conditions for using Helfi.',
  },
}

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
