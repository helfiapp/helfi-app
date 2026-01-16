import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const reviewStatus = url.searchParams.get('reviewStatus')
  const status = url.searchParams.get('status')
  const country = url.searchParams.get('country')
  const query = url.searchParams.get('q')
  const entryType = url.searchParams.get('entryType') || 'ALL'
  let page = Math.max(1, Number(url.searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') || 50)))

  const includeListings = entryType !== 'ACCOUNTS'
  const includeAccounts = entryType !== 'LISTINGS'
  const entries: any[] = []

  const listingWhere: any = {}
  if (reviewStatus && reviewStatus !== 'ALL') {
    listingWhere.reviewStatus = reviewStatus
  }
  if (status && status !== 'ALL') {
    listingWhere.status = status
  }
  if (country) {
    listingWhere.country = country
  }
  if (query) {
    listingWhere.OR = [
      { displayName: { contains: query, mode: 'insensitive' } },
      { slug: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
      { practitionerAccount: { contactEmail: { contains: query, mode: 'insensitive' } } },
    ]
  }

  let total = 0
  if (includeListings) {
    total += await prisma.practitionerListing.count({ where: listingWhere })
  }
  const accountWhere: any =
    includeAccounts && (!reviewStatus || reviewStatus === 'ALL') && (!status || status === 'ALL') && !country
      ? { listings: { none: {} } }
      : null
  if (accountWhere && query) {
    accountWhere.OR = [
      { contactEmail: { contains: query, mode: 'insensitive' } },
      { user: { email: { contains: query, mode: 'insensitive' } } },
    ]
  }
  if (accountWhere) {
    total += await prisma.practitionerAccount.count({ where: accountWhere })
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (page > totalPages) page = totalPages

  if (includeListings) {
    const listingTake = entryType === 'ALL' ? page * pageSize : pageSize
    const listingSkip = entryType === 'ALL' ? 0 : (page - 1) * pageSize
    const listings = await prisma.practitionerListing.findMany({
      where: listingWhere,
      select: {
        id: true,
        displayName: true,
        slug: true,
        status: true,
        reviewStatus: true,
        reviewFlagReason: true,
        aiRiskLevel: true,
        aiReasoning: true,
        suburbCity: true,
        stateRegion: true,
        country: true,
        createdAt: true,
        practitionerAccount: {
          select: {
            contactEmail: true,
          },
        },
        category: {
          select: {
            name: true,
          },
        },
        subcategory: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: listingTake,
      skip: listingSkip,
    })

    listings.forEach((listing) => {
      entries.push({
        type: 'LISTING',
        createdAt: listing.createdAt,
        listing,
        account: listing.practitionerAccount,
      })
    })
  }

  if (accountWhere) {
    const accountTake = entryType === 'ALL' ? page * pageSize : pageSize
    const accountSkip = entryType === 'ALL' ? 0 : (page - 1) * pageSize
    const accounts = await prisma.practitionerAccount.findMany({
      where: accountWhere,
      include: {
        user: {
          select: {
            email: true,
            emailVerified: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: accountTake,
      skip: accountSkip,
    })

    accounts.forEach((account) => {
      entries.push({
        type: 'ACCOUNT',
        createdAt: account.createdAt,
        account: {
          id: account.id,
          userId: account.userId,
          contactEmail: account.contactEmail,
          createdAt: account.createdAt,
          userEmail: account.user?.email || null,
          emailVerified: !!account.user?.emailVerified,
        },
      })
    })
  }

  entries.sort((a, b) => {
    const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    if (diff !== 0) return diff
    const aId = a?.listing?.id || a?.account?.id || ''
    const bId = b?.listing?.id || b?.account?.id || ''
    return bId.localeCompare(aId)
  })
  let pagedEntries = entries
  if (entryType === 'ALL') {
    const start = (page - 1) * pageSize
    pagedEntries = entries.slice(start, start + pageSize)
  }

  return NextResponse.json({
    entries: pagedEntries,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  })
}
