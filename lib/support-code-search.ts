import supportCodeIndex from '@/data/support-code-index.json'

type SupportCodeIndexEntry = {
  path: string
  content: string
  truncated?: boolean
  size?: number
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'your',
  'you',
  'are',
  'not',
  'have',
  'has',
  'was',
  'were',
  'what',
  'when',
  'where',
  'why',
  'how',
  'can',
  'cant',
  'cannot',
  'help',
  'issue',
  'problem',
  'error',
  'support',
  'ticket',
  'chat',
  'app',
  'site',
  'page',
  'user',
])

const MAX_SNIPPETS = 10
const MAX_SNIPPET_CHARS = 1200
const MAX_KEYWORDS = 12
const MAX_FORCED_ENTRIES = 4

const MODULE_HINTS: Array<{ pattern: RegExp; paths: string[] }> = [
  { pattern: /food|diary|meal|nutrition|barcode/i, paths: ['app/food/'] },
  { pattern: /symptom/i, paths: ['app/symptoms/', 'app/api/analyze-symptoms/'] },
  { pattern: /medical image|image analyzer|image analysis/i, paths: ['app/medical-images/'] },
  { pattern: /insight|weekly report|report/i, paths: ['app/insights/', 'lib/insights/'] },
  { pattern: /chat|talk to ai|voice/i, paths: ['app/chat/', 'components/VoiceChat.tsx'] },
  { pattern: /mood|journal/i, paths: ['app/mood/'] },
  { pattern: /check-?in|daily check/i, paths: ['app/check-in/'] },
  { pattern: /health tracking|device|fitbit|garmin/i, paths: ['app/health-tracking/', 'app/devices/'] },
  { pattern: /affiliate|referral/i, paths: ['app/affiliate/', 'app/api/affiliate/'] },
  { pattern: /billing|subscription|credits|payment/i, paths: ['app/billing/', 'app/api/billing/'] },
  { pattern: /account|profile|settings/i, paths: ['app/account/', 'app/profile/', 'app/settings/'] },
  { pattern: /support|ticket/i, paths: ['app/support/', 'components/support/SupportChatWidget.tsx', 'lib/support-automation.ts'] },
]

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !STOPWORDS.has(word))
    .slice(0, MAX_KEYWORDS)
}

function scoreEntry(entry: SupportCodeIndexEntry, keywords: string[]): number {
  const path = entry.path.toLowerCase()
  const content = entry.content.toLowerCase()
  let score = 0
  keywords.forEach((keyword) => {
    if (path.includes(keyword)) score += 3
    if (content.includes(keyword)) score += 1
  })
  return score
}

function buildSnippet(entry: SupportCodeIndexEntry, keywords: string[]): string {
  const content = entry.content
  const lower = content.toLowerCase()
  let index = -1
  for (const keyword of keywords) {
    index = lower.indexOf(keyword)
    if (index !== -1) break
  }
  let snippet = ''
  if (index === -1) {
    snippet = content.slice(0, MAX_SNIPPET_CHARS)
  } else {
    const start = Math.max(0, index - 320)
    const end = Math.min(content.length, index + 520)
    snippet = content.slice(start, end)
    if (start > 0) snippet = `...${snippet}`
    if (end < content.length) snippet = `${snippet}...`
  }
  return snippet.length > MAX_SNIPPET_CHARS ? `${snippet.slice(0, MAX_SNIPPET_CHARS)}...` : snippet
}

function findEntriesByHint(entries: SupportCodeIndexEntry[], hintPath: string): SupportCodeIndexEntry[] {
  if (hintPath.endsWith('/')) {
    return entries.filter((entry) => entry.path.startsWith(hintPath)).slice(0, 2)
  }
  return entries.filter((entry) => entry.path === hintPath)
}

function collectModuleEntries(message: string, entries: SupportCodeIndexEntry[]): SupportCodeIndexEntry[] {
  const lower = message.toLowerCase()
  const matched: SupportCodeIndexEntry[] = []
  MODULE_HINTS.forEach((hint) => {
    if (!hint.pattern.test(lower)) return
    hint.paths.forEach((pathHint) => {
      matched.push(...findEntriesByHint(entries, pathHint))
    })
  })
  const seen = new Set<string>()
  const unique = matched.filter((entry) => {
    if (seen.has(entry.path)) return false
    seen.add(entry.path)
    return true
  })
  return unique.slice(0, MAX_FORCED_ENTRIES)
}

export function buildSupportCodeContext(message: string): string {
  const entries = (supportCodeIndex as { entries?: SupportCodeIndexEntry[] }).entries || []
  const keywords = extractKeywords(message)
  const forcedEntries = collectModuleEntries(message, entries)
  const forcedPaths = new Set(forcedEntries.map((entry) => entry.path))

  const scored = keywords.length === 0
    ? []
    : entries
        .map((entry) => ({ entry, score: scoreEntry(entry, keywords) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)

  const combined = [
    ...forcedEntries.map((entry) => ({ entry, score: 999 })),
    ...scored.filter((item) => !forcedPaths.has(item.entry.path)),
  ].slice(0, MAX_SNIPPETS)

  if (combined.length === 0) return ''

  const lines = ['Relevant code snippets (read-only, internal only):']
  combined.forEach(({ entry }) => {
    const snippet = buildSnippet(entry, keywords)
    lines.push(`- ${entry.path}${entry.truncated ? ' (truncated)' : ''}`)
    lines.push(snippet)
  })

  return lines.join('\n')
}
