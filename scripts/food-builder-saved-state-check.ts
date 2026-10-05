import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import { DRY_FOOD_MEASUREMENTS } from '../lib/food/dry-food-measurements'
import { PRODUCE_MEASUREMENTS } from '../lib/food/produce-measurements'
import { DAIRY_SEMI_SOLID_MEASUREMENTS } from '../lib/food/dairy-semi-solid-measurements'
import * as nutrients from '../lib/food/nutrient-values'
import { convertFoodAmount, liquidDensity, liquidHouseholdMl, parseFoodServing } from '../native/src/lib/foodUnits'

const path = 'app/food/build-meal/MealBuilderClient.tsx'
const source = ts.createSourceFile(path, process.argv.includes('--baseline') ? execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' }) : fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const ctx = vm.createContext({ DRY_FOOD_MEASUREMENTS, PRODUCE_MEASUREMENTS, DAIRY_SEMI_SOLID_MEASUREMENTS, ...nutrients, convertFoodAmount, liquidDensity, liquidHouseholdMl, parseFoodServing, useCallback: (fn: any) => fn, useMemo: (fn: any) => fn(), console })
const top = source.statements.filter(n => !ts.isImportDeclaration(n) && !(ts.isFunctionDeclaration(n) && n.name?.text === 'MealBuilderClient')).map(n => n.getText(source)).join('\n')
vm.runInContext(ts.transpile(top, { target: ts.ScriptTarget.ES2020 }), ctx)
function actual(name: string) {
  let text = ''
  const visit = (n: ts.Node) => { if (ts.isVariableDeclaration(n) && n.name.getText(source) === name && n.initializer) text = n.initializer.getText(source); ts.forEachChild(n, visit) }
  visit(source); assert.ok(text, `Actual ${name} exists`)
  return vm.runInContext(ts.transpile(`(${text})`, { target: ts.ScriptTarget.ES2020 }), ctx)
}
function effect(marker: string) {
  let text = ''
  const visit = (n: ts.Node) => { if (ts.isCallExpression(n) && n.expression.getText(source) === 'useEffect' && n.arguments[0]?.getText(source).includes(marker)) text = n.arguments[0].getText(source); ts.forEachChild(n, visit) }
  visit(source); assert.ok(text, `Actual effect ${marker} exists`)
  return vm.runInContext(ts.transpile(`(${text})`, { target: ts.ScriptTarget.ES2020 }), ctx)
}
const oil = { id: 'oil', name: 'Oil, olive, salad or cooking', serving_size: '100 ml', calories: 813.28, protein_g: 0, carbs_g: 0, fat_g: 92, fiber_g: 0, sugar_g: 0, servings: .2, __baseAmount: 100, __baseUnit: 'ml', __unit: 'ml', __amount: 20, __amountInput: '20', __measurementCountry: 'AU' }
const milk = { ...oil, id: 'milk', name: 'Milk, whole, 3.25% milkfat, with added vitamin D', calories: 61.8, protein_g: 3.3784, carbs_g: 4.8101, fat_g: 3.296, fiber_g: null, sugar_g: 4.9543, servings: 1, __amount: 100, __amountInput: '100' }
const original = '2026-10-05T03:22:47.125Z'
const clock = vm.runInContext('extractTimeFromTimestamp', ctx)(original)
Object.assign(ctx, { items: [oil, milk], itemsRef: { current: [oil, milk] }, isDiaryEdit: true, sourceLogId: 'fixture', loadedFavoriteId: 'log:fixture', savingMeal: false, mealName: 'Measured meal', linkedFavoriteId: '', selectedDate: '2026-10-05', category: 'lunch', entryTime: clock, sourceCreatedAtRef: { current: original }, portionUnit: 'g', portionAmountInput: '60.7', portionInputRef: { current: { value: '60.7' } }, recipeServingsForPortion: null, sanitizeMealTitle: (x: string) => x, buildDefaultMealName: () => 'Measured meal', portionControlEnabled: true, savedPortionScale: .5, portionScaleOverriddenByUser: false, editFavoriteId: '', totalRecipeWeightForSave: 121.4, portionWeightForSave: 60.7, portionScaleForSave: .5, portionAmountNumeric: 60.7 })
let failures = 0
async function check(name: string, test: () => any) { try { await test(); console.log(`PASS: ${name}`) } catch (e: any) { failures++; console.error(`FAIL: ${name}: ${e.message}`) } }
async function run() {
  await check('saved editor waits for original meal time', () => {
    let calls = 0
    Object.assign(ctx, { showEntryTimeOverride: true, entryTime: '', setEntryTime: () => { calls++ } })
    effect('if (!showEntryTimeOverride)')()
    assert.equal(calls, 0, 'saved meal must not prefill current time before loading')
    ctx.sourceLogId = ''; effect('if (!showEntryTimeOverride)')(); assert.equal(calls, 1, 'new favorite addition still gets current time')
    ctx.sourceLogId = 'fixture'; ctx.entryTime = clock
  })
  await check('autosave preserves original exact timestamp and weights', () => {
    ctx.entryTime = clock; ctx.sourceLogId = 'fixture'
    const bundle = actual('buildDiaryAutosaveBundle')()
    assert.equal(bundle.createdAtIso, original)
    assert.equal(bundle.diaryNutrition.__portionTotalWeightG, 121.4)
    assert.equal(bundle.diaryNutrition.__portionWeightG, 60.7)
    assert.equal(bundle.diaryNutrition.calories, 112); assert.equal(bundle.diaryNutrition.fiber, null)
  })
  await check('manual save retains fractional weights and exact ratio', () => {
    ctx.portionScaleForSave = 1 / 3
    const meta = actual('portionMeta')
    assert.equal(meta.__portionTotalWeightG, 121.4); assert.equal(meta.__portionWeightG, 60.7)
    assert.equal(meta.__portionScale, 1 / 3)
    ctx.entryTime = clock; assert.equal(actual('createdAtIso'), original)
  })
  await check('unchanged historical scale is preserved; half/full/double edits use exact mass', () => {
    ctx.savedPortionScale = .333; ctx.portionScaleOverriddenByUser = false
    assert.equal(actual('buildDiaryAutosaveBundle')().diaryNutrition.__portionScale, .333)
    for (const [amount, scale, calories] of [[60.7,.5,112],[121.4,1,224],[242.8,2,449]]) {
      ctx.portionScaleOverriddenByUser = true; ctx.portionInputRef.current.value = String(amount)
      const bundle = actual('buildDiaryAutosaveBundle')()
      assert.equal(bundle.diaryNutrition.__portionScale, scale); assert.equal(bundle.diaryNutrition.calories, calories)
      assert.equal(bundle.diaryNutrition.__portionAmount, amount); assert.equal(bundle.diaryNutrition.fiber, null)
    }
    ctx.savedPortionScale = .5; ctx.portionScaleOverriddenByUser = false; ctx.portionInputRef.current.value = '60.7'
  })
  await check('edited gram portions use measured weight rather than rounded old metadata', () => {
    Object.assign(ctx, { initialPortionTotalWeightRef: { current: 121 }, initialItemsSignatureRef: { current: vm.runInContext('buildItemsSignature(items)', ctx) }, totalRecipeWeightG: 121.4, portionScaleOverriddenByUser: true })
    assert.equal(actual('totalRecipeWeightGForScale'), 121.4)
    ctx.portionScaleOverriddenByUser = false; assert.equal(actual('totalRecipeWeightGForScale'), 121, 'unchanged historical scale basis stays available')
  })
  await check('opening writes nothing; actual time edit autosaves once', async () => {
    let writes = 0, latestBody: any
    const timers: Array<() => any> = []
    Object.assign(ctx, { entryTime: clock, sourceLogId: 'fixture', loadedFavoriteId: 'log:fixture', buildDiaryAutosaveBundle: actual('buildDiaryAutosaveBundle'), lastDiaryAutosaveSignatureRef: { current: '' }, diaryAutosaveBaselineRef: { current: null }, draftAppliedRef: { current: false }, diaryAutosaveTimeoutRef: { current: null }, window: { setTimeout: (fn: any) => { timers.push(fn); return timers.length }, clearTimeout: () => {} }, sessionStorage: { setItem: () => {} }, setAutosaveHint: () => {}, fetch: async (_url: any, options: any) => { writes++; latestBody = JSON.parse(options.body); return { ok: true } } })
    const autosave = effect('lastDiaryAutosaveSignatureRef.current')
    autosave(); for (const timer of timers.splice(0)) await timer()
    assert.equal(writes, 0, 'hydration must not PUT the meal')
    ctx.draftAppliedRef.current = true; ctx.diaryAutosaveBaselineRef.current = null; ctx.lastDiaryAutosaveSignatureRef.current = ''
    autosave(); for (const timer of timers.splice(0)) await timer()
    assert.equal(writes, 0, 'restoring a local draft is also read-only until an edit or explicit Save')
    ctx.entryTime = '15:00'; autosave(); for (const timer of timers.splice(0)) await timer()
    assert.equal(writes, 1); assert.equal(vm.runInContext('extractTimeFromTimestamp', ctx)(latestBody.createdAt), '15:00')
    autosave(); for (const timer of timers.splice(0)) await timer(); assert.equal(writes, 1, 'unchanged render does not duplicate save')
    ctx.items[0].calories = 900; autosave(); for (const timer of timers.splice(0)) await timer()
    assert.equal(writes, 2, 'actual nutrient edits remain autosavable')
    assert.equal(vm.runInContext('extractTimeFromTimestamp', ctx)(latestBody.createdAt), '15:00')
  })
  process.exitCode = failures ? 1 : 0
}
run().catch(() => { console.error('Saved-state source check failed'); process.exitCode = 1 })
