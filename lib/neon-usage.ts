const NEON_API_BASE = 'https://console.neon.tech/api/v2'

export type NeonConsumptionMetric = {
  metric_name: string
  value: number
}

export type NeonConsumptionPeriod = {
  period_start: string
  period_end: string
  consumption: NeonConsumptionMetric[]
}

export type NeonConsumptionResponse = {
  periods?: NeonConsumptionPeriod[]
}

export type NeonUsageSummary = {
  from: string
  to: string
  metrics: Record<string, number>
  note?: string
}

export type NeonCostEstimate = {
  estimatedDailyCostUsd: number | null
  computeUsd?: number
  storageUsd?: number
  note?: string
}

const buildQuery = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter(([, value]) => value)
  if (!entries.length) return ''
  const query = new URLSearchParams(entries as Array<[string, string]>).toString()
  return `?${query}`
}

const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function fetchNeonUsageSummary(options: {
  from: string
  to: string
  granularity?: 'hourly' | 'daily' | 'monthly'
  orgId?: string
}) : Promise<NeonUsageSummary | null> {
  const apiKey = (process.env.NEON_API_KEY || '').trim()
  if (!apiKey) {
    return null
  }

  const query = buildQuery({
    from: options.from,
    to: options.to,
    granularity: options.granularity || 'daily',
    org_id: options.orgId,
  })

  const url = `${NEON_API_BASE}/consumption_history/account${query}`

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        from: options.from,
        to: options.to,
        metrics: {},
        note: `Neon API error (${response.status}). ${text.slice(0, 200)}`,
      }
    }

    const data = (await response.json().catch(() => null)) as NeonConsumptionResponse | null
    const metrics: Record<string, number> = {}

    for (const period of data?.periods || []) {
      for (const item of period.consumption || []) {
        const key = item.metric_name
        const current = metrics[key] || 0
        metrics[key] = current + Number(item.value || 0)
      }
    }

    return {
      from: options.from,
      to: options.to,
      metrics,
    }
  } catch (error: any) {
    return {
      from: options.from,
      to: options.to,
      metrics: {},
      note: error?.message || 'Neon API request failed',
    }
  }
}

export function estimateDailyCostUsd(
  usage: NeonUsageSummary | null,
  options?: {
    computeCuHourUsd?: number
    storageGbMonthUsd?: number
  }
): NeonCostEstimate {
  if (!usage) {
    return { estimatedDailyCostUsd: null, note: 'Neon usage data missing.' }
  }

  const computeSeconds = Number(usage.metrics.compute_time_seconds || 0)
  const storageBytes =
    Number(usage.metrics.synthetic_storage_size_bytes || 0) ||
    Number(usage.metrics.data_storage_bytes || 0) ||
    Number(usage.metrics.logical_size_bytes || 0)

  const computeCuHourUsd = parseNumber(
    process.env.NEON_COMPUTE_CU_HOUR_USD,
    options?.computeCuHourUsd ?? 0.14
  )
  const storageGbMonthUsd = parseNumber(
    process.env.NEON_STORAGE_GB_MONTH_USD,
    options?.storageGbMonthUsd ?? 0.35
  )

  const computeUsd = Number.isFinite(computeSeconds)
    ? (computeSeconds / 3600) * computeCuHourUsd
    : 0
  const storageUsd = Number.isFinite(storageBytes)
    ? (storageBytes / (1024 ** 3)) * (storageGbMonthUsd / 30)
    : 0

  if (!computeUsd && !storageUsd) {
    return { estimatedDailyCostUsd: null, note: 'Neon usage data missing compute/storage metrics.' }
  }

  return {
    estimatedDailyCostUsd: computeUsd + storageUsd,
    computeUsd,
    storageUsd,
  }
}
