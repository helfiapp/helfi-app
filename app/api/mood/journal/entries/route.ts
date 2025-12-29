import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { extractScopedBlobPath, mapToSignedBlobUrl } from '@/lib/blob-access'

export const dynamic = 'force-dynamic'

const MOOD_MEDIA_SCOPE = 'mood-journal'
const MOOD_MEDIA_URL_TTL_SECONDS = 60 * 60

function coerceMediaList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry ?? '').trim()).filter(Boolean)
      }
    } catch {
      return [trimmed]
    }
  }
  return []
}

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

function normalizeMediaList(value: unknown): string[] {
  const cleaned: string[] = []
  for (const raw of coerceMediaList(value)) {
    const url = String(raw ?? '').trim()
    if (!url) continue
    const blobPath = extractScopedBlobPath(url, MOOD_MEDIA_SCOPE)
    cleaned.push(blobPath || url)
    if (cleaned.length >= 12) break
  }
  return cleaned
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const tags: string[] = []
  for (const raw of value) {
    const tag = String(raw ?? '').trim()
    if (!tag) continue
    tags.push(tag.slice(0, 24))
    if (tags.length >= 12) break
  }
  return tags
}

function normalizeText(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

function mapSignedMedia(value: unknown): string[] {
  const result: string[] = []
  for (const raw of coerceMediaList(value)) {
    const url = String(raw ?? '').trim()
    if (!url) continue
    const signed = mapToSignedBlobUrl(url, MOOD_MEDIA_SCOPE, MOOD_MEDIA_URL_TTL_SECONDS)
    result.push(signed || url)
    if (result.length >= 12) break
  }
  return result
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
  const q = String(searchParams.get('q') ?? '').trim()

  try {
    await ensureMoodTables()
    let rows: any[] = []
    if (start && end) {
      rows = await prisma.$queryRawUnsafe(
        `SELECT id, localDate, title, content, images, tags, audio, prompt, template, createdAt, updatedAt
         FROM MoodJournalEntries
         WHERE userId = $1 AND localDate BETWEEN $2 AND $3
         ORDER BY createdAt DESC`,
        user.id,
        start,
        end,
      )
    } else if (q) {
      rows = await prisma.$queryRawUnsafe(
        `SELECT id, localDate, title, content, images, tags, audio, prompt, template, createdAt, updatedAt
         FROM MoodJournalEntries
         WHERE userId = $1 AND (title ILIKE $2 OR content ILIKE $2)
         ORDER BY createdAt DESC
         LIMIT $3`,
        user.id,
        `%${q}%`,
        limit,
      )
    } else {
      rows = await prisma.$queryRawUnsafe(
        `SELECT id, localDate, title, content, images, tags, audio, prompt, template, createdAt, updatedAt
         FROM MoodJournalEntries
         WHERE userId = $1
         ORDER BY createdAt DESC
         LIMIT $2`,
        user.id,
        limit,
      )
    }
    const entries = rows.map((entry) => ({
      ...entry,
      images: mapSignedMedia(entry.images),
      audio: mapSignedMedia(entry.audio),
    }))
    return NextResponse.json({ entries })
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
  const title = normalizeText(body?.title, 120)
  const content = normalizeText(body?.content, 20000)
  const images = normalizeMediaList(body?.images)
  const tags = normalizeTags(body?.tags)
  const audio = normalizeMediaList(body?.audio)
  const prompt = normalizeText(body?.prompt, 200)
  const template = normalizeText(body?.template, 200)
  const localDate = asLocalDate(body?.localDate) ?? new Date().toISOString().slice(0, 10)

  if (!title && !content && images.length === 0 && audio.length === 0) {
    return NextResponse.json({ error: 'Entry is empty' }, { status: 400 })
  }

  try {
    await ensureMoodTables()
    const id = crypto.randomUUID()
    await prisma.$queryRawUnsafe(
      `INSERT INTO MoodJournalEntries (id, userId, localDate, title, content, images, tags, audio, prompt, template)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)`,
      id,
      user.id,
      localDate,
      title,
      content,
      JSON.stringify(images),
      JSON.stringify(tags),
      JSON.stringify(audio),
      prompt,
      template,
    )
    return NextResponse.json({ success: true, id })
  } catch (e) {
    console.error('mood journal save error', e)
    return NextResponse.json({ error: 'Failed to save journal entry' }, { status: 500 })
  }
}
