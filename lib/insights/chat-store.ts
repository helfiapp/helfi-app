import { prisma } from '@/lib/prisma'
import { getCachedIssueSection, type IssueSectionResult, type IssueSectionKey } from '@/lib/insights/issue-engine'
import OpenAI from 'openai'

let tablesEnsured = false

export async function ensureChatTables(): Promise<void> {
  if (tablesEnsured) return
  try {
    // Add title column if it doesn't exist
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "InsightsChatThread" ADD COLUMN IF NOT EXISTS "title" TEXT'
    )
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "InsightsChatThread" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "slug" TEXT NOT NULL, "section" TEXT NOT NULL, "title" TEXT, "archivedAt" TIMESTAMPTZ, "lastChargedCost" INTEGER, "lastChargedAt" TIMESTAMPTZ, "lastChargeCovered" BOOLEAN, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "InsightsChatThread" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "InsightsChatThread" ADD COLUMN IF NOT EXISTS "lastChargedCost" INTEGER'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "InsightsChatThread" ADD COLUMN IF NOT EXISTS "lastChargedAt" TIMESTAMPTZ'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "InsightsChatThread" ADD COLUMN IF NOT EXISTS "lastChargeCovered" BOOLEAN'
    )
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "InsightsChatMessage" ("id" TEXT PRIMARY KEY, "threadId" TEXT NOT NULL, "role" TEXT NOT NULL, "content" TEXT NOT NULL, "tokenCount" INTEGER NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT "InsightsChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "InsightsChatThread"("id") ON DELETE CASCADE)'
    )
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "InsightsChatMessage_threadId_createdAt_idx" ON "InsightsChatMessage" ("threadId", "createdAt")'
    )
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "InsightsChatThread_user_slug_section_idx" ON "InsightsChatThread" ("userId", "slug", "section")'
    )
    tablesEnsured = true
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[chat] Failed to ensure tables', error)
  }
}

function uuid(): string {
  // Simple UUID v4 generator without external dependency
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

export async function listThreads(userId: string, slug: string, section: string): Promise<ChatThread[]> {
  await ensureChatTables()
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
    'SELECT "id","title","archivedAt","lastChargedCost","lastChargedAt","lastChargeCovered","createdAt","updatedAt" FROM "InsightsChatThread" WHERE "userId" = $1 AND "slug" = $2 AND "section" = $3 ORDER BY "updatedAt" DESC LIMIT 50',
    userId,
    slug,
    section
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

export async function createThread(userId: string, slug: string, section: string, title?: string): Promise<{ id: string }> {
  await ensureChatTables()
  const id = uuid()
  await prisma.$executeRawUnsafe(
    'INSERT INTO "InsightsChatThread" ("id","userId","slug","section","title") VALUES ($1,$2,$3,$4,$5)',
    id,
    userId,
    slug,
    section,
    title || null
  )
  return { id }
}

export async function updateThreadTitle(userId: string, threadId: string, title: string): Promise<void> {
  await ensureChatTables()
  await prisma.$executeRawUnsafe(
    'UPDATE "InsightsChatThread" SET "title" = $1, "updatedAt" = NOW() WHERE "id" = $2 AND "userId" = $3',
    title,
    threadId,
    userId
  )
}

export async function updateThreadArchived(userId: string, threadId: string, archived: boolean): Promise<void> {
  await ensureChatTables()
  await prisma.$executeRawUnsafe(
    'UPDATE "InsightsChatThread" SET "archivedAt" = $1, "updatedAt" = NOW() WHERE "id" = $2 AND "userId" = $3',
    archived ? new Date() : null,
    threadId,
    userId
  )
}

export async function updateThreadCost(userId: string, threadId: string, cost: number, covered: boolean): Promise<void> {
  await ensureChatTables()
  await prisma.$executeRawUnsafe(
    'UPDATE "InsightsChatThread" SET "lastChargedCost" = $1, "lastChargedAt" = NOW(), "lastChargeCovered" = $2, "updatedAt" = NOW() WHERE "id" = $3 AND "userId" = $4',
    Math.round(cost),
    covered,
    threadId,
    userId
  )
}

export async function deleteThread(userId: string, threadId: string): Promise<void> {
  await ensureChatTables()
  await prisma.$executeRawUnsafe(
    'DELETE FROM "InsightsChatThread" WHERE "id" = $1 AND "userId" = $2',
    threadId,
    userId
  )
}

export async function getOrCreateThread(userId: string, slug: string, section: string): Promise<{ id: string }> {
  await ensureChatTables()
  // First check if there are any existing threads for this user/slug/section
  const existingThreads = await listThreads(userId, slug, section)
  if (existingThreads.length > 0) {
    // Return the most recently updated thread instead of creating a new one
    await prisma.$executeRawUnsafe(
      'UPDATE "InsightsChatThread" SET "updatedAt" = NOW() WHERE "id" = $1',
      existingThreads[0].id
    )
    return { id: existingThreads[0].id }
  }
  // Only create a new thread if none exist
  const id = uuid()
  await prisma.$executeRawUnsafe(
    'INSERT INTO "InsightsChatThread" ("id","userId","slug","section") VALUES ($1,$2,$3,$4)',
    id,
    userId,
    slug,
    section
  )
  return { id }
}

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }

export async function listMessages(threadId: string, limit = 40): Promise<ChatMessage[]> {
  await ensureChatTables()
  const rows: Array<{ id: string; role: string; content: string; createdAt: Date }> = await prisma.$queryRawUnsafe(
    'SELECT "id","role","content","createdAt" FROM "InsightsChatMessage" WHERE "threadId" = $1 ORDER BY "createdAt" ASC LIMIT $2',
    threadId,
    Math.max(1, Math.min(200, limit))
  )
  return rows.map((r) => ({ id: r.id, role: r.role as 'user' | 'assistant', content: r.content, createdAt: r.createdAt.toISOString() }))
}

export async function appendMessage(threadId: string, role: 'user' | 'assistant', content: string, tokenCount?: number): Promise<string> {
  await ensureChatTables()
  const id = uuid()
  await prisma.$executeRawUnsafe(
    'INSERT INTO "InsightsChatMessage" ("id","threadId","role","content","tokenCount") VALUES ($1,$2,$3,$4,$5)',
    id,
    threadId,
    role,
    content,
    tokenCount ?? null
  )
  await prisma.$executeRawUnsafe('UPDATE "InsightsChatThread" SET "updatedAt" = NOW() WHERE "id" = $1', threadId)
  return id
}

export function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function buildSystemPrompt(userId: string, slug: string, section: IssueSectionKey): Promise<string> {
  const context: IssueSectionResult | null = await getCachedIssueSection(userId, slug, section, { mode: 'latest' })
  const summary = context?.summary ?? ''
  const extras = context?.extras ?? {}
  const safeExtras = (() => {
    try {
      // Avoid very large payloads; pick a few keys and truncate arrays
      const keys = ['supportiveDetails', 'suggestedAdditions', 'avoidList', 'workingActivities', 'suggestedActivities', 'avoidActivities']
      const obj: Record<string, unknown> = {}
      for (const k of keys) {
        const v = (extras as any)[k]
        if (Array.isArray(v)) obj[k] = v.slice(0, 8)
      }
      return JSON.stringify(obj)
    } catch {
      return '{}'
    }
  })()

  // Load a privacy-conscious slice of the user's health setup for better grounding
  let profileJSON = '{}'
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        healthGoals: true,
        supplements: true,
        medications: true,
        healthLogs: { orderBy: { createdAt: 'desc' }, take: 14 },
        foodLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    })
    if (user) {
      const goals = (user.healthGoals || [])
        .filter((g: any) => typeof g?.name === 'string' && !g.name.startsWith('__'))
        .map((g: any) => g.name)
        .slice(0, 12)
      let healthSituations: { healthIssues?: string; healthProblems?: string; additionalInfo?: string; skipped?: boolean } | null = null
      const healthSituationsGoal = (user.healthGoals || []).find((g: any) => g?.name === '__HEALTH_SITUATIONS_DATA__')
      if (healthSituationsGoal?.category) {
        try {
          const parsed = JSON.parse(healthSituationsGoal.category)
          healthSituations = {
            healthIssues: typeof parsed?.healthIssues === 'string' ? parsed.healthIssues : '',
            healthProblems: typeof parsed?.healthProblems === 'string' ? parsed.healthProblems : '',
            additionalInfo: typeof parsed?.additionalInfo === 'string' ? parsed.additionalInfo : '',
            skipped: Boolean(parsed?.skipped),
          }
        } catch {
          healthSituations = null
        }
      }
      const supplements = (user.supplements || [])
        .map((s: any) => ({ name: s.name, dosage: s.dosage, timing: s.timing }))
        .filter((s: any) => typeof s.name === 'string' && s.name)
        .slice(0, 12)
      const medications = (user.medications || [])
        .map((m: any) => ({ name: m.name, dosage: m.dosage, timing: m.timing }))
        .filter((m: any) => typeof m.name === 'string' && m.name)
        .slice(0, 12)
      const recentHealthLogs = (user.healthLogs || [])
        .map((h: any) => ({ rating: h.rating, createdAt: h.createdAt }))
        .slice(0, 14)
      const recentFood = (user.foodLogs || [])
        .map((f: any) => ({ name: f.name, createdAt: f.createdAt }))
        .slice(0, 10)
      profileJSON = JSON.stringify({
        gender: user.gender,
        height: user.height,
        weight: user.weight,
        goals,
        healthSituations,
        supplements,
        medications,
        recentHealthLogs,
        recentFood,
      })
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[chat] Failed to load user profile slice', e)
  }

  return [
    'You are a careful, concise clinical assistant for the current Insights section.',
    `Issue slug: ${slug}`,
    `Section: ${section}`,
    summary ? `Section summary: ${summary}` : '',
    `Section extras (truncated): ${safeExtras}`,
    `User profile (truncated): ${profileJSON}`,
    section === 'supplements'
      ? 'CRITICAL: Review profile.supplements. Analyze each supplement by understanding its active ingredient(s) and mechanism of action, but ALWAYS reference items by the exact name stored in the profile. If dosage/timing are present, include them briefly. Tie each mention to why it helps this issue.'
      : section === 'medications'
      ? 'CRITICAL: Review profile.medications. Analyze each medication by understanding its active ingredient(s) and therapeutic class, but ALWAYS reference items by the exact name stored in the profile. If dosage/timing are present, include them briefly. Tie each mention to why it helps this issue.'
      : section === 'nutrition'
      ? 'CRITICAL: Review profile.recentFood. Analyze each logged food/meal by understanding its nutritional profile and physiological effects, but ALWAYS reference items by the exact name stored in the profile. Tie each mention to why it helps this issue.'
      : section === 'exercise'
      ? 'CRITICAL: Review profile and any exercise-related context. For logged exercises, analyze their physiological effects but ALWAYS reference items by the exact name stored in the profile. Tie each mention to why it helps this issue.'
      : section === 'labs'
      ? 'CRITICAL: Review profile and any lab-related context. Analyze logged tests by understanding what biomarkers they measure, but ALWAYS reference items by the exact test name stored in the profile. Tie each mention to why it helps this issue.'
      : '',
    'Rules: avoid diagnosis, encourage clinician consultation for changes. Be specific with practical tips (dose/timing if appropriate).',
    'CRITICAL: Always format responses with proper paragraphs separated by blank lines.',
    'Use numbered lists (1. 2. 3.) or bullet points (- or *) for multiple items.',
    'Use **bold** for emphasis on key terms or headings.',
    'Break up long responses into clear sections with line breaks between paragraphs.',
    'NEVER provide responses as one continuous block of text without line breaks.',
    'Each paragraph should be separated by a blank line (double newline).',
    'When answering follow-up questions, provide NEW information or clarification, not a repetition of previous answers.'
  ].filter(Boolean).join('\n')
}
