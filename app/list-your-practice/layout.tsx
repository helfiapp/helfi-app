import type { Metadata } from 'next'

import { absoluteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'List Your Practice | Helfi',
  description: 'Create and manage your practitioner listing on Helfi.',
  alternates: {
    canonical: absoluteUrl('/list-your-practice'),
  },
  openGraph: {
    title: 'List Your Practice | Helfi',
    description: 'Create and manage your practitioner listing on Helfi.',
    url: absoluteUrl('/list-your-practice'),
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'List Your Practice | Helfi',
    description: 'Create and manage your practitioner listing on Helfi.',
  },
}

export default function ListYourPracticeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
