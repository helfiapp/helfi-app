import fs from 'fs'
import path from 'path'
import { spawn, execFileSync } from 'child_process'
import { parse } from 'csv-parse'
import { PrismaClient, type Prisma } from '@prisma/client'
import { foodNumberOrNull } from '../lib/food/openfoodfacts'

execFileSync(process.execPath, [path.join(process.cwd(), 'scripts/assert-no-local-openai-key.js')], { stdio: 'inherit' })
const prisma = new PrismaClient()

async function saveFoodRecord(data: Prisma.FoodLibraryItemUncheckedCreateInput & { source: string; fdcId: number }) {
  await prisma.foodLibraryItem.upsert({
    where: { source_fdcId: { source: data.source, fdcId: data.fdcId } },
    create: data, update: data,
  })
}

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
const SR_LEGACY_ZIP_PREFIX = 'FoodData_Central_sr_legacy_food_csv_'

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
    let csvFinished = false
    let unzipFinished = false
    const finish = () => { if (csvFinished && unzipFinished) resolve() }

    parser.on('error', reject)
    child.on('error', reject)

    ;(async () => {
      try {
        for await (const record of parser) {
          await onRow(record as Record<string, string>)
        }
        csvFinished = true
        finish()
      } catch (err) {
        reject(err)
      }
    })()

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`unzip failed (${code}): ${stderr || 'unknown error'}`))
        return
      }
      unzipFinished = true
      finish()
    })

    child.stdout.pipe(parser)
  })
}

const toNumber = foodNumberOrNull

const normalizeUnit = (value: string | null): string | null => {
  if (!value) return null
  const raw = String(value).trim().toLowerCase()
  if (!raw) return null
  if (['g', 'gm', 'grm', 'gram', 'grams'].includes(raw)) return 'g'
  if (['ml', 'mlt', 'milliliter', 'millilitre'].includes(raw)) return 'ml'
  if (raw === 'oz' || raw === 'ounce' || raw === 'ounces') return 'oz'
  if (raw === 'fl oz' || raw === 'floz' || raw === 'fluid ounce') return 'ml'
  return raw
}

const round1 = (value: number): number => Math.round(value * 10) / 10

async function loadNutrientIds(zipPath: string): Promise<Record<string, number[]>> {
  const root = getZipRoot(zipPath)
  const nutrientIds: Record<string, number[]> = {}
  const nutrientFile = `${root}/nutrient.csv`

  await streamCsvFromZip(zipPath, nutrientFile, (row) => {
    const id = Number(row.id)
    if (!Number.isFinite(id)) return
    const name = String(row.name || '').trim().toLowerCase()
    const unit = String(row.unit_name || '').trim().toLowerCase()

    const key = name === 'energy' && unit === 'kcal' ? 'calories'
      : unit !== 'g' ? null
      : name === 'protein' ? 'protein_g'
      : name === 'carbohydrate, by difference' ? 'carbs_g'
      : name === 'total lipid (fat)' ? 'fat_g'
      : name === 'fiber, total dietary' ? 'fiber_g'
      : ['total sugars', 'sugars, total', 'sugars, total including nlea'].includes(name) ? 'sugar_g' : null
    if (key) (nutrientIds[key] ||= []).push(id)
  })

  return nutrientIds
}

async function loadMacroMap(zipPath: string, nutrientIds: Record<string, number[]>): Promise<Map<number, MacroTotals>> {
  const root = getZipRoot(zipPath)
  const nutrientFile = `${root}/food_nutrient.csv`
  const idToKey = new Map<number, keyof MacroTotals>()

  for (const [key, ids] of Object.entries(nutrientIds)) {
    for (const id of ids) if (Number.isFinite(id)) idToKey.set(id, key as keyof MacroTotals)
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


async function importFoundation(zipPath: string) {
  console.log(`\nImporting USDA foundation foods from: ${zipPath}`)
  const root = getZipRoot(zipPath)
  const nutrientIds = await loadNutrientIds(zipPath)
  const macrosByFdc = await loadMacroMap(zipPath, nutrientIds)
  const foodFile = `${root}/food.csv`


  console.log('Preserving existing records; upserting USDA foundation foods.')

  let rowCount = 0
  let inserted = 0

  await streamCsvFromZip(zipPath, foodFile, async (row) => {
    rowCount += 1
    const fdcId = Number(row.fdc_id)
    const name = String(row.description || '').trim()
    if (!Number.isFinite(fdcId) || !name) return
    const macros = macrosByFdc.get(fdcId)
    if (!macros) return

    await saveFoodRecord({
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
    })

    macrosByFdc.delete(fdcId)
    inserted += 1
  })

  console.log(`Foundation import finished: ${inserted.toLocaleString()} records from ${rowCount.toLocaleString()} foods.`)
}

// NOTE: SR Legacy contains the "regular foods" list (e.g., artichokes).
// Do not remove this import. Search relevance breaks without it.
async function importSrLegacy(zipPath: string) {
  console.log(`\nImporting USDA SR Legacy foods from: ${zipPath}`)
  const root = getZipRoot(zipPath)
  const nutrientIds = await loadNutrientIds(zipPath)
  const macrosByFdc = await loadMacroMap(zipPath, nutrientIds)
  const foodFile = `${root}/food.csv`


  console.log('Preserving existing records; upserting USDA SR Legacy foods.')

  let rowCount = 0
  let inserted = 0

  await streamCsvFromZip(zipPath, foodFile, async (row) => {
    rowCount += 1
    const fdcId = Number(row.fdc_id)
    const name = String(row.description || '').trim()
    if (!Number.isFinite(fdcId) || !name) return
    const macros = macrosByFdc.get(fdcId)
    if (!macros) return

    await saveFoodRecord({
        source: 'usda_sr_legacy',
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
    })
    inserted += 1
    macrosByFdc.delete(fdcId)
  })

  console.log(`SR Legacy import finished: ${inserted.toLocaleString()} records from ${rowCount.toLocaleString()} foods.`)
}

async function importBranded(zipPath: string) {
  console.log(`\nImporting USDA branded foods from: ${zipPath}`)
  const root = getZipRoot(zipPath)
  const nutrientIds = await loadNutrientIds(zipPath)
  const macrosByFdc = await loadMacroMap(zipPath, nutrientIds)
  const brandedInfo = await loadBrandedInfo(zipPath, macrosByFdc)
  const foodFile = `${root}/food.csv`


  console.log('Preserving existing records; upserting USDA branded foods with a 100 g nutrient basis.')

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
    if (!info || !['g', 'ml', 'oz'].includes(info.servingSizeUnit || '')) return

    await saveFoodRecord({
        source: 'usda_branded',
        fdcId,
        gtinUpc: info?.gtinUpc || null,
        name,
        brand: info?.brand || null,
        servingSize: info.servingSizeUnit === 'ml' ? '100 ml' : '100 g',
        calories: macros.calories ?? null,
        proteinG: macros.protein_g ?? null,
        carbsG: macros.carbs_g ?? null,
        fatG: macros.fat_g ?? null,
        fiberG: macros.fiber_g ?? null,
        sugarG: macros.sugar_g ?? null,
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
  const legacyZip = findZip(SR_LEGACY_ZIP_PREFIX)

  if (!foundationZip && !brandedZip && !legacyZip) {
    console.error('No USDA zip files found. Put them in data/food-import/.')
    process.exit(1)
  }

  const runFoundation = args.size === 0 || args.has('--foundation') || args.has('--all')
  const runBranded = args.size === 0 || args.has('--branded') || args.has('--all')
  const runLegacy = args.size === 0 || args.has('--legacy') || args.has('--sr-legacy') || args.has('--all')

  if (runFoundation && foundationZip) {
    await importFoundation(foundationZip)
  } else if (runFoundation) {
    console.log('Foundation zip not found. Skipping foundation import.')
  }

  if (runLegacy && legacyZip) {
    await importSrLegacy(legacyZip)
  } else if (runLegacy) {
    console.log('SR Legacy zip not found. Skipping SR Legacy import.')
  }

  if (runBranded && brandedZip) {
    await importBranded(brandedZip)
  } else if (runBranded) {
    console.log('Branded zip not found. Skipping branded import.')
  }

  await prisma.$disconnect()
}

run().catch((err) => {
  console.error('USDA import failed; connection and secret details withheld.')
  prisma.$disconnect().catch(() => {})
  process.exit(1)
})
