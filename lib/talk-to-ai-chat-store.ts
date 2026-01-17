import { prisma } from '@/lib/prisma'

let tablesEnsured = false

export async function ensureTalkToAITables(): Promise<void> {
  if (tablesEnsured) return
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "TalkToAIChatThread" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "title" TEXT, "context" TEXT NOT NULL DEFAULT \'general\', "chargedOnce" BOOLEAN NOT NULL DEFAULT FALSE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "TalkToAIChatThread" ADD COLUMN IF NOT EXISTS "chargedOnce" BOOLEAN NOT NULL DEFAULT FALSE'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "TalkToAIChatThread" ADD COLUMN IF NOT EXISTS "context" TEXT NOT NULL DEFAULT \'general\''
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "TalkToAIChatThread" ADD COLUMN IF NOT EXISTS "foodContext" TEXT'
    )
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "TalkToAIChatMessage" ("id" TEXT PRIMARY KEY, "threadId" TEXT NOT NULL, "role" TEXT NOT NULL, "content" TEXT NOT NULL, "tokenCount" INTEGER NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT "TalkToAIChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "TalkToAIChatThread"("id") ON DELETE CASCADE)'
    )
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "TalkToAIChatMessage_threadId_createdAt_idx" ON "TalkToAIChatMessage" ("threadId", "createdAt")'
    )
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "TalkToAIChatThread_userId_idx" ON "TalkToAIChatThread" ("userId")'
    )
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "TalkToAIChatThread_userId_context_idx" ON "TalkToAIChatThread" ("userId", "context")'
    )
    tablesEnsured = true
  } catch (error) {
    console.error('[talk-to-ai] Failed to ensure tables', error)
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
  chargedOnce: boolean
  context: string
  createdAt: string
  updatedAt: string
}

export function normalizeChatContext(value?: string | null): 'general' | 'food' {
  return value === 'food' ? 'food' : 'general'
}

export async function listThreads(userId: string, context?: string): Promise<ChatThread[]> {
  await ensureTalkToAITables()
  const normalizedContext = normalizeChatContext(context)
  const rows: Array<{
    id: string
    title: string | null
    chargedOnce: boolean
    context: string | null
    createdAt: Date
    updatedAt: Date
  }> =
    normalizedContext === 'food'
      ? await prisma.$queryRawUnsafe(
          'SELECT "id","title","chargedOnce","context","createdAt","updatedAt" FROM "TalkToAIChatThread" WHERE "userId" = $1 AND "context" = $2 ORDER BY "updatedAt" DESC LIMIT 50',
          userId,
          normalizedContext
        )
      : await prisma.$queryRawUnsafe(
          'SELECT "id","title","chargedOnce","context","createdAt","updatedAt" FROM "TalkToAIChatThread" WHERE "userId" = $1 AND ("context" IS NULL OR "context" = $2) ORDER BY "updatedAt" DESC LIMIT 50',
          userId,
          normalizedContext
        )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    chargedOnce: Boolean(r.chargedOnce),
    context: normalizeChatContext(r.context),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
}

export async function getThreadChargeStatus(threadId: string): Promise<boolean> {
  await ensureTalkToAITables()
  const rows: Array<{ chargedOnce: boolean }> = await prisma.$queryRawUnsafe(
    'SELECT "chargedOnce" FROM "TalkToAIChatThread" WHERE "id" = $1',
    threadId
  )
  return Boolean(rows[0]?.chargedOnce)
}

export async function markThreadCharged(threadId: string): Promise<void> {
  await ensureTalkToAITables()
  await prisma.$executeRawUnsafe(
    'UPDATE "TalkToAIChatThread" SET "chargedOnce" = TRUE, "updatedAt" = NOW() WHERE "id" = $1',
    threadId
  )
}

export async function createThread(userId: string, title?: string, context?: string): Promise<{ id: string }> {
  await ensureTalkToAITables()
  const id = uuid()
  const normalizedContext = normalizeChatContext(context)
  await prisma.$executeRawUnsafe(
    'INSERT INTO "TalkToAIChatThread" ("id","userId","title","context") VALUES ($1,$2,$3,$4)',
    id,
    userId,
    title || null,
    normalizedContext
  )
  return { id }
}

export async function updateThreadTitle(threadId: string, title: string): Promise<void> {
  await ensureTalkToAITables()
  await prisma.$executeRawUnsafe(
    'UPDATE "TalkToAIChatThread" SET "title" = $1, "updatedAt" = NOW() WHERE "id" = $2',
    title,
    threadId
  )
}

export async function updateThreadFoodContext(threadId: string, foodContext: string | null): Promise<void> {
  await ensureTalkToAITables()
  await prisma.$executeRawUnsafe(
    'UPDATE "TalkToAIChatThread" SET "foodContext" = $1, "updatedAt" = NOW() WHERE "id" = $2',
    foodContext,
    threadId
  )
}

export async function getThreadFoodContext(threadId: string): Promise<string | null> {
  await ensureTalkToAITables()
  const rows: Array<{ foodContext: string | null }> = await prisma.$queryRawUnsafe(
    'SELECT "foodContext" FROM "TalkToAIChatThread" WHERE "id" = $1',
    threadId
  )
  return rows[0]?.foodContext ?? null
}

export async function deleteThread(threadId: string): Promise<void> {
  await ensureTalkToAITables()
  await prisma.$executeRawUnsafe('DELETE FROM "TalkToAIChatThread" WHERE "id" = $1', threadId)
}

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }

export async function listMessages(threadId: string, limit = 40): Promise<ChatMessage[]> {
  await ensureTalkToAITables()
  const rows: Array<{ id: string; role: string; content: string; createdAt: Date }> = await prisma.$queryRawUnsafe(
    'SELECT "id","role","content","createdAt" FROM "TalkToAIChatMessage" WHERE "threadId" = $1 ORDER BY "createdAt" ASC LIMIT $2',
    threadId,
    Math.max(1, Math.min(200, limit))
  )
  return rows.map((r) => ({ id: r.id, role: r.role as 'user' | 'assistant', content: r.content, createdAt: r.createdAt.toISOString() }))
}

export async function appendMessage(threadId: string, role: 'user' | 'assistant', content: string, tokenCount?: number): Promise<string> {
  await ensureTalkToAITables()
  const id = uuid()
  await prisma.$executeRawUnsafe(
    'INSERT INTO "TalkToAIChatMessage" ("id","threadId","role","content","tokenCount") VALUES ($1,$2,$3,$4,$5)',
    id,
    threadId,
    role,
    content,
    tokenCount ?? null
  )
  await prisma.$executeRawUnsafe('UPDATE "TalkToAIChatThread" SET "updatedAt" = NOW() WHERE "id" = $1', threadId)
  return id
}
