#!/usr/bin/env node
'use strict'

// Executes real route/token source in isolated VMs. Every account, nutrient,
// clock and database row is synthetic. Never imports the app, reads env files,
// opens a network connection, or accesses the real database or user history.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
let clockMs = Date.parse('2026-10-15T01:00:00.000Z')
class AuditDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clockMs])) }
  static now() { return clockMs }
}
class SyntheticDuplicate extends Error {
  constructor() { super('synthetic unique constraint'); this.code = 'P2002' }
}
function load(relativePath, fixtures = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const ast = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true)
  const printer = ts.createPrinter()
  const stripped = ast.statements.filter((item) => !ts.isImportDeclaration(item))
    .map((item) => printer.printNode(ts.EmitHint.Unspecified, item, ast)).join('\n').replace(/^export\s+/gm, '')
  const context = {
    process: { env: Object.freeze({ NODE_ENV: 'test' }) },
    console: { log() {}, warn() {}, error() {} }, crypto, Buffer, Date: AuditDate,
    fetch() { throw new Error('Network forbidden in offline voice checks') },
    ...fixtures,
  }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(stripped, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, context, { filename: relativePath })
  return context
}
const tokens = load('lib/native-voice-review-token.ts')
function signed(draft = {}) {
  const result = { canConfirm: true, action: 'water', localDate: '2026-10-15',
    reviewIssuedAt: clockMs, reviewNonce: crypto.randomUUID(),
    water: { amount: 250, unit: 'ml', amountMl: 250, drinkType: 'Water', label: 'Water', category: 'other' },
    ...draft }
  result.reviewToken = tokens.signNativeVoiceDraft('synthetic-user', result)
  return result
}
const json = (value) => JSON.parse(JSON.stringify(value))
function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
function harness(options = {}) {
  let state = { tokens: {}, water: [], food: [], symptoms: [] }
  let nextId = 0
  let queue = Promise.resolve()
  let foodFailures = options.foodFailures || 0
  let foodAttempts = 0
  let held = false
  const entered = deferred()
  const release = deferred()
  const effects = []
  const sourceFood = options.sourceFood || []
  function client(getState, inTransaction) {
    const mustBeAtomic = () => assert.equal(inTransaction, true, 'Food/hydration writes must use the transaction client')
    return {
      user: { findUnique: async () => ({ id: 'synthetic-user' }) },
      verificationToken: {
        deleteMany: async ({ where }) => {
          for (const [token, row] of Object.entries(getState().tokens)) {
            const identifiers = where.OR || [{ identifier: where.identifier }]
            const matches = identifiers.some((item) => typeof item.identifier === 'string'
              ? row.identifier === item.identifier : row.identifier.startsWith(item.identifier.startsWith))
            if (matches && row.expires.getTime() < where.expires.lt.getTime()) delete getState().tokens[token]
          }
          return { count: 0 }
        },
        create: async ({ data }) => {
          if (getState().tokens[data.token]) throw new SyntheticDuplicate()
          getState().tokens[data.token] = { ...data }
          return { ...data }
        },
        update: async ({ where, data }) => {
          if (options.failReceipt) throw new Error('synthetic receipt failure')
          assert(getState().tokens[where.token], 'Receipt must complete an existing claim')
          return Object.assign(getState().tokens[where.token], data)
        },
        findUnique: async ({ where }) => getState().tokens[where.token] || null,
      },
      waterLog: { create: async ({ data }) => {
        mustBeAtomic()
        if (options.holdFirstWater && !held) { held = true; entered.resolve(); await release.promise }
        const row = { id: `water-${++nextId}`, ...data }
        getState().water.push(row)
        return row
      } },
      foodLog: {
        create: async ({ data }) => {
          mustBeAtomic()
          foodAttempts++
          if (foodFailures > 0 || foodAttempts === options.failFoodAttempt) {
            foodFailures = Math.max(0, foodFailures - 1)
            throw new Error('synthetic food write failure')
          }
          const row = { id: `food-${++nextId}`, ...data }
          getState().food.push(row)
          return row
        },
        findMany: async () => sourceFood,
      },
      symptomAnalysis: { create: async ({ data }) => {
        if (options.failSymptom) throw new Error('synthetic symptom write failure')
        const row = { id: `symptom-${++nextId}`, ...data }; getState().symptoms.push(row); return row
      } },
      healthGoal: { findFirst: async () => null },
    }
  }
  const prisma = client(() => state, false)
  prisma.$transaction = async (callback) => {
    const previous = queue
    const finished = deferred()
    queue = finished.promise
    await previous
    const working = structuredClone(state)
    try {
      const result = await callback(client(() => working, true))
      state = working
      return result
    } finally { finished.resolve() }
  }
  const route = load('app/api/native/voice-assistant/confirm/route.ts', {
    Prisma: { PrismaClientKnownRequestError: SyntheticDuplicate, JsonNull: null }, prisma,
    getServerSession: async () => options.unauthorized ? null : ({ user: { id: 'synthetic-user' } }),
    getUserIdFromNativeAuth: async () => null, authOptions: {},
    verifyNativeVoiceDraft: tokens.verifyNativeVoiceDraft,
    NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
    triggerBackgroundRegeneration: async (data) => { effects.push(data) },
    deleteSmartCoachNotificationsByCategories: async () => {},
  })
  return { route, send: (draft) => route.POST({ json: async () => ({ draft }) }), entered, release,
    state: () => state, effects }
}
function foodItem(overrides = {}) {
  return { id: 'synthetic-food-source', source: 'custom', name: 'Milk', serving_size: '250 ml',
    calories: 150, protein_g: 8, carbs_g: 12, fat_g: 8, fiber_g: null, sugar_g: 12, ...overrides }
}
function drink(overrides = {}) {
  return signed({ water: { amount: 250, unit: 'ml', amountMl: 250, drinkType: 'Milk', label: 'Milk', category: 'breakfast' },
    food: { meal: 'breakfast', mealName: 'Milk', items: [foodItem()], nutrition: { calories: 150 } }, ...overrides })
}
const checks = []
async function check(name, callback) { await callback(); checks.push(name) }

async function run() {
  await check('plain water saves one hydration row and no food', async () => {
    const h = harness(); const response = await h.send(signed())
    assert.equal(response.status, 200); assert.equal(h.state().water.length, 1); assert.equal(h.state().food.length, 0)
    assert.equal(response.body.result.foodId, null)
  })
  await check('milk saves resolved nutrition, IDs and one completed replay result', async () => {
    const h = harness(); const draft = drink()
    const response = await h.send(draft); const replay = await h.send(draft)
    assert.equal(response.status, 200); assert.equal(replay.status, 200)
    assert.equal(replay.body.idempotentReplay, true)
    assert.deepEqual(json(replay.body.result), json(response.body.result))
    assert.equal(h.state().water.length, 1); assert.equal(h.state().food.length, 1)
    const food = h.state().food[0]
    assert.equal(food.nutrients.calories, 150); assert.equal(food.nutrients.protein_g, 8)
    assert.equal(food.nutrients.__waterLogId, response.body.result.id)
    assert.equal(food.meal, 'breakfast')
  })
  await check('coffee with milk and sugar counts all resolved ingredients once', async () => {
    const h = harness()
    const response = await h.send(drink({
      water: { amount: 300, unit: 'ml', amountMl: 300, drinkType: 'Coffee', label: 'Coffee with milk and sugar', category: 'snacks' },
      food: { meal: 'snacks', nutrition: { calories: 64 }, items: [
        foodItem({ name: 'Coffee', calories: 2, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }),
        foodItem({ name: 'Milk', calories: 30, protein_g: 1.6, carbs_g: 2.4, fat_g: 1.6, fiber_g: 0, sugar_g: 2.4 }),
        foodItem({ name: 'Sugar', calories: 32, protein_g: 0, carbs_g: 8, fat_g: 0, fiber_g: 0, sugar_g: 8 }),
      ] },
    }))
    assert.equal(response.status, 200)
    const nutrition = h.state().food[0].nutrients
    assert.equal(nutrition.calories, 64); assert.equal(nutrition.sugar_g, 10.4)
    assert.equal(nutrition.protein_g, 1.6); assert.equal(h.state().food[0].items.length, 3)
  })
  await check('water with sugar or honey saves resolved food rather than dropping additions', async () => {
    for (const [type, calories, carbs] of [['sugar', 32, 8], ['honey', 64, 17.3]]) {
      const h = harness()
      const draft = signed({
        transcript: `Log 250 ml water with ${type}`,
        water: { amount: 250, unit: 'ml', amountMl: 250, drinkType: 'Water', label: `Water with ${type}`,
          sweetener: { type }, ingredients: [{ name: 'Water' }, { name: type }] },
        food: { meal: 'uncategorized', nutrition: { calories }, items: [
          foodItem({ name: type, calories, protein_g: 0, fat_g: 0, carbs_g: carbs, fiber_g: 0, sugar_g: carbs }),
        ] },
      })
      const result = await h.send(draft)
      assert.equal(result.status, 200); assert.equal(h.state().water.length, 1); assert.equal(h.state().food.length, 1)
      assert.equal(h.state().food[0].nutrients.calories, calories); assert.equal(result.body.result.foodId, h.state().food[0].id)
      const replay = await h.send(draft)
      assert.equal(replay.status, 200); assert.equal(h.state().water.length, 1); assert.equal(h.state().food.length, 1)
      const invalid = harness()
      assert.equal((await invalid.send(signed({ ...draft, food: undefined }))).status, 500)
      assert.equal(invalid.state().water.length, 0)
    }
    for (const water of [
      { ingredients: [{ name: 'Water' }, { name: 'lemon' }] },
      { sweetener: { type: 'sugar', grams: 8 } },
      {},
    ]) {
      const h = harness()
      const draft = signed({ transcript: 'Log water with 10 ml milk', water: { amount: 250, unit: 'ml', amountMl: 250, drinkType: 'Water', ...water } })
      assert.equal((await h.send(draft)).status, 500); assert.equal(h.state().water.length, 0)
    }
  })
  await check('legacy sugar-only or missing drink nutrition cannot save anything', async () => {
    for (const food of [undefined, { items: [], nutrition: {} }, { items: [foodItem()] }]) {
      const h = harness(); const response = await h.send(drink({ food }))
      assert.equal(response.status, 500)
      assert.equal(h.state().water.length, 0); assert.equal(h.state().food.length, 0)
      assert.equal(Object.keys(h.state().tokens).length, 0)
    }
  })
  await check('failed food write rolls hydration and claim back; retry saves once', async () => {
    const h = harness({ foodFailures: 1 }); const draft = drink()
    assert.equal((await h.send(draft)).status, 500)
    assert.equal(h.state().water.length, 0); assert.equal(h.state().food.length, 0)
    assert.equal(Object.keys(h.state().tokens).length, 0); assert.equal(h.effects.length, 0)
    assert.equal((await h.send(draft)).status, 200)
    assert.equal(h.state().water.length, 1); assert.equal(h.state().food.length, 1)
  })
  await check('concurrent retry waits for completed transaction and returns the same saved IDs', async () => {
    const h = harness({ holdFirstWater: true }); const draft = drink()
    const first = h.send(draft); await h.entered.promise
    let retryCompleted = false
    const second = h.send(draft).then((result) => { retryCompleted = true; return result })
    await Promise.resolve(); await Promise.resolve()
    assert.equal(retryCompleted, false, 'Pending transaction cannot prove success')
    assert.equal(h.effects.length, 0)
    h.release.resolve()
    const [a, b] = await Promise.all([first, second])
    assert.equal(a.status, 200); assert.equal(b.status, 200)
    assert.deepEqual(json(a.body.result), json(b.body.result))
    assert.equal(h.state().water.length, 1); assert.equal(h.state().food.length, 1)
  })
  await check('concurrent original failure cannot make retry claim an earlier successful save', async () => {
    const h = harness({ holdFirstWater: true, foodFailures: 1 }); const draft = drink()
    const first = h.send(draft); await h.entered.promise
    const second = h.send(draft); h.release.resolve()
    const [a, b] = await Promise.all([first, second])
    assert.equal(a.status, 500); assert.equal(b.status, 200)
    assert.equal(b.body.idempotentReplay, undefined)
    assert.equal(h.state().water.length, 1); assert.equal(h.state().food.length, 1)
  })
  await check('receipt failure also rolls food and hydration back', async () => {
    const h = harness({ failReceipt: true })
    assert.equal((await h.send(drink())).status, 500)
    assert.equal(h.state().water.length, 0); assert.equal(h.state().food.length, 0)
    assert.equal(Object.keys(h.state().tokens).length, 0)
  })
  await check('legacy or pending claim returns truthful conflict with no saved assertion', async () => {
    const h = harness(); const draft = drink(); const digest = crypto.createHash('sha256').update(draft.reviewToken).digest('base64url')
    h.state().tokens[digest] = { token: digest, identifier: 'native-voice-review-used:synthetic-user', expires: new AuditDate(clockMs + 86400000) }
    const response = await h.send(draft)
    assert.equal(response.status, 409); assert.equal(response.body.success, undefined)
    assert.equal(response.body.code, 'voice_save_result_unconfirmed')
    assert.equal(h.state().water.length, 0)
  })
  await check('missing optional nutrients stay null across every alias and total; genuine zero stays zero', async () => {
    const h = harness()
    const draft = signed({ action: 'food_build_meal', food: { meal: 'lunch', mealName: 'Chosen meal name', items: [
      foodItem({ fiber_g: null, fiber: 0, sugar_g: null, sugar: 0 }), foodItem({ fiber_g: 0, sugar_g: 0 }),
    ] } })
    assert.equal((await h.send(draft)).status, 200)
    const food = h.state().food[0]
    assert.equal(food.nutrients.fiber_g, null); assert.equal(food.nutrients.sugar_g, null)
    assert.equal(food.items[0].fiber, null); assert.equal(food.items[0].sugar, null)
    assert.equal(food.items[1].fiber_g, 0); assert.equal(food.items[1].sugar_g, 0)
    assert.equal(food.name, 'Chosen meal name')
  })
  await check('missing or invalid required nutrition and zero servings cannot save', async () => {
    for (const override of [{ protein_g: null }, { calories: -1 }, { fat_g: 'unknown' }, { carbs_g: ' ' }, { protein_g: false }, { servings: 0 }]) {
      const h = harness()
      const response = await h.send(signed({ action: 'food_build_meal', food: { meal: 'lunch', items: [foodItem(override)] } }))
      assert.equal(response.status, 500); assert.equal(h.state().food.length, 0)
      assert.equal(Object.keys(h.state().tokens).length, 0)
    }
  })
  await check('explicit local date, time and offset persist on matching food and hydration rows', async () => {
    for (const [offset, expected] of [[-660, '2026-10-14T21:30:00.000Z'], [300, '2026-10-15T13:30:00.000Z']]) {
      const h = harness()
      assert.equal((await h.send(drink({ localTime: '08:30', tzOffsetMin: offset }))).status, 200)
      assert.equal(h.state().water[0].createdAt.toISOString(), expected)
      assert.equal(h.state().food[0].createdAt.toISOString(), expected)
      assert.equal(h.state().food[0].localDate, '2026-10-15')
    }
    const h = harness(); assert.equal((await h.send(drink())).status, 200)
    assert.equal(h.state().food[0].createdAt, undefined, 'Absent explicit time retains normal database current time')
    for (const change of [{ localTime: '24:00', tzOffsetMin: -660 }, { localTime: '08:30' }, { localTime: '08:30', tzOffsetMin: 900 }]) {
      const invalid = harness(); assert.equal((await invalid.send(drink(change))).status, 500)
      assert.equal(invalid.state().water.length, 0)
    }
  })
  await check('favorite/copy retain timestamp and copy failure rolls every created row back', async () => {
    const h = harness()
    const favorite = signed({ action: 'food_favorite', localTime: '08:30', tzOffsetMin: -660,
      food: { meal: 'breakfast', favorite: { label: 'Saved milk', nutrition: { calories: 150 }, items: [foodItem()] } } })
    assert.equal((await h.send(favorite)).status, 200)
    assert.equal(h.state().food[0].createdAt.toISOString(), '2026-10-14T21:30:00.000Z')
    const copied = harness({ failFoodAttempt: 2, sourceFood: [
      { id: 'source-a', name: 'First food', meal: 'lunch', category: 'lunch', nutrients: { calories: 100 }, items: [] },
      { id: 'source-b', name: 'Second food', meal: 'lunch', category: 'lunch', nutrients: { calories: 200 }, items: [] },
    ] })
    const copy = signed({ action: 'food_copy_previous', localTime: '12:30', tzOffsetMin: -660, food: { sourceLogIds: ['source-a', 'source-b'] } })
    assert.equal((await copied.send(copy)).status, 500)
    assert.equal(copied.state().food.length, 0); assert.equal(Object.keys(copied.state().tokens).length, 0)
    assert.equal((await copied.send(copy)).status, 200)
    assert.equal(copied.state().food.length, 2)
    assert.equal(copied.state().food[0].createdAt.toISOString(), '2026-10-15T01:30:00.000Z')
  })
  await check('non-food action retains completed IDs; failed pending action cannot claim success on retry', async () => {
    const draft = signed({ action: 'symptom_note', symptom: { symptoms: ['synthetic note'] } })
    const h = harness(); const first = await h.send(draft); const replay = await h.send(draft)
    assert.equal(first.status, 200); assert.equal(replay.status, 200)
    assert.deepEqual(json(first.body.result), json(replay.body.result)); assert.equal(h.state().symptoms.length, 1)
    const failed = harness({ failSymptom: true })
    assert.equal((await failed.send(draft)).status, 500)
    assert.equal((await failed.send(draft)).status, 409)
    assert.equal(failed.state().symptoms.length, 0)
  })
  await check('signature binds user, complete food payload, explicit time and offset', async () => {
    const draft = drink({ localTime: '08:30', tzOffsetMin: -660 })
    assert.equal(tokens.verifyNativeVoiceDraft('synthetic-user', draft), true)
    assert.equal(tokens.verifyNativeVoiceDraft('different-user', draft), false)
    for (const change of [{ localTime: '09:30' }, { tzOffsetMin: 0 }, { food: { items: [] } }]) {
      assert.equal(tokens.verifyNativeVoiceDraft('synthetic-user', { ...draft, ...change }), false)
      assert.equal((await harness().send({ ...draft, ...change })).status, 400)
    }
  })
  await check('review age limited to30 minutes and future allowance to1 minute', async () => {
    const draft = signed(); const original = clockMs
    clockMs += 30 * 60000
    assert.equal(tokens.verifyNativeVoiceDraft('synthetic-user', draft), true)
    clockMs++
    assert.equal(tokens.verifyNativeVoiceDraft('synthetic-user', draft), false)
    assert.equal((await harness().send(draft)).status, 400)
    clockMs = original
    for (const issuedAt of [0, undefined, clockMs - 86400000, clockMs + 60001]) {
      const invalid = signed({ reviewIssuedAt: issuedAt })
      assert.equal(tokens.verifyNativeVoiceDraft('synthetic-user', invalid), false)
    }
    assert.equal(tokens.verifyNativeVoiceDraft('synthetic-user', signed({ reviewIssuedAt: clockMs + 60000 })), true)
  })
  console.log(JSON.stringify({ scope: 'Offline actual-source regression; synthetic transactional fixtures only; no microphone/live service proof', passed: checks.length, checks }, null, 2))
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
