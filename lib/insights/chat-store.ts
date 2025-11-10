import { prisma } from '@/lib/prisma'
import { getCachedIssueSection, type IssueSectionResult, type IssueSectionKey } from '@/lib/insights/issue-engine'
import OpenAI from 'openai'

let tablesEnsured = false

export async function ensureChatTables(): Promise<void> {
  if (tablesEnsured) return
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "InsightsChatThread" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "slug" TEXT NOT NULL, "section" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())'
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

export async function getOrCreateThread(userId: string, slug: string, section: string): Promise<{ id: string }> {
  await ensureChatTables()
  const rows: Array<{ id: string }> = await prisma.$queryRawUnsafe(
    'SELECT "id" FROM "InsightsChatThread" WHERE "userId" = $1 AND "slug" = $2 AND "section" = $3 LIMIT 1',
    userId,
    slug,
    section
  )
  if (rows && rows[0]) {
    await prisma.$executeRawUnsafe(
      'UPDATE "InsightsChatThread" SET "updatedAt" = NOW() WHERE "id" = $1',
      rows[0].id
    )
    return { id: rows[0].id }
  }
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
      : section === 'lifestyle'
      ? 'CRITICAL: Review profile and any lifestyle-related context. Analyze logged habits/patterns by understanding their mechanisms, but ALWAYS reference items by the exact name/description stored in the profile. Tie each mention to why it helps this issue.'
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


