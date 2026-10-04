import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { isFoodPreparationCompatible } from '../native/src/lib/foodPreparation'
import { liquidDensity } from '../native/src/lib/foodUnits'
import { optionalNutrient } from '../native/src/lib/nutrientValues'

// Execute the complete real endpoint with synthetic provider records. No server
// imports, environment values, database, credentials or network requests.
const source = ts.createSourceFile('route.ts', fs.readFileSync('app/api/food-data/route.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const get = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'GET')
assert.ok(get)
let library: any[] = [], custom: any[] = [], fallback: any[] = []
let calls: string[] = []
const context: any = vm.createContext({
  URL, isFoodPreparationCompatible, liquidDensity, optionalNutrient,
  console: { warn() {}, error: (...args: any[]) => { throw new Error(String(args)) } },
  NextResponse: { json: (body: any, options?: any) => ({ body, status: options?.status ?? 200 }) },
  usdaHealthCache: { count: 200000, checkedAt: Date.now() },
  prisma: { foodLibraryItem: { count: async () => 200000 } },
  searchCustomFoodMacros: async () => { calls.push('custom'); return custom },
  getCustomPackagedItems: async () => [],
  searchLocalFoods: async (_query: string, options: any) => {
    const category = options.sources[0]; calls.push(category)
    return library.filter(item => item.fixtureCategory === category)
  },
  searchFatSecretFoods: async () => { calls.push('fatsecret'); return fallback },
  searchUsdaFoods: async () => [],
})
context.GET = vm.runInContext(ts.transpile(`(${get.getText(source).replace(/^export\s+/, '')})`, { target: ts.ScriptTarget.ES2020 }), context)
const record = (id: string, name: string, calories: number, extra: any = {}) => ({
  id, source: 'usda', brand: null, name, serving_size: '100 g',
  calories, protein_g: 1.125, carbs_g: 4.875, fat_g: 3.25,
  fiber_g: null, sugar_g: null, fixtureCategory: 'usda_sr_legacy',
  servingOptions: [{ id: `${id}-cup`, label: 'cup — 244 g', serving_size: 'cup — 244 g', grams: 244, calories: calories * 2.44 }],
  ...extra,
})
// Numeric fixture IDs represent records returned by the provider, not a claim
// that these fabricated fixture nutrient values are real USDA food facts.
const rows = [
  record('900001', 'Milk, whole', 61, { fiber_g: 0, sugar_g: 5.05 }),
  record('900002', 'Milk, nonfat', 34),
  record('900003', 'Milk, lowfat, fluid, 1% milkfat', 42.8),
  record('900004', 'Milk, reduced fat, fluid, 2% milkfat', 49.8),
  record('900005', 'Beverages, almond milk, unsweetened', 15.3),
  record('900006', 'Beverages, oat milk, unsweetened', 43.2),
  record('900007', 'Beverages, soy milk, unsweetened', 32.9),
  record('900008', 'Coconut milk beverage, unsweetened', 21.3),
  record('900009', 'Beverages, almond milk, chocolate', 56.7),
  record('900010', 'Orange juice, raw', 45.2),
  record('900011', 'Beverages, coffee, brewed, prepared with tap water', 1.4, { carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: null }),
  record('900012', 'Oil, olive, salad or cooking', 884, { protein_g: 0, carbs_g: 0, fat_g: 100, sugar_g: 0 }),
]
async function query(value: string, localOnly = true, limit = 50) {
  calls = []
  const response = await context.GET({ url: `https://fixture.invalid/api/food-data?kind=single&limit=${limit}&localOnly=${localOnly ? 1 : 0}&q=${encodeURIComponent(value)}`, headers: { get: () => null } })
  assert.equal(response.status, 200); assert.equal(response.body.success, true)
  return response.body.items as any[]
}
function checkRecord(item: any, original: any) {
  assert.equal(item.id, original.id, `${original.name}: source ID must be real provider identity`)
  assert.equal(item.source, original.source); assert.equal(item.name, original.name)
  const density = liquidDensity(original.name)
  const multiplier = density ?? 1
  assert.ok(Math.abs(item.calories - original.calories * multiplier) < 1e-9)
  for (const key of ['protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g']) {
    if (original[key] == null) assert.equal(item[key], null, `${key} remains unknown`)
    else assert.ok(Math.abs(item[key] - original[key] * multiplier) < 1e-9, `${key} retains provider precision/zero`)
  }
  assert.equal(item.serving_size, density == null ? '100 g' : '100 ml')
  assert.equal(item.servingOptions, original.servingOptions, 'original provider options retain their basis')
}
async function run() {
  library = rows
  const examples: Array<[string, string]> = [
    ['milk', '900001'], ['milk whole', '900001'], ['milk nonfat', '900002'],
    ['milk lowfat', '900003'], ['milk reduced fat', '900004'],
    ['almond milk', '900005'], ['oat milk', '900006'], ['soy milk', '900007'],
    ['coconut milk beverage', '900008'], ['almond milk chocolate', '900009'],
    ['orange juice', '900010'], ['coffee', '900011'], ['olive oil', '900012'],
  ]
  for (const [value, id] of examples) {
    const items = await query(value)
    assert.ok(items.length, `${value}: matching real record must be available`)
    assert.equal(items[0].id, id, `${value}: no invented preferred nutrient row`)
    for (const item of items) {
      const original = rows.find(row => row.id === item.id); assert.ok(original)
      checkRecord(item, original)
    }
    assert.ok(!calls.includes('fatsecret'), 'local-only keeps database-first source order')
  }
  const originalJson = JSON.stringify(rows)
  library = []
  for (const [value] of examples) assert.equal((await query(value)).length, 0, `${value}: absent source must not fabricate nutrition`)
  library = [record('900013', 'Milk, whole', 61, { protein_g: null })]
  assert.equal((await query('milk')).length, 0, 'incomplete core nutrients cannot become a synthetic complete record')
  library = [rows[0]]
  fallback = [{ ...rows[0], source: 'fatsecret', id: 'fixture-fatsecret', name: 'Milk, whole, fluid' }]
  const withFallback = await query('milk', false)
  checkRecord(withFallback[0], rows[0]); assert.equal(withFallback[1].source, 'fatsecret')
  assert.ok(calls.indexOf('fatsecret') > calls.indexOf('usda_sr_legacy'), 'supplier only fills after local lookup')
  custom = [{ ...rows[0], id: 'fixture-custom', name: 'Milk, whole, custom' }]
  const withCustom = await query('milk')
  checkRecord(withCustom[0], rows[0]); assert.equal(withCustom[1].source, 'custom')
  assert.equal(JSON.stringify(rows), originalJson, 'provider input records are never rewritten')
  console.log('PASS: complete real endpoint uses original provider records for common drinks, preserves source IDs/options/precision/null/zero, requested chocolate variant and database-first fallbacks; unavailable sources cannot invent nutrients. No network or credentials.')
}
void run().catch(error => { console.error(error); process.exitCode = 1 })
