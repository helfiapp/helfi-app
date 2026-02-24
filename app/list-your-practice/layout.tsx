import type { Metadata } from 'next'

import { absoluteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'List Your Practice for Free | Practitioner Directory | Helfi',
  description:
    'Join Helfi’s practitioner directory with 3 months free, then $4.95/month. Get found by people searching for trusted health practitioners.',
  keywords: [
    'list your practice',
    'practitioner directory listing',
    'free practitioner listing',
    'healthcare directory for practitioners',
  ],
  alternates: {
    canonical: absoluteUrl('/list-your-practice'),
  },
  openGraph: {
    title: 'List Your Practice for Free | Practitioner Directory | Helfi',
    description:
      'Join Helfi’s practitioner directory with 3 months free, then $4.95/month.',
    url: absoluteUrl('/list-your-practice'),
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'List Your Practice for Free | Practitioner Directory | Helfi',
    description:
      'Join Helfi’s practitioner directory with 3 months free, then $4.95/month.',
  },
}

export default function ListYourPracticeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
