const fs = require('fs')
const path = require('path')

const LOG_FILE = path.join(process.cwd(), 'openai-usage', 'vision-usage.log')

function loadEntries() {
  if (!fs.existsSync(LOG_FILE)) {
    console.log('No vision usage log found at', LOG_FILE)
    return []
  }
  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean)
  const entries = []
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line))
    } catch {
      // skip bad line
    }
  }
  return entries
}

function summarize(entries) {
  const grouped = {}
  entries.forEach((row) => {
    const key = row.feature || 'unknown'
    if (!grouped[key]) {
      grouped[key] = {
        count: 0,
        promptTokens: 0,
        completionTokens: 0,
        costCents: 0,
        maxWidth: null,
        maxHeight: null,
      }
    }
    const b = grouped[key]
    b.count += 1
    b.promptTokens += Number(row.promptTokens || 0)
    b.completionTokens += Number(row.completionTokens || 0)
    b.costCents += Number(row.costCents || 0)
    if (row.imageWidth && row.imageHeight) {
      b.maxWidth = b.maxWidth ? Math.max(b.maxWidth, row.imageWidth) : row.imageWidth
      b.maxHeight = b.maxHeight ? Math.max(b.maxHeight, row.imageHeight) : row.imageHeight
    }
  })
  return grouped
}

function printSummary(grouped) {
  const entries = Object.entries(grouped)
  if (entries.length === 0) {
    console.log('No vision usage entries found.')
    return
  }

  console.log('\n=== Vision Usage Dashboard (from disk) ===')
  entries.forEach(([feature, stats]) => {
    const totalTokens = stats.promptTokens + stats.completionTokens
    const res = stats.maxWidth && stats.maxHeight ? `${stats.maxWidth}x${stats.maxHeight} (max observed)` : 'n/a'
    console.log(
      `- ${feature}: ${stats.count} call(s), tokens p/c: ${stats.promptTokens}/${stats.completionTokens} (total ${totalTokens}), cost: ${(stats.costCents / 100).toFixed(
        2
      )} USD, resolution: ${res}`
    )
  })
  console.log('=== End Vision Usage Dashboard ===\n')
}

const entries = loadEntries()
const grouped = summarize(entries)
printSummary(grouped)
