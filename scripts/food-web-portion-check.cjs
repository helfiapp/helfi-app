const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Execute the current food helpers and numeric save expressions only; no network or account modules.
function run(readSource = file => fs.readFileSync(path.join(process.cwd(), file), 'utf8')) {
const allowed = new Set(['app/food/page.tsx','native/src/screens/TrackCaloriesScreen.tsx','native/src/lib/foodDiaryEntries.ts','native/src/lib/mealPortions.ts','native/src/lib/mealPortionEditor.ts','native/src/lib/nutrientValues.ts','native/src/lib/foodUnits.ts','lib/food/serving-measurements.ts','lib/food/measurement-units.ts','lib/food/produce-measurements.ts','lib/food/dry-food-measurements.ts','lib/food/dairy-semi-solid-measurements.ts'])
const cache = new Map()
function read(file) {
  assert.ok(allowed.has(file), `Unexpected non-food source: ${file}`)
  if (!cache.has(file)) cache.set(file, readSource(file))
  return cache.get(file)
}
const file = 'app/food/page.tsx', source = read(file)
function declarations(text, names) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  assert.equal(ast.parseDiagnostics.length, 0)
  const found = new Map()
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast)) && !found.has(node.name.getText(ast))) found.set(node.name.getText(ast), 'const ' + node.getText(ast) + ';')
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) found.set(node.name.text, node.getText(ast))
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return { ast, found }
}
function loadNative(file, imports = {}) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    module, exports: module.exports, require(name) { assert.ok(name in imports, name); return imports[name] },
  })
  return module.exports
}
const nutrients = loadNative('native/src/lib/nutrientValues.ts')
const portions = loadNative('native/src/lib/mealPortions.ts')
const portionEditor = loadNative('native/src/lib/mealPortionEditor.ts')
const units = loadNative('native/src/lib/foodUnits.ts')
const measurements = loadNative('lib/food/measurement-units.ts', {
  './produce-measurements': loadNative('lib/food/produce-measurements.ts'),
  './dry-food-measurements': loadNative('lib/food/dry-food-measurements.ts'),
  './dairy-semi-solid-measurements': loadNative('lib/food/dairy-semi-solid-measurements.ts'),
})
const servingMeasures = loadNative('lib/food/serving-measurements.ts', { '../../native/src/lib/foodUnits': units, './measurement-units': measurements })
const native = loadNative('native/src/lib/foodDiaryEntries.ts', { './nutrientValues': nutrients, './mealPortions': portions })
function web(text) {
  const names = ['DEFAULT_SERVING_GRAMS','WEIGHT_UNIT_TO_GRAMS','normalizeWeightUnit','parseServingQuantity','singularizeUnitLabel','parseServingUnitMetadata','DISCRETE_UNIT_KEYWORDS','isDiscreteUnitLabel','piecesMultiplierForServing','macroMultiplierForItem','effectiveServings','recalculateNutritionFromItems','getEntryPortionScale','applyPortionScaleToTotals','getEntryTotals','sanitizeNutritionTotals','extractTotalsFromDescription','hasNonZeroTotals','convertTotalsForStorage','mergedNutrition','mergedTotal','preserveSavedEntryPortion']
  const { found } = declarations(text, names)
  for (const name of names) assert.ok(found.has(name), name)
  const context = vm.createContext({ ...nutrients, ...measurements, ...servingMeasures, foodNumberOrNull: nutrients.optionalNutrient,
    // The weight-input fixture has an exact recorded100g basis; no inferred weight.
    getBaseWeightPerServing: item => servingMeasures.convertItemMeasurement(1, 'serving', item.weightUnit, item),
    // Ordinary carrot boundary: no legacy drink or kJ repair, no network/save.
    normalizeSuspiciousKjItems: items => ({ items, changed: false }),
    applySugarFreeHotChocolateGuard: () => ({ changed: false }),
    stripSweetenerMetaFromTotals: totals => totals && ({ ...totals }),
    removeSweetenerFromTotals: totals => totals && ({ ...totals }),
    applyDrinkMetaToTotals: totals => totals && ({ ...totals }),
    applySweetenerMetaToTotals: totals => totals && ({ ...totals }),
    baseSweetenerMeta: null, drinkMeta: null, resolvedSweetenerMeta: null, meta: {},
  })
  const constructorNames = ['mergedNutrition','mergedTotal']
  vm.runInContext(ts.transpileModule(names.filter(name => !constructorNames.includes(name)).map(name => found.get(name)).join('\n') + '\nthis.api={' + names.filter(name => !constructorNames.includes(name)).join(',') + '}', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { ...context.api, context, merge(entry, fresh) {
    Object.assign(context, { editingEntry: entry, analyzedNutrition: fresh, analyzedTotal: fresh })
    return vm.runInContext(ts.transpileModule('(() => {\n' + constructorNames.map(name => found.get(name)).join('\n') + '\nreturn { nutrition: mergedNutrition, total: mergedTotal }\n})()', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  }, names, found }
}
const current = web(source)
const carrot = { id: 'source-carrot-regression', name: 'Carrots, raw', source: 'usda', serving_size: '100 g', servings: 5.4, customGramsPerServing: 100, weightAmount: 540, weightUnit: 'g', calories: 41, protein_g: 0.93, carbs_g: 9.58, fat_g: 0.24, fiber_g: 2.8, sugar_g: 4.74 }
const entry = scale => ({ name: 'Carrots, raw', items: [{ ...carrot }], nutrition: { __portionScale: scale, __portionAmount: scale, __portionUnit: 'serving', __portionControlEnabled: true, __portionTotalWeightG: 540, __portionRecipeServings: 1 } })
const six = value => Object.fromEntries(['calories','protein','carbs','fat','fiber','sugar'].map(key => [key, value[key]]))
const nativeTotals = scale => native.normalizeFoodApiEntry(entry(scale)).nutrients
function dailySummary(api, text, scale) {
  const declaration = declarations(text, ['scaledRecalculated']).found.get('scaledRecalculated')
  assert.ok(declaration)
  Object.assign(api.context, { derivedItems: entry(scale).items, portionScale: scale, recalculated: api.recalculateNutritionFromItems(entry(scale).items) })
  return vm.runInContext(ts.transpileModule('(() => { ' + declaration + '; return scaledRecalculated })()', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, api.context)
}
const groups = []
for (const scale of [.5, 1, 2]) assert.deepEqual(six(current.getEntryTotals(entry(scale))), six(nativeTotals(scale)))
for (const scale of [.5, 1, 2]) assert.deepEqual(six(dailySummary(current, source, scale)), six(nativeTotals(scale)))
assert.equal(current.getEntryTotals(entry(.5)).fat, .6)
assert.equal(current.getEntryTotals(entry(2)).calories, 443)
assert.equal(current.getEntryTotals(entry(2)).carbs, 103.5)
groups.push('Source portion is applied before rounding: half fat0.6, double443kcal/103.5g carbs, all six values match native')
const freshWhole = current.recalculateNutritionFromItems([carrot])
for (const scale of [.5, 2]) {
  const old = entry(scale), snapshot = JSON.stringify(old), update = current.merge(old, freshWhole)
  for (const key of Object.keys(old.nutrition)) {
    assert.deepEqual(update.nutrition[key], old.nutrition[key]); assert.deepEqual(update.total[key], old.nutrition[key])
  }
  assert.deepEqual(six(current.getEntryTotals({ ...old, ...update })), six(nativeTotals(scale)))
  assert.equal(JSON.stringify(old), snapshot)
}
const explicit = { ...freshWhole, __portionScale: 1, __portionAmount: 1, __portionUnit: 'serving', __portionControlEnabled: false }
const changed = current.merge(entry(.5), explicit)
assert.equal(changed.nutrition.__portionScale, 1)
assert.equal(changed.nutrition.__portionControlEnabled, false)
assert.equal(changed.nutrition.__portionTotalWeightG, undefined)
groups.push('Both actual ordinary save nutrition expressions retain all six saved fields and respect an explicit new portion without mutating the original')
function numericEdits(text, api, original = entry(.5), changedItems = null) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), initializers = [], converted = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'updatedNutrition' && node.initializer?.getText(ast).includes('recalculateNutritionFromItems')) initializers.push(node.getText(ast))
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'total' && node.initializer.getText(ast).includes('convertTotalsForStorage(updatedNutrition)')) converted.push(node.initializer.getText(ast))
    ts.forEachChild(node, visit)
  }
  visit(ast); assert.equal(initializers.length, 8); assert.equal(converted.length, 8)
  const items = changedItems || [{ ...carrot, servings: 6, weightAmount: 600 }]
  Object.assign(api.context, { editingEntry: original, next: items, itemsCopy: items, updated: items })
  const states = initializers.map((declaration, index) => {
    const fresh = vm.runInContext(ts.transpileModule('(() => { const ' + declaration + '; return updatedNutrition })()', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, api.context)
    api.context.updatedNutrition = fresh
    const total = vm.runInContext(converted[index], api.context)
    return { ...original, items, nutrition: fresh, total }
  })
  return { items, states }
}

const edits = numericEdits(source, current)
for (const state of edits.states) {
  assert.equal(state.nutrition.__portionScale, .5); assert.equal(state.total.__portionScale, .5)
  assert.equal(state.nutrition.__portionTotalWeightG, 600)
  const update = current.merge(state, current.recalculateNutritionFromItems(edits.items))
  const reopened = { ...state, ...update }
  assert.equal(current.getEntryTotals(reopened).calories, 123)
  assert.deepEqual(six(current.getEntryTotals(reopened)), six(native.normalizeFoodApiEntry(reopened).nutrients))
}
groups.push('All eight numeric amount-edit initializer pairs retain half through540→600g, existing save expressions and normal read normalization')
const nativeScreen = read('native/src/screens/TrackCaloriesScreen.tsx')
const restoreStart = nativeScreen.indexOf('    const portion = savedMealPortion(item.favorite?.raw || item.entry?.raw)')
const restoreEndLine = "    setFavoriteEditPortionChoice(scale === 1 ? 'whole' : scale === 0.5 && portionUnit === 'serving' ? 'half' : 'custom')"
assert.ok(restoreStart >= 0)
const restoreEnd = nativeScreen.indexOf(restoreEndLine, restoreStart) + restoreEndLine.length
const restoreStatements = nativeScreen.slice(restoreStart, restoreEnd)
function nativeRestore(row) {
  const restored = {}
  const context = { ...portions, nullableNumber: native.nullableNumber, item: { entry: { raw: row } }, legacyConsumedRecipe: false, eaten: 1, recipeYield: 1 }
  for (const name of ['RecipeServings','SavedScale','PortionControlEnabled','PortionAmount','PortionUnit','PortionChoice']) context['setFavoriteEdit' + name] = value => { restored[name] = value }
  vm.runInNewContext(ts.transpileModule(restoreStatements, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return restored
}
for (const unit of ['g', 'oz']) {
  const original = entry(.5)
  original.nutrition.__portionUnit = unit
  original.nutrition.__portionAmount = 270 / (unit === 'oz' ? 28.349523125 : 1)
  const changed = [{ ...carrot, servings: 10.8, weightAmount: 1080 }]
  for (const state of numericEdits(source, current, original, changed).states) {
    const saved = current.merge(state, current.recalculateNutritionFromItems(changed))
    for (const container of [saved.nutrition, saved.total]) {
      assert.equal(container.__portionScale, .5); assert.equal(container.__portionTotalWeightG, 1080)
      assert.ok(Math.abs(container.__portionAmount * (unit === 'oz' ? 28.349523125 : 1) - 540) < 1e-9)
    }
    const reopened = { ...state, ...saved }, restored = nativeRestore(reopened)
    assert.equal(restored.PortionUnit, unit); assert.equal(restored.SavedScale, .5)
    assert.ok(Math.abs(portionEditor.mealPortionScale(restored.PortionAmount, unit, 1080, 1) - .5) < 1e-9)
    assert.deepEqual(six(current.getEntryTotals(reopened)), six(native.normalizeFoodApiEntry(reopened).nutrients))
  }
}
groups.push('Actual g/oz edit callers update retained half amount270→540g and whole weight540→1080 together; native actual portion-restore block and ratio agree')
const noMass = [{ ...carrot, serving_size: '1 serving', customGramsPerServing: null, servings: 1, weightAmount: undefined }]
const weighed = entry(.5); weighed.nutrition.__portionUnit = 'g'; weighed.nutrition.__portionAmount = 270
const unknownState = numericEdits(source, current, weighed, noMass).states[0]
assert.equal(unknownState.nutrition.__portionTotalWeightG, null)
assert.equal(unknownState.nutrition.__portionUnit, 'serving')
assert.equal(unknownState.nutrition.__portionAmount, .5)
groups.push('If new ingredient basis has no recorded mass, existing serving-share fallback preserves half and clears stale grams; no guessed measurement')
function checkClearSequence(api, text) {
  for (const unit of ['g', 'oz']) for (const field of ['servings', 'weight']) {
    const original = entry(.5)
    original.nutrition.__portionUnit = unit
    original.nutrition.__portionAmount = 270 / (unit === 'oz' ? 28.349523125 : 1)
    const badItem = field === 'servings' ? { ...carrot, servings: 0 } : { ...carrot, portionMode: 'weight', weightAmount: '' }
    assert.equal(api.recalculateNutritionFromItems([badItem]), null)
    const badStates = numericEdits(text, api, original, [badItem]).states
    for (const [index, state] of badStates.entries()) {
      assert.ok(state.nutrition, 'Clearing an amount must retain only its saved portion metadata')
      assert.deepEqual(Object.keys(state.nutrition).sort(), Object.keys(original.nutrition).sort())
      for (const key of Object.keys(original.nutrition)) {
        assert.deepEqual(state.nutrition[key], original.nutrition[key]); assert.deepEqual(state.total[key], original.nutrition[key])
      }
      assert.equal(state.total.calories, null)
      assert.equal(state.total.fat_g, null)
      assert.equal(api.recalculateNutritionFromItems(state.items), null)
      const validItem = { ...carrot, servings: 6, weightAmount: 600, ...(field === 'weight' ? { portionMode: 'weight' } : {}) }
      const valid = numericEdits(text, api, state, [validItem]).states[index]
      const update = api.merge(valid, api.recalculateNutritionFromItems([validItem]))
      const reopened = { ...valid, ...update }, restored = nativeRestore(reopened)
      assert.equal(restored.SavedScale, .5); assert.equal(restored.PortionUnit, unit)
      assert.equal(reopened.nutrition.__portionTotalWeightG, 600)
      assert.ok(Math.abs(portionEditor.mealPortionScale(restored.PortionAmount, unit, 600, 1) - .5) < 1e-9)
      assert.equal(api.getEntryTotals(reopened).calories, 123)
      assert.deepEqual(six(api.getEntryTotals(reopened)), six(native.normalizeFoodApiEntry(reopened).nutrients))
    }
  }
  assert.equal(api.preserveSavedEntryPortion(null, entry(.5)), null)
  assert.equal(api.preserveSavedEntryPortion(null, entry(.5), []), null)
  assert.equal(api.preserveSavedEntryPortion(null, {}, [{ ...carrot, servings: 0 }]), null)
}
checkClearSequence(current, source)
groups.push('Clear→valid for servings/weight in all8 g/oz initializer sequences retains metadata without inventing nutrient values or bypassing invalid-amount rejection')

const unknown = { ...carrot, calories: 0, protein_g: 1, fiber_g: null, sugar_g: 0 }
for (const scale of [.5, 1, 2]) {
  const result = current.getEntryTotals({ ...entry(scale), items: [unknown] })
  assert.equal(result.calories, 0); assert.equal(result.fiber, null); assert.equal(result.sugar, 0)
}
const storedOnly = { nutrition: { calories: 221, protein: 5, carbs: 51.7, fat: 1.3, fiber: null, sugar: 0, __portionScale: .5 } }
assert.deepEqual(six(current.getEntryTotals(storedOnly)), { calories:111, protein:2.5, carbs:25.9, fat:.7, fiber:null, sugar:0 })
groups.push('Declared zero, optional unknowns and source-unavailable stored-total fallback remain truthful')
const invalidMacros = [{ ...carrot, servings: 1, calories: 0, protein_g: -1, carbs_g: -1, fat_g: -1 }, { ...carrot, servings: 1, calories: 0, protein_g: 2, carbs_g: 3, fat_g: 4 }]
const clamped = current.recalculateNutritionFromItems(invalidMacros, 2)
assert.equal(clamped.protein, 4); assert.equal(clamped.carbs, 6); assert.equal(clamped.fat, 8)
groups.push('Nonnegative macro validation is retained per source ingredient for portions above1')
function cardText(entry, energyUnit = 'kcal') {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let section
  function visit(node) {
    if (ts.isJsxExpression(node) && node.getText(ast).includes('data-testid="food-saved-portion-note"') && (!section || node.getWidth(ast) < section.length)) section = node.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast); assert.ok(section); section = section.slice(1, -1)
  const context = vm.createContext({ editingEntry: entry, analyzedNutrition: freshWhole, analyzedItems: [carrot], energyUnit, getEntryPortionScale: current.getEntryPortionScale, getEntryTotals: current.getEntryTotals, foodNumberOrNull: nutrients.optionalNutrient, KCAL_TO_KJ: 4.184,
    React: { createElement: (type, props, ...children) => ({ type, props, children }) }, NutrientCards: 'NutrientCards',
  })
  const tree = vm.runInContext(ts.transpileModule('(' + section + ')', { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context)
  const text = value => value == null || value === false ? '' : Array.isArray(value) ? value.map(text).join('') : typeof value === 'object' ? text(value.children) : String(value)
  return text(tree)
}
assert.match(cardText(entry(.5)), /whole meal.*saved portion \(50%, 111 kcal\).*kept/)
assert.match(cardText(entry(2)), /saved portion \(200%, 443 kcal\)/)
assert.match(cardText(entry(.5), 'kJ'), /saved portion \(50%, 464 kJ\)/)
assert.equal(cardText(entry(1)), '')
assert.equal(cardText(null), '')
groups.push('Actual adjacent saved-portion note labels whole-meal values and retained50%/200% shares; whole/new records add no misleading label')

return groups
}
module.exports = { run }
if (require.main === module) {
  for (const group of run()) console.log('PASS ' + group)
}
