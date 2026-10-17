#!/usr/bin/env node
'use strict'
// Actual normal user-data handlers + actual library transaction, synthetic
// storage/clock only. No app imports, credentials, provider, network or database.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const owner = 'synthetic-library-owner'
const safeMessage = 'The recipe or food library change could not be confirmed. Please check your library before trying again.'
const copy = value => JSON.parse(JSON.stringify(value))
const quiet = { log() {}, warn() {}, error() {}, time() {}, timeEnd() {} }
function load(relative, bindings = {}) {
  const source = ts.createSourceFile(relative, fs.readFileSync(path.join(root, relative), 'utf8'), ts.ScriptTarget.Latest, true)
  const printer = ts.createPrinter()
  const code = source.statements.filter(node => !ts.isImportDeclaration(node)).map(node => printer.printNode(ts.EmitHint.Unspecified, node, source)).join('\n').replace(/^export\s+/gm, '')
  const context = vm.createContext({ crypto, URL, Date, Headers, Request, Response, console: quiet, process: { env: Object.freeze({}) },
    fetch() { throw Error('Network forbidden') }, require() { throw Error('Application/provider imports forbidden') }, ...bindings })
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context)
  return context
}
const library = load('lib/native-voice-record-actions.ts')
const PublicError = vm.runInContext('VoiceRecordActionError', library)
const pureModules = new Map()
function nativePure(relative) {
  assert(/^(?:native\/src\/lib\/(?:foodUnits|nutrientValues|mealPortions|foodDiaryEntries)|lib\/food\/[a-z-]+)\.ts$/.test(relative), `Non-pure native dependency forbidden: ${relative}`)
  if (pureModules.has(relative)) return pureModules.get(relative)
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { assert(name.startsWith('.')); return nativePure(path.posix.normalize(path.posix.join(path.posix.dirname(relative), name)) + '.ts') } })
  pureModules.set(relative, module.exports); return module.exports
}
const nativeSource = ts.createSourceFile('TrackCaloriesScreen.tsx', fs.readFileSync(path.join(root, 'native/src/screens/TrackCaloriesScreen.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const nativeFunctions = nativeSource.statements.filter(node => ts.isFunctionDeclaration(node) && node.name && !/^[A-Z]/.test(node.name.text)).map(node => node.getText(nativeSource)).join('\n')
const native = vm.createContext({ ...nativePure('native/src/lib/foodDiaryEntries.ts'), ...nativePure('native/src/lib/foodUnits.ts'), ...nativePure('native/src/lib/nutrientValues.ts'), ...nativePure('native/src/lib/mealPortions.ts') })
vm.runInContext(ts.transpileModule(nativeFunctions, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText, native)
const recipe = {
  label: 'Voice repair test library recipe', meal: 'dinner',
  nutrition: { calories: 320, protein_g: 20, carbs_g: 40, fat_g: 9, fiber_g: null, sugar_g: 0,
    __importRecipe: { title: 'Voice repair test library recipe', servings: 2, ingredients: ['synthetic beans'], instructions: ['Cook the beans.'] } },
  items: [{ id: 'synthetic-source-beans', name: 'Beans', serving_size: '100 g', calories: 320 }],
}
function fixture(initial, mode = 'success') {
  let state = copy(initial), transactions = 0, options
  const client = get => ({
    $executeRawUnsafe: async (query, scope) => { assert.equal(query, 'SELECT pg_advisory_xact_lock(hashtext($1))'); assert.equal(scope, `native-voice-favorites:${owner}`) },
    healthGoal: {
      findFirst: async ({ where }) => copy(get().find(row => row.userId === where.userId && row.name === where.name) || null),
      updateMany: async ({ where, data }) => {
        const found = get().filter(row => row.id === where.id && row.userId === where.userId && row.category === where.category)
        if (mode === 'stale') return { count: 0 }
        found.forEach(row => Object.assign(row, copy(data))); return { count: found.length }
      },
      create: async ({ data }) => {
        if (mode === 'create-failure' || mode === 'timeout') throw Object.assign(Error('PRIVATE prisma.healthGoal.create() SQL credentials-and-record-fragment'), { code: mode === 'timeout' ? 'P2028' : 'P2010' })
        const row = { id: `synthetic-created-${get().length}`, ...copy(data) }; get().push(row); return copy(row)
      },
      upsert: async ({ where, create, update }) => { const row = get().find(item => item.id === where.id); if (row) Object.assign(row, copy(update)); else get().push(copy(create)) },
    },
  })
  const db = client(() => state)
  db.user = { findUnique: async () => {
    if (mode === 'owner-lookup-failure') throw Error('PRIVATE prisma.user.findUnique() account fragment')
    return { id: owner, email: 'synthetic@example.invalid', healthGoals: [], supplements: [], medications: [] }
  } }
  db.$transaction = async (run, config) => {
    transactions++; options = config
    assert.equal(config.maxWait, 5000); assert.equal(config.timeout, 15000)
    // The observed6099ms operation must fit; no wall-clock sleep is needed.
    assert(config.timeout > 6099)
    const pending = copy(state)
    const result = await run(client(() => pending))
    state = pending // Failure never commits any pending writes.
    return result
  }
  const route = load('app/api/user-data/route.ts', {
    prisma: db, authOptions: {}, getServerSession: async () => ({ user: { email: 'synthetic@example.invalid' } }),
    getToken: async () => { throw Error('Unexpected alternate authentication') },
    NextResponse: { json: (body, config) => new Response(JSON.stringify(body), { status: config?.status || 200, headers: { 'content-type': 'application/json' } }) },
    readNativeVoiceFavoriteLibrary: library.readNativeVoiceFavoriteLibrary,
    mutateNativeVoiceFavoriteLibrary: library.mutateNativeVoiceFavoriteLibrary,
    VoiceRecordActionError: PublicError,
  })
  const request = body => new Request('https://helfi.invalid/api/user-data', { method: 'POST', headers: { authorization: 'Bearer synthetic-original-auth', 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { db, route, state: () => copy(state), transactions: () => transactions, options: () => options,
    post: mutation => route.POST(request({ voiceFavoriteMutation: mutation })),
    read: async () => (await route.GET(new Request('https://helfi.invalid/api/user-data?scope=voice-food-library', { headers: { authorization: 'Bearer synthetic-original-auth' } }))).json() }
}
const initial = () => [{ id: 'synthetic-library', userId: owner, name: '__FOOD_FAVORITES__', category: JSON.stringify({ favorites: [{ id: 'keep', label: 'Keep existing food', nutrition: { calories: 10 } }] }) },
  { id: 'foreign-library', userId: 'another-owner', name: '__FOOD_FAVORITES__', category: JSON.stringify({ favorites: [{ id: 'foreign', label: 'Unrelated food' }] }) }]
async function mutation(f) { const state = await library.readNativeVoiceFavoriteLibrary(f.db, owner); return { entity: 'favorite', operation: 'create', id: 'reviewed-recipe', expectedVersion: state.voiceLibraryVersion, changes: copy(recipe) } }
let checks = 0
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`) }
async function run() {
  await check('normal library POST allows observed6099ms duration within bounded15s transaction and GET verifies exact recipe', async () => {
    const f = fixture(initial()), before = f.state(), review = await mutation(f)
    const response = await f.post(review); assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.success, true); assert.equal(result.id, review.id)
    assert.equal(f.transactions(), 1); assert.equal(f.options().maxWait, 5000); assert.equal(f.options().timeout, 15000)
    const after = await f.read(); assert.equal(after.favorites.length, 2)
    const saved = after.favorites.find(row => row.id === review.id); assert(saved); assert.deepEqual(saved.items, recipe.items); assert.deepEqual(saved.nutrition, recipe.nutrition); assert.deepEqual(saved.total, recipe.nutrition)
    assert.equal(saved.nutrition.fiber_g, null); assert.equal(saved.nutrition.sugar_g, 0); assert.deepEqual(f.state().find(row => row.id === 'foreign-library'), before.find(row => row.id === 'foreign-library'))
    assert(f.state().some(row => row.name.startsWith('__FOOD_FAVORITES__BACKUP__')))
  })
  await check('normal library POST creates a first library with unchanged unknown recipe nutrients', async () => {
    const f = fixture([]), review = await mutation(f); const response = await f.post(review); assert.equal(response.status, 200)
    const after = await f.read(); assert.equal(after.favorites.length, 1); assert.deepEqual(after.favorites[0].nutrition, recipe.nutrition)
  })
  await check('new source-built recipe saves its reviewed serving basis and actual native card never labels it as the first100g ingredient', async () => {
    for (const [yieldCount, amount] of [[1, 1], [2, 2], [4, 4], [4, 1]]) {
      const f = fixture(initial()), review = await mutation(f), scale = amount / yieldCount
      const wholeItems = [
        { id: 'synthetic-banana', name: 'Banana', serving_size: '100 g', calories: 89, protein_g: 1.09, carbs_g: 22.84, fat_g: 0.33, fiber_g: 2.6, sugar_g: 12.23 },
        { id: 'synthetic-whole-milk', name: 'Whole milk', serving_size: '100 ml', calories: 61.8, protein_g: 3.3784, carbs_g: 4.8101, fat_g: 3.296, fiber_g: null, sugar_g: 4.9543 },
      ]
      review.changes.items = wholeItems
      review.changes.nutrition = { calories: 150.8 * scale, protein_g: 4.4684 * scale, carbs_g: 27.6501 * scale, fat_g: 3.626 * scale, fiber_g: null, sugar_g: 17.1843 * scale,
        __importRecipe: { title: recipe.label, servings: yieldCount, ingredients: ['100 grams of banana', '100 millilitres of whole milk'], steps: ['blend the banana and milk until smooth'] },
        __portionScale: scale, __portionControlEnabled: scale !== 1, __portionUnit: 'serving', __portionAmount: amount, __portionRecipeServings: yieldCount }
      const response = await f.post(review); assert.equal(response.status, 200)
      const saved = (await f.read()).favorites.find(row => row.id === review.id), serving = `${amount} ${amount === 1 ? 'serving' : 'servings'}`
      assert.equal(saved.serving, serving); assert.deepEqual(saved.nutrition, review.changes.nutrition); assert.deepEqual(saved.total, review.changes.nutrition); assert.deepEqual(saved.items, wholeItems)
      const card = native.normalizeFavoriteMeal(saved)
      assert.equal(native.favoriteServingLabel(card), serving); assert.equal(card.nutrients.calories, Math.round(150.8 * scale)); assert.equal(card.nutrients.fiber, null)
      assert.notEqual(native.favoriteServingLabel(card), '100 g')
    }
  })
  await check('recipe serving derivation never edits old library rows or accepts an unrestricted model serving field', async () => {
    const previous = initial(); const old = JSON.parse(previous[0].category); old.favorites[0].items = [{ name: 'Legacy ingredient', serving_size: '100 g' }]; previous[0].category = JSON.stringify(old)
    const f = fixture(previous), review = await mutation(f)
    assert.equal((await f.post(review)).status, 200)
    assert.deepEqual((await f.read()).favorites.find(row => row.id === 'keep'), old.favorites[0])
    const current = await library.readNativeVoiceFavoriteLibrary(f.db, owner)
    const forbidden = { entity: 'favorite', operation: 'create', id: 'forbidden-serving', expectedVersion: current.voiceLibraryVersion, changes: { ...copy(recipe), serving: '999 servings' } }
    const before = f.state(), response = await f.post(forbidden); assert.equal(response.status, 409); assert.deepEqual(f.state(), before)
    const update = { entity: 'favorite', operation: 'update', id: 'keep', expectedVersion: current.voiceLibraryVersion, changes: { nutrition: { ...recipe.nutrition, __portionAmount: 2, __portionRecipeServings: 2, __portionScale: 1, __portionUnit: 'serving', __portionControlEnabled: false, __importRecipe: { ...recipe.nutrition.__importRecipe, servings: 2 } } } }
    assert.equal((await f.post(update)).status, 200); assert.equal((await f.read()).favorites.find(row => row.id === 'keep').serving, undefined)
  })
  await check('backup failure or transaction timeout rolls back pending library changes and never exposes PRIVATE database text', async () => {
    for (const mode of ['create-failure', 'timeout']) for (const starting of [initial(), []]) {
      const f = fixture(starting, mode), review = await mutation(f), response = await f.post(review)
      assert.equal(response.status, 409); const body = await response.json(); assert.equal(body.error, safeMessage); assert(!JSON.stringify(body).includes('PRIVATE')); assert(!JSON.stringify(body).includes('prisma')); assert.equal(body.success, undefined)
      assert.deepEqual(f.state(), starting)
    }
  })
  await check('owned-account lookup failure remains inside sanitized normal library error boundary', async () => {
    const f = fixture(initial(), 'owner-lookup-failure'), review = await mutation(f), response = await f.post(review)
    assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: safeMessage }); assert.equal(f.transactions(), 0); assert.deepEqual(f.state(), initial())
  })
  await check('stale library versions preserve fixed review guidance and cannot write', async () => {
    const f = fixture(initial()), review = await mutation(f); review.expectedVersion = '0'.repeat(64)
    const response = await f.post(review); assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: 'Your food library changed. Please review the latest version.' }); assert.deepEqual(f.state(), initial())
  })
  await check('CAS races roll back while only closed public messages cross the normal handler boundary', async () => {
    const f = fixture(initial(), 'stale'), review = await mutation(f), response = await f.post(review)
    assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: 'Your food library changed during saving. Please review it again.' }); assert.deepEqual(f.state(), initial())
    const safe = new PublicError('library_changed'); safe.message = 'PRIVATE changed exception text'
    const route = load('app/api/user-data/route.ts', { prisma: { user: { findUnique: async () => ({ id: owner }) } }, authOptions: {}, getServerSession: async () => ({ user: { email: 'synthetic@example.invalid' } }),
      VoiceRecordActionError: PublicError, mutateNativeVoiceFavoriteLibrary: async () => { throw safe }, NextResponse: { json: (body, options) => new Response(JSON.stringify(body), { status: options?.status || 200 }) } })
    const result = await route.POST(new Request('https://helfi.invalid/api/user-data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voiceFavoriteMutation: review }) }))
    assert.equal(result.status, 409); assert.deepEqual(await result.json(), { error: 'Your food library changed. Please review the latest version.' })
  })
  console.log(`Voice library save boundary: ${checks} actual-source offline groups passed. No live save, provider, credential or database access.`)
}
run().catch(error => { console.error(error); process.exitCode = 1 })
