import fs from 'fs'
import path from 'path'

import { buildCustomFoodServingOptions } from '../lib/food/custom-serving-options'

type MacroRow = {
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
  sugar_g: number | null
}

const DATA_DIR = path.join(process.cwd(), 'data', 'food-overrides')

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

const toNumber = (value: string | undefined | null) => {
  if (value == null || value === '') return null
  const num = Number(String(value).trim())
  return Number.isFinite(num) ? num : null
}

const parseBrand = (name: string) => {
  const match = name.match(/\(([^)]+)\)$/)
  return match ? name.replace(/\s*\([^)]+\)$/, '').trim() : name.trim()
}

const readMacroRows = (fileName: string): MacroRow[] => {
  const filePath = path.join(DATA_DIR, fileName)
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const headers = parseCsvLine(lines[0] || '').map((header) => header.toLowerCase())
  const headerIndex = new Map<string, number>()
  headers.forEach((header, index) => headerIndex.set(header, index))
  const get = (row: string[], key: string) => row[headerIndex.get(key) ?? -1] ?? ''
  const fiberKey = headerIndex.has('fiber_g') ? 'fiber_g' : 'fibre_g'

  return lines.slice(1).flatMap((line) => {
    const row = parseCsvLine(line)
    const rawName = get(row, 'food').trim()
    if (!rawName) return []
    const calories = toNumber(get(row, 'per_100g_kcal'))
    const protein = toNumber(get(row, 'protein_g'))
    const carbs = toNumber(get(row, 'carbs_g'))
    const fat = toNumber(get(row, 'fat_g'))
    if (calories == null || protein == null || carbs == null || fat == null) return []
    return [
      {
        name: parseBrand(rawName),
        calories,
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat,
        fiber_g: toNumber(get(row, fiberKey)),
        sugar_g: toNumber(get(row, 'sugar_g')),
      },
    ]
  })
}

const normalize = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const includesLabel = (labels: string[], needle: string) =>
  labels.some((label) => normalize(label).includes(normalize(needle)))

const rows = [
  ...readMacroRows('master_foods_macros.csv'),
  ...readMacroRows('meat_seafood_protein_macros.csv'),
]

const failures: string[] = []

rows.forEach((row) => {
  const options = buildCustomFoodServingOptions({
    name: row.name,
    kind: 'SINGLE',
    caloriesPer100g: row.calories,
    proteinPer100g: row.protein_g,
    carbsPer100g: row.carbs_g,
    fatPer100g: row.fat_g,
    fiberPer100g: row.fiber_g,
    sugarPer100g: row.sugar_g,
  })
  if (options.length === 0) {
    failures.push(`${row.name}: no serving options`)
    return
  }
  const labels = options.map((option) => option.label || option.serving_size)
  if (!includesLabel(labels, '100 g') && !includesLabel(labels, '100 ml')) {
    failures.push(`${row.name}: missing metric base serving`)
  }
  if (!includesLabel(labels, '1 oz') && !includesLabel(labels, 'ml')) {
    failures.push(`${row.name}: missing ounce or liquid-style serving`)
  }
})

const requiredLabels: Record<string, string[]> = {
  Banana: ['100 g', '1 oz', 'small banana', 'medium banana', 'large banana', 'extra large banana'],
  Apple: ['small apple', 'medium apple', 'large apple', 'extra large apple'],
  Orange: ['small orange', 'medium orange', 'large orange', 'extra large orange'],
  Avocado: ['small avocado', 'medium avocado', 'large avocado', 'extra large avocado'],
  Egg: ['small egg', 'medium egg', 'large egg', 'extra large egg'],
  'Sourdough toast': ['100 g', '1 oz', 'slice'],
  'Greek yogurt': ['100 g', '1 oz'],
}

Object.entries(requiredLabels).forEach(([name, required]) => {
  const row = rows.find((entry) => normalize(entry.name) === normalize(name))
  if (!row) {
    failures.push(`${name}: missing from custom/plain food CSV`)
    return
  }
  const labels = buildCustomFoodServingOptions({
    name: row.name,
    kind: 'SINGLE',
    caloriesPer100g: row.calories,
    proteinPer100g: row.protein_g,
    carbsPer100g: row.carbs_g,
    fatPer100g: row.fat_g,
    fiberPer100g: row.fiber_g,
    sugarPer100g: row.sugar_g,
  }).map((option) => option.label || option.serving_size)
  required.forEach((label) => {
    if (!includesLabel(labels, label)) failures.push(`${name}: missing ${label}`)
  })
})

const calorieRanges: Record<string, [number, number]> = {
  Banana: [80, 100],
  Orange: [40, 60],
  Avocado: [140, 180],
  Egg: [130, 160],
  'Greek yogurt': [80, 120],
  'Sourdough toast': [230, 320],
}

Object.entries(calorieRanges).forEach(([name, [min, max]]) => {
  const row = rows.find((entry) => normalize(entry.name) === normalize(name))
  if (!row) return
  if (row.calories < min || row.calories > max) {
    failures.push(`${name}: calories per 100g look wrong (${row.calories})`)
  }
})

if (failures.length > 0) {
  console.error('Custom/plain food serving check failed:')
  failures.slice(0, 80).forEach((failure) => console.error(`- ${failure}`))
  if (failures.length > 80) console.error(`- plus ${failures.length - 80} more`)
  process.exit(1)
}

console.log(`Custom/plain food serving check passed for ${rows.length} rows.`)
