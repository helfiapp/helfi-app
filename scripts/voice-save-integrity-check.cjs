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
  static setNow(value) { clockMs = value }
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
    console: { log() {}, warn() {}, error() {} }, crypto, Buffer, Date: AuditDate, AbortController, setTimeout, clearTimeout,
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
const moodContext = load('lib/native-voice-mood-context.ts')
const foodCopy = load('lib/native-voice-food-copy.ts')
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
  let state = { tokens: {}, water: [], food: [], symptoms: [], exercise: [], mood: [] }
  let nextId = 0
  let queue = Promise.resolve()
  let foodFailures = options.foodFailures || 0
  let foodAttempts = 0
  let held = false
  let chunkFailures = options.chunkFailures || 0
  const entered = deferred()
  const release = deferred()
  const effects = []
  const sourceFood = options.sourceFood || []
  function client(getState, inTransaction) {
    const mustBeAtomic = () => assert.equal(inTransaction, true, 'Food/hydration writes must use the transaction client')
    const boundedIndex = data => {
      if (Buffer.byteLength(data.identifier) + Buffer.byteLength(data.token) + 16 > 2704) throw new Error('Synthetic PostgreSQL indexed value limit')
    }
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
          boundedIndex(data)
          if (getState().tokens[data.token]) throw new SyntheticDuplicate()
          getState().tokens[data.token] = { ...data }
          return { ...data }
        },
        createMany: async ({ data }) => {
          assert.equal(inTransaction, true, 'Receipt chunks must be written in the atomic completion transaction')
          if (options.ignoreChunkWrites) return { count: data.length }
          for (const [index, row] of data.entries()) {
            boundedIndex(row)
            if (chunkFailures > 0 && index === 1) { chunkFailures--; throw Error('synthetic chunk write failure') }
            if (getState().tokens[row.token]) throw new SyntheticDuplicate()
            getState().tokens[row.token] = { ...row }
          }
          return { count: data.length }
        },
        update: async ({ where, data }) => {
          if (options.failReceipt) throw new Error('synthetic receipt failure')
          assert(getState().tokens[where.token], 'Receipt must complete an existing claim')
          boundedIndex({ ...getState().tokens[where.token], ...data })
          return Object.assign(getState().tokens[where.token], data)
        },
        findUnique: async ({ where }) => getState().tokens[where.token] || null,
        findMany: async ({ where }) => Object.values(getState().tokens).filter(row => row.identifier.startsWith(where.identifier.startsWith) && row.expires.getTime() > where.expires.gt.getTime()),
      },
      waterLog: { create: async ({ data }) => {
        mustBeAtomic()
        if (options.holdFirstWater && !held) { held = true; entered.resolve(); await release.promise }
        const row = { id: `water-${++nextId}`, ...data }
        getState().water.push(row)
        return row
      },createMany:async({data})=>{mustBeAtomic();for(const row of data)getState().water.push(structuredClone(row));return {count:data.length}} },
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
        findMany: async ({where}={}) => [...sourceFood,...getState().food].filter(row=>(!where?.userId||row.userId===where.userId)&&(!where?.localDate||row.localDate===where.localDate)&&(!where?.id?.in||where.id.in.includes(row.id))),
        createMany:async({data})=>{
          mustBeAtomic()
          for(const row of data){foodAttempts++;if(foodFailures>0||foodAttempts===options.failFoodAttempt){foodFailures=Math.max(0,foodFailures-1);throw new Error('synthetic food write failure')}getState().food.push(structuredClone(row))}
          return {count:data.length}
        },
      },
      symptomAnalysis: { create: async ({ data }) => {
        if (options.failSymptom) throw new Error('synthetic symptom write failure')
        const row = { id: `symptom-${++nextId}`, ...data }; getState().symptoms.push(row); return row
      } },
      exerciseType: { findUnique: async () => ({ id: 1, name: 'yoga', met: 3 }) },
      exerciseEntry: { create: async ({ data }) => { const row = { id: `exercise-${++nextId}`, ...data }; getState().exercise.push(row); return row } },
      $queryRawUnsafe: async (sql, id, userId, localDate, mood, tags, note, context) => { assert.match(sql, /INSERT INTO MoodEntries/); getState().mood.push({ id, userId, localDate, mood, tags, note, context }); return [] },
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
    nativeVoiceFoodCopyVersion:foodCopy.nativeVoiceFoodCopyVersion,nativeVoiceFoodCopyWaterVersion:foodCopy.nativeVoiceFoodCopyWaterVersion,nativeVoiceFoodCopyWaterId:foodCopy.nativeVoiceFoodCopyWaterId,relinkNativeVoiceCopiedDrink:foodCopy.relinkNativeVoiceCopiedDrink,
    saveNativeVoiceMood: (request,userId,draft)=>moodContext.saveNativeVoiceMood({signal:{aborted:false}},userId,draft,{
      userId:async()=>options.unauthorized?null:'synthetic-user',
      call:async(_request,method,body)=>{
        if(method==='POST'){const row={id:`mood-${++nextId}`,userId,...body};state.mood.push(row);return {success:true,id:row.id}}
        return {entries:state.mood}
      },
    }),
    Prisma: { PrismaClientKnownRequestError: SyntheticDuplicate, JsonNull: null }, prisma,
    getServerSession: async () => options.unauthorized ? null : ({ user: { id: 'synthetic-user' } }),
    getUserIdFromNativeAuth: async () => null, authOptions: {},
    verifyNativeVoiceDraft: tokens.verifyNativeVoiceDraft,
    estimateVoiceExerciseDurationMinutes: () => null,
    inferMetAndLabel: ({ durationMinutes }) => ({ durationMinutes, met: 3, label: 'yoga' }),
    getHealthProfileForUser: async () => ({ weightKg: 70 }),
    calculateExerciseCalories: () => 100,
    ensureMoodTables: async () => {},
    deleteNotificationsByType: async () => {},
    beginVoiceActionTrace: () => ({}),
    finishVoiceActionTrace: async (response) => response,
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
  await check('mood saves only the reviewed note; blank never falls back to an unreviewed command', async () => {
    for (const note of ['', 'Exact reviewed note']) {
      const h = harness(), draft = signed({ action: 'mood', transcript: 'Log my mood as five out of seven, command text', mood: { mood: 5, tags: [], note } })
      assert.equal((await h.send(draft)).status, 200); assert.equal(h.state().mood.length, 1); assert.equal(h.state().mood[0].note, note)
    }
  })
  await check('large Unicode result uses bounded ASCII indexed chunks and replays the exact complete result', async () => {
    const h = harness(), draft = signed(), result = { kind: 'recipe_import', message: 'Imported for review only', status: 'imported_not_saved', saved: false, nextRecipeDraft: { title: 'Рецепт 🍲', steps: Array.from({ length: 250 }, (_, index) => `${index}: ${crypto.createHash('sha256').update(`synthetic-${index}`).digest('hex')} — млеко 🥛`) } }
    assert(Buffer.byteLength(JSON.stringify(result)) > 2704)
    await h.route.markReviewTokenUsed('synthetic-user', draft)
    await h.route.completeReviewToken('synthetic-user', draft, result)
    assert.deepEqual(json(await h.route.completedReviewResult('synthetic-user', draft)), result)
    const rows = Object.values(h.state().tokens)
    assert(rows.length > 20)
    assert(rows.every(row => /^[\x00-\x7f]*$/.test(row.identifier) && Buffer.byteLength(row.identifier) + Buffer.byteLength(row.token) + 16 <= 2704))
    assert(rows.every(row => !row.identifier.includes('млеко')))
  })
  await check('missing corrupted foreign expired or extra receipt chunks never prove success', async () => {
    const result = { kind: 'recipe_import', message: 'Imported for review', content: 'Ж'.repeat(5000) }
    for (const alter of [
      rows => { delete rows[Object.keys(rows).find(key => rows[key].identifier.startsWith('native-voice-review-chunk:'))] },
      rows => { const row = Object.values(rows).find(row => row.identifier.startsWith('native-voice-review-chunk:')); row.identifier = row.identifier.slice(0, -1) + 'X' },
      rows => { const row = Object.values(rows).find(row => row.identifier.startsWith('native-voice-review-chunk:')); row.token = 'wrong-chunk-token' },
      rows => { const row = Object.values(rows).find(row => row.identifier.startsWith('native-voice-review-chunk:')); row.expires = new AuditDate(clockMs - 1) },
      rows => { const row = Object.values(rows).find(row => row.identifier.startsWith('native-voice-review-chunk:')); rows['extra-chunk'] = { ...row, token: 'extra-chunk' } },
    ]) {
      const h = harness(), draft = signed(); await h.route.markReviewTokenUsed('synthetic-user', draft); await h.route.completeReviewToken('synthetic-user', draft, result)
      assert.equal(await h.route.completedReviewResult('different-user', draft), null)
      alter(h.state().tokens); assert.equal(await h.route.completedReviewResult('synthetic-user', draft), null)
    }
  })
  await check('legacy small JSON receipts remain readable and chunk garbage collection stays owner scoped', async () => {
    const h = harness(), draft = signed(), digest = h.route.usedReviewTokenDigest(draft.reviewToken)
    const legacy = { kind: 'water', id: 'legacy-water', message: 'Water saved.' }
    h.state().tokens[digest] = { token: digest, identifier: `native-voice-review-result:synthetic-user:${JSON.stringify(legacy)}`, expires: new AuditDate(clockMs + 10000) }
    assert.deepEqual(json(await h.route.completedReviewResult('synthetic-user', draft)), legacy)
    const ownPrefix = h.route.reviewResultChunkPrefix('synthetic-user'), foreignPrefix = h.route.reviewResultChunkPrefix('other-user')
    h.state().tokens.oldOwn = { token: 'oldOwn', identifier: `${ownPrefix}old:0:QQ==`, expires: new AuditDate(clockMs - 1) }
    h.state().tokens.oldForeign = { token: 'oldForeign', identifier: `${foreignPrefix}old:0:QQ==`, expires: new AuditDate(clockMs - 1) }
    await h.route.markReviewTokenUsed('synthetic-user', signed())
    assert.equal(h.state().tokens.oldOwn, undefined); assert(h.state().tokens.oldForeign)
  })
  await check('a mid-chunk failure rolls back food water and every receipt row together; retry saves once', async () => {
    const h = harness({ chunkFailures: 1 }), draft = signed()
    const run = () => h.route.prisma.$transaction(async tx => {
      await h.route.markReviewTokenUsed('synthetic-user', draft, tx)
      const result = await h.route.saveWater('synthetic-user', draft, tx)
      await h.route.completeReviewToken('synthetic-user', draft, { ...result, detail: 'Ж'.repeat(10000) }, tx)
    })
    await assert.rejects(run(), /chunk write failure/)
    assert.equal(h.state().water.length, 0); assert.equal(Object.keys(h.state().tokens).length, 0)
    await run(); assert.equal(h.state().water.length, 1); assert.equal((await h.route.completedReviewResult('synthetic-user', draft)).kind, 'water')
  })
  await check('receipt count and byte limits refuse oversized results before any chunk is published', async () => {
    const h = harness(), draft = signed(); await h.route.markReviewTokenUsed('synthetic-user', draft)
    await assert.rejects(h.route.completeReviewToken('synthetic-user', draft, { kind: 'recipe_import', message: 'Imported', detail: 'x'.repeat(8 * 1024 * 1024) }), /too large/)
    assert.equal(Object.keys(h.state().tokens).length, 1); assert.equal(await h.route.completedReviewResult('synthetic-user', draft), null)
  })
  await check('first success requires full stored receipt readback even if the chunk writer reports success', async () => {
    const h = harness({ ignoreChunkWrites: true })
    const response = await h.send(signed())
    assert.equal(response.status, 500); assert.match(response.body.error, /receipt could not be verified/)
    assert.equal(h.state().water.length, 0); assert.equal(Object.keys(h.state().tokens).length, 0)
  })
  await check('signed explicit exercise clock time persists once and absent time keeps normal manual behavior', async () => {
    const h = harness()
    const draft = signed({ action: 'exercise', localDate: '2026-06-15', localTime: '19:30', tzOffsetMin: -600, exercise: { exerciseTypeId: 1, exerciseName: 'yoga', durationMinutes: 20 } })
    const saved = await h.send(draft); const replay = await h.send(draft)
    assert.equal(saved.status, 200); assert.equal(replay.body.idempotentReplay, true); assert.equal(h.state().exercise.length, 1)
    assert.equal(h.state().exercise[0].startTime.toISOString(), '2026-06-15T09:30:00.000Z'); assert.equal(h.state().exercise[0].localDate, '2026-06-15')
    const noTime = harness(); assert.equal((await noTime.send(signed({ action: 'exercise', exercise: { exerciseTypeId: 1, exerciseName: 'yoga', durationMinutes: 20 } }))).status, 200)
    assert.equal(noTime.state().exercise[0].startTime, null)
    const invalid = harness(); const bad = signed({ action: 'exercise', localTime: '25:30', tzOffsetMin: -600, exercise: { exerciseTypeId: 1, exerciseName: 'yoga', durationMinutes: 20 } })
    assert.equal((await invalid.send(bad)).status, 500); assert.equal(invalid.state().exercise.length, 0)
  })
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
      water: { amount: 300, unit: 'ml', amountMl: 300, drinkType: 'Coffee', label: 'Coffee with milk and sugar', category: 'snacks', sweetener: { type: 'sugar', amount: 2, unit: 'tsp', grams: 8 } },
      food: { meal: 'snacks', nutrition: { calories: 64 }, items: [
        foodItem({ name: 'Coffee', calories: 2, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }),
        foodItem({ name: 'Milk', calories: 30, protein_g: 1.6, carbs_g: 2.4, fat_g: 1.6, fiber_g: 0, sugar_g: 2.4 }),
        foodItem({ name: 'Sugar', serving_size: '8 g', calories: 32, protein_g: 0, carbs_g: 8, fat_g: 0, fiber_g: 0, sugar_g: 8,
          nutritionCoversServing: true, __voiceSourceFood: { id: 'synthetic-sugar', name: 'Sugar', calories: 400, protein_g: 0, carbs_g: 100, fat_g: 0, fiber_g: 0, sugar_g: 100 } }),
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
      const grams = type === 'sugar' ? 8 : 21
      const draft = signed({
        transcript: `Log 250 ml water with ${type}`,
        water: { amount: 250, unit: 'ml', amountMl: 250, drinkType: 'Water', label: `Water with ${type}`,
          sweetener: { type, amount: grams, unit: 'g', grams }, ingredients: [{ name: 'Water' }, { name: type }] },
        food: { meal: 'uncategorized', nutrition: { calories }, items: [
          foodItem({ name: type, serving_size: `${grams} g`, calories, protein_g: 0, fat_g: 0, carbs_g: carbs, fiber_g: 0, sugar_g: carbs,
            nutritionCoversServing: true, __voiceSourceFood: { id: `synthetic-${type}`, name: type, calories: calories * 100 / grams, protein_g: 0, fat_g: 0, carbs_g: carbs * 100 / grams, fiber_g: 0, sugar_g: carbs * 100 / grams } }),
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
    const copySources=[
      { id: 'source-a',userId:'synthetic-user',localDate:'2026-10-14', name: 'First food', meal: 'lunch', category: 'lunch', nutrients: { calories: 100 }, items: [] },
      { id: 'source-b',userId:'synthetic-user',localDate:'2026-10-14', name: 'Second food', meal: 'lunch', category: 'lunch', nutrients: { calories: 200 }, items: [] },
    ]
    const copied = harness({ failFoodAttempt: 2, sourceFood:copySources })
    const copy = signed({ action: 'food_copy_previous', localTime: '12:30', tzOffsetMin: -660, food: {sourceDate:'2026-10-14',sourceVersions:copySources.map(row=>({id:row.id,version:foodCopy.nativeVoiceFoodCopyVersion(row)})),sourceWaterVersions:[],sourceLogIds: ['source-a', 'source-b'] } })
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
