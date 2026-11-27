const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function run(readSource = file => fs.readFileSync(file, 'utf8')) {
  const groups = []
  function symbols(file, names, globals = {}) {
    const ast = ts.createSourceFile(file, readSource(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    assert.equal(ast.parseDiagnostics.length, 0, `${file} must parse`)
    const found = new Map()
    function visit(node) {
      if (ts.isFunctionDeclaration(node) && node.body && names.includes(node.name?.text)) found.set(node.name.text, node.getText(ast).replace(/^export\s+/, ''))
      if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) found.set(node.name.getText(ast), 'const ' + node.getText(ast) + ';')
      ts.forEachChild(node, visit)
    }
    visit(ast)
    for (const name of names) assert.ok(found.has(name), `Actual ${file}:${name} exists`)
    const context = vm.createContext(globals)
    vm.runInContext(ts.transpileModule([...found.values()].join('\n') + '\nthis.api={' + names.join(',') + '}', { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context)
    return { ...context.api, context }
  }
  function load(file, mocks = {}) {
    const module = { exports: {} }
    vm.runInNewContext(ts.transpileModule(readSource(file), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
      module, exports: module.exports, require: name => { assert.ok(name in mocks, `Unexpected import ${name}`); return mocks[name] },
    })
    return module.exports
  }
  const nutrients = load('native/src/lib/nutrientValues.ts'), portions = load('native/src/lib/mealPortions.ts')
  const editorPortions = load('native/src/lib/mealPortionEditor.ts'), units = load('native/src/lib/foodUnits.ts')
  const diary = load('native/src/lib/foodDiaryEntries.ts', { './mealPortions': portions, './nutrientValues': nutrients })
  const core = load('lib/daily-targets.ts')
  const web = symbols('app/food/page.tsx', ['parseServingQuantity','singularizeUnitLabel','parseServingUnitMetadata','DISCRETE_UNIT_KEYWORDS','isDiscreteUnitLabel','piecesMultiplierForServing','macroMultiplierForItem','effectiveServings','recalculateNutritionFromItems'], { ...nutrients, foodNumberOrNull: nutrients.optionalNutrient })
  const native = symbols('native/src/screens/TrackCaloriesScreen.tsx', ['round1','numberOrZero','normalizeFavoriteLabel','normalizeFavoriteAmountUnit','parseServingBaseForFavorite','favoriteAmountStateFromRaw','favoriteBaseForItem','convertFavoriteBaseAmount','favoriteAmountFromServings','favoriteAmountInBase','favoriteServingsFromAmount','formatFavoriteAmount','favoriteAmountUnitLabel','isOpenMeasurementServing','hasServingOptionMacroData','normalizeFavoriteServingOptions','findSelectedServingId','favoriteAdjustPersistenceFields','updateFavoriteAdjustItemAmount','calculateFavoriteAdjustTotals','cloneFavoriteItems','buildFavoriteAdjustItems','servingOptionBase','servingOptionDisplayLabel','servingOptionGrams','nextServingsForServingOption','applyServingOptionToFavoriteAdjustItem','updateFavoriteEditIngredientNutrient','cloneEntryItemsForSave','formatNutrientGrams','CircleMetric','clamp'], {
    ...nutrients, ...units, ...diary, ...portions, React: { createElement: (type, props, ...children) => ({ type, props, children }) }, Text: 'Text', View: 'View', theme: { colors: { muted: 'neutral' } },
  })
  const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} versus ${b}`)
  const item = extra => ({ id: 'original-source', name: 'Beef patty', serving_size: '1 patty (115 g)', servings: 1, calories: 250, protein_g: 22, carbs_g: 0, fat_g: 18, fiber_g: null, sugar_g: 0, ...extra })
  const vectors = [
    [item({ piecesPerServing: 2, customGramsPerServing: 230, weightAmount: 230, weightUnit: 'g' }), 500],
    [item({ name: 'Carrot', serving_size: '1 medium (200 g)', piecesPerServing: 6, calories: 82, customGramsPerServing: 1200, weightAmount: 1200, weightUnit: 'g' }), 492],
    [item({ name: 'Milk', serving_size: '100 ml', calories: 61.8, customMlPerServing: 100, weightAmount: 100, weightUnit: 'ml' }), 61.8],
    [item({ name: 'Original ounce food', serving_size: '1 oz', calories: 100, weightAmount: 1, weightUnit: 'oz' }), 100],
    [item({ serving_size: '1 patty', piecesPerServing: 2 }), 500],
    [item({ serving_size: '2 patties (230 g)', piecesPerServing: 2, calories: 500, customGramsPerServing: 230 }), 500],
    [item({ piecesPerServing: 2, calories: 500, nutritionCoversServing: true, customGramsPerServing: 230 }), 500],
    [item({ name: 'Crackers', serving_size: '10 g (6 crackers)', piecesPerServing: 6, calories: 40, customGramsPerServing: 10 }), 40],
  ]
  function persist(rows) {
    return rows.map(row => ({ ...row.raw, name: row.name, label: row.name, serving_size: row.servingLabel, servings: row.servings, ...native.favoriteAdjustPersistenceFields(row), calories: row.calories, protein_g: row.protein, carbs_g: row.carbs, fat_g: row.fat, fiber_g: row.fiber, sugar_g: row.sugar }))
  }
  for (const [source, expected] of vectors) {
    const original = JSON.stringify(source)
    for (const scale of [.5, 1, 2]) {
      const raw = { id: 'fixture-log', name: source.name, items: [source], nutrients: { calories: expected * scale, __portionScale: scale } }
      const loaded = diary.normalizeFoodApiEntry(raw)
      assert.equal(loaded.nutrients.calories, Math.round(expected * scale))
      const whole = native.buildFavoriteAdjustItems({ id: 'fixture-row', label: source.name, entry: loaded }, true)
      const totals = native.calculateFavoriteAdjustTotals(editorPortions.portionMealItems(whole, scale))
      close(totals.calories, expected * scale, 'editor portion totals')
      assert.equal(totals.fiber, null); assert.equal(totals.sugar, 0)
      const saved = { ...raw, items: persist(whole), nutrients: { calories: Math.round(totals.calories), __portionScale: scale } }
      const reopened = diary.normalizeFoodApiEntry(saved)
      assert.equal(reopened.nutrients.calories, Math.round(expected * scale))
      assert.equal(Math.round(web.recalculateNutritionFromItems(saved.items).calories * scale), Math.round(expected * scale))
      assert.equal(saved.items[0].id, source.id); assert.equal(saved.items[0].calories, source.calories)
      assert.equal(saved.items[0].servings, source.servings); assert.equal(saved.items[0].piecesPerServing, source.piecesPerServing)
      assert.equal(saved.items[0].serving_size, source.serving_size)
      if (source.customGramsPerServing) assert.equal(saved.items[0].customGramsPerServing, source.customGramsPerServing)
      if (source.customMlPerServing) assert.equal(saved.items[0].customMlPerServing, source.customMlPerServing)
      assert.equal(saved.nutrients.__portionScale, scale)
      assert.equal(JSON.stringify(portions.materializeMealPortion(portions.materializeMealPortion(saved))), JSON.stringify(portions.materializeMealPortion(saved)))
    }
    assert.equal(JSON.stringify(source), original)
  }
  groups.push('Actual web/native diary, whole editor, half/full/double portions and no-op save/reopen agree; original source and one portion scale retained')
  for (const [source, expected] of vectors.slice(0, 4)) {
    let row = native.buildFavoriteAdjustItems({ id: 'fixture', label: source.name, favorite: { items: [source] } })[0]
    const originalAmount = Number(row.amountInput)
    for (const factor of [.5, 1, 2, 1]) {
      row = native.updateFavoriteAdjustItemAmount(row, String(originalAmount * factor))
      close(native.calculateFavoriteAdjustTotals([row]).calories, expected * factor, 'physical edit amount')
      const saved = persist([row])[0]
      row = native.buildFavoriteAdjustItems({ id: 'fixture', label: source.name, favorite: { items: [saved] } })[0]
      close(native.calculateFavoriteAdjustTotals([row]).calories, expected * factor, 'physical amount reopen')
    }
  }
  assert.equal(diary.nutritionServingMultiplier(item({ piecesPerServing: 2, macroMultiplier: 2 })), 2, 'explicit factor is not applied twice')

  assert.equal(native.favoriteAmountUnitLabel('serving', { servingLabel: '1 patty', raw: { serving_size: '1 patty', piecesPerServing: 2 } }), '2 × 1 patty')
  assert.equal(native.favoriteAmountUnitLabel('serving', { servingLabel: '1 cup', raw: {} }), '1 cup')
  assert.equal(native.favoriteAmountUnitLabel('g', { servingLabel: '1 patty', raw: { piecesPerServing: 2 } }), 'g')
  groups.push('Actual gram/ml/oz changes and reopen preserve the full-set denominator; explicit count factors apply once')
  {
    const source = vectors[0][0]
    const before = JSON.stringify(source)
    const row = native.buildFavoriteAdjustItems({ id: 'fixture', label: source.name, favorite: { items: [source] } })[0]
    let rows = [row]
    native.context.setFavoriteEditItems = fn => { rows = fn(rows) }
    native.updateFavoriteEditIngredientNutrient(row.id, 'calories', '600')
    close(rows[0].calories, 300, 'editing total divides by count factor')
    close(native.calculateFavoriteAdjustTotals(rows).calories, 600, 'edited total agrees')
    native.updateFavoriteEditIngredientNutrient(row.id, 'fiber', '')
    assert.equal(rows[0].fiber, null)
    const copied = native.cloneEntryItemsForSave({ items: [source] }, '', { calories: 500, protein: 44, carbs: 0, fat: 36, fiber: null, sugar: 0 })
    assert.equal(copied[0].calories, 250); assert.equal(copied[0].piecesPerServing, 2); assert.equal(copied[0].fiber_g, null)
    const option = { id: 'actual-100g-option', label: '100 g', grams: 100, calories: 217.3913043478261, protein_g: 19.130434782608695, carbs_g: 0, fat_g: 15.652173913043478, fiber_g: null, sugar_g: 0 }
    const selected = native.applyServingOptionToFavoriteAdjustItem(row, option, [option])
    assert.equal(diary.nutritionServingMultiplier(selected.raw), 1)
    close(native.calculateFavoriteAdjustTotals([selected]).calories, option.calories * selected.servings, 'new source serving cannot retain old grouping')
    assert.equal(JSON.stringify(source), before)
  }
  groups.push('Actual nutrient edits, existing-entry total division and selected serving options retain correct counts, precision and unknown-versus-zero')
  {
    const labels = ['1 patty (115 g)','2 patties (230 g)','10 g (6 crackers)','1 medium (200 g)','2 carrots','100 g','1 cup','2 cups','1 1/2 crackers','1/2 cracker','100 g (estimated equivalent of 3 eggs)']
    for (const label of labels) for (const pieces of [1,2,6]) {
      const record = item({ serving_size: label, piecesPerServing: pieces })
      assert.equal(diary.nutritionServingMultiplier(record), web.macroMultiplierForItem(record), label)
      assert.equal(diary.nutritionServingMultiplier({ ...record, nutritionCoversServing: true }), 1)
    }
  }
  groups.push('Shared native multiplier matches the unchanged web rule for measured, counted and fractional labels; whole-serving nutrition is never recounted')
  {
    // Existing recorded-count/restaurant fixture payload fields only; no voice/API code runs.
    // References: voice-recorded-counted-serving-check.cjs recorded 70-kcal egg/2-count case;
    // voice-restaurant-food-integrity-check.cjs recorded six nuggets/300-kcal whole-serving case.
    const recordedEgg = { id: 'recorded-egg', name: 'Egg, whole, cooked, fried', serving_size: '1 large egg (50 g)', selectedServingId: 'recorded-large-egg', calories: 70, protein_g: 7, carbs_g: 3, fat_g: 1.4, fiber_g: null, sugar_g: 0 }
    const recordedNuggets = { id: 'six-nuggets', name: '6 Piece Chicken McNuggets', brand: "McDonald's", country: 'AU', serving_size: '6 pieces', calories: 300, protein_g: 18, carbs_g: 18, fat_g: 18, fiber_g: null, sugar_g: 0 }
    for (const [source, whole, pieces] of [[recordedEgg, 140, 2],[recordedNuggets, 300, 6]]) {
      const sourceBefore = JSON.stringify(source)
      for (const sourceFactor of [undefined, 2]) for (const scale of [.5,1,2]) {
        const food = { ...source, calories: whole, protein_g: source.protein_g * whole / source.calories, carbs_g: source.carbs_g * whole / source.calories, fat_g: source.fat_g * whole / source.calories, servings: 1, nutritionCoversServing: true, piecesPerServing: pieces, ...(sourceFactor ? { macroMultiplier: sourceFactor } : {}), requestedAmount: `${pieces} each`, estimatedPortion: false, __voiceSourceFood: source }
        assert.equal(diary.nutritionServingMultiplier(food), 1)
        const loaded = diary.normalizeFoodApiEntry({ id: 'saved-counted-meal', items: [food], nutrients: { calories: whole * scale, __portionScale: scale } })
        assert.equal(loaded.nutrients.calories, whole * scale)
        assert.equal(web.recalculateNutritionFromItems([food]).calories * scale, whole * scale)
        const rows = native.buildFavoriteAdjustItems({ id: 'saved-counted-meal', label: source.name, entry: loaded }, true)
        assert.equal(native.calculateFavoriteAdjustTotals(editorPortions.portionMealItems(rows, scale)).calories, whole * scale)
        assert.equal(JSON.stringify(rows[0].raw.__voiceSourceFood), sourceBefore)
      }
      assert.equal(JSON.stringify(source), sourceBefore)
    }
  }
  groups.push('Existing recorded-count and restaurant whole-serving metadata stays unchanged and is not double-scaled on native read/editor portions; no voice execution')
  const targetSymbols = symbols('native/src/screens/TrackCaloriesScreen.tsx', ['DEFAULT_TARGETS','normalizeMacroSplit','buildDailyTargetsFromUserData'], { ...nutrients, calculateDailyTargets: core.calculateDailyTargets })
  const profile = { gender: 'male', birthdate: '1990-01-01', weight: 70, height: 175, goalChoice: 'lose', goalCalorieTarget: 2200, goalMacroSplit: { proteinPct: .3, carbPct: 0, fatPct: .7 }, goalFiberTarget: 0, goalSugarMax: 0 }
  const targets = targetSymbols.buildDailyTargetsFromUserData(profile)
  assert.equal(targets.calories, 2200); assert.equal(targets.carbs, 0); assert.equal(targets.fiber, 0); assert.equal(targets.sugar, 0)
  const missing = targetSymbols.buildDailyTargetsFromUserData({})
  assert.ok(Object.values(missing).every(value => value === null))
  assert.ok(Object.values(targetSymbols.DEFAULT_TARGETS).every(value => value === null))
  const ast = ts.createSourceFile('screen.tsx', readSource('native/src/screens/TrackCaloriesScreen.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function hook(name) {
    let found
    function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer; ts.forEachChild(node, visit) }
    visit(ast); assert.ok(found)
    const expression = ts.isCallExpression(found) ? found.arguments[0] : found
    return ts.transpileModule('this.result=(' + expression.getText(ast) + ')()', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  }
  const targetContext = vm.createContext({ ...nutrients, round1: native.round1, dailyTargets: missing, exerciseCalories: 200, usedKcal: 100 })
  vm.runInContext(hook('macroTargetsWithExercise'), targetContext); assert.ok(Object.values(targetContext.result).every(value => value === null))
  vm.runInContext(hook('dailyAllowanceKcal'), targetContext); assert.equal(targetContext.result, null)
  targetContext.dailyAllowanceKcal = null
  vm.runInContext(hook('remainingKcal'), targetContext); assert.equal(targetContext.result, null)
  targetContext.dailyTargets = targets
  vm.runInContext(hook('dailyAllowanceKcal'), targetContext); assert.equal(targetContext.result, 2400)
  targetContext.dailyAllowanceKcal = 2400
  vm.runInContext(hook('remainingKcal'), targetContext); assert.equal(targetContext.result, 2300)
  const tree = native.CircleMetric({ value: null, label: 'REMAINING', color: 'green', unit: 'kj' })
  assert.ok(JSON.stringify(tree).includes('—')); assert.ok(!JSON.stringify(tree).includes('NaN'))
  groups.push('Actual zero targets remain zero; missing profile/defaults and calorie allowance stay unknown even with exercise; local metric renders a dash')
  {
    const text = readSource('native/src/screens/TrackCaloriesScreen.tsx')
    const start = text.indexOf('                  const safeTarget = Math.max(0, Number(row.target) || 0)')
    const end = text.indexOf('                  const fatTotal', start)
    assert.ok(start > 0 && end > start)
    function display(row) {
      const context = vm.createContext({ row, clamp: native.clamp })
      vm.runInContext(text.slice(start,end) + '\nthis.result={unknown,over,percentLabel,usedWidth}', context)
      return context.result
    }
    assert.equal(display({ consumed: 5, target: null }).percentLabel, '—')
    assert.equal(display({ consumed: 5, target: 0 }).over, true)
    assert.equal(display({ consumed: 5, target: 0 }).percentLabel, '—')
    assert.equal(display({ consumed: 0, target: 0 }).over, false)
  }
  groups.push('Actual macro display distinguishes unknown targets from zero caps and never invents a numeric percentage for either')
  const builder = symbols('app/food/build-meal/MealBuilderClient.tsx', ['round3','macroOrZero','computeServingsFromAmount','computeItemTotals'], { ...nutrients, getFoodUnitGrams: () => ({}) })
  for (const calories of [0,null,undefined,127.2]) {
    const record = item({ servings: 2, calories, protein_g: 1, carbs_g: 0, fat_g: 0 })
    const expected = calories == null ? 8 : calories * 2
    close(builder.computeItemTotals(record).calories, expected, 'declared energy')
    assert.equal(builder.computeItemTotals(record).fiber, null); assert.equal(builder.computeItemTotals(record).sugar, 0)
  }
  groups.push('Actual web builder preserves declared zero and precision, estimates only missing energy, and retains optional unknowns')
  return groups
}
module.exports = { run }
if (require.main === module) {
  try { for (const group of run()) console.log('PASS ' + group) }
  catch (error) { console.error(error); process.exitCode = 1 }
}
