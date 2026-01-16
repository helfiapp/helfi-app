import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { sendPractitionerRejectedEmail } from '@/lib/practitioner-emails'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const reason = String(body?.reason || '').trim()
  if (!reason) {
    return NextResponse.json({ error: 'Rejection reason is required.' }, { status: 400 })
  }

  const listing = await prisma.practitionerListing.findUnique({
    where: { id: params.id },
    include: { practitionerAccount: true },
  })

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }

  const updated = await prisma.practitionerListing.update({
    where: { id: listing.id },
    data: {
      status: 'REJECTED',
      visibilityReason: 'REJECTED',
      reviewStatus: 'REJECTED',
      reviewDecisionAt: new Date(),
      reviewedByAdminId: admin.adminId,
      reviewNotes: reason,
    },
  })

  await prisma.practitionerModerationLog.create({
    data: {
      listingId: listing.id,
      adminUserId: admin.adminId,
      action: 'REJECT',
      reason,
    },
  })

  const emailResult = await sendPractitionerRejectedEmail({
    practitionerAccountId: listing.practitionerAccountId,
    listingId: listing.id,
    toEmail: listing.practitionerAccount.contactEmail,
    displayName: listing.displayName,
    reason,
  })

  return NextResponse.json({
    listing: updated,
    emailSent: emailResult.ok,
    emailError: emailResult.ok ? null : emailResult.error || 'Email failed',
  })
}
