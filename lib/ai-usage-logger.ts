import { prisma } from '@/lib/prisma'
import { chatCompletionWithCost } from './metered-openai'

export type UsageContext = {
  feature: string
  userId?: string | null
  userLabel?: string | null
  issueSlug?: string | null
  scanId?: string | null
  endpoint?: string | null
}

export type ImageMeta = {
  width: number | null
  height: number | null
  bytes: number | null
  mime: string | null
}

export type UsageLogInput = UsageContext & {
  model: string
  promptTokens: number
  completionTokens: number
  costCents: number
  success?: boolean
  errorMessage?: string | null
  detail?: string | null
  image?: ImageMeta | null
}

export async function logAiUsageEvent(entry: UsageLogInput) {
  try {
    const totalTokens = Number(entry.promptTokens || 0) + Number(entry.completionTokens || 0)
    await prisma.aIUsageEvent.create({
      data: {
        feature: entry.feature,
        userId: entry.userId || null,
        userLabel: entry.userLabel || null,
        scanId: entry.scanId || null,
        model: entry.model,
        promptTokens: Number(entry.promptTokens || 0),
        completionTokens: Number(entry.completionTokens || 0),
        totalTokens,
        costCents: Number(entry.costCents || 0),
        imageWidth: entry.image?.width ?? null,
        imageHeight: entry.image?.height ?? null,
        imageBytes: entry.image?.bytes ?? null,
        imageMime: entry.image?.mime ?? null,
        endpoint: entry.endpoint || null,
        success: entry.success ?? true,
        errorMessage: entry.errorMessage || null,
        detail: entry.detail || null,
      },
    })
  } catch (err) {
    // Never block user flows on logging failure
    console.warn('[ai-usage-logger] failed to persist usage event', err)
  }
}

// Backward-compatible helper used by older call sites
export async function logAIUsage(entry: {
  context: UsageContext
  model: string
  promptTokens: number
  completionTokens: number
  costCents: number
  success?: boolean
  errorMessage?: string | null
}) {
  return logAiUsageEvent({
    feature: entry.context.feature,
    userId: entry.context.userId,
    userLabel: entry.context.userLabel,
    scanId: entry.context.scanId,
    endpoint: entry.context.endpoint,
    model: entry.model,
    promptTokens: entry.promptTokens,
    completionTokens: entry.completionTokens,
    costCents: entry.costCents,
    success: entry.success,
    errorMessage: entry.errorMessage ?? null,
  })
}

// Convenience wrapper: run OpenAI chat completion, capture usage/cost, log it, and return the completion.
export async function runChatCompletionWithLogging(
  openai: any,
  params: any,
  context: UsageContext,
  extras?: {
    image?: ImageMeta | null
    successDetail?: string | null
  }
) {
  try {
    const { completion, costCents, promptTokens, completionTokens } = await chatCompletionWithCost(openai, params)
    const model = (completion as any)?.model || params?.model || 'unknown'
    logAiUsageEvent({
      ...context,
      model,
      promptTokens,
      completionTokens,
      costCents,
      image: extras?.image ?? null,
      detail: extras?.successDetail ?? null,
      success: true,
    }).catch(() => {})
    return completion
  } catch (err: any) {
    const model = params?.model || 'unknown'
    logAiUsageEvent({
      ...context,
      model,
      promptTokens: 0,
      completionTokens: 0,
      costCents: 0,
      image: extras?.image ?? null,
      success: false,
      errorMessage: err?.message || 'unknown_error',
    }).catch(() => {})
    throw err
  }
}
