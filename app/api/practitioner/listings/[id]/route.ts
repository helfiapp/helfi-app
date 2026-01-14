import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { parseCommaList, normalizeUrl } from '@/lib/practitioner-utils'

async function getListingForUser(listingId: string, userId: string) {
  return prisma.practitionerListing.findFirst({
    where: {
      id: listingId,
      practitionerAccount: { userId },
    },
  })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const listing = await getListingForUser(params.id, session.user.id)
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }

  return NextResponse.json({ listing })
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const listing = await getListingForUser(params.id, session.user.id)
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))

  const hasHoursNotes = Object.prototype.hasOwnProperty.call(body, 'hoursNotes')
  const hoursNotes = hasHoursNotes ? String(body?.hoursNotes || '').trim() : ''

  const updated = await prisma.practitionerListing.update({
    where: { id: listing.id },
    data: {
      displayName: body?.displayName ? String(body.displayName).trim() : listing.displayName,
      categoryId: body?.categoryId || listing.categoryId,
      subcategoryId: body?.subcategoryId || null,
      tags: parseCommaList(body?.tags),
      description: body?.description ? String(body.description).trim() : null,
      phone: body?.phone ? String(body.phone).trim() : null,
      websiteUrl: normalizeUrl(body?.websiteUrl || null),
      emailPublic: body?.emailPublic ? String(body.emailPublic).trim().toLowerCase() : null,
      addressLine1: body?.addressLine1 ? String(body.addressLine1).trim() : null,
      addressLine2: body?.addressLine2 ? String(body.addressLine2).trim() : null,
      suburbCity: body?.suburbCity ? String(body.suburbCity).trim() : null,
      stateRegion: body?.stateRegion ? String(body.stateRegion).trim() : null,
      postcode: body?.postcode ? String(body.postcode).trim() : null,
      country: body?.country ? String(body.country).trim() : null,
      lat: typeof body?.lat === 'number' ? body.lat : null,
      lng: typeof body?.lng === 'number' ? body.lng : null,
      serviceType: body?.serviceType || listing.serviceType,
      languages: parseCommaList(body?.languages),
      hoursJson: hasHoursNotes
        ? hoursNotes
          ? { notes: hoursNotes }
          : Prisma.JsonNull
        : undefined,
      images: body?.images ? body.images : null,
    },
  })

  return NextResponse.json({ listing: updated })
}
