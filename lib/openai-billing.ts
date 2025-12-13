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
  source: 'usage' | 'costs' | 'billing_fallback' | 'missing_key' | 'error'
  usingFallback: boolean
  fetchedAt: string
  error?: string | null
}

const toNumber = (value: any): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const hasValue = (value: any) => value !== undefined && value !== null

const parseUsdAmount = (value: any): number | null => {
  if (value === undefined || value === null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    // OpenAI cost export sometimes uses stringified numerics like "0E-6176".
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const dateToUnixStartUtc = (yyyyMmDd: string): number => {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  return Math.floor(d.getTime() / 1000)
}

const addDaysIso = (yyyyMmDd: string, days: number): string => {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

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

  // Prefer the newer org costs endpoint (matches OpenAI dashboard "Export → Cost data").
  // Use an inclusive end by querying until endDate+1 at 00:00Z.
  const tryFetchOrgCosts = async (): Promise<BillingWindow | null> => {
    const startTime = dateToUnixStartUtc(startDate)
    const endTime = dateToUnixStartUtc(addDaysIso(endDate, 1))
    const urls = [
      `https://api.openai.com/v1/organization/costs?start_time=${startTime}&end_time=${endTime}&bucket_width=1d`,
      `https://api.openai.com/v1/organization/costs?start_time=${startTime}&end_time=${endTime}&bucket_width=1d&group_by=project_id`,
      `https://api.openai.com/v1/organization/costs?start_time=${startTime}&end_time=${endTime}&bucket_width=1d&group_by[]=project_id`,
    ]

    for (const url of urls) {
      for (const hv of headerVariants) {
        try {
          const resp = await fetch(url, { headers: hv, method: 'GET' })
          const body = await resp.json().catch(() => ({}))
          if (!resp.ok) {
            const msg = body?.error?.message || resp.statusText || `org_costs failed`
            errors.push(`org_costs: ${msg} (status ${resp.status})`)
            continue
          }

          const buckets = Array.isArray(body?.data) ? body.data : []
          let sumUsd = 0
          let sawAny = false

          for (const bucket of buckets) {
            const results = Array.isArray(bucket?.results) ? bucket.results : []
            for (const r of results) {
              if (projectId && typeof r?.project_id === 'string' && r.project_id !== projectId) continue
              const usd = parseUsdAmount(r?.amount?.value)
              if (usd === null) continue
              sumUsd += usd
              sawAny = true
            }
          }

          if (!sawAny) {
            errors.push('org_costs returned no usable cost buckets')
            continue
          }

          const totalUsageCents = Math.round(sumUsd * 100)
          return {
            startDate,
            endDate,
            totalUsageCents,
            costUsd: totalUsageCents / 100,
            tokenTotals: null,
            source: 'costs',
            usingFallback: false,
            fetchedAt,
            error: errors.length ? errors[errors.length - 1] : null,
          }
        } catch (err: any) {
          errors.push(`org_costs exception: ${err?.message || 'unknown'}`)
        }
      }
    }
    return null
  }

  const costs = await tryFetchOrgCosts()
  if (costs) return costs

  // OpenAI's vendor billing endpoints under /dashboard/* now require a browser session
  // and will 401 for API keys. Also, many usage endpoints reject start/end and only
  // accept a single `date` param. Avoid noisy multi-request fallbacks (rate limits).
  const usageSingle = await tryCall('usage_single', `https://api.openai.com/v1/usage?date=${endDate}`, 'usage', false)
  if (usageSingle) return usageSingle

  errors.push('OpenAI usage totals unavailable for this account; falling back to Helfi logs + rate card estimates.')

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
