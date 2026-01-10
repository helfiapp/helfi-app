import { prisma } from '@/lib/prisma'

let tablesEnsured = false

export async function ensureSymptomChatTables(): Promise<void> {
  if (tablesEnsured) return
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "SymptomChatThread" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "title" TEXT, "context" JSONB, "archivedAt" TIMESTAMPTZ, "lastChargedCost" INTEGER, "lastChargedAt" TIMESTAMPTZ, "lastChargeCovered" BOOLEAN, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "SymptomChatThread" ADD COLUMN IF NOT EXISTS "context" JSONB'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "SymptomChatThread" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "SymptomChatThread" ADD COLUMN IF NOT EXISTS "lastChargedCost" INTEGER'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "SymptomChatThread" ADD COLUMN IF NOT EXISTS "lastChargedAt" TIMESTAMPTZ'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "SymptomChatThread" ADD COLUMN IF NOT EXISTS "lastChargeCovered" BOOLEAN'
    )
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "SymptomChatMessage" ("id" TEXT PRIMARY KEY, "threadId" TEXT NOT NULL, "role" TEXT NOT NULL, "content" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT "SymptomChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "SymptomChatThread"("id") ON DELETE CASCADE)'
    )
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "SymptomChatMessage_threadId_createdAt_idx" ON "SymptomChatMessage" ("threadId", "createdAt")'
    )
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "SymptomChatThread_user_idx" ON "SymptomChatThread" ("userId")'
    )
    tablesEnsured = true
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[symptom-chat] Failed to ensure tables', error)
  }
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export type ChatThread = {
  id: string
  title: string | null
  archivedAt: string | null
  lastChargedCost: number | null
  lastChargedAt: string | null
  lastChargeCovered: boolean | null
  createdAt: string
  updatedAt: string
}

export type ChatContext = {
  symptoms?: string[]
  duration?: string | null
  notes?: string | null
  analysisResult?: any
}

export async function listThreads(userId: string): Promise<ChatThread[]> {
  await ensureSymptomChatTables()
  const rows: Array<{
    id: string
    title: string | null
    archivedAt: Date | null
    lastChargedCost: number | null
    lastChargedAt: Date | null
    lastChargeCovered: boolean | null
    createdAt: Date
    updatedAt: Date
  }> = await prisma.$queryRawUnsafe(
    'SELECT "id","title","archivedAt","lastChargedCost","lastChargedAt","lastChargeCovered","createdAt","updatedAt" FROM "SymptomChatThread" WHERE "userId" = $1 ORDER BY "updatedAt" DESC LIMIT 50',
    userId
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
    lastChargedCost: r.lastChargedCost ?? null,
    lastChargedAt: r.lastChargedAt ? r.lastChargedAt.toISOString() : null,
    lastChargeCovered: r.lastChargeCovered ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
}

export async function createThread(userId: string, context?: ChatContext, title?: string): Promise<{ id: string }> {
  await ensureSymptomChatTables()
  const id = uuid()
  await prisma.$executeRawUnsafe(
    'INSERT INTO "SymptomChatThread" ("id","userId","title","context") VALUES ($1,$2,$3,$4)',
    id,
    userId,
    title || null,
    context ? JSON.stringify(context) : null
  )
  return { id }
}

export async function getThread(userId: string, threadId: string): Promise<{ id: string; title: string | null; context: ChatContext | null } | null> {
  await ensureSymptomChatTables()
  const rows: Array<{ id: string; title: string | null; context: any }> = await prisma.$queryRawUnsafe(
    'SELECT "id","title","context" FROM "SymptomChatThread" WHERE "id" = $1 AND "userId" = $2 LIMIT 1',
    threadId,
    userId
  )
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    context: row.context ? (row.context as ChatContext) : null,
  }
}

export async function updateThreadTitle(userId: string, threadId: string, title: string): Promise<void> {
  await ensureSymptomChatTables()
  await prisma.$executeRawUnsafe(
    'UPDATE "SymptomChatThread" SET "title" = $1, "updatedAt" = NOW() WHERE "id" = $2 AND "userId" = $3',
    title,
    threadId,
    userId
  )
}

export async function updateThreadArchived(userId: string, threadId: string, archived: boolean): Promise<void> {
  await ensureSymptomChatTables()
  await prisma.$executeRawUnsafe(
    'UPDATE "SymptomChatThread" SET "archivedAt" = $1, "updatedAt" = NOW() WHERE "id" = $2 AND "userId" = $3',
    archived ? new Date() : null,
    threadId,
    userId
  )
}

export async function updateThreadCost(userId: string, threadId: string, cost: number, covered: boolean): Promise<void> {
  await ensureSymptomChatTables()
  await prisma.$executeRawUnsafe(
    'UPDATE "SymptomChatThread" SET "lastChargedCost" = $1, "lastChargedAt" = NOW(), "lastChargeCovered" = $2, "updatedAt" = NOW() WHERE "id" = $3 AND "userId" = $4',
    Math.round(cost),
    covered,
    threadId,
    userId
  )
}

export async function updateThreadContext(userId: string, threadId: string, context: ChatContext): Promise<void> {
  await ensureSymptomChatTables()
  await prisma.$executeRawUnsafe(
    'UPDATE "SymptomChatThread" SET "context" = $1, "updatedAt" = NOW() WHERE "id" = $2 AND "userId" = $3',
    JSON.stringify(context),
    threadId,
    userId
  )
}

export async function deleteThread(userId: string, threadId: string): Promise<void> {
  await ensureSymptomChatTables()
  await prisma.$executeRawUnsafe(
    'DELETE FROM "SymptomChatThread" WHERE "id" = $1 AND "userId" = $2',
    threadId,
    userId
  )
}

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }

export async function listMessages(threadId: string, limit = 60): Promise<ChatMessage[]> {
  await ensureSymptomChatTables()
  const rows: Array<{ id: string; role: string; content: string; createdAt: Date }> = await prisma.$queryRawUnsafe(
    'SELECT "id","role","content","createdAt" FROM "SymptomChatMessage" WHERE "threadId" = $1 ORDER BY "createdAt" ASC LIMIT $2',
    threadId,
    Math.max(1, Math.min(200, limit))
  )
  return rows.map((r) => ({
    id: r.id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function appendMessage(threadId: string, role: 'user' | 'assistant', content: string): Promise<string> {
  await ensureSymptomChatTables()
  const id = uuid()
  await prisma.$executeRawUnsafe(
    'INSERT INTO "SymptomChatMessage" ("id","threadId","role","content") VALUES ($1,$2,$3,$4)',
    id,
    threadId,
    role,
    content
  )
  await prisma.$executeRawUnsafe('UPDATE "SymptomChatThread" SET "updatedAt" = NOW() WHERE "id" = $1', threadId)
  return id
}
