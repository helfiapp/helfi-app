#!/usr/bin/env node
'use strict'
// Actual record-action module; synthetic owned records and route replies only.
// No app import, environment file, provider, credential or database is available.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'lib/native-voice-record-actions.ts'), 'utf8')
const ast = ts.createSourceFile('record-actions.ts', source, ts.ScriptTarget.Latest, true)
const printer = ts.createPrinter()
const stripped = ast.statements.filter((item) => !ts.isImportDeclaration(item)).map((item) => printer.printNode(ts.EmitHint.Unspecified, item, ast)).join('\n').replace(/^export\s+/gm, '')
const intakeSource = fs.readFileSync(path.join(root, 'lib/native-voice-health-intake-record-actions.ts'), 'utf8')
const intakeAst = ts.createSourceFile('health-intake-actions.ts', intakeSource, ts.ScriptTarget.Latest, true)
const intakePredicate = intakeAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'isHealthIntakeRecordEntity').getText(intakeAst).replace(/^export\s+/, '')
const drinkLabelSource = fs.readFileSync(path.join(root, 'lib/native-voice-drink-label.ts'), 'utf8').replace(/^export\s+/gm, '')
const ctx = vm.createContext({ crypto, URL, Headers, Date, console, require() { throw Error('App import forbidden in offline record tests') } })
vm.runInContext(ts.transpileModule(`${drinkLabelSource}\n${intakePredicate}\n${stripped}`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, ctx)
const copy = (value) => JSON.parse(JSON.stringify(value))
const request = { url: 'https://helfi.invalid/api/native/voice-assistant', headers: new Headers({ authorization: 'Bearer synthetic-auth' }) }
const date = '2026-10-17'
const user = 'synthetic-user'
function loadRoute(relative, fixtures) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8')
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true)
  const stripped = ast.statements.filter((item) => !ts.isImportDeclaration(item)).map((item) => printer.printNode(ts.EmitHint.Unspecified, item, ast)).join('\n').replace(/^export\s+/gm, '')
  const context = vm.createContext({ URL, Date, resizeNativeVoiceDrinkLabel: ctx.resizeNativeVoiceDrinkLabel, console: { log() {}, warn() {}, error() {} }, ...fixtures })
  vm.runInContext(ts.transpileModule(stripped, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, context)
  return context
}
const resolvedFoodSource = loadRoute('lib/native-voice-resolved-food.ts', {})
ctx.validateNativeVoiceResolvedFood = resolvedFoodSource.validateNativeVoiceResolvedFood
function atomicDb(initial, failFood = false) {
  let state = structuredClone(initial)
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  function client(get) {
    const match = (row, where) => Object.entries(where).every(([key, value]) => ['nutrients', 'items'].includes(key) ? equal(row[key], value.equals) : equal(row[key], value))
    return {
      waterLog: { findFirst: async ({ where }) => get().water.find((row) => match(row, where)) || null,
        findMany: async ({ where }) => get().water.filter(row => match(row, where)),
        updateMany: async ({ where, data }) => { const found = get().water.filter((row) => match(row, where)); found.forEach((row) => Object.assign(row, data)); return { count: found.length } },
        deleteMany: async ({ where }) => { const before = get().water.length; get().water = get().water.filter((row) => !match(row, where)); return { count: before - get().water.length } } },
      foodLog: { findMany: async ({ where }) => get().food.filter((row) => row.userId === where.userId),
        updateMany: async ({ where, data }) => { if (failFood) throw Error('synthetic linked food failure'); const found = get().food.filter((row) => match(row, where)); found.forEach((row) => Object.assign(row, data)); return { count: found.length } },
        deleteMany: async ({ where }) => { if (failFood) throw Error('synthetic linked food failure'); const before = get().food.length; get().food = get().food.filter((row) => !(row.userId === where.userId && where.id.in.includes(row.id))); return { count: before - get().food.length } },
        create: async ({ data }) => { if (failFood) throw Error('synthetic linked food create failure'); const row = { id: `new-linked-${get().food.length}`, ...data }; get().food.push(row); return row } },
    }
  }
  const db = client(() => state)
  db.$executeRawUnsafe = async () => 0
  db.user = { findUnique: async () => ({ id: user }) }
  db.$transaction = async (run) => { const working = structuredClone(state); const result = await run(client(() => working)); state = working; return result }
  return { db, state: () => state }
}
const sample = (id, values = {}) => ({ id, userId: user, name: 'Coffee', label: 'Water', localDate: date, mood: 5, note: 'Original note', content: 'Original content', title: 'Original title', tags: ['calm'], amount: 250, unit: 'ml', source: 'MANUAL', images: ['synthetic-photo'], audio: ['synthetic-audio'], nutrients: { calories: 100, fiber_g: null }, items: [{ name: 'synthetic ingredient', calories: 100 }], ...values })
function resolvedItem(id, amount, nutrition) {
  const source = { id, name: id, source: 'synthetic-test', ...nutrition }
  const item = { id, name: id, serving_size: `${amount} ml`, nutritionCoversServing: true, __voiceSourceFood: source }
  for (const [key, value] of Object.entries(nutrition)) item[key] = value === null ? null : value * amount / 100
  return item
}
function resolvedMeal(items) {
  const nutrition = {}
  for (const [primary, alias] of [['calories', 'calories_kcal'], ['protein_g', 'protein'], ['carbs_g', 'carbs'], ['fat_g', 'fat'], ['fiber_g', 'fiber'], ['sugar_g', 'sugar']]) {
    const values = items.map((item) => item[primary])
    nutrition[primary] = nutrition[alias] = values.some((value) => value == null) ? null : values.reduce((sum, value) => sum + value, 0)
  }
  return { meal: 'lunch', mealName: 'Resolved meal', items, nutrition }
}
const trusted = (food) => food.items.map((item) => item.__voiceSourceFood)
function fixture(entity, records, options = {}) {
  let state = copy(records)
  const writes = []
  const io = async (_request, call) => {
    assert.equal(_request, request, 'Original authenticated request must reach adapter')
    if (call.method === 'GET') {
      if (call.entity === 'food' && options.sourceFood) return Array.isArray(options.sourceFood) ? { logs: copy(options.sourceFood) } : { log: copy(options.sourceFood) }
      return call.entity === 'favorite' || call.entity === 'custom_food' ? { favorites: copy(state), voiceLibraryVersion: crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex') } : { entries: copy(state) }
    }
    writes.push(copy(call))
    if (options.failWrite) throw new Error('synthetic handler rejected action')
    if (options.skipWrite) return { success: true }
    if (call.entity === 'favorite' || call.entity === 'custom_food') {
      const mutation = call.body.voiceFavoriteMutation
      assert.equal(mutation.expectedVersion, crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex'))
      state = mutation.operation === 'delete' ? state.filter((row) => row.id !== mutation.id)
        : mutation.operation === 'create' ? [...state, { ...copy(mutation.changes), id: mutation.id }]
        : state.map((row) => row.id === mutation.id ? { ...row, ...copy(mutation.changes) } : row)
    }
    else if (call.method === 'DELETE') state = state.filter((row) => row.id !== call.id)
    else state = state.map((row) => row.id === call.id ? { ...row, ...copy(call.body), ...(call.body.nutrition ? { nutrients: copy(call.body.nutrition) } : {}) } : row)
    return { success: true }
  }
  return { io, writes, state: () => state, mutate: (fn) => { state = fn(state) } }
}
let passed = 0
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`) }
const prepare = (f, command) => ctx.prepareNativeVoiceRecordAction(request, user, { localDate: date, ...command }, f.io)
const execute = (f, action) => ctx.executeNativeVoiceRecordAction(request, user, action, f.io)
async function run() {
  const changes = { food: { name: 'Updated food' }, water: { amount: 500 }, mood: { mood: 2 }, journal: { content: 'Updated note' }, mood_journal: { content: 'Updated journal' }, exercise: { durationMinutes: 20 }, favorite: { label: 'Updated favorite' }, custom_food: { label: 'Updated custom meal' } }
  for (const [entity, edit] of Object.entries(changes)) {
    await check(`${entity} update is review-first, owner-selected and preserves unrelated data`, async () => {
      const f = fixture(entity, [sample('selected', { customMeal: entity === 'custom_food' }), sample('other', { name: 'Other food', label: 'Other favorite' })])
      const proposal = await prepare(f, { entity, operation: 'update', id: 'selected', changes: edit })
      assert.equal(proposal.canConfirm, true, proposal.confirmationMessage); assert.equal(f.writes.length, 0)
      const result = await execute(f, proposal.recordAction)
      assert.equal(result.id, 'selected'); assert.equal(result.operation, 'update'); assert.equal(f.state()[1].name, 'Other food')
      if (entity === 'food') { assert.equal(f.state()[0].nutrients.fiber_g, null); assert.equal(f.state()[0].items.length, 1) }
      if (entity === 'mood_journal') { assert.equal(f.state()[0].images.length, 1); assert.equal(f.state()[0].audio.length, 1) }
    })
    await check(`${entity} deletes only selected identity and verifies disappearance`, async () => {
      const f = fixture(entity, [sample('selected', { customMeal: entity === 'custom_food' }), sample('other')])
      const proposal = await prepare(f, { entity, operation: 'delete', id: 'selected' })
      assert.equal(proposal.canConfirm, true); assert.equal(f.writes.length, 0)
      const result = await execute(f, proposal.recordAction)
      assert.equal(result.operation, 'delete'); assert.equal(f.state().length, 1); assert.equal(f.state()[0].id, 'other')
    })
  }
  await check('ambiguous names and fabricated IDs never prepare a write', async () => {
    const f = fixture('food', [sample('one'), sample('two')])
    for (const command of [{ query: 'Coffee' }, { id: 'invented-id' }]) {
      const proposal = await prepare(f, { entity: 'food', operation: 'delete', ...command })
      assert.equal(proposal.canConfirm, false); assert.equal(proposal.recordAction.beforeHash, undefined)
      assert.equal(proposal.recordAction.operation, 'delete')
    }
    assert.equal(f.writes.length, 0)
  })
  await check('other-account results, imported exercise, unsupported entities and fields are refused', async () => {
    const foreign = fixture('food', [sample('foreign', { userId: 'different-user' })])
    assert.equal((await prepare(foreign, { entity: 'food', operation: 'delete', id: 'foreign' })).canConfirm, false)
    const imported = fixture('exercise', [sample('selected', { source: 'APPLE_HEALTH' })])
    assert.equal((await prepare(imported, { entity: 'exercise', operation: 'update', id: 'selected', changes: { durationMinutes: 20 } })).canConfirm, false)
    const f = fixture('food', [sample('selected')])
    for (const changes of [{ userId: 'other' }, { mood: 999 }, { name: '' }, { items: [] }]) assert.equal((await prepare(f, { entity: 'food', operation: 'update', id: 'selected', changes })).canConfirm, false)
    assert.equal((await prepare(f, { entity: 'https://outside.invalid', operation: 'delete' })).canConfirm, false)
  })
  await check('changed record or library list requires fresh review before any mutation', async () => {
    for (const entity of ['food', 'favorite']) {
      const f = fixture(entity, [sample('selected')])
      const p = await prepare(f, { entity, operation: 'delete', id: 'selected' })
      f.mutate((state) => [...state.map((row) => ({ ...row, note: 'Changed elsewhere' })), sample('new')])
      await assert.rejects(execute(f, p.recordAction), /changed after/); assert.equal(f.writes.length, 0)
    }
  })
  await check('calorie drink quantity dispatch explicitly covers whole drink and reviewed state', async () => {
    const f = fixture('water', [sample('selected', { label: 'Coffee with milk' })])
    const p = await prepare(f, { entity: 'water', operation: 'update', id: 'selected', changes: { amount: 500 } })
    assert.equal(p.canConfirm, true); await execute(f, p.recordAction)
    assert.equal(f.writes[0].body.wholeDrinkVolume, true); assert.equal(f.writes[0].body.expectedWaterState.amount, 250)
  })
  await check('actual water date move verifies destination-day exact ID after one atomic write and keeps linked food', async () => {
    const movedDate = '2026-10-16'
    const water = { id: 'selected', userId: user, amount: 250, unit: 'ml', amountMl: 250, label: 'Coffee with milk', category: 'lunch', localDate: date, createdAt: '2026-10-17T01:00:00.000Z' }
    const linked = sample('linked-food', { nutrients: { calories: 100, fiber_g: null, __waterLogId: water.id }, createdAt: water.createdAt })
    for (const skipWrite of [false, true]) {
      const f = atomicDb({ water: [water], food: [linked] }), calls = []
      let writeCount = 0
      const NextResponse = { json: (body, options) => new Response(JSON.stringify(body), { status: options?.status || 200 }) }
      const shared = { prisma: f.db, authOptions: {}, getServerSession: async () => ({ user: { email: 'synthetic@example.invalid' } }), getUserIdFromNativeAuth: async () => user, NextResponse, Prisma: { PrismaClientKnownRequestError: class extends Error {} }, deleteSmartCoachNotificationsByCategories: async () => {} }
      const normalGet = loadRoute('app/api/water-log/route.ts', shared), normalMutation = loadRoute('app/api/water-log/[id]/route.ts', shared)
      const io = async (original, call) => {
        calls.push(copy(call)); assert.equal(original, request)
        const req = { url: `https://helfi.invalid/api/water-log?localDate=${call.localDate}`, json: async () => call.body }
        if (call.method === 'GET') return (await normalGet.GET(req)).json()
        writeCount++
        if (skipWrite) return { success: true }
        const response = await normalMutation.PATCH(req, { params: { id: call.id } })
        assert.equal(response.status, 200); return response.json()
      }
      const proposal = await prepare({ io }, { entity: 'water', operation: 'update', id: 'selected', changes: { localDate: movedDate } })
      assert.equal(proposal.canConfirm, true); assert.equal(writeCount, 0)
      if (skipWrite) await assert.rejects(execute({ io }, proposal.recordAction), /not confirmed the updated/)
      else {
        const result = await execute({ io }, proposal.recordAction)
        assert.equal(result.id, 'selected'); assert.equal(f.state().water[0].localDate, movedDate); assert.equal(f.state().food[0].localDate, movedDate)
        assert.equal(f.state().food[0].nutrients.calories, 100); assert.equal(f.state().food[0].nutrients.fiber_g, null)
      }
      assert.equal(writeCount, 1); assert.equal(calls.at(-1).localDate, movedDate); assert.equal(f.state().water.length, 1)
    }
  })
  await check('actual mood journal date move reads the destination date and preserves media with no duplicate write', async () => {
    for (const skipWrite of [false, true]) {
      let journal = sample('selected'), writes = 0
      const calls = [], movedDate = '2026-10-16'
      const db = { user: { findUnique: async () => ({ id: user }) },
        $queryRawUnsafe: async (sql, owner, first, last) => {
          assert.equal(owner, user)
          if (sql.includes('localDate BETWEEN')) return journal.localDate >= first && journal.localDate <= last ? [copy(journal)] : []
          assert.equal(first, journal.id); return [copy(journal)]
        },
        $executeRawUnsafe: async (_sql, localDate, title, content, images, tags, audio, prompt, template, owner, id) => {
          writes++; assert.equal(owner, user); assert.equal(id, journal.id)
          if (!skipWrite) journal = { ...journal, localDate, title, content, images: JSON.parse(images), tags: JSON.parse(tags), audio: JSON.parse(audio), prompt, template }
          return 1
        },
      }
      const shared = { prisma: db, ensureMoodTables: async () => {}, authOptions: {}, getServerSession: async () => ({ user: { email: 'synthetic@example.invalid' } }), getUserIdFromNativeAuth: async () => user, NextResponse: { json: (body, options) => new Response(JSON.stringify(body), { status: options?.status || 200 }) }, extractScopedBlobPath: () => null, mapToSignedBlobUrl: () => null, isObjectStorageConfigured: () => false }
      const normalGet = loadRoute('app/api/mood/journal/entries/route.ts', shared), normalMutation = loadRoute('app/api/mood/journal/entries/[id]/route.ts', shared)
      const io = async (_original, call) => {
        calls.push(copy(call))
        const req = { url: `https://helfi.invalid/api/mood/journal/entries?start=${call.localDate}&end=${call.localDate}&limit=100`, json: async () => call.body }
        const response = call.method === 'GET' ? await normalGet.GET(req) : await normalMutation.PUT(req, { params: { id: call.id } })
        assert.equal(response.status, 200); return response.json()
      }
      const proposal = await prepare({ io }, { entity: 'mood_journal', operation: 'update', id: 'selected', changes: { localDate: movedDate } })
      assert.equal(proposal.canConfirm, true); assert.equal(writes, 0)
      if (skipWrite) await assert.rejects(execute({ io }, proposal.recordAction), /not confirmed the updated/)
      else {
        assert.equal((await execute({ io }, proposal.recordAction)).id, journal.id)
        assert.equal(journal.localDate, movedDate); assert.deepEqual(journal.images, ['synthetic-photo']); assert.deepEqual(journal.audio, ['synthetic-audio']); assert.equal(journal.content, 'Original content')
      }
      assert.equal(writes, 1); assert.equal(calls.at(-1).localDate, movedDate)
    }
  })
  await check('actual exercise PATCH verifies nested rounded calorie override and removal against stored calories', async () => {
    for (const override of [150, 150.4, null]) for (const scenario of ['success', 'skipped', 'wrong-calories']) {
      let exercise = sample('selected', { durationMinutes: 30, distanceKm: null, startTime: null, exerciseTypeId: 1, exerciseType: { id: 1, name: 'Walking', met: 3 }, calories: 100, rawPayload: { caloriesOverride: 100, preserved: true } })
      let writes = 0
      const db = { exerciseEntry: {
        findUnique: async ({ where }) => where.id === exercise.id ? copy(exercise) : null,
        findMany: async ({ where }) => exercise.userId === where.userId && exercise.localDate === where.localDate ? [copy(exercise)] : [],
        update: async ({ where, data }) => { writes++; assert.equal(where.id, exercise.id); if (scenario !== 'skipped') exercise = { ...exercise, ...data, ...(scenario === 'wrong-calories' ? { calories: 999 } : {}) }; return copy(exercise) },
      } }
      const shared = { prisma: db, Prisma: { DbNull: null }, authOptions: {}, getServerSession: async () => ({ user: { id: user } }), getUserIdFromNativeAuth: async () => user, NextResponse: { json: (body, options) => new Response(JSON.stringify(body), { status: options?.status || 200 }) }, inferMetAndLabel: input => ({ met: 3, label: 'Walking', durationMinutes: input.durationMinutes }), getHealthProfileForUser: async () => ({ weightKg: 60 }), calculateExerciseCalories: () => 90 }
      const normalGet = loadRoute('app/api/exercise-entries/route.ts', shared), normalMutation = loadRoute('app/api/exercise-entries/[id]/route.ts', shared)
      const io = async (_original, call) => {
        const req = { nextUrl: new URL(`https://helfi.invalid/api/exercise-entries?date=${call.localDate}`), json: async () => call.body }
        const response = call.method === 'GET' ? await normalGet.GET(req) : await normalMutation.PATCH(req, { params: { id: call.id } })
        assert.equal(response.status, 200); return response.json()
      }
      const proposal = await prepare({ io }, { entity: 'exercise', operation: 'update', id: 'selected', changes: { caloriesOverride: override } })
      assert.equal(proposal.canConfirm, true, proposal.confirmationMessage); assert.equal(writes, 0)
      assert.equal(proposal.recordAction.changes.caloriesOverride, override === null ? null : 150)
      assert.match(proposal.summary, override === null ? /calories to none/ : /calories to 150/)
      if (scenario === 'skipped' || scenario === 'wrong-calories' && override !== null) await assert.rejects(execute({ io }, proposal.recordAction), /(?:does|do) not yet match/)
      else {
        assert.equal((await execute({ io }, proposal.recordAction)).id, 'selected')
        assert.equal(exercise.rawPayload.caloriesOverride ?? null, override === null ? null : 150)
        if (scenario === 'success') assert.equal(exercise.calories, override === null ? 90 : 150)
        assert.equal(exercise.rawPayload.preserved, true); assert.equal(exercise.caloriesOverride, undefined)
      }
      assert.equal(writes, 1)
    }
    const f = fixture('exercise', [sample('selected')])
    for (const override of ['150', 0, -1, 0.1, 50001, Infinity, NaN]) assert.equal((await prepare(f, { entity: 'exercise', operation: 'update', id: 'selected', changes: { caloriesOverride: override } })).canConfirm, false)
    assert.equal(f.writes.length, 0)
  })
  await check('handler error or skipped write never produces a false completed result', async () => {
    for (const option of [{ failWrite: true }, { skipWrite: true }]) {
      const f = fixture('mood', [sample('selected')], option)
      const p = await prepare(f, { entity: 'mood', operation: 'update', id: 'selected', changes: { mood: 2 } })
      await assert.rejects(execute(f, p.recordAction), /rejected|does not yet match/)
    }
    const f = fixture('favorite', [sample('selected')], { skipWrite: true })
    const p = await prepare(f, { entity: 'favorite', operation: 'delete', id: 'selected' })
    await assert.rejects(execute(f, p.recordAction), /not confirmed removal/)
  })
  await check('favorite/custom creation uses a real owned saved-food identity and retains library', async () => {
    for (const entity of ['favorite', 'custom_food']) {
      const f = fixture(entity, [sample('existing')], { sourceFood: sample('saved-meal') })
      const p = await prepare(f, { entity, operation: 'create', sourceFoodId: 'saved-meal', changes: { label: 'Chosen saved meal' } })
      assert.equal(p.canConfirm, true, p.confirmationMessage); assert.equal(f.writes.length, 0)
      await execute(f, p.recordAction)
      assert.equal(f.state().length, 2); assert.equal(f.state()[0].id, 'existing'); assert.equal(f.state()[1].label, 'Chosen saved meal')
      if (entity === 'custom_food') assert.equal(f.state()[1].customMeal, true)
      assert.equal((await prepare(f, { entity, operation: 'create', sourceFoodId: 'invented' })).canConfirm, false)
    }
  })
  await check('favorite source resolves spoken meal name and preserves ambiguous command with readable options', async () => {
    const first = sample('first-meal', { name: 'Oatmeal', createdAt: '2026-10-17T07:00:00.000Z' })
    const second = sample('second-meal', { name: 'Oatmeal', createdAt: '2026-10-17T09:00:00.000Z' })
    const f = fixture('favorite', [], { sourceFood: [first, second] })
    const ambiguous = await prepare(f, { entity: 'favorite', operation: 'create', query: 'Oatmeal', changes: { label: 'Breakfast oats' } })
    assert.equal(ambiguous.canConfirm, false); assert.equal(ambiguous.choices.length, 2)
    assert.equal(ambiguous.recordAction.query, 'Oatmeal'); assert.equal(ambiguous.recordAction.changes.label, 'Breakfast oats')
    assert.match(ambiguous.confirmationMessage, /Oatmeal.*07:00 UTC.*Oatmeal.*09:00 UTC/)
    assert.equal(ambiguous.choices[1].sourceFoodId, 'second-meal')
    const picked = await prepare(f, { ...ambiguous.recordAction, sourceFoodId: ambiguous.choices[1].sourceFoodId })
    assert.equal(picked.canConfirm, true); assert.equal(picked.recordAction.sourceFoodId, 'second-meal'); assert.notEqual(picked.recordAction.id, 'second-meal')
    const single = fixture('favorite', [], { sourceFood: [first] })
    const unique = await prepare(single, { entity: 'favorite', operation: 'create', query: 'Oatmeal' })
    assert.equal(unique.canConfirm, true); assert.equal(unique.recordAction.sourceFoodId, 'first-meal')
  })
  await check('review summaries use plain labels instead of implementation fields or JSON', async () => {
    const f = fixture('exercise', [sample('selected')])
    const p = await prepare(f, { entity: 'exercise', operation: 'update', id: 'selected', changes: { durationMinutes: 20, distanceKm: 3 } })
    assert.equal(p.canConfirm, true); assert.match(p.summary, /duration in minutes to 20.*distance in kilometres to 3/)
    assert.doesNotMatch(p.summary, /durationMinutes|distanceKm|[{}]/)
  })
  await check('favorite nutrition review retains recipe metadata and unknown optional nutrients', async () => {
    const recipe = { title: 'Saved recipe', servings: 4, steps: ['Cook.'] }
    const f = fixture('favorite', [sample('selected', { nutrition: { calories: 100, fiber_g: null, __importRecipe: recipe }, total: { calories: 100, __portionScale: 0.25 } })])
    const p = await prepare(f, { entity: 'favorite', operation: 'update', id: 'selected', changes: { nutrition: { calories: 120 } } })
    assert.equal(p.canConfirm, true)
    assert.equal(p.recordAction.changes.nutrition.calories, 120); assert.equal(p.recordAction.changes.nutrition.fiber_g, null)
    assert.equal(p.recordAction.changes.nutrition.__importRecipe.title, 'Saved recipe'); assert.equal(p.recordAction.changes.nutrition.__portionScale, 0.25)
    await execute(f, p.recordAction)
  })
  await check('resolved food edit preserves untouched ingredients, timestamp and prior eaten share; stale selection is rejected', async () => {
    const chicken = resolvedItem('Chicken', 200, { calories: 200, protein_g: 30, carbs_g: 0, fat_g: 5, fiber_g: null, sugar_g: 0 })
    const rice = resolvedItem('Rice', 100, { calories: 130, protein_g: 3, carbs_g: 28, fat_g: 1, fiber_g: 0, sugar_g: 0 })
    const old = resolvedMeal([chicken, rice]); old.nutrition.__portionScale = 0.5
    const original = sample('selected', { name: 'Lunch', createdAt: '2026-10-17T01:00:00.000Z', nutrients: old.nutrition, items: old.items })
    const f = fixture('food', [original])
    const selected = await ctx.selectNativeVoiceFoodRecordForEdit(request, user, { entity: 'food', query: 'Lunch', localDate: date }, f.io)
    assert(selected.selection); assert.equal(f.writes.length, 0)
    const replacement = resolvedMeal([chicken, resolvedItem('Rice', 200, rice.__voiceSourceFood)])
    const p = await ctx.prepareNativeVoiceResolvedFoodRecordAction(request, user, selected.selection, replacement, { trustedSources: trusted(replacement) }, f.io)
    assert.equal(p.canConfirm, true, p.confirmationMessage)
    assert.equal(p.recordAction.changes.nutrition.calories, 330); assert.equal(p.recordAction.changes.nutrition.__portionScale, 0.5)
    assert.equal(JSON.stringify(p.recordAction.changes.items[0]), JSON.stringify(chicken))
    await execute(f, p.recordAction); assert.equal(f.state()[0].createdAt, original.createdAt)
    const stale = await ctx.prepareNativeVoiceResolvedFoodRecordAction(request, user, selected.selection, replacement, { trustedSources: trusted(replacement) }, f.io)
    assert.equal(stale.canConfirm, false); assert.match(stale.confirmationMessage, /changed while resolving/)
  })
  await check('resolved source boundary rejects forged source, invented nutrition, missing ingredients and optional-zero substitution', async () => {
    const item = resolvedItem('Milk', 100, { calories: 61, protein_g: 3, carbs_g: 5, fat_g: 3, fiber_g: null, sugar_g: 5 })
    const food = resolvedMeal([item])
    for (const mutate of [
      (value) => { value.items[0].__voiceSourceFood.id = 'invented' },
      (value) => { value.items[0].calories = 10; value.nutrition.calories = value.nutrition.calories_kcal = 10 },
      (value) => { value.items[0].fiber_g = 0; value.nutrition.fiber_g = value.nutrition.fiber = 0 },
      (value) => { value.nutrition.protein_g = value.nutrition.protein = 999 },
      (value) => { value.items = [] },
    ]) { const broken = copy(food); mutate(broken); assert.throws(() => ctx.validateNativeVoiceResolvedFood(broken, trusted(food))) }
    assert.equal(ctx.validateNativeVoiceResolvedFood(food, trusted(food)).nutrition.fiber_g, null)
  })
  await check('linked drink ingredient review states all exact new quantities, portion, totals and disclosed source before any write', async () => {
    const coffee = resolvedItem('Coffee', 250, { calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 })
    const milk = resolvedItem('Milk', 25, { calories: 61, protein_g: 3, carbs_g: 5, fat_g: 3, fiber_g: null, sugar_g: 5 })
    const sugar = resolvedItem('Sugar', 8, { calories: 400, protein_g: 0, carbs_g: 100, fat_g: 0, fiber_g: 0, sugar_g: 100 }); sugar.serving_size = '8 g'
    const original = resolvedMeal([coffee, milk, sugar])
    const water = sample('water', { label: 'Coffee with 8 g sugar with 25 ml milk', amountMl: 250 })
    const linked = sample('linked', { name: water.label, nutrients: { ...original.nutrition, __waterLogId: water.id }, items: original.items })
    const f = fixture('water', [water], { sourceFood: linked })
    const selection = await ctx.selectNativeVoiceFoodRecordForEdit(request, user, { entity: 'water', id: 'water', localDate: date }, f.io)
    assert(selection.selection)
    const replacement = { ...resolvedMeal([coffee, resolvedItem('Milk', 50, milk.__voiceSourceFood), sugar]), sourceNote: 'The matching nutrition uses Canadian menu data.' }
    const prepared = await ctx.prepareNativeVoiceResolvedFoodRecordAction(request, user, selection.selection, replacement, { trustedSources: trusted(replacement) }, f.io)
    assert.equal(prepared.canConfirm, true, prepared.confirmationMessage); assert.equal(f.writes.length, 0)
    for (const review of [prepared.summary, prepared.confirmationMessage]) for (const expected of ['Coffee: 250 ml', 'Milk: 50 ml', 'Sugar: 8 g', 'Consumed portion: all listed ingredient amounts', 'calories: 65 kcal', 'protein: 1.5 g', 'carbohydrate: 10.5 g', 'fat: 1.5 g', 'fibre: unknown', 'sugar: 10.5 g', date, replacement.sourceNote]) assert(review.includes(expected), `Complete drink review retains ${expected}`)
    assert.equal(prepared.recordAction.resolvedDrinkFood.food.items[1].serving_size, '50 ml'); assert.equal(prepared.recordAction.resolvedDrinkFood.food.nutrition.fiber_g, null)
    assert(prepared.confirmationMessage.endsWith('Would you like me to save this exact change?'))
  })
  await check('food edit review separates complete ingredient basis from actual consumed half portion and unknown nutrients', async () => {
    const item = resolvedItem('Milk', 100, { calories: 60, protein_g: 4, carbs_g: 5, fat_g: 3, fiber_g: null, sugar_g: 0 })
    const full = resolvedMeal([item]), old = { ...full.nutrition, __portionScale: 0.5 }
    const f = fixture('food', [sample('selected', { items: full.items, nutrients: old })])
    const selection = await ctx.selectNativeVoiceFoodRecordForEdit(request, user, { entity: 'food', id: 'selected', localDate: date }, f.io)
    const prepared = await ctx.prepareNativeVoiceResolvedFoodRecordAction(request, user, selection.selection, full, { trustedSources: trusted(full) }, f.io)
    assert.equal(prepared.canConfirm, true); assert.equal(f.writes.length, 0)
    for (const expected of ['Milk: 100 ml', 'Consumed portion: 50%', 'calories: 30 kcal', 'protein: 2 g', 'fibre: unknown', 'sugar: 0 g']) assert(prepared.confirmationMessage.includes(expected), expected)
  })
  await check('new resolved and owned-food library reviews include every ingredient, yield, full steps and stored portion without claiming eating', async () => {
    const item = resolvedItem('Milk', 100, { calories: 60, protein_g: 4, carbs_g: 5, fat_g: 3, fiber_g: null, sugar_g: 0 })
    const food = resolvedMeal([item])
    food.nutrition.__importRecipe = { title: 'Exact recipe', servings: 4, prepMinutes: 10, cookMinutes: 15, ingredients: ['100 ml Milk'], steps: Array.from({ length: 100 }, (_, i) => `Exact full cooking step ${i + 1}: ${'keep these actual instructions '.repeat(4)}`), sourceUrl: 'https://recipes.example/exact' }
    Object.assign(food.nutrition, { __portionUnit: 'serving', __portionAmount: 4, __portionRecipeServings: 4 })
    for (const entity of ['favorite', 'custom_food']) {
      const f = fixture(entity, [sample('existing')], { sourceFood: sample('source', { items: food.items, nutrients: food.nutrition }) })
      const direct = await ctx.prepareNativeVoiceFoodLibraryFromResolved(request, user, { entity, localDate: date, label: 'Chosen recipe' }, food, { trustedSources: trusted(food) }, f.io)
      const owned = await prepare(f, { entity, operation: 'create', sourceFoodId: 'source', changes: { label: 'Chosen recipe' } })
      for (const prepared of [direct, owned]) {
        assert.equal(prepared.canConfirm, true, prepared.confirmationMessage); assert.equal(f.writes.length, 0)
        for (const expected of ['Milk: 100 ml', 'Stored nutrition portion: 4 of 4 recipe servings', 'Recipe yield: 4 servings', '100 ml Milk', 'Exact full cooking step 1:', 'Exact full cooking step 100:', 'Preparation time: 10 minutes', 'Cooking time: 15 minutes', 'fibre: unknown', 'sugar: 0 g', 'https://recipes.example/exact']) assert(prepared.confirmationMessage.includes(expected), expected)
        assert(prepared.confirmationMessage.includes('does not add a food diary entry')); assert(prepared.confirmationMessage.length > 6000)
        assert.equal(prepared.recordAction.changes.nutrition.__importRecipe.steps.length, 100)
        for (const expected of ['Milk: 100 ml', 'Recipe yield: 4 servings', 'Stored nutrition portion: 4 of 4 recipe servings', '100 full cooking steps', 'fibre: unknown', 'does not add a food diary entry']) assert(prepared.recordAction.spokenReview.includes(expected), expected)
        assert(!prepared.recordAction.spokenReview.includes('Exact full cooking step 100:')); assert(prepared.recordAction.spokenReview.length < 2000)
      }
    }
  })
  await check('resolved gram portion keeps its measured eaten weight when full recipe weight changes', async () => {
    const measured = (id, amount, values) => { const item = resolvedItem(id, amount, values); item.serving_size = `${amount} g`; item.__voiceSourceFood.serving_size = '100 g'; return item }
    const chicken = measured('Chicken', 100, { calories: 200, protein_g: 30, carbs_g: 0, fat_g: 5, fiber_g: null, sugar_g: 0 })
    const rice = measured('Rice', 100, { calories: 130, protein_g: 3, carbs_g: 28, fat_g: 1, fiber_g: 0, sugar_g: 0 })
    const old = resolvedMeal([chicken, rice])
    for (const key of Object.keys(old.nutrition)) if (typeof old.nutrition[key] === 'number') old.nutrition[key] *= 0.5
    Object.assign(old.nutrition, { __portionScale: 0.5, __portionUnit: 'g', __portionAmount: 100, __portionControlEnabled: true, __portionTotalWeightG: 200, __fullMealItems: old.items, __fullMealNutrition: { calories: 330 } })
    const f = fixture('food', [sample('selected', { nutrients: old.nutrition, items: old.items })])
    const selected = await ctx.selectNativeVoiceFoodRecordForEdit(request, user, { entity: 'food', id: 'selected', localDate: date }, f.io)
    const changed = resolvedMeal([chicken, measured('Rice', 200, rice.__voiceSourceFood)])
    const p = await ctx.prepareNativeVoiceResolvedFoodRecordAction(request, user, selected.selection, changed, { trustedSources: trusted(changed) }, f.io)
    assert.equal(p.canConfirm, true, p.confirmationMessage)
    assert.equal(p.recordAction.changes.nutrition.__portionAmount, 100); assert.equal(p.recordAction.changes.nutrition.__portionTotalWeightG, 300)
    assert.equal(p.recordAction.changes.nutrition.__portionScale, 1 / 3)
    assert(Math.abs(p.recordAction.changes.nutrition.calories - 460 / 3) < 1e-10)
    assert.equal(p.recordAction.changes.nutrition.__fullMealNutrition.calories, 460)
    assert.equal(p.recordAction.changes.nutrition.__fullMealItems[1].serving_size, '200 g')
    const unknown = copy(changed); unknown.items[0].serving_size = '1 piece'
    const unavailable = await ctx.prepareNativeVoiceResolvedFoodRecordAction(request, user, selected.selection, unknown, { trustedSources: trusted(unknown) }, f.io)
    assert.equal(unavailable.canConfirm, false); assert.match(unavailable.confirmationMessage, /known total weight/)
  })
  await check('direct resolved recipe/favorite library proposal never logs consumption', async () => {
    const item = resolvedItem('Milk', 100, { calories: 61, protein_g: 3, carbs_g: 5, fat_g: 3, fiber_g: null, sugar_g: 5 })
    const food = resolvedMeal([item]); food.nutrition.__importRecipe = { title: 'Milk recipe', servings: 1, ingredients: ['100 ml milk'], steps: ['Serve.'] }
    for (const entity of ['favorite', 'custom_food']) {
      const f = fixture(entity, [sample('existing')])
      const p = await ctx.prepareNativeVoiceFoodLibraryFromResolved(request, user, { entity, localDate: date, label: 'Saved milk recipe' }, food, { trustedSources: trusted(food) }, f.io)
      assert.equal(p.canConfirm, true, p.confirmationMessage); assert.equal(f.writes.length, 0)
      await execute(f, p.recordAction)
      assert(f.writes.every((call) => call.entity === entity)); assert.equal(f.state().length, 2)
      assert.equal(f.state()[1].nutrition.__importRecipe.title, 'Milk recipe'); assert.equal(f.state()[1].nutrition.fiber_g, null)
    }
  })
  await check('actual water PATCH changes only resolved milk, preserves other components, and atomically creates missing plain-water food', async () => {
    const coffee = resolvedItem('Coffee', 250, { calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 })
    const milk = resolvedItem('Milk', 50, { calories: 61, protein_g: 3, carbs_g: 5, fat_g: 3, fiber_g: null, sugar_g: 5 })
    const sugar = resolvedItem('Sugar', 8, { calories: 400, protein_g: 0, carbs_g: 100, fat_g: 0, fiber_g: 0, sugar_g: 100 })
    const before = resolvedMeal([coffee, milk, sugar])
    const replacement = resolvedMeal([coffee, resolvedItem('Milk', 100, milk.__voiceSourceFood), sugar])
    const water = { id: 'water-selected', userId: user, amount: 250, unit: 'ml', amountMl: 250, label: 'Coffee with milk and sugar', localDate: date, createdAt: '2026-10-17T01:00:00.000Z' }
    const linked = sample('linked', { nutrients: { ...before.nutrition, __waterLogId: water.id }, items: before.items, createdAt: water.createdAt })
    for (const adding of [false, true]) for (const scenario of ['success', 'food-failure', 'stale-food', 'forged-source']) {
      const failure = scenario !== 'success'
      const initial = { water: [{ ...water, ...(adding ? { label: 'Water' } : {}) }], food: adding ? [] : [linked] }
      const f = atomicDb(initial, scenario === 'food-failure')
      const route = loadRoute('app/api/water-log/[id]/route.ts', { prisma: f.db, validateNativeVoiceResolvedFood: ctx.validateNativeVoiceResolvedFood, authOptions: {}, getServerSession: async () => ({ user: { email: 'synthetic@example.invalid' } }), getUserIdFromNativeAuth: async () => user,
        deleteSmartCoachNotificationsByCategories: async () => {}, NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) } })
      const response = await route.PATCH({ json: async () => ({ amount: 250, unit: 'ml', expectedWaterState: initial.water[0], resolvedDrinkFood: { food: replacement,
        trustedSources: scenario === 'forged-source' ? trusted(replacement).map((source) => ({ ...source, id: 'untrusted' })) : trusted(replacement),
        expectedFoodState: scenario === 'stale-food' ? { ...linked, name: 'Changed after review' } : adding ? null : linked, title: 'Reviewed drink' } }) }, { params: { id: water.id } })
      assert.equal(response.status, failure ? 500 : 200)
      if (failure) { assert.equal(JSON.stringify(f.state()), JSON.stringify(initial)); continue }
      const saved = f.state().food[0]
      assert.equal(saved.nutrients.calories, replacement.nutrition.calories)
      assert.equal(saved.items[0].calories, coffee.calories); assert.equal(saved.items[2].calories, sugar.calories)
      assert.equal(saved.items[1].calories, 61); assert.equal(saved.nutrients.fiber_g, null)
      assert.equal(f.state().water[0].amountMl, 250); assert.equal(saved.createdAt, water.createdAt)
    }
  })
  await check('actual water PATCH scales whole linked drink once, preserves unknowns/source basis and rolls back failure', async () => {
    const water = { id: 'water-selected', userId: user, amount: 250, unit: 'ml', amountMl: 250, label: 'Coffee with milk', category: 'breakfast', localDate: date, createdAt: '2026-10-17T00:00:00.000Z' }
    const initial = { water: [water], food: [{ id: 'linked-food', userId: user, name: 'Coffee with milk', localDate: date,
      nutrients: { calories: 100, protein_g: 4, carbs_g: 10, fat_g: 4, fiber_g: null, fiber: 0, sugar_g: 0, __waterLogId: water.id },
      items: [{ name: 'Coffee with milk', serving_size: '250 ml', calories: 100, fiber_g: null, sugar_g: 0, nutritionCoversServing: true, servingOptions: [{ calories: 40, serving_size: '100 ml' }] }] }] }
    for (const failure of [false, true]) {
      const f = atomicDb(initial, failure)
      const route = loadRoute('app/api/water-log/[id]/route.ts', { prisma: f.db, authOptions: {}, getServerSession: async () => ({ user: { email: 'synthetic@example.invalid' } }), getUserIdFromNativeAuth: async () => user,
        deleteSmartCoachNotificationsByCategories: async () => {}, NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) } })
      const response = await route.PATCH({ json: async () => ({ amount: 500, unit: 'ml', wholeDrinkVolume: true, expectedWaterState: water }) }, { params: { id: water.id } })
      assert.equal(response.status, failure ? 500 : 200)
      assert.equal(f.state().water[0].amountMl, failure ? 250 : 500)
      const linked = f.state().food[0]
      assert.equal(linked.nutrients.calories, failure ? 100 : 200)
      assert.equal(linked.nutrients.fiber_g, null)
      if (!failure) {
        assert.equal(linked.nutrients.fiber, null); assert.equal(linked.nutrients.sugar_g, 0)
        assert.equal(linked.items[0].serving_size, '500 ml'); assert.equal(linked.items[0].servingOptions[0].calories, 40)
      }
    }
  })
  await check('actual water DELETE is atomic, exact-linked and refuses stale reviewed state', async () => {
    const water = { id: 'water-selected', userId: user, amount: 250, unit: 'ml', amountMl: 250, label: 'Coffee', localDate: date }
    const initial = { water: [water], food: [
      sample('direct', { nutrients: { __waterLogId: water.id } }),
      sample('legacy', { nutrients: {}, items: [{ waterLogId: water.id }] }),
      sample('substring', { nutrients: { __waterLogId: `${water.id}-other`, note: water.id } }),
      sample('foreign', { userId: 'another-user', nutrients: { __waterLogId: water.id } }),
    ] }
    for (const scenario of ['success', 'food-failure', 'stale']) {
      const f = atomicDb(initial, scenario === 'food-failure')
      const route = loadRoute('app/api/water-log/[id]/route.ts', { prisma: f.db, authOptions: {}, getServerSession: async () => ({ user: { email: 'synthetic@example.invalid' } }), getUserIdFromNativeAuth: async () => user,
        NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) } })
      const response = await route.DELETE({ json: async () => ({ expectedWaterState: scenario === 'stale' ? { ...water, amount: 100 } : water }) }, { params: { id: water.id } })
      assert.equal(response.status, scenario === 'success' ? 200 : 500)
      assert.equal(f.state().water.length, scenario === 'success' ? 0 : 1)
      assert.equal(f.state().food.length, scenario === 'success' ? 2 : 4)
      assert(f.state().food.some((row) => row.id === 'substring')); assert(f.state().food.some((row) => row.id === 'foreign'))
    }
  })
  await check('actual exact food delete cannot sweep nearby or another-account rows', async () => {
    for (const foreign of [false, true]) {
      const state = [sample('selected', { userId: foreign ? 'another-user' : user }), sample('nearby')]
      const deleted = []
      const route = loadRoute('app/api/food-log/delete/route.ts', {
        getServerSession: async () => ({ user: { email: 'synthetic@example.invalid' } }), authOptions: {},
        prisma: { user: { findUnique: async () => ({ id: user }) }, foodLog: {
          findUnique: async () => state[0], findMany: async () => { throw Error('Duplicate sweep must not run for exactIdOnly') },
          deleteMany: async ({ where }) => { assert.equal(where.userId, user); const index = state.findIndex((row) => row.id === where.id && row.userId === user); if (index >= 0) deleted.push(...state.splice(index, 1)); return { count: index >= 0 ? 1 : 0 } },
        } },
        deleteFoodPhotosIfUnused: async () => {}, NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
      })
      const response = await route.POST({ json: async () => ({ id: 'selected', exactIdOnly: true }) })
      assert.equal(response.status, foreign ? 404 : 200); assert.equal(deleted.length, foreign ? 0 : 1)
      assert(state.some((row) => row.id === 'nearby'))
    }
  })
  await check('actual library CAS permits last deletion, retains tombstone and rejects concurrent stale writer', async () => {
    let goals = [{ id: 'library', userId: user, name: '__FOOD_FAVORITES__', category: JSON.stringify({ favorites: [{ id: 'last', label: 'Last favorite' }] }) }]
    let queue = Promise.resolve()
    function client(get) { return { $executeRawUnsafe: async () => {}, healthGoal: {
      findFirst: async ({ where }) => get().find((row) => row.userId === where.userId && row.name === where.name) || null,
      updateMany: async ({ where, data }) => { const selected = get().filter((row) => row.id === where.id && row.userId === where.userId && row.category === where.category); selected.forEach((row) => Object.assign(row, data)); return { count: selected.length } },
      create: async ({ data }) => { const row = { id: `created-${get().length}`, ...data }; get().push(row); return row },
      upsert: async ({ where, create, update }) => { const row = get().find((item) => item.id === where.id); if (row) Object.assign(row, update); else get().push(create) },
    } } }
    const db = client(() => goals)
    db.$transaction = async (run) => { const before = queue; let done; queue = new Promise((r) => { done = r }); await before; const working = structuredClone(goals); try { const result = await run(client(() => working)); goals = working; return result } finally { done() } }
    const before = await ctx.readNativeVoiceFavoriteLibrary(db, user)
    const mutation = { entity: 'favorite', operation: 'delete', id: 'last', expectedVersion: before.voiceLibraryVersion }
    const results = await Promise.allSettled([ctx.mutateNativeVoiceFavoriteLibrary(db, user, mutation), ctx.mutateNativeVoiceFavoriteLibrary(db, user, mutation)])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1)
    const after = await ctx.readNativeVoiceFavoriteLibrary(db, user)
    assert.equal(after.favorites.length, 0); assert(after.deletedFavoriteIds.includes('last'))
    assert(goals.some((goal) => goal.name.startsWith('__FOOD_FAVORITES__BACKUP__')))
    await ctx.mutateNativeVoiceFavoriteLibrary(db, user, { entity: 'favorite', operation: 'create', id: 'new-recipe', expectedVersion: after.voiceLibraryVersion,
      changes: { label: 'Recipe', nutrition: { calories: 120, fiber_g: null, __importRecipe: { title: 'Recipe', servings: 4 } } } })
    const created = await ctx.readNativeVoiceFavoriteLibrary(db, user)
    assert.equal(JSON.stringify(created.favorites[0].nutrition), JSON.stringify(created.favorites[0].total))
    await ctx.mutateNativeVoiceFavoriteLibrary(db, user, { entity: 'favorite', operation: 'update', id: 'new-recipe', expectedVersion: created.voiceLibraryVersion,
      changes: { nutrition: { ...created.favorites[0].nutrition, calories: 150 } } })
    const changed = await ctx.readNativeVoiceFavoriteLibrary(db, user)
    assert.equal(changed.favorites[0].total.calories, 150); assert.equal(changed.favorites[0].total.fiber_g, null)
    assert.equal(changed.favorites[0].total.__importRecipe.title, 'Recipe')
    const source = fs.readFileSync(path.join(root, 'app/api/user-data/route.ts'), 'utf8')
    assert(source.includes('explicitlyDeletedFavoriteIds.has(favoriteId)'), 'Normal recovery must honor explicit deletion tombstones')
  })
  await check('actual favorite rename commits exact owned linked titles together or rolls everything back', async () => {
    const initial = { goals: [{ id: 'library', userId: user, name: '__FOOD_FAVORITES__', category: JSON.stringify({ favorites: [{ id: 'favorite-selected', label: 'Old title', nutrition: { calories: 200 } }] }) }],
      food: [sample('linked', { name: 'Old title', description: 'Old title', nutrients: { calories: 50, fiber_g: null, __favoriteId: 'favorite-selected', __favoriteManualEdit: true, __portionScale: 0.25, __waterLogId: 'hydration-link' } }),
        sample('unrelated', { nutrients: { __favoriteId: 'favorite-selected-other' } }), sample('foreign', { userId: 'another-user', nutrients: { __favoriteId: 'favorite-selected' } })] }
    for (const scenario of ['success', 'write-failure', 'stale-write', 'readback-failure']) {
      let state = structuredClone(initial)
      const client = (get) => ({ $executeRawUnsafe: async () => {}, healthGoal: {
        findFirst: async ({ where }) => get().goals.find((row) => row.userId === where.userId && row.name === where.name) || null,
        updateMany: async ({ where, data }) => { const matches = get().goals.filter((row) => row.id === where.id && row.userId === where.userId && row.category === where.category); matches.forEach((row) => Object.assign(row, data)); return { count: matches.length } },
        create: async ({ data }) => get().goals.push({ id: `backup-${get().goals.length}`, ...data }),
      }, foodLog: {
        findMany: async ({ where }) => { const found = get().food.filter((row) => row.userId === where.userId && (where.id ? where.id.in.includes(row.id) : row.nutrients.__favoriteId === where.nutrients.equals)); return scenario === 'readback-failure' && where.id ? [] : structuredClone(found) },
        updateMany: async ({ where, data }) => { if (scenario === 'write-failure') throw Error('synthetic linked title failure'); if (scenario === 'stale-write') return { count: 0 }; const matches = get().food.filter((row) => row.id === where.id && row.userId === where.userId && row.name === where.name && row.description === where.description && JSON.stringify(row.nutrients) === JSON.stringify(where.nutrients.equals)); matches.forEach((row) => Object.assign(row, data)); return { count: matches.length } },
      } })
      const db = client(() => state)
      db.$transaction = async (run) => { const working = structuredClone(state); const result = await run(client(() => working)); state = working; return result }
      const before = await ctx.readNativeVoiceFavoriteLibrary(db, user)
      const promise = ctx.mutateNativeVoiceFavoriteLibrary(db, user, { entity: 'favorite', operation: 'update', id: 'favorite-selected', expectedVersion: before.voiceLibraryVersion, changes: { label: 'Chosen title' } })
      if (scenario !== 'success') { await assert.rejects(promise); assert.equal(JSON.stringify(state), JSON.stringify(initial)); continue }
      const result = await promise
      assert.equal(JSON.stringify(result.renamedIds), JSON.stringify(['linked']))
      assert.equal((await ctx.readNativeVoiceFavoriteLibrary(db, user)).favorites[0].label, 'Chosen title')
      assert.equal(state.food[0].name, 'Chosen title'); assert.equal(state.food[0].description, 'Chosen title')
      assert.equal(JSON.stringify(state.food[0].nutrients), JSON.stringify(initial.food[0].nutrients)); assert.equal(JSON.stringify(state.food[0].items), JSON.stringify(initial.food[0].items))
      assert.equal(JSON.stringify(state.food.slice(1)), JSON.stringify(initial.food.slice(1)))
    }
  })
  console.log(`Voice record actions: ${passed} actual-source offline groups passed. Normal handlers use synthetic storage only; no live save or microphone claim.`)
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
