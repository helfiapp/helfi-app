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

    const label = labelRaw.trim()
    const labelKey = normalizeText(label)

    const existingGoal = await prisma.healthGoal.findFirst({
      where: { userId: user.id, name: '__FOOD_FAVORITES__' },
      orderBy: { createdAt: 'desc' },
    })
    const existingFavorites = parseFavoritesList(existingGoal?.category || null)

    const existingMatch = existingFavorites.find((fav: any) => {
      const favLabel = normalizeText(String(fav?.label || fav?.description || ''))
      return favLabel && favLabel === labelKey
    })
    if (existingMatch) {
      return NextResponse.json({ success: true, alreadyExists: true, label })
    }

    const favorite = {
      id: buildFavoriteId(Math.random().toString(16).slice(2)),
      sourceId: null,
      label,
      description: label,
      nutrition: null,
      total: null,
      items: null,
      photo: null,
      method: 'meal-builder',
      customMeal: true,
      meal: 'uncategorized',
      createdAt: Date.now(),
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

    return NextResponse.json({ success: true, label })
  } catch (error) {
    console.error('POST /api/support/favorite-create error', error)
    return NextResponse.json({ error: 'Create failed' }, { status: 500 })
  }
}
