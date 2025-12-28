import { prisma } from '@/lib/prisma'

const buckets = new Map<string, number[]>()
let rateLimitTableReady = false
let rateLimitInitPromise: Promise<void> | null = null
let lastCleanupAt = 0
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
const RETENTION_MS = 24 * 60 * 60 * 1000

export type RateLimitResult = {
  allowed: boolean
  retryAfterMs: number
}

const ensureRateLimitTable = async () => {
  if (rateLimitTableReady) return
  if (rateLimitInitPromise) {
    await rateLimitInitPromise
    return
  }
  rateLimitInitPromise = prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
      "scope" TEXT NOT NULL,
      "rateKey" TEXT NOT NULL,
      "windowStart" BIGINT NOT NULL,
      "count" INTEGER NOT NULL DEFAULT 0,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("scope", "rateKey", "windowStart")
    );
    CREATE INDEX IF NOT EXISTS "RateLimitBucket_updatedAt_idx" ON "RateLimitBucket" ("updatedAt");
  `)
    .then(() => {
      rateLimitTableReady = true
    })
    .catch((error) => {
      console.error('Rate limit table init failed:', error)
    })
  await rateLimitInitPromise
}

const consumeRateLimitMemory = (
  scope: string,
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult => {
  const now = Date.now()
  const bucketKey = `${scope}:${key}`
  const existing = buckets.get(bucketKey) || []
  const recent = existing.filter((ts) => now - ts < windowMs)

  if (recent.length >= limit) {
    const oldest = recent[0]
    const retryAfterMs = windowMs - (now - oldest)
    buckets.set(bucketKey, recent)
    return { allowed: false, retryAfterMs }
  }

  recent.push(now)
  buckets.set(bucketKey, recent)
  return { allowed: true, retryAfterMs: 0 }
}

/**
 * Durable rate limiter backed by the database.
 * Falls back to in-memory checks if the database is unavailable.
 */
export async function consumeRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now()
  try {
    await ensureRateLimitTable()

    const windowStart = Math.floor(now / windowMs) * windowMs
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitBucket" ("scope", "rateKey", "windowStart", "count", "updatedAt")
      VALUES (${scope}, ${key}, ${windowStart}, 1, NOW())
      ON CONFLICT ("scope", "rateKey", "windowStart")
      DO UPDATE SET "count" = "RateLimitBucket"."count" + 1, "updatedAt" = NOW()
      RETURNING "count"
    `
    const rawCount = rows?.[0]?.count ?? 1
    const count = typeof rawCount === 'bigint' ? Number(rawCount) : Number(rawCount)
    if (count > limit) {
      const retryAfterMs = Math.max(0, windowStart + windowMs - now)
      return { allowed: false, retryAfterMs }
    }

    if (now - lastCleanupAt > CLEANUP_INTERVAL_MS) {
      lastCleanupAt = now
      const cutoff = now - RETENTION_MS
      await prisma.$executeRawUnsafe(
        'DELETE FROM "RateLimitBucket" WHERE "windowStart" < $1',
        cutoff
      )
    }

    return { allowed: true, retryAfterMs: 0 }
  } catch (error) {
    console.error('Rate limit fallback to memory:', error)
    return consumeRateLimitMemory(scope, key, limit, windowMs)
  }
}
