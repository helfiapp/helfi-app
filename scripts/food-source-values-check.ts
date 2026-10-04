import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { foodNumberOrNull, hasCoreFoodNutrition } from '../lib/food/openfoodfacts'
import { usdaLibraryServingSize } from '../lib/food/usda-library'
import { extractUsdaNutrients, usdaNutrientBasis, usdaStandardServingOptions } from '../lib/food/usda-nutrition'
import { liquidDensity } from '../native/src/lib/foodUnits'
import { getFoodUnitGrams, formatUnitLabel } from '../lib/food/measurement-units'
import { buildCustomFoodServingOptions } from '../lib/food/custom-serving-options'

// Run actual source/endpoint functions using synthetic rows and provider
// responses only. Do not import server settings, credentials or database code.
const provider = ts.createSourceFile('food-data.ts', fs.readFileSync('lib/food-data.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const route = ts.createSourceFile('servings.ts', fs.readFileSync('app/api/food-data/servings/route.ts', 'utf8'), ts.ScriptTarget.Latest, true)
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
const invalidValues = [-1, '', '  ', false, true, [], {}, NaN, Infinity, 'unknown', null, undefined]
const fields = ['calories', 'protein_g', 'carbs_g', 'fat_g']
async function checkLibrary() {
  let rows: any[] = []
  const ctx: any = vm.createContext({ foodNumberOrNull, usdaLibraryServingSize, console: { warn() {} }, prisma: { foodLibraryItem: { findMany: async () => rows } } })
  bind(provider, ctx, 'searchLocalFoods')
  const original = { id: 'public-row', fdcId: 900101, source: 'usda_foundation', name: 'Food, fixture', brand: null, servingSize: '100 g', calories: 48.3298, proteinG: .796875, carbsG: 5.100325, fatG: 2.749, fiberG: 0, sugarG: null }
  const mapping = { calories: 'calories', protein_g: 'proteinG', carbs_g: 'carbsG', fat_g: 'fatG', fiber_g: 'fiberG', sugar_g: 'sugarG' }
  for (const [resultField, dbField] of Object.entries(mapping)) {
    for (const value of [...invalidValues, 0, '0', '2.749', 2.749]) {
      rows = [{ ...original, [dbField]: value }]
      const before = JSON.stringify(rows)
      const found = await ctx.searchLocalFoods('fixture', { mode: 'prefix', pageSize: 1 })
      assert.equal(found.length, 1, 'preserve public row and identity; missing nutrition stays unknown')
      assert.equal(found[0][resultField], foodNumberOrNull(value), `${dbField}: actual library mapper must not return invalid values`)
      assert.equal(found[0].id, String(original.fdcId)); assert.equal(found[0].serving_size, '100 g')
      assert.equal(JSON.stringify(rows), before, 'no original source row mutation')
    }
  }
  rows = [original]
  const found = (await ctx.searchLocalFoods('fixture', { mode: 'prefix' }))[0]
  assert.equal(found.calories, original.calories); assert.equal(found.fat_g, original.fatG)
  assert.equal(found.fiber_g, 0); assert.equal(found.sugar_g, null)
}
async function checkProvider() {
  let detail: any
  const ctx: any = vm.createContext({ hasCoreFoodNutrition, extractUsdaNutrients, usdaNutrientBasis, usdaStandardServingOptions, liquidDensity, getFoodUnitGrams, formatUnitLabel, USDA_API_KEY: 'fixture-only', console: { warn() {} }, fetchWithTimeout: async () => ({ ok: true, json: async () => detail }) })
  for (const name of ['normalizeFoodText', 'isLikelyLiquidFoodName', 'liquidDensityGramsPerMl', 'buildScaledServingOption', 'appendOptionIfMissing', 'appendLiquidServingOptions', 'appendCommonFoodServingOptions', 'fetchUsdaServingOptions']) bind(provider, ctx, name)
  const original = { description: 'Milk, whole', dataType: 'SR Legacy', foodNutrients: [
    { nutrientId: 1008, unitName: 'KCAL', value: 61 },
    { nutrientId: 1003, unitName: 'G', value: 3.3 },
    { nutrientId: 1005, unitName: 'G', value: 4.8 },
    { nutrientId: 1004, unitName: 'G', value: 3.3 },
  ], foodPortions: [{ gramWeight: 244, portionDescription: 'cup' }] }
  for (let index = 0; index < 4; index++) for (const value of invalidValues) {
    detail = { ...original, foodNutrients: original.foodNutrients.map((n, i) => i === index ? { ...n, value } : n) }
    const result = await ctx.fetchUsdaServingOptions('fixture')
    assert.equal(result.length, 0, `${fields[index]}=${String(value)}: provider detail cannot create incomplete usable choices`)
  }
  detail = { ...original, dataType: 'Branded', servingSize: 20, servingSizeUnit: 'None' }
  assert.equal((await ctx.fetchUsdaServingOptions('fixture')).length, 0, 'unknown branded basis cannot create guessed liquid portions')
  detail = original
  const result = await ctx.fetchUsdaServingOptions('fixture')
  const cup = result.find((o: any) => o.grams === 244)
  assert.ok(cup); assert.equal(cup.calories, 61 * 2.44); assert.equal(cup.fiber_g, null); assert.equal(cup.sugar_g, null)
  detail = { ...original, foodNutrients: original.foodNutrients.map(n => ({ ...n, value: 0 })) }
  const zeros = await ctx.fetchUsdaServingOptions('fixture')
  assert.ok(zeros.length > 0); assert.ok(zeros.every((o: any) => fields.every(k => o[k] === 0)), 'genuine zero nutrient choices remain usable')
}
async function checkServingsEndpoint() {
  let options: any[] = []
  let customItem: any = null
  const ctx: any = vm.createContext({ URL, hasCoreFoodNutrition, NextResponse: { json: (body: any, init?: any) => ({ body, status: init?.status ?? 200 }) }, console: { error() {} }, prisma: { customFoodItem: { findUnique: async () => customItem ?? { servingOptions: options } } }, buildCustomFoodServingOptions, fetchUsdaServingOptions: async () => options, fetchFatSecretServingOptions: async () => options })
  bind(route, ctx, 'GET')
  const valid = { id: 'valid', label: 'Provider cup', serving_size: 'cup — 239 g', grams: 239, calories: 112.33, protein_g: .28, carbs_g: 27.27, fat_g: 0, fiber_g: null, sugar_g: null }
  const zero = { ...valid, id: 'zero', calories: 0, protein_g: 0, carbs_g: '0', fat_g: 0, fiber_g: 0 }
  for (const source of ['custom', 'usda', 'fatsecret']) for (const field of fields) for (const value of invalidValues) {
    options = [{ ...valid, id: 'invalid', [field]: value }, valid, zero]
    const before = JSON.stringify(options)
    const response = await ctx.GET({ url: `https://fixture.invalid/api/food-data/servings?source=${source}&id=fixture` })
    assert.equal(response.status, 200); assert.equal(response.body.success, true)
    assert.deepEqual(Array.from(response.body.options, (o: any) => o.id), ['valid', 'zero'], `${source}: invalid ${field} choice cannot reach the amount editor`)
    assert.equal(response.body.options[0], valid, 'source precision/IDs/measures/optional unknowns retained')
    assert.equal(JSON.stringify(options), before, 'stored/provider choices never rewritten')
  }
  const customBasis = { name: 'Fixture peanuts', kind: 'SINGLE', servingOptions: [], caloriesPer100g: 636, proteinPer100g: 27, carbsPer100g: 10, fatPer100g: 50, fiberPer100g: null, sugarPer100g: 0 }
  for (const field of ['caloriesPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g']) for (const value of invalidValues) {
    customItem = { ...customBasis, [field]: value }
    const response = await ctx.GET({ url: 'https://fixture.invalid/api/food-data/servings?source=custom&id=custom:fixture' })
    assert.equal(response.body.options.length, 0, `actual custom builder: invalid ${field} must not become zero before endpoint validation`)
  }
  customItem = customBasis
  const built = await ctx.GET({ url: 'https://fixture.invalid/api/food-data/servings?source=custom&id=custom:fixture' })
  assert.ok(built.body.options.length > 0)
  assert.equal(built.body.options[0].fiber_g, null, 'custom unknown optional nutrition stays unknown')
  assert.equal(built.body.options[0].sugar_g, 0, 'custom genuine optional zero stays zero')
}
async function run() {
  const only = process.argv[process.argv.indexOf('--case') + 1]
  for (const [name, check] of Object.entries({ library: checkLibrary, provider: checkProvider, servings: checkServingsEndpoint })) {
    if (process.argv.includes('--case') && name !== only) continue
    await check()
    console.log(`PASS: actual ${name} source boundary rejects negative/blank/boolean/non-numeric nutrition while preserving real zero, precision, identity, measurement and unknown optional values. No network or credentials.`)
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1 })
