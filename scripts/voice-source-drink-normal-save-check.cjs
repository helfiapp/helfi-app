#!/usr/bin/env node
'use strict'
// Real signed voice save, owned-link proof and normal authenticated POST/PUT.
// Synthetic users/storage/source snapshots only. No network/providers/keys.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, 'voice-drink-metadata-check.cjs'), 'utf8').replace(/^#!.*\n/, '')
const at = source.indexOf('async function main() {'); assert(at > 0)
const { save, records, drink, saved } = new Function('require', '__dirname', `${source.slice(0, at)}\nreturn {save,records,drink,saved}`)(require, __dirname)
const plain = value => JSON.parse(JSON.stringify(value))
async function initialDrink(type = 'sugar', optionalSugar = 99.8) {
  if (type === 'sugar') return (await saved(optionalSugar)).initial
  const draft = drink(), item = draft.food.items[2]
  if (type === 'milk') {
    const milk = draft.food.items[1]; milk.serving_size = '250 ml'
    for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g']) if (typeof milk[key] === 'number') milk[key] *= 5
    draft.food.items = [milk]; draft.water.sweetener = { type: 'free' }; draft.water.drinkType = draft.water.label = 'Milk'
  }
  else if (type === 'free') { draft.food.items.pop(); draft.water.sweetener = { type: 'free' }; draft.water.label = 'Coffee with 50 ml milk' }
  else {
    const source = { id: 'synthetic-honey', name: 'Honey', source: 'synthetic-public-fixture', calories: 304, protein_g: 0.3, carbs_g: 82.4, fat_g: 0, fiber_g: 0.2, sugar_g: optionalSugar }
    Object.assign(item, { id: source.id, name: source.name, __voiceSourceFood: source, serving_size: '7 g' })
    for (const [key, value] of Object.entries(source)) if (typeof value === 'number' || value === null) item[key] = value === null ? null : value * 0.07
    draft.water.sweetener = { type: 'honey', amount: 1, unit: 'tsp', grams: 7 }; draft.water.label = 'Coffee with 7 g honey with 50 ml milk'
  }
  const h = save.harness(), response = await h.send(save.signed({ water: draft.water, food: draft.food }))
  assert.equal(response.status, 200, response.body.error); return plain(h.state())
}
function normal(initial, mode = '') {
  let food = plain(initial.food), water = plain(initial.water), writes = 0
  const prisma = { user: { findUnique: async () => ({ id: 'synthetic-user', email: 'synthetic@example.invalid' }) },
    waterLog: { findFirst: async ({ where }) => mode === 'foreign-water' ? { ...water[0], userId: 'other-user' } : mode === 'missing-water' ? null : water.find(row => row.id === where.id && row.userId === where.userId) || null },
    foodLog: {
      findFirst: async ({ where }) => mode === 'missing-source' ? null : food.find(row => row.userId === where.userId && row.nutrients?.__waterLogId === where.nutrients.equals) || null,
      findUnique: async ({ where }) => food.find(row => row.id === where.id) || null,
      create: async ({ data }) => { writes++; const row = { id: `normal-${writes}`, ...data, createdAt: data.createdAt || new Date() }; food.push(row); return row },
      update: async ({ where, data }) => { writes++; const row = food.find(row => row.id === where.id); for (const [key, value] of Object.entries(data)) if (value !== undefined) row[key] = value; return row },
    } }
  const route = records.loadRoute('app/api/food-log/route.ts', { prisma, authOptions: {}, getServerSession: async () => ({ user: { email: 'synthetic@example.invalid' } }), getToken: async () => null,
    validateNativeVoiceResolvedFood: records.ctx.validateNativeVoiceResolvedFood,
    normalizeMealCategory: value => value === 'other' ? 'uncategorized' : value,
    triggerBackgroundRegeneration: async () => {}, deleteSmartCoachNotificationsByCategories: async () => {},
    Prisma: { JsonNull: null }, process: { env: {} },
    NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
  })
  return { send: (method, body) => route[method]({ json: async () => body }), food: () => food, writes: () => writes, route }
}
function payload(row) { return { id: row.id, name: row.name, description: row.description, nutrition: plain(row.nutrients), items: plain(row.items), localDate: row.localDate, meal: row.meal, category: row.category, allowDuplicate: true } }
const pureModules = new Map()
function nativePure(relative) {
  assert(/^(?:native\/src\/lib\/(?:foodUnits|nutrientValues|mealPortions|mealPortionEditor|foodDiaryEntries)|lib\/food\/[a-z-]+)\.ts$/.test(relative), `Non-pure dependency forbidden: ${relative}`)
  if (pureModules.has(relative)) return pureModules.get(relative)
  const module = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { assert(name.startsWith('.')); return nativePure(path.posix.normalize(path.posix.join(path.posix.dirname(relative), name)) + '.ts') } })
  pureModules.set(relative, module.exports); return module.exports
}
async function nativeEditorSave(row, normalFixture, scale = 1, serializer = 'meal') {
  const file = 'native/src/screens/TrackCaloriesScreen.tsx', source = ts.createSourceFile(file, fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const ctx = vm.createContext({ ...nativePure('native/src/lib/foodDiaryEntries.ts'), ...nativePure('native/src/lib/foodUnits.ts'), ...nativePure('native/src/lib/nutrientValues.ts'), ...nativePure('native/src/lib/mealPortions.ts'), ...nativePure('native/src/lib/mealPortionEditor.ts') })
  const top = source.statements.filter(n => ts.isFunctionDeclaration(n) && n.name && !/^[A-Z]/.test(n.name.text)).map(n => n.getText(source)).join('\n')
  vm.runInContext(ts.transpileModule(top, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText, ctx)
  const initializers = new Map()
  function find(node) { if (ts.isVariableDeclaration(node) && node.initializer && ['updateFavoriteFromEditor', 'saveEditedEntry', 'openEditModal', 'cloneEntryItemsForSave', 'buildEntryNutritionForSave'].includes(node.name.getText(source))) initializers.set(node.name.getText(source), node.initializer.getText(source)); ts.forEachChild(node, find) }
  find(source)
  const actual = name => { assert(initializers.has(name)); return vm.runInContext(ts.transpileModule(`(${initializers.get(name)})`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText, ctx) }
  const entry = ctx.normalizeFoodApiEntry({ ...plain(row), createdAt: row.createdAt || '2026-10-17T01:00:00.000Z' })
  const listItem = { id: 'synthetic-editor', label: row.name, entry, favorite: null }
  const items = ctx.buildFavoriteAdjustItems(listItem, true)
  let captured, response
  Object.assign(ctx, { mealBuilderOpen: false, favoriteEditItem: listItem, favoriteEditItems: items, favoriteEditPortionItems: ctx.portionMealItems(items, scale),
    favoriteEditName: row.name, favoritesTargetMeal: row.meal, authHeaders: {}, session: { token: 'synthetic-auth' }, API_BASE_URL: 'https://helfi.invalid', selectedDate: row.localDate,
    favoriteEditPortionControlEnabled: scale !== 1, favoriteEditPortionScale: scale, favoriteEditPortionUnit: 'serving', favoriteEditPortionAmount: String(scale), favoriteEditRecipeServings: 1,
    favoriteEditWholeGrams: null, mealRecipe: null, recipeServingsEaten: '', favoriteEditTime: ctx.formatEditorTime(entry.createdAt),
    buildNativeAuthHeaders: () => ({ authorization: 'synthetic-auth' }), Alert: { alert: (_title, message) => { throw Error(message) } },
    fetch: async (url, options) => { assert.equal(url, 'https://helfi.invalid/api/food-log'); assert.equal(options.method, 'PUT'); captured = JSON.parse(options.body); response = await normalFixture.send('PUT', captured); return { ok: response.status < 400 } },
    setEntries: () => {}, setFavoriteEditItem: () => {}, setFavoriteEditItems: () => {}, setFavoriteEditName: () => {}, setFavoriteEditIngredientsExpanded: () => {}, setFavoriteEditExpandedItemId: () => {}, setFavoriteEditServingPickerItemId: () => {}, setFavoriteEditServingLoadingId: () => {},
  })
  if (serializer === 'simple') {
    for (const field of ['Target', 'Name', 'Meal', 'Calories', 'Protein', 'Carbs', 'Fat', 'Fiber', 'Sugar']) ctx[`setEdit${field}`] = value => { ctx[`edit${field}`] = value }
    Object.assign(ctx, { setEditModalOpen: () => {}, setEntryMenu: () => {}, closeEntrySwipeMenus: () => {},
      cloneEntryItemsForSave: actual('cloneEntryItemsForSave'), buildEntryNutritionForSave: actual('buildEntryNutritionForSave') })
    actual('openEditModal')(entry)
  }
  await actual(serializer === 'simple' ? 'saveEditedEntry' : 'updateFavoriteFromEditor')()
  return { captured, response }
}
let passed = 0
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`) }
async function main() {
  await check('actual native Save entry serializer preserves precise source nutrition through normal PUT', async () => {
    const initial = await initialDrink(), source = initial.food[0]
    const coffee = source.items[0], milk = source.items[1], sugar = source.items[2]
    Object.assign(coffee.__voiceSourceFood, { calories: 0.296, protein_g: 0.03552, carbs_g: 0, fat_g: 0.005920000000000001, fiber_g: 0, sugar_g: 0 })
    Object.assign(milk.__voiceSourceFood, { calories: 61.8, protein_g: 3.3784, carbs_g: 4.8101, fat_g: 3.296, fiber_g: null, sugar_g: 4.9543 })
    Object.assign(sugar.__voiceSourceFood, { calories: 387, protein_g: 0, carbs_g: 99.98, fat_g: 0, fiber_g: 0, sugar_g: 99.8 })
    for (const [item, factor] of [[coffee, 250 / 29.5735295625], [milk, 0.5], [sugar, 0.08]]) for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g']) item[key] = item.__voiceSourceFood[key] === null ? null : item.__voiceSourceFood[key] * factor
    Object.assign(coffee.__voiceSourceFood, { id: '171890', source: 'usda', serving_size: '1 fl oz' })
    Object.assign(milk.__voiceSourceFood, { id: '322892', source: 'usda', serving_size: '100 ml' })
    Object.assign(sugar.__voiceSourceFood, { id: '169655', source: 'usda', serving_size: '100 g' })
    for (const item of source.items) Object.assign(item, { calories_kcal: item.calories, fiber: item.fiber_g, sugar: item.sugar_g })
    for (const [primary, alias] of [['calories', 'calories_kcal'], ['protein_g', 'protein'], ['carbs_g', 'carbs'], ['fat_g', 'fat'], ['fiber_g', 'fiber'], ['sugar_g', 'sugar']]) {
      const values = source.items.map(item => item[primary]); source.nutrients[primary] = source.nutrients[alias] = values.some(value => value === null) ? null : values.reduce((a, b) => a + b, 0)
    }
    Object.assign(source.nutrients, { __sweetenerCalories: sugar.calories, __sweetenerCarbs: sugar.carbs_g, __sweetenerSugar: sugar.sugar_g })
    const f = normal(initial), { captured, response } = await nativeEditorSave(source, f)
    assert.equal(response.status, 200); assert.equal(captured.nutrition.calories, 64); assert.equal(captured.nutrition.protein_g, 1.989)
    assert.equal(captured.nutrition.__portionScale, 1); assert.equal(captured.nutrition.__portionControlEnabled, false)
    const after = f.food()[0]
    for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', '__sweetenerCalories', '__sweetenerCarbs', '__sweetenerSugar']) assert.equal(after.nutrients[key], source.nutrients[key], key)
    assert.equal(after.nutrients.__sweetenerChoice, 'with'); assert.equal(after.items.length, 3)
    const simple = normal(initial), simpleSaved = await nativeEditorSave(source, simple, 1, 'simple')
    assert.equal(simpleSaved.captured.nutrition.protein_g, 2)
    for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g']) assert.equal(simple.food()[0].nutrients[key], source.nutrients[key], `actual simple serializer ${key}`)
  })
  await check('actual native no-change saves preserve single-milk item precision and unknown/zero nutrients', async () => {
    for (const fiber of [null, 0]) for (const serializer of ['meal', 'simple']) {
      const initial = await initialDrink('milk'), row = initial.food[0], item = row.items[0]
      const values = { calories: 61.8, protein_g: 3.3784, carbs_g: 4.8101, fat_g: 3.296, fiber_g: fiber, sugar_g: 4.9543 }
      Object.assign(item.__voiceSourceFood, values)
      for (const [primary, alias] of [['calories', 'calories_kcal'], ['protein_g', 'protein'], ['carbs_g', 'carbs'], ['fat_g', 'fat'], ['fiber_g', 'fiber'], ['sugar_g', 'sugar']]) {
        item[primary] = values[primary] === null ? null : values[primary] * 2.5
        if (['calories', 'fiber_g', 'sugar_g'].includes(primary)) item[alias] = item[primary]
        row.nutrients[primary] = row.nutrients[alias] = item[primary]
      }
      const f = normal(initial); await nativeEditorSave(row, f, 1, serializer)
      for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g']) {
        assert.equal(f.food()[0].nutrients[key], row.nutrients[key], `${serializer} ${key}`)
        assert.equal(f.food()[0].items[0][key], item[key], `${serializer} item ${key}`)
      }
    }
  })
  await check('normal POST and PUT preserve all source-built coffee/milk/sugar or honey nutrients and exact ingredients', async () => {
    for (const type of ['sugar', 'honey', 'free', 'milk']) for (const method of ['POST', 'PUT']) {
      const initial = await initialDrink(type), f = normal(initial), before = initial.food[0]
      const response = await f.send(method, payload(before)); assert.equal(response.status, 200, JSON.stringify(response.body)); assert.equal(f.writes(), 1)
      const after = f.food().find(row => row.id === response.body.id)
      assert.deepEqual(plain(after.nutrients), before.nutrients); assert.deepEqual(plain(after.items), before.items)
      for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g']) assert.equal(after.nutrients[key], before.nutrients[key])
    }
  })
  await check('normal source-backed save preserves unknown sugar versus genuine zero', async () => {
    for (const sugar of [null, 0]) for (const method of ['POST', 'PUT']) {
      const initial = await initialDrink('sugar', sugar), f = normal(initial), response = await f.send(method, payload(initial.food[0]))
      assert.equal(response.status, 200); const after = f.food().find(row => row.id === response.body.id)
      assert.equal(after.nutrients.__sweetenerSugar, sugar); assert.equal(after.items[2].sugar_g, sugar)
      assert.equal(after.nutrients.sugar_g, sugar === null ? null : 2.4)
    }
  })
  await check('a flag alone, foreign/missing link, missing source or forged ingredient cannot bypass the locked legacy guard', async () => {
    for (const mode of ['foreign-water', 'missing-water', 'missing-source', 'forged-item', 'missing-items', 'forged-sweetener', 'forged-drink-type']) {
      const initial = await initialDrink(), f = normal(initial, mode), body = payload(initial.food[0])
      if (mode === 'forged-item') body.items[2].__voiceSourceFood.id = 'invented'
      if (mode === 'missing-items') body.items = []
      if (mode === 'forged-sweetener') body.nutrition.__sweetenerCalories = 999
      if (mode === 'forged-drink-type') body.nutrition.__drinkType = 'Invented drink'
      await assert.rejects(() => f.route.normalizeOwnedSourceBuiltLinkedDrink('synthetic-user', body.nutrition, body.items), /review this source-built drink/, mode)
      const response = await f.send('PUT', body)
      assert.equal(response.status, 500); assert.equal(f.writes(), 0); assert.deepEqual(f.food(), initial.food)
    }
  })
  await check('material nutrient edits and changed drink portion cannot fall into legacy normalization or write partial data', async () => {
    for (const alter of [body => { body.nutrition.protein = body.nutrition.protein_g = 0 }, body => { body.nutrition.fat = body.nutrition.fat_g = 9 },
      body => { body.nutrition.fiber = body.nutrition.fiber_g = 0 }, body => { body.items[0].__voiceSourceFood.calories = 999 },
      body => { body.nutrition.__portionScale = 0.5 }, body => { body.items[1].servings = 2 }]) {
      const initial = await initialDrink(), f = normal(initial), body = payload(initial.food[0]); alter(body)
      const response = await f.send('PUT', body)
      assert.equal(response.status, 500); assert.equal(f.writes(), 0); assert.deepEqual(f.food(), initial.food)
    }
  })
  await check('legacy hot-chocolate free, sugar and honey remain on unchanged normal POST/PUT sweetener rules', async () => {
    for (const method of ['POST', 'PUT']) for (const choice of ['free', 'sugar', 'honey']) {
      const initial = await initialDrink(), f = normal(initial), body = payload(initial.food[0])
      body.nutrition = { calories: 319, protein_g: 20, carbs_g: 80, fat_g: 20, fiber_g: 1, sugar_g: 80,
        __drinkType: 'Hot Chocolate', __sweetenerChoice: choice, __sweetenerCalories: choice === 'honey' ? 64 : 32, __sweetenerCarbs: 8, __sweetenerSugar: 8 }
      body.items = [{ name: 'Hot Chocolate', calories: 319 }]
      const response = await f.send(method, body); assert.equal(response.status, 200)
      const after = f.food().find(row => row.id === response.body.id)
      assert.equal(after.nutrients.calories, choice === 'free' ? 8 : choice === 'honey' ? 64 : 32)
      assert.equal(after.nutrients.protein_g, 0); assert.equal(after.nutrients.fat_g, 0)
    }
  })
  console.log(`Voice source drink normal save: ${passed} actual-source offline groups passed; locked normalizer and rename code unchanged.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
