import type { Metadata } from 'next'

import { absoluteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'Privacy Policy | Helfi',
  description: 'Read how Helfi collects, uses, and protects your data.',
  alternates: {
    canonical: absoluteUrl('/privacy'),
  },
  openGraph: {
    title: 'Privacy Policy | Helfi',
    description: 'Read how Helfi collects, uses, and protects your data.',
    url: absoluteUrl('/privacy'),
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Privacy Policy | Helfi',
    description: 'Read how Helfi collects, uses, and protects your data.',
  },
}

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
