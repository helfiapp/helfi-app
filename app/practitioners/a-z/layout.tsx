import type { Metadata } from 'next'

import { absoluteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'Practitioner Categories A-Z | Helfi Directory',
  description:
    'Browse practitioner specialties A-Z and jump directly into Helfi directory search results.',
  keywords: [
    'practitioner categories',
    'health practitioner specialties',
    'practitioner directory a-z',
  ],
  alternates: {
    canonical: absoluteUrl('/practitioners/a-z'),
  },
  openGraph: {
    title: 'Practitioner Categories A-Z | Helfi Directory',
    description:
      'Browse practitioner specialties A-Z and jump directly into Helfi directory search results.',
    url: absoluteUrl('/practitioners/a-z'),
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Practitioner Categories A-Z | Helfi Directory',
    description:
      'Browse practitioner specialties A-Z and jump directly into Helfi directory search results.',
  },
}

export default function PractitionerAZLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
