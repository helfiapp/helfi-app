import fs from 'fs'
import path from 'path'
import { normalizeText } from './custom-food-import'

export type FastFoodMenuServing = {
  id: string
  label: string
  serving_size: string
  grams?: number | null
  ml?: number | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
}

export type FastFoodMenuItem = {
  country: string | null
  chain: string
  name: string
  servingOptions: FastFoodMenuServing[]
  sourceUrls: string[]
}

const DATA_PATH = path.join(process.cwd(), 'data', 'food-overrides', 'fast_food_menus.csv')
const CACHE_TTL_MS = 5 * 60 * 1000
let cachedAt = 0
let cachedItems: FastFoodMenuItem[] = []

const parseCsvLine = (line: string): string[] => {
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

const parseCsv = (filePath: string) => {
  if (!fs.existsSync(filePath)) return { headers: [] as string[], records: [] as string[][] }
  const content = fs.readFileSync(filePath, 'utf8')
  const rows = content
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

const buildServingLabel = (sizeLabel: string, grams: number | null, ml: number | null) => {
  const label = String(sizeLabel || '').trim()
  if (grams && grams > 0) return `${label} (${grams} g)`
  if (ml && ml > 0) return `${label} (${ml} ml)`
  return label || '1 serving'
}

export const loadFastFoodMenuItems = () => {
  const now = Date.now()
  if (cachedItems.length > 0 && now - cachedAt < CACHE_TTL_MS) return cachedItems

  const parsed = parseCsv(DATA_PATH)
  if (!parsed.records.length) {
    cachedItems = []
    cachedAt = now
    return cachedItems
  }

  const headerIndex = new Map<string, number>()
  parsed.headers.forEach((header, index) => headerIndex.set(header, index))

  const get = (row: string[], key: string) => {
    const idx = headerIndex.get(key)
    if (idx == null) return ''
    return row[idx] ?? ''
  }

  type Row = {
    country: string | null
    chain: string
    name: string
    sizeLabel: string
    grams: number | null
    ml: number | null
    calories: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
    fiber_g: number | null
    sugar_g: number | null
    sourceUrl: string | null
  }

  const rows: Row[] = []
  for (const record of parsed.records) {
    const chain = String(get(record, 'chain') || '').trim()
    const name = String(get(record, 'item') || '').trim()
    const sizeLabel = String(get(record, 'size_label') || get(record, 'size') || '').trim()
    if (!chain || !name || !sizeLabel) continue
    const calories = toNumber(get(record, 'calories'))
    const protein = toNumber(get(record, 'protein_g'))
    const carbs = toNumber(get(record, 'carbs_g'))
    const fat = toNumber(get(record, 'fat_g'))
    if (calories == null || protein == null || carbs == null || fat == null) continue
    const country = String(get(record, 'country') || '').trim().toUpperCase() || null
    rows.push({
      country,
      chain,
      name,
      sizeLabel,
      grams: toNumber(get(record, 'grams')),
      ml: toNumber(get(record, 'ml')),
      calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      fiber_g: toNumber(get(record, 'fiber_g')),
      sugar_g: toNumber(get(record, 'sugar_g')),
      sourceUrl: String(get(record, 'source_url') || '').trim() || null,
    })
  }

  const grouped = new Map<string, FastFoodMenuItem>()
  for (const row of rows) {
    const key = `${row.country || ''}|${normalizeText(row.chain)}|${normalizeText(row.name)}`
    const existing = grouped.get(key)
    const servingLabel = buildServingLabel(row.sizeLabel, row.grams, row.ml)
    const option: FastFoodMenuServing = {
      id: `serving-${normalizeText(`${row.chain} ${row.name} ${row.sizeLabel}`)}`,
      label: servingLabel,
      serving_size: servingLabel,
      grams: row.grams,
      ml: row.ml,
      calories: row.calories,
      protein_g: row.protein_g,
      carbs_g: row.carbs_g,
      fat_g: row.fat_g,
      fiber_g: row.fiber_g,
      sugar_g: row.sugar_g,
    }

    if (existing) {
      existing.servingOptions.push(option)
      if (row.sourceUrl) existing.sourceUrls.push(row.sourceUrl)
    } else {
      grouped.set(key, {
        country: row.country,
        chain: row.chain,
        name: row.name,
        servingOptions: [option],
        sourceUrls: row.sourceUrl ? [row.sourceUrl] : [],
      })
    }
  }

  const items = Array.from(grouped.values()).map((item) => {
    const sortedOptions = [...item.servingOptions].sort((a, b) => {
      const aSize = a.grams ?? a.ml ?? 0
      const bSize = b.grams ?? b.ml ?? 0
      if (aSize === 0 || bSize === 0) return 0
      return aSize - bSize
    })
    return { ...item, servingOptions: sortedOptions }
  })

  cachedItems = items
  cachedAt = now
  return cachedItems
}
