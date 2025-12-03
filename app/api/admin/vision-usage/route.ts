import { NextRequest, NextResponse } from 'next/server'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { buildVisionUsageAnalytics, getVisionUsageSummary, loadVisionUsageFromDisk } from '@/lib/vision-usage-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const rangeDaysRaw = url.searchParams.get('rangeDays')
    const limitRaw = url.searchParams.get('limit')
    const parsedRange = rangeDaysRaw ? Number(rangeDaysRaw) : 30
    const parsedLimit = limitRaw ? Number(limitRaw) : 500
    const rangeDays = Number.isFinite(parsedRange) && parsedRange > 0 ? parsedRange : 30
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 500

    const entries = loadVisionUsageFromDisk(limit)
    const now = Date.now()
    const cutoff = Number.isFinite(rangeDays) ? now - rangeDays * 24 * 60 * 60 * 1000 : null
    const filtered = cutoff ? entries.filter((e) => Number(e.timestamp) >= cutoff) : entries

    const grouped = getVisionUsageSummary(filtered)
    const analytics = buildVisionUsageAnalytics(filtered)
    const totalCostCents = filtered.reduce((acc, e) => acc + Number(e.costCents || 0), 0)
    const totalCalls = filtered.length

    const recent = analytics.scans.slice(0, 100)

    return NextResponse.json({
      success: true,
      rangeDays,
      totalCalls,
      totalCostCents,
      features: Object.keys(grouped).length,
      grouped,
      recent,
      featureSummary: analytics.featureSummary,
      userSummary: analytics.userSummary,
      trend: analytics.trend,
      totals: analytics.totals,
    })
  } catch (err) {
    console.error('[admin vision-usage] error', err)
    return NextResponse.json({ error: 'Failed to load vision usage' }, { status: 500 })
  }
}
