import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  if (String(body?.confirm || '').trim() !== 'DELETE') {
    return NextResponse.json({ error: 'Confirmation text is required.' }, { status: 400 })
  }

  const listing = await prisma.practitionerListing.findUnique({
    where: { id: params.id },
  })

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }

  await prisma.practitionerListing.delete({
    where: { id: listing.id },
  })

  await prisma.practitionerModerationLog.create({
    data: {
      listingId: listing.id,
      adminUserId: admin.adminId,
      action: 'DELETE',
      reason: 'Deleted by admin',
    },
  })

  return NextResponse.json({ ok: true })
}
