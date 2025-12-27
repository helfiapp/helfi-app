import { NextRequest, NextResponse } from 'next/server'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FOOD_MODEL_GOAL_NAME = '__FOOD_ANALYZER_MODEL__'
const DEFAULT_MODEL = (process.env.OPENAI_FOOD_MODEL || 'gpt-5.2').trim()
const ALLOWED_MODELS = new Set(['gpt-4o', 'gpt-5.2'])

const normalizeEmail = (raw: string) => raw.trim().toLowerCase()

const parseModelFromGoalCategory = (category: unknown): string | null => {
  if (typeof category !== 'string' || !category.trim()) return null
  try {
    const parsed = JSON.parse(category)
    const model = typeof parsed?.model === 'string' ? parsed.model.trim() : ''
    return model || null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const userEmailRaw = searchParams.get('userEmail') || ''
    const userEmail = userEmailRaw ? normalizeEmail(userEmailRaw) : ''
    if (!userEmail) return NextResponse.json({ error: 'Missing userEmail' }, { status: 400 })

    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, email: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const goal = await prisma.healthGoal.findFirst({
      where: { userId: user.id, name: FOOD_MODEL_GOAL_NAME },
      select: { id: true, category: true, updatedAt: true },
    })
    const override = goal ? parseModelFromGoalCategory(goal.category) : null
    const overrideModel = override && ALLOWED_MODELS.has(override) ? override : null

    return NextResponse.json({
      success: true,
      userEmail: user.email,
      defaultModel: DEFAULT_MODEL,
      overrideModel,
      effectiveModel: overrideModel || DEFAULT_MODEL,
      allowedModels: Array.from(ALLOWED_MODELS),
      updatedAt: goal?.updatedAt?.toISOString?.() || null,
    })
  } catch (err) {
    console.error('[admin food-analyzer-model] GET error', err)
    return NextResponse.json({ error: 'Failed to load food analyzer model' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({} as any))
    const userEmailRaw = typeof body?.userEmail === 'string' ? body.userEmail : ''
    const userEmail = userEmailRaw ? normalizeEmail(userEmailRaw) : ''
    const modelRaw = typeof body?.model === 'string' ? body.model.trim() : ''
    const model = modelRaw === '' || modelRaw === 'default' ? null : modelRaw

    if (!userEmail) return NextResponse.json({ error: 'Missing userEmail' }, { status: 400 })
    if (model !== null && !ALLOWED_MODELS.has(model)) {
      return NextResponse.json({ error: `Unsupported model: ${model}` }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, email: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const existing = await prisma.healthGoal.findFirst({
      where: { userId: user.id, name: FOOD_MODEL_GOAL_NAME },
      select: { id: true },
    })

    if (model === null) {
      if (existing?.id) {
        await prisma.healthGoal.delete({ where: { id: existing.id } })
      }
      return NextResponse.json({
        success: true,
        userEmail: user.email,
        defaultModel: DEFAULT_MODEL,
        overrideModel: null,
        effectiveModel: DEFAULT_MODEL,
      })
    }

    const payload = JSON.stringify({ model })
    if (existing?.id) {
      await prisma.healthGoal.update({
        where: { id: existing.id },
        data: { category: payload, currentRating: 0 },
      })
    } else {
      await prisma.healthGoal.create({
        data: {
          userId: user.id,
          name: FOOD_MODEL_GOAL_NAME,
          category: payload,
          currentRating: 0,
        },
      })
    }

    return NextResponse.json({
      success: true,
      userEmail: user.email,
      defaultModel: DEFAULT_MODEL,
      overrideModel: model,
      effectiveModel: model,
    })
  } catch (err) {
    console.error('[admin food-analyzer-model] POST error', err)
    return NextResponse.json({ error: 'Failed to update food analyzer model' }, { status: 500 })
  }
}
