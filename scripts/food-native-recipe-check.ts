import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as recipeValues from '../native/src/lib/recipeNutrition'
import * as nutrientValues from '../native/src/lib/nutrientValues'
import { parseFoodServing, liquidDensity, convertFoodAmount } from '../native/src/lib/foodUnits'

const source = ts.createSourceFile('TrackCaloriesScreen.tsx', fs.readFileSync('native/src/screens/TrackCaloriesScreen.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function actual(name: string) {
  let text = ''
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) text = `(${node.getText(source)})`
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) text = `(${node.initializer.getText(source)})`
    ts.forEachChild(node, visit)
  }
  visit(source); assert.ok(text, `Actual ${name} must exist`)
  return ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS })
}
const foods = [
  { id: 'flour', source: 'usda', name: 'Wheat flour, white, all-purpose', serving_size: '100 g', calories: 364, protein_g: 10.3, carbs_g: 76.3, fat_g: 1, fiber_g: 2.7, sugar_g: 0.3 },
  { id: 'egg', source: 'usda', name: 'Egg, whole, raw, fresh', serving_size: '100 g', calories: 143, protein_g: 12.56, carbs_g: 0.72, fat_g: 9.51, fiber_g: 0, sugar_g: 0.37 },
  { id: 'milk', source: 'usda', name: 'Milk, whole, 3.25% milkfat', serving_size: '100 ml', calories: 60, protein_g: 3.3, carbs_g: 4.7, fat_g: 3.2, fiber_g: null, sugar_g: 4.7 },
  { id: 'oil', source: 'usda', name: 'Oil, sunflower', serving_size: '100 ml', calories: 813, protein_g: 0, carbs_g: 0, fat_g: 92, fiber_g: 0, sugar_g: 0 },
]
for (const line of ['caster sugar to serve (optional)', 'lemon wedges', '1 tbsp sunflower or vegetable oil', 'a little oil', '1 cup flour', '2 eggs scrambled']) assert.equal(recipeValues.parseRecipeAmount(line), null, line)
assert.equal(recipeValues.parseRecipeAmount('1/2 kg flour')?.amount, 500)
assert.equal(recipeValues.parseRecipeAmount('1 1/2 l milk')?.amount, 1500)
assert.equal(recipeValues.parseRecipeAmount('½ kg flour')?.amount, 500)
assert.equal(recipeValues.parseRecipeAmount('2 large eggs')?.amount, 100)
assert.equal(recipeValues.parseRecipeAmount('100g chicken breast')?.lookup, 'chicken breast raw')
assert.equal(recipeValues.recipePortionRatio('', 12), null)
assert.equal(recipeValues.recipePortionRatio(1, 12), 1 / 12)
const eggRequest = recipeValues.parseRecipeAmount('2 large eggs')!
assert.equal(recipeValues.chooseRecipeFood([{ ...foods[1], name: 'Egg, whole, cooked, hard-boiled' }], eggRequest), null)
assert.equal(recipeValues.chooseRecipeFood([{ ...foods[1], name: 'Egg, white, raw, fresh' }], eggRequest), null)
const flourRequest = recipeValues.parseRecipeAmount('100g plain flour')!
assert.equal(recipeValues.chooseRecipeFood([{ ...foods[0], name: 'Rice flour, white' }], flourRequest), null)
assert.equal(recipeValues.chooseRecipeFood([{ ...foods[0], name: 'Wheat flour, self-rising' }], flourRequest), null)
const milkRequest = recipeValues.parseRecipeAmount('300ml milk')!
assert.equal(recipeValues.chooseRecipeFood([{ ...foods[2], name: 'Milk, human' }], milkRequest), null)
assert.equal(recipeValues.chooseRecipeFood([{ ...foods[2], calories: null }], milkRequest), null)
assert.equal(recipeValues.measuredRecipeFood({ ...foods[0] }, milkRequest), null, 'Unknown density blocks cross-dimension conversion')

const ctx = vm.createContext({ ...recipeValues, ...nutrientValues, parseFoodServing, liquidDensity, convertFoodAmount, AbortController, setTimeout, clearTimeout })
for (const name of ['roundTo', 'round1', 'numberOrZero', 'nullableNumber', 'normalizeFavoriteLabel', 'normalizeFavoriteAmountUnit', 'parseServingBaseForFavorite', 'favoriteAmountStateFromRaw', 'favoriteBaseForItem', 'convertFavoriteBaseAmount', 'favoriteAmountFromServings', 'formatFavoriteAmount', 'isOpenMeasurementServing', 'hasServingOptionMacroData', 'normalizeFavoriteServingOptions', 'findSelectedServingId', 'buildFavoriteAdjustItemFromSearchFood', 'calculateFavoriteAdjustTotals', 'favoriteAdjustPersistenceFields']) ctx[name] = vm.runInContext(actual(name), ctx)
ctx.session = { token: 'synthetic' }; ctx.API_BASE_URL = 'https://synthetic.invalid'; ctx.buildNativeAuthHeaders = () => ({})
ctx.fetch = async (url: string) => { assert.ok(url.includes('localOnly=1')); return { ok: true, json: async () => ({ items: foods }) } }
ctx.buildImportedRecipeItems = vm.runInContext(actual('buildImportedRecipeItems'), ctx)

async function main() {
  const lines = ['100g plain flour', '2 large eggs', '300ml milk', '15ml sunflower oil']
  const result = await ctx.buildImportedRecipeItems(lines)
  assert.equal(result.missing.length, 0); assert.equal(result.items.length, 4)
  assert.deepEqual(JSON.parse(JSON.stringify(result.items.map((item: any) => item.raw.id))), ['flour', 'egg', 'milk', 'oil'])
  const batch = ctx.calculateFavoriteAdjustTotals(result.items)
  assert.equal(batch.calories, 808.95); assert.equal(batch.fiber, null)
  ctx.favoriteEditItems = result.items
  ctx.recipeServingsAppliedRef = { current: 12 }
  ctx.setRecipeServingsEaten = (value: string) => { ctx.recipeServingsEaten = value }
  ctx.setFavoriteEditItems = (value: any) => { ctx.favoriteEditItems = typeof value === 'function' ? value(ctx.favoriteEditItems) : value }
  const portion = vm.runInContext(actual('updateRecipeServingsEaten'), ctx)
  for (const servings of [1, 2, 12, 1]) {
    portion(String(servings))
    const totals = ctx.calculateFavoriteAdjustTotals(ctx.favoriteEditItems)
    assert.ok(Math.abs(totals.calories - batch.calories * servings / 12) < 0.000001)
    assert.equal(totals.fiber, null)
    if (servings === 12) assert.equal(ctx.favoriteEditItems[0].amountInput, '100', 'Returning to the full recipe must not accumulate display rounding')
  }
  let opened: any = null; let error = ''; let closed = false
  ctx.importRecipe = { title: 'Pancakes', servings: 12, ingredients: lines, steps: ['Mix and cook'], sourceUrl: 'https://example.invalid/recipe' }
  ctx.importRecipeLoading = false; ctx.importRecipeIngredientsText = lines.join('\n'); ctx.importRecipeStepsText = 'Mix and cook'; ctx.importRecipeServings = '12'; ctx.importRecipeTitle = 'Pancakes'; ctx.importRecipeTargetMeal = 'other'
  ctx.cleanRecipeLines = (text: string) => text.split('\n').filter(Boolean)
  ctx.setImportRecipeLoading = () => {}; ctx.setImportRecipeError = (value: string) => { error = value }
  ctx.setImportRecipeOpen = () => { closed = true }; ctx.openNativeMealBuilder = (_meal: string, value: any) => { opened = value }
  ctx.setMealRecipe = (value: any) => { ctx.mealRecipe = value }; ctx.Alert = { alert: () => {} }
  const continueRecipe = vm.runInContext(actual('continueImportedRecipeToBuilder'), ctx)
  ctx.importRecipeIngredientsText += '\noptional sugar to serve'
  await continueRecipe(); assert.equal(opened, null); assert.equal(closed, false); assert.ok(error.includes('optional sugar'))
  ctx.importRecipeIngredientsText = lines.join('\n')
  await continueRecipe(); assert.equal((opened as any).items.length, 4); assert.equal(ctx.mealRecipe.servings, 12); assert.equal(ctx.mealRecipe.steps[0], 'Mix and cook'); assert.equal(closed, true)
  ctx.favoriteEditItems = (opened as any).items; ctx.recipeServingsAppliedRef.current = 12; portion('1')
  ctx.mealBuilderOpen = true; ctx.favoriteEditItem = null; ctx.favoriteEditName = 'Pancakes'; ctx.favoritesTargetMeal = 'other'; ctx.favoriteEditTime = '05:00'; ctx.selectedDate = '2026-10-05'; ctx.editorTimeToDate = () => '2026-10-04T18:00:00Z'
  let saved: any
  ctx.createFoodEntry = async (value: any) => { saved = value; return true }
  for (const name of ['setMealBuilderOpen', 'setFavoriteEditName', 'setFavoriteEditIngredientsExpanded', 'setFavoriteEditExpandedItemId', 'setFavoriteEditServingPickerItemId', 'setFavoriteEditServingLoadingId']) ctx[name] = () => {}
  await vm.runInContext(actual('updateFavoriteFromEditor'), ctx)()
  assert.equal(saved.calories, 67); assert.equal(saved.fiber, null); assert.equal(saved.nutrition.__importRecipe.servings, 12); assert.equal(saved.nutrition.__nativeRecipeServingsEaten, 1)
  assert.equal(saved.nutrition.__importRecipe.sourceUrl, 'https://example.invalid/recipe'); assert.equal(saved.items[1].id, 'egg'); assert.equal(saved.items[1].servings, 1 / 12)
  console.log('PASS: actual native recipe matching, missing-item review, ingredient quantities, yield, one/two/full-batch scaling and saved recipe provenance; no network or AI calls.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
