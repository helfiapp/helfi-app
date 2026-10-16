#!/usr/bin/env node
'use strict'
// Real signed confirm, record preparer and normal hydration PATCH. All rows,
// source snapshots, auth and writes are synthetic in-memory fixtures only.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
function fixture(file, boundary, exports) {
  const text = fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/^#!.*\n/, '')
  const at = text.indexOf(boundary); assert(at > 0)
  return new Function('require', '__dirname', `${text.slice(0, at)}\nreturn {${exports}}`)(require, __dirname)
}
const save = fixture('voice-save-integrity-check.cjs', 'async function run() {', 'harness,signed')
const records = fixture('voice-record-actions-check.cjs', 'async function run() {', 'atomicDb,loadRoute,ctx,request,user,date')
const plain = value => JSON.parse(JSON.stringify(value))
let passed = 0
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`) }
function drink(sugar = 99.8) {
  const measured = (name, amount, unit, values) => {
    const source = { id: `synthetic-${name}`, name, source: 'synthetic-public-fixture', ...values }
    const item = { ...source, __voiceSourceFood: source, nutritionCoversServing: true, serving_size: `${amount} ${unit}` }
    for (const [key, value] of Object.entries(values)) item[key] = value === null ? null : value * amount / 100
    return item
  }
  const items = [measured('Coffee', 250, 'ml', { calories: 1, protein_g: 0.1, carbs_g: 0, fat_g: 0, fiber_g: null, sugar_g: 0 }),
    measured('Whole milk', 50, 'ml', { calories: 61, protein_g: 3.2, carbs_g: 4.8, fat_g: 3.3, fiber_g: 0, sugar_g: 4.8 }),
    measured('Sugars, granulated', 8, 'g', { calories: 385, protein_g: 0, carbs_g: 99.6, fat_g: 0, fiber_g: 0, sugar_g: sugar })]
  return save.signed({ water: { amount: 250, unit: 'ml', amountMl: 250, drinkType: 'Coffee', label: 'Coffee with 8 g sugar with 50 ml milk', category: 'other',
    sweetener: { type: 'sugar', amount: 2, unit: 'tsp', grams: 8 } }, food: { meal: 'uncategorized', mealName: 'Coffee', items, nutrition: { __voiceBuiltMeal: true } } })
}
async function saved(sugar = 99.8) {
  const h = save.harness(), draft = drink(sugar), response = await h.send(draft)
  assert.equal(response.status, 200, response.body.error)
  return { h, draft, initial: plain(h.state()) }
}
function patchFixture(initial, fail = false) {
  const f = records.atomicDb({ water: initial.water, food: initial.food }, fail)
  const route = records.loadRoute('app/api/water-log/[id]/route.ts', { prisma: f.db, authOptions: {},
    validateNativeVoiceResolvedFood: records.ctx.validateNativeVoiceResolvedFood,
    getServerSession: async () => ({ user: { email: 'synthetic@example.invalid' } }), getUserIdFromNativeAuth: async () => records.user,
    deleteSmartCoachNotificationsByCategories: async () => {}, NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) } })
  return { f, send: body => route.PATCH({ json: async () => body }, { params: { id: initial.water[0].id } }) }
}
async function main() {
  await check('actual signed save persists source-backed added sugar independently of milk lactose', async () => {
    const { initial } = await saved(), n = initial.food[0].nutrients
    assert.equal(n.__sweetenerChoice, 'with'); assert.equal(n.__sweetenerType, 'sugar'); assert.equal(n.__sweetenerAmount, 2); assert.equal(n.__sweetenerUnit, 'tsp')
    assert.equal(n.__sweetenerGrams, 8); assert.equal(n.__sweetenerCalories, 30.8); assert.equal(n.__sweetenerCarbs, 7.968); assert.equal(n.__sweetenerSugar, 7.984)
    assert.equal(n.sugar_g, 10.384); assert.notEqual(n.__sweetenerSugar, n.sugar_g)
  })
  await check('actual whole-volume PATCH doubles every consumed ingredient and sweetener field exactly once', async () => {
    const { initial } = await saved(), p = patchFixture(initial)
    const response = await p.send({ amount: 500, unit: 'ml', wholeDrinkVolume: true })
    assert.equal(response.status, 200)
    const state = p.f.state(), before = initial.food[0], after = state.food[0]
    assert.equal(state.water[0].amountMl, 500); assert.equal(state.water[0].label, 'Coffee with 16 g sugar with 100 ml milk'); assert.equal(after.name, state.water[0].label)
    for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g', 'sugar_g', '__sweetenerAmount', '__sweetenerGrams', '__sweetenerCalories', '__sweetenerCarbs', '__sweetenerSugar']) assert.equal(after.nutrients[key], before.nutrients[key] * 2, key)
    assert.equal(after.nutrients.fiber_g, null); assert.deepEqual(plain(after.items.map(item => item.serving_size)), ['500 ml', '100 ml', '16 g'])
    after.items.forEach((item, index) => { assert.equal(item.calories, before.items[index].calories * 2); assert.deepEqual(plain(item.__voiceSourceFood), plain(before.items[index].__voiceSourceFood)) })
  })
  await check('unknown added sugar remains unknown while real zero stays zero after save and resize', async () => {
    for (const sugar of [null, 0]) {
      const { initial } = await saved(sugar), p = patchFixture(initial)
      assert.equal(initial.food[0].nutrients.__sweetenerSugar, sugar)
      assert.equal((await p.send({ amount: 500, unit: 'ml', wholeDrinkVolume: true })).status, 200)
      assert.equal(p.f.state().food[0].nutrients.__sweetenerSugar, sugar)
      assert.equal(p.f.state().food[0].items[2].sugar_g, sugar)
    }
  })
  await check('sweetener without resolved source or mismatched source nutrients cannot write either record', async () => {
    for (const alter of [draft => delete draft.food.items[2].__voiceSourceFood, draft => { draft.food.items[2].sugar_g = 999 }]) {
      const h = save.harness(), draft = drink(); alter(draft)
      // Re-sign the deliberately inconsistent synthetic reviewed payload; this
      // tests server source validation, independently of tamper protection.
      const fresh = save.signed({ water: draft.water, food: draft.food })
      assert.equal((await h.send(fresh)).status, 500); assert.equal(h.state().water.length, 0); assert.equal(h.state().food.length, 0)
    }
  })
  await check('source-resolved milk-only edit preserves the reviewed unchanged added-sugar amount and nutrition', async () => {
    const { initial } = await saved(), old = initial.food[0], items = plain(old.items)
    items[1].serving_size = '100 ml'
    for (const key of ['calories', 'calories_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'fiber', 'sugar_g', 'sugar']) if (typeof items[1][key] === 'number') items[1][key] *= 2
    const nutrition = { ...old.nutrients }
    for (const [primary, alias] of [['calories', 'calories_kcal'], ['protein_g', 'protein'], ['carbs_g', 'carbs'], ['fat_g', 'fat'], ['fiber_g', 'fiber'], ['sugar_g', 'sugar']]) {
      const values = items.map(item => item[primary]); nutrition[primary] = nutrition[alias] = values.some(value => value === null) ? null : values.reduce((a, b) => a + b, 0)
    }
    const p = patchFixture(initial)
    assert.equal((await p.send({ amount: 250, unit: 'ml', expectedWaterState: initial.water[0], resolvedDrinkFood: {
      food: { items, nutrition }, trustedSources: items.map(item => item.__voiceSourceFood), expectedFoodState: old,
    } })).status, 200)
    const changed = p.f.state().food[0]
    for (const key of ['__sweetenerAmount', '__sweetenerGrams', '__sweetenerCalories', '__sweetenerCarbs', '__sweetenerSugar']) assert.equal(changed.nutrients[key], old.nutrients[key], key)
    assert.equal(changed.items[1].serving_size, '100 ml'); assert.equal(changed.items[2].serving_size, '8 g')
  })
  await check('whole resize reviews the new automatic label before execution and rejects changed ingredient snapshots', async () => {
    const { initial } = await saved()
    const io = async (_request, call) => ({ entries: plain(call.entity === 'food' ? initial.food : initial.water) })
    const prepared = await records.ctx.prepareNativeVoiceRecordAction(records.request, records.user, { operation: 'update', entity: 'water', id: initial.water[0].id, localDate: '2026-10-15', changes: { amount: 500 } }, io)
    assert.equal(prepared.canConfirm, true); assert.equal(prepared.recordAction.changes.label, 'Coffee with 16 g sugar with 100 ml milk')
    assert.match(prepared.confirmationMessage, /16 g sugar with 100 ml milk/)
    const body = records.ctx.safeBody(initial.water[0], prepared.recordAction), p = patchFixture(initial)
    assert.equal((await p.send(body)).status, 200)
    const stale = patchFixture(initial); stale.f.state().food[0].nutrients.__sweetenerGrams = 99
    assert.equal((await stale.send(body)).status, 500); assert.equal(stale.f.state().water[0].amount, 250)
    const missingReview = patchFixture(initial)
    assert.equal((await missingReview.send({ amount: 500, unit: 'ml', wholeDrinkVolume: true, expectedWaterState: initial.water[0] })).status, 500)
  })
  await check('custom labels and explicit reviewed names are preserved; linked failure rolls back all resize changes', async () => {
    const { initial } = await saved(); initial.water[0].label = initial.food[0].name = 'My 2026 morning coffee'
    const custom = patchFixture(initial); assert.equal((await custom.send({ amount: 500, unit: 'ml', wholeDrinkVolume: true })).status, 200)
    assert.equal(custom.f.state().water[0].label, 'My 2026 morning coffee')
    const explicit = patchFixture(initial); assert.equal((await explicit.send({ amount: 500, unit: 'ml', wholeDrinkVolume: true, label: 'Large coffee' })).status, 200)
    assert.equal(explicit.f.state().water[0].label, 'Large coffee')
    const failed = patchFixture(initial, true); assert.equal((await failed.send({ amount: 500, unit: 'ml', wholeDrinkVolume: true })).status, 500)
    assert.deepEqual(plain(failed.f.state()), { water: initial.water, food: initial.food })
  })
  await check('automatic-label parser never rewrites dates, personal names or incomplete ingredient descriptions', async () => {
    const resize = records.ctx.resizeNativeVoiceDrinkLabel
    for (const label of ['My coffee with 8 g sugar', 'Coffee on 2026-10-17', 'Coffee with 8 g sugar for 2026', 'Coffee with milk', 'Coffee with 8 g sugar and a cookie']) assert.equal(resize(label, { __voiceBuiltMeal: true }, 2), undefined)
    assert.equal(resize('Coffee with 8 g sugar with 50 ml milk', {}, 2), undefined)
    assert.equal(resize('Coffee with 1 tsp honey', { __voiceBuiltMeal: true }, 2), 'Coffee with 2 tsp honey')
    assert.throws(() => resize('Hot chocolate with 10000 ml full cream milk', { __voiceBuiltMeal: true }, 1000000000), /shorter drink name/)
  })
  console.log(`Voice drink metadata: ${passed} actual-source offline groups passed; no real app, provider or database writes.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
