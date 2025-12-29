import { NextRequest, NextResponse } from 'next/server'
import { del, list } from '@vercel/blob'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FOOD_PHOTO_PREFIX = 'food-photos/'

const getRetentionDays = () => {
  const raw = Number(process.env.FOOD_PHOTO_RETENTION_DAYS || 90)
  if (!Number.isFinite(raw) || raw < 1) return 90
  return Math.min(Math.round(raw), 3650)
}

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

export async function GET(request: NextRequest) {
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null
  const authHeader = request.headers.get('authorization')
  const expected = process.env.FOOD_PHOTO_CLEANUP_SECRET || process.env.SCHEDULER_SECRET

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

  try {
    do {
      const result: Awaited<ReturnType<typeof list>> = await list({
        prefix: FOOD_PHOTO_PREFIX,
        limit: 1000,
        cursor,
      })
      cursor = result.cursor
      const expiredTargets = result.blobs
        .filter((blob) => {
          scanned += 1
          return blob.uploadedAt.getTime() < cutoffMs
        })
        .map((blob) => ({
          path: blob.pathname,
          url: blob.url,
        }))

      const uniquePaths = Array.from(new Set(expiredTargets.map((item) => item.path)))
      const batches = chunk(uniquePaths, 100)
      for (const batch of batches) {
        if (batch.length === 0) continue
        await del(batch)
        const batchSet = new Set(batch)
        const urlsForBatch = expiredTargets
          .filter((item) => batchSet.has(item.path))
          .map((item) => item.url)
        await prisma.foodLog.updateMany({
          where: {
            OR: [
              { imageUrl: { in: batch } },
              { imageUrl: { in: urlsForBatch } },
            ],
          },
          data: { imageUrl: null },
        })
        deleted += batch.length
      }
    } while (cursor)

    return NextResponse.json({
      ok: true,
      scanned,
      deleted,
      retentionDays,
    })
  } catch (error) {
    console.error('❌ Food photo cleanup failed', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
