import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateDistanceKm } from '@/lib/practitioner-utils'

function normalize(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function deriveRadiusTier(radiusKm: number) {
  if (radiusKm <= 5) return 'R5'
  if (radiusKm <= 10) return 'R10'
  if (radiusKm <= 25) return 'R25'
  return 'R50'
}

function computeQualityScore(listing: any) {
  let score = 0
  const images = listing.images as any
  if (images?.logoUrl) score += 1
  if (listing.description) score += 1
  if (listing.hoursJson) score += 1
  if (listing.websiteUrl) score += 1
  if (listing.emailPublic) score += 1
  return score
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const categoryId = url.searchParams.get('categoryId') || undefined
  const query = normalize(url.searchParams.get('q'))
  const lat = Number(url.searchParams.get('lat') || '')
  const lng = Number(url.searchParams.get('lng') || '')
  const radiusKm = Number(url.searchParams.get('radiusKm') || 10)
  const telehealthOnly = url.searchParams.get('telehealth') === 'true'
  const geoKey = url.searchParams.get('geoKey') || undefined

  const where: any = {
    status: 'ACTIVE',
    reviewStatus: 'APPROVED',
    visibilityReason: { in: ['TRIAL_ACTIVE', 'SUB_ACTIVE'] },
  }
  if (categoryId) {
    where.categoryId = categoryId
  }

  const listings = await prisma.practitionerListing.findMany({
    where,
    include: {
      category: true,
      subcategory: true,
    },
  })

  const categories = await prisma.practitionerCategory.findMany({
    select: { id: true, name: true, synonyms: true },
  })
  const synonymsMap = new Map<string, string[]>()
  categories.forEach((cat) => {
    synonymsMap.set(cat.id, (cat.synonyms || []).map((syn) => normalize(syn)))
  })

  let filtered = listings

  if (telehealthOnly) {
    filtered = filtered.filter((listing) => listing.serviceType === 'TELEHEALTH' || listing.serviceType === 'BOTH')
  }

  if (query) {
    filtered = filtered.filter((listing) => {
      const textValues = [
        listing.displayName,
        listing.description,
        listing.category?.name,
        listing.subcategory?.name,
        ...(listing.tags || []),
      ]
      const textMatch = textValues.some((value) => normalize(value).includes(query))
      if (textMatch) return true
      const categorySynonyms = synonymsMap.get(listing.categoryId) || []
      const subcategorySynonyms = listing.subcategoryId ? synonymsMap.get(listing.subcategoryId) || [] : []
      return [...categorySynonyms, ...subcategorySynonyms].some((syn) => syn.includes(query))
    })
  }

  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng)
  const center = hasLocation ? { lat, lng } : null

  const withDistance = filtered
    .map((listing) => {
      if (!center || listing.lat == null || listing.lng == null) {
        return { listing, distanceKm: null }
      }
      const distanceKm = calculateDistanceKm(
        { lat: center.lat, lng: center.lng },
        { lat: listing.lat, lng: listing.lng }
      )
      return { listing, distanceKm }
    })
    .filter((item) => {
      if (!center || item.distanceKm == null) return true
      return item.distanceKm <= radiusKm
    })

  const boostTier = deriveRadiusTier(radiusKm)
  const now = new Date()
  let boostedIds: string[] = []
  let topBoostId: string | null = null

  if (categoryId && geoKey) {
    const boosts = await prisma.practitionerBoostPurchase.findMany({
      where: {
        categoryId,
        geoKey,
        radiusTier: boostTier,
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
    })

    const eligibleBoostIds = boosts.map((boost) => boost.listingId)
    boostedIds = eligibleBoostIds.filter((id) => withDistance.some((item) => item.listing.id === id))

    if (boostedIds.length) {
      boostedIds.sort()
      const bucketKey = `${categoryId}|${geoKey}|${boostTier}`
      const rotation = await prisma.practitionerBoostRotationState.findUnique({ where: { bucketKey } })
      const lastIndex = rotation?.lastServedListingId
        ? boostedIds.indexOf(rotation.lastServedListingId)
        : -1
      const nextIndex = (lastIndex + 1) % boostedIds.length
      topBoostId = boostedIds[nextIndex]

      await prisma.practitionerBoostRotationState.upsert({
        where: { bucketKey },
        create: {
          bucketKey,
          lastServedListingId: topBoostId,
          lastServedAt: new Date(),
        },
        update: {
          lastServedListingId: topBoostId,
          lastServedAt: new Date(),
        },
      })
    }
  }

  const boostedSet = new Set(boostedIds)
  const boostedListings = withDistance
    .filter((item) => boostedSet.has(item.listing.id))
    .sort((a, b) => {
      if (a.listing.id === topBoostId) return -1
      if (b.listing.id === topBoostId) return 1
      return a.listing.id.localeCompare(b.listing.id)
    })

  const nonBoostedListings = withDistance
    .filter((item) => !boostedSet.has(item.listing.id))
    .sort((a, b) => {
      const distanceA = a.distanceKm ?? Number.MAX_SAFE_INTEGER
      const distanceB = b.distanceKm ?? Number.MAX_SAFE_INTEGER
      if (distanceA !== distanceB) return distanceA - distanceB
      const scoreA = computeQualityScore(a.listing)
      const scoreB = computeQualityScore(b.listing)
      return scoreB - scoreA
    })

  const ordered = [...boostedListings, ...nonBoostedListings]

  const results = ordered.map((item) => ({
    id: item.listing.id,
    displayName: item.listing.displayName,
    slug: item.listing.slug,
    categoryName: item.listing.category?.name || null,
    subcategoryName: item.listing.subcategory?.name || null,
    description: item.listing.description,
    phone: item.listing.phone,
    websiteUrl: item.listing.websiteUrl,
    emailPublic: item.listing.emailPublic,
    lat: item.listing.lat,
    lng: item.listing.lng,
    serviceType: item.listing.serviceType,
    distanceKm: item.distanceKm,
    isBoosted: boostedSet.has(item.listing.id),
    isTopBoost: topBoostId === item.listing.id,
  }))

  return NextResponse.json({
    results,
    center,
    radiusKm,
    boostTier,
  })
}
