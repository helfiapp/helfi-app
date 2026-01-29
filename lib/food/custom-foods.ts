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
const SOURCE_FILES = ['nuts_legumes_macros.csv', 'roasted_nut_variants_macros.csv']

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

const nameMatchesQuery = (name: string, query: string, options?: { allowTypo?: boolean }) => {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return false
  if (normalizedQuery.length === 1) {
    const nameTokens = getTokens(name)
    return nameTokens.some((word) => word.startsWith(normalizedQuery))
  }

  const queryTokens = getTokens(query).filter((token) => token.length >= 2)
  const nameTokens = getTokens(name)
  if (queryTokens.length === 0 || nameTokens.length === 0) return false

  const tokenMatches = (token: string, word: string) => {
    if (!token || !word) return false
    const matchToken = (value: string) => {
      if (word.startsWith(value)) return true
      const singularWord = singularizeToken(word)
      if (singularWord !== word && singularWord.startsWith(value)) return true
      const allowTypo = (options?.allowTypo ?? true) && value.length >= 3 && value[0] === word[0]
      if (!allowTypo) return false
      const prefixSame = word.slice(0, value.length)
      if (prefixSame && isOneEditAway(value, prefixSame)) return true
      const prefixLonger = word.slice(0, value.length + 1)
      if (prefixLonger && isOneEditAway(value, prefixLonger)) return true
      return false
    }
    if (matchToken(token)) return true
    const singular = singularizeToken(token)
    if (singular !== token && matchToken(singular)) return true
    return false
  }

  if (queryTokens.length === 1) return nameTokens.some((word) => tokenMatches(queryTokens[0], word))
  return queryTokens.every((token) => nameTokens.some((word) => tokenMatches(token, word)))
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

export const searchCustomFoodMacros = (query: string, limit = 10): CustomFoodMacro[] => {
  const q = String(query || '').trim()
  if (!q) return []
  const items = loadCustomFoods()
  if (items.length === 0) return []
  const prefixMatches = items.filter((item) => nameMatchesQuery(item.name, q, { allowTypo: false }))
  const matches = (prefixMatches.length > 0 ? prefixMatches : items.filter((item) => nameMatchesQuery(item.name, q, { allowTypo: true }))).sort(
    (a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)),
  )
  if (matches.length === 0) return []
  return matches.slice(0, Math.max(1, limit))
}
