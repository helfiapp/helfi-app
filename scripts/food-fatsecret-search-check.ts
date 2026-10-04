import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { foodNumberOrNull } from '../lib/food/openfoodfacts'

// Compile the real provider functions without loading environment values or
// making network requests. Response shapes follow the official v1/v2 docs.
const source = ts.createSourceFile('food-data.ts', fs.readFileSync('lib/food-data.ts', 'utf8'), ts.ScriptTarget.Latest, true)
function actual(name: string, optional = false) {
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name)
  if (!declaration && optional) return null
  assert.ok(declaration, `Actual ${name} must exist`)
  return ts.transpile(`(${declaration.getText(source).replace(/^export\s+/, '')})`, { target: ts.ScriptTarget.ES2020 })
}
const serving = { serving_id: '30', serving_description: '1 bar', measurement_description: 'serving', metric_serving_amount: '30', metric_serving_unit: 'g', number_of_units: '1', calories: '120', protein: '3', carbohydrate: '18', fat: '4', sugar: '0' }
const summaries = [{ food_id: '101', food_name: 'Measured bar', food_type: 'Brand', brand_name: 'Fixture', food_description: 'Per 1 serving - Calories: 120kcal | Fat: 4g | Carbs: 18g | Protein: 3g' }]
let searchResponse: any = { foods: { food: summaries[0] } }
let details: Record<string, any> = { '101': { food: { ...summaries[0], servings: { serving } } } }
let active = 0; let maxActive = 0; let calls: string[] = []
const ctx: any = vm.createContext({ URL, URLSearchParams, Date, foodNumberOrNull, FATSECRET_CLIENT_ID: 'fixture-only', FATSECRET_CLIENT_SECRET: 'fixture-only', getFatSecretAccessToken: async () => 'fixture-only', console: { warn() {} }, fetchWithTimeout: async (url: string) => {
  const params = new URL(url).searchParams
  if (params.get('method') === 'foods.search') return { ok: true, json: async () => searchResponse }
  assert.equal(params.get('method'), 'food.get.v2')
  const id = params.get('food_id')!; calls.push(id); active++; maxActive = Math.max(maxActive, active)
  await new Promise<void>((resolve) => setTimeout(resolve, 1)); active--
  if (id === '105') throw new Error('Fixture unavailable')
  return { ok: true, json: async () => details[id] || {} }
} })
for (const name of ['normalizeFatSecretFood', 'fetchFatSecretFoodDetail', 'fetchFatSecretServingOptions', 'searchFatSecretFoods']) {
  const code = actual(name, name === 'fetchFatSecretFoodDetail')
  if (code) ctx[name] = vm.runInContext(code, ctx)
}

async function run() {
  const results = await ctx.searchFatSecretFoods('Measured bar')
  assert.equal(results.length, 1, 'A singleton v1 summary must resolve real detail nutrition')
  assert.equal(results[0].id, '101'); assert.equal(results[0].calories, 120)
  assert.ok(results[0].serving_size.includes('30 g')); assert.equal(results[0].fiber_g, null); assert.equal(results[0].sugar_g, 0)
  assert.deepEqual(calls, ['101'])
  const options = await ctx.fetchFatSecretServingOptions('101')
  assert.equal(options.length, 1); assert.equal(options[0].grams, 30); assert.equal(options[0].fiber_g, null); assert.equal(options[0].sugar_g, 0)
  const second = { ...summaries[0], food_id: '102', food_name: 'Measured drink' }
  details['102'] = { food: { ...second, servings: { serving: [{ ...serving, serving_id: '200', metric_serving_amount: '200', metric_serving_unit: 'ml', calories: '80' }] } } }
  details['103'] = { food: { ...summaries[0], food_id: 'wrong-product', servings: { serving } } }
  details['104'] = { food: { ...summaries[0], food_id: '104' } }
  searchResponse = { foods: { food: [...summaries, second, ...['103', '104', '105'].map((id) => ({ ...summaries[0], food_id: id }))] } }
  calls = []; maxActive = 0
  const mixed = await ctx.searchFatSecretFoods('Measured', { pageSize: 5 })
  assert.deepEqual(Array.from(mixed, (item: any) => item.id), ['101', '102'], 'Bad detail identity, missing servings and provider failure cannot invent a food or discard good peers')
  assert.ok(mixed[1].serving_size.includes('200 ml')); assert.equal(mixed[1].calories, 80)
  assert.ok(maxActive <= 4, 'Detail lookup concurrency must stay bounded')
  searchResponse = { foods: {} }; assert.equal((await ctx.searchFatSecretFoods('Missing')).length, 0)
  details['106'] = { food: { ...summaries[0], food_id: '106', servings: { serving: { ...serving, calories: undefined } } } }
  searchResponse = { foods: { food: { ...summaries[0], food_id: '106' } } }
  assert.equal((await ctx.searchFatSecretFoods('Incomplete')).length, 0, 'Missing core nutrition must not become a zero-calorie result')
  assert.equal((await ctx.fetchFatSecretServingOptions('106')).length, 0)
  const zeroFood = { ...summaries[0], food_id: '107', servings: { serving: { ...serving, calories: '0', protein: '0', carbohydrate: '0', fat: '0' } } }
  details['107'] = { food: zeroFood }; searchResponse = { foods: { food: { ...summaries[0], food_id: '107' } } }
  assert.equal((await ctx.searchFatSecretFoods('Genuine zero'))[0].calories, 0)
  console.log('PASS: real FatSecret v1 singleton/array search resolves v2 details; source identity, metric serving basis, true zero, unknown nutrients and partial failures remain correct. No network or live credentials used.')
}
void run().catch((error) => { console.error(error); process.exitCode = 1 })
