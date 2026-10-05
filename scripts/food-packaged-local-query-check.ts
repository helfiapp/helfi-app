import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { usdaLibraryServingSize } from '../lib/food/usda-library'
import { foodNumberOrNull, hasCoreFoodNutrition } from '../lib/food/openfoodfacts'
import { liquidDensity } from '../native/src/lib/foodUnits'
import { optionalNutrient } from '../native/src/lib/nutrientValues'
import { isFoodPreparationCompatible } from '../native/src/lib/foodPreparation'
import { isSingleMilkQuery, isSingleMilkIdentityCompatible, milkSearchText, singleMilkLookupQueries } from '../lib/food/single-milk-identity'

// Execute the actual local query and full endpoint against an in-memory Prisma
// fixture. No server imports, credentials, environment, database or network.
const source = ts.createSourceFile('food-data.ts', fs.readFileSync('lib/food-data.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const local = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'searchLocalFoods')
assert.ok(local)
let rows: any[] = [], queries: any[] = [], externalCalls: string[] = []
const compare = (value: any, condition: any) => {
  const text = String(value ?? '')
  const normalized = condition.mode === 'insensitive' ? text.toLowerCase() : text
  if (condition.startsWith != null) return normalized.startsWith(condition.mode === 'insensitive' ? condition.startsWith.toLowerCase() : condition.startsWith)
  if (condition.contains != null) return normalized.includes(condition.mode === 'insensitive' ? condition.contains.toLowerCase() : condition.contains)
  if (condition.in) return condition.in.includes(value)
  if (condition.notIn) return !condition.notIn.includes(value)
  throw Error('Unexpected Prisma fixture comparison')
}
const matches = (row: any, where: any): boolean => Object.entries(where ?? {}).every(([key, value]: any) => {
  if (key === 'AND') return value.every((condition: any) => matches(row, condition))
  if (key === 'OR') return value.some((condition: any) => matches(row, condition))
  return compare(row[key], value)
})
const context: any = vm.createContext({
  usdaLibraryServingSize, foodNumberOrNull, liquidDensity, optionalNutrient,
  hasCoreFoodNutrition, isFoodPreparationCompatible,
  isSingleMilkQuery, isSingleMilkIdentityCompatible, milkSearchText, singleMilkLookupQueries,
  URL, setTimeout, clearTimeout,
  console: { warn: (...args: any[]) => { throw Error(String(args)) }, error: (...args: any[]) => { throw Error(String(args)) } },
  prisma: { foodLibraryItem: { count: async () => 200000, findMany: async (options: any) => {
    queries.push(options)
    return rows.filter(row => matches(row, options.where)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, options.take)
  } } },
  usdaHealthCache: { count: 200000, checkedAt: Date.now() },
  NextResponse: { json: (body: any, options?: any) => ({ body, status: options?.status ?? 200 }) },
  searchCustomFoodMacros: async () => [], getCustomPackagedItems: async () => [],
  searchOpenFoodFactsByQuery: async () => { externalCalls.push('openfoodfacts'); return [] },
  searchFatSecretFoods: async () => { externalCalls.push('fatsecret'); return [] },
  searchUsdaFoods: async () => { throw Error('Local packaged search must not call USDA remote') },
})
context.searchLocalFoods = vm.runInContext(ts.transpile(`(${local.getText(source).replace(/^export\s+/, '')})`, { target: ts.ScriptTarget.ES2020 }), context)
const endpoint = ts.createSourceFile('route.ts', fs.readFileSync('app/api/food-data/route.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const get = endpoint.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'GET')
assert.ok(get)
context.GET = vm.runInContext(ts.transpile(`(${get.getText(endpoint).replace(/^export\s+/, '')})`, { target: ts.ScriptTarget.ES2020 }), context)
const fixture = (fdcId: number, name: string, extra: any = {}) => ({
  id: `row-${fdcId}`, fdcId, name, brand: 'Sanitarium', source: 'usda_branded', servingSize: '100 g',
  calories: 636, proteinG: 27, carbsG: 10, fatG: 53.5, fiberG: null, sugarG: 0, ...extra,
})
const options = { pageSize: 20, sources: ['usda_branded'], mode: 'prefix' }
const endpointSearch = async (query: string, localOnly = true) => {
  const params = new URLSearchParams({ source: 'auto', kind: 'packaged', q: query, limit: '20', country: 'AU' })
  if (localOnly) params.set('localOnly', '1')
  return context.GET({ url: `https://fixture.invalid/api/food-data?${params}`, headers: { get: () => null } })
}
async function main() {
  const target = fixture(2317111, 'Sanitarium Crunchy Peanut Butter 500g')
  rows = [
    ...Array.from({ length: 30 }, (_, n) => fixture(n + 1, `APPLE ${n} CEREAL`, { brand: 'CRUNCHY ROLLERS' })),
    ...Array.from({ length: 30 }, (_, n) => fixture(n + 101, `ALMOND ${n} BUTTER`, { brand: 'PEANUT BUTTER AMERICANO' })), target,
  ]
  let result = await context.searchLocalFoods('Sanitarium Crunchy Peanut Butter', options)
  assert.ok(result.some((item: any) => item.id === '2317111'), 'full-name packaged query must reach the exact record before the20-row limit')
  assert.equal(result.length, 1)
  assert.equal(result[0].calories, 636); assert.equal(result[0].serving_size, '100 g')
  assert.equal(result[0].fiber_g, null); assert.equal(result[0].sugar_g, 0)
  for (const query of ['sanitarium butter', 'butter sanitarium crunchy peanut', 'Sanitarium Crunchy Peanut B', '  Sanitarium, Crunchy Peanut Butter  ']) {
    result = await context.searchLocalFoods(query, options)
    assert.ok(result.some((item: any) => item.id === '2317111'), query)
  }
  rows = [...Array.from({ length: 30 }, (_, n) => fixture(n + 201, `Sanitarium Crunchy Peanut A${n}`)), target]
  result = await context.searchLocalFoods('Sanitarium Crunchy Peanut Butter', options)
  assert.equal(result.length, 1, 'fourth word must participate before limiting')
  for (const query of ['Sanitarium Crunchy Peanut Butter', 'Sanitarium Crunchy Peanut B']) {
    const response = await endpointSearch(query)
    assert.equal(response.status, 200)
    assert.ok(response.body.items.some((item: any) => item.id === '2317111'), 'actual endpoint retains local exact match')
    assert.equal(response.body.items[0].fiber_g, null); assert.equal(response.body.items[0].sugar_g, 0)
  }
  externalCalls = []
  const fallbackResponse = await endpointSearch('Sanitarium Crunchy Peanut Butter', false)
  assert.equal(fallbackResponse.body.items[0].id, '2317111', 'local source remains first while external fallback fills')
  assert.ok(externalCalls.includes('openfoodfacts') && externalCalls.includes('fatsecret'))
  rows = [target, fixture(800, 'Bartlett pear', { brand: 'Unrelated', source: 'usda_sr_legacy' })]
  assert.equal((await context.searchLocalFoods('nonexistent butter', options)).length, 0)
  assert.equal((await context.searchLocalFoods('Sanitarium', options))[0].id, '2317111', 'single brand prefix still works')
  const single = await context.searchLocalFoods('Bartlett pear', { pageSize: 5, sources: ['usda_sr_legacy'] })
  assert.equal(single[0].id, '800', 'existing single-food source path retained')
  assert.ok(queries.every(query => query.take <= 20), 'bounded query stays bounded')
  console.log('PASS: actual packaged local query and full endpoint match all typed words before limiting, retain partial/reordered words, source priority, precision, unknown/zero and existing single-food path.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
