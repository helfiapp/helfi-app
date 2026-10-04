import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { extractUsdaNutrients, usdaNutrientBasis, usdaStandardServingOptions } from '../lib/food/usda-nutrition'
import { liquidDensity, convertFoodAmount, parseFoodServing } from '../native/src/lib/foodUnits'
import { getFoodUnitGrams, formatUnitLabel } from '../lib/food/measurement-units'
import { PRODUCE_MEASUREMENTS } from '../native/src/data/produceMeasurements'

// Exercise real USDA detail -> serving options -> native override/cache ->
// open adjustment -> saved payload, without environment values or network.
const provider = ts.createSourceFile('food-data.ts', fs.readFileSync('lib/food-data.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const screen = ts.createSourceFile('screen.tsx', fs.readFileSync('native/src/screens/AddIngredientScreen.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function bind(source: ts.SourceFile, ctx: any, name: string) {
  let expression = ''
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = `(${node.getText(source).replace(/^export\s+/, '')})`
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) expression = `(${node.initializer.getText(source)})`
    ts.forEachChild(node, visit)
  }
  visit(source); assert.ok(expression, `actual ${name} exists`)
  ctx[name] = vm.runInContext(ts.transpile(expression, { target: ts.ScriptTarget.ES2020 }), ctx)
}
let detail: any
const server: any = vm.createContext({ extractUsdaNutrients, usdaNutrientBasis, usdaStandardServingOptions, liquidDensity, getFoodUnitGrams, formatUnitLabel, USDA_API_KEY: 'fixture-only', console: { warn() {} }, fetchWithTimeout: async () => ({ ok: true, json: async () => detail }) })
for (const name of ['normalizeFoodText', 'isLikelyLiquidFoodName', 'liquidDensityGramsPerMl', 'buildScaledServingOption', 'appendOptionIfMissing', 'appendLiquidServingOptions', 'appendCommonFoodServingOptions', 'fetchUsdaServingOptions']) bind(provider, server, name)
const ctx: any = vm.createContext({ PRODUCE_MEASUREMENTS, convertFoodAmount, parseFoodServing, console, URLSearchParams, authHeaders: { Fixture: 'no-real-token' }, API_BASE_URL: 'https://fixture.invalid', servingOverrideCacheRef: { current: new Map() }, servingOverridePendingRef: { current: new Set() }, Alert: { alert: (...args: any[]) => { throw new Error(`Unexpected food error: ${args[0]}`) } } })
const pure = screen.statements.filter(node => ts.isVariableStatement(node) || (ts.isFunctionDeclaration(node) && node.name?.text !== 'AddIngredientScreen')).map(node => node.getText(screen)).join('\n')
vm.runInContext(ts.transpileModule(pure, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText, ctx)
for (const name of ['loadServingOverride', 'openAdjust', 'addAdjustedItem']) bind(screen, ctx, name)
for (const key of ['AdjustOpeningId', 'AdjustBase', 'AdjustServingOptions', 'AdjustServingId', 'AdjustItem', 'AdjustUnit', 'AdjustAmountInput', 'AdjustPickerMode', 'Error', 'AdjustSaving']) ctx[`set${key}`] = (value: any) => { const field = key[0].toLowerCase() + key.slice(1); ctx[field] = typeof value === 'function' ? value(ctx[field]) : value }
ctx.loadDynamicSizeLookup = async () => null
let providerCalls = 0; let payload: any
ctx.fetch = async (url: string, init: any) => {
  if (url.includes('/api/food-data/servings?')) { providerCalls++; return { ok: true, json: async () => ({ options: await server.fetchUsdaServingOptions('original-id') }) } }
  assert.ok(url.endsWith('/api/food-log')); payload = JSON.parse(init.body); return { ok: true, json: async () => ({ id: 'fixture-saved' }) }
}
ctx.buildNativeAuthHeaders = () => ({ Fixture: 'no-real-token' }); ctx.session = { token: 'fixture-only' }; ctx.selectedDate = '2026-10-05'; ctx.targetMeal = 'breakfast'; ctx.DeviceEventEmitter = { emit() {} }; ctx.navigation = { goBack() {} }
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} must equal ${b}`)
const nutrients = (calories: number, fat: number, sugar?: number) => [{ nutrientId: 1008, unitName: 'KCAL', value: calories }, { nutrientId: 1003, unitName: 'G', value: 0 }, { nutrientId: 1005, unitName: 'G', value: 0 }, { nutrientId: 1004, unitName: 'G', value: fat }, ...(sugar === undefined ? [] : [{ nutrientId: 2000, unitName: 'G', value: sugar }])]
const original = (name: string, calories = 47) => ({ id: 'original-id', source: 'usda', name, serving_size: '100 g', calories, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: null, sugar_g: null })
async function open(item: any) {
  ctx.servingOverrideCacheRef.current.clear(); ctx.adjustItem = null; ctx.adjustSaving = false; ctx.adjustServingOptions = []
  await ctx.openAdjust(item); assert.ok(ctx.adjustItem, 'actual adjustment opens')
  assert.equal(ctx.adjustItem.id, item.id); assert.equal(ctx.adjustItem.source, item.source)
}
async function save(amount: number, unit: string) {
  ctx.adjustAmountInput = String(amount); ctx.safeAdjustUnit = unit; ctx.mergedAdjustUnitGrams = {}; ctx.selectedServingLabel = ctx.adjustItem.serving_size
  await ctx.addAdjustedItem(); assert.ok(payload); return payload
}
async function run() {
  for (const name of ['Apple juice, frozen concentrate, diluted with 3 volume water', 'Mayonnaise, reduced fat, with olive oil', 'Egg, scrambled, with milk', 'Milk, canned, condensed, sweetened', 'Milk, dry, whole', 'Almond milk', 'Water chestnuts, chinese, raw']) {
    detail = { description: name, dataType: 'SR Legacy', foodNutrients: nutrients(47, 0), foodPortions: [{ gramWeight: 239, portionDescription: 'cup' }] }
    const options = await server.fetchUsdaServingOptions('original-id')
    assert.ok(!options.some((option: any) => option.unit === 'ml' || option.ml), `${name}: ingredient mention cannot create volume nutrition`)
    // Sized produce/egg overrides intentionally stay on their separate count path.
    if (ctx.hasSizedCountUnits(ctx.getFoodUnitGrams(name))) continue
    const item = original(name); await open(item)
    assert.equal(ctx.adjustBase.unit, 'g'); assert.equal(ctx.adjustBase.density, null)
    assert.ok(!ctx.defaultUnitOptions(ctx.adjustBase, name).includes('ml'))
    assert.equal(ctx.adjustServingOptions.length, options.length, 'real provider options must reach the adjustment')
    const before = providerCalls; await ctx.openAdjust(item)
    assert.equal(providerCalls, before, 'cached override avoids a duplicate lookup')
    assert.equal(ctx.adjustServingOptions.length, options.length, 'cache retains full provider choices')
    const saved = await save(100, 'g'); assert.equal(saved.total.calories, 47); assert.equal(saved.items[0].sugar_g, null); assert.equal(saved.items[0].fiber_g, null)
    assert.equal(saved.items[0].id, item.id); assert.equal(saved.items[0].servingOptions.length, options.length)
  }
  for (const [name, kcal, fat, density] of [['Milk, whole', 61, 3.3, 1.03], ['Oil, olive, salad or cooking', 884, 100, 0.92]] as const) {
    detail = { description: name, dataType: 'SR Legacy', foodNutrients: nutrients(kcal, fat, 0) }
    await open({ ...original(name, kcal), fat_g: fat, sugar_g: 0 })
    assert.equal(ctx.adjustBase.unit, 'ml'); close(ctx.adjustBase.density, density)
    const options = ctx.adjustServingOptions; assert.ok(options.some((x: any) => x.ml === 100))
    const saved = await save(name.startsWith('Milk') ? 100 : 15, name.startsWith('Milk') ? 'ml' : 'g')
    assert.equal(saved.total.calories, name.startsWith('Milk') ? 63 : 133)
    assert.equal(saved.items[0].sugar_g, 0); assert.equal(saved.items[0].fiber_g, null)
  }
  assert.equal(ctx.unitLabel('three-quarter-cup', 'Milk, whole', {}), '3/4 cup — 180 ml')
  console.log('PASS: actual USDA detail/serving options, native override/cache/open/save preserve source basis/IDs/options, compatible milk/oil density, null/zero and fraction labels; no network or credentials.')
}
void run().catch(error => { console.error(error); process.exitCode = 1 })
