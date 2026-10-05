import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as measurements from '../lib/food/measurement-units'
import * as recorded from '../lib/food/serving-measurements'
import * as nutrients from '../lib/food/nutrient-values'
import { convertFoodAmount, liquidDensity } from '../native/src/lib/foodUnits'

// Execute the real page's measurement/update functions without React, server
// dependencies, credentials, a database or network calls.
const source = ts.createSourceFile('page.tsx', fs.readFileSync('app/food/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const ctx = vm.createContext({ ...measurements, ...recorded, ...nutrients,
  convertFoodAmount, liquidDensity, analysisMode: 'meal', userCountry: '',
  formatMeasurementUnitLabel: measurements.formatUnitLabel,
  estimateGramsPerServing: () => null, foodNumberOrNull: nutrients.optionalNutrient,
  editingEntry: null, clampNumber: (value: any, min: number, max: number) => Math.min(max, Math.max(min, Number(value))),
})
function bind(name: string) {
  let code = ''
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = `(${node.getText(source)})`
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) code = `(${node.initializer.getText(source)})`
    ts.forEachChild(node, visit)
  }
  visit(source); assert.ok(code, `actual ${name} exists`)
  ctx[name] = vm.runInContext(ts.transpile(code, { target: ts.ScriptTarget.ES2020 }), ctx)
}
for (const name of ['DEFAULT_SERVING_GRAMS', 'WEIGHT_UNIT_LABELS', 'WEIGHT_UNIT_TO_GRAMS', 'DISCRETE_UNIT_KEYWORDS', 'escapeRegex', 'parseServingQuantity', 'singularizeUnitLabel', 'isGenericSizeLabel', 'isDiscreteUnitLabel', 'isFractionalServingQuantity', 'stripWeightPhrasesFromLabel', 'replaceWordNumbersForLabel', 'hasExplicitPieceCountInLabel', 'getExplicitPieces', 'getPiecesPerServing', 'parseServingUnitMetadata', 'piecesMultiplierForServing', 'macroMultiplierForItem', 'defaultGramsForItem', 'getDiscreteWeightFloor', 'normalizeWeightUnit', 'roundWeightValue', 'parseServingSizeInfo', 'getPieceGramsForItem', 'getMeasurementItem', 'getItemMeasurementCountry', 'getWeightUnitOptions', 'measurementItemForStorage', 'getUnitGramsForItem', 'weightAmountToGrams', 'gramsToWeightAmount', 'getBaseGramsPerServing', 'getBaseWeightPerServing', 'effectiveServings', 'recalculateNutritionFromItems', 'stripNutritionFromServingSize', 'updateItemField']) bind(name)
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} must equal ${expected}`)
bind('formatNumberInputValue')
if (source.text.includes('const formatWeightAmountLabel')) bind('formatWeightAmountLabel')
const amountCaptions: string[] = []
const findAmountCaptions = (node: ts.Node) => {
  if (ts.isJsxExpression(node) && node.expression && node.expression.getText(source).length < 500 && node.expression.getText(source).includes('const raw = baseWeightPerServing * servingsCount')) amountCaptions.push(node.expression.getText(source))
  ts.forEachChild(node, findAmountCaptions)
}
findAmountCaptions(source); assert.equal(amountCaptions.length, 2)
ctx.baseWeightPerServing = 1; ctx.servingsCount = 1; ctx.weightUnit = 'quarter-cup'; ctx.unit = 'quarter-cup'
for (const expression of amountCaptions) assert.equal(vm.runInContext(ts.transpile(expression, { target: ts.ScriptTarget.ES2020 }), ctx), '0.25 cup', 'actual editor quarter-cup caption must not read as one and a quarter cups')
assert.equal(ctx.formatWeightAmountLabel(1, 'quarter-cup'), '0.25 cup')
assert.equal(ctx.formatWeightAmountLabel(2, 'quarter-cup'), '0.5 cup')
assert.equal(ctx.formatWeightAmountLabel(1, 'half-cup'), '0.5 cup')
assert.equal(ctx.formatWeightAmountLabel(1, 'three-quarter-cup'), '0.75 cup')
assert.equal(ctx.formatWeightAmountLabel(4, 'quarter-cup'), '1 cup')
assert.equal(ctx.formatWeightAmountLabel(20, 'ml'), '20 ml')
const juice = { id: 'original-juice', source: 'usda', name: 'Apple juice, frozen concentrate, diluted with 3 volume water', serving_size: 'cup —239g', calories: 112.33, protein_g: 0.239, carbs_g: 27.605, fat_g: 0.239, fiber_g: 0.239, sugar_g: null, servings: 100 / 239, weightAmount: 100, weightUnit: 'g', portionMode: 'weight' }
assert.ok(!ctx.getWeightUnitOptions(juice, 'g').some((option: any) => option.value === 'ml'), 'unknown-density juice cannot offer volume relabelling')
const milk = { ...juice, name: 'Milk, whole', serving_size: '100 ml', calories: 62.83, protein_g: 3.193, carbs_g: 4.944, fat_g: 3.3475, fiber_g: null, sugar_g: 5.2427, servings: 100 / 103 }
close(ctx.getBaseGramsPerServing(milk), 103)
close(ctx.getBaseWeightPerServing(milk), 103)
close(ctx.effectiveServings(milk) * milk.calories, 61)
const oil = { ...milk, name: 'Oil, olive, salad or cooking', calories: 813.28, protein_g: 0, carbs_g: 0, fat_g: 92, weightAmount: 15, servings: 15 / 92 }
assert.equal(ctx.getWeightUnitOptions(oil, 'g', null, 'AU').find((option: any) => option.value === 'tbsp').label, 'tbsp — 20 ml', 'AU saved editor must offer the Australian tablespoon')
assert.equal(ctx.getWeightUnitOptions(oil, 'g', null, 'AU').find((option: any) => option.value === 'cup').label, 'cup — 250 ml', 'AU saved editor must offer the Australian cup')
close(ctx.effectiveServings(oil) * oil.calories, 132.6)
assert.equal(ctx.recalculateNutritionFromItems([oil]).calories, 133)
const volumeJuice = { ...juice, serving_size: '100 ml', weightUnit: 'ml', weightAmount: 240, servings: 2.4 }
close(ctx.effectiveServings(volumeJuice), 2.4)
assert.ok(!ctx.getWeightUnitOptions(volumeJuice, 'ml').some((option: any) => option.value === 'g'))
assert.equal(ctx.getBaseGramsPerServing(volumeJuice), null)
const unweighed = { ...juice, name: 'Unweighed bar', serving_size: '1 bar', weightUnit: 'serving', weightAmount: 2, servings: 2 }
assert.equal(ctx.getBaseGramsPerServing(unweighed), null, 'do not invent a gram basis from calories')
close(ctx.effectiveServings(unweighed), 2)
assert.equal(ctx.getBaseGramsPerServing({ ...unweighed, name: 'Apple', serving_size: '1 apple' }), null, 'provider count-only foods cannot inherit a guessed produce mass')
assert.equal(ctx.getWeightUnitOptions(juice, 'g').find((option: any) => option.value === 'cup').label, 'cup — 239 g')
close(recorded.convertItemMeasurement(1, 'quarter-cup', 'g', juice)!, 59.75)
assert.equal(recorded.formatItemMeasurementUnit(juice, 'three-quarter-cup'), '3/4 cup — 179.25 g')
close(recorded.convertItemMeasurement(1, 'cup', 'ml', { ...volumeJuice, serving_size: '100 ml (1 cup)' })!, 100)
close(recorded.convertItemMeasurement(1, 'cup', 'ml', { ...volumeJuice, serving_size: '100 ml (1/2 cup)' })!, 200)
close(recorded.convertItemMeasurement(1, 'tbsp', 'g', { ...oil, servingOptions: [{ label: '1 tbsp (13.5 g)', grams: 13.5 }] })!, 13.5)
close(ctx.getBaseWeightPerServing({ ...volumeJuice, serving_size: '8 fl oz', weightUnit: 'fl oz' }), 8)
close(ctx.getBaseWeightPerServing({ ...juice, serving_size: '8 oz', weightUnit: 'oz' }), 8)
close(ctx.getBaseGramsPerServing({ ...juice, serving_size: '6 oz (177 g)' }), 177)

// Reopening a saved measured half-serving must not let the browser select its
// first option (g) beside a number that still means servings. Execute the actual
// three Weight selectors, including their option mapping and selected value.
const weightSelects: ts.JsxElement[] = []
const findWeightSelects = (node: ts.Node) => {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'select' && node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(source).startsWith('getWeightUnitOptions('))) weightSelects.push(node)
  ts.forEachChild(node, findWeightSelects)
}
findWeightSelects(source); assert.equal(weightSelects.length, 3)
ctx.React = { createElement: (tag: any, props: any, ...children: any[]) => ({ tag, props, children: children.flat() }) }
const rice = { ...juice, id: 'recorded-rice', name: 'Rice, white, long-grain, regular, enriched, cooked', serving_size: 'cup — 158g', calories: 205.4, protein_g: 4.2502, carbs_g: 44.5086, fat_g: 0.4424, fiber_g: 0.632, sugar_g: 0.079, servings: 0.5, weightAmount: 0.5, weightUnit: 'serving', portionMode: 'servings', selectedServingId: 'usda:168878:0' }
for (const item of [rice, { ...milk, weightUnit: 'serving', weightAmount: 0.5, servings: 0.5, portionMode: 'servings' }, unweighed]) {
  const original = JSON.stringify(item)
  ctx.item = item; ctx.adjustItem = item; ctx.pieceGrams = null
  ctx.weightUnit = ctx.normalizeWeightUnit(item.weightUnit); ctx.unit = ctx.weightUnit
  for (const select of weightSelects) {
    const rendered = vm.runInContext(ts.transpile(`(${select.getText(source)})`, { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React }), ctx)
    const selected = rendered.children.find((option: any) => option.props.value === rendered.props.value)
    assert.ok(selected, 'actual saved Weight selector must contain its recorded selected serving unit')
    assert.equal(selected.children.join(''), recorded.formatItemMeasurementUnit(item, 'serving'))
  }
  close(ctx.getBaseWeightPerServing(item), 1)
  close(ctx.effectiveServings(item), item.servings)
  assert.equal(JSON.stringify(item), original, 'opening selectors must preserve all recorded fields')
}
assert.equal(ctx.recalculateNutritionFromItems([rice]).calories, 103)
assert.equal(ctx.recalculateNutritionFromItems([{ ...rice, sugar_g: null }]).sugar, null)
assert.equal(ctx.recalculateNutritionFromItems([{ ...rice, sugar_g: 0 }]).sugar, 0)

let notice = ''
ctx.showQuickToast = (text: string) => { notice = text }
ctx.setAnalyzedItems = (items: any[]) => { ctx.analyzedItems = items }
ctx.applyRecalculatedNutrition = () => {}
ctx.analyzedItems = [{ ...rice }]
ctx.updateItemField(0, 'weightUnit', 'g')
close(ctx.analyzedItems[0].weightAmount, 79)
close(ctx.effectiveServings(ctx.analyzedItems[0]), 0.5)
assert.equal(ctx.recalculateNutritionFromItems(ctx.analyzedItems).calories, 103, 'switching recorded half-serving to grams must retain its calories')
assert.equal(ctx.analyzedItems[0].selectedServingId, rice.selectedServingId)
ctx.analyzedItems = [{ ...milk }]
ctx.updateItemField(0, 'weightUnit', 'ml')
close(ctx.analyzedItems[0].weightAmount, 100 / 1.03)
close(ctx.recalculateNutritionFromItems(ctx.analyzedItems).calories, 61)
ctx.updateItemField(0, 'weightUnit', 'g')
close(ctx.analyzedItems[0].weightAmount, 100)
ctx.analyzedItems = [{ ...oil }]
ctx.updateItemField(0, 'weightAmount', '15')
close(ctx.analyzedItems[0].servings, 15 / 92)
assert.equal(ctx.recalculateNutritionFromItems(ctx.analyzedItems).calories, 133)
ctx.analyzedItems = [{ ...juice }]; notice = ''
ctx.updateItemField(0, 'weightUnit', 'ml')
assert.equal(ctx.analyzedItems[0].weightUnit, 'g')
assert.ok(notice, 'unsupported programmatic unit change must be rejected')
assert.equal(ctx.recalculateNutritionFromItems(ctx.analyzedItems).sugar, null)
for (const amount of ['', '0', '-1', 'invalid']) {
  const item = { ...juice, weightAmount: amount === '' ? null : Number(amount) }
  assert.ok(!Number.isFinite(ctx.effectiveServings(item)), 'invalid weight cannot fall back to one serving')
  assert.equal(ctx.recalculateNutritionFromItems([item]), null)
}
// Imported entries often use servings mode while displaying an editable weight.
// The real handler must validate the user's newly entered weight, rather than
// falling back to the previous saved serving count.
for (const amount of ['', '0', '-1', 'invalid']) {
  ctx.analyzedItems = [{ ...juice, portionMode: 'servings' }]
  ctx.updateItemField(0, 'weightAmount', amount)
  assert.ok(!Number.isFinite(ctx.effectiveServings(ctx.analyzedItems[0])), 'a weight edit must not silently retain old imported servings')
}
// Unit and amount edits also choose the physical basis on older imports.
for (const portionMode of ['servings', undefined]) {
  ctx.analyzedItems = [{ ...milk, portionMode }]
  ctx.updateItemField(0, 'weightUnit', 'ml')
  close(ctx.effectiveServings(ctx.analyzedItems[0]) * milk.calories, 61)
  ctx.updateItemField(0, 'weightAmount', '100')
  close(ctx.effectiveServings(ctx.analyzedItems[0]) * milk.calories, 62.83)
  ctx.analyzedItems = [{ ...oil, portionMode }]
  ctx.updateItemField(0, 'weightAmount', '15')
  assert.equal(ctx.recalculateNutritionFromItems(ctx.analyzedItems).calories, 133)
}
// Execute the real card/modal input handlers: typing a draft and tapping
// elsewhere discards it; Enter explicitly commits valid or invalid amounts.
const weightInputs: ts.JsxAttributes[] = []
const findWeightInputs = (node: ts.Node) => {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'input') {
    const attributes = node.attributes.getText(source)
    if (attributes.includes('data-weight-input-id=') || (attributes.includes('value={amountValue}') && attributes.includes('[amountKey]'))) weightInputs.push(node.attributes)
  }
  ts.forEachChild(node, findWeightInputs)
}
findWeightInputs(source); assert.equal(weightInputs.length, 2)
ctx.setNumericInputDrafts = (update: any) => { ctx.numericInputDrafts = update(ctx.numericInputDrafts) }
ctx.index = 0; ctx.editingItemIndex = 0; ctx.amountKey = 'ai:modal:0:weightAmount'
for (const attributes of weightInputs) {
  const handlers: Record<string, any> = {}
  for (const property of attributes.properties) {
    if (ts.isJsxAttribute(property) && ['onFocus', 'onChange', 'onKeyDown', 'onBlur'].includes(property.name.getText(source)) && property.initializer && ts.isJsxExpression(property.initializer) && property.initializer.expression) {
      handlers[property.name.getText(source)] = vm.runInContext(ts.transpile(`(${property.initializer.expression.getText(source)})`, { target: ts.ScriptTarget.ES2020 }), ctx)
    }
  }
  const reset = () => { ctx.numericInputDrafts = {}; ctx.analyzedItems = [{ ...juice, portionMode: 'servings' }] }
  reset(); handlers.onFocus(); handlers.onChange({ target: { value: '25' } }); handlers.onBlur()
  close(ctx.analyzedItems[0].weightAmount, 100)
  for (const value of ['', '0', '-1']) {
    reset(); handlers.onFocus(); handlers.onChange({ target: { value } })
    handlers.onKeyDown({ key: 'Enter', currentTarget: { blur: () => handlers.onBlur() } })
    assert.ok(!Number.isFinite(ctx.effectiveServings(ctx.analyzedItems[0])), 'explicit invalid Enter must be rejected, rather than discarded')
  }
  reset(); handlers.onFocus(); handlers.onChange({ target: { value: '50' } })
  handlers.onKeyDown({ key: 'Enter', currentTarget: { blur: () => handlers.onBlur() } })
  assert.equal(ctx.recalculateNutritionFromItems(ctx.analyzedItems).calories, 24)
}
// Preserve the existing full-set denominator and per-piece macro multiplier.
for (const [name, label, pieces, grams, calories] of [
  ['Beef patty', '1 patty (115 g)', 2, 230, 500],
  ['Carrot', '1 medium (200 g)', 6, 1200, 492],
] as const) {
  const item = { name, serving_size: label, piecesPerServing: pieces, servings: 1, weightAmount: grams, weightUnit: 'g', portionMode: 'weight', calories: calories / pieces, protein_g: 1, carbs_g: 0, fat_g: 0, fiber_g: null, sugar_g: 0 }
  close(ctx.getBaseWeightPerServing(item), grams)
  close(ctx.effectiveServings(item), 1)
  assert.equal(ctx.recalculateNutritionFromItems([item]).calories, calories)
  ctx.analyzedItems = [{ ...item }]
  ctx.updateItemField(0, 'weightAmount', String(grams / 2))
  close(ctx.analyzedItems[0].servings, 0.5)
  assert.equal(ctx.recalculateNutritionFromItems(ctx.analyzedItems).calories, calories / 2)
  ctx.updateItemField(0, 'servings', 1)
  close(ctx.analyzedItems[0].weightAmount, grams)
}
ctx.analyzedItems = [{ name: 'Egg, whole, raw', serving_size: '1 egg (50 g)', customGramsPerServing: 50, weightAmount: 1, weightUnit: 'egg-large', portionMode: 'weight', servings: 1, calories: 77.5, protein_g: 6.28, carbs_g: 0.36, fat_g: 4.755, fiber_g: null, sugar_g: 0 }]
ctx.updateItemField(0, 'weightUnit', 'egg-small')
assert.equal(ctx.analyzedItems[0].fiber_g, null)
assert.equal(ctx.analyzedItems[0].sugar_g, 0)
close(ctx.analyzedItems[0].calories, 58.9)
ctx.updateItemField(0, 'weightUnit', 'egg-large')
close(ctx.analyzedItems[0].calories, 77.5)
ctx.analyzedItems = [{ ...milk }]
ctx.updateItemField(0, 'serving_size', '100 g')
close(ctx.analyzedItems[0].calories, 61)
assert.equal(ctx.analyzedItems[0].fiber_g, null)
close(ctx.analyzedItems[0].servings, 100 / 103)
ctx.updateItemField(0, 'serving_size', '100 ml')
close(ctx.analyzedItems[0].calories, 62.83)
ctx.analyzedItems = [{ ...juice }]; notice = ''
ctx.updateItemField(0, 'serving_size', '100 ml')
assert.equal(ctx.analyzedItems[0].serving_size, juice.serving_size)
assert.ok(notice)
ctx.analyzedItems = [{ ...milk, weightUnit: 'ml', weightAmount: 100, servings: 1 }]
ctx.updateItemField(0, 'weightUnit', 'fl oz')
close(ctx.analyzedItems[0].weightAmount, 100 / 29.5735295625)
ctx.updateItemField(0, 'weightUnit', 'ml')
close(ctx.analyzedItems[0].weightAmount, 100)
assert.equal(ctx.analyzedItems[0].id, milk.id)
assert.equal(ctx.analyzedItems[0].source, milk.source)
// Evaluate every actual dropdown expression, including the details modal.
const dropdowns: string[] = []
const findDropdowns = (node: ts.Node) => {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'getWeightUnitOptions') dropdowns.push(node.getText(source))
  ts.forEachChild(node, findDropdowns)
}
findDropdowns(source); assert.equal(dropdowns.length, 3)
ctx.userCountry = 'AU'; ctx.item = oil; ctx.adjustItem = oil; ctx.weightUnit = 'g'; ctx.unit = 'g'; ctx.pieceGrams = null
for (const expression of dropdowns) {
  const options = vm.runInContext(ts.transpile(expression, { target: ts.ScriptTarget.ES2020 }), ctx)
  assert.equal(options.find((option: any) => option.value === 'tbsp').label, 'tbsp — 20 ml')
  assert.equal(options.find((option: any) => option.value === 'quarter-cup').label, '1/4 cup — 62.5 ml')
}
const originalOil = { ...oil, weightAmount: 20, weightUnit: 'ml', servings: 0.2 }
const sourceSnapshot = JSON.stringify(originalOil)
ctx.analyzedItems = [{ ...originalOil, weightAmount: undefined, weightUnit: 'g', portionMode: undefined }]
ctx.updateItemField(0, 'weightUnit', 'tbsp')
assert.equal(ctx.analyzedItems[0].weightUnit, 'tbsp', 'saved serving-count entries can change units using their known original quantity')
close(ctx.analyzedItems[0].weightAmount, 1)
ctx.analyzedItems = [structuredClone(originalOil)]
ctx.updateItemField(0, 'weightUnit', 'tbsp')
close(ctx.analyzedItems[0].weightAmount, 1)
close(ctx.effectiveServings(ctx.analyzedItems[0]), 0.2)
assert.equal(ctx.recalculateNutritionFromItems(ctx.analyzedItems).calories, 163)
ctx.updateItemField(0, 'weightUnit', 'quarter-cup')
close(ctx.analyzedItems[0].weightAmount, 20 / 62.5)
ctx.updateItemField(0, 'weightAmount', '1')
assert.equal(ctx.recalculateNutritionFromItems(ctx.analyzedItems).calories, 508)
const savedQuarter = ctx.measurementItemForStorage(ctx.analyzedItems[0])
close(savedQuarter.weightAmount, 62.5)
assert.equal(savedQuarter.weightUnit, 'ml')
assert.equal(savedQuarter.__unit, 'ml')
close(savedQuarter.__amount, 62.5)
close(ctx.effectiveServings(savedQuarter), 0.625)
assert.equal(savedQuarter.calories, oil.calories)
assert.equal(savedQuarter.id, oil.id)
assert.equal(savedQuarter.source, oil.source)
assert.equal(savedQuarter.serving_size, oil.serving_size)
assert.equal(savedQuarter.fiber_g, oil.fiber_g)
assert.equal(JSON.stringify(originalOil), sourceSnapshot)
// Old choices retain their original recorded interpretation until changed.
const historicalSpoon = { ...originalOil, weightUnit: 'tbsp', weightAmount: 1, servings: 0.15 }
close(ctx.effectiveServings(historicalSpoon), 0.15)
assert.equal(ctx.measurementItemForStorage(historicalSpoon), historicalSpoon)
assert.equal(ctx.getWeightUnitOptions(historicalSpoon, 'tbsp', null, 'AU').find((option: any) => option.value === 'tbsp').label, 'tbsp — 15 ml')
ctx.analyzedItems = [structuredClone(historicalSpoon)]
ctx.updateItemField(0, 'weightUnit', 'ml')
close(ctx.analyzedItems[0].weightAmount, 15)
ctx.updateItemField(0, 'weightUnit', 'tbsp')
close(ctx.analyzedItems[0].weightAmount, 0.75)
ctx.updateItemField(0, 'weightAmount', '1')
close(ctx.effectiveServings(ctx.analyzedItems[0]), 0.2)
const providerSpoon = { ...originalOil, servingOptions: [{ label: '1 tbsp (13.5 g)', grams: 13.5 }] }
ctx.analyzedItems = [providerSpoon]
ctx.updateItemField(0, 'weightUnit', 'tbsp')
assert.equal(ctx.getWeightUnitOptions(ctx.analyzedItems[0], 'tbsp', null, 'AU').find((option: any) => option.value === 'tbsp').label, 'tbsp — 13.5 g')
ctx.updateItemField(0, 'weightAmount', '1')
const savedProvider = ctx.measurementItemForStorage(ctx.analyzedItems[0])
assert.equal(savedProvider.weightUnit, 'g'); close(savedProvider.weightAmount, 13.5)
assert.deepEqual(savedProvider.servingOptions, providerSpoon.servingOptions)
assert.equal(ctx.getWeightUnitOptions(juice, 'g', null, 'AU').find((option: any) => option.value === 'cup').label, 'cup — 239 g')
// Execute both real save-boundary mappings, not just the storage helper.
let updateMapping = ''; let addMapping = ''
const findSaveMappings = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'baseItems' && node.initializer?.getText(source).includes('analyzedItems.map(measurementItemForStorage)')) updateMapping = node.initializer.getText(source)
  if (ts.isIfStatement(node) && node.getText(source).includes('finalItems = finalItems.map(measurementItemForStorage)') && node.getText(source).length < 180) addMapping = node.getText(source)
  ts.forEachChild(node, findSaveMappings)
}
findSaveMappings(source); assert.ok(updateMapping); assert.ok(addMapping)
ctx.analyzedItems = [{ ...originalOil, weightAmount: 1, weightUnit: 'tbsp', __measurementCountry: 'AU' }]
ctx.editingEntry = { items: [] }
const updateStored = vm.runInContext(ts.transpile(`(${updateMapping})`, { target: ts.ScriptTarget.ES2020 }), ctx)
ctx.finalItems = structuredClone(ctx.analyzedItems)
vm.runInContext(ts.transpile(addMapping, { target: ts.ScriptTarget.ES2020 }), ctx)
for (const storedItems of [updateStored, ctx.finalItems]) {
  assert.equal(storedItems[0].weightUnit, 'ml'); close(storedItems[0].weightAmount, 20)
  assert.equal(storedItems[0].__measurementCountry, undefined)
  close(ctx.effectiveServings(JSON.parse(JSON.stringify(storedItems[0]))), 0.2)
}
ctx.editingEntry = null
ctx.userCountry = 'US'; ctx.analyzedItems = [structuredClone(originalOil)]
ctx.updateItemField(0, 'weightUnit', 'tbsp')
close(ctx.analyzedItems[0].weightAmount, 20 / 15)
ctx.updateItemField(0, 'weightAmount', '1')
close(ctx.measurementItemForStorage(ctx.analyzedItems[0]).weightAmount, 15)
ctx.userCountry = ''
console.log('PASS: actual saved-food page options, recorded basis, density, source quantity, unknown nutrients, precise updates and invalid/unsupported measurements; no credentials or network.')

async function checkSaveGates() {
  bind('updateFoodEntry'); bind('addFoodEntry')
  ctx.editingEntry = { id: 'original-juice' }; ctx.labelBlocked = false
  let calls = 0
  ctx.fetch = () => { calls++; throw new Error('Invalid amount reached persistence') }
  ctx.editingDrinkMetaRef = { get current() { calls++; throw new Error('Invalid amount reached drink metadata') } }
  for (const portionMode of ['weight', 'servings', undefined]) {
    for (const value of [null, '', 0, -1, NaN]) {
      ctx.analyzedItems = [{ ...juice, portionMode }]
      ctx.updateItemField(0, 'weightAmount', value); notice = ''
      await ctx.updateFoodEntry(); assert.ok(notice)
      notice = ''; await ctx.addFoodEntry('Original juice', 'photo'); assert.ok(notice)
    }
  }
  assert.equal(calls, 0)
  console.log('PASS: actual diary add/update boundaries reject invalid quantities before metadata, charging or persistence.')
}
checkSaveGates().catch(error => { console.error(error); process.exitCode = 1 })
