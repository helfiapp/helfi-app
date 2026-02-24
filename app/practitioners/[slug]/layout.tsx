import type { Metadata } from 'next'

import { prisma } from '@/lib/prisma'
import { absoluteUrl } from '@/lib/site-url'

type LayoutProps = {
  children: React.ReactNode
  params: {
    slug: string
  }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const listing = await prisma.practitionerListing.findFirst({
    where: {
      slug: params.slug,
      status: 'ACTIVE',
      reviewStatus: 'APPROVED',
      visibilityReason: { in: ['TRIAL_ACTIVE', 'SUB_ACTIVE'] },
    },
    include: {
      category: true,
      subcategory: true,
    },
  })

  const canonical = absoluteUrl(`/practitioners/${params.slug}`)

  if (!listing) {
    return {
      title: 'Practitioner Profile | Helfi Directory',
      description: 'Practitioner profile in the Helfi health practitioner directory.',
      alternates: {
        canonical,
      },
    }
  }

  const categoryName = listing.subcategory?.name || listing.category?.name || 'Health practitioner'
  const locationLabel = [listing.suburbCity, listing.stateRegion, listing.country].filter(Boolean).join(', ')
  const description =
    listing.description?.trim() ||
    `View ${listing.displayName} (${categoryName})${locationLabel ? ` in ${locationLabel}` : ''} on the Helfi practitioner directory.`

  const title = `${listing.displayName} | ${categoryName} | Helfi Directory`

  return {
    title,
    description,
    keywords: [
      listing.displayName,
      categoryName,
      'health practitioner profile',
      'practitioner directory',
      locationLabel || 'find practitioner',
    ].filter(Boolean) as string[],
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default function PractitionerProfileLayout({ children }: LayoutProps) {
  return children
}
