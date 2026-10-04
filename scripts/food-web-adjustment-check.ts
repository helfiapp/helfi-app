import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import * as measures from '../lib/food/measurement-units'
import * as nutrients from '../lib/food/nutrient-values'
import { convertFoodAmount, liquidDensity, parseFoodServing } from '../native/src/lib/foodUnits'

// Actual web calculation/default/save functions, with no React, credentials or network.
const file = 'app/food/add-ingredient/AddIngredientClient.tsx'
const baseline = process.argv.includes('--baseline')
const source = ts.createSourceFile(file, baseline ? execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' }) : fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function actual(name: string, optional = false) {
  let text = ''
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) text = `(${node.initializer.getText(source)})`
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!text && optional) return null
  assert.ok(text, `Actual ${name} exists`)
  return ts.transpile(text, { target: ts.ScriptTarget.ES2020 })
}
const ctx = vm.createContext({ ...measures, ...nutrients, convertFoodAmount, liquidDensity, parseFoodServing, formatMeasurementUnitLabel: measures.formatUnitLabel, getAdjustPieceDisplayName: () => '' })
const bind = (name: string, optional = false) => { const code = actual(name, optional); if (code) ctx[name] = vm.runInContext(code, ctx) }
for (const name of ['safeNumber', 'round3', 'formatNumber', 'CUSTOM_SINGLE_BRAND_DESCRIPTORS', 'MERGEABLE_SIZE_UNITS', 'ADJUST_UNIT_ORDER', 'hasPositiveUnitGrams', 'mergeFoodUnitGrams', 'computeServingsFromAmount']) bind(name)
for (const name of ['LIQUID_UNIT_ML', 'convertAdjustAmount', 'formatAdjustUnitLabel', 'buildAdjustUnitOptions', 'parseServingQuantity', 'parseServingBase', 'parseServingGrams', 'normalizeLegacyBaseUnit', 'normalizeDrinkUnit', 'parseDrinkOverride']) bind(name, baseline)
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} must equal ${expected}`)
const milk = { source: 'usda', id: 'fixture-original-milk', name: 'Milk, whole,3.25% milkfat,without added vitamin A and vitamin D', serving_size: '100 ml', calories: 62.83, protein_g: 3.193, carbs_g: 4.944, fat_g: 3.3475, fiber_g: null, sugar_g: 5.2427 }
const base = { amount: 100, unit: 'ml' }
const ratio = ctx.computeServingsFromAmount(100, 'g', base, null, milk.name)
close(milk.calories * ratio, 61)
close(ctx.computeServingsFromAmount(1, 'oz', base, null, milk.name) * milk.calories, 61 * 28.349523125 / 100)
for (const value of [0, -1, NaN]) assert.ok(Number.isNaN(ctx.computeServingsFromAmount(value, 'ml', base, null, milk.name)))
assert.ok(Number.isNaN(ctx.computeServingsFromAmount(100, 'ml', { amount: 100, unit: 'g' }, null, 'Apple juice')))
close(ctx.computeServingsFromAmount(1, 'cup', base, null, 'Apple juice'), 2.4)
close(ctx.computeServingsFromAmount(1, 'tbsp', base, null, milk.name), 0.15)
close(ctx.computeServingsFromAmount(15, 'ml', base, null, 'Olive oil') * 813.28, 121.992)
close(ctx.computeServingsFromAmount(15, 'g', base, null, 'Olive oil') * 813.28, 132.6)
close(ctx.computeServingsFromAmount(0.5, 'serving', base, null, milk.name), 0.5)
close(ctx.convertAdjustAmount(100, 'g', 'serving', base, null, milk.name), 100 / 103)
close(ctx.convertAdjustAmount(1, 'serving', 'g', base, null, milk.name), 103)
assert.deepEqual(Array.from(ctx.buildAdjustUnitOptions('Apple juice', null, null, 'g')), ['g', 'oz'])
assert.ok(!ctx.buildAdjustUnitOptions('Apple juice', null, null, 'ml').includes('g'))
assert.ok(ctx.buildAdjustUnitOptions(milk.name, null, null, 'ml').includes('g'))
assert.equal(ctx.formatAdjustUnitLabel('tbsp', milk.name), 'tbsp — 15 ml')
assert.equal(ctx.formatAdjustUnitLabel('cup', milk.name), 'cup — 240 ml')
close(ctx.computeServingsFromAmount(2, 'egg-large', { amount: 100, unit: 'g' }, null, 'Egg, whole, raw'), 1)
close(ctx.parseServingBase('1 fl oz').amount, 29.5735295625)
assert.equal(ctx.parseServingBase('1 fl oz').unit, 'ml')
close(ctx.parseServingBase('1 oz (28 g)').amount, 28)
close(ctx.parseServingBase('0.5 L').amount, 500)
assert.deepEqual(Array.from(ctx.buildAdjustUnitOptions('Unweighed bar', null, null, 'serving')), ['serving'])
assert.equal(ctx.normalizeLegacyBaseUnit(1, 'serving').unit, 'serving', 'no invented100g serving')
assert.equal(ctx.normalizeLegacyBaseUnit(2, 'serving').amount, 1, 'one provider portion keeps its whole stated serving label')

async function main() {
  let saved: any = null, error: string | null = null
  Object.assign(ctx, { adjustItem: milk, adjustSaving: false, adjustBase: base, adjustPieceGrams: null, adjustAmountInput: '100', adjustUnit: 'g', drinkMeta: null, selectedDate: '2026-10-05', category: 'snacks', setAdjustSaving: () => {}, setError: (value: string) => { error = value }, alignTimestampToLocalDate: (iso: string) => iso, addFoodEntry: async (payload: any) => { saved = JSON.parse(JSON.stringify(payload)); return { id: 'fixture-saved' } }, sessionStorage: { setItem: () => {} }, setAdjustItem: () => {}, returnToDiaryAfterSave: () => {} })
  const save = vm.runInContext(actual('confirmAdjustAdd')!, ctx)
  await save()
  assert.equal(saved.nutrition.calories, 61)
  assert.equal(saved.nutrition.fiber, null)
  close(saved.items[0].servings, 100 / 103)
  assert.equal(saved.items[0].id, milk.id)
  assert.equal(saved.items[0].weightAmount, 100)
  assert.equal(saved.items[0].weightUnit, 'g')
  for (const unknown of [null, undefined, '', false]) {
    ctx.adjustItem = { ...milk, sugar_g: unknown }; await save(); assert.equal(saved.nutrition.sugar, null)
  }
  ctx.adjustItem = { ...milk, fiber_g: 0, sugar_g: 0 }; await save(); assert.equal(saved.nutrition.fiber, 0); assert.equal(saved.nutrition.sugar, 0)
  ctx.adjustItem = { ...milk, name: 'Water', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }; ctx.adjustUnit = 'ml'; await save(); assert.equal(saved.nutrition.calories, 0)
  for (const invalid of ['', '0', '-1', 'invalid']) {
    saved = null; error = null; ctx.adjustAmountInput = invalid; await save(); assert.equal(saved, null); assert.ok(error)
  }
  saved = null; ctx.adjustAmountInput = '100'; ctx.adjustItem = { ...milk, name: 'Apple juice' }; ctx.adjustBase = { amount: 100, unit: 'g' }; ctx.adjustUnit = 'ml'; await save(); assert.equal(saved, null)
  saved = null; ctx.adjustBase = null; ctx.adjustUnit = 'g'; await save(); assert.equal(saved, null, 'missing basis cannot silently become100g')

  // Exercise actual initial selection, including drink-log fluid ounces and unknown density.
  Object.assign(ctx, { addingId: null, setAddingId: () => {}, triggerHaptic: () => {}, loadServingOverride: async () => null, normalizeServingOptionsForAdjust: () => [], pickDefaultServingOptionForAdjust: () => null, loadDynamicSizeLookup: async () => null, hasMacroData: () => true, extractPieceGramsFromLabel: () => null, setAdjustBase: (value: any) => { ctx.adjustBase = value }, setAdjustPieceGrams: () => {}, setAdjustUnit: (value: string) => { ctx.adjustUnit = value }, setAdjustAmountInput: (value: string) => { ctx.adjustAmountInput = value }, setAdjustServingId: () => {}, setAdjustItem: (value: any) => { ctx.adjustItem = value } })
  const open = vm.runInContext(actual('openAdjustModalForItem')!, ctx)
  ctx.drinkOverride = null; await open({ ...milk, name: 'Apple juice', serving_size: '100 g' }); assert.equal(ctx.adjustUnit, 'g'); assert.equal(ctx.adjustAmountInput, '100')
  await open({ ...milk, name: 'Unweighed bar', serving_size: '1 bar' }); assert.equal(ctx.adjustBase.unit, 'serving'); assert.equal(ctx.adjustBase.amount, 1); assert.equal(ctx.adjustUnit, 'serving')
  ctx.drinkOverride = ctx.parseDrinkOverride('1', 'fl oz'); await open(milk); assert.equal(ctx.adjustUnit, 'ml'); close(Number(ctx.adjustAmountInput), 29.57)
  error = null; ctx.adjustItem = null; await open({ ...milk, name: 'Apple juice', serving_size: '100 g' }); assert.equal(ctx.adjustItem, null); assert.ok(error)
  console.log('PASS: actual web adjustment/default/save preserves milk/oil density, liquid household volumes, source identity, precise servings, null/zero and invalid-amount blocking; no network or credentials.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
