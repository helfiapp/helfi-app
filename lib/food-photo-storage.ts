import { del } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import { extractBlobPathWithPrefixes } from '@/lib/blob-paths'

const FOOD_PHOTO_PREFIX = 'food-photos/'
const FOOD_PHOTO_PREFIXES = [FOOD_PHOTO_PREFIX]

const normalizeFoodPhotoPath = (value: string) =>
  extractBlobPathWithPrefixes(value, FOOD_PHOTO_PREFIXES)

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

  const parsed = urls
    .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
    .map((url) => {
      const trimmed = url.trim()
      return {
        raw: trimmed,
        path: normalizeFoodPhotoPath(trimmed),
      }
    })
    .filter((item) => item.path)

  const candidates = Array.from(new Set(parsed.map((item) => item.path!)))

  if (candidates.length === 0) return { deleted: 0, skipped: 0 }

  const usageKeys = Array.from(
    new Set(parsed.flatMap((item) => (item.raw ? [item.raw, item.path!] : [item.path!]))),
  )
  const stillUsed = await prisma.foodLog.findMany({
    where: { imageUrl: { in: usageKeys } },
    select: { imageUrl: true },
  })
  const stillUsedSet = new Set(
    stillUsed.map((row) => row.imageUrl).filter((url): url is string => typeof url === 'string'),
  )
  for (const value of stillUsedSet) {
    const path = normalizeFoodPhotoPath(value)
    if (path) stillUsedSet.add(path)
  }

  const toDelete = candidates.filter((path) => !stillUsedSet.has(path))
  if (toDelete.length === 0) return { deleted: 0, skipped: candidates.length }

  const batches = chunk(toDelete, 100)
  for (const batch of batches) {
    if (batch.length === 0) continue
    await del(batch)
  }

  return { deleted: toDelete.length, skipped: candidates.length - toDelete.length }
}
