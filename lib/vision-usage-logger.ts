import fs from 'fs'
import path from 'path'

export type VisionUsageEntry = {
  timestamp: number
  feature: string
  model: string
  promptTokens: number
  completionTokens: number
  costCents: number
  imageWidth: number | null
  imageHeight: number | null
  imageBytes: number | null
  imageMime: string | null
  endpoint?: string | null
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
      }
    }
    const bucket = grouped[key]
    bucket.count += 1
    bucket.promptTokens += Number(row.promptTokens || 0)
    bucket.completionTokens += Number(row.completionTokens || 0)
    bucket.tokens = bucket.promptTokens + bucket.completionTokens
    bucket.costCents += Number(row.costCents || 0)
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
