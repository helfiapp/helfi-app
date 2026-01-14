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

  const where: any = {}
  if (reviewStatus && reviewStatus !== 'ALL') {
    where.reviewStatus = reviewStatus
  }
  if (status && status !== 'ALL') {
    where.status = status
  }
  if (country) {
    where.country = country
  }
  if (query) {
    where.OR = [
      { displayName: { contains: query, mode: 'insensitive' } },
      { slug: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
      { practitionerAccount: { contactEmail: { contains: query, mode: 'insensitive' } } },
    ]
  }

  const listings = await prisma.practitionerListing.findMany({
    where,
    include: {
      practitionerAccount: true,
      category: true,
      subcategory: true,
      subscription: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ listings })
}
