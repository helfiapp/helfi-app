import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const rating = Number(body?.rating)
    const scope = String(body?.scope || '').toLowerCase()
    const scanId = typeof body?.analysisId === 'string' ? body.analysisId : null
    const analysisMode = typeof body?.analysisMode === 'string' ? body.analysisMode : null
    const analysisHint = typeof body?.analysisHint === 'string' ? body.analysisHint : null

    if (!Number.isFinite(rating) || ![1, -1].includes(rating)) {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
    }
    if (scope !== 'overall' && scope !== 'item') {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
    }

    const reasons = Array.isArray(body?.reasons)
      ? body.reasons.map((r: any) => String(r || '')).filter(Boolean)
      : []

    const comment = typeof body?.comment === 'string' ? body.comment.trim() : null
    const itemIndex = Number.isFinite(Number(body?.itemIndex)) ? Number(body.itemIndex) : null
    const itemName = typeof body?.itemName === 'string' ? body.itemName.trim() : null
    const itemServingSize = typeof body?.itemServingSize === 'string' ? body.itemServingSize.trim() : null
    const itemBrand = typeof body?.itemBrand === 'string' ? body.itemBrand.trim() : null

    await prisma.foodAnalysisFeedback.create({
      data: {
        userId: session.user.id,
        scanId,
        analysisMode,
        analysisHint,
        scope,
        rating,
        reasons: reasons.length ? reasons : null,
        comment: comment && comment.length ? comment : null,
        itemIndex,
        itemName,
        itemServingSize,
        itemBrand,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('food-analysis-feedback error', error)
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
  }
}
