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

const MAX_SNIPPETS = 8
const MAX_SNIPPET_CHARS = 1200
const MAX_KEYWORDS = 12

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

export function buildSupportCodeContext(message: string): string {
  const keywords = extractKeywords(message)
  if (keywords.length === 0) return ''

  const entries = (supportCodeIndex as { entries?: SupportCodeIndexEntry[] }).entries || []
  const scored = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, keywords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SNIPPETS)

  if (scored.length === 0) return ''

  const lines = ['Relevant code snippets (read-only, internal only):']
  scored.forEach(({ entry }) => {
    const snippet = buildSnippet(entry, keywords)
    lines.push(`- ${entry.path}${entry.truncated ? ' (truncated)' : ''}`)
    lines.push(snippet)
  })

  return lines.join('\n')
}
