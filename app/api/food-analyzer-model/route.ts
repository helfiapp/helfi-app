import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FOOD_MODEL_GOAL_NAME = '__FOOD_ANALYZER_MODEL__'
const ALLOWED_MODELS = new Set(['gpt-4o', 'gpt-5.2'])

function normalizeModel(model: unknown): string | null {
  if (typeof model !== 'string') return null
  const trimmed = model.trim()
  if (!trimmed) return null
  if (ALLOWED_MODELS.has(trimmed)) return trimmed
  return null
}

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  let session = await getServerSession(authOptions)
  let userEmail: string | null = session?.user?.email ?? null

  if (!userEmail) {
    try {
      const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
      })
      if (token?.email) userEmail = String(token.email)
    } catch {
      // ignore
    }
  }

  if (!userEmail) return null
  const user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } })
  return user?.id || null
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthedUserId(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await prisma.healthGoal.findFirst({
      where: { userId, name: FOOD_MODEL_GOAL_NAME },
      select: { id: true, category: true },
    })

    let model: string | null = null
    if (existing?.category) {
      try {
        const parsed = JSON.parse(existing.category)
        model = normalizeModel(parsed?.model)
      } catch {}
    }

    return NextResponse.json({
      model: model || 'gpt-5.2',
      source: model ? 'user_override' : 'default',
    })
  } catch (err) {
    console.error('[food-analyzer-model] GET error', err)
    return NextResponse.json({ error: 'Failed to load model' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthedUserId(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const model = normalizeModel(body?.model)
    if (!model) {
      return NextResponse.json({ error: 'Invalid model (use gpt-4o or gpt-5.2)' }, { status: 400 })
    }

    const payload = JSON.stringify({ model })
    const existing = await prisma.healthGoal.findFirst({
      where: { userId, name: FOOD_MODEL_GOAL_NAME },
      select: { id: true },
    })

    if (existing?.id) {
      await prisma.healthGoal.update({
        where: { id: existing.id },
        data: { category: payload, currentRating: 0 },
      })
    } else {
      await prisma.healthGoal.create({
        data: {
          userId,
          name: FOOD_MODEL_GOAL_NAME,
          category: payload,
          currentRating: 0,
        },
      })
    }

    return NextResponse.json({ ok: true, model })
  } catch (err) {
    console.error('[food-analyzer-model] POST error', err)
    return NextResponse.json({ error: 'Failed to save model' }, { status: 500 })
  }
}
