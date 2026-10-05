import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import * as measures from '../lib/food/measurement-units'
import * as nutrients from '../lib/food/nutrient-values'
import { convertFoodAmount, liquidDensity, parseFoodServing, liquidHouseholdMl } from '../native/src/lib/foodUnits'

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
const ctx = vm.createContext({ ...measures, ...nutrients, convertFoodAmount, liquidDensity, parseFoodServing, liquidHouseholdMl, userCountry: '', formatMeasurementUnitLabel: measures.formatUnitLabel, getAdjustPieceDisplayName: () => '' })
const bind = (name: string, optional = false) => { const code = actual(name, optional); if (code) ctx[name] = vm.runInContext(code, ctx) }
for (const name of ['safeNumber', 'round3', 'formatNumber', 'CUSTOM_SINGLE_BRAND_DESCRIPTORS', 'MERGEABLE_SIZE_UNITS', 'ADJUST_UNIT_ORDER', 'hasPositiveUnitGrams', 'mergeFoodUnitGrams', 'computeServingsFromAmount']) bind(name)
for (const name of ['LIQUID_UNIT_ML', 'convertAdjustAmount', 'formatAdjustUnitLabel', 'buildAdjustUnitOptions', 'parseServingQuantity', 'parseServingBase', 'parseServingGrams', 'normalizeLegacyBaseUnit', 'normalizeDrinkUnit', 'parseDrinkOverride']) bind(name, baseline)
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} must equal ${expected}`)
const milk = { source: 'usda', id: 'fixture-original-milk', name: 'Milk, whole,3.25% milkfat,without added vitamin A and vitamin D', serving_size: '100 ml', calories: 62.83, protein_g: 3.193, carbs_g: 4.944, fat_g: 3.3475, fiber_g: null, sugar_g: 5.2427 }
const base = { amount: 100, unit: 'ml' }
// The actual preview/save closure must use the Australian account's measures.
ctx.userCountry = 'AU'
close(ctx.computeServingsFromAmount(1, 'tbsp', base, null, milk.name), 0.2)
close(ctx.computeServingsFromAmount(1, 'cup', base, null, milk.name), 2.5)
assert.equal(ctx.formatAdjustUnitLabel('tbsp', milk.name, null, null, 'AU'), 'tbsp — 20 ml')
assert.equal(ctx.formatAdjustUnitLabel('cup', milk.name, null, null, 'AU'), 'cup — 250 ml')
for (const country of ['AU', ' au ', 'Australia', 'AUS']) {
  close(ctx.convertAdjustAmount(1, 'quarter-cup', 'ml', base, null, milk.name, null, country), 62.5)
  close(ctx.convertAdjustAmount(20, 'ml', 'tbsp', base, null, milk.name, null, country), 1)
}
ctx.userCountry = ''
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
for (const name of ['Mayonnaise, reduced fat, with olive oil', 'Apple juice, frozen concentrate, diluted with 3 volume water']) {
  assert.ok(!ctx.buildAdjustUnitOptions(name, null, null, 'g').includes('ml'), `${name}: no guessed volume option`)
  close(ctx.computeServingsFromAmount(50, 'g', { amount: 100, unit: 'g' }, null, name), 0.5)
  assert.ok(Number.isNaN(ctx.computeServingsFromAmount(100, 'ml', { amount: 100, unit: 'g' }, null, name)), `${name}: unknown weight/volume cannot silently convert`)
}
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
for (const unit of ['tsp', 'tbsp', 'cup']) assert.equal(ctx.normalizeLegacyBaseUnit(2, unit).unit, 'serving', 'bare provider household labels must not inherit the account country volume')

async function main() {
  const unitSelects: ts.JsxAttributes[] = []
  const findUnitSelect = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'select' && node.attributes.getText(source).includes('value={safeUnit}')) unitSelects.push(node.attributes)
    ts.forEachChild(node, findUnitSelect)
  }
  findUnitSelect(source); assert.equal(unitSelects.length, 1)
  const onChange = unitSelects[0].properties.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === 'onChange') as ts.JsxAttribute
  const handler = vm.runInContext(ts.transpile(`(${(onChange.initializer as ts.JsxExpression).expression!.getText(source)})`, { target: ts.ScriptTarget.ES2020 }), ctx)
  Object.assign(ctx, { userCountry: 'AU', safeUnit: 'ml', adjustAmountInput: '100', adjustBase: base, pieceGrams: null, adjustItem: milk, isDiscreteCountUnit: () => false, setAdjustAmountInput: (value: string) => { ctx.adjustAmountInput = value }, setAdjustUnit: (value: string) => { ctx.adjustUnit = value } })
  handler({ target: { value: 'cup' } }); close(Number(ctx.adjustAmountInput), .4)
  assert.equal(ctx.adjustUnit, 'cup'); ctx.userCountry = ''
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
  for (const [country, unit, amount, ml] of [['AU', 'tbsp', 2, 40], ['AU', 'cup', 1, 250], ['AU', 'quarter-cup', 1, 62.5], ['US', 'tbsp', 2, 30], ['US', 'cup', 1, 240]] as const) {
    ctx.userCountry = country; ctx.adjustUnit = unit; ctx.adjustAmountInput = String(amount); await save()
    close(saved.items[0].weightAmount, ml); assert.equal(saved.items[0].weightUnit, 'ml')
    close(saved.items[0].servings, ml / 100); assert.equal(saved.items[0].serving_size, '100 ml')
    assert.equal(saved.items[0].calories, milk.calories); assert.equal(saved.items[0].id, milk.id)
    assert.equal(saved.nutrition.calories, Math.round(milk.calories * ml / 100))
    assert.equal(saved.nutrition.fiber, null)
  }
  ctx.userCountry = ''; ctx.adjustUnit = 'g'; ctx.adjustAmountInput = '100'
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
  for (const serving_size of ['1 cup', '2 tbsp', '1 tsp']) {
    ctx.userCountry = 'AU'; await open({ ...milk, serving_size })
    assert.equal(ctx.adjustBase.unit, 'serving'); assert.equal(ctx.adjustBase.amount, 1)
    assert.equal(ctx.adjustUnit, 'serving'); assert.equal(ctx.adjustAmountInput, '1')
    assert.equal(ctx.adjustItem.serving_size, serving_size)
    ctx.adjustAmountInput = '.5'; await save()
    const providerSaved: any = saved; assert.ok(providerSaved)
    close(providerSaved.items[0].servings, .5); assert.equal(providerSaved.items[0].serving_size, serving_size)
    assert.equal(providerSaved.items[0].weightUnit, 'serving'); assert.equal(providerSaved.nutrition.calories, Math.round(milk.calories / 2))
  }
  ctx.userCountry = ''
  ctx.drinkOverride = ctx.parseDrinkOverride('1', 'fl oz'); await open(milk); assert.equal(ctx.adjustUnit, 'ml'); close(Number(ctx.adjustAmountInput), 29.57)
  error = null; ctx.adjustItem = null; await open({ ...milk, name: 'Apple juice', serving_size: '100 g' }); assert.equal(ctx.adjustItem, null); assert.ok(error)
  // Provider choices must survive the actual override, cache, opening and save.
  // These fixtures never contact a provider or write a real diary entry.
  for (const name of ['is100gServing', 'sameNumber', 'hasSizedCountUnits', 'scoreServingOption', 'pickBestServingOption', 'applyServingOptionToResult', 'hasMeaningfulChange', 'hasServingOptionMacroData', 'normalizeServingOptionsForAdjust', 'pickDefaultServingOptionForAdjust', 'loadServingOverride']) bind(name)
  const rice = { source: 'usda', id: 'fixture-original-cooked-rice', name: 'Rice, white, long-grain, cooked', serving_size: '100 g', calories: 130, protein_g: 2.69, carbs_g: 28.17, fat_g: .28, fiber_g: null, sugar_g: 0 }
  const providerOptions = [
    { ...rice, id: 'rice:100g', label: '100 g', grams: 100 },
    { ...rice, id: 'rice:cup', label: 'cup — 158g', serving_size: 'cup — 158g', grams: 158, calories: 205.4, protein_g: 4.2502, carbs_g: 44.5086, fat_g: .4424 },
  ]
  let optionsResponse: any[] = providerOptions
  let lookupCount = 0
  Object.assign(ctx, { drinkOverride: null, servingCacheRef: { current: new Map() }, servingPendingRef: { current: new Set() }, URLSearchParams,
    loadDynamicSizeLookup: async () => null,
    fetch: async (url: string) => { assert.ok(url.startsWith('/api/food-data/servings?')); lookupCount++; return { ok: true, json: async () => ({ options: optionsResponse }) } },
  })
  const adjusted = (): any => {
    const result: any = ctx.adjustItem
    assert.ok(result, 'Actual web adjustment opened')
    return result
  }
  const savedResult = (): any => {
    const result: any = saved
    assert.ok(result, 'Actual save produced a payload')
    return result
  }
  const beforeRice = JSON.stringify(rice)
  await open(rice)
  assert.equal(adjusted().servingOptions?.length, 2, 'Fetched original choices must reach the actual web adjustment')
  assert.equal(adjusted().selectedServingId, 'rice:cup', 'Selected id must match original provider nutrient basis')
  assert.equal(adjusted().serving_size, 'cup — 158g')
  assert.equal(adjusted().calories, 205.4)
  ctx.adjustAmountInput = '.5'; ctx.adjustUnit = 'serving'; await save()
  assert.equal(savedResult().items[0].servingOptions.length, 2)
  assert.equal(savedResult().items[0].selectedServingId, 'rice:cup')
  assert.equal(savedResult().items[0].serving_size, 'cup — 158g')
  assert.equal(savedResult().items[0].calories, 205.4)
  assert.equal(savedResult().items[0].servings, .5)
  assert.equal(savedResult().nutrition.calories, 103)
  assert.equal(savedResult().nutrition.fiber, null); assert.equal(savedResult().nutrition.sugar, 0)
  await open(rice)
  ctx.adjustAmountInput = '.5'; ctx.adjustUnit = 'serving'
  let servingChange: ts.JsxAttribute | undefined
  const findServingChange = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'select' && node.attributes.getText(source).includes('value={adjustServingId')) {
      servingChange = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === 'onChange') as ts.JsxAttribute
    }
    ts.forEachChild(node, findServingChange)
  }
  findServingChange(source); assert.ok(servingChange, 'Actual supplier-choice dropdown exists')
  ctx.servingOptions = adjusted().servingOptions
  ctx.setAdjustItem = (value: any) => { ctx.adjustItem = typeof value === 'function' ? value(ctx.adjustItem) : value }
  ctx.setAdjustServingId = (value: string) => { ctx.adjustServingId = value }
  ctx.setAdjustPieceGrams = (value: number | null) => { ctx.adjustPieceGrams = value }
  const choose = vm.runInContext(ts.transpile(`(${(servingChange.initializer as ts.JsxExpression).expression!.getText(source)})`, { target: ts.ScriptTarget.ES2020 }), ctx)
  choose({ target: { value: 'rice:100g' } })
  await save()
  assert.equal(savedResult().items[0].selectedServingId, 'rice:100g')
  assert.equal(savedResult().items[0].serving_size, '100 g')
  assert.equal(savedResult().items[0].servingOptions.length, 2)
  assert.equal(savedResult().items[0].servings, .5)
  assert.equal(savedResult().nutrition.calories, 65, 'Actual choice change preserves half-serving count at original100g basis')
  await open(rice)
  assert.equal(lookupCount, 1, 'Cached original choices avoid a repeated provider lookup')
  assert.equal(adjusted().servingOptions.length, 2)
  assert.equal(adjusted().selectedServingId, 'rice:cup')
  assert.equal(JSON.stringify(rice), beforeRice, 'Opening cannot rewrite the original source')

  // Even one unchanged100g choice carries provider identity and must not vanish.
  ctx.servingCacheRef.current.clear(); optionsResponse = [providerOptions[0]]
  await open(rice)
  assert.equal(adjusted().servingOptions.length, 1)
  assert.equal(adjusted().selectedServingId, 'rice:100g')
  assert.equal(adjusted().calories, rice.calories)
  await open(rice); assert.equal(lookupCount, 2)
  assert.equal(adjusted().selectedServingId, 'rice:100g')

  // An explicitly selected supplier option wins over the generic medium default.
  const selectedOptions = [
    { ...rice, id: 'medium', label: 'Medium serving — 100g', grams: 100 },
    { ...rice, id: 'large', label: 'Large serving — 200g', serving_size: '200 g', grams: 200, calories: 260, protein_g: 5.38, carbs_g: 56.34, fat_g: .56 },
  ]
  const selected = { ...rice, source: 'custom', servingOptions: selectedOptions, selectedServingId: 'large' }
  await open(selected)
  assert.equal(adjusted().selectedServingId, 'large')
  assert.equal(adjusted().calories, 260)
  ctx.adjustAmountInput = '1.5'; ctx.adjustUnit = 'serving'; await save()
  assert.equal(savedResult().items[0].selectedServingId, 'large')
  assert.equal(savedResult().items[0].servingOptions.length, 2)
  assert.equal(savedResult().items[0].id, rice.id)
  assert.equal(savedResult().items[0].source, 'custom')
  assert.equal(savedResult().nutrition.calories, 390)
  ctx.servingCacheRef.current.clear()
  optionsResponse = [{ ...providerOptions[1], calories: null }]
  await open(rice)
  assert.equal(adjusted().servingOptions, null, 'Incomplete provider choices cannot replace valid original nutrition')
  assert.equal(adjusted().selectedServingId, null)
  assert.equal(adjusted().calories, 130)
  ctx.adjustAmountInput = '50'; ctx.adjustUnit = 'g'; await save()
  assert.equal(savedResult().nutrition.calories, 65)
  assert.equal(savedResult().items[0].id, rice.id)
  assert.equal(savedResult().items[0].serving_size, '100 g')
  console.log('PASS: actual web adjustment/default/save and provider override/cache retain original choices, selected basis, density, regional measures, precise source, null/zero and invalid-amount blocking; no network or credentials.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
