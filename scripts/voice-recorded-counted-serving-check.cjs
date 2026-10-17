#!/usr/bin/env node
'use strict'
// Actual normal source builder and structured POST. All foods/authentication
// are synthetic; no network, environment, provider, wallet or storage writes.
const assert = require('node:assert/strict')
const { normal, ctx, source, post } = require('./voice2-food-normal-prepare-check.cjs')
const base = (name = 'Egg, whole, cooked, fried') => source(name)
const portion = (food, label, calories = 50, extra = {}) => ({
  id: 'recorded-' + label, foodId: food.id, foodName: food.name, source: food.source,
  serving_size: label, calories, protein_g: calories / 10, carbs_g: calories / 20,
  fat_g: calories / 50, fiber_g: null, sugar_g: 0, ...extra,
})
const ingredient = (name = 'eggs', quantity = 2, unit = 'each') => ({ name, quantity, unit, display: `${quantity} ${unit} ${name}` })
const basis = (item, requested = ingredient()) => ctx.requestedIngredientBasis(requested, item)
const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9)
let count = 0
async function check(label, work) { normal.reset(); await work(); count++; console.log('PASS ' + label) }
async function main() {
  await check('ordinary counted eggs use their exact recorded cooked-food serving and preserve unknown nutrients', async () => {
    const item = base(); item.servingOptions = [portion(item, '1 large egg (50 g)', 70)]
    const result = basis(item); assert(result); assert.equal(result.estimated, false); close(result.ratio, 2)
    assert.equal(result.item.name, item.name); assert.equal(result.item.id, item.id)
    assert.equal(result.item.selectedServingId, item.servingOptions[0].id)
    const core = ctx.itemCore(result.item, 0, result.ratio)
    close(core.calories, 140); assert.equal(core.fiber, null); assert.equal(core.sugar, 0)
    assert(!/estimated/.test(result.label))
  })
  await check('actual structured meal preparation now accepts recorded ordinary counts without estimated weights', async () => {
    const item = base(); item.servingOptions = [portion(item, '1 large egg (50 g)', 70)]
    normal.setLocals([item])
    const requested = ingredient(), response = await post('food.diary.create', { name: 'Exact breakfast', meal: 'breakfast', localDate: '2026-10-17', destination: 'diary', ingredients: [requested] })
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body))
    const food = body.preparation.normalDraft.food
    assert.equal(food.items[0].requestedName, requested.name); assert.equal(food.items[0].requestedAmount, requested.display)
    assert.equal(food.items[0].estimatedPortion, false); close(food.nutrition.calories, 140)
    assert.equal(food.nutrition.fiber_g, null); assert.equal(food.nutrition.sugar_g, 0); assert.equal(body.chargedCredits, 0)
  })
  await check('actual structured POST continues past a gram-only local egg row to its normal recorded serving lookup', async () => {
    const item = base(), recorded = portion(item, '1 large egg (50 g)', 70), calls = [], previousSearch = ctx.searchDiaryFoods, previousServings = ctx.searchDiaryFoodServings
    normal.setLocals([item])
    ctx.searchDiaryFoods = async request => { const url = new URL(request.url); calls.push({ kind: 'search', localOnly: url.searchParams.get('localOnly') }); return { ok: true, json: async () => ({ items: [item] }) } }
    ctx.searchDiaryFoodServings = async request => { const url = new URL(request.url); calls.push({ kind: 'servings', source: url.searchParams.get('source'), id: url.searchParams.get('id') }); return { ok: true, json: async () => ({ source: item.source, options: [recorded] }) } }
    try {
      const requested = ingredient('eggs'), response = await post('food.diary.create', { name: 'Exact breakfast', meal: 'breakfast', localDate: '2026-10-17', destination: 'diary', ingredients: [requested] }), body = await response.json()
      assert.equal(response.status, 200, JSON.stringify(body)); assert.equal(body.chargedCredits, 0)
      const food = body.preparation.normalDraft.food; assert.equal(food.items.length, 1); assert.equal(food.items[0].requestedAmount, requested.display)
      assert.equal(food.items[0].requestedName, requested.name); assert.equal(food.items[0].estimatedPortion, false); close(food.nutrition.calories, 140)
      assert.equal(food.nutrition.fiber_g, null); assert.equal(food.nutrition.sugar_g, 0)
      assert(calls.some(call => call.kind === 'search' && call.localOnly === '1'))
      assert.deepEqual(calls.filter(call => call.kind === 'servings'), [{ kind: 'servings', source: item.source, id: item.id }])
      assert.equal(calls.some(call => call.kind === 'search' && call.localOnly !== '1'), false, 'Recorded local serving must resolve before provider fallback')
    } finally { ctx.searchDiaryFoods = previousSearch; ctx.searchDiaryFoodServings = previousServings }
  })
  await check('a gram-only local egg row with no recorded count returns clarification without guessing a weight', async () => {
    const item = base(), calls = [], previousSearch = ctx.searchDiaryFoods, previousServings = ctx.searchDiaryFoodServings
    normal.setLocals([item])
    ctx.searchDiaryFoods = async request => { calls.push({ kind: 'search', url: request.url }); return { ok: true, json: async () => ({ items: [item] }) } }
    ctx.searchDiaryFoodServings = async request => { calls.push({ kind: 'servings', url: request.url }); return { ok: true, json: async () => ({ source: item.source, options: [] }) } }
    try {
      const requested = ingredient('eggs'), response = await post('food.diary.create', { name: 'Exact breakfast', meal: 'breakfast', localDate: '2026-10-17', destination: 'diary', ingredients: [requested] }), body = await response.json()
      assert.equal(response.status, 422, JSON.stringify(body)); assert.equal(body.code, 'missing_fields'); assert.deepEqual(body.fields, ['ingredients.0'])
      assert.match(body.error, /eggs/); assert.match(body.error, /Nothing has been saved/); assert.equal(body.preparation, undefined)
      assert.equal(calls.filter(call => call.kind === 'servings').length, 1, 'One exact source detail lookup is sufficient across query variants')
      assert.equal(basis(item, { ...requested, requireRecordedPortion: true }), null)
      assert.equal(basis(item, { ...requested, requireRecordedPortion: 'true' }).estimated, true, 'Only the trusted exact boolean opts into strict portion mode')
    } finally { ctx.searchDiaryFoods = previousSearch; ctx.searchDiaryFoodServings = previousServings }
  })
  await check('arbitrary ordinary food names and multi-item portions scale the recorded nutrient basis once', async () => {
    for (const [name, noun] of [['Apple, raw', 'apple'], ['Apricot, raw', 'apricot'], ['Falafel, prepared', 'falafel']]) {
      const item = base(name); item.servingOptions = [portion(item, `2 ${noun}s (90 g)`, 120)]
      const result = basis(item, ingredient(noun, 3)); assert(result, noun); close(result.ratio, 1.5)
      close(ctx.itemCore(result.item, 0, result.ratio).calories, 180)
    }
  })
  await check('explicit source servings work without pretending a serving is one individual food', async () => {
    const item = base('Beans, cooked'); item.servingOptions = [portion(item, '1 serving (125 g)', 110)]
    const result = basis(item, ingredient('beans cooked', 2, 'serving')); assert(result); close(result.ratio, 2)
    assert.equal(result.estimated, false)
    assert.equal(basis(item, ingredient('beans cooked', 2)).estimated, true, 'An unspecified individual bean is not one full serving')
  })
  await check('different recorded sizes cannot be selected by row order and an explicit size selects exactly', async () => {
    const item = base(); item.servingOptions = [portion(item, '1 small egg (35 g)', 45), portion(item, '1 large egg (50 g)', 70)]
    assert.equal(basis(item), null)
    const requested = { ...ingredient(), size: 'large' }, chosen = basis(item, requested)
    assert(chosen); assert.equal(chosen.item.serving_size, '1 large egg (50 g)'); close(ctx.itemCore(chosen.item, 0, chosen.ratio).calories, 140)
    const selected = ctx.compatibleOrdinaryVoiceFood('eggs', item, ingredient())
    assert.equal(selected, null, 'The normal serving loop must not erase the ambiguity')
  })
  await check('foreign food IDs, sources, preparation identities and household measures cannot become egg counts', async () => {
    const item = base()
    for (const changed of [
      { foodId: 'another-food' }, { source: 'fatsecret' }, { foodName: 'Egg substitute, powder' }, { serving_size: '1 cup (100 g)' }, { serving_size: '100 g' },
    ]) {
      item.servingOptions = [portion(item, '1 large egg (50 g)', 70, changed)]
      const result = basis(item); assert(result === null || result.estimated === true, JSON.stringify(changed))
    }
    assert.equal(ctx.voiceOrdinaryIdentityMatches('sunny-side-up eggs', base('Egg, whole, raw')), false)
    assert.equal(ctx.voiceOrdinaryIdentityMatches('coffee with skim milk', base('Coffee, brewed')), false)
  })
  await check('missing recorded counts retain the legacy estimate marker and physical weights remain measured', async () => {
    const item = base(), unrecorded = basis(item); assert(unrecorded); assert.equal(unrecorded.estimated, true)
    const weighed = basis(item, ingredient('eggs', 75, 'g')); assert(weighed); assert.equal(weighed.estimated, false); close(weighed.ratio, .75)
    const itemCountOnly = { ...item, serving_size: '1 egg', calories: 70, fiber_g: null, sugar_g: 0 }
    const counted = basis(itemCountOnly); assert(counted); assert.equal(counted.estimated, false); close(counted.ratio, 2)
  })
  await check('independently rounded recorded serving nutrients survive actual structured preparation and exact normal save/readback', async () => {
    const saved = require('./voice2-food-normal-save-check.cjs').setup()
    const item = base(), recorded = portion(item, '1 large egg (50 g)', 70, { protein_g: 7, carbs_g: 3, fat_g: 1.4 })
    item.servingOptions = [recorded]; normal.setLocals([item])
    const prepared = await saved.prepare('food.diary.create', { name: 'Exact recorded breakfast', meal: 'breakfast', ingredients: [{ name: 'eggs', quantity: 2, unit: 'each' }] })
    const reviewed = prepared.data.normal.normalDraft.food.items[0]
    assert.equal(reviewed.__voiceSourceFood.id, item.id); assert.equal(reviewed.__voiceSourceFood.name, item.name)
    assert.equal(reviewed.__voiceSourceFood.selectedServingId, recorded.id)
    assert.equal(reviewed.__voiceSourceFood.serving_size, recorded.serving_size)
    assert.equal(reviewed.__voiceSourceFood.calories, 70); assert.equal(reviewed.__voiceSourceFood.carbs_g, 3)
    assert.equal(reviewed.requestedAmount, '2 each eggs'); assert.equal(reviewed.estimatedPortion, false)
    const result = await saved.execute('food.diary.create', prepared), row = saved.h.state().food[0]
    assert.equal(result.verified, true); assert.equal(result.status, 'completed'); assert.equal(saved.calls.post, 1)
    assert(saved.calls.foodRead >= 1); assert.equal(saved.h.state().food.length, 1)
    close(row.nutrients.calories, 140); close(row.nutrients.protein_g, 14); close(row.nutrients.carbs_g, 6); close(row.nutrients.fat_g, 2.8)
    assert.equal(row.nutrients.fiber_g, null); assert.equal(row.nutrients.sugar_g, 0)
    assert.equal(row.items[0].__voiceSourceFood.selectedServingId, recorded.id)
    assert.equal(row.items[0].__voiceSourceFood.carbs_g, 3)
  })
  await check('every supported structured size reaches the exact recorded source without entering the food name', async () => {
    for (const size of ['small', 'medium', 'large', 'extra large', 'regular']) {
      const saved = require('./voice2-food-normal-save-check.cjs').setup(), item = base()
      item.servingOptions = ['small', 'medium', 'large', 'extra large', 'regular'].map((entry, index) => portion(item, `1 ${entry.replace(' ', '-')} egg (${35 + index * 5} g)`, 45 + index * 10))
      normal.setLocals([item])
      const prepared = await saved.prepare('food.diary.create', { name: 'Size breakfast', meal: 'breakfast', ingredients: [{ name: 'eggs', quantity: 2, unit: 'each', size }] })
      const values = prepared.data.values.ingredients[0], reviewed = prepared.data.normal.normalDraft.food.items[0]
      assert.equal(values.name, 'eggs'); assert.equal(values.size, size); assert.equal(values.display, `2 each ${size} eggs`)
      assert.equal(reviewed.requestedName, 'eggs'); assert.equal(reviewed.requestedAmount, values.display)
      assert.equal(reviewed.__voiceSourceFood.selectedServingId, item.servingOptions[['small', 'medium', 'large', 'extra large', 'regular'].indexOf(size)].id)
      assert.equal(saved.calls.post, 0)
    }
  })
  await check('ambiguous runtime meal accepts size correction on the same step, replaces old reviews and saves the chosen serving once', async () => {
    const saved = require('./voice2-food-normal-save-check.cjs').setup(), fixture = require('./voice-symptom-analysis-check.cjs').base
    const registry = require('./voice2-food-normal-prepare-check.cjs').load('lib/native-assistant-registry.ts'), crypto = require('node:crypto')
    const actual = fixture.load('lib/native-assistant-runtime.ts', { ...registry, createHash: crypto.createHash, randomUUID: crypto.randomUUID })
    const copy = value => JSON.parse(JSON.stringify(value)); let stored = null
    const runtime = actual.createAssistantRuntime({ registry: registry.createAssistantRegistry([...saved.ops.values()]), store: { runExclusive: async (_actor, _session, work) => work(stored && copy(stored), async value => { stored = copy(value) }) }, authorize: async () => {}, spendingAllowed: false })
    const handle = command => runtime.handle(saved.context(), 'count-size-runtime', command), item = base()
    item.servingOptions = [portion(item, '1 small egg (35 g)', 45), portion(item, '1 medium egg (44 g)', 55), portion(item, '1 large egg (50 g)', 70)]
    normal.setLocals([item])
    const original = { name: 'Keep this breakfast', meal: 'breakfast', ingredients: [{ name: 'eggs', quantity: 2, unit: 'each' }] }
    const question = await handle({ type: 'plan', steps: [{ id: 'meal', operation: 'food.diary.create', values: original }] })
    assert.equal(question.steps[0].status, 'needs_details'); assert.deepEqual(copy(question.steps[0].values), original); assert.equal(saved.calls.post, 0)
    assert.match(question.steps[0].clarification.message, /What size or measured amount/); assert.doesNotMatch(question.steps[0].clarification.message, /couldn't match/);
    const large = await handle({ type: 'correct', stepId: 'meal', values: { ingredients: [{ ...original.ingredients[0], size: 'large' }] } })
    assert.equal(large.steps.length, 1); assert.equal(large.steps[0].id, 'meal'); assert.equal(large.steps[0].status, 'review')
    assert.match(large.steps[0].prepared.summary, /2 each large eggs/); assert.equal(large.steps[0].values.name, original.name)
    const medium = await handle({ type: 'correct', stepId: 'meal', values: { ingredients: [{ ...original.ingredients[0], size: 'medium' }] } })
    assert.equal(medium.steps[0].status, 'review'); assert.notEqual(medium.steps[0].reviewId, large.steps[0].reviewId)
    await assert.rejects(() => handle({ type: 'confirm', reviewId: large.steps[0].reviewId }), error => error.code === 'stale_review')
    assert.equal(saved.calls.post, 0)
    const completed = await handle({ type: 'confirm', reviewId: medium.steps[0].reviewId })
    assert.equal(completed.steps[0].status, 'completed'); assert.equal(saved.calls.post, 1); assert.equal(saved.h.state().food.length, 1)
    const row = saved.h.state().food[0]; close(row.nutrients.calories, 110); assert.equal(row.nutrients.fiber_g, null); assert.equal(row.nutrients.sugar_g, 0)
    assert.equal(row.items[0].requestedAmount, '2 each medium eggs'); assert.equal(row.items[0].__voiceSourceFood.selectedServingId, item.servingOptions[1].id)
    await handle({ type: 'confirm', reviewId: medium.steps[0].reviewId }); assert.equal(saved.calls.post, 1)
  })
  await check('unsupported sizes and mismatched derived displays are rejected before source lookup', async () => {
    const saved = require('./voice2-food-normal-save-check.cjs').setup(), prep = require('./voice2-food-normal-prepare-check.cjs')
    for (const size of ['jumbo', 'extra-large', '', null, 3]) await assert.rejects(() => saved.prepare('food.diary.create', { name: 'Breakfast', meal: 'breakfast', ingredients: [{ name: 'eggs', quantity: 2, unit: 'each', size }] }), error => error.code === 'invalid_input')
    const values = { name: 'Breakfast', meal: 'breakfast', localDate: '2026-10-17', destination: 'diary', ingredients: [{ ...ingredient(), size: 'large', display: '2 each small eggs' }] }
    assert.throws(() => prep.food.validateAssistantFoodServiceValues('food.diary.create', values), /changed its exact measured fields/)
    assert.equal(saved.calls.post, 0)
  })
  await check('recipe size metadata is retained and changed selected size invalidates the actual signed review', async () => {
    const saved = require('./voice2-food-normal-save-check.cjs').setup(), item = base(), fixture = require('./voice-symptom-analysis-check.cjs').base
    item.servingOptions = [portion(item, '1 small egg (35 g)', 45), portion(item, '1 large egg (50 g)', 70)]; normal.setLocals([item])
    const prepared = await saved.prepare('food.recipe.log', { recipe: { title: 'Egg recipe', yieldServings: 2, ingredients: [{ name: 'eggs', quantity: 2, unit: 'each', size: 'large' }], steps: ['Keep this exact instruction.'] }, meal: 'breakfast', servingsEaten: 1 })
    assert.equal(prepared.data.values.ingredients[0].size, 'large'); assert.equal(prepared.data.values.recipe.ingredients[0], '2 each large eggs')
    const draft = prepared.data.normal.normalDraft; assert.equal(fixture.tokens.verifyNativeVoiceDraft(saved.context().actorId, draft), true)
    const forged = JSON.parse(JSON.stringify(draft)); forged.food.items[0].__voiceSourceFood.serving_size = '1 small egg (35 g)'
    assert.equal(fixture.tokens.verifyNativeVoiceDraft(saved.context().actorId, forged), false)
    await assert.rejects(() => saved.services.execute(saved.context(), forged, saved.claim))
    const changed = JSON.parse(JSON.stringify(prepared)); changed.data.values.ingredients[0].size = 'small'
    await assert.rejects(() => saved.execute('food.recipe.log', changed)); assert.equal(saved.calls.post, 0)
  })
  console.log(`Recorded ordinary count portions: ${count} actual-source offline groups passed. No provider, account, credits or real database calls.`)
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { main }
