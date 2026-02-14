import type { Metadata } from 'next'

import { absoluteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'Helfi FAQ and Help Center | Food Tracking, Pricing, and AI Insights',
  description:
    'Get clear answers about Helfi food tracking, AI insights, billing, privacy, and account setup.',
  keywords: [
    'Helfi FAQ',
    'food tracking help',
    'health app support',
    'AI health insights',
    'Helfi pricing',
  ],
  alternates: {
    canonical: absoluteUrl('/faq'),
  },
  openGraph: {
    title: 'Helfi FAQ and Help Center',
    description:
      'Get clear answers about Helfi food tracking, AI insights, billing, privacy, and account setup.',
    url: absoluteUrl('/faq'),
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Helfi FAQ and Help Center',
    description:
      'Get clear answers about Helfi food tracking, AI insights, billing, privacy, and account setup.',
  },
}

export default function FAQLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
