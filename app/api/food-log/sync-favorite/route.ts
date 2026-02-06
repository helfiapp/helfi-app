import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { triggerBackgroundRegeneration } from '@/lib/insights/regeneration-service'

const normalizeDate = (value: any): string | null => {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (datePattern.test(trimmed)) return trimmed
  try {
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear()
      const m = String(parsed.getMonth() + 1).padStart(2, '0')
      const d = String(parsed.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
  } catch {}
  return null
}

const deriveLocalDate = (log: any) => {
  const raw = typeof log?.localDate === 'string' ? log.localDate.trim() : ''
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  try {
    const createdAt = log?.createdAt ? new Date(log.createdAt) : null
    if (!createdAt || Number.isNaN(createdAt.getTime())) return ''
    const y = createdAt.getFullYear()
    const m = String(createdAt.getMonth() + 1).padStart(2, '0')
    const d = String(createdAt.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  } catch {
    return ''
  }
}

const normalizeFavoriteId = (value: any): string => {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw
}

const buildEntryName = (description: any, fallback?: string | null) => {
  const raw = (description || fallback || '').toString()
  const name = raw
    .split('\n')[0]
    .split('Calories:')[0]
    .split(',')[0]
    .split('.')[0]
    .trim()
  return name || fallback || 'Food item'
}

const normalizeDescription = (value: any) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const buildItemsSignature = (items: any[] | null | undefined) => {
  if (!Array.isArray(items) || items.length === 0) return ''
  const parts = items.map((it) => {
    const id = typeof it?.id === 'string' ? it.id : ''
    const name = String(it?.name || it?.label || '').trim().toLowerCase()
    const amount = Number.isFinite(Number(it?.weightAmount))
      ? String(Math.round(Number(it.weightAmount) * 1000) / 1000)
      : Number.isFinite(Number(it?.amount))
      ? String(Math.round(Number(it.amount) * 1000) / 1000)
      : ''
    const unit = typeof it?.weightUnit === 'string' ? it.weightUnit : typeof it?.unit === 'string' ? it.unit : ''
    const serving = String(it?.serving_size || '').trim().toLowerCase()
    return [id, name, amount, unit, serving].filter(Boolean).join('~')
  })
  return parts.filter(Boolean).sort().join('|')
}

const extractTotalsSignature = (totals: any) => {
  if (!totals || typeof totals !== 'object') return null
  const toNumber = (value: any) => {
    const parsed = typeof value === 'string' ? parseFloat(value) : Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return {
    calories: toNumber((totals as any).calories),
    protein: toNumber((totals as any).protein ?? (totals as any).protein_g),
    carbs: toNumber((totals as any).carbs ?? (totals as any).carbs_g),
    fat: toNumber((totals as any).fat ?? (totals as any).fat_g),
    fiber: toNumber((totals as any).fiber ?? (totals as any).fiber_g),
    sugar: toNumber((totals as any).sugar ?? (totals as any).sugar_g),
  }
}

const totalsMatch = (left: any, right: any) => {
  const a = extractTotalsSignature(left)
  const b = extractTotalsSignature(right)
  if (!a || !b) return false
  const within = (x: number | null, y: number | null, tolerance: number) => {
    if (x === null || y === null) return false
    return Math.abs(x - y) <= tolerance
  }
  return (
    within(a.calories, b.calories, 2) &&
    within(a.protein, b.protein, 0.2) &&
    within(a.carbs, b.carbs, 0.2) &&
    within(a.fat, b.fat, 0.2)
  )
}

const getMetaFavoriteId = (nutrients: any) => {
  if (!nutrients || typeof nutrients !== 'object') return ''
  const raw = (nutrients as any).__favoriteId
  return typeof raw === 'string' ? raw.trim() : ''
}

const isManualEdited = (nutrients: any) => {
  if (!nutrients || typeof nutrients !== 'object') return false
  return Boolean((nutrients as any).__favoriteManualEdit)
}

const mergeNutritionMeta = (base: any, existing: any, favoriteId: string) => {
  if (!base || typeof base !== 'object') return existing || base
  const next: any = { ...(base as any) }
  if (existing && typeof existing === 'object') {
    for (const [key, value] of Object.entries(existing)) {
      if (!key.startsWith('__')) continue
      if (key === '__favoriteManualEdit') continue
      if (typeof next[key] === 'undefined') {
        next[key] = value
      }
    }
  }
  if (favoriteId) next.__favoriteId = favoriteId
  if (favoriteId) next.__favoriteManualEdit = false
  return next
}

export async function POST(request: NextRequest) {
  try {
    let session = await getServerSession(authOptions)
    let userEmail: string | null = session?.user?.email ?? null

    if (!userEmail) {
      try {
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) {
          userEmail = String(token.email)
        }
      } catch {}
    }

    if (!userEmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({} as any))
    const favoriteId = normalizeFavoriteId(body?.favoriteId)
    const localDate = normalizeDate(body?.localDate)
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    const nutrition = body?.nutrition ?? body?.total ?? null
    const items = body?.items
    const previousDescription = typeof body?.previousDescription === 'string' ? body.previousDescription.trim() : ''
    const previousItemsSignature = typeof body?.previousItemsSignature === 'string' ? body.previousItemsSignature.trim() : ''
    const previousTotals = body?.previousTotals ?? null
    const candidateLogId = typeof body?.candidateLogId === 'string' ? body.candidateLogId.trim() : ''

    if (!favoriteId || !localDate) {
      return NextResponse.json({ error: 'Missing favoriteId or localDate' }, { status: 400 })
    }

    const logWhere: any = {
      userId: user.id,
      OR: [{ localDate }, { localDate: null }],
    }
    if (candidateLogId) {
      logWhere.OR.push({ id: candidateLogId })
    }
    const logs = await prisma.foodLog.findMany({
      where: logWhere,
      orderBy: { createdAt: 'asc' },
    })

    const updatedIds: string[] = []
    const normalizedPreviousDescription = normalizeDescription(previousDescription)
    for (const log of logs) {
      const existingNutrition = (log as any)?.nutrients || null
      const existingFavoriteId = getMetaFavoriteId(existingNutrition)
      if (isManualEdited(existingNutrition)) continue
      const rawItems = (log as any)?.items || (existingNutrition as any)?.items || null
      const logItemsSignature = buildItemsSignature(rawItems)
      const logDescription = normalizeDescription(log.description || log.name || '')
      const logTotals = existingNutrition || null
      const totalsMatchLegacy = previousTotals ? totalsMatch(logTotals, previousTotals) : false
      const candidateMatch =
        candidateLogId && String(log.id) === candidateLogId ? deriveLocalDate(log) === localDate : false
      const legacyMatch =
        !existingFavoriteId &&
        normalizedPreviousDescription &&
        logDescription === normalizedPreviousDescription &&
        ((previousItemsSignature && logItemsSignature === previousItemsSignature) || totalsMatchLegacy)
      const directMatch = existingFavoriteId && existingFavoriteId === favoriteId
      if (!candidateMatch && !directMatch && !legacyMatch) continue
      if (!candidateMatch && previousItemsSignature && logItemsSignature && logItemsSignature !== previousItemsSignature && !totalsMatchLegacy) continue

      const resolvedDescription = description || log.description || log.name || ''
      const name = buildEntryName(resolvedDescription, log.name)
      const nextNutrition = mergeNutritionMeta(nutrition, existingNutrition, favoriteId)
      const data: any = {
        name,
        description: resolvedDescription || null,
        nutrients: nextNutrition || null,
      }
      if (Array.isArray(items)) {
        data.items = items.length > 0 ? items : Prisma.JsonNull
      }

      await prisma.foodLog.update({
        where: { id: log.id },
        data,
      })
      updatedIds.push(log.id)
    }

    if (updatedIds.length > 0) {
      triggerBackgroundRegeneration({
        userId: user.id,
        changeType: 'food',
        timestamp: new Date(),
      }).catch((error) => {
        console.warn('⚠️ Failed to trigger nutrition insights regeneration after favorite sync', error)
      })
    }

    return NextResponse.json({ success: true, updatedCount: updatedIds.length, updatedIds })
  } catch (error) {
    console.error('❌ POST /api/food-log/sync-favorite - Error:', error)
    return NextResponse.json({ error: 'Failed to sync favorite' }, { status: 500 })
  }
}
