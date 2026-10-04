import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { parse } from 'csv-parse/sync'
import { foodNumberOrNull } from '../lib/food/openfoodfacts'

// Run the actual CSV mapping/aggregation functions without starting the
// importer, connecting to a database, loading settings or contacting a provider.
const source = ts.createSourceFile('import.ts', fs.readFileSync('scripts/import-usda-foods.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const definitions = ['loadNutrientIds', 'loadMacroMap'].map(name => {
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(node, `actual importer ${name} must exist`)
  return node.getText(source)
}).join('\n')
const metadata = [
  { id: '1008', name: 'Energy', unit_name: 'KCAL' },
  { id: '2047', name: 'Energy (Atwater General Factors)', unit_name: 'KCAL' },
  { id: '2048', name: 'Energy (Atwater Specific Factors)', unit_name: 'KCAL' },
  { id: '1062', name: 'Energy', unit_name: 'KJ' },
  { id: '1003', name: 'Protein', unit_name: 'G' },
  { id: '1004', name: 'Total lipid (fat)', unit_name: 'G' },
  { id: '1005', name: 'Carbohydrate, by difference', unit_name: 'G' },
  { id: '1079', name: 'Fiber, total dietary', unit_name: 'G' },
  { id: '1063', name: 'Sugars, total including NLEA', unit_name: 'G' },
  { id: '2000', name: 'Total Sugars', unit_name: 'G' },
]
let nutrientRows: any[] = []
const context: any = vm.createContext({
  Map, Number, String, toNumber: foodNumberOrNull,
  getZipRoot: () => 'fixture', console: { log() {} },
  streamCsvFromZip: async (_archive: string, file: string, visit: any) => {
    for (const row of file.endsWith('/nutrient.csv') ? metadata : nutrientRows) await visit(row)
  },
})
vm.runInContext(ts.transpile(definitions, { target: ts.ScriptTarget.ES2020 }) + '\nthis.loadIds = loadNutrientIds; this.loadMacros = loadMacroMap', context)
const row = (food: number, nutrient: number, amount: any) => ({ fdc_id: String(food), nutrient_id: String(nutrient), amount })

async function run() {
  const ids = await context.loadIds('fixture.zip')
  assert.deepEqual(Array.from(ids.calories), [1008, 2047, 2048], 'Foundation calorie IDs must survive metadata mapping')
  assert.ok(!ids.calories.includes(1062), 'kilojoules must not be labelled kcal')
  // Original USDA Foundation archive row, not an inferred 4/4/9 calculation.
  nutrientRows = [row(2257046, 2047, '48.3298'), row(2257046, 1003, '0.796875'), row(2257046, 1004, '2.749'), row(2257046, 1005, '5.100325'), row(2257046, 1079, '0'), row(2257046, 1063, '2.3216')]
  const oats = (await context.loadMacros('fixture.zip', ids)).get(2257046)
  assert.equal(oats.calories, 48.3298)
  assert.equal(oats.fat_g, 2.749); assert.equal(oats.protein_g, 0.796875)
  assert.equal(oats.carbs_g, 5.100325); assert.equal(oats.fiber_g, 0); assert.equal(oats.sugar_g, 2.3216)

  // Separate energy methods are alternatives, never a maximum across methods.
  const choices = [row(900001, 2048, '130.5'), row(900001, 2047, '120.125'), row(900001, 1008, '115.75')]
  for (const ordered of [choices, [...choices].reverse(), [choices[1], choices[0], choices[2]]]) {
    nutrientRows = ordered
    assert.equal((await context.loadMacros('fixture.zip', ids)).get(900001).calories, 115.75, 'reported legacy energy keeps its original value regardless of row order')
  }
  nutrientRows = [row(900002, 2048, '130.5'), row(900002, 2047, '120.125')]
  assert.equal((await context.loadMacros('fixture.zip', ids)).get(900002).calories, 120.125)
  nutrientRows = [row(900003, 2048, '130.5')]
  assert.equal((await context.loadMacros('fixture.zip', ids)).get(900003).calories, 130.5)
  nutrientRows = [row(900004, 2047, '0'), row(900004, 2048, '12'), row(900005, 2047, ''), row(900005, 2048, 'bad'), row(900005, 1003, '1.1'), row(900006, 2047, '-2'), row(900006, 2048, 'Infinity'), row(900006, 1004, '1.2')]
  const missing = await context.loadMacros('fixture.zip', ids)
  assert.equal(missing.get(900004).calories, 0, 'real zero is not replaced by another energy method')
  assert.equal(missing.get(900005).calories, undefined); assert.equal(missing.get(900005).sugar_g, undefined)
  assert.equal(missing.get(900006).calories, undefined, 'invalid energy does not become zero')
  nutrientRows = [row(900007, 1003, '1.2'), row(900007, 1003, '1.3'), row(900007, 1063, '2.1'), row(900007, 2000, '2.2')]
  const existing = (await context.loadMacros('fixture.zip', ids)).get(900007)
  assert.equal(existing.protein_g, 1.3); assert.equal(existing.sugar_g, 2.2, 'existing non-energy duplicate handling remains intact')
  const archiveIndex = process.argv.indexOf('--archive')
  if (archiveIndex >= 0) {
    const archivePath = process.argv[archiveIndex + 1]
    assert.ok(archivePath, 'supply the original local archive')
    context.getZipRoot = (filename: string) => path.basename(filename, '.zip')
    context.streamCsvFromZip = async (filename: string, file: string, visit: any) => {
      const text = execFileSync('unzip', ['-p', filename, file], { maxBuffer: 32 * 1024 * 1024 }).toString()
      for (const record of parse(text, { columns: true, trim: true, relax_column_count: true, relax_quotes: true })) await visit(record)
    }
    const actualIds = await context.loadIds(archivePath)
    assert.deepEqual(Array.from(actualIds.calories), [1008, 2047, 2048])
    const actualOats = (await context.loadMacros(archivePath, actualIds)).get(2257046)
    for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g']) assert.equal(actualOats[key], oats[key], `original archive ${key} stays exact`)
    console.log('PASS: actual importer also reads the original local Foundation archive, including exact USDA2257046 kcal, macros, true zero and source precision.')
  }
  console.log('PASS: actual USDA CSV importer retains Foundation calorie IDs, original precision, deterministic energy-method choice, true zero/missing values and existing gram-nutrient handling. No network, database or credentials.')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
