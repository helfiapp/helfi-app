import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const rangeDaysRaw = url.searchParams.get('rangeDays') || '30'
    const rangeDays = Math.max(1, Math.min(365, parseInt(rangeDaysRaw, 10) || 30))
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000)

    const [analysisCount, fallbackCount] = await Promise.all([
      prisma.aIUsageEvent.count({
        where: {
          feature: 'food:analysis',
          createdAt: { gte: since },
        },
      }),
      prisma.aIUsageEvent.count({
        where: {
          feature: 'food:image-analysis-fallback',
          createdAt: { gte: since },
        },
      }),
    ])

    const estimatedCallsPerAnalysis = 3
    const estimatedTotalServerCalls = analysisCount * estimatedCallsPerAnalysis

    return NextResponse.json({
      rangeDays,
      analysisCount,
      fallbackCount,
      estimatedCallsPerAnalysis,
      estimatedTotalServerCalls,
      note: 'Estimate assumes 1 analysis call + 1 save + 1 refresh per food analysis.',
    })
  } catch (error) {
    console.error('[admin food-analysis-usage] error', error)
    return NextResponse.json({ error: 'Failed to load food analysis usage' }, { status: 500 })
  }
}
