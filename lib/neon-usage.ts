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

const buildQuery = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter(([, value]) => value)
  if (!entries.length) return ''
  const query = new URLSearchParams(entries as Array<[string, string]>).toString()
  return `?${query}`
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
