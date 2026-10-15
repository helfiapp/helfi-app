// Exercises real native normalization, editor save handler and favorite persistence.
// Offline fixtures only: no account, network or AI credentials are loaded.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const assert = require('assert/strict')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const screenPath = path.join(root, 'native/src/screens/TrackCaloriesScreen.tsx')
const source = fs.readFileSync(screenPath, 'utf8')
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file)
  const module = { exports: {} }
  cache.set(file, module.exports)
  let text = fs.readFileSync(file, 'utf8')
  if (file === screenPath) text += '\nexport const __test = { normalizeFoodApiEntry, normalizeFavoriteMeal, favoriteStorageRecord, buildFavoriteAdjustItems, buildFavoritesListItemFromEntry, buildFavoritesListItemFromFavorite, calculateFavoriteAdjustTotals, favoriteAdjustPersistenceFields, normalizeFavoriteServingOptions, favoriteBaseForItem, cloneFavoriteItems, nullableNumber, portionMealItems, recipePortionRatio, suggestMealName, servingLookupForFavoriteAdjustItem, searchQueryForFavoriteAdjustItem };'
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText
  const localRequire = (name) => {
    if (name.includes('/lib/')) {
      const candidate = path.resolve(path.dirname(file), name + '.ts')
      if (/\/(mealPortions|mealPortionEditor|foodUnits|foodIdentity|nutrientValues|plainFoodSearch|recipeNutrition)\.ts$/.test(candidate)) return load(candidate)
    }
    if (name === 'react-native') return { Platform: { OS: 'ios' } }
    if (name.endsWith('/ui/theme')) return { theme: { colors: {}, radius: {} }, getThemeColors: () => ({}) }
    return {}
  }
  vm.runInNewContext(js, { module, exports: module.exports, require: localRequire, console, Date, Math, Number, String, Array, JSON, setTimeout: () => {} }, { filename: file })
  cache.set(file, module.exports)
  return module.exports
}
const h = load(screenPath).__test
const { mealPortionScale, portionMealItems } = load(path.join(root, 'native/src/lib/mealPortionEditor.ts'))
const { materializeMealPortion } = load(path.join(root, 'native/src/lib/mealPortions.ts'))
const ast = ts.createSourceFile(screenPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function handlerCode(name) {
  let code
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) code = node.initializer.getText(ast)
    ts.forEachChild(node, walk)
  }
  walk(ast)
  assert.ok(code, name)
  return ts.transpileModule('module.exports = ' + code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
}
const clone = (value) => JSON.parse(JSON.stringify(value))
const fixture = {
  id: 'offline-portion', name: 'Chicken and rice', localDate: '2026-10-15', meal: 'lunch', createdAt: '2026-10-15T01:23:00.000Z',
  items: [
    { id: 'chicken', source: 'usda', name: 'Chicken meat and skin, cooked, roasted', serving_size: '100 g', servings: 1, __amount: 100, __unit: 'g', calories: 239, protein_g: 27, carbs_g: 0, fat_g: 14, fiber_g: null, sugar_g: 0, nutritionCoversServing: true },
    { id: 'rice', source: 'usda', name: 'Rice, cooked', serving_size: '200 g', servings: 1, __amount: 200, __unit: 'g', calories: 260, protein_g: 5, carbs_g: 56, fat_g: 1, fiber_g: 0, sugar_g: 0 },
  ],
  nutrition: { calories: 250, protein: 16, carbs: 28, fat: 7.5, fiber: null, sugar: 0, __portionScale: 0.5, __portionControlEnabled: true, __portionUnit: 'serving', __portionAmount: 0.5, __portionTotalWeightG: 300, __portionRecipeServings: 1 },
}
const unchanged = JSON.stringify(fixture)
const native = h.normalizeFoodApiEntry(fixture)
assert.equal(native.nutrients.calories, 250)
assert.equal(native.nutrients.fiber, null)
assert.equal(native.nutrients.sugar, 0)
assert.equal(native.items[0].servings, 0.5)
assert.equal(native.items[0].__amount, 50)
assert.equal(native.raw.items[0].__amount, 100)
const editorItems = h.buildFavoriteAdjustItems(h.buildFavoritesListItemFromEntry(native), true)
assert.equal(editorItems[0].amountInput, '100')
assert.equal(editorItems[0].servings, 1)
assert.equal(h.calculateFavoriteAdjustTotals(portionMealItems(editorItems, 0.5)).calories, 249.5)
assert.equal(h.calculateFavoriteAdjustTotals(portionMealItems(editorItems, 1)).calories, 499)
assert.equal(h.calculateFavoriteAdjustTotals(portionMealItems(editorItems, 2)).calories, 998)
assert.equal(mealPortionScale('150', 'g', 300), 0.5)
assert.ok(Math.abs(mealPortionScale(String(150 / 28.349523125), 'oz', 300) - 0.5) < 1e-12)
assert.equal(mealPortionScale('1', 'serving', 300, 4), 0.25)
for (const value of ['', '0', '-1', 'NaN', 'Infinity']) assert.equal(mealPortionScale(value, 'serving', 300), null)
assert.equal(mealPortionScale('100', 'g', null), null)
assert.equal(mealPortionScale('2', 'serving', null), 2)
assert.equal(JSON.stringify(fixture), unchanged)
assert.equal(h.normalizeFoodApiEntry(materializeMealPortion(fixture)).nutrients.calories, 250)

async function save(scale, kind = 'builder', editItems = editorItems, recipe = null, eaten = '') {
  let payload, favoritePayload, failure
  const favorite = h.normalizeFavoriteMeal({ ...fixture, id: 'favorite', label: fixture.name })
  const listItem = kind === 'favorite' ? h.buildFavoritesListItemFromFavorite(favorite) : kind === 'entry' ? h.buildFavoritesListItemFromEntry(native) : null
  const noop = () => {}
  const context = {
    ...h, mealBuilderOpen: kind === 'builder', favoriteEditItem: listItem, favoriteEditItems: editItems,
    favoriteEditPortionScale: scale, favoriteEditPortionControlEnabled: scale !== 1, favoriteEditPortionUnit: 'serving', favoriteEditPortionAmount: String(scale), favoriteEditWholeGrams: 300, favoriteEditRecipeServings: 1,
    favoriteEditPortionItems: portionMealItems(editItems, scale ?? 1), favoriteEditName: fixture.name,
    mealRecipe: recipe, recipeServingsEaten: eaten, recipePortionRatio: h.recipePortionRatio, favoritesTargetMeal: 'lunch', selectedDate: '2026-10-15', favoriteEditTime: '12:23', favorites: [favorite],
    authHeaders: {}, session: { token: 'offline-fixture' }, API_BASE_URL: 'offline',
    Alert: { alert: (title) => { if (title !== 'Favorite updated') failure = title } },
    buildNativeAuthHeaders: () => ({}), editorTimeToDate: () => fixture.createdAt,
    optionalNutrient: load(path.join(root, 'native/src/lib/nutrientValues.ts')).optionalNutrient,
    roundOptionalNutrient: load(path.join(root, 'native/src/lib/nutrientValues.ts')).roundOptionalNutrient,
    normalizeFavoriteLabel: (value) => String(value || '').trim(), round1: (value) => Math.round(value * 10) / 10, roundTo: (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits,
    isCustomFavoriteMeal: () => true,
    createFoodEntry: async (value) => { payload = value; return true },
    fetch: async (_url, options) => { payload = JSON.parse(options.body); return { ok: true } },
    saveFavorites: async (value) => { favoritePayload = h.favoriteStorageRecord(value[0]) },
    setEntries: noop, setMealBuilderOpen: noop, setFavoriteEditItems: noop, setFavoriteEditName: noop, setFavoriteEditIngredientsExpanded: noop,
    setFavoriteEditExpandedItemId: noop, setFavoriteEditServingPickerItemId: noop, setFavoriteEditServingLoadingId: noop, setFavoriteEditItem: noop,
    module: { exports: {} }, console, Number, String, Array, JSON, Math,
  }
  vm.runInNewContext(handlerCode('updateFavoriteFromEditor'), context)
  await context.module.exports()
  return { payload: payload || favoritePayload, failure }
}
;(async () => {
  for (const kind of ['builder', 'entry', 'favorite']) {
    for (const scale of [0.5, 1, 2]) {
      const result = await save(scale, kind)
      assert.equal(result.failure, undefined, kind)
      const row = clone(result.payload)
      assert.equal(row.items[0].servings, 1, `${kind} retains whole ingredient`)
      assert.equal(row.items[0].__amount, 100)
      assert.equal(row.nutrition.calories, Math.round(499 * scale))
      assert.equal(row.nutrition.__portionScale, scale)
      assert.equal(row.nutrition.__portionTotalWeightG, 300)
      const reopened = h.normalizeFoodApiEntry({ ...row, nutrients: row.nutrition })
      assert.equal(reopened.nutrients.calories, Math.round(499 * scale))
      assert.equal(reopened.nutrients.fiber, null)
      assert.equal(reopened.nutrients.sugar, 0)
      const fullItems = h.buildFavoriteAdjustItems(h.buildFavoritesListItemFromEntry(reopened), true)
      assert.equal(fullItems[0].servings, 1)
      assert.equal(h.calculateFavoriteAdjustTotals(portionMealItems(fullItems, scale)).calories, 499 * scale)
      const again = await save(scale, kind, fullItems)
      assert.equal(again.payload.nutrition.calories, Math.round(499 * scale))
      assert.equal(again.payload.nutrition.__portionScale, scale)
    }
  }
  const invalid = await save(null)
  assert.equal(invalid.payload, undefined)
  assert.equal(invalid.failure, 'Check portion amount')
  const favorite = h.normalizeFavoriteMeal({ ...fixture, label: fixture.name })
  const favoriteRecord = h.favoriteStorageRecord(favorite)
  assert.equal(favoriteRecord.items[0].servings, 1)
  assert.equal(favoriteRecord.nutrition.__portionScale, 0.5)
  assert.equal(h.normalizeFavoriteMeal(favoriteRecord).nutrients.calories, 250)
  // The actual Add to diary handler preserves a favorite's full basis and selected
  // summary. Ingredient-level adjustment instead stores its already-eaten basis.
  for (const adjusted of [false, true]) {
    let created
    const favoriteList = h.buildFavoritesListItemFromFavorite(favorite)
    const context = {
      ...h, savedMealPortion: load(path.join(root, 'native/src/lib/mealPortions.ts')).savedMealPortion, favoritesTargetMeal: 'lunch', selectedDate: '2026-10-15',
      optionalNutrient: load(path.join(root, 'native/src/lib/nutrientValues.ts')).optionalNutrient,
      roundOptionalNutrient: load(path.join(root, 'native/src/lib/nutrientValues.ts')).roundOptionalNutrient,
      round1: (value) => Math.round(value * 10) / 10,
      setEntries: () => {}, setExpandedMeals: () => {}, closeFavoritesFlow: () => {}, markFavoriteAsUsed: () => {}, loadAll: () => {},
      createFoodEntry: async (payload) => { created = payload; return true },
      Alert: { alert: () => { throw new Error('Unexpected failed favorite addition') } }, setTimeout: () => {},
      module: { exports: {} }, Date, Number, String, JSON, Math,
    }
    vm.runInNewContext(handlerCode('addFavoriteToDiary'), context)
    await context.module.exports(favoriteList, adjusted ? h.buildFavoriteAdjustItems(favoriteList) : undefined)
    assert.equal(created.nutrition.calories, 250)
    assert.equal(created.nutrition.__portionScale, adjusted ? 1 : 0.5)
    assert.equal(created.items[0].servings, adjusted ? 0.5 : 1)
    assert.equal(h.normalizeFoodApiEntry({ ...created, nutrients: created.nutrition }).nutrients.calories, 250)
    assert.equal(created.items[0].source, 'usda')
  }
  // Reopening retains the saved preset/units and authoritative original scale.
  for (const meta of [fixture.nutrition, { ...fixture.nutrition, __portionAmount: 150, __portionUnit: 'g' }, { ...fixture.nutrition, __portionAmount: 1, __portionRecipeServings: 4, __portionScale: 0.25 }]) {
    const state = {}
    const context = { ...h, savedMealPortion: load(path.join(root, 'native/src/lib/mealPortions.ts')).savedMealPortion, recipeServingsAppliedRef: { current: 1 }, formatEditorTime: () => '12:23', module: { exports: {} }, Number, String }
    for (const setter of handlerCode('openFavoriteEditor').matchAll(/\b(set[A-Z]\w*)\(/g)) context[setter[1]] = (value) => { state[setter[1]] = value }
    vm.runInNewContext(handlerCode('openFavoriteEditor'), context)
    context.module.exports(h.buildFavoritesListItemFromEntry(h.normalizeFoodApiEntry({ ...fixture, nutrition: meta })))
    assert.equal(state.setFavoriteEditSavedScale, meta.__portionScale)
    assert.equal(state.setFavoriteEditPortionUnit, meta.__portionUnit)
    assert.equal(Number(state.setFavoriteEditPortionAmount), meta.__portionAmount)
    assert.equal(state.setFavoriteEditRecipeServings, meta.__portionRecipeServings)
    assert.equal(state.setFavoriteEditItems[0].servings, 1)
  }
  const recipe = { title: 'Measured recipe', servings: 4, ingredients: ['100 g chicken'], steps: ['Cook'], sourceUrl: 'https://example.invalid/recipe' }
  const recipeItems = [{ ...fixture.items[0], calories: 1000 }]
  const makeRecipeRow = (scale) => ({ ...fixture, items: clone(recipeItems), nutrition: { ...fixture.nutrition, calories: Math.round(1000 * scale), __importRecipe: recipe, __portionScale: scale, __portionAmount: scale * 4, __portionRecipeServings: 4 } })
  function openRecipeRow(row) {
    const state = {}
    const context = { ...h, savedMealPortion: load(path.join(root, 'native/src/lib/mealPortions.ts')).savedMealPortion, recipeServingsAppliedRef: { current: 1 }, formatEditorTime: () => '12:23', module: { exports: {} }, Number, String }
    for (const setter of handlerCode('openFavoriteEditor').matchAll(/\b(set[A-Z]\w*)\(/g)) context[setter[1]] = (value) => { state[setter[1]] = value }
    vm.runInNewContext(handlerCode('openFavoriteEditor'), context)
    context.module.exports(h.buildFavoritesListItemFromEntry(h.normalizeFoodApiEntry(row)))
    return state
  }
  for (const scale of [0.25, 0.5, 2]) {
    const row = makeRecipeRow(scale)
    const original = JSON.stringify(row)
    const opened = openRecipeRow(row)
    assert.equal(opened.setRecipeServingsEaten, String(scale * 4), 'web portion restores eaten recipe servings without native metadata')
    assert.equal(opened.setFavoriteEditItems[0].servings, 1, 'web full recipe basis retained')
    const ratioContext = { mealRecipe: opened.setMealRecipe, recipeServingsEaten: opened.setRecipeServingsEaten, recipePortionRatio: h.recipePortionRatio, Number, module: { exports: {} } }
    vm.runInNewContext(handlerCode('favoriteEditPortionScale'), ratioContext)
    const restoredScale = ratioContext.module.exports
    assert.equal(restoredScale, scale)
    assert.equal(h.calculateFavoriteAdjustTotals(portionMealItems(opened.setFavoriteEditItems, restoredScale)).calories, 1000 * scale)
    const saved = await save(restoredScale, 'builder', opened.setFavoriteEditItems, recipe, opened.setRecipeServingsEaten)
    assert.equal(saved.payload.nutrition.calories, 1000 * scale)
    assert.equal(saved.payload.nutrition.__portionScale, scale)
    assert.equal(saved.payload.nutrition.__portionRecipeServings, 4)
    assert.equal(saved.payload.items[0].servings, 1)
    assert.equal(saved.payload.items[0].__amount, 100)
    assert.equal(saved.payload.nutrition.fiber, null)
    assert.equal(saved.payload.nutrition.sugar, 0)
    assert.deepEqual(clone(saved.payload.nutrition.__importRecipe), recipe)
    assert.equal(h.normalizeFoodApiEntry(saved.payload).nutrients.calories, 1000 * scale)
    const reopened = openRecipeRow(saved.payload)
    assert.equal(reopened.setRecipeServingsEaten, String(scale * 4))
    assert.equal(reopened.setFavoriteEditItems[0].servings, 1)
    assert.equal(JSON.stringify(row), original)
  }
  const legacyRecipeRow = makeRecipeRow(1)
  legacyRecipeRow.items = [{ ...recipeItems[0], servings: 0.25, __amount: 25 }]
  legacyRecipeRow.nutrition = { ...legacyRecipeRow.nutrition, calories: 250, __nativeRecipeServingsEaten: 1, __portionScale: 1, __portionControlEnabled: false }
  const legacyOriginal = JSON.stringify(legacyRecipeRow)
  const legacyOpened = openRecipeRow(legacyRecipeRow)
  assert.equal(legacyOpened.setRecipeServingsEaten, '1')
  assert.equal(legacyOpened.setFavoriteEditItems[0].servings, 1)
  assert.equal(legacyOpened.setFavoriteEditItems[0].amountInput, '100')
  assert.equal(h.calculateFavoriteAdjustTotals(portionMealItems(legacyOpened.setFavoriteEditItems, 0.25)).calories, 250)
  const legacyResaved = await save(0.25, 'builder', legacyOpened.setFavoriteEditItems, recipe, '1')
  assert.equal(legacyResaved.payload.nutrition.calories, 250)
  assert.equal(openRecipeRow(legacyResaved.payload).setFavoriteEditItems[0].servings, 1)
  assert.equal(JSON.stringify(legacyRecipeRow), legacyOriginal)
  for (const unit of ['g', 'oz']) {
    const state = {}
    const context = { ...h, savedMealPortion: load(path.join(root, 'native/src/lib/mealPortions.ts')).savedMealPortion, recipeServingsAppliedRef: { current: 1 }, formatEditorTime: () => '12:23', module: { exports: {} }, Number, String }
    for (const setter of handlerCode('openFavoriteEditor').matchAll(/\b(set[A-Z]\w*)\(/g)) context[setter[1]] = (value) => { state[setter[1]] = value }
    vm.runInNewContext(handlerCode('openFavoriteEditor'), context)
    context.module.exports(h.buildFavoritesListItemFromEntry(h.normalizeFoodApiEntry({ ...fixture, nutrition: { ...fixture.nutrition, __portionUnit: unit, __portionAmount: undefined } })))
    assert.equal(state.setFavoriteEditSavedScale, 0.5)
    assert.equal(state.setFavoriteEditPortionUnit, unit)
    assert.equal(Number(state.setFavoriteEditPortionAmount), 150 / (unit === 'oz' ? 28.349523125 : 1))
  }
  for (const [raw, expectedSource, expectedId] of [
    [{ source: 'usda', id: 'generated:meal:123', __source: 'fatsecret', __sourceId: '456' }, 'fatsecret', '456'],
    [{ source: 'usda', id: 'generated:meal:123', nutritionProvenance: { provider: 'usda', recordId: '789' } }, 'usda', '789'],
    [{ source: 'usda', foodId: '111', id: 'generated:meal:123', nutritionProvenance: { provider: 'fatsecret', recordId: 'wrong' } }, 'usda', '111'],
    [{ source: 'usda', foodId: '111', id: 'generated:meal:123' }, 'usda', '111'],
  ]) {
    const identity = h.servingLookupForFavoriteAdjustItem({ raw })
    assert.equal(identity.source, expectedSource)
    assert.equal(identity.id, expectedId)
  }
  assert.equal(h.servingLookupForFavoriteAdjustItem({ raw: { source: 'usda', id: 'fatsecret:123' } }), null)
  for (const title of ['Photo analyzed meal', 'My special meal']) {
    const state = {}
    const context = { ...h, savedMealPortion: load(path.join(root, 'native/src/lib/mealPortions.ts')).savedMealPortion, recipeServingsAppliedRef: { current: 1 }, formatEditorTime: () => '12:23', module: { exports: {} }, Number, String }
    for (const setter of handlerCode('openFavoriteEditor').matchAll(/\b(set[A-Z]\w*)\(/g)) context[setter[1]] = (value) => { state[setter[1]] = value }
    vm.runInNewContext(handlerCode('openFavoriteEditor'), context)
    context.module.exports(h.buildFavoritesListItemFromEntry(h.normalizeFoodApiEntry({ ...fixture, name: title })))
    if (title === 'My special meal') assert.equal(state.setFavoriteEditName, title)
    else { assert.notEqual(state.setFavoriteEditName, title); assert.match(state.setFavoriteEditName, /chicken/i) }
  }
  // Evaluate the actual disabled predicate and rendered Save button props.
  let saveDisabledExpression, saveButton
  function findSaveButton(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'favoriteEditSaveDisabled') saveDisabledExpression = node.initializer.getText(ast)
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'Pressable' && node.openingElement.getText(ast).includes('updateFavoriteFromEditor()')) saveButton = node.getText(ast)
    ts.forEachChild(node, findSaveButton)
  }
  findSaveButton(ast)
  assert.ok(saveDisabledExpression && saveButton)
  for (const values of [
    { scale: null, items: editorItems, disabled: true },
    { scale: 1, items: [], disabled: true },
    { scale: 1, items: [{ ...editorItems[0], servings: 0 }], disabled: true },
    { scale: 1, items: [{ ...editorItems[0], servings: Number.NaN }], disabled: true },
    { scale: 2, items: editorItems, disabled: false },
    { scale: 0.5, items: editorItems, disabled: false },
  ]) {
    const context = {
      favoriteEditPortionScale: values.scale, favoriteEditItems: values.items, mealRecipe: null, recipeServingsEaten: '1',
      React: { createElement: (type, props, ...children) => ({ type, props, children }) },
      Pressable: 'Pressable', Text: 'Text', primaryButton: {}, primaryButtonText: {},
      mealBuilderOpen: true, favoriteEditItem: null, updateFavoriteFromEditor: () => {}, Number,
    }
    vm.createContext(context)
    context.favoriteEditSaveDisabled = vm.runInContext(ts.transpile(saveDisabledExpression, { target: ts.ScriptTarget.ES2020 }), context)
    const button = vm.runInContext(ts.transpile('(' + saveButton + ')', { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React }), context)
    assert.equal(button.props.disabled, values.disabled)
    assert.equal(button.props.accessibilityState.disabled, values.disabled)
    assert.equal(Boolean(button.props.style[1]), values.disabled)
  }
  const options = h.normalizeFavoriteServingOptions([{ id: 'three-ounce', label: 'oz', serving_size: 'oz', grams: 85, calories: 203.15, protein_g: 22.95, carbs_g: 0, fat_g: 11.9, fiber_g: null, sugar_g: 0, foodName: 'Chicken meat and skin, cooked, roasted' }])
  assert.equal(options[0].label, '85 g')
  assert.equal(options[0].grams, 85)
  assert.equal(options[0].calories, 203.15)
  assert.equal(options[0].foodName, 'Chicken meat and skin, cooked, roasted')
  assert.equal(JSON.stringify(fixture), unchanged)
  console.log('PASS: actual native preview/save/reopen/full/half/double/favorites/null-zero/grams-oz/invalid controls and recorded85g serving')
})().catch((error) => { console.error(error); process.exitCode = 1 })
