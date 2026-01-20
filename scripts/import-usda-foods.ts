import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { parse } from 'csv-parse'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type MacroTotals = {
  calories?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  fiber_g?: number
  sugar_g?: number
}

type BrandedInfo = {
  brand: string | null
  gtinUpc: string | null
  servingSizeValue: number | null
  servingSizeUnit: string | null
  householdServing: string | null
}

const DATA_DIRS = [
  path.join(process.cwd(), 'data', 'food-import'),
  path.join(process.cwd(), 'public', 'FOOD DATA'),
]

const FOUNDATION_ZIP_PREFIX = 'FoodData_Central_foundation_food_csv_'
const BRANDED_ZIP_PREFIX = 'FoodData_Central_branded_food_csv_'

function findZip(prefix: string): string | null {
  for (const dir of DATA_DIRS) {
    if (!fs.existsSync(dir)) continue
    const files = fs.readdirSync(dir)
    const match = files.find((file) => file.startsWith(prefix) && file.endsWith('.zip'))
    if (match) return path.join(dir, match)
  }
  return null
}

function getZipRoot(zipPath: string): string {
  return path.basename(zipPath, '.zip')
}

async function streamCsvFromZip(
  zipPath: string,
  innerFile: string,
  onRow: (row: Record<string, string>) => void | Promise<void>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('unzip', ['-p', zipPath, innerFile], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    const parser = parse({
      columns: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
    })

    parser.on('error', reject)
    child.on('error', reject)

    ;(async () => {
      try {
        for await (const record of parser) {
          await onRow(record as Record<string, string>)
        }
      } catch (err) {
        reject(err)
      }
    })()

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`unzip failed (${code}): ${stderr || 'unknown error'}`))
        return
      }
      resolve()
    })

    child.stdout.pipe(parser)
  })
}

const toNumber = (value: any): number | null => {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

const normalizeUnit = (value: string | null): string | null => {
  if (!value) return null
  const raw = String(value).trim().toLowerCase()
  if (!raw) return null
  if (raw === 'g' || raw === 'gram' || raw === 'grams') return 'g'
  if (raw === 'ml' || raw === 'milliliter' || raw === 'millilitre') return 'ml'
  if (raw === 'oz' || raw === 'ounce' || raw === 'ounces') return 'oz'
  if (raw === 'fl oz' || raw === 'floz' || raw === 'fluid ounce') return 'oz'
  return raw
}

const round1 = (value: number): number => Math.round(value * 10) / 10

async function loadNutrientIds(zipPath: string): Promise<Record<string, number>> {
  const root = getZipRoot(zipPath)
  const nutrientIds: Record<string, number> = {}
  const nutrientFile = `${root}/nutrient.csv`

  await streamCsvFromZip(zipPath, nutrientFile, (row) => {
    const id = Number(row.id)
    if (!Number.isFinite(id)) return
    const name = String(row.name || '').trim().toLowerCase()
    const unit = String(row.unit_name || '').trim().toLowerCase()

    if (name === 'energy' && unit === 'kcal' && nutrientIds.calories == null) {
      nutrientIds.calories = id
      return
    }
    if (name === 'protein' && nutrientIds.protein_g == null) {
      nutrientIds.protein_g = id
      return
    }
    if (name === 'carbohydrate, by difference' && nutrientIds.carbs_g == null) {
      nutrientIds.carbs_g = id
      return
    }
    if (name === 'total lipid (fat)' && nutrientIds.fat_g == null) {
      nutrientIds.fat_g = id
      return
    }
    if (name === 'fiber, total dietary' && nutrientIds.fiber_g == null) {
      nutrientIds.fiber_g = id
      return
    }
    if ((name === 'total sugars' || name === 'sugars, total') && nutrientIds.sugar_g == null) {
      nutrientIds.sugar_g = id
    }
  })

  return nutrientIds
}

async function loadMacroMap(zipPath: string, nutrientIds: Record<string, number>): Promise<Map<number, MacroTotals>> {
  const root = getZipRoot(zipPath)
  const nutrientFile = `${root}/food_nutrient.csv`
  const idToKey = new Map<number, keyof MacroTotals>()

  for (const [key, id] of Object.entries(nutrientIds)) {
    if (Number.isFinite(id)) {
      idToKey.set(Number(id), key as keyof MacroTotals)
    }
  }

  const macrosByFdc = new Map<number, MacroTotals>()
  let rowCount = 0

  await streamCsvFromZip(zipPath, nutrientFile, (row) => {
    rowCount += 1
    const fdcId = Number(row.fdc_id)
    if (!Number.isFinite(fdcId)) return
    const nutrientId = Number(row.nutrient_id)
    const key = idToKey.get(nutrientId)
    if (!key) return
    const amount = toNumber(row.amount)
    if (amount == null) return

    const entry = macrosByFdc.get(fdcId) ?? {}
    const current = entry[key]
    if (current == null || amount > current) {
      entry[key] = amount
      macrosByFdc.set(fdcId, entry)
    }
  })

  console.log(`Loaded nutrients from ${rowCount.toLocaleString()} rows.`)
  return macrosByFdc
}

async function loadBrandedInfo(zipPath: string, macrosByFdc: Map<number, MacroTotals>): Promise<Map<number, BrandedInfo>> {
  const root = getZipRoot(zipPath)
  const brandedFile = `${root}/branded_food.csv`
  const infoByFdc = new Map<number, BrandedInfo>()
  let rowCount = 0

  await streamCsvFromZip(zipPath, brandedFile, (row) => {
    rowCount += 1
    const fdcId = Number(row.fdc_id)
    if (!Number.isFinite(fdcId)) return
    if (!macrosByFdc.has(fdcId)) return

    const brand = String(row.brand_name || row.brand_owner || '').trim()
    const gtinUpcRaw = String(row.gtin_upc || '').trim()
    const servingSizeValue = toNumber(row.serving_size)
    const servingSizeUnit = normalizeUnit(String(row.serving_size_unit || '').trim())
    const householdServingRaw = String(row.household_serving_fulltext || '').trim()
    const householdServing = householdServingRaw && !/amount per serving/i.test(householdServingRaw)
      ? householdServingRaw
      : null

    infoByFdc.set(fdcId, {
      brand: brand || null,
      gtinUpc: gtinUpcRaw || null,
      servingSizeValue: servingSizeValue != null ? servingSizeValue : null,
      servingSizeUnit: servingSizeUnit || null,
      householdServing,
    })
  })

  console.log(`Loaded branded info from ${rowCount.toLocaleString()} rows.`)
  return infoByFdc
}

function buildServingLabel(info: BrandedInfo | null): string {
  if (!info) return '100 g'
  if (info.householdServing) return info.householdServing
  if (info.servingSizeValue != null && info.servingSizeUnit) {
    return `Serving — ${info.servingSizeValue} ${info.servingSizeUnit}`
  }
  return '100 g'
}

function scaleMacros(macros: MacroTotals, info: BrandedInfo | null): MacroTotals {
  if (!info || info.servingSizeValue == null || !info.servingSizeUnit) return macros
  let grams = info.servingSizeValue
  if (info.servingSizeUnit === 'oz') {
    grams = grams * 28.3495
  }
  const factor = grams / 100
  if (!Number.isFinite(factor) || factor <= 0) return macros

  const scaled: MacroTotals = {}
  if (macros.calories != null) scaled.calories = Math.round(macros.calories * factor)
  if (macros.protein_g != null) scaled.protein_g = round1(macros.protein_g * factor)
  if (macros.carbs_g != null) scaled.carbs_g = round1(macros.carbs_g * factor)
  if (macros.fat_g != null) scaled.fat_g = round1(macros.fat_g * factor)
  if (macros.fiber_g != null) scaled.fiber_g = round1(macros.fiber_g * factor)
  if (macros.sugar_g != null) scaled.sugar_g = round1(macros.sugar_g * factor)
  return scaled
}

async function importFoundation(zipPath: string) {
  console.log(`\nImporting USDA foundation foods from: ${zipPath}`)
  const root = getZipRoot(zipPath)
  const nutrientIds = await loadNutrientIds(zipPath)
  const macrosByFdc = await loadMacroMap(zipPath, nutrientIds)
  const foodFile = `${root}/food.csv`

  await prisma.foodLibraryItem.deleteMany({ where: { source: 'usda_foundation' } })
  console.log('Cleared existing foundation records.')

  let rowCount = 0
  let inserted = 0

  await streamCsvFromZip(zipPath, foodFile, async (row) => {
    rowCount += 1
    const fdcId = Number(row.fdc_id)
    const name = String(row.description || '').trim()
    if (!Number.isFinite(fdcId) || !name) return
    const macros = macrosByFdc.get(fdcId)
    if (!macros) return

    await prisma.foodLibraryItem.create({
      data: {
        source: 'usda_foundation',
        fdcId,
        name,
        brand: null,
        servingSize: '100 g',
        calories: macros.calories ?? null,
        proteinG: macros.protein_g ?? null,
        carbsG: macros.carbs_g ?? null,
        fatG: macros.fat_g ?? null,
        fiberG: macros.fiber_g ?? null,
        sugarG: macros.sugar_g ?? null,
      },
    })

    macrosByFdc.delete(fdcId)
    inserted += 1
  })

  console.log(`Foundation import finished: ${inserted.toLocaleString()} records from ${rowCount.toLocaleString()} foods.`)
}

async function importBranded(zipPath: string) {
  console.log(`\nImporting USDA branded foods from: ${zipPath}`)
  const root = getZipRoot(zipPath)
  const nutrientIds = await loadNutrientIds(zipPath)
  const macrosByFdc = await loadMacroMap(zipPath, nutrientIds)
  const brandedInfo = await loadBrandedInfo(zipPath, macrosByFdc)
  const foodFile = `${root}/food.csv`

  await prisma.foodLibraryItem.deleteMany({ where: { source: 'usda_branded' } })
  console.log('Cleared existing branded records.')

  let rowCount = 0
  let inserted = 0

  await streamCsvFromZip(zipPath, foodFile, async (row) => {
    rowCount += 1
    const fdcId = Number(row.fdc_id)
    const name = String(row.description || '').trim()
    if (!Number.isFinite(fdcId) || !name) return
    const macros = macrosByFdc.get(fdcId)
    if (!macros) return

    const info = brandedInfo.get(fdcId) || null
    const scaledMacros = scaleMacros(macros, info)
    const servingLabel = buildServingLabel(info)

    await prisma.foodLibraryItem.create({
      data: {
        source: 'usda_branded',
        fdcId,
        gtinUpc: info?.gtinUpc || null,
        name,
        brand: info?.brand || null,
        servingSize: servingLabel,
        calories: scaledMacros.calories ?? null,
        proteinG: scaledMacros.protein_g ?? null,
        carbsG: scaledMacros.carbs_g ?? null,
        fatG: scaledMacros.fat_g ?? null,
        fiberG: scaledMacros.fiber_g ?? null,
        sugarG: scaledMacros.sugar_g ?? null,
      },
    })

    macrosByFdc.delete(fdcId)
    inserted += 1
  })

  console.log(`Branded import finished: ${inserted.toLocaleString()} records from ${rowCount.toLocaleString()} foods.`)
}

async function run() {
  const args = new Set(process.argv.slice(2))
  const foundationZip = findZip(FOUNDATION_ZIP_PREFIX)
  const brandedZip = findZip(BRANDED_ZIP_PREFIX)

  if (!foundationZip && !brandedZip) {
    console.error('No USDA zip files found. Put them in data/food-import/.')
    process.exit(1)
  }

  const runFoundation = args.size === 0 || args.has('--foundation') || args.has('--all')
  const runBranded = args.size === 0 || args.has('--branded') || args.has('--all')

  if (runFoundation && foundationZip) {
    await importFoundation(foundationZip)
  } else if (runFoundation) {
    console.log('Foundation zip not found. Skipping foundation import.')
  }

  if (runBranded && brandedZip) {
    await importBranded(brandedZip)
  } else if (runBranded) {
    console.log('Branded zip not found. Skipping branded import.')
  }

  await prisma.$disconnect()
}

run().catch((err) => {
  console.error('USDA import failed:', err)
  prisma.$disconnect().catch(() => {})
  process.exit(1)
})
