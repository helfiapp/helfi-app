import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { getPractitionerRecommendations } from '@/lib/practitioner-recommendations'

async function hasSignedInUser(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.email) return true

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
  }).catch(() => null)

  return Boolean(token?.email)
}

export async function POST(request: NextRequest) {
  const signedIn = await hasSignedInUser(request)
  if (!signedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const issueText = String(body?.issueText || '').trim()
  const lat = Number(body?.lat)
  const lng = Number(body?.lng)

  if (!issueText || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ results: [], radiusKm: 10, matchedIssues: [] })
  }

  const recommendations = await getPractitionerRecommendations({
    issueText,
    lat,
    lng,
    country: typeof body?.country === 'string' ? body.country : null,
    sourceArea: typeof body?.sourceArea === 'string' ? body.sourceArea : undefined,
    radiusKm: 10,
    maxRadiusKm: 15,
    limit: 3,
  })

  return NextResponse.json(recommendations)
}
