#!/usr/bin/env node
'use strict'
// Actual comparator source, synthetic public-catalog precision fixtures only.
// Only post-write linked-drink readback accepts last-bit numeric differences.
// Review versions, identities and material data remain exact.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const root = path.resolve(__dirname, '..'), relative = 'app/api/water-log/[id]/route.ts'
const raw = fs.readFileSync(path.join(root, relative), 'utf8'), ast = ts.createSourceFile(relative, raw, ts.ScriptTarget.Latest, true)
const functions = ['drinkFoodRevision', 'classifyDrinkFoodReadback']
const code = ast.statements.filter(node => ts.isFunctionDeclaration(node) && functions.includes(node.name?.text)).map(node => node.getText(ast)).join('\n')
const box = vm.createContext({ Date })
vm.runInContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 } }).outputText, box)
const clone = value => JSON.parse(JSON.stringify(value))
const row = () => ({ id: 'synthetic-drink-food', userId: 'synthetic-user', name: 'Synthetic coffee', description: 'Synthetic measured drink', meal: 'other', category: null, localDate: '2026-10-17', createdAt: new Date('2026-10-16T17:17:52.996Z'),
  nutrients: { calories: 49, protein_g: 1.144868521592366, fat_g: 0.8740447535987277, carbs_g: 9.200925, fiber_g: null, sugar_g: 9.222574999999999 },
  items: [{ id: 'synthetic-coffee', calories: 2.502237679936382, fat_g: 0.05004475359872765, sugar_g: 0, fiber_g: null, serving_size: '250 ml', __voiceSourceFood: { id: 171890, fat_g: 0.005920000000000001 } }],
})
function nextUp(number) { const data = new DataView(new ArrayBuffer(8)); data.setFloat64(0, number); data.setBigUint64(0, data.getBigUint64(0) + 1n); return data.getFloat64(0) }
let passed = 0
function check(name, run) { run(); passed++; console.log(`PASS ${name}`) }
check('ordinary JSON serialization/key order and Date ISO representation match exactly', () => {
  const expected = row(), actual = clone(expected)
  actual.nutrients = Object.fromEntries(Object.entries(actual.nutrients).reverse())
  assert.equal(box.drinkFoodRevision(actual), box.drinkFoodRevision(expected)); assert.equal(box.classifyDrinkFoodReadback(actual, expected), null)
})
check('one-bit float drift is classified separately without weakening exact review revisions', () => {
  const expected = row(), actual = clone(expected); actual.items[0].__voiceSourceFood.fat_g = nextUp(actual.items[0].__voiceSourceFood.fat_g)
  const result = box.classifyDrinkFoodReadback(actual, expected)
  assert.equal(result.kind, 'numeric_precision'); assert.equal(result.fieldPath, 'record.items.item.__voiceSourceFood.fat_g')
  assert.notEqual(box.drinkFoodRevision(actual), box.drinkFoodRevision(expected), 'Pre-write revisions stay exact')
})
check('material nutrition change outranks earlier precision drift and source/account identities stay exact', () => {
  const expected = row(), actual = clone(expected); actual.items[0].calories = nextUp(actual.items[0].calories); actual.nutrients.sugar_g += 0.01
  assert.equal(box.classifyDrinkFoodReadback(actual, expected).kind, 'numeric_change')
  for (const alter of [value => { value.userId = 'another-user' }, value => { value.id = 'another-record' }, value => { value.items[0].__voiceSourceFood.id = nextUp(171890) }]) {
    const candidate = clone(expected); alter(candidate); assert.notEqual(box.classifyDrinkFoodReadback(candidate, expected).kind, 'numeric_precision')
  }
})
check('unknown versus zero, missing fields, arrays and strings remain distinguishable without exposing values', () => {
  const expected = row()
  for (const [kind, alter] of [['null_change', value => { value.nutrients.fiber_g = 0 }], ['missing_key', value => { delete value.items[0].sugar_g }], ['array_length', value => { value.items.push({}) }], ['string_change', value => { value.name = 'Private changed note text' }]]) {
    const actual = clone(expected); alter(actual); const result = box.classifyDrinkFoodReadback(actual, expected)
    assert.equal(result.kind, kind); assert(!JSON.stringify(result).includes('Private')); assert.deepEqual(Object.keys(result).sort(), ['fieldPath', 'kind'])
  }
  const actual = clone(expected); actual.nutrients['Private chosen JSON key'] = 1
  assert.equal(box.classifyDrinkFoodReadback(actual, expected).fieldPath, 'record.nutrients.field')
})
async function main() {
  const fixture = fs.readFileSync(path.join(__dirname, 'voice-record-actions-check.cjs'), 'utf8').replace(/^#!.*\n/, '')
  const at = fixture.indexOf('async function run() {'); assert(at > 0)
  const { atomicDb, loadRoute, ctx, user } = new Function('require', '__dirname', `${fixture.slice(0, at)}\nreturn {atomicDb,loadRoute,ctx,user}`)(require, __dirname)
  const measured = (name, amount, unit, basisAmount, values) => {
    const source = { id: `public-synthetic-${name}`, name, serving_size: `${basisAmount} ${unit}`, ...values }
    const item = { id: source.id, name, serving_size: `${amount} ${unit}`, nutritionCoversServing: true, __voiceSourceFood: source }
    for (const [key, value] of Object.entries(values)) item[key] = value === null ? null : value * amount / basisAmount
    return item
  }
  const coffee = measured('coffee', 250, 'ml', 29.5735295625, { calories: 0.296, protein_g: 0.03552, carbs_g: 0, fat_g: 0.005920000000000001, fiber_g: null, sugar_g: 0 })
  const milk = amount => measured('whole milk', amount, 'ml', 100, { calories: 64.076, protein_g: 3.3784, carbs_g: 4.9317, fat_g: 3.2960000000000003, fiber_g: 0, sugar_g: 4.9543 })
  const sugar = measured('sugar', 8, 'g', 100, { calories: 385, protein_g: 0, carbs_g: 99.6, fat_g: 0, fiber_g: 0, sugar_g: 99.8 })
  const meal = items => {
    const nutrition = { __voiceBuiltMeal: true, __waterLogId: 'synthetic-water' }
    for (const [primary, alias] of [['calories', 'calories_kcal'], ['protein_g', 'protein'], ['carbs_g', 'carbs'], ['fat_g', 'fat'], ['fiber_g', 'fiber'], ['sugar_g', 'sugar']]) {
      const values = items.map(item => item[primary]); nutrition[primary] = nutrition[alias] = values.some(value => value === null) ? null : values.reduce((sum, value) => sum + value, 0)
    }
    return { items, nutrition }
  }
  const before = meal([coffee, milk(25), sugar]), changed = meal([coffee, milk(50), sugar])
  assert.equal(before.nutrition.fat, 0.8740447535987277)
  assert.equal(changed.nutrition.fat, 1.6980447535987278, 'Exact actual coffee plus50ml milk fat sum')
  const water = { id: 'synthetic-water', userId: user, amount: 250, unit: 'ml', amountMl: 250, label: 'Coffee with 8 g sugar with 25 ml milk', category: 'other', localDate: '2026-10-17', createdAt: '2026-10-16T17:17:52.996Z' }
  const food = { ...row(), userId: user, nutrients: before.nutrition, items: before.items }
  for (const mode of ['precision', 'material-fat', 'material-sugar', 'unknown-to-zero', 'owner', 'source-id']) {
    const initial = { water: [water], food: [food] }, f = atomicDb(initial), transaction = f.db.$transaction
    f.db.$transaction = (run, options) => transaction(async tx => {
      const findMany = tx.foodLog.findMany
      tx.foodLog.findMany = async query => {
        const rows = await findMany(query)
        if (!query.where.id?.in) return rows
        const result = clone(rows)
        result[0].nutrients.fat = nextUp(result[0].nutrients.fat)
        if (mode === 'material-fat') result[0].nutrients.fat_g += 0.01
        if (mode === 'material-sugar') result[0].nutrients.sugar_g += 0.01
        if (mode === 'unknown-to-zero') result[0].nutrients.fiber_g = 0
        if (mode === 'owner') result[0].userId = 'another-account'
        if (mode === 'source-id') result[0].items[0].__voiceSourceFood.id = 'another-source'
        return result
      }
      return run(tx)
    }, options)
    const route = loadRoute(relative, { prisma: f.db, authOptions: {}, getServerSession: async () => ({ user: { email: 'synthetic@example.invalid' } }), getUserIdFromNativeAuth: async () => user,
      validateNativeVoiceResolvedFood: ctx.validateNativeVoiceResolvedFood, deleteSmartCoachNotificationsByCategories: async () => {},
      NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) } })
    const response = await route.PATCH({ json: async () => ({ amount: 250, unit: 'ml', label: 'Coffee with 8 g sugar with 50 ml milk', expectedWaterState: water,
      resolvedDrinkFood: { food: changed, trustedSources: changed.items.map(item => item.__voiceSourceFood), expectedFoodState: food } }) }, { params: { id: water.id } })
    assert.equal(response.status, mode === 'precision' ? 200 : 500, mode)
    if (mode === 'precision') {
      assert.equal(f.state().food[0].nutrients.fat, changed.nutrition.fat)
      assert.equal(f.state().food[0].items[1].serving_size, '50 ml'); assert.equal(f.state().water[0].label, 'Coffee with 8 g sugar with 50 ml milk')
    } else assert.deepEqual(clone(f.state()), clone(initial), `${mode}: both water and nutrition must roll back`)
    passed++; console.log(`PASS actual source-sum resolved PATCH ${mode === 'precision' ? 'accepts only1ULP post-write drift' : `rejects ${mode} and rolls back every change`}`)
  }
  console.log(`Voice drink readback shape: ${passed} actual-source offline groups passed; no real database or app writes.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
