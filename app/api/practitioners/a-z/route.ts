import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const listings = await prisma.practitionerListing.findMany({
    where: {
      status: 'ACTIVE',
      reviewStatus: 'APPROVED',
      visibilityReason: { in: ['TRIAL_ACTIVE', 'SUB_ACTIVE'] },
    },
    select: {
      id: true,
      displayName: true,
      slug: true,
      category: { select: { name: true } },
      subcategory: { select: { name: true } },
      suburbCity: true,
      stateRegion: true,
      country: true,
    },
    orderBy: {
      displayName: 'asc',
    },
  })

  const results = listings.map((listing) => ({
    id: listing.id,
    displayName: listing.displayName,
    slug: listing.slug,
    categoryName: listing.category?.name || null,
    subcategoryName: listing.subcategory?.name || null,
    location: [listing.suburbCity, listing.stateRegion, listing.country]
      .filter(Boolean)
      .join(', '),
  }))

  return NextResponse.json({ results })
}
