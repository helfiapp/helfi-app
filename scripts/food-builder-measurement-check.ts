import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import { DRY_FOOD_MEASUREMENTS } from '../lib/food/dry-food-measurements'
import { PRODUCE_MEASUREMENTS } from '../lib/food/produce-measurements'
import { DAIRY_SEMI_SOLID_MEASUREMENTS } from '../lib/food/dairy-semi-solid-measurements'
import * as nutrients from '../lib/food/nutrient-values'
import { convertFoodAmount, liquidDensity, liquidHouseholdMl, parseFoodServing } from '../native/src/lib/foodUnits'

const path = 'app/food/build-meal/MealBuilderClient.tsx'
const baseline = process.argv.includes('--baseline')
const source = ts.createSourceFile(path, baseline ? execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' }) : fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const ctx = vm.createContext({ DRY_FOOD_MEASUREMENTS, PRODUCE_MEASUREMENTS, DAIRY_SEMI_SOLID_MEASUREMENTS, ...nutrients, convertFoodAmount, liquidDensity, liquidHouseholdMl, parseFoodServing, userData: { country: 'AU' }, measurementCountry: 'AU', useCallback: (fn: any) => fn, console })
const top = source.statements.filter(node => !ts.isImportDeclaration(node) && !(ts.isFunctionDeclaration(node) && node.name?.text === 'MealBuilderClient')).map(node => node.getText(source)).join('\n')
vm.runInContext(ts.transpile(top, { target: ts.ScriptTarget.ES2020 }), ctx)
function actual(name: string) {
  let expression = ''
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) expression = node.initializer.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source); assert.ok(expression, `Actual ${name} exists`)
  return vm.runInContext(ts.transpile(`(${expression})`, { target: ts.ScriptTarget.ES2020 }), ctx)
}
const evaluate = (expression: string) => vm.runInContext(expression, ctx)
const close = (value: number, expected: number) => assert.ok(Math.abs(value - expected) < 1e-8, `${value} must equal ${expected}`)
const oil = { id: 'source-original-oil', name: 'Oil, olive, salad or cooking', serving_size: '100 ml', calories: 813.2800000000001, fat_g: 92, protein_g: 0, carbs_g: 0, fiber_g: 0, sugar_g: 0, servings: 1, __baseAmount: 100, __baseUnit: 'ml', __unit: 'ml', __amount: 100, __amountInput: '100', __pieceGrams: null, __measurementCountry: 'AU', __source: 'usda', __sourceId: '171413' }
ctx.oil = oil
// Before repair this actual builder conversion says100ml oil =100g.
close(evaluate("convertAmount(100, 'ml', 'g', 100, 'ml', null, getFoodUnitGrams(oil.name), oil)"), 92)
close(evaluate("computeTotalRecipeWeightG([oil])"), 92)
close(evaluate("computeItemTotals({...oil,__unit:'g',__amount:100}).calories"), 884)
assert.equal(evaluate("formatUnitLabel('cup', oil)"), 'cup — 250 ml')
assert.equal(evaluate("formatUnitLabel('tbsp', oil)"), 'tbsp — 20 ml')
assert.ok(!Array.from(evaluate('allowedUnitsForItem(oil)')).includes('piece-small'), 'olive fruit pieces must not appear for olive oil')

let items: any[] = [JSON.parse(JSON.stringify(oil))]
Object.assign(ctx, { setItems: (update: any) => { items = update(items) } })
const setUnit = actual('setUnit'), setAmount = actual('setAmount')
setUnit(oil.id, 'g'); close(items[0].__amount, 92); close(items[0].servings, 1)
setAmount(oil.id, '100'); ctx.current = items[0]; close(evaluate('computeItemTotals(current).calories'), 884)
setUnit(oil.id, 'ml'); close(items[0].__amount, 100 / .92)
items = [JSON.parse(JSON.stringify(oil))]
setUnit(oil.id, 'cup'); close(items[0].__amount, .4); close(items[0].servings, 1)
setAmount(oil.id, '1'); ctx.current = items[0]; close(evaluate('computeItemTotals(current).calories'), 2033.2); close(evaluate('computeTotalRecipeWeightG([current])'), 230)
for (const [country, unit, ml] of [['AU','tbsp',20],['AU','quarter-cup',62.5],['US','tbsp',15],['US','cup',240]] as const) {
  ctx.current = { ...oil, __measurementCountry: country, __unit: unit, __amount: 1, __amountInput: '1' }
  close(evaluate('computeServingsFromAmount(current)'), ml / 100)
}
const unknown = { ...oil, name: 'Apple juice', __baseUnit: 'g', __unit: 'g' }
ctx.unknown = unknown
assert.ok(!Array.from(evaluate('allowedUnitsForItem(unknown)')).includes('ml'), 'unknown juice density cannot invent ml')
assert.ok(Number.isNaN(evaluate("convertAmount(100,'ml','g',100,'g',null,null,unknown)")))
ctx.unknown = { ...unknown, __baseUnit: 'ml', __unit: 'ml' }
assert.ok(!Array.from(evaluate('allowedUnitsForItem(unknown)')).includes('g'))
assert.ok(Number.isNaN(evaluate('computeTotalRecipeWeightG([oil, unknown])')), 'a partly weighed recipe cannot claim its full weight')
// Actual saved-entry hydration conserves the original eaten serving count.
const hydrate = actual('convertToBuilderItems')
for (const raw of [
  { ...oil, id: '171413', source: 'usda', __unit: 'g', __amount: 100, servings: 1 },
  { ...oil, id: '171413', source: 'usda', __unit: 'cup', __amount: 1, servings: 1.65 },
  { ...oil, id: '171413', source: 'usda', __unit: undefined, __amount: undefined, weightUnit: 'ml', weightAmount: 62.5, servings: .625 },
]) {
  const before = JSON.stringify(raw)
  const restored = hydrate([raw])[0]; ctx.restored = restored
  close(evaluate('computeItemTotals(restored).calories'), oil.calories * raw.servings)
  assert.equal(JSON.stringify(raw), before, 'no historical rewrite')
  assert.equal(restored.__sourceId, '171413'); assert.equal(restored.serving_size, '100 ml')
}
// Original provider cup mass remains the nutrition basis, independent of AU.
const provider = { ...oil, name: 'Apple juice, frozen concentrate, diluted with 3 volume water', servings: .5 }
const option = { id: 'recorded-cup', label: '1 cup — 239g', grams: 239, ml: null, calories: 112, fat_g: 0, protein_g: 0, carbs_g: 28, fiber_g: 0, sugar_g: null }
const selectServing = actual('applyServingOptionToItem')
ctx.recorded = selectServing(provider, option)
assert.equal(ctx.recorded.__baseAmount, 239); assert.equal(ctx.recorded.__baseUnit, 'g')
close(evaluate('computeItemTotals(recorded).calories'), 56)
assert.equal(ctx.recorded.sugar_g, null)
assert.equal(evaluate('parseServingBase("1 cup — 239g").amount'), 239)
assert.equal(evaluate('parseServingBase("1 fl oz").unit'), 'ml')
assert.ok(Array.from(evaluate('allowedUnitsForItem({...oil,name:"Apple",__baseUnit:"g"})')).includes('piece-medium'), 'solid counted portions stay available')

// Both actual save mappings must store country-independent physical amounts.
Object.assign(ctx, { isDiaryEdit: true, savedPortionScale: null, portionScaleOverriddenByUser: false, sourceCreatedAtRef: { current: null }, sourceLogId: 'fixture-saved', mealName: 'Measured oil', linkedFavoriteId: '', selectedDate: '2026-10-05', entryTime: '14:00', portionUnit: 'serving', portionAmountInput: '1', portionInputRef: { current: { value: '1' } }, recipeServingsForPortion: 1, sanitizeMealTitle: (name: string) => name, buildDefaultMealName: () => 'Measured oil', portionControlEnabled: false })
for (const [unit, amount, expectedMl] of [['tbsp',1,20],['quarter-cup',1,62.5],['cup',.4,100]] as const) {
  const item = { ...oil, __unit: unit, __amount: amount, __amountInput: String(amount), fiber_g: null }
  Object.assign(ctx, { itemsForSave: [item], itemsRef: { current: [item] }, items: [item], shouldStripBuilderIds: false, sourceItemsForMerge: null })
  const bundle = actual('buildDiaryAutosaveBundle')()
  close(bundle.cleanedItems[0].__amount, expectedMl); assert.equal(bundle.cleanedItems[0].__unit, 'ml')
  assert.equal(bundle.cleanedItems[0].id, '171413'); assert.equal(bundle.cleanedItems[0].source, 'usda')
  assert.equal(bundle.cleanedItems[0].calories, oil.calories); assert.equal(bundle.cleanedItems[0].fiber_g, null)
  close(bundle.cleanedItems[0].servings, expectedMl / 100)
  assert.equal(bundle.diaryNutrition.calories, Math.round(oil.calories * expectedMl / 100))
  const manual = actual('cleanedItems')
  close(manual[0].weightAmount, expectedMl); assert.equal(manual[0].weightUnit, 'ml')
  const reopened = hydrate(manual)[0]; ctx.reopened = reopened
  close(evaluate('computeItemTotals(reopened).calories'), oil.calories * expectedMl / 100)
}
ctx.invalid = { ...oil, __amount: 0, __amountInput: '0' }
assert.ok(evaluate('builderMeasurementError([invalid])'))
assert.ok(evaluate('builderMeasurementError([unknown],true,"g")'))
assert.equal(evaluate('builderMeasurementError([unknown],true,"serving")'), null)
// Real recipe-import insertion uses the same AU liquid conversion.
let imported: any
Object.assign(ctx, { addBuilderItem: (item: any) => { imported = item }, triggerHaptic: () => {} })
actual('addItemDirectWithOverrides')({ ...oil, source: 'usda', id: '171413' }, { amount: 2, unit: 'tbsp' }, { displayName: 'Olive oil', matchedName: oil.name, importKey: 'fixture-line' })
ctx.imported = imported; close(imported.__amount, 36.8); assert.equal(imported.__unit, 'g')
close(evaluate('computeItemTotals(imported).calories'), 325.312)
for (const serving_size of ['1 cup', '2 tbsp', '1 serving']) {
  const raw = { ...oil, __unit: 'cup', __amount: 1, serving_size, servings: .5 }
  const before = JSON.stringify(raw), restored = hydrate([raw])[0]; ctx.restored = restored
  assert.equal(restored.__baseUnit, 'serving'); assert.equal(restored.__baseAmount, 1)
  close(evaluate('computeItemTotals(restored).calories'), oil.calories / 2)
  assert.deepEqual(Array.from(evaluate('allowedUnitsForItem(restored)')), ['serving'])
  assert.ok(Number.isNaN(evaluate('computeTotalRecipeWeightG([restored])')))
  assert.equal(JSON.stringify(raw), before)
}
console.log('PASS: actual builder oil density, AU/non-AU household measures, dropdown/amount handlers and unknown-density restrictions; no network or credentials.')
