import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as nutrients from '../lib/food/nutrient-values'
import { isFoodIdentityCompatible, isGenericMealName, suggestMealName } from '../native/src/lib/foodIdentity'
import { convertFoodAmount, liquidDensity, liquidHouseholdMl, parseFoodServing } from '../native/src/lib/foodUnits'
import { DRY_FOOD_MEASUREMENTS } from '../lib/food/dry-food-measurements'
import { PRODUCE_MEASUREMENTS } from '../lib/food/produce-measurements'
import { DAIRY_SEMI_SOLID_MEASUREMENTS } from '../lib/food/dairy-semi-solid-measurements'

// Execute real web controls and save mapping with synthetic data. No UI account,
// network, keys, AI calls or saved food writes are used by this regression.
const path = 'app/food/build-meal/MealBuilderClient.tsx'
const text = fs.readFileSync(path, 'utf8')
const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const ctx: any = vm.createContext({ ...nutrients, isFoodIdentityCompatible, isGenericMealName, suggestMealName, convertFoodAmount, liquidDensity, liquidHouseholdMl, parseFoodServing, DRY_FOOD_MEASUREMENTS, PRODUCE_MEASUREMENTS, DAIRY_SEMI_SOLID_MEASUREMENTS, useCallback: (fn: any) => fn, useMemo: (fn: any) => fn(), measurementCountry: 'AU', console })
const top = source.statements.filter(node => !ts.isImportDeclaration(node) && !(ts.isFunctionDeclaration(node) && node.name?.text === 'MealBuilderClient')).map(node => node.getText(source)).join('\n')
vm.runInContext(ts.transpile(top, { target: ts.ScriptTarget.ES2020 }), ctx)
const evaluate = (expression: string) => vm.runInContext(expression, ctx)
function actual(name: string) {
  let expression = ''
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) expression = node.initializer.getText(source); ts.forEachChild(node, visit) }
  visit(source); assert.ok(expression, name)
  return vm.runInContext(ts.transpile(`(${expression})`, { target: ts.ScriptTarget.ES2020 }), ctx)
}
function click(label: string) {
  let expression = ''
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'button' && node.children.some(child => ts.isJsxText(child) && child.text.trim() === label)) {
      const handler = node.openingElement.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'onClick') as ts.JsxAttribute
      expression = (handler.initializer as ts.JsxExpression).expression!.getText(source)
    }
    ts.forEachChild(node, visit)
  }
  visit(source); assert.ok(expression, `actual ${label} button`)
  vm.runInContext(ts.transpile(`(${expression})()`, { target: ts.ScriptTarget.ES2020 }), ctx)
}
const setter = (key: string) => (value: any) => { ctx[key] = typeof value === 'function' ? value(ctx[key]) : value }
Object.assign(ctx, { portionControlEnabled: false, portionScaleOverriddenByUser: false, portionUnit: 'g', portionAmountInput: '', recipeServingsForPortion: null, totalRecipeWeightG: 121.4,
  setPortionControlEnabled: setter('portionControlEnabled'), setPortionScaleOverriddenByUser: setter('portionScaleOverriddenByUser'), setPortionUnit: setter('portionUnit'), setPortionAmountInput: setter('portionAmountInput'), setRecipeServingsForPortion: setter('recipeServingsForPortion') })
const meal = { id: 'fixture', name: 'Cooked chicken breast', serving_size: '121.4 g', calories: 224.4, protein_g: 40, carbs_g: 0, fat_g: 8, fiber_g: null, sugar_g: 0, servings: 1, __baseAmount: 121.4, __baseUnit: 'g', __unit: 'g', __amount: 121.4, __amountInput: '121.4', __measurementCountry: 'AU' }
Object.assign(ctx, { category: 'lunch', draftCategory: 'lunch', items: [meal], itemsRef: { current: [meal] }, isDiaryEdit: true, sourceLogId: 'fixture', sourceCreatedAtRef: { current: '2026-10-15T01:00:00.000Z' }, mealName: 'Chicken lunch', linkedFavoriteId: '', selectedDate: '2026-10-15', entryTime: '12:00', savedPortionScale: .333, portionInputRef: { current: null }, editFavoriteId: '' })
click('Half meal')
assert.equal(ctx.portionControlEnabled, true)
assert.equal(ctx.portionUnit, 'serving')
assert.equal(ctx.portionAmountInput, '0.5')
let bundle = actual('buildDiaryAutosaveBundle')()
assert.equal(bundle.diaryNutrition.__portionScale, .5)
assert.equal(bundle.diaryNutrition.calories, 112)
assert.equal(bundle.diaryNutrition.fiber, null)
assert.equal(bundle.diaryNutrition.sugar, 0)
assert.equal(bundle.cleanedItems[0].__amount, 121.4, 'recipe ingredients retain full basis')
assert.equal(bundle.diaryNutrition.__portionTotalWeightG, 121.4)
ctx.recipeServingsForPortion = 4
click('Half meal')
assert.equal(ctx.portionAmountInput, '2', 'half of four recipe servings')
assert.equal(actual('buildDiaryAutosaveBundle')().diaryNutrition.__portionScale, .5)
click('Whole meal')
assert.equal(actual('buildDiaryAutosaveBundle')().diaryNutrition.calories, 224)
click('Custom')
assert.equal(ctx.portionAmountInput, '121.4', 'custom initializes with exact full mass')
ctx.portionAmountInput = '242.8'
bundle = actual('buildDiaryAutosaveBundle')()
assert.equal(bundle.diaryNutrition.__portionScale, 2)
assert.equal(bundle.diaryNutrition.calories, 449)
const saveDisabledExpressions: string[] = []
let previewExpression = ''
let bottomCardExpression = ''
const findSaveControls = (node: ts.Node) => {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'button' && node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'onClick' && attr.initializer?.getText(source) === '{createMeal}')) {
    const disabled = node.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'disabled') as ts.JsxAttribute
    assert.ok(disabled?.initializer && ts.isJsxExpression(disabled.initializer))
    saveDisabledExpressions.push((disabled.initializer as ts.JsxExpression).expression!.getText(source))
  }
  if (ts.isJsxAttribute(node) && node.name.getText(source) === 'values' && node.initializer?.getText(source).includes('portionAmountError')) previewExpression = (node.initializer as ts.JsxExpression).expression!.getText(source)
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'value' && node.initializer?.getText(source).includes('portionAmountError')) bottomCardExpression = node.initializer.getText(source)
  ts.forEachChild(node, findSaveControls)
}
findSaveControls(source)
assert.equal(saveDisabledExpressions.length, 2, 'both actual save controls are checked')
assert.ok(previewExpression && bottomCardExpression)
const automaticPortionEffects: string[] = []
const collectPortionEffects = (node: ts.Node) => {
 if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[1]?.getText(source).includes('portionAmountInput') && node.arguments[0]?.getText(source).includes('setPortionAmountInput')) automaticPortionEffects.push(node.arguments[0].getText(source))
 ts.forEachChild(node, collectPortionEffects)
}
collectPortionEffects(source)
assert.ok(!text.includes("}, [portionUnit, portionAmountInput])"), 'no effect may rewrite user-entered invalid servings as one')
Object.assign(ctx, { busy: false, favoriteSaving: false, portionUnit: 'serving', recipeImportDraft: null, recipeImportPortionPrefilledRef: { current: true } })
for (const amount of ['', '0', '-1', 'Infinity', 'no']) {
 jsxHandler('setPortionAmountInput(e.target.value)', 'onChange')({ target: { value: amount } })
 for (const portionEffect of automaticPortionEffects) vm.runInContext(ts.transpile(`(${portionEffect})()`, { target: ts.ScriptTarget.ES2020 }), ctx)
 assert.equal(ctx.portionAmountInput, amount, 'React effects cannot replace an invalid amount with a whole serving')
 assert.equal(actual('buildDiaryAutosaveBundle')(), null, `invalid ${amount} never saves whole meal`)
 ctx.saveValidationError = actual('saveValidationError')
 ctx.recipeImportDraft = { servings: 4 }
 for (const portionEffect of automaticPortionEffects) vm.runInContext(ts.transpile(`(${portionEffect})()`, { target: ts.ScriptTarget.ES2020 }), ctx)
 assert.equal(ctx.portionAmountInput, amount, 'completed recipe import cannot rewrite a later user edit')
 ctx.recipeImportDraft = null
 ctx.portionAmountError = actual('portionAmountError')
 assert.equal(ctx.portionAmountError, 'Enter an amount greater than zero.')
 for (const expression of saveDisabledExpressions) assert.equal(evaluate(expression), true, `actual save button disabled for ${amount}`)
 assert.equal(Object.keys(evaluate(previewExpression)).length, 0, 'invalid preview is unknown, never full meal')
 assert.equal(evaluate(bottomCardExpression), '—', 'bottom totals also unavailable')
}
ctx.portionUnit = 'g'
ctx.portionAmountInput = '60.7'
ctx.saveValidationError = actual('saveValidationError')
ctx.portionAmountError = actual('portionAmountError')
for (const expression of saveDisabledExpressions) assert.equal(evaluate(expression), false, 'valid custom amount enables both saves')
ctx.portionAmountInput = '60.7'; ctx.portionScaleOverriddenByUser = false
assert.equal(actual('buildDiaryAutosaveBundle')().diaryNutrition.__portionScale, .333, 'saved exact historical scale remains until an explicit control edit')
const normalize = evaluate('normalizeServingOptionsForItem')
assert.equal(normalize([{ id: 'skin', foodName: 'Chicken, skin only, cooked, roasted', label: '100 g' }], 'Chicken meat and skin, cooked, roasted').length, 0)
assert.equal(normalize([{ id: 'meat', foodName: 'Chicken, meat and skin, cooked, roasted', label: '100 g' }], 'Chicken meat and skin, cooked, roasted').length, 1)
assert.equal(evaluate('buildDefaultMealName')([{name:'Chicken'},{name:'Rice'}]), 'Chicken and Rice')
const sourceChoice = { id: 'recorded-serving', foodName: 'Cooked chicken breast', label: '121.4 g', grams: 121.4, calories: 224.4, protein_g: 40, carbs_g: 0, fat_g: 8, fiber_g: null, sugar_g: 0 }
const solid = { ...meal, id: 'generated-solid-row', __source: 'usda', __sourceId: 'original-chicken-record', __servingOptions: [sourceChoice], __selectedServingId: 'recorded-serving', nutritionProvenance: { provider: 'usda', recordId: 'original-chicken-record', foodName: 'Cooked chicken breast' } }
const originalSolid = JSON.stringify(solid)
const physical = evaluate('serializeBuilderMeasurement')(solid)
assert.equal(physical.__source, 'usda')
assert.equal(physical.__sourceId, 'original-chicken-record')
assert.equal(physical.id, undefined, 'solid serialization cannot replace generated UI/rename ID')
assert.equal(physical.selectedServingId, 'recorded-serving')
assert.equal(physical.servingOptions[0].id, 'recorded-serving')
Object.assign(ctx, { items: [solid], itemsRef: { current: [solid] }, portionControlEnabled: false })
const solidSave = actual('buildDiaryAutosaveBundle')().cleanedItems[0]
assert.equal(solidSave.id, 'generated-solid-row', 'existing solid row ID remains unchanged during save')
assert.equal(solidSave.__source, 'usda')
assert.equal(solidSave.__sourceId, 'original-chicken-record')
assert.equal(solidSave.selectedServingId, 'recorded-serving')
const hydrateSolid = actual('convertToBuilderItems')
const restoredSolid = hydrateSolid([solidSave])[0]
assert.equal(restoredSolid.__source, 'usda')
assert.equal(restoredSolid.__sourceId, 'original-chicken-record', 'reopen uses provider ID rather than generated UI ID')
assert.equal(restoredSolid.__selectedServingId, 'recorded-serving')
assert.equal(restoredSolid.__servingOptions[0].foodName, 'Cooked chicken breast')
assert.equal(restoredSolid.nutritionProvenance.recordId, 'original-chicken-record')
for (const [raw, expected] of [
 [{ ...meal, id: 'generated-ui-only', nutritionProvenance: { provider: 'usda', recordId: 'provenance-record' } }, 'provenance-record'],
 [{ ...meal, id: 'legacy-provider-record', source: 'usda' }, 'legacy-provider-record'],
 [{ ...meal, id: 'generated-ui-only' }, null],
 [{ ...solidSave, __sourceId: 'explicit-original', nutritionProvenance: { provider: 'usda', recordId: 'other-record' } }, 'explicit-original'],
] as const) {
 const original = JSON.stringify(raw)
 assert.equal(hydrateSolid([raw])[0].__sourceId, expected)
 assert.equal(JSON.stringify(raw), original, 'hydration cannot mutate saved input')
}
assert.equal(JSON.stringify(solid), originalSolid, 'serialization cannot mutate source ingredient')
const addedPhotos: any[] = []
ctx.addBuilderItem = (item: any) => addedPhotos.push(item)
actual('addItemsFromAi')([{ ...meal, nutritionProvenance: { provider: 'usda', recordId: 'photo-original-record' } }])
assert.equal(addedPhotos[0].__source, 'usda')
assert.equal(addedPhotos[0].__sourceId, 'photo-original-record', 'fresh photo source survives first save too')

assert.equal(suggestMealName([meal], 'Photo analyzed meal'), 'Chicken breast')
assert.equal(suggestMealName([meal], 'My special lunch'), 'My special lunch')
for (const boundary of ['suggestMealName(nextItems, parsed.mealName)', 'suggestMealName(sourceItems || [], label)', 'suggestMealName(favItems || [], label)', 'suggestMealName(rawItems || [], label)']) assert.ok(text.includes(boundary), `name suggestion at ${boundary}`)
Object.assign(ctx, { items: [meal], itemsRef: { current: [meal] }, portionControlEnabled: true })

assert.ok(text.includes('setMealName((current) => suggestMealName(detected, current))'))
assert.ok(text.includes("await requestFoodAnalysis('/api/analyze-food'"), 'photo builder waits for final durable response')
const css = fs.readFileSync('app/food/food-design.module.css', 'utf8')
assert.ok(css.includes('border-radius: 2px !important'))
assert.ok(css.includes(':not([id="profile-dropdown"] *)'), 'profile design is preserved')
for (const file of [path, 'app/food/page.tsx', 'app/food/add-ingredient/AddIngredientClient.tsx', 'app/food/import-recipe/ImportRecipeClient.tsx', 'app/food/recommended/RecommendedMealClient.tsx']) {
 const actualSource = fs.readFileSync(file, 'utf8')
 assert.ok(actualSource.includes('foodDesign.surface'), `${file} uses food-scoped straight-edge controls`)
 const parsed = ts.createSourceFile(file, actualSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
 assert.equal((parsed as any).parseDiagnostics.length, 0, `${file} parses`)
}
function jsxHandler(marker: string, eventName: string) {
  let expression = ''
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === eventName && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression?.getText(source).includes(marker)) expression = node.initializer.expression.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source); assert.ok(expression, `actual ${marker} handler`)
  return vm.runInContext(ts.transpile(`(${expression})`, { target: ts.ScriptTarget.ES2020 }), ctx)
}
function effect(marker: string) {
  let expression = ''
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes(marker)) expression = node.arguments[0].getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source); assert.ok(expression, marker)
  return vm.runInContext(ts.transpile(`(${expression})`, { target: ts.ScriptTarget.ES2020 }), ctx)
}
async function checkMealAndTime() {
  const original = '2026-10-15T01:00:00.125Z'
  const timers: Array<() => any> = []
  const writes: any[] = []
  Object.assign(ctx, { category: 'lunch', draftCategory: 'lunch', mealCategory: 'dinner', setCategory: setter('category'), setEntryTime: setter('entryTime'), entryTime: evaluate(`extractTimeFromTimestamp('${original}')`), sourceCreatedAtRef: { current: original }, portionAmountInput: '60.7', portionScaleOverriddenByUser: true,
    loadedFavoriteId: 'log:fixture', savingMeal: false, buildDiaryAutosaveBundle: actual('buildDiaryAutosaveBundle'), diaryAutosaveBaselineRef: { current: null }, lastDiaryAutosaveSignatureRef: { current: '' }, diaryAutosaveTimeoutRef: { current: null }, draftAppliedRef: { current: false }, setAutosaveHint: () => {}, window: { setTimeout: (fn: any) => { timers.push(fn); return timers.length }, clearTimeout: () => {} }, sessionStorage: { setItem: () => {} }, fetch: async (_url: string, options: any) => { writes.push(JSON.parse(options.body)); return { ok: true } } })
  const key = actual('draftKey')
  const autosave = effect('const requestSignature')
  autosave(); for (const timer of timers.splice(0)) await timer()
  assert.equal(writes.length, 0, 'opening existing meal remains read-only')
  const before = JSON.stringify(ctx.items)
  jsxHandler('setCategory(mealCategory)', 'onClick')()
  assert.equal(ctx.category, 'dinner')
  assert.equal(actual('draftKey'), key, 'changing category retains same draft location')
  assert.equal(JSON.stringify(ctx.items), before, 'changing category cannot reset ingredients')
  autosave(); for (const timer of timers.splice(0)) await timer()
  assert.equal(writes.length, 1, 'changing only meal category is saved')
  assert.equal(writes[0].meal, 'dinner')
  assert.equal(writes[0].category, 'dinner')
  assert.equal(writes[0].createdAt, original, 'category change preserves exact original timestamp')
  jsxHandler('setEntryTime(event.target.value)', 'onChange')({ target: { value: '18:30' } })
  autosave(); for (const timer of timers.splice(0)) await timer()
  assert.equal(writes.length, 2)
  ctx.savedTime = writes[1].createdAt
  assert.equal(evaluate('extractTimeFromTimestamp(savedTime)'), '18:30')
  assert.equal(writes[1].meal, 'dinner')
  assert.equal(JSON.stringify(ctx.items), before)
  for (const invalid of ['', '0', '-1']) {
    ctx.portionAmountInput = invalid
    autosave(); for (const timer of timers.splice(0)) await timer()
    assert.equal(writes.length, 2, 'invalid portion cannot autosave')
  }
  ctx.portionAmountInput = '60.7'
  assert.ok(text.includes('grid grid-cols-4 gap-1 sm:gap-2'))
  assert.ok(text.indexOf('aria-label="Meal category"') < text.indexOf('>Search ingredients</div>'))
  assert.ok(text.indexOf('aria-label="Meal time"') < text.indexOf('>Search ingredients</div>'))
  console.log('PASS: actual web whole/half/custom controls, exact half/full/double saving, unknown/zero, invalid-input guard, saved scale, source identity, photo naming/transport, food-scoped design, category/time controls, stable draft and exact timestamp preservation. Browser visual proof remains separate.')
}
async function checkSavedNativeNameHydration() {
  const rawItems = [{ ...meal, name: 'Chicken with skin', id: 'native-generated-row', __source: 'usda', __sourceId: '239-original-record' }]
  const sourceDescription = rawItems.map((item) => item.name).join(', ')
  for (const [savedName, description, expected] of [
    ['Food portion check15Oct', sourceDescription, 'Food portion check15Oct'],
    ['Photo analyzed meal', sourceDescription, suggestMealName(rawItems, 'Photo analyzed meal')],
    ['', 'My custom dinner name', 'My custom dinner name'],
  ]) {
    const originalTime = '2026-10-15T00:34:00.125Z'
    const savedLog = { id: 'fixture-native-log', name: savedName, description, meal: 'lunch', createdAt: originalTime, items: rawItems, nutrients: { calories: 120, __portionScale: .5, __portionControlEnabled: true, __portionAmount: .5, __portionUnit: 'serving', __portionTotalWeightG: 121.4, __portionRecipeServings: 1 } }
    const before = JSON.stringify(savedLog)
    let complete: () => void = () => {}
    const loaded = new Promise<void>((resolve) => { complete = resolve })
    Object.assign(ctx, { sourceLogId: savedLog.id, editFavoriteId: '', loadedFavoriteId: null, isFavoriteAdjustBuild: false, draftAppliedRef: { current: false }, initialPortionTotalWeightRef: { current: null }, initialItemsSignatureRef: { current: '' }, sourceCreatedAtRef: { current: null }, entryTime: '', mealName: '',
      setLinkedFavoriteId: setter('linkedFavoriteId'), setSavedPortionScale: setter('savedPortionScale'), setMealName: setter('mealName'), setItems: setter('items'), setExpandedId: () => {}, setPersistedRecipePanel: setter('persistedRecipePanel'), setLoadedFavoriteId: (value: string) => { ctx.loadedFavoriteId = value; complete() },
      fetch: async (url: string) => { assert.ok(url.startsWith('/api/food-log?id=')); return { ok: true, json: async () => ({ log: savedLog }) } }, normalizeMealLabel: actual('normalizeMealLabel'), applySavedPortion: actual('applySavedPortion'), getSavedPortionTotalWeightG: actual('getSavedPortionTotalWeightG'), convertToBuilderItems: actual('convertToBuilderItems') })
    const cleanup = effect('const loadedTime = extractTimeFromTimestamp(log?.createdAt)')()
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([loaded, new Promise<void>((_, reject) => { timeout = setTimeout(() => reject(new Error('Actual saved native meal hydration did not finish')), 1000) })])
    } finally { if (timeout) clearTimeout(timeout); cleanup?.() }
    assert.equal(ctx.mealName, expected, 'saved native chosen title survives ingredient description')
    assert.equal(ctx.savedPortionScale, .5)
    assert.equal(ctx.portionAmountInput, '0.5')
    assert.equal(ctx.sourceCreatedAtRef.current, originalTime)
    assert.equal(ctx.entryTime, evaluate(`extractTimeFromTimestamp('${originalTime}')`))
    assert.equal(ctx.category, 'lunch')
    assert.equal(JSON.stringify(savedLog), before, 'reading native meal cannot modify saved data')
  }
  console.log('PASS: actual saved-native-log hydration preserves chosen title over ingredient description, suggests detected names for generic photo title, keeps meaningful description fallback and exact original time/half portion.')
}
checkMealAndTime().then(checkSavedNativeNameHydration).catch((error) => { console.error(error); process.exitCode = 1 })
