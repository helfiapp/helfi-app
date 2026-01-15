import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const UNIT_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  oz: 29.5735,
}

function normalizeUnit(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'liters' || raw === 'liter' || raw === 'l') return 'l'
  if (raw === 'milliliters' || raw === 'milliliter' || raw === 'ml') return 'ml'
  if (raw === 'ounces' || raw === 'ounce' || raw === 'oz') return 'oz'
  return null
}

function normalizeAmount(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (n <= 0) return null
  if (n > 10000) return null
  return Math.round(n * 100) / 100
}

function normalizeLabel(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const trimmed = raw.slice(0, 48)
  return trimmed || null
}

function normalizeCategory(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'snack') return 'snacks'
  if (raw === 'snacks') return 'snacks'
  if (raw === 'uncategorized') return 'uncategorized'
  if (raw === 'breakfast' || raw === 'lunch' || raw === 'dinner' || raw === 'other') return raw
  return null
}

function asLocalDate(value: unknown): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

function toMl(amount: number, unit: string): number {
  const factor = UNIT_TO_ML[unit] || 1
  return Math.round(amount * factor * 10) / 10
}

export async function DELETE(_req: NextRequest, context: { params: { id?: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const id = String(context?.params?.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const result = await prisma.waterLog.deleteMany({
      where: { id, userId: user.id },
    })
    if (!result.count) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[water-log] DELETE failed', error)
    return NextResponse.json({ error: 'Failed to delete water log' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: { params: { id?: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const id = String(context?.params?.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const body = await req.json().catch(() => ({} as any))
  const amount = normalizeAmount(body?.amount)
  const unit = normalizeUnit(body?.unit)
  if (amount == null || !unit) {
    return NextResponse.json({ error: 'Amount and unit are required' }, { status: 400 })
  }

  const label = Object.prototype.hasOwnProperty.call(body || {}, 'label') ? normalizeLabel(body?.label) : undefined
  const category = Object.prototype.hasOwnProperty.call(body || {}, 'category')
    ? normalizeCategory(body?.category)
    : undefined
  const localDate = Object.prototype.hasOwnProperty.call(body || {}, 'localDate') ? asLocalDate(body?.localDate) : null
  const amountMl = toMl(amount, unit)

  const data: any = {
    amount,
    unit,
    amountMl,
  }
  if (label !== undefined) data.label = label
  if (category !== undefined) data.category = category
  if (localDate) data.localDate = localDate

  try {
    const result = await prisma.waterLog.updateMany({
      where: { id, userId: user.id },
      data,
    })
    if (!result.count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const entry = await prisma.waterLog.findFirst({ where: { id, userId: user.id } })
    return NextResponse.json({ entry })
  } catch (error) {
    console.error('[water-log] PATCH failed', error)
    return NextResponse.json({ error: 'Failed to update water log' }, { status: 500 })
  }
}
