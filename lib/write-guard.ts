import { PrismaClient } from '@prisma/client'
import { createHash, randomUUID } from 'crypto'

export type WriteGuardResult = {
  skip: boolean
  hitCount: number
  lastRecordId?: string | null
}

type WriteGuardInput = {
  ownerKey: string
  scope: string
  payloadHash: string
  windowMs: number
}

const sortValue = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(sortValue)
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc: Record<string, any>, key) => {
        acc[key] = sortValue(value[key])
        return acc
      }, {})
  }
  return value
}

export const hashPayload = (value: any) => {
  try {
    const stable = sortValue(value)
    const json = JSON.stringify(stable) || ''
    return createHash('sha256').update(json).digest('hex')
  } catch {
    return ''
  }
}

export const createWriteGuard = (prisma: PrismaClient) => {
  let writeGuardReady = false

  const ensureWriteGuardTable = async () => {
    if (writeGuardReady) return
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS WriteGuard (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          scope TEXT NOT NULL,
          payloadHash TEXT NOT NULL,
          lastSeenAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          hitCount INTEGER NOT NULL DEFAULT 1,
          lastRecordId TEXT
        )
      `)
      await prisma.$executeRawUnsafe(
        'ALTER TABLE WriteGuard ADD COLUMN IF NOT EXISTS lastRecordId TEXT'
      ).catch(() => {})
      await prisma.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS writeguard_user_scope_uq ON WriteGuard (userId, scope)'
      ).catch(() => {})
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS writeguard_lastseen_idx ON WriteGuard (lastSeenAt DESC)'
      ).catch(() => {})
      writeGuardReady = true
    } catch (error) {
      console.warn('[write-guard] Failed to ensure table', error)
    }
  }

  const readGuard = async ({
    ownerKey,
    scope,
    payloadHash,
    windowMs,
  }: WriteGuardInput): Promise<WriteGuardResult> => {
    if (!ownerKey || !scope || !payloadHash) return { skip: false, hitCount: 0 }
    await ensureWriteGuardTable()
    try {
      const rows: any[] = await prisma.$queryRawUnsafe(
        'SELECT id, payloadHash, lastSeenAt, hitCount, lastRecordId FROM WriteGuard WHERE userId = $1 AND scope = $2',
        ownerKey,
        scope
      )
      const existing = rows?.[0]
      const now = Date.now()
      if (existing && existing.payloadHash === payloadHash) {
        const lastSeenAt = existing.lastSeenAt ? new Date(existing.lastSeenAt).getTime() : 0
        if (lastSeenAt && now - lastSeenAt < windowMs) {
          await prisma.$queryRawUnsafe(
            'UPDATE WriteGuard SET lastSeenAt = NOW(), hitCount = hitCount + 1 WHERE id = $1',
            existing.id
          )
          return {
            skip: true,
            hitCount: Number(existing.hitCount || 0) + 1,
            lastRecordId: existing.lastRecordId || null,
          }
        }
      }

      if (existing?.id) {
        await prisma.$queryRawUnsafe(
          'UPDATE WriteGuard SET payloadHash = $1, lastSeenAt = NOW(), hitCount = 1 WHERE id = $2',
          payloadHash,
          existing.id
        )
      } else {
        const id = randomUUID()
        await prisma.$queryRawUnsafe(
          `INSERT INTO WriteGuard (id, userId, scope, payloadHash, lastSeenAt, hitCount)
           VALUES ($1, $2, $3, $4, NOW(), 1)
           ON CONFLICT (userId, scope)
           DO UPDATE SET payloadHash = EXCLUDED.payloadHash, lastSeenAt = EXCLUDED.lastSeenAt, hitCount = 1`,
          id,
          ownerKey,
          scope,
          payloadHash
        )
      }
    } catch (error) {
      console.warn('[write-guard] Failed to check guard', error)
      return { skip: false, hitCount: 0 }
    }

    return { skip: false, hitCount: 1 }
  }

  const recordWrite = async (options: {
    ownerKey: string
    scope: string
    payloadHash: string
    recordId?: string | null
  }) => {
    if (!options.ownerKey || !options.scope || !options.payloadHash) return
    await ensureWriteGuardTable()
    try {
      await prisma.$queryRawUnsafe(
        `INSERT INTO WriteGuard (id, userId, scope, payloadHash, lastSeenAt, hitCount, lastRecordId)
         VALUES ($1, $2, $3, $4, NOW(), 1, $5)
         ON CONFLICT (userId, scope)
         DO UPDATE SET payloadHash = EXCLUDED.payloadHash,
                       lastSeenAt = EXCLUDED.lastSeenAt,
                       hitCount = 1,
                       lastRecordId = EXCLUDED.lastRecordId`,
        randomUUID(),
        options.ownerKey,
        options.scope,
        options.payloadHash,
        options.recordId || null
      )
    } catch (error) {
      console.warn('[write-guard] Failed to record write', error)
    }
  }

  return { readGuard, recordWrite }
}
