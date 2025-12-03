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
  const projectId = process.env.OPENAI_PROJECT_ID || process.env.OPENAI_PROJECT
  const orgId = process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION || process.env.OPENAI_ORG

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
  if (orgId) {
    ;(headers as any)['OpenAI-Organization'] = orgId
  }

  const headerVariants: Record<string, string>[] = projectId
    ? [headers, { ...headers, 'OpenAI-Project': projectId }]
    : [headers]

  const errors: string[] = []

  const attempts: Array<{
    label: 'usage' | 'billing_range' | 'billing_single';
    url: string;
    source: 'usage' | 'billing_fallback';
    usingFallback: boolean;
  }> = [
    {
      label: 'usage',
      url: `https://api.openai.com/v1/usage?start_date=${startDate}&end_date=${endDate}`,
      source: 'usage',
      usingFallback: false,
    },
    {
      label: 'billing_range',
      url: `https://api.openai.com/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
      source: 'billing_fallback',
      usingFallback: true,
    },
    {
      label: 'billing_single',
      url: `https://api.openai.com/dashboard/billing/usage?date=${endDate}`,
      source: 'billing_fallback',
      usingFallback: true,
    },
  ]

  for (const attempt of attempts) {
    for (const hv of headerVariants) {
      try {
        const resp = await fetch(attempt.url, {
          headers: hv,
          method: 'GET',
        })
        const body = await resp.json().catch(() => ({}))

        if (!resp.ok) {
          const msg = body?.error?.message || resp.statusText || `${attempt.label} failed`
          errors.push(msg)
          continue
        }

        const parsed = attempt.label === 'usage' ? summarizeUsageList(body) : { usageCents: body?.total_usage ?? null, tokens: null }
        const cents = parsed.usageCents !== null ? toNumber(parsed.usageCents) : hasValue(body.total_usage) ? toNumber(body.total_usage) : null

        if (cents !== null) {
          return {
            startDate,
            endDate,
            totalUsageCents: cents,
            costUsd: cents / 100,
            tokenTotals: parsed.tokens || null,
            source: attempt.source,
            usingFallback: attempt.usingFallback,
            fetchedAt,
            error: errors.length ? errors[errors.length - 1] : null,
          }
        }

        errors.push(`${attempt.label} returned no total_usage`)
      } catch (err: any) {
        errors.push(err?.message || `${attempt.label} exception`)
      }
    }
  }

  // If everything failed, return error
  return {
    startDate,
    endDate,
    totalUsageCents: null,
    costUsd: null,
    tokenTotals: null,
    source: 'error',
    usingFallback: true,
    fetchedAt,
    error: errors.join(' | ') || 'OpenAI billing fetch failed',
  }
}

// Helper to compute cost at OpenAI rate card for a batch of tokens.
export function computeCostCentsFromTokens(model: string, promptTokens: number, completionTokens: number): number {
  return openaiCostCentsForTokens(model || 'gpt-4o', {
    promptTokens,
    completionTokens,
  })
}
