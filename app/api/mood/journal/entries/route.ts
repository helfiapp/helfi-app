import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { ensureMoodTables } from '@/app/api/mood/_db'

export const dynamic = 'force-dynamic'

function asLocalDate(value: unknown): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function normalizeImages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const cleaned: string[] = []
  for (const raw of value) {
    const url = String(raw ?? '').trim()
    if (!url) continue
    cleaned.push(url)
    if (cleaned.length >= 12) break
  }
  return cleaned
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const start = asLocalDate(searchParams.get('start'))
  const end = asLocalDate(searchParams.get('end'))
  const limit = clampInt(searchParams.get('limit'), 1, 100, 20)

  try {
    await ensureMoodTables()
    let rows: any[] = []
    if (start && end) {
      rows = await prisma.$queryRawUnsafe(
        `SELECT id, localDate, title, content, images, createdAt, updatedAt
         FROM MoodJournalEntries
         WHERE userId = $1 AND localDate BETWEEN $2 AND $3
         ORDER BY createdAt DESC`,
        user.id,
        start,
        end,
      )
    } else {
      rows = await prisma.$queryRawUnsafe(
        `SELECT id, localDate, title, content, images, createdAt, updatedAt
         FROM MoodJournalEntries
         WHERE userId = $1
         ORDER BY createdAt DESC
         LIMIT $2`,
        user.id,
        limit,
      )
    }
    return NextResponse.json({ entries: rows })
  } catch (e) {
    console.error('mood journal get error', e)
    return NextResponse.json({ error: 'Failed to load journal entries' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => ({} as any))
  const title = String(body?.title ?? '').trim().slice(0, 120)
  const content = String(body?.content ?? '').trim().slice(0, 20000)
  const images = normalizeImages(body?.images)
  const localDate = asLocalDate(body?.localDate) ?? new Date().toISOString().slice(0, 10)

  if (!title && !content && images.length === 0) {
    return NextResponse.json({ error: 'Entry is empty' }, { status: 400 })
  }

  try {
    await ensureMoodTables()
    const id = crypto.randomUUID()
    await prisma.$queryRawUnsafe(
      `INSERT INTO MoodJournalEntries (id, userId, localDate, title, content, images)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      id,
      user.id,
      localDate,
      title,
      content,
      JSON.stringify(images),
    )
    return NextResponse.json({ success: true, id })
  } catch (e) {
    console.error('mood journal save error', e)
    return NextResponse.json({ error: 'Failed to save journal entry' }, { status: 500 })
  }
}
