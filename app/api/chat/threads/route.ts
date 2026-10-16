import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'

async function getChatThreadUserId(request: Request) {
  const session = await getServerSession(authOptions)
  return session?.user?.id || await getUserIdFromNativeAuth(request as NextRequest)
}

let tablesEnsured = false

async function ensureChatTables(): Promise<void> {
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

export type ChatThread = { id: string; title: string | null; chargedOnce: boolean; context: string; createdAt: string; updatedAt: string }

const normalizeChatContext = (value?: string | null) => (value === 'food' ? 'food' : 'general')

export async function GET(request: Request) {
  try {
    const userId = await getChatThreadUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL(request.url)
    const context = normalizeChatContext(url.searchParams.get('context'))
    const exactThreadId = url.searchParams.get('threadId')
    if (exactThreadId !== null && (!exactThreadId.trim() || exactThreadId.length > 200)) return NextResponse.json({ error: 'Invalid threadId' }, { status: 400 })
    await ensureChatTables()
    const rows: Array<{ id: string; title: string | null; chargedOnce: boolean; context: string | null; createdAt: Date; updatedAt: Date }> =
      exactThreadId !== null
        ? await prisma.$queryRawUnsafe(
            context === 'food'
              ? 'SELECT "id","title","chargedOnce","context","createdAt","updatedAt" FROM "TalkToAIChatThread" WHERE "id" = $1 AND "userId" = $2 AND "context" = $3'
              : 'SELECT "id","title","chargedOnce","context","createdAt","updatedAt" FROM "TalkToAIChatThread" WHERE "id" = $1 AND "userId" = $2 AND ("context" IS NULL OR "context" = $3)',
            exactThreadId, userId, context
          )
        : context === 'food'
        ? await prisma.$queryRawUnsafe(
            'SELECT "id","title","chargedOnce","context","createdAt","updatedAt" FROM "TalkToAIChatThread" WHERE "userId" = $1 AND "context" = $2 ORDER BY "updatedAt" DESC LIMIT 50',
            userId,
            context
          )
        : await prisma.$queryRawUnsafe(
            'SELECT "id","title","chargedOnce","context","createdAt","updatedAt" FROM "TalkToAIChatThread" WHERE "userId" = $1 AND ("context" IS NULL OR "context" = $2) ORDER BY "updatedAt" DESC LIMIT 50',
            userId,
            context
          )
    const threads = rows.map((r) => ({
      id: r.id,
      title: r.title,
      chargedOnce: Boolean(r.chargedOnce),
      context: normalizeChatContext(r.context),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
    return NextResponse.json({ threads, ...(exactThreadId !== null ? { exactThreadId } : {}) }, { status: 200 })
  } catch (error) {
    console.error('[talk-to-ai-threads.GET] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getChatThreadUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const title = String(body?.title || '').trim() || null
    const context = normalizeChatContext(body?.context)
    await ensureChatTables()
    const id = uuid()
    await prisma.$executeRawUnsafe(
      'INSERT INTO "TalkToAIChatThread" ("id","userId","title","context") VALUES ($1,$2,$3,$4)',
      id,
      userId,
      title,
      context
    )
    return NextResponse.json({ threadId: id }, { status: 200 })
  } catch (error) {
    console.error('[talk-to-ai-threads.POST] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getChatThreadUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const threadId = String(body?.threadId || '')
    const title = String(body?.title || '').trim()
    if (!threadId || !title) {
      return NextResponse.json({ error: 'threadId and title required' }, { status: 400 })
    }
    await ensureChatTables()
    await prisma.$executeRawUnsafe(
      'UPDATE "TalkToAIChatThread" SET "title" = $1, "updatedAt" = NOW() WHERE "id" = $2 AND "userId" = $3',
      title,
      threadId,
      userId
    )
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[talk-to-ai-threads.PATCH] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getChatThreadUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const threadId = String(body?.threadId || '')
    if (!threadId) {
      return NextResponse.json({ error: 'threadId required' }, { status: 400 })
    }
    await ensureChatTables()
    await prisma.$executeRawUnsafe(
      'DELETE FROM "TalkToAIChatThread" WHERE "id" = $1 AND "userId" = $2',
      threadId,
      userId
    )
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[talk-to-ai-threads.DELETE] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
