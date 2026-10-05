import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { materializeMealPortion } from '../native/src/lib/mealPortions'
import { convertFoodAmount, parseFoodServing, liquidDensity } from '../native/src/lib/foodUnits'
import * as nutrientValues from '../native/src/lib/nutrientValues'

// Execute the actual screen's pure read/editor/save functions, without React or network calls.
const source = ts.createSourceFile('screen.tsx', fs.readFileSync('native/src/screens/TrackCaloriesScreen.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
assert.equal((source as any).parseDiagnostics.length, 0, 'native screen JSX parses before exercising result fragments')
const code = source.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name && !/^[A-Z]/.test(node.name.text)).map(node => node.getText(source)).join('\n')
const context: any = { ...nutrientValues, materializeMealPortion, convertFoodAmount, parseFoodServing, liquidDensity }
vm.createContext(context)
vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context)

// Exercise the actual main diary sort, including legacy timestamps on the wrong
// calendar day. The comparison must follow the clock displayed for localDate.
let diarySort: ts.VariableDeclaration | undefined
function findDiarySort(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'sortedSection') diarySort = node
  ts.forEachChild(node, findDiarySort)
}
findDiarySort(source)
assert.ok(diarySort?.initializer, 'find the actual native main diary sort')
const diarySortCode = ts.transpileModule(`var checkedDiaryOrder = ${diarySort!.initializer!.getText(source)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText
const originalTimezone = process.env.TZ
context.Date = Date
try {
  for (const timezone of ['Australia/Melbourne', 'UTC', 'America/Los_Angeles']) {
    process.env.TZ = timezone
    for (const localDate of ['2026-10-05', '2026-10-04', '2026-03-08']) {
      const [year, month, day] = localDate.split('-').map(Number)
      const older = new Date(year, month - 1, day, 10, 32, 23, 652)
      older.setDate(older.getDate() + 1)
      const addedOrder = Date.now() + 10000
      const section = [
        { id: 'earlier', localDate, createdAt: older.toISOString(), raw: { __addedOrder: addedOrder } },
        { id: 'latest', localDate, createdAt: new Date(year, month - 1, day, 12, 48, 12, 435).toISOString() },
        { id: 'middle', localDate, createdAt: new Date(year, month - 1, day, 11, 51, 32, 92).toISOString() },
      ]
      const before = JSON.stringify(section)
      context.section = section
      vm.runInContext(diarySortCode, context)
      assert.deepEqual(Array.from(context.checkedDiaryOrder, (entry: any) => entry.id), ['latest', 'middle', 'earlier'], `${timezone}/${localDate}: sort by displayed meal time, not a mismatched stored day or added-order stamp`)
      assert.equal(JSON.stringify(section), before, 'sorting must not rewrite original timestamps or metadata')
      assert.equal(context.foodEntryRecencyMs(section[0]), addedOrder, 'protected Favorites recency must remain unchanged')
      const rawMs = new Date(section[0].createdAt).getTime()
      assert.equal(context.foodEntryDisplayTimestampMs({ ...section[0], localDate: null }), rawMs, 'legacy missing date retains its actual timestamp')
      assert.equal(context.foodEntryDisplayTimestampMs({ ...section[0], localDate: '2026-02-30' }), rawMs, 'invalid date cannot invent a comparison day')
      assert.equal(context.foodEntryDisplayTimestampMs({ localDate, createdAt: 'invalid' }), 0, 'invalid timestamp cannot produce a NaN comparator')
      const edited = { ...section[0], createdAt: new Date(year, month - 1, day, 14, 0).toISOString() }
      assert.ok(context.foodEntryDisplayTimestampMs(edited) > context.foodEntryDisplayTimestampMs(section[1]), 'an explicit edited clock time remains the comparison time')
    }
  }
} finally {
  if (originalTimezone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimezone
}
console.log('PASS: actual native main diary ordering across calendar mismatch, time zones, daylight-saving days and edited times; history and Favorites recency preserved.')

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

// Reproduce the saved-half result through the real result formatters and meal card JSX.
assert.equal(context.formatFavoriteNutrientValue('protein', 12.3, 'kcal'), '12.3g', 'saved protein must agree with ingredient result cards')
assert.equal(context.formatFavoriteNutrientValue('carbs', 22.45, 'kcal'), '22.5g', 'round only displayed grams to one decimal')
assert.equal(context.formatFavoriteNutrientValue('fat', 14.7, 'kcal'), '14.7g')
assert.equal(context.formatFavoriteNutrientValue('fiber', null, 'kcal'), '—')
assert.equal(context.formatFavoriteNutrientValue('sugar', 0, 'kcal'), '0g')
assert.equal(context.formatFavoriteNutrientValue('protein', Number.NaN, 'kcal'), '—', 'nonfinite nutrition is unknown')
assert.equal(context.formatFavoriteNutrientValue('calories', 278.5, 'kcal'), '279')
assert.equal(context.formatFavoriteNutrientValue('calories', 278.5, 'kj'), '1165 kJ')
assert.equal(context.formatMacroAmount(12.3), '12', 'unrelated water/serving quantity display must stay unchanged')

const jsxResults: ts.JsxElement[] = []
function collectMealResults(node: ts.Node) {
  if (ts.isJsxElement(node)) {
    const text = node.getText(source)
    if (text.includes("'Recipe portion totals'") && text.includes('favoriteEditTotals')) jsxResults.push(node)
  }
  ts.forEachChild(node, collectMealResults)
}
collectMealResults(source)
const resultJsx = jsxResults.sort((a, b) => a.getWidth(source) - b.getWidth(source))[0]
assert.ok(resultJsx, 'find actual meal result card container')
const createElement = (type: any, props: any, ...children: any[]) => {
  if (typeof type === 'function') return type({ ...props, children })
  return { type, props, children: children.flat(Infinity).filter((child) => child != null && child !== false) }
}
const rendered: any = { React: { createElement }, useState: () => [640, () => {}], Text: 'Text', View: 'View', Pressable: 'Pressable' }
vm.createContext(rendered)
const cardSource = ts.createSourceFile('cards.tsx', fs.readFileSync('native/src/components/NutrientCards.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const cardCode = cardSource.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => node.getText(cardSource).replace(/^export /, '')).join('\n')
vm.runInContext(ts.transpileModule(cardCode, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText, rendered)
Object.assign(rendered, {
  theme: { colors: { card: '#fff', bg: '#fff', text: '#111' } }, mealRecipe: null, favoriteEditPortionControlEnabled: false,
  recipeServingsEaten: '1', favoriteEditTotals: { calories: 278.5, protein: 12.3, carbs: 22.45, fat: 14.7, fiber: null, sugar: 4.4 },
  setEnergyUnit: () => {}, formatMacroAmount: context.formatMacroAmount,
})
function resultTexts(node: any): string[] {
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  return (node?.children || []).flatMap(resultTexts)
}
const resultCode = ts.transpileModule(`const output = (${resultJsx.getText(source)}); result = output;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText
for (const energyUnit of ['kcal', 'kj']) {
  rendered.energyUnit = energyUnit
  vm.runInContext(resultCode.replace('const output', 'var output'), rendered)
  const texts = resultTexts(rendered.result)
  for (const text of [energyUnit === 'kj' ? '1165 kJ' : '279 kcal', '12.3 g', '22.5 g', '14.7 g', '—', '4.4 g', energyUnit === 'kj' ? 'Kilojoules' : 'Calories', 'Protein', 'Carbs', 'Fat', 'Fibre', 'Sugar']) {
    assert.ok(texts.includes(text), `actual ${energyUnit} meal cards render ${text}`)
  }
}
rendered.favoriteEditTotals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: undefined }
vm.runInContext(resultCode.replace('const output', 'var output'), rendered)
assert.ok(resultTexts(rendered.result).includes('0 kJ'), 'actual zero calorie card remains')
assert.equal(resultTexts(rendered.result).filter((text) => text === '0 g').length, 4, 'all genuine zero gram cards remain')
assert.ok(resultTexts(rendered.result).includes('—'), 'unknown sugar keeps its card')
console.log('PASS: actual saved nutrient formatting and meal result JSX, both energy units, all six cards, missing/zero values and unchanged quantity display.')
