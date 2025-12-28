import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

type ServerCallKind = 'analysis' | 'credit_status' | 'feature_usage' | 'other'

let ensured = false

async function ensureServerCallLogTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ServerCallLog" (
      id TEXT PRIMARY KEY,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      feature TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      kind TEXT NOT NULL
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ServerCallLog_createdAt_idx" ON "ServerCallLog" ("createdAt")
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ServerCallLog_feature_idx" ON "ServerCallLog" (feature)
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ServerCallLog_kind_idx" ON "ServerCallLog" (kind)
  `)
}

export async function logServerCall(options: {
  feature: string
  endpoint: string
  kind: ServerCallKind
}) {
  const feature = String(options.feature || '').trim()
  if (!feature) return
  try {
    if (!ensured) {
      await ensureServerCallLogTable()
      ensured = true
    }
    const id = crypto.randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ServerCallLog" (id, feature, endpoint, kind) VALUES ($1, $2, $3, $4)`,
      id,
      feature,
      options.endpoint,
      options.kind
    )
  } catch (error) {
    console.error('❌ Failed to log server call:', error)
  }
}
