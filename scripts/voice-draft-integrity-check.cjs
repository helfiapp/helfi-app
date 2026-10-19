#!/usr/bin/env node
'use strict'
// Actual-source tests with synthetic food replies only. No app imports, provider
// calls, keys, env files, real accounts or databases are available to this VM.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const allowed = new Set(['lib/native-voice-food-copy.ts', 'lib/native-voice-mood-context.ts', 'lib/native-voice-spoken-quantities.ts', 'lib/native-voice-time.ts', 'native/src/lib/foodUnits.ts', 'lib/food/serving-measurements.ts', 'lib/food/measurement-units.ts', 'lib/food/produce-measurements.ts', 'lib/food/dry-food-measurements.ts', 'lib/food/dairy-semi-solid-measurements.ts'])
const cache = new Map()
function actualMeasurementModule(relative) {
  assert(allowed.has(relative), `Unexpected dependency: ${relative}`)
  if (cache.has(relative)) return cache.get(relative)
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const requireLocal = (request) => request==='crypto'&&relative==='lib/native-voice-food-copy.ts'?require('node:crypto'):actualMeasurementModule(path.posix.normalize(path.posix.join(path.posix.dirname(relative), request)) + '.ts')
  vm.runInNewContext(code, { module, exports: module.exports, require: requireLocal }, { filename: relative })
  cache.set(relative, module.exports)
  return module.exports
}
const measurements = actualMeasurementModule('lib/food/serving-measurements.ts')
const voiceTimes = actualMeasurementModule('lib/native-voice-time.ts')
const spokenQuantities = actualMeasurementModule('lib/native-voice-spoken-quantities.ts')
const moodContext = actualMeasurementModule('lib/native-voice-mood-context.ts')
const source = fs.readFileSync(path.join(root, 'app/api/native/voice-assistant/route.ts'), 'utf8')
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true)
const printer = ts.createPrinter()
const stripped = ast.statements.filter(s => !ts.isImportDeclaration(s)).map(s => printer.printNode(ts.EmitHint.Unspecified, s, ast)).join('\n').replace(/^export\s+/gm, '')
const food = (name, values = {}) => ({ id: `fixture-${name}`, name, serving_size: '100 g', calories: 200, protein_g: 25, carbs_g: 0, fat_g: 10, fiber_g: null, sugar_g: null, ...values })
const fixtures = [food('Water', { serving_size: '100 ml', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }), food('honey', { calories: 304, protein_g: 0.3, carbs_g: 82.4, fat_g: 0, fiber_g: 0, sugar_g: 82.1 }), food('chicken'), food('rice', { calories: 130 }), food('banana', { calories: 89 }), food('whole milk', { calories: 61, protein_g: 3.2, carbs_g: 4.8, fat_g: 3.3, sugar_g: 4.8 }), food('coffee', { serving_size: '100 ml', calories: 1, protein_g: 0.1, carbs_g: 0, fat_g: 0 }), food('sugar', { calories: 400, protein_g: 0, carbs_g: 100, fat_g: 0, fiber_g: 0, sugar_g: 100 }), food('orange juice', { serving_size: '100 ml', calories: 45, protein_g: 0.7, carbs_g: 10, fat_g: 0.1 })]
const ctx = vm.createContext({ Date, URL, Buffer, ...require('./voice-recorded-source-fixture.cjs'), AbortController, setTimeout, clearTimeout, process: { env: {} }, console, resolveHelfiTtsVoice: () => 'marin', assertAiUsageAllowed: () => {}, estimateTranscriptionCostCents: () => 2, logAiUsageEvent: async () => {}, ...measurements, ...voiceTimes, ...spokenQuantities, ...actualMeasurementModule('native/src/lib/foodUnits.ts'),
  ...moodContext,
  ...actualMeasurementModule('lib/native-voice-food-copy.ts'),
  fetch() { throw Error('No network permitted') },
  prisma: { foodLibraryItem: { findMany: async () => [] } },
  searchLocalFoods: async () => [],
  searchCustomFoodMacros: async query => fixtures.filter(item => item.name.toLowerCase() === query.toLowerCase()),
})
vm.runInContext(ts.transpileModule(stripped, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, ctx)
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
let checks = 0
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`) }
async function run() {
  await check('food ounce and pound parsing preserves weight', () => {
    const oz = ctx.parseIngredientPhrase('6 oz chicken'); assert.equal(oz.unit, 'oz'); assert.equal(oz.name, 'chicken')
    close(ctx.estimateIngredientGrams('chicken', 6, 'oz'), 170.09713875)
    close(ctx.estimateIngredientGrams('chicken', 0.5, 'lb'), 226.796185)
  })
  const build = text => ctx.buildVoiceMealDraft({ meal: 'lunch', ingredients: text.map(ctx.parseIngredientPhrase) }, 'Voice test', '2026-10-15')
  await check('name-only corrections cannot seal untrusted nutrition', async () => {
    const forged = { action: 'food_build_meal', transcript: 'Voice test', canConfirm: true, food: { meal: 'lunch', mealName: 'Forged', draftText: '100 g chicken', items: [{ name: 'chicken', calories: 9999 }], nutrition: { calories: 9999 } } }
    const corrected = await ctx.buildReviewedDraftCorrection(forged, 'Call this meal Test meal', '2026-10-15'); assert.equal(corrected.food.nutrition.calories, 200); assert.equal(corrected.food.items[0].id, 'fixture-chicken'); assert.equal(corrected.food.mealName, 'Test meal')
    const invalid = await ctx.buildReviewedDraftCorrection({ ...forged, food: { ...forged.food, draftText: '100 g missing fake ingredient' } }, 'Call this meal Test meal', '2026-10-15'); assert.equal(invalid.canConfirm, false)
  })
  await check('measured meal uses exact source and one scale', async () => { const draft = await build(['6 oz chicken']); assert(draft.canConfirm); close(draft.food.items[0].calories, 340.1942775); assert.equal(draft.food.items[0].nutritionCoversServing, true) })
  await check('unknown optional nutrients remain unknown beside true zero', async () => { const d = await build(['100 g chicken', '8 g sugar']); assert.equal(d.food.nutrition.fiber_g, null); assert.equal(d.food.nutrition.sugar_g, null); assert.equal(d.food.items[1].fat_g, 0); assert.equal(ctx.itemCore({ ...fixtures[0], fiber_g: null, fiber: 0 }, 100).fiber, null) })
  await check('missing ingredient and unsupported measurement cannot confirm partial meal', async () => { for (const parts of [['100 g chicken', '50 g nonexistent-food'], ['100 ml chicken'], ['2 buckets chicken']]) { const d = await build(parts); assert.equal(d.canConfirm, false); assert(d.food.draftText.includes(parts.at(-1))); assert.match(d.confirmationMessage, /Nothing has been saved/) } })
  await check('zero amount and invalid source values cannot confirm', async () => { for (const amount of ['0 g chicken', '0g chicken', '0 ml chicken']) assert.equal((await build([amount])).canConfirm, false); for (const value of [null, '', false, [], {}, -1, NaN]) assert.equal(ctx.hasCoreNutrition({ ...fixtures[0], calories: value }), false) })
  await check('dates resolved from speech with valid calendars', () => { for (const [text, date] of [['on 2026-10-12', '2026-10-12'], ['on October 12 2026', '2026-10-12'], ['on 12 October 2026', '2026-10-12'], ['yesterday', '2026-10-14'], ['tomorrow', '2026-10-16'], ['same lunch as yesterday', '2026-10-15']]) assert.equal(ctx.resolveRequestedActionDate(text, '2026-10-15'), date); assert.equal(ctx.isValidLocalDate('2026-02-30'), false); assert.equal(ctx.applyDraftTiming({ action: 'food_build_meal', canConfirm: true }, 'on 2026-02-30', -660).canConfirm, false) })
  await check('time and device offset persist through correction', () => { assert.equal(ctx.requestedLocalTime('at 7:30 pm'), '19:30'); assert.equal(ctx.requestedLocalTime('at 8 am'), '08:00'); assert.equal(ctx.requestedLocalTime('at 25:00'), null); const d = ctx.applyDraftTiming({ action: 'food_build_meal', localDate: '2026-10-15' }, 'change chicken to 50 g', -660, { action: 'food_build_meal', localTime: '19:30' }, 'Australia/Melbourne', '2026-10-15'); assert.equal(d.localTime, '19:30'); assert.equal(d.tzOffsetMin, -660) })
  await check('reviewed additions do not reset current meal', async () => { const d = await build(['100 g chicken']); assert.equal(ctx.isExplicitNewVoiceCommand('add 50 g rice to this meal'), false); const corrected = await ctx.buildReviewedDraftCorrection(d, 'add 50 g rice to this meal', '2026-10-15'); assert(corrected.canConfirm); assert.equal(corrected.food.items.length, 2); assert.match(corrected.food.draftText, /chicken/); assert.match(corrected.food.draftText, /rice/) })
  const drink = async text => ctx.resolveVoiceDrinkDraft(ctx.tryParseWaterRequest(text, '2026-10-15'))
  await check('natural full volume words and of retain coffee and every addition', async () => {
    const raw = 'Log 250 millilitres of coffee with 50 millilitres of whole milk and two teaspoons of sugar for today.'
    const d = await drink(raw); assert(d.canConfirm); assert.deepEqual(Array.from(d.food.items, item => item.requestedName), ['coffee', 'whole milk', 'sugar']); assert.equal(d.food.nutrition.calories, 66); assert.equal(d.water.amountMl, 250)
    for (const text of ['50 millilitres of whole milk', '50 milliliters of whole milk', '1 millilitre of whole milk', '1 milliliter of whole milk']) { const item = ctx.parseIngredientPhrase(text); assert.equal(item.name, 'whole milk'); assert.equal(ctx.normalizeFoodAmountUnit(item.unit), 'ml') }
    assert.equal(Number(ctx.parseIngredientPhrase('quarter tablespoon of olive oil').quantity), 0.25)
  })
  await check('plain water remains hydration only', async () => { const d = await drink('Log 250 ml plain water'); assert(d.canConfirm); assert.equal(d.food, undefined); assert.equal(d.water.amountMl, 250) })
  await check('a cup uses the existing country measure and never guesses an unspecified glass', async () => {
    for (const [country, expected] of [['AU', 250], ['US', 240]]) {
      const d = await ctx.resolveVoiceDrinkDraft(ctx.tryParseWaterRequest('Log a cup of black coffee', '2026-10-15', undefined, country)); assert(d.canConfirm); assert.equal(d.water.amountMl, expected); assert.equal(d.food.items[0].requestedName, 'coffee')
      assert.equal(ctx.parseWaterAmount('half a cup of coffee', country).amountMl, expected / 2)
      assert.equal(ctx.parseWaterAmount('one and a half cups of coffee', country).amountMl, expected * 1.5)
    }
    assert.equal(ctx.tryParseWaterRequest('Log a glass of water', '2026-10-15').canConfirm, false)
    assert.equal(ctx.parseWaterAmount('zero cups water', 'AU'), null)
    const addedMilk = await ctx.resolveVoiceDrinkDraft(ctx.tryParseWaterRequest('Log a cup of black coffee with half a cup of whole milk and no sugar', '2026-10-15', undefined, 'AU')); assert(addedMilk.canConfirm); assert.equal(addedMilk.food.items.length, 2); assert.equal(addedMilk.food.items[1].serving_size, '125 ml')
    const unknownMilk = await drink('Log 250 ml coffee with a splash of milk and no sugar'); assert.equal(unknownMilk.canConfirm, false)
  })
  await check('milk uses its own nutrition with density-correct amount', async () => { const d = await drink('Log 250 ml unsweetened whole milk'); assert(d.canConfirm); assert.equal(d.food.items.length, 1); close(d.food.items[0].calories, 157.075); assert.equal(d.food.nutrition.fiber_g, null) })
  await check('coffee milk sugar all reach reviewed nutrition once', async () => { const d = await drink('Log 250 ml coffee with 50 ml whole milk and 2 teaspoons sugar'); assert(d.canConfirm); assert.equal(d.food.items.length, 3); close(d.food.items[1].calories, 31.415); assert.equal(d.food.nutrition.sugar_g, null); assert.equal(d.food.nutrition.calories, 66) })
  await check('milk removal, milk amount and sugar removal re-resolve drink', async () => { const d = await drink('Log 250 ml coffee with 50 ml whole milk and 2 teaspoons sugar'); const noMilk = await ctx.buildReviewedDraftCorrection(d, 'No milk', '2026-10-15'); assert(noMilk.canConfirm); assert.equal(noMilk.food.items.length, 2); assert(!noMilk.food.items.some(x => /milk/i.test(x.name))); const lessMilk = await ctx.buildReviewedDraftCorrection(d, 'Change the milk to 25 ml', '2026-10-15'); assert(lessMilk.canConfirm); close(lessMilk.food.items.find(x => /milk/i.test(x.name)).calories, 15.7075); const noSugar = await ctx.buildReviewedDraftCorrection(d, 'No sugar', '2026-10-15'); assert(noSugar.canConfirm); assert.equal(noSugar.food.items.length, 2) })
  await check('unclear milk and unresolved drinks cannot confirm', async () => { const d = await drink('Log 250 ml coffee with milk and no sugar'); assert.equal(d.canConfirm, false); assert.match(d.confirmationMessage, /How much milk/); const unknown = await drink('Log 250 ml unsweetened mystery juice'); assert.equal(unknown.canConfirm, false); const cream = await drink('Log 250 ml unsweetened coffee with 2 tablespoons cream'); assert.equal(cream.canConfirm, false); assert.match(cream.food.draftText, /cream/) })
  await check('calorie drinks and explicit addition override base unsweetened wording', async () => { const d = await drink('Log 250 ml unsweetened orange juice'); assert(d.canConfirm); close(d.food.items[0].calories, 112.5); const sweet = ctx.parseSweetener('unsweetened coffee with 2 teaspoons sugar'); assert.equal(sweet.grams, 8) })
  await check('water additions retain all resolved nutrition and unresolved lemon cannot save', async () => { for (const [text, expected] of [['Log 250 ml water with 2 teaspoons sugar', 32], ['Log 250 ml water 2 teaspoons sugar', 32], ['Log 250 ml water with one teaspoon honey', 21], ['Log 250 ml water with 50 ml whole milk and no sugar', 31]]) { const d = await drink(text); assert(d.canConfirm, text); assert.equal(d.water.drinkType, 'Water'); assert.equal(d.food.items.length, 2); assert.equal(d.food.nutrition.calories, expected) } const lemon = await drink('Log 250 ml water with 10 g lemon and no sugar'); assert.equal(lemon.canConfirm, false); assert.match(lemon.food.draftText, /lemon/); const named = ctx.resolveRequestedActionDate('on February 30 2026', '2026-10-15'); assert.equal(ctx.applyDraftTiming({ action: 'water', localDate: named, canConfirm: true }, 'on February 30 2026', -660).canConfirm, false) })
  await check('milk clarification preserves original drink and waits for amount', async () => { const d = await drink('Log 250 ml coffee with 50 ml whole milk and 2 teaspoons sugar'); const pending = await ctx.buildReviewedDraftCorrection(d, 'Change the milk', '2026-10-15'); assert.equal(pending.canConfirm, false); const sealed = await ctx.resolveVoiceDrinkDraft(pending); assert.equal(sealed.canConfirm, false); const follow = ctx.followUpWaterTranscript(pending, '25 ml'); assert.match(follow, /250 ml coffee/); const resolved = await drink(follow); assert(resolved.canConfirm); close(resolved.food.items.find(item => /milk/i.test(item.name)).calories, 15.7075) })
  await check('IANA zone resolves correct winter summer offsets and rejects changed-clock ambiguity', () => {
    for (const [date, expected] of [['2026-06-01', -600], ['2026-10-15', -660]]) {
      const d = ctx.applyDraftTiming({ action: 'food_build_meal', localDate: date, canConfirm: true }, 'at 19:30', -660, undefined, 'Australia/Melbourne', '2026-10-15')
      assert(d.canConfirm); assert.equal(d.tzOffsetMin, expected); assert.equal(d.timeZone, 'Australia/Melbourne')
    }
    const corrected = ctx.applyDraftTiming({ action: 'food_build_meal', localDate: '2026-06-01', canConfirm: true }, 'change the date to June 1 2026', -660, { action: 'food_build_meal', localTime: '19:30', timeZone: 'Australia/Melbourne', tzOffsetMin: -660 }, undefined, '2026-10-15')
    assert.equal(corrected.tzOffsetMin, -600)
    for (const [date, status] of [['2026-10-04', 'nonexistent'], ['2026-04-05', 'ambiguous']]) {
      assert.equal(ctx.resolveVoiceWallTime(date, '02:30', 'Australia/Melbourne').status, status)
      const d = ctx.applyDraftTiming({ action: 'water', localDate: date, canConfirm: true }, 'at 02:30', -660, undefined, 'Australia/Melbourne', '2026-10-15')
      assert.equal(d.canConfirm, false); assert.equal(d.timingNeedsClarification, true)
    }
    assert.equal(ctx.applyDraftTiming({ action: 'water', localDate: '2026-06-01', canConfirm: true }, 'at 19:30', -660, undefined, undefined, '2026-10-15').canConfirm, false)
    assert.equal(ctx.applyDraftTiming({ action: 'water', localDate: '2026-10-15', canConfirm: true }, 'at 19:30', -660, undefined, undefined, '2026-10-15').canConfirm, true)
  })
  await check('a corrected DST gap draft must resolve again before it can confirm', async () => {
    const original = await drink('Log 250 ml water')
    const pending = ctx.applyDraftTiming({ ...original, localDate: '2026-10-04' }, 'at 02:30', -660, undefined, 'Australia/Melbourne', '2026-10-15')
    assert.equal((await ctx.resolveVoiceDrinkDraft(pending)).canConfirm, false)
    const parsedPending = ctx.parseFollowUpDraft(pending); assert(parsedPending)
    const corrected = await ctx.buildReviewedDraftCorrection(parsedPending, 'Change the time to 03:30', '2026-10-04')
    const final = ctx.applyDraftTiming(corrected, 'Change the time to 03:30', -660, pending, 'Australia/Melbourne', '2026-10-15')
    assert(final.canConfirm); assert.equal(final.localTime, '03:30'); assert.equal(final.tzOffsetMin, -660)
  })
  await check('combined sweeteners require a complete restatement instead of silently dropping honey', async () => {
    for (const text of ['Log 250 ml coffee with 2 teaspoons sugar and one teaspoon honey', 'Log 250 ml water with one teaspoon honey plus 2 teaspoons sugar']) {
      const d = await drink(text); assert.equal(d.canConfirm, false); assert.match(d.confirmationMessage, /both sugar and honey/); assert.equal(d.transcript, text)
    }
    const original = await drink('Log 250 ml coffee with 2 teaspoons sugar')
    const correction = await ctx.buildReviewedDraftCorrection(original, 'Change it to 2 teaspoons sugar and one teaspoon honey', '2026-10-15')
    assert.equal(correction.canConfirm, false); assert.match(correction.confirmationMessage, /both sugar and honey/)
    const honey = await drink('Log 250 ml sugar-free coffee with one teaspoon honey'); assert(honey.canConfirm); assert.equal(honey.food.items.length, 2)
  })
  await check('over-limit ingredient parsing and corrections refuse partial saves and retain the full review', async () => {
    const parts = Array.from({ length: 13 }, (_, i) => `10 g chicken part ${i + 1}`)
    assert.equal(ctx.splitIngredientList(parts.join(', ')).length, 13)
    const d = await build(parts); assert.equal(d.canConfirm, false); assert.match(d.confirmationMessage, /13 ingredients/); assert.match(d.food.draftText, /part 13/); assert.equal(d.food.entries.length, 13); assert.equal(d.food.items, undefined)
    const parsed = ctx.tryParseDirectFoodRequest(`Log ${parts.join(', ')} for lunch`, { section: 'food', title: 'Food Diary' })
    assert.equal(parsed.ingredients.length, 13); assert.equal((await ctx.buildVoiceMealDraft(parsed, 'Voice test', '2026-10-15')).canConfirm, false)
    const original = await build(Array(12).fill('10 g chicken'))
    const corrected = await ctx.buildReviewedDraftCorrection(original, 'add 10 g rice to this meal', '2026-10-15')
    assert.equal(corrected.canConfirm, false); assert.match(corrected.food.draftText, /rice/); assert.equal(corrected.food.entries.length, 13)
  })
  await check('recorded audio uses current transcription JSON request contract', async () => { let request; const audio = { audio: { transcriptions: { create: async value => { request = value; return { text: 'Log 250 ml water' } } } } }; const result = await ctx.transcribeAudio(audio, { synthetic: true }, 'synthetic-user', 3); assert.equal(request.model, 'gpt-transcribe'); assert.equal(request.response_format, undefined); assert.equal(result.text, 'Log 250 ml water') })
  console.log(`Voice draft integrity: ${checks} actual-source offline groups passed. No microphone, live provider, saved diary or cross-device claim.`)
}
run().catch(error => { console.error(error); process.exitCode = 1 })
