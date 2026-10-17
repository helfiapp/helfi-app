import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { parseFoodServing, liquidDensity, convertFoodAmount } from '../native/src/lib/foodUnits'
import { portionMealItems } from '../native/src/lib/mealPortionEditor'
import { savedMealPortion } from '../native/src/lib/mealPortions'
import * as nutrients from '../native/src/lib/nutrientValues'

// Execute the actual native adjustment/read/save helpers with amount-bearing
// recorded inputs. No device, network, account or saved food changes.
const file = 'native/src/screens/TrackCaloriesScreen.tsx'
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const diarySource = ts.createSourceFile('foodDiaryEntries.ts', fs.readFileSync('native/src/lib/foodDiaryEntries.ts', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const movedDiaryHelpers = new Set(['roundTo', 'nullableNumber', 'sanitizeEntryTotals', 'hasNonZeroEntryTotals', 'extractTotalsFromDescriptionText', 'recalculateTotalsFromItems', 'normalizeFoodApiEntry'])
function actual(name: string) {
  const actualSource = movedDiaryHelpers.has(name) ? diarySource : source
  let text = ''
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) text = `(${node.getText(actualSource).replace(/^export\s+/, '')})`
    ts.forEachChild(node, visit)
  }
  visit(actualSource); assert.ok(text, name)
  return ts.transpile(text, { target: ts.ScriptTarget.ES2020 })
}
const ctx = vm.createContext({ ...nutrients, parseFoodServing, liquidDensity, convertFoodAmount, savedMealPortion })
for (const name of ['roundTo', 'round1', 'nullableNumber', 'numberOrZero', 'normalizeFavoriteLabel', 'normalizeFavoriteAmountUnit', 'parseServingBaseForFavorite', 'favoriteAmountStateFromRaw', 'favoriteBaseForItem', 'convertFavoriteBaseAmount', 'favoriteAmountFromServings', 'favoriteAmountInBase', 'favoriteServingsFromAmount', 'formatFavoriteAmount', 'isOpenMeasurementServing', 'hasServingOptionMacroData', 'normalizeFavoriteServingOptions', 'findSelectedServingId', 'favoriteAdjustPersistenceFields', 'updateFavoriteAdjustItemAmount', 'calculateFavoriteAdjustTotals', 'cloneFavoriteItems', 'buildFavoriteAdjustItems']) ctx[name] = vm.runInContext(actual(name), ctx)
const raw = { id: 'recorded-chicken', name: 'Chicken meat with skin, cooked, roasted', serving_size: '100 g', amount: 100, amountUnit: 'g', __amount: 100, __unit: 'g', weightAmount: 100, weightUnit: 'g', servings: 1, calories: 239, protein_g: 27.3, carbs_g: 0, fat_g: 13.6, fiber_g: null, sugar_g: 0, source: 'usda', __sourceId: 'original-chicken' }
function build(rawItem: any) {
  return ctx.buildFavoriteAdjustItems({ id: 'fixture', label: 'Chicken', favorite: { items: [rawItem] } })[0]
}
function save(entry: any) {
  return { ...entry.raw, name: entry.name, serving_size: entry.servingLabel, servings: entry.servings, ...ctx.favoriteAdjustPersistenceFields(entry) }
}
const original = JSON.stringify(raw)
const half = ctx.updateFavoriteAdjustItemAmount(build(raw), '50')
assert.equal(ctx.calculateFavoriteAdjustTotals([half]).calories, 119.5)
const storedHalf = save(half)
const reopenedHalf = build(storedHalf)
assert.equal(reopenedHalf.amountInput, '50', 'saved 50 g cannot reopen as stale raw.amount100')
assert.equal(reopenedHalf.amountUnit, 'g')
assert.equal(reopenedHalf.servings, .5)
assert.equal(ctx.calculateFavoriteAdjustTotals([reopenedHalf]).calories, 119.5)
for (const key of ['amount', '__amount', 'weightAmount']) assert.equal(storedHalf[key], 50, `${key} must describe the same selected amount`)
for (const key of ['amountUnit', '__unit', 'weightUnit']) assert.equal(storedHalf[key], 'g')
for (const amount of ['25', '100', '200', '50']) {
  const changed = ctx.updateFavoriteAdjustItemAmount(reopenedHalf, amount)
  const reopened = build(save(changed))
  assert.equal(reopened.amountInput, amount)
  assert.equal(reopened.servings, Number(amount) / 100)
  assert.equal(ctx.calculateFavoriteAdjustTotals([reopened]).calories, 239 * Number(amount) / 100)
  assert.equal(reopened.raw.fiber_g, null)
  assert.equal(reopened.raw.sugar_g, 0)
}
// Adversarial records captured by the old save shape: canonical fields are newer
// than the public amount alias, even where the older unit differs.
for (const [record, amount, unit] of [
  [{ ...raw, amount: 100, amountUnit: 'g', __amount: 50, __unit: 'g', weightAmount: 50 }, '50', 'g'],
  [{ ...raw, amount: 100, amountUnit: 'g', __amount: 2, __unit: 'oz', weightAmount: 2, weightUnit: 'oz' }, '2', 'oz'],
  [{ name: 'Milk', amount: 100, amountUnit: 'g', weightAmount: 50, weightUnit: 'ml' }, '50', 'ml'],
] as const) {
  const before = JSON.stringify(record)
  const state = ctx.favoriteAmountStateFromRaw(record, record.name === 'Milk' ? '100 ml' : '100 g', .5)
  assert.equal(state.amountInput, amount)
  assert.equal(state.amountUnit, unit)
  assert.equal(JSON.stringify(record), before)
}
// Older imported recipes stored consumed-only ingredient rows. The actual
// reconstruction scales editor amounts to a whole recipe but leaves raw aliases.
const consumed = { ...raw, amount: 25, __amount: 25, weightAmount: 25, servings: .25 }
const reconstructed = portionMealItems([build(consumed)], 4)[0]
assert.equal(reconstructed.amountInput, '100')
assert.equal(reconstructed.servings, 1)
const reopenedRecipe = build(save(reconstructed))
assert.equal(reopenedRecipe.amountInput, '100', 'reconstructed recipe must not revive old consumed25g')
assert.equal(reopenedRecipe.servings, 1)
assert.equal(ctx.calculateFavoriteAdjustTotals([reopenedRecipe]).calories, 239)
assert.equal(JSON.stringify(raw), original, 'read/edit/save helpers do not mutate original saved input')
console.log('PASS: actual native amount-bearing raw adjustment/save/reopen, half/full/double values, canonical source fields and units, legacy consumed-recipe reconstruction, unknown/zero and immutable input.')
