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
checkPortionToggle()
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
assert.equal(ctx.portionControlEnabled, true, 'Whole meal keeps the portion switch on')
assert.equal(actual('buildDiaryAutosaveBundle')().diaryNutrition.calories, 224)
click('Custom')
assert.equal(ctx.portionAmountInput, '121.4', 'custom initializes with exact full mass')
ctx.portionAmountInput = '242.8'
bundle = actual('buildDiaryAutosaveBundle')()
assert.equal(bundle.diaryNutrition.__portionScale, 2)
assert.equal(bundle.diaryNutrition.calories, 449)
const saveDisabledExpressions: string[] = []
let previewExpression = ''
const mealSummaryNodes: ts.JsxSelfClosingElement[] = []
const findSaveControls = (node: ts.Node) => {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'button' && node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'onClick' && attr.initializer?.getText(source) === '{createMeal}')) {
    const disabled = node.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'disabled') as ts.JsxAttribute
    assert.ok(disabled?.initializer && ts.isJsxExpression(disabled.initializer))
    saveDisabledExpressions.push((disabled.initializer as ts.JsxExpression).expression!.getText(source))
  }
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'NutrientCards' && node.getText(source).includes('mealTotals')) {
    mealSummaryNodes.push(node)
    const values = node.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'values') as ts.JsxAttribute
    previewExpression = (values.initializer as ts.JsxExpression).expression!.getText(source)
  }
  ts.forEachChild(node, findSaveControls)
}
findSaveControls(source)
assert.equal(saveDisabledExpressions.length, 1, 'one main save action follows meal review')
assert.equal(mealSummaryNodes.length, 1, 'one main nutrient summary describes the selected portion')
assert.ok(previewExpression)
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
}
ctx.portionUnit = 'g'
ctx.portionAmountInput = '60.7'
ctx.saveValidationError = actual('saveValidationError')
ctx.portionAmountError = actual('portionAmountError')
for (const expression of saveDisabledExpressions) assert.equal(evaluate(expression), false, 'valid custom amount enables saving')
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
function checkPortionToggle() {
  let switchNode: ts.JsxElement | undefined
  let optionsGate: ts.BinaryExpression | undefined
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'button' && node.openingElement.getText(source).includes('aria-label="Portion control"')) switchNode = node
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && node.left.getText(source) === 'portionControlEnabled' && node.right.getText(source).includes('id="portion-control-options"')) optionsGate = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(switchNode && optionsGate, 'actual accessible toggle gates the portion options')
  ctx.React = { createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children: children.flat(Infinity) }), Fragment: 'Fragment' }
  Object.assign(ctx, { portionAmountError: null, effectivePortionScale: 1 })
  const render = (node: ts.Node) => vm.runInContext(ts.transpile(`(${node.getText(source)})`, { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React }), ctx)
  const switchView = () => render(switchNode!)
  assert.equal(switchView().props.role, 'switch')
  assert.equal(switchView().props['aria-checked'], false)
  assert.equal(render(optionsGate!), false, 'OFF removes portion inputs and presets from rendered UI')
  switchView().props.onClick()
  assert.equal(switchView().props['aria-checked'], true)
  assert.equal(render(optionsGate!).props.id, 'portion-control-options', 'ON reveals actual portion controls')
  assert.equal(ctx.portionAmountInput, '1')
  click('Half meal')
  assert.equal(actual('buildDiaryAutosaveBundle')().diaryNutrition.calories, 112)
  switchView().props.onClick()
  assert.equal(ctx.portionControlEnabled, false)
  assert.equal(render(optionsGate!), false)
  assert.equal(ctx.portionAmountInput, '1')
  const off = actual('buildDiaryAutosaveBundle')()
  assert.equal(off.diaryNutrition.calories, 224, 'OFF restores every food to full meal')
  assert.equal(off.diaryNutrition.__portionScale ?? 1, 1, 'OFF omits optional scale metadata and retains full basis')
  assert.equal(off.diaryNutrition.__portionControlEnabled, false)
  assert.equal(off.cleanedItems[0].__amount, 121.4)
  const restore = actual('applySavedPortion')
  for (const [scale, enabled] of [[1, true], [.5, true], [2, true], [1, false], [.5, undefined]] as const) {
    restore({ __portionScale: scale, ...(enabled === undefined ? {} : { __portionControlEnabled: enabled }), __portionAmount: scale, __portionUnit: 'serving', __portionRecipeServings: 1 })
    assert.equal(ctx.portionControlEnabled, enabled ?? true, 'saved whole ON, half/custom ON, OFF and legacy half restore correctly')
    assert.equal(switchView().props['aria-checked'], enabled ?? true)
    ctx.portionScaleOverriddenByUser = true
    const saved = actual('buildDiaryAutosaveBundle')()
    assert.equal(saved.diaryNutrition.__portionScale ?? 1, (enabled ?? true) ? scale : 1)
    assert.equal(saved.diaryNutrition.calories, Math.round(224.4 * ((enabled ?? true) ? scale : 1)))
  }
  ctx.portionControlEnabled = false
  ctx.recipeServingsForPortion = 4
  switchView().props.onClick()
  assert.equal(ctx.portionAmountInput, '4', 'ON starts with full recipe yield')
  click('Half meal')
  switchView().props.onClick()
  assert.equal(ctx.portionAmountInput, '4', 'OFF resets a fractional recipe to its whole yield')
  assert.equal(actual('buildDiaryAutosaveBundle')().diaryNutrition.__portionScale ?? 1, 1)
  ctx.recipeServingsForPortion = null
  switchView().props.onClick()
  console.log('PASS: actual web portion switch gates rendered controls, OFF saves whole meal, Whole stays ON, saved ON/OFF/legacy portions restore, and four-serving recipe resets to full yield.')
}
function checkVisibleFoodReview() {
  let nameInput: ts.JsxSelfClosingElement | undefined
  let editFoodHeader: ts.JsxElement | undefined
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'input' && node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'value' && attr.initializer?.getText(source) === '{mealName}')) nameInput = node
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'button' && node.openingElement.getText(source).includes('setExpandedId(expanded ? null : it.id)')) editFoodHeader = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(nameInput && editFoodHeader, 'actual meal title input and food editor action exist')
  assert.ok(editFoodHeader.getText(source).includes('Edit food'), 'food editing action is visible before opening details')
  assert.ok(text.includes('>Amount in whole meal</'), 'ingredient input explains its full-meal basis')
  const context: any = vm.createContext({
    React: { createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children: children.flat(Infinity) }) },
    mealName: 'My chosen dinner', items: [meal], buildDefaultMealName: evaluate('buildDefaultMealName'),
    mealNameBackupRef: { current: '' }, mealNameEditedRef: { current: false }, mealNameWasClearedOnFocusRef: { current: false },
    setMealName: (value: string) => { context.mealName = value },
    it: { id: 'review-food' }, expanded: false, setExpandedId: (value: string | null) => { context.expandedId = value },
  })
  const renderTitle = () => vm.runInContext(ts.transpile(`(${nameInput!.getText(source)})`, { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React }), context)
  const title = renderTitle()
  assert.equal(title.props.value, 'My chosen dinner', 'the actual field contains the chosen title, not only a placeholder')
  assert.ok(!title.props.readOnly && !title.props.disabled, 'meal title remains editable')
  assert.equal(title.props.id, 'builder-meal-name')
  assert.ok(text.includes('htmlFor="builder-meal-name"'), 'meal name label is attached to its editable field')
  title.props.onChange({ target: { value: 'My corrected dinner' } })
  assert.equal(renderTitle().props.value, 'My corrected dinner', 'normal typing changes the displayed title')
  const handler = editFoodHeader.openingElement.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'onClick') as ts.JsxAttribute
  const onEdit = vm.runInContext(ts.transpile(`(${(handler.initializer as ts.JsxExpression).expression!.getText(source)})`, { target: ts.ScriptTarget.ES2020 }), context)
  onEdit()
  assert.equal(context.expandedId, 'review-food', 'visible edit action opens the intended food')
  context.expanded = true
  onEdit()
  assert.equal(context.expandedId, null, 'food details can be closed without saving')
  const foodPosition = text.indexOf('>Your foods</')
  const portionPosition = text.indexOf('>How much did you eat?</')
  assert.ok(foodPosition >= 0 && portionPosition > foodPosition, 'reviewed foods appear before portion controls')
  assert.ok(mealSummaryNodes[0].getStart(source) > portionPosition, 'one main summary follows foods and portion choice')

  // Execute both real photo-review entry actions. A visible label must reach
  // the intended item editor, including when its parent row is collapsible.
  const diaryText = fs.readFileSync('app/food/page.tsx', 'utf8')
  const diary = ts.createSourceFile('app/food/page.tsx', diaryText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const editButtons: ts.JsxElement[] = []
  const collect = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(diary) === 'button' && node.openingElement.getText(diary).includes('setEditingItemIndex(index)') && node.children.some(child => ts.isJsxText(child) && child.text.trim() === 'Edit food')) editButtons.push(node)
    ts.forEachChild(node, collect)
  }
  collect(diary)
  assert.equal(editButtons.length, 2, 'collapsed and expanded photo foods both offer Edit food')
  for (const button of editButtons) {
    let selected: number | null = null, opened = false, propagationStopped = false
    const state = vm.createContext({ React: context.React, index: 7, setEditingItemIndex: (value: number) => { selected = value }, setShowItemEditModal: (value: boolean) => { opened = value } })
    const rendered = vm.runInContext(ts.transpile(`(${button.getText(diary)})`, { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React }), state)
    rendered.props.onClick({ stopPropagation: () => { propagationStopped = true } })
    assert.equal(selected, 7)
    assert.equal(opened, true)
    if (button.openingElement.getText(diary).includes('event.stopPropagation')) assert.equal(propagationStopped, true, 'edit click cannot also collapse the parent food card')
  }
}
async function checkAtomicFoodReplacement() {
  const previous = { ...meal, id: 'stable-food-row', name: 'Cooked chicken', calories: 403, protein_g: 12.26, carbs_g: 1, fat_g: 38.94, __baseAmount: 100, __amount: 100, __amountInput: '100', __source: 'usda', __sourceId: 'old-provider-record' }
  const other = { ...meal, id: 'other-food-row', name: 'Rice cooked' }
  const originalItems = [previous, other]
  const original = JSON.stringify(originalItems)
  Object.assign(ctx, {
    items: originalItems, itemsRef: { current: originalItems }, mealName: 'My chosen dinner', replacementItemId: null, replacementItemIdRef: { current: null },
    isDiaryEdit: true, sourceLogId: 'existing-diary-row', selectedDate: '2026-10-15', sourceCreatedAtRef: { current: '2026-10-15T01:00:00.125Z' },
    entryTime: evaluate("extractTimeFromTimestamp('2026-10-15T01:00:00.125Z')"), linkedFavoriteId: '',
    portionControlEnabled: true, portionUnit: 'serving', portionAmountInput: '0.5', portionInputRef: { current: null }, recipeServingsForPortion: 1, portionScaleOverriddenByUser: true,
    it: previous, displayName: previous.name, queryInputRef: { current: { focus: () => {} } },
    document: { getElementById: () => ({ scrollIntoView: () => {} }) }, runSearch: (query: string) => { ctx.lastSearch = query },
    triggerHaptic: () => {}, window: undefined,
    setItems: (update: any) => { ctx.items = typeof update === 'function' ? update(ctx.items) : update; ctx.itemsRef.current = ctx.items },
    setReplacementItemId: setter('replacementItemId'), setIngredientsListExpanded: setter('ingredientsListExpanded'), setExpandedId: setter('expandedId'),
    setKind: setter('kind'), setQuery: setter('query'), setResults: setter('results'), setError: setter('error'),
  })
  ctx.addBuilderItem = actual('addBuilderItem')
  ctx.addItemDirect = actual('addItemDirect')
  ctx.hasMacroData = actual('hasMacroData')
  const choose = actual('addItemWithMacros')
  jsxHandler('replacementItemIdRef.current = it.id', 'onClick')()
  assert.equal(ctx.replacementItemIdRef.current, previous.id)
  assert.equal(ctx.replacementItemId, previous.id)
  assert.equal(ctx.lastSearch, previous.name)
  assert.equal(JSON.stringify(ctx.items), original, 'opening a replacement search cannot delete the old food')
  const replacement = { id: 'correct-provider-record', source: 'usda', name: 'Chicken meat and skin, cooked, roasted', serving_size: '100 g', calories: 239, protein_g: 27.3, carbs_g: 0, fat_g: 13.6, fiber_g: null, sugar_g: 0 }
  await choose({ ...replacement, fat_g: null })
  assert.equal(JSON.stringify(ctx.items), original, 'a result without complete core nutrients cannot replace the old food')
  assert.equal(ctx.replacementItemIdRef.current, previous.id)
  await choose(replacement)
  assert.equal(ctx.items.length, 2)
  const selected = ctx.items[0]
  assert.equal(selected.id, previous.id, 'replacement keeps the UI food row identity')
  assert.equal(selected.__source, 'usda')
  assert.equal(selected.__sourceId, replacement.id, 'the selected provider record is preserved separately')
  assert.equal(selected.name, replacement.name)
  assert.equal(selected.__amount, 100)
  assert.equal(selected.__unit, 'g')
  assert.equal(selected.servings, 1)
  assert.equal(selected.calories, 239)
  assert.equal(selected.fiber_g, null)
  assert.equal(selected.sugar_g, 0)
  assert.equal(JSON.stringify(ctx.items[1]), JSON.stringify(other), 'replacement preserves all other foods')
  assert.equal(ctx.mealName, 'My chosen dinner')
  assert.equal(ctx.replacementItemIdRef.current, null)
  assert.equal(ctx.replacementItemId, null)
  const saved = actual('buildDiaryAutosaveBundle')()
  assert.equal(saved.title, 'My chosen dinner')
  assert.equal(saved.createdAtIso, '2026-10-15T01:00:00.125Z', 'replacing food preserves the exact saved time')
  assert.equal(saved.diaryNutrition.__portionScale, 0.5, 'replacing food preserves the chosen meal share')
  assert.equal(saved.cleanedItems[0].id, previous.id)
  assert.equal(saved.cleanedItems[0].__sourceId, replacement.id)
  assert.equal(saved.cleanedItems[0].__amount, 100, 'save retains the whole-food measured basis')
  assert.equal(saved.diaryNutrition.fiber, null)
  assert.equal(saved.diaryNutrition.sugar, 0)

  Object.assign(ctx, { items: originalItems, itemsRef: { current: originalItems }, replacementItemId: previous.id, replacementItemIdRef: { current: previous.id } })
  click('Cancel replacement')
  assert.equal(ctx.replacementItemIdRef.current, null)
  assert.equal(ctx.replacementItemId, null)
  assert.equal(JSON.stringify(ctx.items), original, 'Cancel replacement keeps every original food')
  assert.equal(ctx.mealName, 'My chosen dinner')

  Object.assign(ctx, { items: [other], itemsRef: { current: [other] }, replacementItemId: previous.id, replacementItemIdRef: { current: previous.id } })
  await choose(replacement)
  assert.equal(JSON.stringify(ctx.items), JSON.stringify([other]), 'stale replacement cannot silently append a new food')
  assert.equal(ctx.replacementItemIdRef.current, null)
  assert.equal(ctx.error, 'That food was removed. Search again to add a food.')
  const countFood = evaluate('buildFoodReplacement')({ ...previous, __unit: 'serving', __amount: 3 }, selected)
  assert.equal(countFood.__amount, selected.__amount, 'a serving count cannot become an invented equal weight in a different food')
  assert.equal(JSON.stringify(originalItems), original)
  console.log('PASS: actual web visible editing/title controls and atomic source replacement, measured amount, custom name, unknown/zero, cancel and stale-selection protection.')
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
  assert.ok(text.indexOf('aria-label="Meal category"') < text.indexOf('>Food search</div>'))
  assert.ok(text.indexOf('aria-label="Meal time"') < text.indexOf('>Food search</div>'))
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
    assert.equal(ctx.portionControlEnabled, true, 'saved half meal reopens with portion controls on')
    assert.equal(ctx.portionAmountInput, '0.5')
    assert.equal(ctx.sourceCreatedAtRef.current, originalTime)
    assert.equal(ctx.entryTime, evaluate(`extractTimeFromTimestamp('${originalTime}')`))
    assert.equal(ctx.category, 'lunch')
    assert.equal(JSON.stringify(savedLog), before, 'reading native meal cannot modify saved data')
  }
  console.log('PASS: actual saved-native-log hydration preserves chosen title over ingredient description, suggests detected names for generic photo title, keeps meaningful description fallback and exact original time/half portion.')
}
checkVisibleFoodReview()
checkMealAndTime().then(checkSavedNativeNameHydration).then(checkAtomicFoodReplacement).catch((error) => { console.error(error); process.exitCode = 1 })
