import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const IDENTITY_MARKER = '[SYSTEM] Identity verified'
const IDENTITY_MAX_AGE_MS = 24 * 60 * 60 * 1000

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const extractFavoriteLabel = (raw: string) => {
  const text = String(raw || '').trim()
  if (!text) return 'Favorite meal'
  const firstLine = text.split('\n')[0] || text
  const cleaned = firstLine.split('Calories:')[0].trim()
  return cleaned || firstLine.trim() || 'Favorite meal'
}

const parseFavoritesList = (category: string | null) => {
  if (!category) return []
  try {
    const parsed = JSON.parse(category)
    if (Array.isArray(parsed?.favorites)) return parsed.favorites
    if (Array.isArray(parsed)) return parsed
    return []
  } catch {
    return []
  }
}

const looksLikeMealBuilderCreatedItemId = (rawId: any) => {
  const id = typeof rawId === 'string' ? rawId : ''
  if (!id) return false
  if (/^(openfoodfacts|usda|fatsecret):[^:]+:\d{9,}$/i.test(id)) return true
  if (/^ai:\d{9,}:[0-9a-f]+$/i.test(id)) return true
  if (/^edit:\d{9,}:[0-9a-f]+$/i.test(id)) return true
  return false
}

const shouldMarkCustom = (items: any[], origin: string) => {
  if (origin === 'meal-builder' || origin === 'combined') return true
  return items.some((item) => looksLikeMealBuilderCreatedItemId(item?.id))
}

const buildFavoriteId = (seed: string) => `fav-${Date.now()}-${seed}`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const ticketId = String(body?.ticketId || '').trim()
    const email = normalizeEmail(String(body?.email || ''))
    const labelRaw = String(body?.label || '').trim()

    if (!ticketId || !email || !labelRaw) {
      return NextResponse.json({ error: 'Missing ticketId, email, or label' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, userEmail: email },
      include: { responses: { orderBy: { createdAt: 'desc' } } },
    })
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const identity = (ticket.responses || []).find(
      (response) =>
        response.isAdminResponse &&
        typeof response.message === 'string' &&
        response.message.startsWith(IDENTITY_MARKER),
    )
    if (!identity) {
      return NextResponse.json({ error: 'Identity not verified' }, { status: 403 })
    }
    const identityAge = Date.now() - new Date(identity.createdAt).getTime()
    if (!Number.isFinite(identityAge) || identityAge > IDENTITY_MAX_AGE_MS) {
      return NextResponse.json({ error: 'Identity check expired' }, { status: 403 })
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const desiredLabel = extractFavoriteLabel(labelRaw)
    const desiredText = normalizeText(desiredLabel)
    const desiredTokens = desiredText.split(' ').filter((token) => token.length > 2)

    const logs = await prisma.foodLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 800,
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        nutrients: true,
        items: true,
        meal: true,
        category: true,
        createdAt: true,
      },
    })

    const candidates = logs
      .map((log) => {
        const text = String(log.description || log.name || '').trim()
        if (!text) return null
        const normalized = normalizeText(text)
        if (!normalized) return null
        const hits = desiredTokens.length
          ? desiredTokens.filter((token) => normalized.includes(token)).length
          : normalized.includes(desiredText)
          ? 1
          : 0
        if (hits === 0) return null
        const originRaw =
          (log.nutrients as any)?.__origin ||
          (log.nutrients as any)?.origin ||
          ''
        const origin = typeof originRaw === 'string' ? originRaw.toLowerCase().trim() : ''
        const items =
          Array.isArray(log.items)
            ? log.items
            : Array.isArray((log.nutrients as any)?.items)
            ? (log.nutrients as any)?.items
            : []
        const customMeal = shouldMarkCustom(items, origin)
        return {
          log,
          hits,
          customMeal,
        }
      })
      .filter(Boolean) as Array<{ log: any; hits: number; customMeal: boolean }>

    const best = candidates.sort((a, b) => {
      if (a.customMeal !== b.customMeal) return a.customMeal ? -1 : 1
      if (a.hits !== b.hits) return b.hits - a.hits
      return new Date(b.log.createdAt).getTime() - new Date(a.log.createdAt).getTime()
    })[0]

    if (!best) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    const log = best.log
    const originRaw =
      (log.nutrients as any)?.__origin ||
      (log.nutrients as any)?.origin ||
      ''
    const origin = typeof originRaw === 'string' ? originRaw.toLowerCase().trim() : ''
    const items =
      Array.isArray(log.items)
        ? log.items
        : Array.isArray((log.nutrients as any)?.items)
        ? (log.nutrients as any)?.items
        : []
    const customMeal = shouldMarkCustom(items, origin)

    const favorite = {
      id: buildFavoriteId(Math.random().toString(16).slice(2)),
      sourceId: String(log.id || ''),
      label: desiredLabel,
      description: desiredLabel,
      nutrition: log.nutrients || null,
      total: log.nutrients || null,
      items: Array.isArray(items) && items.length > 0 ? items : null,
      photo: log.imageUrl || null,
      method: customMeal ? (origin === 'combined' ? 'combined' : 'meal-builder') : origin || 'text',
      ...(customMeal ? { customMeal: true } : {}),
      meal: log.meal || log.category || 'uncategorized',
      createdAt: log.createdAt ? new Date(log.createdAt).getTime() : Date.now(),
    }

    const existingGoal = await prisma.healthGoal.findFirst({
      where: { userId: user.id, name: '__FOOD_FAVORITES__' },
      orderBy: { createdAt: 'desc' },
    })
    const existingFavorites = parseFavoritesList(existingGoal?.category || null)

    const existingMatch = existingFavorites.find((fav: any) => {
      const favSource = fav?.sourceId ? String(fav.sourceId) : ''
      if (favSource && favSource === favorite.sourceId) return true
      const favLabel = normalizeText(String(fav?.label || fav?.description || ''))
      return favLabel && favLabel === normalizeText(desiredLabel)
    })
    if (existingMatch) {
      return NextResponse.json({ success: true, alreadyExists: true, label: desiredLabel })
    }

    const merged = [...existingFavorites, favorite]
    const payload = JSON.stringify({ favorites: merged })

    if (existingGoal?.id) {
      await prisma.healthGoal.update({
        where: { id: existingGoal.id },
        data: { category: payload, currentRating: 0 },
      })
    } else {
      await prisma.healthGoal.create({
        data: {
          userId: user.id,
          name: '__FOOD_FAVORITES__',
          category: payload,
          currentRating: 0,
        },
      })
    }

    return NextResponse.json({
      success: true,
      label: desiredLabel,
      customMeal,
    })
  } catch (error) {
    console.error('POST /api/support/favorite-restore error', error)
    return NextResponse.json({ error: 'Restore failed' }, { status: 500 })
  }
}
