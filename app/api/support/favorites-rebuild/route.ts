import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const IDENTITY_MARKER = '[SYSTEM] Identity verified'
const IDENTITY_MAX_AGE_MS = 24 * 60 * 60 * 1000

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const normalizeLabel = (value: string) => value.trim().toLowerCase()

const extractFavoriteLabel = (raw: string) => {
  const text = String(raw || '').trim()
  if (!text) return 'Favorite meal'
  const firstLine = text.split('\n')[0] || text
  const cleaned = firstLine.split('Calories:')[0].trim()
  return cleaned || firstLine.trim() || 'Favorite meal'
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

const buildFavoriteId = (seed: string) => `fav-${Date.now()}-${seed}`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const ticketId = String(body?.ticketId || '').trim()
    const email = normalizeEmail(String(body?.email || ''))
    const limitRaw = Number(body?.limit)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 50), 500) : 250

    if (!ticketId || !email) {
      return NextResponse.json({ error: 'Missing ticketId or email' }, { status: 400 })
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

    const existingGoal = await prisma.healthGoal.findFirst({
      where: { userId: user.id, name: '__FOOD_FAVORITES__' },
      orderBy: { createdAt: 'desc' },
    })
    const existingFavorites = parseFavoritesList(existingGoal?.category || null)

    // Backup the current favorites (best-effort).
    if (existingGoal?.category) {
      try {
        await prisma.healthGoal.create({
          data: {
            userId: user.id,
            name: `__FOOD_FAVORITES__BACKUP__${Date.now()}`,
            category: String(existingGoal.category),
            currentRating: 0,
          },
        })
      } catch {
        // best effort only
      }
    }

    const logs = await prisma.foodLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
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

    const seen = new Set<string>()
    const rebuilt: any[] = []

    for (const log of logs) {
      const description = String(log.description || log.name || '').trim()
      if (!description) continue
      const label = extractFavoriteLabel(description)
      const labelKey = normalizeLabel(label)
      const sourceId = String(log.id || '')
      const key = sourceId ? `src:${sourceId}` : `lbl:${labelKey}`
      if (!labelKey || seen.has(key)) continue

      const originRaw =
        (log.nutrients as any)?.__origin ||
        (log.nutrients as any)?.origin ||
        ''
      const origin = typeof originRaw === 'string' ? originRaw.toLowerCase().trim() : ''
      const items =
        Array.isArray(log.items) ? log.items : Array.isArray((log.nutrients as any)?.items) ? (log.nutrients as any)?.items : []
      const customMeal = shouldMarkCustom(items, origin)

      const favorite = {
        id: buildFavoriteId(Math.random().toString(16).slice(2)),
        sourceId,
        label,
        description: label,
        nutrition: log.nutrients || null,
        total: log.nutrients || null,
        items: Array.isArray(items) && items.length > 0 ? items : null,
        photo: log.imageUrl || null,
        method: customMeal ? (origin === 'combined' ? 'combined' : 'meal-builder') : origin || 'text',
        ...(customMeal ? { customMeal: true } : {}),
        meal: log.meal || log.category || 'uncategorized',
        createdAt: log.createdAt ? new Date(log.createdAt).getTime() : Date.now(),
      }

      rebuilt.push(favorite)
      seen.add(key)
    }

    const merged = (() => {
      const base = Array.isArray(existingFavorites) ? existingFavorites : []
      const mergedList: any[] = [...base]
      const keys = new Set<string>()
      base.forEach((fav: any) => {
        const src = fav?.sourceId ? String(fav.sourceId) : ''
        const lbl = normalizeLabel(String(fav?.label || fav?.description || ''))
        if (src) keys.add(`src:${src}`)
        if (lbl) keys.add(`lbl:${lbl}`)
      })
      rebuilt.forEach((fav) => {
        const src = fav?.sourceId ? String(fav.sourceId) : ''
        const lbl = normalizeLabel(String(fav?.label || fav?.description || ''))
        const keySrc = src ? `src:${src}` : ''
        const keyLbl = lbl ? `lbl:${lbl}` : ''
        if ((keySrc && keys.has(keySrc)) || (keyLbl && keys.has(keyLbl))) return
        if (keySrc) keys.add(keySrc)
        if (keyLbl) keys.add(keyLbl)
        mergedList.push(fav)
      })
      return mergedList
    })()

    const payload = JSON.stringify({ favorites: merged })
    const existingGoals = await prisma.healthGoal.findMany({
      where: { userId: user.id, name: '__FOOD_FAVORITES__' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    const primary = existingGoals[0] || null
    if (primary?.id) {
      await prisma.healthGoal.update({
        where: { id: primary.id },
        data: { category: payload, currentRating: 0 },
      })
      if (existingGoals.length > 1) {
        await prisma.healthGoal.deleteMany({
          where: { id: { in: existingGoals.slice(1).map((g) => g.id) } },
        })
      }
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
      rebuiltCount: rebuilt.length,
      totalFavorites: merged.length,
    })
  } catch (error) {
    console.error('POST /api/support/favorites-rebuild error', error)
    return NextResponse.json({ error: 'Rebuild failed' }, { status: 500 })
  }
}
