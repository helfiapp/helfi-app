import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import fs from 'fs'
import path from 'path'
import { buildCustomFoodAliases, buildCustomFoodKey } from '../lib/food/custom-food-import'
import { loadFastFoodMenuItems } from '../lib/food/fast-food-menus'

type MacroRow = {
  name: string
  brand: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
  sugar_g: number | null
}

type ServingOption = {
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

const parseBrand = (name: string) => {
  const match = name.match(/\(([^)]+)\)$/)
  const brand = match ? String(match[1]).trim() : null
  const cleanName = match ? name.replace(/\s*\([^)]+\)$/, '').trim() : name.trim()
  return { brand, cleanName }
}

const toJsonInput = (value: any[] | null | undefined) => {
  if (value === undefined) return undefined
  if (value === null) return Prisma.DbNull
  return value
}

const readMacroFile = (fileName: string): MacroRow[] => {
  const filePath = path.join(DATA_DIR, fileName)
  const parsed = parseCsv(filePath)
  if (!parsed.records.length) return []
  const headerIndex = new Map<string, number>()
  parsed.headers.forEach((header, index) => headerIndex.set(header, index))

  const get = (row: string[], key: string) => {
    const idx = headerIndex.get(key)
    if (idx == null) return ''
    return row[idx] ?? ''
  }

  const fiberKey = headerIndex.has('fiber_g') ? 'fiber_g' : 'fibre_g'
  const rows: MacroRow[] = []

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
    const parsedBrand = parseBrand(name)
    rows.push({
      name: parsedBrand.cleanName,
      brand: parsedBrand.brand,
      calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      fiber_g: fiber,
      sugar_g: sugar,
    })
  }

  return rows
}

const importRows = async () => {
  const singleFiles = ['master_foods_macros.csv', 'meat_seafood_protein_macros.csv']
  const beverageRows = readMacroFile('beverages_macros.csv')
  const fastFoodMenus = loadFastFoodMenuItems()

  const singleRows = singleFiles.flatMap((file) => readMacroFile(file))

  const upsertItem = async (payload: {
    name: string
    brand: string | null
    country?: string | null
    kind: 'SINGLE' | 'PACKAGED' | 'FAST_FOOD'
    group: string | null
    caloriesPer100g: number | null
    proteinPer100g: number | null
    carbsPer100g: number | null
    fatPer100g: number | null
    fiberPer100g: number | null
    sugarPer100g: number | null
    aliases: string[]
    servingOptions?: any[] | null
  }) => {
    const key = buildCustomFoodKey({
      name: payload.name,
      brand: payload.brand,
      kind: payload.kind,
      country: payload.country ?? null,
    })
    await prisma.customFoodItem.upsert({
      where: { key },
      create: {
        key,
        name: payload.name,
        brand: payload.brand,
        country: payload.country ?? null,
        kind: payload.kind,
        group: payload.group,
        caloriesPer100g: payload.caloriesPer100g,
        proteinPer100g: payload.proteinPer100g,
        carbsPer100g: payload.carbsPer100g,
        fatPer100g: payload.fatPer100g,
        fiberPer100g: payload.fiberPer100g,
        sugarPer100g: payload.sugarPer100g,
        aliases: payload.aliases,
        servingOptions: toJsonInput(payload.servingOptions),
      },
      update: {
        name: payload.name,
        brand: payload.brand,
        country: payload.country ?? null,
        kind: payload.kind,
        group: payload.group,
        caloriesPer100g: payload.caloriesPer100g,
        proteinPer100g: payload.proteinPer100g,
        carbsPer100g: payload.carbsPer100g,
        fatPer100g: payload.fatPer100g,
        fiberPer100g: payload.fiberPer100g,
        sugarPer100g: payload.sugarPer100g,
        aliases: payload.aliases,
        servingOptions: toJsonInput(payload.servingOptions),
      },
    })
  }

  for (const row of singleRows) {
    await upsertItem({
      name: row.name,
      brand: row.brand,
      kind: 'SINGLE',
      group: 'single',
      caloriesPer100g: row.calories,
      proteinPer100g: row.protein_g,
      carbsPer100g: row.carbs_g,
      fatPer100g: row.fat_g,
      fiberPer100g: row.fiber_g,
      sugarPer100g: row.sugar_g,
      aliases: buildCustomFoodAliases(row.name, row.brand),
      servingOptions: null,
    })
  }

  for (const row of beverageRows) {
    await upsertItem({
      name: row.name,
      brand: row.brand,
      kind: 'PACKAGED',
      group: 'beverage',
      caloriesPer100g: row.calories,
      proteinPer100g: row.protein_g,
      carbsPer100g: row.carbs_g,
      fatPer100g: row.fat_g,
      fiberPer100g: row.fiber_g,
      sugarPer100g: row.sugar_g,
      aliases: buildCustomFoodAliases(row.name, row.brand),
      servingOptions: null,
    })
  }

  for (const item of fastFoodMenus) {
    const aliases = buildCustomFoodAliases(item.name, item.chain)
    await upsertItem({
      name: item.name,
      brand: item.chain,
      country: item.country,
      kind: 'FAST_FOOD',
      group: 'fast_food',
      caloriesPer100g: null,
      proteinPer100g: null,
      carbsPer100g: null,
      fatPer100g: null,
      fiberPer100g: null,
      sugarPer100g: null,
      aliases,
      servingOptions: item.servingOptions,
    })
  }
}

const run = async () => {
  await importRows()
  const total = await prisma.customFoodItem.count()
  console.log(`✅ Custom foods ready. Total: ${total}`)
}

run()
  .catch((error) => {
    console.error('❌ Custom foods import failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
