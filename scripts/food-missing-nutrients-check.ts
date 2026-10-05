import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as nativeValues from '../native/src/lib/nutrientValues'
import * as webValues from '../lib/food/nutrient-values'
import { materializeMealPortion } from '../native/src/lib/mealPortions'
import { parseFoodServing, liquidDensity, convertFoodAmount } from '../native/src/lib/foodUnits'

// Exercise the actual save/read/editor functions, without app dependencies,
// a database, network traffic, credentials, or a live AI request.
function sourceFile(path: string) {
  return ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}
function expression(source: ts.SourceFile, name: string, unwrapHook = false) {
  let found = ''
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = `(${node.getText(source)})`
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) {
      const value = unwrapHook && ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer
      found = `(${value.getText(source)})`
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(found, `${name} must be extracted from the actual source`)
  return ts.transpile(found, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS })
}
function bind(context: vm.Context, source: ts.SourceFile, names: string[]) {
  for (const name of names) context[name] = vm.runInContext(expression(source, name), context)
}
const plain = (value: any) => JSON.parse(JSON.stringify(value))
const native = sourceFile('native/src/screens/TrackCaloriesScreen.tsx')
const ctx = vm.createContext({ ...nativeValues, materializeMealPortion, parseFoodServing, liquidDensity, convertFoodAmount, console })
bind(ctx, native, ['roundTo', 'round1', 'nullableNumber', 'numberOrZero', 'normalizeFavoriteLabel', 'normalizeFavoriteAmountUnit', 'parseServingBaseForFavorite', 'favoriteAmountStateFromRaw', 'favoriteBaseForItem', 'convertFavoriteBaseAmount', 'favoriteAmountFromServings', 'formatFavoriteAmount', 'isOpenMeasurementServing', 'hasServingOptionMacroData', 'normalizeFavoriteServingOptions', 'findSelectedServingId', 'sanitizeEntryTotals', 'hasNonZeroEntryTotals', 'extractTotalsFromDescriptionText', 'recalculateTotalsFromItems', 'normalizeFoodApiEntry', 'buildFavoriteAdjustItems', 'buildFavoriteAdjustItemFromSearchFood', 'calculateFavoriteAdjustTotals', 'buildFallbackFavoriteServingOptions', 'formatMacroAmount', 'formatNutrientGrams', 'formatFavoriteNutrientValue'])

const sauce = { id: '1106110', source: 'usda', name: 'TERIYAKI SAUCE', barcode: '072036761163', serving_size: '100 g', calories: 88, protein_g: 5.88, carbs_g: 11.76, fat_g: 0, fiber_g: null, sugar_g: 11.76, servings: 1 }
const zero = { ...sauce, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }
const missingSugar = { ...sauce, fiber_g: 0, sugar_g: null }
for (const values of [nativeValues, webValues]) {
  for (const unknown of [null, undefined, '', ' ', false, NaN, -1]) assert.equal(values.optionalNutrient(unknown), null)
  assert.equal(values.optionalNutrient(0), 0)
  assert.equal(values.optionalNutrient('0'), 0)
  assert.equal(values.readOptionalNutrient({ fiber: null, fiber_g: 0 }, ['fiber', 'fiber_g']), null, 'explicit unknown cannot be replaced by a stale alias')
}
for (const item of [sauce, zero, missingSugar]) {
  for (const factor of [0.5, 1, 2]) {
    const raw = { id: 'saved', name: item.name, items: [{ ...item, servings: factor }], nutrition: { calories: item.calories * factor, fiber: item.fiber_g, sugar: item.sugar_g } }
    const read = ctx.normalizeFoodApiEntry(raw)
    assert.equal(read.nutrients.fiber, item.fiber_g == null ? null : 0)
    assert.equal(read.nutrients.sugar, item.sugar_g == null ? null : nativeValues.roundOptionalNutrient(item.sugar_g * factor))
    const edited = ctx.buildFavoriteAdjustItems({ id: 'entry:saved', entry: read, label: item.name, serving: '100 g', calories: item.calories })
    assert.equal(edited[0].fiber, item.fiber_g)
    assert.equal(edited[0].sugar, item.sugar_g)
    const totals = ctx.calculateFavoriteAdjustTotals(edited)
    assert.equal(totals.fiber, item.fiber_g == null ? null : 0)
    assert.equal(totals.sugar, item.sugar_g == null ? null : item.sugar_g * factor)
    const searched = ctx.buildFavoriteAdjustItemFromSearchFood(item)
    const options = ctx.buildFallbackFavoriteServingOptions(searched)
    assert.ok(options.some((option: any) => option.serving_size === '1 g'))
    assert.ok(options.every((option: any) => option.fiber_g === (item.fiber_g == null ? null : 0)))
  }
}
assert.equal(ctx.recalculateTotalsFromItems([zero]).fiber, 0, 'genuine zero survives')
assert.equal(ctx.recalculateTotalsFromItems([sauce, { ...zero, fiber_g: 2 }]).fiber, null, 'partial sum cannot be labelled complete')
assert.equal(ctx.calculateFavoriteAdjustTotals([{ ...ctx.buildFavoriteAdjustItemFromSearchFood(sauce) }, { ...ctx.buildFavoriteAdjustItemFromSearchFood(zero), fiber: 2 }]).fiber, null)
assert.equal(ctx.sanitizeEntryTotals({ calories: 88, fiber: null, fiber_g: 0 }).fiber, null)
assert.equal(ctx.extractTotalsFromDescriptionText('Calories: 88, Protein: 5.9g').fiber, null)
assert.equal(ctx.formatMacroAmount(null), '—')
assert.equal(ctx.formatFavoriteNutrientValue('fiber', null, 'kcal'), '—')
assert.equal(ctx.formatFavoriteNutrientValue('fiber', 0, 'kcal'), '0g')

async function main() {
let barcodePayload: any
ctx.barcodeFood = sauce
ctx.barcodeUsageMode = 'diary'
ctx.barcodeTargetMeal = 'snacks'
ctx.barcodeCode = sauce.barcode
ctx.createFoodEntry = async (value: any) => { barcodePayload = plain(value); return true }
ctx.setBarcodeOpen = () => {}
ctx.Alert = { alert: () => { throw new Error('Unexpected UI error') } }
await vm.runInContext(expression(native, 'addBarcodeFood'), ctx)()
assert.equal(barcodePayload.fiber, null)
assert.equal(barcodePayload.nutrition.fiber, null)
assert.equal(barcodePayload.nutrition.fiber_g, null)
assert.equal(barcodePayload.nutrition.fat, 0)
assert.equal(barcodePayload.items[0].fiber_g, null)
let savedBody: any
ctx.authHeaders = {}
ctx.session = { token: 'synthetic-test-token' }
ctx.buildNativeAuthHeaders = () => ({})
ctx.API_BASE_URL = 'https://synthetic.invalid'
ctx.selectedDate = '2026-10-05'
ctx.setEntries = () => {}
ctx.fetch = async (_url: any, options: any) => { savedBody = JSON.parse(options.body); return { ok: true, json: async () => ({ id: 'saved' }) } }
const create = vm.runInContext(expression(native, 'createFoodEntry', true), ctx)
await create(barcodePayload)
assert.equal(savedBody.nutrition.fiber, null)
assert.equal(ctx.normalizeFoodApiEntry(savedBody).nutrients.fiber, null)
await create({ name: 'Without item data', meal: 'snacks', calories: 88, protein: 5.88, carbs: 11.76, fat: 0, fiber: null, sugar: 0 })
assert.equal(savedBody.nutrition.fiber, null)
assert.equal(savedBody.nutrition.sugar, 0)

// Re-save the reopened diary through the actual ingredient editor handler.
ctx.favoriteEditItem = { entry: ctx.normalizeFoodApiEntry({ id: 'saved', name: sauce.name, items: [sauce], nutrition: barcodePayload.nutrition }), label: sauce.name }
ctx.mealBuilderOpen = false
ctx.mealRecipe = null
ctx.recipeServingsEaten = ''
ctx.favoriteEditItems = ctx.buildFavoriteAdjustItems({ id: 'entry:saved', ...ctx.favoriteEditItem })
ctx.favoriteEditName = sauce.name
ctx.favoritesTargetMeal = 'snacks'
ctx.favoriteEditTime = '04:41'
ctx.favoriteAdjustPersistenceFields = vm.runInContext(expression(native, 'favoriteAdjustPersistenceFields'), ctx)
ctx.editorTimeToDate = () => '2026-10-04T17:41:00Z'
for (const name of ['setFavoriteEditItem', 'setFavoriteEditItems', 'setFavoriteEditName', 'setFavoriteEditIngredientsExpanded', 'setFavoriteEditExpandedItemId', 'setFavoriteEditServingPickerItemId', 'setFavoriteEditServingLoadingId']) ctx[name] = () => {}
await vm.runInContext(expression(native, 'updateFavoriteFromEditor'), ctx)()
assert.equal(savedBody.items[0].fiber_g, null)
assert.equal(savedBody.nutrition.fiber, null)
assert.equal(savedBody.nutrition.fiber_g, null)
assert.equal(ctx.normalizeFoodApiEntry(savedBody).nutrients.fiber, null)

const builder = sourceFile('app/food/build-meal/MealBuilderClient.tsx')
const web = vm.createContext({ ...webValues, console })
bind(web, builder, ['toNumber', 'round3', 'macroOrZero', 'computeItemTotals', 'applyPortionScaleToTotals', 'isLikelyLiquidItem', 'isMeasuredLiquidItem', 'serializeBuilderMeasurement', 'builderMeasurementError'])
web.computeServingsFromAmount = (item: any) => item.servings ?? 1
for (const item of [sauce, zero, missingSugar]) {
  const totals = web.computeItemTotals(item)
  assert.equal(totals.fiber, item.fiber_g)
  assert.equal(totals.sugar, item.sugar_g)
  const scaled = web.applyPortionScaleToTotals(totals, 0.5)
  assert.equal(scaled.fiber, item.fiber_g)
  assert.equal(scaled.sugar, item.sugar_g == null ? null : webValues.roundOptionalNutrient(item.sugar_g / 2))
  web.items = [item]
  const whole = vm.runInContext(expression(builder, 'baseMealTotals', true), web)()
  assert.equal(whole.fiber, item.fiber_g)
  assert.equal(whole.sugar, item.sugar_g)
}
web.items = [sauce, { ...zero, fiber_g: 2 }]
assert.equal(vm.runInContext(expression(builder, 'baseMealTotals', true), web)().fiber, null)
// The recipe draft's actual prefill boundary must not turn null into zero.
Object.assign(web, { prefill: sauce, prefillName: sauce.name, lineIndex: 0, lookup: sauce.name, line: sauce.name })
const prefill = vm.runInContext(expression(builder, 'prefillCandidate'), web)
assert.equal(prefill.fiber_g, null)
assert.equal(prefill.sugar_g, sauce.sugar_g)
assert.equal(web.toNumber(null), null)
assert.equal(web.toNumber(''), null)
assert.equal(web.toNumber(0), 0)
// Check the actual web editor's saved bundle, including portion scaling.
Object.assign(web, { isDiaryEdit: true, sourceLogId: 'saved', itemsRef: { current: [sauce] }, items: [sauce], mealName: sauce.name, linkedFavoriteId: '', selectedDate: '2026-10-05', entryTime: '04:41', portionUnit: 'fraction', portionAmountInput: '0.5', portionInputRef: { current: { value: '0.5' } }, recipeServingsForPortion: 1, sanitizeMealTitle: (name: string) => name, buildDefaultMealName: () => sauce.name, computeTotalRecipeWeightG: () => 100, computePortionScale: () => 0.5, computePortionWeightG: () => 50, parseNumericInput: (value: any) => Number(value), buildCreatedAtFromEntryTime: () => '2026-10-04T17:41:00Z' })
bind(web, builder, ['buildItemsSignature'])
for (const enabled of [false, true]) {
  web.portionControlEnabled = enabled
  const bundle = vm.runInContext(expression(builder, 'buildDiaryAutosaveBundle', true), web)()
  assert.equal(bundle.cleanedItems[0].fiber_g, null)
  assert.equal(bundle.diaryNutrition.fiber, null)
  assert.equal(bundle.diaryNutrition.calories, enabled ? 44 : 88)
  assert.equal(ctx.normalizeFoodApiEntry({ items: bundle.cleanedItems, nutrition: bundle.diaryNutrition }).nutrients.fiber, null)
}
const diary = sourceFile('app/food/page.tsx')
bind(web, diary, ['recalculateNutritionFromItems', 'sanitizeNutritionTotals', 'applyPortionScaleToTotals', 'scaleTotalsForFavoriteAdjust'])
web.effectiveServings = (item: any) => item.servings ?? 1
web.macroMultiplierForItem = (item: any) => item.macroMultiplier ?? 1
web.foodNumberOrNull = webValues.optionalNutrient
for (const item of [sauce, zero, missingSugar]) {
  const totals = web.recalculateNutritionFromItems([item])
  assert.equal(totals.fiber, item.fiber_g)
  assert.equal(totals.sugar, webValues.roundOptionalNutrient(item.sugar_g))
  assert.equal(web.sanitizeNutritionTotals(totals).fiber, item.fiber_g)
  assert.equal(web.applyPortionScaleToTotals(totals, 0.5).fiber, item.fiber_g)
  assert.equal(web.scaleTotalsForFavoriteAdjust(totals, 2).fiber, item.fiber_g)
}
assert.equal(web.recalculateNutritionFromItems([sauce, { ...zero, fiber_g: 2 }]).fiber, null)
console.log('PASS: actual native barcode/save/read/editor/serving paths and web diary/meal totals preserve unknown fibre/sugar, real zero, mixed ingredients and half/double portions.')

}
main().catch((error) => { console.error(error); process.exitCode = 1 })
