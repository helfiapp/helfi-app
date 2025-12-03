import fs from 'fs'
import path from 'path'

export type VisionUsageEntry = {
  timestamp: number
  scanId?: string | null
  feature: string
  userId?: string | null
  userLabel?: string | null
  model: string
  promptTokens: number
  completionTokens: number
  costCents: number
  imageWidth: number | null
  imageHeight: number | null
  imageBytes: number | null
  imageMime: string | null
  endpoint?: string | null
  detail?: string | null
}

const GLOBAL_KEY = '__helfiVisionUsage__'
const LOG_DIR = path.join(process.cwd(), 'openai-usage')
const LOG_FILE = path.join(LOG_DIR, 'vision-usage.log')
const DEFAULT_DISK_LIMIT = 1000

function getStore(): VisionUsageEntry[] {
  const globalAny = globalThis as any
  if (!globalAny[GLOBAL_KEY]) {
    globalAny[GLOBAL_KEY] = []
  }
  return globalAny[GLOBAL_KEY]
}

export function logVisionUsage(entry: VisionUsageEntry) {
  const store = getStore()
  store.push(entry)

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8')
  } catch (err) {
    console.warn('[vision-usage] failed to persist log entry', err)
  }
}

export function getVisionUsageSummary(entries?: VisionUsageEntry[]) {
  const data = (entries && entries.length > 0 ? entries : getStore()).slice()
  const grouped: Record<
    string,
    {
      count: number
      tokens: number
      promptTokens: number
      completionTokens: number
      costCents: number
      avgResolution: string
      maxWidth: number | null
      maxHeight: number | null
      models: Record<string, number>
    }
  > = {}

  data.forEach((row) => {
    const key = row.feature || 'unknown'
    if (!grouped[key]) {
      grouped[key] = {
        count: 0,
        tokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        costCents: 0,
        avgResolution: '',
        maxWidth: null,
        maxHeight: null,
        models: {},
      }
    }
    const bucket = grouped[key]
    bucket.count += 1
    bucket.promptTokens += Number(row.promptTokens || 0)
    bucket.completionTokens += Number(row.completionTokens || 0)
    bucket.tokens = bucket.promptTokens + bucket.completionTokens
    bucket.costCents += Number(row.costCents || 0)
    if (row.model) {
      bucket.models[row.model] = (bucket.models[row.model] || 0) + 1
    }
    if (row.imageWidth && row.imageHeight) {
      bucket.maxWidth = bucket.maxWidth ? Math.max(bucket.maxWidth, row.imageWidth) : row.imageWidth
      bucket.maxHeight = bucket.maxHeight ? Math.max(bucket.maxHeight, row.imageHeight) : row.imageHeight
    }
  })

  Object.keys(grouped).forEach((key) => {
    const b = grouped[key]
    if (b.maxWidth && b.maxHeight) {
      b.avgResolution = `${b.maxWidth}x${b.maxHeight} (max observed)`
    } else {
      b.avgResolution = 'n/a'
    }
  })

  return grouped
}

export function printVisionUsageSummary(entries?: VisionUsageEntry[]) {
  const summary = getVisionUsageSummary(entries)
  const rows = Object.entries(summary)
  if (rows.length === 0) {
    console.log('[vision-usage] No entries logged yet.')
    return
  }

  console.log('\n=== Vision Usage by Feature ===')
  rows.forEach(([feature, stats]) => {
    console.log(
      `- ${feature}: ${stats.count} call(s), tokens p/c: ${stats.promptTokens}/${stats.completionTokens} (total ${stats.tokens}), cost: ${(stats.costCents / 100).toFixed(
        2
      )} USD, resolution: ${stats.avgResolution}`
    )
  })
  console.log('=== End Vision Usage ===\n')
}

export function loadVisionUsageFromDisk(limit: number = DEFAULT_DISK_LIMIT): VisionUsageEntry[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return []
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean)
    const slice = lines.slice(-Math.max(1, limit))
    const entries: VisionUsageEntry[] = []
    for (const line of slice) {
      try {
        const parsed = JSON.parse(line)
        entries.push(parsed)
      } catch {
        // skip malformed
      }
    }
    return entries
  } catch (err) {
    console.warn('[vision-usage] failed to read log file', err)
    return []
  }
}

export function buildVisionUsageAnalytics(entries?: VisionUsageEntry[]) {
  const data = (entries && entries.length ? entries : getStore()).slice()
  const featureSummary: Record<
    string,
    {
      count: number
      promptTokens: number
      completionTokens: number
      costCents: number
      models: Record<string, number>
      maxWidth: number | null
      maxHeight: number | null
    }
  > = {}

  const userSummary: Record<
    string,
    {
      label: string
      count: number
      promptTokens: number
      completionTokens: number
      costCents: number
      features: Record<string, number>
    }
  > = {}

  const trendByDay: Record<string, { costCents: number; calls: number }> = {}

  let monthCostCents = 0
  let monthPromptTokens = 0
  let monthCompletionTokens = 0
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  data.forEach((row) => {
    // Feature aggregation
    const fKey = row.feature || 'unknown'
    if (!featureSummary[fKey]) {
      featureSummary[fKey] = {
        count: 0,
        promptTokens: 0,
        completionTokens: 0,
        costCents: 0,
        models: {},
        maxWidth: null,
        maxHeight: null,
      }
    }
    const f = featureSummary[fKey]
    f.count += 1
    f.promptTokens += Number(row.promptTokens || 0)
    f.completionTokens += Number(row.completionTokens || 0)
    f.costCents += Number(row.costCents || 0)
    if (row.model) {
      f.models[row.model] = (f.models[row.model] || 0) + 1
    }
    if (row.imageWidth && row.imageHeight) {
      f.maxWidth = f.maxWidth ? Math.max(f.maxWidth, row.imageWidth) : row.imageWidth
      f.maxHeight = f.maxHeight ? Math.max(f.maxHeight, row.imageHeight) : row.imageHeight
    }

    // User aggregation
    const userKey = row.userId || row.userLabel || 'unknown'
    const userLabel = row.userLabel || row.userId || 'unknown'
    if (!userSummary[userKey]) {
      userSummary[userKey] = {
        label: userLabel,
        count: 0,
        promptTokens: 0,
        completionTokens: 0,
        costCents: 0,
        features: {},
      }
    }
    const u = userSummary[userKey]
    u.count += 1
    u.promptTokens += Number(row.promptTokens || 0)
    u.completionTokens += Number(row.completionTokens || 0)
    u.costCents += Number(row.costCents || 0)
    u.features[fKey] = (u.features[fKey] || 0) + 1

    // Trend by day
    const day = new Date(Number(row.timestamp || Date.now())).toISOString().slice(0, 10)
    if (!trendByDay[day]) {
      trendByDay[day] = { costCents: 0, calls: 0 }
    }
    trendByDay[day].costCents += Number(row.costCents || 0)
    trendByDay[day].calls += 1

    // Month-to-date
    if (Number(row.timestamp) >= monthStart) {
      monthCostCents += Number(row.costCents || 0)
      monthPromptTokens += Number(row.promptTokens || 0)
      monthCompletionTokens += Number(row.completionTokens || 0)
    }
  })

  const trend = Object.entries(trendByDay)
    .map(([day, v]) => ({ day, costCents: v.costCents, calls: v.calls }))
    .sort((a, b) => a.day.localeCompare(b.day))

  const scans = data
    .slice()
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
    .map((row) => ({
      ...row,
      tokens: Number(row.promptTokens || 0) + Number(row.completionTokens || 0),
      costUsd: Number(row.costCents || 0) / 100,
      timestampIso: new Date(Number(row.timestamp || Date.now())).toISOString(),
    }))

  const totals = {
    totalCalls: data.length,
    totalCostCents: data.reduce((acc, r) => acc + Number(r.costCents || 0), 0),
    totalPromptTokens: data.reduce((acc, r) => acc + Number(r.promptTokens || 0), 0),
    totalCompletionTokens: data.reduce((acc, r) => acc + Number(r.completionTokens || 0), 0),
    monthCostCents,
    monthPromptTokens,
    monthCompletionTokens,
  }

  return { featureSummary, userSummary, trend, scans, totals }
}
