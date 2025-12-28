import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function ensureServerCallLogTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ServerCallLog" (
      id TEXT PRIMARY KEY,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      feature TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      kind TEXT NOT NULL
    )
  `)
}

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

    await ensureServerCallLogTable()

    const rows = await prisma.$queryRawUnsafe<
      Array<{ feature: string; kind: string; count: number }>
    >(
      `SELECT feature, kind, COUNT(*)::int AS count
       FROM "ServerCallLog"
       WHERE "createdAt" >= $1
       GROUP BY feature, kind`,
      since
    )

    const summary: Record<
      string,
      { feature: string; analysisCalls: number; totalCalls: number; extraCalls: number; callsPerAnalysis: number | null }
    > = {}

    for (const row of rows) {
      const feature = row.feature || 'unknown'
      if (!summary[feature]) {
        summary[feature] = {
          feature,
          analysisCalls: 0,
          totalCalls: 0,
          extraCalls: 0,
          callsPerAnalysis: null,
        }
      }
      summary[feature].totalCalls += row.count
      if (row.kind === 'analysis') {
        summary[feature].analysisCalls += row.count
      }
    }

    const features = Object.values(summary)
      .map((item) => {
        const analysisCalls = item.analysisCalls
        const totalCalls = item.totalCalls
        const extraCalls = Math.max(0, totalCalls - analysisCalls)
        const callsPerAnalysis = analysisCalls > 0 ? totalCalls / analysisCalls : null
        return {
          feature: item.feature,
          analysisCalls,
          totalCalls,
          extraCalls,
          callsPerAnalysis,
        }
      })
      .sort((a, b) => {
        if (a.callsPerAnalysis == null && b.callsPerAnalysis == null) return 0
        if (a.callsPerAnalysis == null) return 1
        if (b.callsPerAnalysis == null) return -1
        return b.callsPerAnalysis - a.callsPerAnalysis
      })

    return NextResponse.json({
      rangeDays,
      features,
      note: 'Calls are tracked when analysis endpoints and credit meters are hit with a feature tag.',
    })
  } catch (error) {
    console.error('[admin server-call-usage] error', error)
    return NextResponse.json({ error: 'Failed to load server call usage' }, { status: 500 })
  }
}
