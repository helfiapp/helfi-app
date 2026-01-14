import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseCommaList, slugify, normalizeUrl } from '@/lib/practitioner-utils'

async function ensurePractitionerAccount(userId: string, email: string) {
  let account = await prisma.practitionerAccount.findUnique({ where: { userId } })
  if (!account) {
    account = await prisma.practitionerAccount.create({
      data: {
        userId,
        contactEmail: email.toLowerCase(),
      },
    })
  }
  return account
}

async function generateUniqueSlug(base: string) {
  const normalized = slugify(base)
  if (!normalized) return `listing-${Date.now()}`

  const existing = await prisma.practitionerListing.findFirst({ where: { slug: normalized } })
  if (!existing) return normalized

  let counter = 2
  while (true) {
    const candidate = `${normalized}-${counter}`
    const taken = await prisma.practitionerListing.findFirst({ where: { slug: candidate } })
    if (!taken) return candidate
    counter += 1
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const displayName = String(body?.displayName || '').trim()
  const categoryId = String(body?.categoryId || '').trim()

  if (!displayName || !categoryId) {
    return NextResponse.json({ error: 'Display name and category are required.' }, { status: 400 })
  }

  const account = await ensurePractitionerAccount(session.user.id, session.user.email)
  const existingListing = await prisma.practitionerListing.findFirst({
    where: { practitionerAccountId: account.id },
  })

  if (existingListing) {
    return NextResponse.json({ error: 'You already have a listing.' }, { status: 400 })
  }

  const slug = await generateUniqueSlug(displayName)
  const hoursNotes = String(body?.hoursNotes || '').trim()

  const listing = await prisma.practitionerListing.create({
    data: {
      practitionerAccountId: account.id,
      displayName,
      slug,
      categoryId,
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
      serviceType: body?.serviceType || 'IN_PERSON',
      languages: parseCommaList(body?.languages),
      hoursJson: hoursNotes ? { notes: hoursNotes } : undefined,
      images: body?.images ? body.images : null,
      status: 'DRAFT',
      reviewStatus: 'PENDING',
    },
  })

  return NextResponse.json({ listing })
}
