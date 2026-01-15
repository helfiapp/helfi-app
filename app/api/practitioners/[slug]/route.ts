import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { geocodeAddress } from '@/lib/practitioner-utils'
import { createTrackingToken } from '@/lib/practitioner-tracking'

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
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

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }

  if (!listing.lat || !listing.lng) {
    const address = [
      listing.addressLine1,
      listing.addressLine2,
      listing.suburbCity,
      listing.stateRegion,
      listing.postcode,
      listing.country,
    ]
      .filter(Boolean)
      .join(', ')
    const geocoded = address ? await geocodeAddress(address) : null
    if (geocoded?.lat && geocoded?.lng) {
      const updated = await prisma.practitionerListing.update({
        where: { id: listing.id },
        data: { lat: geocoded.lat, lng: geocoded.lng },
      })
      listing.lat = updated.lat
      listing.lng = updated.lng
    }
  }

  return NextResponse.json({
    listing: {
      id: listing.id,
      displayName: listing.displayName,
      slug: listing.slug,
      description: listing.description,
      phone: listing.phone,
      websiteUrl: listing.websiteUrl,
      emailPublic: listing.emailPublic,
      addressLine1: listing.addressLine1,
      addressLine2: listing.addressLine2,
      suburbCity: listing.suburbCity,
      stateRegion: listing.stateRegion,
      postcode: listing.postcode,
      country: listing.country,
      lat: listing.lat,
      lng: listing.lng,
      serviceType: listing.serviceType,
      languages: listing.languages,
      tags: listing.tags,
      hours: listing.hoursJson,
      images: listing.images,
      categoryName: listing.category?.name || null,
      subcategoryName: listing.subcategory?.name || null,
      trackingToken: createTrackingToken(listing.id),
    },
  })
}
