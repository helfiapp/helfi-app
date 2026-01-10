import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const UNIT_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  oz: 29.5735,
}

function asLocalDate(value: unknown): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10)
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

function toMl(amount: number, unit: string): number {
  const factor = UNIT_TO_ML[unit] || 1
  return Math.round(amount * factor * 10) / 10
}

async function ensureWaterLogTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WaterLog" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "unit" TEXT NOT NULL,
      "amountMl" DOUBLE PRECISION NOT NULL,
      "label" TEXT,
      "localDate" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WaterLog_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "WaterLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE INDEX IF NOT EXISTS "WaterLog_userId_localDate_idx" ON "WaterLog"("userId", "localDate");
    CREATE INDEX IF NOT EXISTS "WaterLog_userId_createdAt_idx" ON "WaterLog"("userId", "createdAt");
  `)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const localDate = asLocalDate(searchParams.get('localDate'))
  const start = asLocalDate(searchParams.get('start'))
  const end = asLocalDate(searchParams.get('end'))

  const where: any = { userId: user.id }
  if (localDate) {
    where.localDate = localDate
  } else if (start || end) {
    where.localDate = {}
    if (start) where.localDate.gte = start
    if (end) where.localDate.lte = end
  } else {
    where.localDate = todayLocalDate()
  }

  try {
    const entries = await prisma.waterLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ entries })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      try {
        await ensureWaterLogTable()
        const entries = await prisma.waterLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        })
        return NextResponse.json({ entries })
      } catch (retryError) {
        console.error('[water-log] GET failed after ensure', retryError)
      }
    }
    console.error('[water-log] GET failed', error)
    return NextResponse.json({ error: 'Failed to load water logs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => ({} as any))
  const amount = normalizeAmount(body?.amount)
  const unit = normalizeUnit(body?.unit)
  if (amount == null || !unit) {
    return NextResponse.json({ error: 'Amount and unit are required' }, { status: 400 })
  }

  const localDate = asLocalDate(body?.localDate) ?? todayLocalDate()
  const label = normalizeLabel(body?.label)
  const amountMl = toMl(amount, unit)

  try {
    const entry = await prisma.waterLog.create({
      data: {
        userId: user.id,
        amount,
        unit,
        amountMl,
        label,
        localDate,
      },
    })
    return NextResponse.json({ entry })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      try {
        await ensureWaterLogTable()
        const entry = await prisma.waterLog.create({
          data: {
            userId: user.id,
            amount,
            unit,
            amountMl,
            label,
            localDate,
          },
        })
        return NextResponse.json({ entry })
      } catch (retryError) {
        console.error('[water-log] POST failed after ensure', retryError)
      }
    }
    console.error('[water-log] POST failed', error)
    return NextResponse.json({ error: 'Failed to save water log' }, { status: 500 })
  }
}
