import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { liquidDensity, convertFoodAmount } from '../native/src/lib/foodUnits'
import { optionalNutrient } from '../native/src/lib/nutrientValues'

// Test the actual endpoint mapper without importing server dependencies or credentials.
const source = ts.createSourceFile('route.ts', fs.readFileSync('app/api/food-data/route.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const context = vm.createContext({ liquidDensity, optionalNutrient })
for (const name of ['normalizeForMatch', 'prefersMlServingLabel', 'liquidDensityForName', 'normalizeSingleLiquidServing']) {
  let expression = ''
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) expression = `(${node.initializer.getText(source)})`
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(expression, `actual endpoint ${name} exists`)
  context[name] = vm.runInContext(ts.transpile(expression, { target: ts.ScriptTarget.ES2020 }), context)
}
const normalize = context.normalizeSingleLiquidServing
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} must equal ${expected}`)
const milk = { id: 'fixture-milk', source: 'usda', name: 'Milk, whole', serving_size: '100 g', calories: 61, protein_g: 3.3, carbs_g: 4.8, fat_g: 3.3, fiber_g: null, sugar_g: null, servingOptions: [{ id: 'original', serving_size: '100 g', calories: 61 }] }
const converted = normalize(milk)
assert.equal(converted.serving_size, '100 ml')
close(converted.calories, 62.83)
close(converted.protein_g, 3.399)
close(converted.carbs_g, 4.944)
assert.equal(converted.fiber_g, null)
assert.equal(converted.sugar_g, null)
assert.equal(converted.id, milk.id)
assert.equal(converted.source, milk.source)
assert.equal(converted.servingOptions, milk.servingOptions, 'provider serving options retain their original basis')
assert.equal(milk.serving_size, '100 g', 'original record is not mutated')
assert.equal(normalize(converted), converted, 'normalization is idempotent')
close(converted.calories * convertFoodAmount(100, 'g', 'ml', liquidDensity(milk.name)) / 100, milk.calories)
close(converted.calories * convertFoodAmount(1, 'oz', 'ml', liquidDensity(milk.name)) / 100, milk.calories * 28.349523125 / 100)
for (const unknown of [null, undefined, '', ' ', false, NaN, -1]) {
  const result = normalize({ ...milk, fiber_g: unknown, sugar_g: unknown })
  assert.equal(result.fiber_g, null)
  assert.equal(result.sugar_g, null)
}
assert.equal(normalize({ ...milk, fiber_g: 0, sugar_g: '0' }).fiber_g, 0)
assert.equal(normalize({ ...milk, fiber_g: 0, sugar_g: '0' }).sugar_g, 0)
const oil = normalize({ ...milk, name: 'Olive oil', calories: 884, protein_g: 0, carbs_g: 0, fat_g: 100 })
close(oil.calories, 813.28)
close(oil.calories * 15 / 100, 121.992)
close(oil.calories * convertFoodAmount(100, 'g', 'ml', 0.92) / 100, 884)
assert.equal(oil.protein_g, 0)
const water = normalize({ ...milk, name: 'Water', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
assert.equal(water.serving_size, '100 ml')
assert.equal(water.calories, 0)
assert.equal(water.fiber_g, null)
for (const name of ['Apple juice', 'Black tea', 'Vegetable broth', 'Milk powder', 'Milk chocolate bar', 'Egg, whole, cooked, hard-boiled',
  'Mayonnaise, reduced fat, with olive oil',
  'Apple juice, frozen concentrate, diluted with 3 volume water',
  'Water chestnuts, chinese, raw', 'Egg, scrambled, with milk',
  'Milk, canned, condensed, sweetened', 'Milk, evaporated',
  'Almond milk', 'Milk, coconut', 'Soy milk', 'Milk, dry, whole',
  'Honey roasted peanuts', 'Pancake with maple syrup', 'Oil, cooking spray',
  'Honey, with nuts', 'Milk, mixed with water', 'Syrup, with fruit']) {
  const original = { ...milk, name }
  assert.equal(liquidDensity(name), null, `${name}: ingredient mention is not a known liquid density`)
  assert.equal(normalize(original), original, `${name}: do not guess a density or convert a solid`)
}
for (const [name, density] of [
  ['Oil, olive, salad or cooking', 0.92], ['Extra virgin olive oil', 0.92],
  ['Milk, whole, 3.25% milkfat, without added vitamin A and vitamin D', 1.03],
  ['Skim milk', 1.03], ['Water, tap, drinking', 1], ['Honey', 1.42], ['Maple syrup', 1.33],
] as const) assert.equal(liquidDensity(name), density, `${name}: retain identified liquid conversion`)
for (const serving_size of ['100 ml', '30 g', '1 cup (244 g)', '200 ml']) {
  const original = { ...milk, serving_size }
  assert.equal(normalize(original), original, 'other provider bases stay unchanged')
}
console.log('PASS: actual liquid endpoint uses shared density, preserves original bases, zero and unknown values, precision and reversible weight/volume calculations.')
