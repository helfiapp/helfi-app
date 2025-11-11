import { prisma } from '@/lib/prisma'

let tablesEnsured = false

export async function ensureTalkToAITables(): Promise<void> {
  if (tablesEnsured) return
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "TalkToAIChatThread" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "title" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())'
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

export type ChatThread = { id: string; title: string | null; createdAt: string; updatedAt: string }

export async function listThreads(userId: string): Promise<ChatThread[]> {
  await ensureTalkToAITables()
  const rows: Array<{ id: string; title: string | null; createdAt: Date; updatedAt: Date }> = await prisma.$queryRawUnsafe(
    'SELECT "id","title","createdAt","updatedAt" FROM "TalkToAIChatThread" WHERE "userId" = $1 ORDER BY "updatedAt" DESC LIMIT 50',
    userId
  )
  return rows.map((r) => ({ id: r.id, title: r.title, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }))
}

export async function createThread(userId: string, title?: string): Promise<{ id: string }> {
  await ensureTalkToAITables()
  const id = uuid()
  await prisma.$executeRawUnsafe(
    'INSERT INTO "TalkToAIChatThread" ("id","userId","title") VALUES ($1,$2,$3)',
    id,
    userId,
    title || null
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

