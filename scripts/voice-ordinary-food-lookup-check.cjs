#!/usr/bin/env node
'use strict'
// Actual voice lookup/builder with synthetic normal catalog/serving handlers.
// No real app imports, HTTP/provider calls, keys, env files or database access.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const allowed = new Set(['lib/native-voice-spoken-quantities.ts', 'lib/food/serving-measurements.ts', 'native/src/lib/foodUnits.ts', 'lib/food/measurement-units.ts', 'lib/food/produce-measurements.ts', 'lib/food/dry-food-measurements.ts', 'lib/food/dairy-semi-solid-measurements.ts'])
const modules = new Map()
function actual(relative) {
  assert(allowed.has(relative), `Unexpected source dependency ${relative}`)
  if (modules.has(relative)) return modules.get(relative)
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { module, exports: module.exports, require: name => actual(path.posix.normalize(path.posix.join(path.posix.dirname(relative), name)) + '.ts') })
  modules.set(relative, module.exports)
  return module.exports
}
const source = ts.createSourceFile('voice.ts', fs.readFileSync(path.join(root, 'app/api/native/voice-assistant/route.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
const printer = ts.createPrinter()
const stripped = source.statements.filter(node => !ts.isImportDeclaration(node)).map(node => printer.printNode(ts.EmitHint.Unspecified, node, source)).join('\n').replace(/^export\s+/gm, '')
const food = (id, name, values = {}) => ({ id, name, source: 'usda', serving_size: '100 g', calories: 100, protein_g: 1, carbs_g: 10, fat_g: 1, fiber_g: null, sugar_g: 0, ...values })
const dryMilk = food('powder-milk', 'Milk, dry, whole', { calories: 496, protein_g: 26, carbs_g: 38, fat_g: 26, fiber_g: 0, sugar_g: 38 })
const fluidMilk = food('fluid-milk', 'Milk, whole, fluid', { serving_size: '100 ml', calories: 61, protein_g: 3.2, carbs_g: 4.8, fat_g: 3.3, fiber_g: null, sugar_g: 4.8 })
const gramCoffee = food('coffee-grams', 'Coffee, brewed from grounds, prepared with tap water', { calories: 1, protein_g: 0.1, carbs_g: 0, fat_g: 0, fiber_g: null, sugar_g: 0 })
const manualCoffee = { ...gramCoffee, id: 'manual-coffee', source: 'fatsecret' }
const cupCoffee = { id: 'fatsecret:manual-coffee:cup', foodName: manualCoffee.name, source: 'fatsecret', serving_size: '1 cup — 240 ml', ml: 240, calories: 2.4, protein_g: 0.24, carbs_g: 0, fat_g: 0, fiber_g: null, sugar_g: 0 }
const sugar = food('sugar', 'Sugar', { calories: 400, protein_g: 0, carbs_g: 100, fat_g: 0, fiber_g: 0, sugar_g: 100 })
let local, custom, catalog, options, calls, failure
const reset = () => { local = []; custom = []; catalog = []; options = {}; calls = []; failure = false }
const response = (body, ok = true) => ({ ok, json: async () => body })
const ctx = vm.createContext({ process: { env: Object.freeze({}) }, Date, URL, Buffer, AbortController, setTimeout, clearTimeout, NextRequest: Request,
  resolveHelfiTtsVoice: () => 'synthetic', console: { log() {}, warn() {}, error() {} }, ...actual('lib/food/serving-measurements.ts'), ...actual('lib/native-voice-spoken-quantities.ts'),
  fetch() { throw Error('Network forbidden') }, OpenAI: class { constructor() { throw Error('Provider forbidden') } },
  searchLocalFoods: async () => local,
  searchCustomFoodMacros: async () => custom,
  prisma: { foodLibraryItem: { findMany: async () => [] } },
  searchDiaryFoods: async request => {
    const url = new URL(request.url)
    assert.equal(url.pathname, '/api/food-data'); assert.equal(url.searchParams.get('kind'), 'single'); assert.equal(url.searchParams.get('source'), 'auto')
    calls.push({ kind: 'catalog', query: url.searchParams.get('q'), localOnly: url.searchParams.has('localOnly'), country: url.searchParams.get('country') })
    if (failure) throw Error('Synthetic normal catalog failure')
    return response({ items: url.searchParams.has('localOnly') ? [] : catalog })
  },
  searchDiaryFoodServings: async request => {
    const url = new URL(request.url)
    assert.equal(url.pathname, '/api/food-data/servings')
    const id = url.searchParams.get('id'); const source = url.searchParams.get('source')
    calls.push({ kind: 'servings', id, source })
    return response(options[id] || { source, options: [] })
  },
})
vm.runInContext(ts.transpileModule(stripped, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx)
function sourceModule(relative, bindings) {
  const ast = ts.createSourceFile(relative, fs.readFileSync(path.join(root, relative), 'utf8'), ts.ScriptTarget.Latest, true)
  const source = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => printer.printNode(ts.EmitHint.Unspecified, node, ast)).join('\n').replace(/^export\s+/gm, '')
  const context = vm.createContext({ Date, URL, console: { log() {}, warn() {}, error() {} }, ...bindings })
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context)
  return context
}
const officialPortions = JSON.parse(fs.readFileSync(path.join(root, 'data/food-overrides/usda-recorded-portions.json'), 'utf8'))
const verifiedPortions = sourceModule('lib/food/usda-recorded-portions.ts', { recorded: officialPortions }).verifiedUsdaRecordedPortionOptions
const request = text => ctx.parseIngredientPhrase(text)
const lookup = async text => { const ingredient = request(text); return ctx.findFoodIngredient(ingredient.name, 'AU', ingredient) }
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`)
let passed = 0
async function check(name, run) { reset(); await run(); passed++; console.log(`PASS ${name}`) }
async function run() {
  const publicSweeteners = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/voice-sweetener-public-source.json'), 'utf8'))
  const publicUsda = publicSweeteners.usda.map(row => ctx.normalizeLibraryFoodItem(row))
  const publicCustom = publicSweeteners.custom.map(row => ({ id: row.id, name: row.name, aliases: row.aliases, source: 'custom', serving_size: '100 g', calories: row.caloriesPer100g, protein_g: row.proteinPer100g, carbs_g: row.carbsPer100g, fat_g: row.fatPer100g, fiber_g: row.fiberPer100g, sugar_g: row.sugarPer100g }))
  await check('actual public sugar aliases cannot hide brown caster or raw forms behind generic Sugar', async () => {
    for (const item of publicCustom.slice(0, 3)) assert.equal(ctx.compatibleOrdinaryVoiceFood('sugar', ctx.normalizeFoodItem(item), request('8 g sugar')), null, item.aliases[0])
    const white = ctx.compatibleOrdinaryVoiceFood('sugar', ctx.normalizeFoodItem(publicCustom[3]), request('8 g sugar'))
    assert.equal(white.id, publicCustom[3].id)
    for (const item of publicUsda.filter(item => /brown|powdered|maple/i.test(item.name))) assert.equal(ctx.compatibleOrdinaryVoiceFood('sugar', item, request('8 g sugar')), null, item.name)
  })
  await check('actual authoritative USDA granulated sugar precedes all four custom Sugar rows', async () => {
    custom = publicCustom; local = publicUsda
    const found = await lookup('8 g sugar')
    assert.equal(found.source, 'usda'); assert.equal(found.id, '334247')
    const core = ctx.itemCore(found, 0, ctx.requestedIngredientBasis(request('8 g sugar'), found).ratio)
    near(core.calories, 30.8); near(core.protein, 0); near(core.carbs, 7.968); near(core.sugar, 7.984)
    assert.equal(calls.length, 0, 'Actual local authoritative basis needs no provider fallback')
  })
  await check('actual brown sugar and honey retain their requested USDA identity and optional source values', async () => {
    custom = publicCustom; local = publicUsda
    const brown = await lookup('8 g brown sugar'); assert.equal(brown.id, '168833'); near(brown.calories, 380)
    const honey = await lookup('7 g honey'); assert.equal(honey.id, '169640'); near(honey.sugar_g, 82.12)
    for (const name of ['Honey mustard', 'Honey syrup blend', 'Sugar substitute']) assert.equal(ctx.voiceOrdinaryIdentityMatches(/honey/i.test(name) ? 'honey' : 'sugar', food('wrong-form', name)), false)
  })
  await check('an old generic custom Sugar review is re-resolved against authoritative source rather than reused', async () => {
    local = publicUsda; custom = publicCustom
    const old = ctx.normalizeFoodItem(publicCustom[0]); delete old.__voiceSourceAliases
    const ingredient = request('8 g sugar')
    const found = await ctx.findFoodIngredient('sugar', 'AU', ingredient, [{ __voiceSourceFood: old }])
    assert.equal(found.source, 'usda'); assert.equal(found.id, '334247')
  })
  await check('complete coffee milk sugar draft retains actual public granulated nutrition rather than the first custom Sugar row', async () => {
    local = [food('coffee-volume', 'Coffee, brewed', { serving_size: '100 ml', calories: 1, protein_g: 0.1, carbs_g: 0, fat_g: 0, sugar_g: 0 }), fluidMilk, ...publicUsda]
    custom = publicCustom
    const text = 'Log 250 millilitres coffee with 50 millilitres whole milk and two teaspoons sugar'
    const draft = await ctx.resolveVoiceDrinkDraft(ctx.tryParseWaterRequest(text, '2026-10-17', undefined, 'AU'))
    assert.equal(draft.canConfirm, true); assert.equal(draft.food.items.length, 3)
    const item = draft.food.items.find(item => item.requestedName === 'sugar')
    assert.equal(item.__voiceSourceFood.id, '334247'); assert.equal(item.__voiceSourceFood.source, 'usda')
    near(item.calories, 30.8); near(item.protein_g, 0); near(item.sugar_g, 7.984)
    near(draft.food.nutrition.sugar_g, 10.384)
    local = []
    assert.equal((await lookup('8 g sugar')).id, publicCustom[3].id, 'Known white granulated custom form is the compatible fallback')
  })
  await check('fluid whole milk wins over dry whole milk before source scoring', async () => {
    local = [dryMilk, fluidMilk]
    const found = await lookup('50 ml whole milk')
    assert.equal(found.id, 'fluid-milk'); assert.equal(calls.length, 0)
    near(ctx.itemCore(found, 0, ctx.requestedIngredientBasis(request('50 ml whole milk'), found).ratio).calories, 30.5)
    assert.equal(ctx.chooseBestFoodMatch('whole milk', [dryMilk], request('50 ml whole milk')), null)
  })
  await check('unusable exact custom coffee does not intercept normal provider fallback', async () => {
    custom = [{ ...gramCoffee, id: 'custom-gram-coffee', name: 'coffee' }]
    catalog = [manualCoffee]; options['manual-coffee'] = { source: 'fatsecret', options: [cupCoffee] }
    const found = await lookup('250 ml coffee')
    assert.equal(found.id, 'manual-coffee'); assert.equal(found.source, 'fatsecret'); assert.equal(found.selectedServingId, cupCoffee.id)
    assert(calls.some(call => call.kind === 'catalog' && !call.localOnly)); assert(calls.some(call => call.kind === 'servings' && call.id === 'manual-coffee'))
  })
  await check('brewed coffee uses actual recorded cup millilitres and its own nutrition once', async () => {
    local = [gramCoffee]; catalog = [manualCoffee]; options['manual-coffee'] = { source: 'fatsecret', options: [cupCoffee] }
    const found = await lookup('250 ml coffee')
    const basis = ctx.requestedIngredientBasis(request('250 ml coffee'), found)
    near(basis.ratio, 250 / 240); near(ctx.itemCore(found, 0, basis.ratio).calories, 2.5)
    assert.equal(found.fiber_g, null); assert.equal(found.sugar_g, 0); assert.equal(found.serving_size, cupCoffee.serving_size)
    assert.equal(ctx.requestedIngredientBasis(request('250 ml coffee'), gramCoffee), null)
  })
  await check('attached compatible source serving needs no external catalog lookup', async () => {
    const recorded = { ...cupCoffee, id: 'usda:coffee-grams:cup', source: 'usda' }
    local = [{ ...gramCoffee, servingOptions: [recorded] }]
    const found = await lookup('250 ml black coffee')
    assert.equal(found.id, gramCoffee.id); assert.equal(found.source, 'usda'); assert.equal(found.selectedServingId, recorded.id); assert.equal(calls.length, 0)
  })
  await check('USDA recorded cup 8 fluid ounces and 237 grams uses its stated fluid volume without density', async () => {
    const actualCoffee = food('171890', 'Beverages, coffee, brewed, prepared with tap water', { calories: 1, protein_g: 0.12, carbs_g: 0, fat_g: 0.02, fiber_g: 0, sugar_g: 0 })
    const recorded = { id: 'usda:171890:0', source: 'usda', foodName: actualCoffee.name, label: '1 cup (8 fl oz) — 237g', serving_size: '1 cup (8 fl oz) — 237g', grams: 237, ml: null, calories: 2.37, protein_g: 0.2844, carbs_g: 0, fat_g: 0.0474, fiber_g: 0, sugar_g: 0 }
    local = [actualCoffee]; catalog = [actualCoffee]; options['171890'] = { source: 'usda', options: [recorded] }
    const found = await lookup('250 ml coffee')
    assert.equal(found.id, '171890'); assert.equal(found.source, 'usda'); assert.equal(found.selectedServingId, recorded.id)
    assert.equal(found.serving_size, '8 fl oz'); assert.equal(found.__voiceSourceServingLabel, recorded.label); assert.equal(found.grams, 237)
    const ratio = ctx.requestedIngredientBasis(request('250 ml coffee'), found).ratio
    near(ratio, 250 / (8 * 29.5735295625)); near(ctx.itemCore(found, 0, ratio).calories, 2.37 * ratio)
    assert.equal(ctx.requestedIngredientBasis(request('250 ml coffee'), actualCoffee), null)
    const weighed = ctx.compatibleOrdinaryVoiceFood('coffee', { ...actualCoffee, servingOptions: [recorded] }, request('250 g coffee'))
    assert.equal(weighed.serving_size, '100 g'); near(ctx.requestedIngredientBasis(request('250 g coffee'), weighed).ratio, 2.5)
  })
  await check('a bare cup with only recorded grams does not invent a fluid-ounce annotation', async () => {
    const recorded = { ...cupCoffee, source: 'usda', id: 'usda:coffee-grams:cup', serving_size: '1 cup — 237g', ml: null }
    local = [{ ...gramCoffee, servingOptions: [recorded] }]
    assert.equal(await lookup('250 ml coffee'), null)
  })
  await check('official exact-FDC portion repair preserves dynamic per100g nutrients and rejects other identities', async () => {
    const row = { fdcId: 171890, source: 'usda_sr_legacy', name: 'Beverages, coffee, brewed, prepared with tap water', servingSize: '100 g', calories: 1, proteinG: 0.12, carbsG: 0, fatG: 0.02, fiberG: null, sugarG: 0 }
    const repaired = verifiedPortions(row)
    assert.equal(repaired.length, 4)
    const cup = repaired.find(option => option.__sourcePortion?.portionId === 89520)
    assert.equal(cup.grams, 237); near(cup.ml, 8 * 29.5735295625); near(cup.calories, 2.37)
    assert.equal(cup.fiber_g, null); assert.equal(cup.sugar_g, 0); assert.equal(cup.__sourcePortion.fdcId, 171890)
    assert.equal(cup.__sourcePortion.archiveSha256, 'b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0')
    const differentNutrition = verifiedPortions({ ...row, calories: 2 })
    near(differentNutrition.find(option => option.__sourcePortion?.portionId === 89520).calories, 4.74)
    for (const patch of [{ fdcId: 171889 }, { source: 'usda_foundation' }, { name: 'Coffee espresso' }, { servingSize: '100 ml' }, { calories: null }, { proteinG: null }]) assert.equal(verifiedPortions({ ...row, ...patch }).length, 0)
  })
  await check('actual normal servings handler restores verified coffee measure and voice consumes the same path', async () => {
    const row = { fdcId: 171890, source: 'usda_sr_legacy', name: 'Beverages, coffee, brewed, prepared with tap water', servingSize: '100 g', calories: 1, proteinG: 0.12, carbsG: 0, fatG: 0.02, fiberG: null, sugarG: 0 }
    let providerCalls = 0; let localReads = 0
    const route = sourceModule('app/api/food-data/servings/route.ts', { verifiedUsdaRecordedPortionOptions: verifiedPortions,
      NextResponse: { json: (body, options) => ({ ...response(body, (options?.status || 200) < 400), status: options?.status || 200 }) },
      prisma: { foodLibraryItem: { findFirst: async ({ where }) => { assert.equal(where.fdcId, 171890); assert.equal(where.source, 'usda_sr_legacy'); localReads++; return row } } },
      fetchUsdaServingOptions: async () => { providerCalls++; return [] }, hasCoreFoodNutrition: value => ['calories','protein_g','carbs_g','fat_g'].every(key => typeof value[key] === 'number'),
    })
    const reply = await route.GET(new Request('https://helfi.invalid/api/food-data/servings?source=usda&id=171890'))
    assert.equal(reply.status, 200); assert.equal((await reply.json()).options.length, 4); assert.equal(providerCalls, 0)
    const candidate = food('171890', row.name, { calories: row.calories, protein_g: row.proteinG, carbs_g: row.carbsG, fat_g: row.fatG, fiber_g: null, sugar_g: 0 })
    local = [candidate]; catalog = [candidate]
    const previous = ctx.searchDiaryFoodServings
    const previousCatalog = ctx.searchDiaryFoods
    let localCatalogReads = 0
    try {
      ctx.searchDiaryFoodServings = route.GET
      ctx.searchDiaryFoods = async request => {
        assert.equal(new URL(request.url).searchParams.get('localOnly'), '1', 'Verified local coffee portions must resolve before a broad external catalog request')
        localCatalogReads++
        return response({ items: [candidate] })
      }
      const found = await lookup('250 ml coffee')
      assert.equal(found.id, '171890'); assert.equal(found.source, 'usda'); assert(found.__sourcePortion)
      const basis = ctx.requestedIngredientBasis(request('250 ml coffee'), found)
      assert(basis && basis.ratio > 0); assert.equal(found.__sourcePortion.url, officialPortions.downloadUrl)
      assert.equal(providerCalls, 0); assert(localReads >= 2); assert.equal(localCatalogReads, 1)
    } finally { ctx.searchDiaryFoodServings = previous; ctx.searchDiaryFoods = previousCatalog }
    const unchanged = await route.GET(new Request('https://helfi.invalid/api/food-data/servings?source=usda&id=171889'))
    assert.equal((await unchanged.json()).options.length, 0); assert.equal(providerCalls, 1)
  })
  await check('powder/plant/condensed milk and coffee additives or variants cannot substitute', async () => {
    for (const name of ['Milk, dry, whole', 'Whole milk powder', 'Whole milk condensed', 'Whole milk evaporated', 'Almond whole milk', 'Whole milk chocolate']) assert.equal(ctx.voiceOrdinaryIdentityMatches('whole milk', food('bad', name)), false, name)
    for (const name of ['Coffee, instant, powder', 'Coffee creamer', 'Coffee latte', 'Coffee with milk', 'Coffee sweetened with sugar', 'Coffee decaffeinated', 'Coffee beans']) assert.equal(ctx.voiceOrdinaryIdentityMatches('coffee', food('bad', name)), false, name)
    assert.equal(ctx.voiceOrdinaryIdentityMatches('decaf coffee', food('bad', 'Decaf coffee espresso')), false)
    assert.equal(ctx.voiceOrdinaryIdentityMatches('whole milk', fluidMilk), true)
  })
  await check('ordinary meat cannot match offal, skin-only or a different requested cut', async () => {
    for (const name of ['Chicken liver', 'Chicken heart', 'Chicken skin only', 'Chicken broth']) assert.equal(ctx.chooseBestFoodMatch('chicken', [food('bad', name)], request('100 g chicken')), null, name)
    assert.equal(ctx.chooseBestFoodMatch('chicken breast', [food('thigh', 'Chicken thigh')], request('100 g chicken breast')), null)
    assert.equal(ctx.chooseBestFoodMatch('chicken', [food('meat', 'Chicken, meat and skin, cooked, roasted')], request('100 g chicken')).id, 'meat')
  })
  await check('common food plurals retain exact ingredient identity instead of broken stems', async () => {
    for (const [plural, singular] of [['apples','apple'],['oranges','orange'],['grapes','grape'],['cookies','cookie'],['brownies','brownie'],['smoothies','smoothie'],['pies','pie'],['berries','berry'],['cherries','cherry'],['fries','fry'],['tomatoes','tomato'],['potatoes','potato'],['peaches','peach'],['radishes','radish'],['sandwiches','sandwich'],['boxes','box']]) assert.equal(ctx.singularFoodToken(plural), singular, plural)
    for (const word of ['asparagus','citrus','couscous','hummus','molasses','bass']) assert.equal(ctx.singularFoodToken(word), word)
    local = [food('apple', 'Apple, raw')]
    assert.equal((await lookup('2 apples')).id, 'apple')
    assert.equal(ctx.voiceOrdinaryIdentityMatches('apples', food('sauce', 'Applesauce')), false)
    assert.equal(ctx.voiceOrdinaryIdentityMatches('apple', food('sauce', 'Applesauce')), false)
  })
  await check('public USDA milk rows cannot be replaced by a food that only contains milk', async () => {
    // Public catalogue examples captured read-only by the root app audit.
    const valid = food('322892', 'Milk, whole, 3.25% milkfat, with added vitamin D', { calories: 60, protein_g: 3.28, carbs_g: 4.67, fat_g: 3.2, fiber_g: null, sugar_g: 4.81 })
    const incomplete = food('322562', 'MILK, WHOLE', { calories: null, protein_g: null, carbs_g: null, fat_g: 3.34 })
    const potatoes = food('168554', 'Potatoes, mashed, prepared from granules, without milk, whole milk and margarine', { calories: 108, protein_g: 2.05, carbs_g: 14.4, fat_g: 4.93, fiber_g: 2.2, sugar_g: null })
    local = [potatoes, incomplete, valid]
    const found = await lookup('50 ml whole milk')
    assert.equal(found.id, '322892'); assert.equal(found.fiber_g, null); assert.equal(calls.length, 0)
    near(ctx.itemCore(found, 0, ctx.requestedIngredientBasis(request('50 ml whole milk'), found).ratio).calories, 30.9)
    assert.equal(ctx.voiceOrdinaryIdentityMatches('whole milk', potatoes), false)
    assert.equal(ctx.voiceOrdinaryIdentityMatches('coffee', food('substitute', 'Beverages, coffee substitute, cereal grain beverage, prepared with water')), false)
  })
  await check('ordinary correction reuses its reviewed compatible source without a new lookup', async () => {
    failure = true
    const ingredient = request('50 ml coffee')
    const found = await ctx.findFoodIngredient(ingredient.name, 'AU', ingredient, [{ __voiceSourceFood: { ...manualCoffee, ...cupCoffee, id: manualCoffee.id, name: manualCoffee.name, selectedServingId: cupCoffee.id } }])
    assert.equal(found.id, 'manual-coffee'); assert.equal(calls.length, 0)
    near(ctx.requestedIngredientBasis(ingredient, found).ratio, 50 / 240)
  })
  await check('serving reply with another food identity or provider is refused', async () => {
    local = [gramCoffee]; catalog = [manualCoffee]
    options['manual-coffee'] = { source: 'fatsecret', options: [{ ...cupCoffee, foodName: 'Coffee creamer' }] }
    assert.equal(await lookup('250 ml coffee'), null)
    calls = []; options['manual-coffee'] = { source: 'usda', options: [cupCoffee] }
    assert.equal(await lookup('250 ml coffee'), null)
    options['manual-coffee'] = { source: 'fatsecret', options: [{ ...cupCoffee, source: 'usda' }] }
    assert.equal(await lookup('250 ml coffee'), null)
  })
  await check('missing compatible coffee measure or failed normal catalog leaves a nonconfirmable draft', async () => {
    local = [gramCoffee]; catalog = [manualCoffee]
    const parsed = { meal: 'breakfast', ingredients: [request('250 ml coffee')] }
    const draft = await ctx.buildVoiceMealDraft(parsed, 'Log coffee', '2026-10-17', 'AU')
    assert.equal(draft.canConfirm, false); assert.match(draft.confirmationMessage, /Nothing has been saved/)
    failure = true; assert.equal(await lookup('250 ml coffee'), null)
  })
  await check('natural real-world drink phrase resolves all three ingredients with source provenance', async () => {
    local = [gramCoffee, dryMilk, sugar]; catalog = [manualCoffee, fluidMilk]; options['manual-coffee'] = { source: 'fatsecret', options: [cupCoffee] }
    const transcript = 'Log 250 millilitres of coffee with 50 millilitres of whole milk and two teaspoons of sugar for today'
    const draft = await ctx.resolveVoiceDrinkDraft(ctx.tryParseWaterRequest(transcript, '2026-10-17'))
    assert.equal(draft.canConfirm, true, draft.confirmationMessage); assert.equal(draft.food.items.length, 3)
    assert.equal(draft.food.items[0].__voiceSourceFood.id, 'manual-coffee'); assert.equal(draft.food.items[1].__voiceSourceFood.id, 'fluid-milk')
    near(draft.food.items[0].calories, 2.5); near(draft.food.items[1].calories, 30.5); near(draft.food.items[2].calories, 32)
    assert.equal(draft.food.nutrition.calories, 65); assert.equal(draft.food.nutrition.fiber_g, null)
    assert.equal(draft.water.amountMl, 250)
  })
  console.log(`Voice ordinary food lookup: ${passed} actual-source offline groups passed; no real provider, UI, save or nutrition-catalog claim.`)
}
run().catch(error => { console.error(error); process.exitCode = 1 })
