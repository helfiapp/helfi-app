import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { extractScopedBlobPath, mapToSignedBlobUrl } from '@/lib/blob-access'
import { del } from '@vercel/blob'

export const dynamic = 'force-dynamic'

const MOOD_MEDIA_SCOPE = 'mood-journal'
const MOOD_MEDIA_URL_TTL_SECONDS = 60 * 60

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

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

function asLocalDate(value: unknown): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
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

function mediaBlobPaths(value: unknown): string[] {
  const set = new Set<string>()
  for (const raw of coerceMediaList(value)) {
    const path = extractScopedBlobPath(raw, MOOD_MEDIA_SCOPE)
    if (path) set.add(path)
  }
  return Array.from(set)
}

async function deleteMoodMedia(paths: string[]) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return
  if (paths.length === 0) return
  const batches = chunk(Array.from(new Set(paths)), 100)
  for (const batch of batches) {
    if (!batch.length) continue
    await del(batch).catch((error) => {
      console.warn('mood journal media delete skipped', error)
    })
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  try {
    await ensureMoodTables()
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, localDate, title, content, images, tags, audio, prompt, template, createdAt, updatedAt
       FROM MoodJournalEntries
       WHERE userId = $1 AND id = $2`,
      user.id,
      params.id,
    )
    const entry = rows[0] ?? null
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({
      entry: {
        ...entry,
        images: mapSignedMedia(entry.images),
        audio: mapSignedMedia(entry.audio),
      },
    })
  } catch (e) {
    console.error('mood journal get entry error', e)
    return NextResponse.json({ error: 'Failed to load entry' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
    const existingRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT images, audio
       FROM MoodJournalEntries
       WHERE userId = $1 AND id = $2`,
      user.id,
      params.id,
    )
    const existing = existingRows[0] || null
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const beforePaths = new Set([
      ...mediaBlobPaths(existing.images),
      ...mediaBlobPaths(existing.audio),
    ])
    const nextPaths = new Set([...mediaBlobPaths(images), ...mediaBlobPaths(audio)])
    const removedPaths = Array.from(beforePaths).filter((path) => !nextPaths.has(path))

    const updated = await prisma.$executeRawUnsafe(
      `UPDATE MoodJournalEntries
       SET localDate = $1,
           title = $2,
           content = $3,
           images = $4::jsonb,
           tags = $5::jsonb,
           audio = $6::jsonb,
           prompt = $7,
           template = $8,
           updatedAt = NOW()
       WHERE userId = $9 AND id = $10`,
      localDate,
      title,
      content,
      JSON.stringify(images),
      JSON.stringify(tags),
      JSON.stringify(audio),
      prompt,
      template,
      user.id,
      params.id,
    )
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await deleteMoodMedia(removedPaths)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('mood journal update error', e)
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  try {
    await ensureMoodTables()
    const existingRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT images, audio
       FROM MoodJournalEntries
       WHERE userId = $1 AND id = $2`,
      user.id,
      params.id,
    )
    const existing = existingRows[0] || null
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const mediaToDelete = [
      ...mediaBlobPaths(existing.images),
      ...mediaBlobPaths(existing.audio),
    ]

    await prisma.$executeRawUnsafe(
      `DELETE FROM MoodJournalEntries WHERE userId = $1 AND id = $2`,
      user.id,
      params.id,
    )
    await deleteMoodMedia(mediaToDelete)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('mood journal delete error', e)
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }
}
