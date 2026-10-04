import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { materializeMealPortion } from '../native/src/lib/mealPortions'
import { convertFoodAmount, parseFoodServing, liquidDensity } from '../native/src/lib/foodUnits'
import * as nutrientValues from '../native/src/lib/nutrientValues'

// Execute the actual screen's pure read/editor/save functions, without React or network calls.
const source = ts.createSourceFile('screen.tsx', fs.readFileSync('native/src/screens/TrackCaloriesScreen.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const code = source.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name && !/^[A-Z]/.test(node.name.text)).map(node => node.getText(source)).join('\n')
const context: any = { ...nutrientValues, materializeMealPortion, convertFoodAmount, parseFoodServing, liquidDensity }
vm.createContext(context)
vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context)
for (const scale of [0.5, 1, 2]) {
  const items = [{ name: 'Rice cooked', serving_size: '100 g', calories: 120, protein_g: 3, carbs_g: 25, fat_g: 1, servings: 1 }, { name: 'Chicken cooked', serving_size: '100 g', calories: 160, protein_g: 30, carbs_g: 0, fat_g: 3, servings: 1 }]
  const raw = { id: 'fixture', name: 'Meal', items, nutrition: { __portionScale: scale }, total: { __portionScale: scale } }
  const diary = context.normalizeFoodApiEntry(raw)
  assert.equal(diary.nutrients.calories, 280 * scale)
  assert.equal(diary.nutrients.protein, 33 * scale)
  const favorite = context.normalizeFavoriteMeal(raw)
  assert.equal(favorite.nutrients.calories, diary.nutrients.calories)
  const editor = context.buildFavoriteAdjustItems({ id: 'fixture', favorite })
  assert.equal(context.calculateFavoriteAdjustTotals(editor).calories, 280 * scale)
  const saved = context.favoriteStorageRecord(favorite)
  assert.equal(context.normalizeFoodApiEntry(saved).nutrients.calories, 280 * scale, 'favorite save/reload')
  assert.equal(context.normalizeFavoriteMeal({ ...raw, items: JSON.stringify(items) }).nutrients.calories, 280 * scale, 'legacy string ingredients')
  assert.equal(context.normalizeFavoriteMeal({ ...raw, items: undefined, ingredients: items }).nutrients.calories, 280 * scale, 'legacy ingredient key')
}
assert.equal(context.normalizeFoodApiEntry({ items: [{ calories: 0, protein_g: 1, carbs_g: 0, fat_g: 0, servings: 1 }] }).nutrients.calories, 0, 'a declared zero is not a missing calorie estimate')
const oil = context.buildFavoriteAdjustItemFromSearchFood({ name: 'Olive oil', id: 'oil', serving_size: '100 g', calories: 884, fat_g: 100, protein_g: 0, carbs_g: 0 })
const oilMl = context.updateFavoriteAdjustItemUnit(oil, 'ml')
assert.ok(Math.abs(Number(oilMl.amountInput) - 108.7) < 0.02)
const smaller = context.updateFavoriteAdjustItemAmount(oilMl, '100')
assert.equal(smaller.servings, 0.92)
assert.ok(Math.abs(context.calculateFavoriteAdjustTotals([smaller]).calories - 813.28) < 0.001)
const unknown = context.buildFavoriteAdjustItemFromSearchFood({ name: 'Unknown sauce', id: 'sauce', serving_size: '100 ml', calories: 120 })
assert.deepEqual(Array.from(context.favoriteAmountUnitOptions(unknown)), ['ml', 'fl oz'])
for (const name of ['Mayonnaise, reduced fat, with olive oil', 'Apple juice, frozen concentrate, diluted with 3 volume water', 'Water chestnuts, chinese, raw', 'Egg, scrambled, with milk']) {
  const food = context.buildFavoriteAdjustItemFromSearchFood({ name, id: 'original-mixture', serving_size: '100 g', calories: 120, protein_g: 2, carbs_g: 4, fat_g: 10 })
  assert.equal(food.baseUnit, 'g', `${name}: recorded weight basis remains weight`)
  assert.deepEqual(Array.from(context.favoriteAmountUnitOptions(food)), ['g', 'oz'], `${name}: no invented density in native editor`)
  assert.equal(context.calculateFavoriteAdjustTotals([context.updateFavoriteAdjustItemAmount(food, '50')]).calories, 60)
}
assert.equal(context.parseServingBaseForFavorite('8 fl oz').unit, 'fl oz')
assert.equal(context.nullableNumber(null), null)
assert.equal(context.hasServingOptionMacroData({ calories: 120, protein_g: null, carbs_g: 30, fat_g: 0 }), false)
console.log('PASS: actual native diary, favorite, editor, persisted reload, historical portions, oil amount edits and separate ounce units.')

const salmon = context.buildFavoriteAdjustItemFromSearchFood({ name: 'Grilled salmon', serving_size: '1 fillet, about 7 oz (200g)', calories: 412, protein_g: 44, carbs_g: 0, fat_g: 25 })
const salmonG = context.updateFavoriteAdjustItemUnit(salmon, 'g')
assert.equal(Number(salmonG.amountInput), 200)
const halfSalmon = context.updateFavoriteAdjustItemAmount(salmonG, '100')
assert.equal(context.calculateFavoriteAdjustTotals([halfSalmon]).calories, 206)
