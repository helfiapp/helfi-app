import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import fs from 'fs'
import path from 'path'

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

const normalizeText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const buildKey = (name: string, brand: string | null, kind: string) => {
  const base = `${brand ? `${brand} ` : ''}${name}`.trim()
  return `${normalizeText(base)}|${kind}`.trim()
}

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

const buildAliases = (name: string, brand: string | null) => {
  const aliases: string[] = []
  if (brand) {
    aliases.push(`${name} (${brand})`)
    aliases.push(`${brand} ${name}`)
  }
  if (brand && brand.toLowerCase().includes('&')) {
    aliases.push(`${brand.replace(/&/g, 'and')} ${name}`)
    aliases.push(`${name} (${brand.replace(/&/g, 'and')})`)
  }
  return Array.from(new Set(aliases.filter(Boolean)))
}

const getFastFoodServingSize = (itemName: string): { sizeGrams: number; servingLabel: string } => {
  const lowerName = itemName.toLowerCase()

  if (lowerName.includes('mcsmart meal')) return { sizeGrams: 490, servingLabel: '1 meal' }
  if (lowerName.includes('fish & chips') || lowerName.includes('fish and chips')) return { sizeGrams: 400, servingLabel: '1 serve' }

  if (lowerName.includes('big mac')) return { sizeGrams: 215, servingLabel: '1 burger' }
  if (lowerName.includes('quarter pounder')) return { sizeGrams: 200, servingLabel: '1 burger' }
  if (lowerName.includes('cheeseburger') && !lowerName.includes('double')) return { sizeGrams: 119, servingLabel: '1 burger' }
  if (lowerName.includes('hamburger') && !lowerName.includes('double')) return { sizeGrams: 105, servingLabel: '1 burger' }
  if (lowerName.includes('mcdouble')) return { sizeGrams: 155, servingLabel: '1 burger' }

  if (
    lowerName.includes('battered') &&
    (lowerName.includes('fish') ||
      lowerName.includes('flake') ||
      lowerName.includes('snapper') ||
      lowerName.includes('cod') ||
      lowerName.includes('barramundi') ||
      lowerName.includes('flathead'))
  ) {
    return { sizeGrams: 150, servingLabel: '1 piece' }
  }
  if (lowerName.includes('filet-o-fish')) return { sizeGrams: 142, servingLabel: '1 burger' }

  if (lowerName.includes('mcnuggets')) return { sizeGrams: 100, servingLabel: '4 pieces' }
  if (lowerName.includes('mccrispy')) return { sizeGrams: 200, servingLabel: '1 sandwich' }
  if (lowerName.includes('mcchicken')) return { sizeGrams: 153, servingLabel: '1 sandwich' }

  if (lowerName.includes('french fries') || lowerName.includes('chips')) {
    if (lowerName.includes('small')) return { sizeGrams: 80, servingLabel: '1 small' }
    if (lowerName.includes('medium')) return { sizeGrams: 110, servingLabel: '1 medium' }
    if (lowerName.includes('large')) return { sizeGrams: 150, servingLabel: '1 large' }
    return { sizeGrams: 100, servingLabel: '1 serve' }
  }
  if (lowerName.includes('hash brown')) return { sizeGrams: 52, servingLabel: '1 piece' }
  if (lowerName.includes('apple pie')) return { sizeGrams: 80, servingLabel: '1 pie' }

  if (lowerName.includes('mcflurry')) return { sizeGrams: 360, servingLabel: '1 regular' }

  if (lowerName.includes('dim sim')) return { sizeGrams: 50, servingLabel: '1 piece' }
  if (lowerName.includes('potato cake') || lowerName.includes('potato scallop')) return { sizeGrams: 75, servingLabel: '1 piece' }
  if (lowerName.includes('calamari rings')) return { sizeGrams: 100, servingLabel: '1 serve' }
  if (lowerName.includes('scallops') && lowerName.includes('battered')) return { sizeGrams: 100, servingLabel: '1 serve' }
  if (lowerName.includes('prawns') && lowerName.includes('battered')) return { sizeGrams: 100, servingLabel: '1 serve' }
  if (lowerName.includes('fish cake')) return { sizeGrams: 100, servingLabel: '1 piece' }
  if (lowerName.includes('chiko roll')) return { sizeGrams: 160, servingLabel: '1 roll' }
  if (lowerName.includes('spring roll')) return { sizeGrams: 50, servingLabel: '1 roll' }
  if (lowerName.includes('corn jack')) return { sizeGrams: 100, servingLabel: '1 piece' }
  if (lowerName.includes('onion rings')) return { sizeGrams: 91, servingLabel: '1 small serve' }
  if (lowerName.includes('mushy peas')) return { sizeGrams: 100, servingLabel: '1 serve' }
  if (lowerName.includes('curry sauce') || lowerName.includes('gravy') || lowerName.includes('tartare sauce')) {
    return { sizeGrams: 50, servingLabel: '1 serve' }
  }

  return { sizeGrams: 100, servingLabel: '100 g' }
}

const buildServingOptions = (row: MacroRow, sizeGrams: number, servingLabel: string, unit: 'g' | 'ml' = 'g') => {
  const multiplier = sizeGrams / 100
  const label = sizeGrams !== 100 ? `${servingLabel} (${sizeGrams} ${unit})` : servingLabel
  return [
    {
      id: `serving-${normalizeText(label).replace(/\s+/g, '-')}`,
      label,
      serving_size: label,
      grams: unit === 'g' ? sizeGrams : null,
      ml: unit === 'ml' ? sizeGrams : null,
      calories: Math.round(row.calories * multiplier),
      protein_g: Math.round(row.protein_g * multiplier * 10) / 10,
      carbs_g: Math.round(row.carbs_g * multiplier * 10) / 10,
      fat_g: Math.round(row.fat_g * multiplier * 10) / 10,
      fiber_g: row.fiber_g != null ? Math.round(row.fiber_g * multiplier * 10) / 10 : null,
      sugar_g: row.sugar_g != null ? Math.round(row.sugar_g * multiplier * 10) / 10 : null,
    },
  ]
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

const manualItems = [
  {
    name: 'Burger with the lot',
    brand: 'Fish & Chip Shop',
    kind: 'FAST_FOOD',
    group: 'fast_food',
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    fiber_g: null,
    sugar_g: null,
    servingOptions: [
      {
        id: 'serving-burger-with-the-lot',
        label: '1 burger',
        serving_size: '1 burger',
        calories: 950,
        protein_g: 44,
        carbs_g: 72,
        fat_g: 62,
        fiber_g: 6.5,
        sugar_g: 16,
      },
    ],
  },
]

const importRows = async () => {
  const singleFiles = ['master_foods_macros.csv', 'meat_seafood_protein_macros.csv']
  const fastFoodRows = readMacroFile('fast_food_macros.csv')
  const beverageRows = readMacroFile('beverages_macros.csv')

  const singleRows = singleFiles.flatMap((file) => readMacroFile(file))

  const upsertItem = async (payload: {
    name: string
    brand: string | null
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
    const key = buildKey(payload.name, payload.brand, payload.kind)
    await prisma.customFoodItem.upsert({
      where: { key },
      create: {
        key,
        name: payload.name,
        brand: payload.brand,
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
      aliases: buildAliases(row.name, row.brand),
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
      aliases: buildAliases(row.name, row.brand),
      servingOptions: null,
    })
  }

  for (const row of fastFoodRows) {
    const aliases = buildAliases(row.name, row.brand)
    if (row.name.toLowerCase().includes('flake')) {
      aliases.push('flake', 'fish and chip shop flake', 'fish & chip shop flake')
    }
    if (row.name.toLowerCase().includes('mcsmart')) {
      aliases.push('mcsmart', 'mc smart')
    }
    await upsertItem({
      name: row.name,
      brand: row.brand,
      kind: 'FAST_FOOD',
      group: 'fast_food',
      caloriesPer100g: row.calories,
      proteinPer100g: row.protein_g,
      carbsPer100g: row.carbs_g,
      fatPer100g: row.fat_g,
      fiberPer100g: row.fiber_g,
      sugarPer100g: row.sugar_g,
      aliases: Array.from(new Set(aliases)),
      servingOptions: null,
    })
  }

  for (const item of manualItems) {
    const aliases = buildAliases(item.name, item.brand)
    await upsertItem({
      name: item.name,
      brand: item.brand,
      kind: 'FAST_FOOD',
      group: 'fast_food',
      caloriesPer100g: item.calories,
      proteinPer100g: item.protein_g,
      carbsPer100g: item.carbs_g,
      fatPer100g: item.fat_g,
      fiberPer100g: item.fiber_g,
      sugarPer100g: item.sugar_g,
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
