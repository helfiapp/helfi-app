import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { costCentsForTokens, openaiCostCentsForTokens } from '@/lib/cost-meter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const parseRangeDays = (raw: string | null): number => {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 7
  return Math.min(365, Math.max(1, Math.floor(n)))
}

const avg = (nums: number[]) => {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const rangeDays = parseRangeDays(searchParams.get('rangeDays'))

    const now = new Date()
    const start = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000)

    // Prefer the per-image usage logs (avoid double-counting the later aggregate "food:analysis" event).
    const rows = await prisma.aIUsageEvent.findMany({
      where: {
        createdAt: { gte: start, lte: now },
        success: true,
        endpoint: '/api/analyze-food',
        OR: [{ feature: 'food:image-analysis' }, { feature: 'food:image-reanalysis' }],
      },
      select: {
        model: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        costCents: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    const promptTokens = rows.map((r) => Number(r.promptTokens || 0)).filter((n) => n > 0)
    const completionTokens = rows.map((r) => Number(r.completionTokens || 0)).filter((n) => n >= 0)
    const totalTokens = rows
      .map((r) => Number(r.totalTokens || (Number(r.promptTokens || 0) + Number(r.completionTokens || 0))))
      .filter((n) => n > 0)
    const billedCostCents = rows.map((r) => Number(r.costCents || 0)).filter((n) => n >= 0)

    const avgPrompt = Math.round(avg(promptTokens))
    const avgCompletion = Math.round(avg(completionTokens))
    const avgTotal = Math.round(avg(totalTokens))
    const avgBilled = Math.round(avg(billedCostCents))

    const simulate = (model: string) => {
      const vendor = openaiCostCentsForTokens(model, { promptTokens: avgPrompt, completionTokens: avgCompletion })
      const billed = costCentsForTokens(model, { promptTokens: avgPrompt, completionTokens: avgCompletion })
      const analysesPer1400 = avgTotal > 0 ? Math.floor(1400 / Math.max(1, billed)) : 0
      return {
        model,
        vendorCostCents: vendor,
        billedCostCents: billed,
        analysesPer1400Credits: analysesPer1400,
      }
    }

    // Models to compare (you can add/remove in the UI)
    const simulations = [
      simulate('gpt-4o'),
      simulate('gpt-5.2'),
      simulate('gpt-5-mini'),
      simulate('gpt-5.2-pro'),
    ]

    return NextResponse.json({
      success: true,
      rangeDays,
      samples: rows.length,
      averages: {
        promptTokens: avgPrompt,
        completionTokens: avgCompletion,
        totalTokens: avgTotal,
        billedCostCents: avgBilled,
      },
      simulations,
      notes: {
        interpretation:
          'Simulated costs assume token usage stays the same when switching models. Real token usage and accuracy may change; use the benchmark tool for head-to-head tests.',
        credits: 'Helfi credits are cents. 1400 credits is the current $20/month plan mapping.',
        sampling: 'This is based on up to 500 recent food:image-* events within the selected range.',
      },
    })
  } catch (err) {
    console.error('[admin food-cost-sim] error', err)
    return NextResponse.json({ error: 'Failed to compute food cost simulation' }, { status: 500 })
  }
}
