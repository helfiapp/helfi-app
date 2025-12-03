import { openaiCostCentsForTokens } from './cost-meter'

type UsageTokenTotals = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type BillingWindow = {
  startDate: string
  endDate: string
  totalUsageCents: number | null
  costUsd: number | null
  tokenTotals?: UsageTokenTotals | null
  source: 'usage' | 'billing_fallback' | 'missing_key' | 'error'
  usingFallback: boolean
  fetchedAt: string
  error?: string | null
}

const toNumber = (value: any): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const hasValue = (value: any) => value !== undefined && value !== null

function summarizeUsageList(body: any): { usageCents: number | null; tokens?: UsageTokenTotals | null } {
  if (!body) return { usageCents: null, tokens: null }

  const directCents = hasValue(body.total_usage) ? toNumber(body.total_usage) : null

  let promptTokens = 0
  let completionTokens = 0
  let tokenSeen = false

  if (Array.isArray(body.data)) {
    for (const item of body.data) {
      const p = toNumber(
        item?.prompt_tokens ??
          item?.input_tokens ??
          item?.n_prompt_tokens ??
          item?.usage?.prompt_tokens ??
          0
      )
      const c = toNumber(
        item?.completion_tokens ??
          item?.output_tokens ??
          item?.n_completion_tokens ??
          item?.usage?.completion_tokens ??
          0
      )
      if (p || c) tokenSeen = true
      promptTokens += p
      completionTokens += c
    }
  }

  const tokens =
    tokenSeen || directCents !== null
      ? {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        }
      : null

  return {
    usageCents: directCents,
    tokens,
  }
}

export async function fetchOpenAIUsageTotals(args: { startDate: string; endDate: string }): Promise<BillingWindow> {
  const startDate = args.startDate
  const endDate = args.endDate
  const fetchedAt = new Date().toISOString()
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return {
      startDate,
      endDate,
      totalUsageCents: null,
      costUsd: null,
      source: 'missing_key',
      usingFallback: true,
      fetchedAt,
      error: 'OPENAI_API_KEY is not set',
    }
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
  }

  let primaryError: string | null = null
  try {
    const resp = await fetch(`https://api.openai.com/v1/usage?start_date=${startDate}&end_date=${endDate}`, {
      headers,
      method: 'GET',
    })
    const body = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      throw new Error(body?.error?.message || resp.statusText)
    }

    const parsed = summarizeUsageList(body)
    if (parsed.usageCents !== null) {
      return {
        startDate,
        endDate,
        totalUsageCents: parsed.usageCents,
        costUsd: parsed.usageCents / 100,
        tokenTotals: parsed.tokens,
        source: 'usage',
        usingFallback: false,
        fetchedAt,
        error: null,
      }
    }

    primaryError = 'Usage API returned no total_usage value'
  } catch (err: any) {
    primaryError = err?.message || 'Failed to fetch usage totals'
  }

  // Fallback to the older billing endpoint for cost only
  try {
    const resp = await fetch(
      `https://api.openai.com/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
      {
        headers,
        method: 'GET',
      }
    )
    const body = await resp.json().catch(() => ({}))
    if (resp.ok && hasValue(body.total_usage)) {
      const cents = toNumber(body.total_usage)
      return {
        startDate,
        endDate,
        totalUsageCents: cents,
        costUsd: cents / 100,
        tokenTotals: null,
        source: 'billing_fallback',
        usingFallback: true,
        fetchedAt,
        error: primaryError,
      }
    }
    const fallbackError = body?.error?.message || resp.statusText
    return {
      startDate,
      endDate,
      totalUsageCents: null,
      costUsd: null,
      tokenTotals: null,
      source: 'billing_fallback',
      usingFallback: true,
      fetchedAt,
      error: primaryError || fallbackError,
    }
  } catch (err: any) {
    return {
      startDate,
      endDate,
      totalUsageCents: null,
      costUsd: null,
      tokenTotals: null,
      source: 'error',
      usingFallback: true,
      fetchedAt,
      error: primaryError || err?.message || 'OpenAI billing fallback failed',
    }
  }
}

// Helper to compute cost at OpenAI rate card for a batch of tokens.
export function computeCostCentsFromTokens(model: string, promptTokens: number, completionTokens: number): number {
  return openaiCostCentsForTokens(model || 'gpt-4o', {
    promptTokens,
    completionTokens,
  })
}
