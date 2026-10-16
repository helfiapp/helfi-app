#!/usr/bin/env node
'use strict'
// Pure actual-source recipe persistence checks. No app/server/provider imports.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
function load(relative) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, URL, require() { throw Error('External imports forbidden') } }, { filename: relative })
  return module.exports
}
const { applyNativeVoiceRecipeMetadata: apply, validateNativeVoiceImportedRecipe: validate } = load('lib/native-voice-recipe-metadata.ts')
const { materializeMealPortion, savedMealPortion } = load('native/src/lib/mealPortions.ts')
const copy = (value) => JSON.parse(JSON.stringify(value))
const recipe = { title: 'Chicken and rice', servings: 4, prepMinutes: 10, cookMinutes: 20, ingredients: ['200 g chicken', '200 g rice'], steps: ['Cook the rice.', 'Cook the chicken and combine.'], sourceUrl: null }
const items = [
  { id: 'chicken', name: 'Chicken', serving_size: '200 g', servings: 1, amount: 200, nutritionCoversServing: true, __voiceSourceFood: { id: 'source-chicken', name: 'Chicken' }, calories: 400, protein_g: 40, carbs_g: 0, fat_g: 4, fiber_g: null, sugar_g: 0 },
  { id: 'rice', name: 'Rice', serving_size: '200 g', servings: 1, amount: 200, nutritionCoversServing: true, __voiceSourceFood: { id: 'source-rice', name: 'Rice' }, calories: 260, protein_g: 6, carbs_g: 50, fat_g: 1, fiber_g: 0, sugar_g: 0 },
]
const food = { meal: 'dinner', mealName: recipe.title, items, nutrition: { calories: 660, protein: 46, carbs: 50, fat: 5, fiber: null, sugar: 0, __voiceBuiltMeal: true } }
let count = 0
function check(name, run) { run(); count++; console.log(`PASS ${name}`) }
check('whole recipe persists exact native recipe schema without changing source foods', () => {
  const before = JSON.stringify(food)
  const result = apply(food, recipe)
  assert.equal(JSON.stringify(food), before)
  assert.equal(result.nutrition.calories, 660); assert.equal(result.nutrition.__portionScale, 1)
  assert.equal(result.nutrition.__portionControlEnabled, false); assert.equal(result.nutrition.__portionAmount, 4)
  assert.equal(JSON.stringify(result.nutrition.__importRecipe), JSON.stringify(recipe))
  assert.equal(JSON.stringify(result.items), JSON.stringify(items))
})
check('one of four servings stores eaten totals with whole ingredient basis and restores once', () => {
  const result = apply(food, recipe, { servingsEaten: 1 })
  assert.equal(result.nutrition.calories, 165); assert.equal(result.nutrition.protein_g, 11.5)
  assert.equal(result.nutrition.fiber_g, null); assert.equal(result.nutrition.fiber, null); assert.equal(result.nutrition.sugar, 0)
  assert.equal(result.nutrition.__portionScale, 0.25); assert.equal(result.nutrition.__portionRecipeServings, 4)
  assert.equal(result.nutrition.__nativeRecipeServingsEaten, 1); assert.equal(result.items[0].amount, 200)
  const restored = materializeMealPortion(result)
  assert.equal(restored.items[0].amount, 50); assert.equal(restored.items[0].servings, 0.25)
  assert.equal(savedMealPortion(restored).__portionScale, 1)
  assert.equal(materializeMealPortion(restored).items[0].amount, 50)
})
check('more than one whole recipe and explicit portion-control choice retain meaning', () => {
  const result = apply(food, recipe, { servingsEaten: 6, portionControlEnabled: true })
  assert.equal(result.nutrition.calories, 990); assert.equal(result.nutrition.__portionScale, 1.5)
  assert.equal(result.nutrition.__portionControlEnabled, true)
  assert.throws(() => apply(food, recipe, { servingsEaten: 1, portionControlEnabled: false }), /portion control/)
})
check('invalid recipe yield, portions, steps and source URL cannot produce save metadata', () => {
  for (const servings of [0, -1, null, '4', NaN]) assert.throws(() => validate({ ...recipe, servings }))
  for (const servingsEaten of [0, -1, NaN, '1']) assert.throws(() => apply(food, recipe, { servingsEaten }))
  for (const change of [{ steps: [] }, { ingredients: [] }, { title: '' }, { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:secret@example.invalid' }]) assert.throws(() => validate({ ...recipe, ...change }))
})
check('unresolved or omitted ingredient, stale totals and already-scaled basis require review', () => {
  const unknown = copy(food); delete unknown.items[0].__voiceSourceFood
  assert.throws(() => apply(unknown, recipe), /food source/)
  assert.throws(() => apply({ ...food, items: items.slice(1) }, recipe), /every recipe ingredient/)
  assert.throws(() => apply({ ...food, nutrition: { ...food.nutrition, calories: 999 } }, recipe), /totals/)
  assert.throws(() => apply({ ...food, nutrition: { ...food.nutrition, fiber: 0 } }, recipe), /totals/)
  assert.throws(() => apply({ ...food, nutrition: { ...food.nutrition, __portionScale: 0.25 } }, recipe), /complete recipe ingredients/)
})
console.log(`Voice recipe metadata: ${count} actual-source offline groups passed; no recipe generation, API calls or saves.`)
