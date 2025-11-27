import { prisma } from '@/lib/prisma'
import { chatCompletionWithCost } from './metered-openai'

type UsageContext = {
  feature: string
  userId?: string | null
  issueSlug?: string | null
}

let ensured = false

// Create lightweight AI usage log table if it doesn't exist yet.
async function ensureTable() {
  if (ensured) return
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AIUsageLog" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "userId" TEXT,
        "feature" TEXT NOT NULL,
        "issueSlug" TEXT,
        "model" TEXT,
        "promptTokens" INT,
        "completionTokens" INT,
        "costCents" INT
      )
    `)
    ensured = true
  } catch (err) {
    // Non-blocking; avoid breaking feature flow
    console.warn('[ai-usage-logger] ensureTable failed', err)
  }
}

export async function logAIUsage(entry: {
  context: UsageContext
  model: string
  promptTokens: number
  completionTokens: number
  costCents: number
}) {
  try {
    await ensureTable()
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AIUsageLog" ("userId","feature","issueSlug","model","promptTokens","completionTokens","costCents")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      entry.context.userId || null,
      entry.context.feature,
      entry.context.issueSlug || null,
      entry.model,
      entry.promptTokens,
      entry.completionTokens,
      entry.costCents
    )
  } catch (err) {
    console.warn('[ai-usage-logger] log insert failed', err)
  }
}

// Convenience wrapper: run OpenAI chat completion, capture usage/cost, log it.
export async function runChatCompletionWithLogging(
  openai: any,
  params: any,
  context: UsageContext
) {
  const { completion, costCents, promptTokens, completionTokens } = await chatCompletionWithCost(openai, params)
  const model = (completion as any)?.model || params?.model || 'unknown'
  logAIUsage({
    context,
    model,
    promptTokens,
    completionTokens,
    costCents,
  }).catch(() => {})
  return completion
}
