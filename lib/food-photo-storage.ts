import { del } from '@vercel/blob'
import { prisma } from '@/lib/prisma'

const FOOD_PHOTO_PREFIX = 'food-photos/'
const BLOB_HOST = 'blob.vercel-storage.com'

const isFoodPhotoBlobUrl = (value: string) =>
  typeof value === 'string' &&
  value.includes(BLOB_HOST) &&
  value.includes(`/${FOOD_PHOTO_PREFIX}`)

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

export const deleteFoodPhotosIfUnused = async (
  urls: Array<string | null | undefined>,
) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { deleted: 0, skipped: 0 }

  const candidates = Array.from(
    new Set(
      urls
        .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
        .map((url) => url.trim())
        .filter(isFoodPhotoBlobUrl),
    ),
  )

  if (candidates.length === 0) return { deleted: 0, skipped: 0 }

  const stillUsed = await prisma.foodLog.findMany({
    where: { imageUrl: { in: candidates } },
    select: { imageUrl: true },
  })
  const stillUsedSet = new Set(
    stillUsed.map((row) => row.imageUrl).filter((url): url is string => typeof url === 'string'),
  )

  const toDelete = candidates.filter((url) => !stillUsedSet.has(url))
  if (toDelete.length === 0) return { deleted: 0, skipped: candidates.length }

  const batches = chunk(toDelete, 100)
  for (const batch of batches) {
    if (batch.length === 0) continue
    await del(batch)
  }

  return { deleted: toDelete.length, skipped: candidates.length - toDelete.length }
}
