import type { Metadata } from 'next'

import { absoluteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'Find Practitioners | Helfi',
  description: 'Search practitioners by category, location, and service type.',
  alternates: {
    canonical: absoluteUrl('/practitioners'),
  },
  openGraph: {
    title: 'Find Practitioners | Helfi',
    description: 'Search practitioners by category, location, and service type.',
    url: absoluteUrl('/practitioners'),
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Find Practitioners | Helfi',
    description: 'Search practitioners by category, location, and service type.',
  },
}

export default function PractitionersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
