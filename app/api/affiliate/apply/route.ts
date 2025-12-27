import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { screenAffiliateApplication } from '@/lib/affiliate-screening'
import { notifyAdminAffiliateManualReview } from '@/lib/affiliate-admin-email'
import { createUniqueAffiliateCode } from '@/lib/affiliate-code'
import { getAffiliateUser } from '@/lib/affiliate-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AFFILIATE_TERMS_VERSION = '2025-12-22'

function getClientIp(request: NextRequest): string | null {
  const header = request.headers.get('x-forwarded-for')
  if (!header) return null
  const first = header.split(',')[0]?.trim()
  return first || null
}

export async function POST(request: NextRequest) {
  const user = await getAffiliateUser(request)
  const email = user?.email?.toLowerCase()
  if (!email || !user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const name = String(body?.name || '').trim()
  const website = body?.website ? String(body.website).trim() : null
  const primaryChannel = String(body?.primaryChannel || '').trim()
  const primaryChannelOther = body?.primaryChannelOther ? String(body.primaryChannelOther).trim() : null
  const audienceSize = body?.audienceSize ? String(body.audienceSize).trim() : null
  const termsAccepted = Boolean(body?.termsAccepted)
  const termsVersion = String(body?.termsVersion || '').trim()
  const promotionMethod = String(body?.promotionMethod || '').trim()
  const notes = body?.notes ? String(body.notes).trim() : null

  if (!name || name.length < 2) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!termsAccepted || termsVersion !== AFFILIATE_TERMS_VERSION) {
    return NextResponse.json({ error: 'You must accept the affiliate terms to apply' }, { status: 400 })
  }
  if (!primaryChannel) {
    return NextResponse.json({ error: 'Primary promotion channel is required' }, { status: 400 })
  }
  const allowedChannels = new Set([
    'WEBSITE',
    'YOUTUBE',
    'SOCIAL',
    'NEWSLETTER',
    'PODCAST',
    'COMMUNITY',
    'PAID_ADS',
    'OTHER',
  ])
  if (!allowedChannels.has(primaryChannel)) {
    return NextResponse.json({ error: 'Invalid promotion channel' }, { status: 400 })
  }
  if (primaryChannel === 'OTHER') {
    if (!primaryChannelOther || primaryChannelOther.length < 2) {
      return NextResponse.json({ error: 'Please specify the other channel' }, { status: 400 })
    }
  }
  const allowedAudienceSizes = new Set([
    'UNDER_1K',
    '1K_10K',
    '10K_50K',
    '50K_250K',
    '250K_PLUS',
    'UNKNOWN',
  ])
  if (audienceSize && !allowedAudienceSizes.has(audienceSize)) {
    return NextResponse.json({ error: 'Invalid audience size' }, { status: 400 })
  }
  if (!promotionMethod || promotionMethod.length < 10) {
    return NextResponse.json({ error: 'Promotion method must be at least 10 characters' }, { status: 400 })
  }

  const existingAffiliate = await prisma.affiliate.findFirst({
    where: { user: { email } },
    select: { id: true, code: true, status: true },
  })
  if (existingAffiliate) {
    return NextResponse.json({ ok: true, alreadyAffiliate: true, affiliate: existingAffiliate })
  }

  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent')
  const country = request.headers.get('cf-ipcountry') || null
  const region = request.headers.get('x-vercel-ip-country-region') || null
  const city = request.headers.get('x-vercel-ip-city') || null

  const application = await prisma.affiliateApplication.create({
    data: {
      userId: user.id,
      email,
      name,
      website,
      primaryChannel,
      primaryChannelOther,
      audienceSize,
      termsVersion,
      termsAcceptedAt: new Date(),
      promotionMethod,
      notes,
      ip,
      userAgent,
      country,
      region,
      city,
    },
    select: { id: true },
  })

  const screening = await screenAffiliateApplication({
    email,
    name,
    website,
    primaryChannel,
    primaryChannelOther,
    audienceSize,
    promotionMethod,
    notes,
    ip,
    userAgent,
    country,
    region,
    city,
  })

  const isLowAutoApprove = screening.riskLevel === 'LOW' && screening.recommendedAction === 'AUTO_APPROVE'

  await prisma.affiliateApplication.update({
    where: { id: application.id },
    data: {
      riskLevel: screening.riskLevel,
      recommendation: screening.recommendedAction,
      aiReasoning: screening.reasoning,
      aiRawJson: screening.raw ?? null,
      status: isLowAutoApprove ? 'APPROVED' : 'PENDING_REVIEW',
      autoApproved: isLowAutoApprove,
      reviewedAt: isLowAutoApprove ? new Date() : null,
    },
  })

  if (!isLowAutoApprove && (screening.riskLevel === 'MEDIUM' || screening.riskLevel === 'HIGH')) {
    const ownerEmail = process.env.OWNER_EMAIL
    if (ownerEmail) {
      notifyAdminAffiliateManualReview({
        toEmail: ownerEmail,
        applicationId: application.id,
        applicantEmail: email,
        applicantName: name,
        riskLevel: screening.riskLevel,
        reasoning: screening.reasoning,
      }).catch(() => {})
    }
  }

  if (!isLowAutoApprove) {
    return NextResponse.json({
      ok: true,
      status: 'PENDING_REVIEW',
      applicationId: application.id,
      screening: {
        riskLevel: screening.riskLevel,
        recommendedAction: screening.recommendedAction,
      },
    })
  }

  const code = await createUniqueAffiliateCode()
  const affiliate = await prisma.affiliate.create({
    data: {
      userId: user.id,
      applicationId: application.id,
      code,
      status: 'ACTIVE',
    },
    select: { id: true, code: true, status: true },
  })

  return NextResponse.json({
    ok: true,
    status: 'APPROVED',
    affiliate,
  })
}
