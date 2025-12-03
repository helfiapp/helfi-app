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

  // Helper: try a direct call
  const tryCall = async (label: string, url: string, source: 'usage' | 'billing_fallback', usingFallback: boolean) => {
    for (const hv of headerVariants) {
      try {
        const resp = await fetch(url, { headers: hv, method: 'GET' })
        const body = await resp.json().catch(() => ({}))
        if (!resp.ok) {
          const msg = body?.error?.message || resp.statusText || `${label} failed`
          errors.push(`${label}: ${msg} (status ${resp.status})`)
          continue
        }
        const parsed = source === 'usage' ? summarizeUsageList(body) : { usageCents: body?.total_usage ?? null, tokens: null }
        const cents =
          parsed.usageCents !== null
            ? toNumber(parsed.usageCents)
            : hasValue(body.total_usage)
            ? toNumber(body.total_usage)
            : null
        if (cents !== null) {
          return {
            startDate,
            endDate,
            totalUsageCents: cents,
            costUsd: cents / 100,
            tokenTotals: parsed.tokens || null,
            source,
            usingFallback,
            fetchedAt,
            error: errors.length ? errors[errors.length - 1] : null,
          }
        }
        errors.push(`${label} returned no total_usage`)
      } catch (err: any) {
        errors.push(`${label} exception: ${err?.message || 'unknown'}`)
      }
    }
    return null
  }

  // 1) Try usage with start/end
  const usageRange = await tryCall('usage_range', `https://api.openai.com/v1/usage?start_date=${startDate}&end_date=${endDate}`, 'usage', false)
  if (usageRange) return usageRange

  // 2) Try usage with single date (endDate)
  const usageSingle = await tryCall('usage_single', `https://api.openai.com/v1/usage?date=${endDate}`, 'usage', false)
  if (usageSingle) return usageSingle

  // 3) Try billing endpoints (may be blocked on some accounts)
  const billingRange = await tryCall(
    'billing_range',
    `https://api.openai.com/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
    'billing_fallback',
    true,
  )
  if (billingRange) return billingRange

  const billingSingle = await tryCall('billing_single', `https://api.openai.com/dashboard/billing/usage?date=${endDate}`, 'billing_fallback', true)
  if (billingSingle) return billingSingle

  // 4) As a last resort, aggregate per-day usage calls (usage?date=YYYY-MM-DD) to satisfy endpoints that demand a single date
  try {
    let cur = new Date(startDate + 'T00:00:00Z')
    const end = new Date(endDate + 'T00:00:00Z')
    let sumCents = 0
    let promptTokens = 0
    let completionTokens = 0

    while (cur <= end) {
      const dayStr = cur.toISOString().slice(0, 10)
      const perDay = await tryCall(`usage_day_${dayStr}`, `https://api.openai.com/v1/usage?date=${dayStr}`, 'usage', false)
      if (perDay?.totalUsageCents) {
        sumCents += perDay.totalUsageCents
        promptTokens += perDay.tokenTotals?.promptTokens || 0
        completionTokens += perDay.tokenTotals?.completionTokens || 0
      }
      cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000)
    }

    if (sumCents > 0) {
      return {
        startDate,
        endDate,
        totalUsageCents: sumCents,
        costUsd: sumCents / 100,
        tokenTotals: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        source: 'usage',
        usingFallback: false,
        fetchedAt,
        error: errors.length ? errors[errors.length - 1] : null,
      }
    }
  } catch (err: any) {
    errors.push(`per-day usage aggregation failed: ${err?.message || 'unknown'}`)
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
