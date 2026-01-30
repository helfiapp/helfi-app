import 'server-only'
import fs from 'fs'
import path from 'path'

export type CustomFoodMacro = {
  name: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  sugar_g: number | null
}

const DATA_DIR = path.join(process.cwd(), 'data', 'food-overrides')
// Master list generated from the existing "food-import" CSVs + USDA macros (auto-filled).
// See: scripts/generate-master-food-macros.mjs
// Custom CSV files with macros are included directly (meat_seafood_protein_macros.csv, etc.)
const SOURCE_FILES = ['master_foods_macros.csv', 'meat_seafood_protein_macros.csv']

let cachedItems: CustomFoodMacro[] | null = null

const normalizeText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const singularizeToken = (value: string) => {
  const lower = value.toLowerCase()
  if (lower.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`
  if (
    lower.endsWith('es') &&
    value.length > 3 &&
    !lower.endsWith('ses') &&
    !lower.endsWith('xes') &&
    !lower.endsWith('zes') &&
    !lower.endsWith('ches') &&
    !lower.endsWith('shes')
  ) {
    return value.slice(0, -2)
  }
  if (lower.endsWith('s') && value.length > 3 && !lower.endsWith('ss')) return value.slice(0, -1)
  return value
}

const getTokens = (value: string) => normalizeText(value).split(' ').filter(Boolean)

const isOneEditAway = (a: string, b: string) => {
  const lenA = a.length
  const lenB = b.length
  if (Math.abs(lenA - lenB) > 1) return false
  if (lenA === lenB) {
    let mismatches = 0
    for (let i = 0; i < lenA; i += 1) {
      if (a[i] !== b[i]) {
        mismatches += 1
        if (mismatches > 1) return false
      }
    }
    return mismatches <= 1
  }
  const shorter = lenA < lenB ? a : b
  const longer = lenA < lenB ? b : a
  let i = 0
  let j = 0
  let edits = 0
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1
      j += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    j += 1
  }
  return true
}

// Strip parentheses and their content to prevent synonym matching
const stripParentheses = (text: string) => {
  return text.replace(/\s*\([^)]*\)/g, '').trim()
}

const nameMatchesQuery = (name: string, query: string, options?: { allowTypo?: boolean }) => {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return false

  // Strip parentheses from name to prevent matching via synonyms
  const nameWithoutParentheses = stripParentheses(name)
  const nameTokens = getTokens(nameWithoutParentheses)

  if (normalizedQuery.length === 1) {
    // Single letter: first word must start with it
    if (nameTokens.length === 0) return false
    const firstWord = nameTokens[0]
    return firstWord.startsWith(normalizedQuery)
  }

  const queryTokens = getTokens(query).filter((token) => token.length >= 2)
  const filteredNameTokens = nameTokens.filter((token) => token.length >= 1)
  if (queryTokens.length === 0 || filteredNameTokens.length === 0) return false

  // For single-word queries: FIRST word must match (strict prefix matching)
  if (queryTokens.length === 1) {
    const queryToken = queryTokens[0]
    const firstWord = filteredNameTokens[0]
    if (!firstWord) return false

    // Exact word match (egg = egg, eggs = eggs)
    if (firstWord === queryToken) return true
    
    // Singular/plural exact matches only (eggs = egg, but NOT eggs = eggplant)
    const firstWordSingular = singularizeToken(firstWord)
    const querySingular = singularizeToken(queryToken)
    
    // Exact singular match: "eggs" matches "egg" exactly, "egg" matches "eggs" exactly
    if (firstWordSingular === querySingular) {
      // Both are the same after singularization - this is an exact match
      return true
    }

    // Prefix match: first word must START with the FULL query token
    // This allows "egg" to match "eggplant" but NOT "eggs" to match "eggplant"
    // (because "eggplant" doesn't start with "eggs", only with "egg")
    if (firstWord.startsWith(queryToken)) return true

    // Typo tolerance: only if first letter matches and it's a prefix match
    const allowTypo = (options?.allowTypo ?? true) && queryToken.length >= 3 && queryToken[0] === firstWord[0]
    if (allowTypo) {
      const prefixSame = firstWord.slice(0, queryToken.length)
      if (prefixSame && isOneEditAway(queryToken, prefixSame)) return true
      const prefixLonger = firstWord.slice(0, queryToken.length + 1)
      if (prefixLonger && isOneEditAway(queryToken, prefixLonger)) return true
    }

    return false
  }

  // Multi-word queries: first query token must match first name word, then all tokens must match
  const firstQueryToken = queryTokens[0]
  const firstNameWord = filteredNameTokens[0]
  if (!firstNameWord) return false

  // First word must match first token
  const firstWordMatches = (() => {
    if (firstNameWord === firstQueryToken) return true
    const firstNameSingular = singularizeToken(firstNameWord)
    const firstQuerySingular = singularizeToken(firstQueryToken)
    if (firstNameSingular === firstQuerySingular) return true
    if (firstNameWord.startsWith(firstQueryToken)) return true
    if (firstNameSingular !== firstNameWord && firstNameSingular.startsWith(firstQueryToken)) return true
    if (firstQuerySingular !== firstQueryToken && firstNameWord.startsWith(firstQuerySingular)) return true
    return false
  })()

  if (!firstWordMatches) return false

  // All remaining query tokens must match somewhere in the name
  const remainingQueryTokens = queryTokens.slice(1)
  if (remainingQueryTokens.length === 0) return true

  const tokenMatches = (token: string, word: string) => {
    if (!token || !word) return false
    if (word.startsWith(token)) return true
    const singularWord = singularizeToken(word)
    if (singularWord !== word && singularWord.startsWith(token)) return true
    const singularToken = singularizeToken(token)
    if (singularToken !== token && word.startsWith(singularToken)) return true
    if (singularToken !== token && singularWord !== word && singularWord.startsWith(singularToken)) return true
    return false
  }

  return remainingQueryTokens.every((token) => filteredNameTokens.some((word) => tokenMatches(token, word)))
}

const parseCsvLine = (line: string) => {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current)
  return cells.map((cell) => cell.trim())
}

const parseCsv = (text: string) => {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (rows.length === 0) return { headers: [] as string[], records: [] as string[][] }
  const headers = parseCsvLine(rows[0]).map((header) => header.toLowerCase())
  const records = rows.slice(1).map((line) => parseCsvLine(line))
  return { headers, records }
}

const toNumber = (value: string | undefined | null) => {
  if (value == null) return null
  const num = Number(String(value).trim())
  return Number.isFinite(num) ? num : null
}

const loadCustomFoods = () => {
  if (cachedItems) return cachedItems
  const items: CustomFoodMacro[] = []

  for (const fileName of SOURCE_FILES) {
    const filePath = path.join(DATA_DIR, fileName)
    if (!fs.existsSync(filePath)) continue
    const content = fs.readFileSync(filePath, 'utf8')
    const parsed = parseCsv(content)
    const headerIndex = new Map<string, number>()
    parsed.headers.forEach((header, index) => headerIndex.set(header, index))

    const get = (row: string[], key: string) => {
      const idx = headerIndex.get(key)
      if (idx == null) return ''
      return row[idx] ?? ''
    }

    const fiberKey = headerIndex.has('fiber_g') ? 'fiber_g' : 'fibre_g'

    for (const row of parsed.records) {
      const name = String(get(row, 'food') || '').trim()
      if (!name) continue
      const calories = toNumber(get(row, 'per_100g_kcal'))
      const protein = toNumber(get(row, 'protein_g'))
      const carbs = toNumber(get(row, 'carbs_g'))
      const fat = toNumber(get(row, 'fat_g'))
      const fiber = toNumber(get(row, fiberKey))
      const sugar = toNumber(get(row, 'sugar_g'))
      if (calories == null || protein == null || carbs == null || fat == null) continue

      items.push({
        name,
        calories,
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat,
        fiber_g: fiber,
        sugar_g: sugar,
      })
    }
  }

  cachedItems = items
  return items
}

export const searchCustomFoodMacros = (
  query: string,
  limit = 10,
  options?: { allowTypo?: boolean },
): CustomFoodMacro[] => {
  const q = String(query || '').trim()
  if (!q) return []
  const items = loadCustomFoods()
  if (items.length === 0) return []
  const prefixMatches = items.filter((item) => nameMatchesQuery(item.name, q, { allowTypo: false }))
  const allowTypo = options?.allowTypo ?? true
  const matches = (
    prefixMatches.length > 0 || !allowTypo ? prefixMatches : items.filter((item) => nameMatchesQuery(item.name, q, { allowTypo: true }))
  ).sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)))
  if (matches.length === 0) return []
  return matches.slice(0, Math.max(1, limit))
}
