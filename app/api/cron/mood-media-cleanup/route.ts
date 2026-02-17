import { NextRequest, NextResponse } from 'next/server'
import { del, list } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { extractScopedBlobPath } from '@/lib/blob-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MOOD_MEDIA_PREFIX = 'mood-journal/'

const getRetentionDays = () => {
  const raw = Number(process.env.MOOD_MEDIA_RETENTION_DAYS || 1)
  if (!Number.isFinite(raw) || raw < 1) return 1
  return Math.min(Math.round(raw), 3650)
}

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

const coerceMediaList = (value: unknown): string[] => {
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

const pruneDeletedMedia = (value: unknown, deletedPaths: Set<string>) => {
  const original = coerceMediaList(value)
  if (original.length === 0) return { list: [], removed: 0, changed: false }

  let removed = 0
  const kept: string[] = []
  for (const media of original) {
    const path = extractScopedBlobPath(media, 'mood-journal')
    if (path && deletedPaths.has(path)) {
      removed += 1
      continue
    }
    kept.push(media)
  }

  const changed = removed > 0 || kept.length !== original.length
  return { list: kept, removed, changed }
}

export async function GET(request: NextRequest) {
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null
  const authHeader = request.headers.get('authorization')
  const expected = process.env.MOOD_MEDIA_CLEANUP_SECRET || process.env.SCHEDULER_SECRET

  if (!(isVercelCron || (expected && authHeader === `Bearer ${expected}`))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Blob storage not configured' }, { status: 500 })
  }

  const retentionDays = getRetentionDays()
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000

  let cursor: string | undefined = undefined
  let scanned = 0
  let deleted = 0

  const expiredTargets: Array<{ path: string; url: string }> = []

  try {
    do {
      const result: Awaited<ReturnType<typeof list>> = await list({
        prefix: MOOD_MEDIA_PREFIX,
        limit: 1000,
        cursor,
      })

      cursor = result.cursor
      for (const blob of result.blobs) {
        scanned += 1
        if (blob.uploadedAt.getTime() < cutoffMs) {
          expiredTargets.push({ path: blob.pathname, url: blob.url })
        }
      }
    } while (cursor)

    const uniquePaths = Array.from(new Set(expiredTargets.map((item) => item.path)))
    const batches = chunk(uniquePaths, 100)
    for (const batch of batches) {
      if (!batch.length) continue
      await del(batch)
      deleted += batch.length
    }

    await ensureMoodTables()

    const deletedPaths = new Set(uniquePaths)
    let entriesUpdated = 0
    let mediaRefsCleared = 0

    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; images: unknown; audio: unknown }>>(
      'SELECT id, images, audio FROM MoodJournalEntries',
    )

    for (const row of rows) {
      const imageState = pruneDeletedMedia(row.images, deletedPaths)
      const audioState = pruneDeletedMedia(row.audio, deletedPaths)
      if (!imageState.changed && !audioState.changed) continue

      await prisma.$executeRawUnsafe(
        `UPDATE MoodJournalEntries
         SET images = $1::jsonb,
             audio = $2::jsonb,
             updatedAt = NOW()
         WHERE id = $3`,
        JSON.stringify(imageState.list),
        JSON.stringify(audioState.list),
        row.id,
      )
      entriesUpdated += 1
      mediaRefsCleared += imageState.removed + audioState.removed
    }

    return NextResponse.json({
      ok: true,
      scanned,
      deleted,
      retentionDays,
      entriesUpdated,
      mediaRefsCleared,
    })
  } catch (error) {
    console.error('mood media cleanup failed', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
