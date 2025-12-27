import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { createUniqueAffiliateCode } from '@/lib/affiliate-code'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get('status')?.toUpperCase() || null

  const applications = await prisma.affiliateApplication.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      userId: true,
      email: true,
      name: true,
      website: true,
      primaryChannel: true,
      primaryChannelOther: true,
      audienceSize: true,
      termsVersion: true,
      termsAcceptedAt: true,
      promotionMethod: true,
      notes: true,
      ip: true,
      userAgent: true,
      country: true,
      region: true,
      city: true,
      riskLevel: true,
      recommendation: true,
      aiReasoning: true,
      status: true,
      autoApproved: true,
      reviewedAt: true,
      reviewedByAdminId: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ ok: true, applications })
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const applicationId = String(body?.applicationId || '')
  const action = String(body?.action || '').toLowerCase()
  if (!applicationId) return NextResponse.json({ error: 'applicationId is required' }, { status: 400 })
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  const application = await prisma.affiliateApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, userId: true },
  })
  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  if (!application.userId) return NextResponse.json({ error: 'Application missing userId' }, { status: 400 })

  if (action === 'reject') {
    await prisma.affiliateApplication.update({
      where: { id: applicationId },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedByAdminId: admin?.adminId || null,
        autoApproved: false,
      },
    })
    return NextResponse.json({ ok: true, status: 'REJECTED' })
  }

  const existingAffiliate = await prisma.affiliate.findUnique({
    where: { userId: application.userId },
    select: { id: true, code: true, status: true },
  })
  if (existingAffiliate) {
    await prisma.affiliateApplication.update({
      where: { id: applicationId },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedByAdminId: admin?.adminId || null,
        autoApproved: false,
      },
    })
    return NextResponse.json({ ok: true, status: 'APPROVED', affiliate: existingAffiliate })
  }

  const code = await createUniqueAffiliateCode()
  const affiliate = await prisma.affiliate.create({
    data: { userId: application.userId, applicationId, code, status: 'ACTIVE' },
    select: { id: true, code: true, status: true },
  })

  await prisma.affiliateApplication.update({
    where: { id: applicationId },
    data: {
      status: 'APPROVED',
      reviewedAt: new Date(),
      reviewedByAdminId: admin?.adminId || null,
      autoApproved: false,
    },
  })

  return NextResponse.json({ ok: true, status: 'APPROVED', affiliate })
}
