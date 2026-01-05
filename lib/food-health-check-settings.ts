export type HealthCheckFrequency = 'always' | 'high' | 'never'

export type HealthCheckSettings = {
  enabled: boolean
  frequency: HealthCheckFrequency
  dailyCap: number | null
  thresholds: {
    sugar: number | null
    carbs: number | null
    fat: number | null
  }
}

export const DEFAULT_HEALTH_CHECK_SETTINGS: HealthCheckSettings = {
  enabled: true,
  frequency: 'high',
  dailyCap: null,
  thresholds: {
    sugar: null,
    carbs: null,
    fat: null,
  },
}

const toOptionalNumber = (value: any) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

const normalizeFrequency = (value: any): HealthCheckFrequency => {
  const raw = typeof value === 'string' ? value.toLowerCase().trim() : ''
  if (raw === 'always' || raw === 'never' || raw === 'high') return raw
  return 'high'
}

export const normalizeHealthCheckSettings = (raw: any): HealthCheckSettings => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_HEALTH_CHECK_SETTINGS }
  const thresholds = raw?.thresholds && typeof raw.thresholds === 'object' ? raw.thresholds : {}
  return {
    enabled: raw?.enabled !== false,
    frequency: normalizeFrequency(raw?.frequency),
    dailyCap: toOptionalNumber(raw?.dailyCap),
    thresholds: {
      sugar: toOptionalNumber(thresholds?.sugar),
      carbs: toOptionalNumber(thresholds?.carbs),
      fat: toOptionalNumber(thresholds?.fat),
    },
  }
}

export const mergeHealthCheckSettings = (
  base: HealthCheckSettings,
  overrides?: Partial<HealthCheckSettings>,
) => ({
  ...base,
  ...(overrides || {}),
  thresholds: {
    ...base.thresholds,
    ...(overrides?.thresholds || {}),
  },
})
