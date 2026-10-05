import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import * as nutrients from '../lib/food/nutrient-values'
import { DEFAULT_UNIT_GRAMS } from '../lib/food/measurement-units'

// Execute the actual web barcode mapping and total calculation. No network,
// database, credentials, provider calls, React rendering or saved records.
const file = 'app/food/page.tsx'
const baseline = process.argv.includes('--baseline')
const source = ts.createSourceFile(file, baseline ? execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }) : fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const ctx = vm.createContext({ ...nutrients, DEFAULT_UNIT_GRAMS, foodNumberOrNull: nutrients.optionalNutrient,
  applyBarcodeNameOverride: (name: string) => name,
  effectiveServings: (item: any) => item.servings ?? 1,
  macroMultiplierForItem: () => 1,
})
for (const name of ['DEFAULT_SERVING_GRAMS', 'WEIGHT_UNIT_TO_GRAMS', 'parseServingQuantity', 'isLikelyLiquidFood', 'normalizeServingSizeForLiquid', 'parseServingSizeInfo', 'buildBarcodeIngredientItem', 'recalculateNutritionFromItems']) {
  let expression = ''
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) expression = `(${node.initializer.getText(source)})`
    ts.forEachChild(node, visit)
  }
  visit(source); assert.ok(expression, `Actual ${name} exists`)
  ctx[name] = vm.runInContext(ts.transpile(expression, { target: ts.ScriptTarget.ES2020 }), ctx)
}
const failures: string[] = []
let checked = 0
const check = (label: string, run: () => void) => {
  checked++
  try { run() } catch (error) { failures.push(`${label}: ${(error as Error).message}`) }
}
const sauce = { name: 'TERIYAKI SAUCE', brand: 'HT TRADERS', source: 'helfi', barcode: '072036761163', serving_size: '100 g', quantity_g: 100,
  calories: 88, protein_g: 5.88, carbs_g: 11.76, fat_g: 0, fiber_g: null, sugar_g: 11.76 }
const fields = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g']
for (const field of fields) {
  for (const value of [null, undefined, '', ' ', false, true, -1, NaN, Infinity, 'unknown']) {
    check(`${field} unknown ${String(value)}`, () => {
      const item = ctx.buildBarcodeIngredientItem({ ...sauce, [field]: value })
      assert.equal(item[field], null, 'Missing or invalid nutrition must stay unknown')
    })
  }
  for (const value of [0, '0', 7.35, '7.35', 5000]) {
    check(`${field} usable ${value}`, () => assert.equal(ctx.buildBarcodeIngredientItem({ ...sauce, [field]: value })[field], Number(value)))
  }
}
const original = JSON.stringify(sauce)
for (const factor of [.5, 1, 2]) {
  check(`Actual barcode totals at ${factor}`, () => {
    const item = ctx.buildBarcodeIngredientItem(sauce)
    const totals = ctx.recalculateNutritionFromItems([{ ...item, servings: factor }])
    assert.equal(totals.fiber, null)
    assert.equal(totals.fat, 0)
    assert.equal(totals.sugar, nutrients.roundOptionalNutrient(sauce.sugar_g * factor))
    assert.equal(totals.calories, Math.round(sauce.calories * factor))
    assert.equal(item.id, 'barcode:072036761163')
    assert.equal(item.barcode, sauce.barcode)
    assert.equal(item.barcodeSource, sauce.source)
    assert.equal(item.detectionMethod, 'barcode')
    assert.equal(item.brand, sauce.brand)
    assert.equal(item.serving_size, sauce.serving_size)
    assert.equal(item.protein_g, sauce.protein_g, 'Original precision is retained')
  })
}
check('Mixed barcode fibre stays incomplete', () => {
  const first = ctx.buildBarcodeIngredientItem(sauce)
  const second = ctx.buildBarcodeIngredientItem({ ...sauce, fiber_g: 2 })
  assert.equal(ctx.recalculateNutritionFromItems([first, second]).fiber, null)
})
for (const name of ['Milk, whole', 'Olive oil', 'Apple juice', 'TERIYAKI SAUCE']) {
  for (const unit of ['g', 'ml']) {
    check(`${name} retains original 100${unit} basis`, () => {
      const item = ctx.buildBarcodeIngredientItem({ ...sauce, name, serving_size: `100 ${unit}`, quantity_g: 100 })
      assert.equal(item.serving_size, `100 ${unit}`)
      assert.equal(item.weightUnit, unit)
      assert.equal(item.weightAmount, 100)
      assert.equal(item.customGramsPerServing, unit === 'g' ? 100 : null)
      assert.equal(item.customMlPerServing, unit === 'ml' ? 100 : null)
      assert.equal(item.calories, sauce.calories, 'Relabelling must never silently change the original nutrient basis')
    })
  }
}
check('Quantity without a volume label remains grams', () => {
  const item = ctx.buildBarcodeIngredientItem({ ...sauce, name: 'Milk, whole', serving_size: '1 serving' })
  assert.equal(item.weightUnit, 'g'); assert.equal(item.customGramsPerServing, 100)
  assert.equal(item.customMlPerServing, null)
})
check('Declared volume wins over compatibility quantity_g', () => {
  const item = ctx.buildBarcodeIngredientItem({ ...sauce, name: 'Milk, whole', serving_size: '150 ml', quantity_g: 100 })
  assert.equal(item.weightUnit, 'ml'); assert.equal(item.weightAmount, 150)
})
check('No source mutation', () => assert.equal(JSON.stringify(sauce), original))
assert.deepEqual(failures, [], `${failures.length}/${checked} actual-source barcode mapping cases failed`)
console.log(`PASS: ${checked} actual web barcode mapping/total cases retain unknown versus zero, original precision, identity and declared gram/ml basis without source mutation.`)
