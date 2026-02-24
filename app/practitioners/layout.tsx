import type { Metadata } from 'next'

import { absoluteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'Find Health Practitioners Near You | Helfi Directory',
  description:
    'Search a free practitioner directory by specialty, location, and telehealth. Find trusted health practitioners near you on Helfi.',
  keywords: [
    'find practitioner',
    'health practitioner directory',
    'free practitioner directory',
    'telehealth practitioner',
    'allied health directory',
  ],
  alternates: {
    canonical: absoluteUrl('/practitioners'),
  },
  openGraph: {
    title: 'Find Health Practitioners Near You | Helfi Directory',
    description:
      'Search a free practitioner directory by specialty, location, and telehealth.',
    url: absoluteUrl('/practitioners'),
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Find Health Practitioners Near You | Helfi Directory',
    description:
      'Search a free practitioner directory by specialty, location, and telehealth.',
  },
}

export default function PractitionersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
