#!/usr/bin/env node
'use strict'
// Broad regression of the real action route using synthetic I/O only. App and
// provider modules are never imported; no credentials, network or database exist.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
// A private VM clock lets relative-day suites freeze their own test date.
// Extracted consumers retain the process time until they explicitly opt in;
// no caller can change the process Date or another extracted fixture's clock.
let fixtureNow = null
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixtureNow ?? Date.now()])) }
  static now() { return fixtureNow ?? Date.now() }
  static setNow(value) { assert(Number.isFinite(value)); fixtureNow = value }
}
const allowed = new Set(['lib/native-voice-food-copy.ts', 'lib/native-voice-mood-context.ts', 'lib/native-voice-spoken-quantities.ts', 'lib/native-voice-time.ts', 'lib/exercise/voice-duration.ts', 'native/src/lib/foodUnits.ts', 'lib/food/serving-measurements.ts', 'lib/food/measurement-units.ts', 'lib/food/produce-measurements.ts', 'lib/food/dry-food-measurements.ts', 'lib/food/dairy-semi-solid-measurements.ts'])
const modules = new Map()
function actual(relative) {
  assert(allowed.has(relative), `Unexpected source dependency: ${relative}`)
  if (modules.has(relative)) return modules.get(relative)
  const module = { exports: {} }
  const requireLocal = (name) => name==='crypto'&&relative==='lib/native-voice-food-copy.ts'?crypto:actual(path.posix.normalize(path.posix.join(path.posix.dirname(relative), name)) + '.ts')
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: requireLocal, Intl, Date: FixtureDate }, { filename: relative })
  modules.set(relative, module.exports)
  return module.exports
}
const food = (name, calories = 100, extras = {}) => ({ id: `synthetic-${name}`, name, source: 'custom', serving_size: '100 g', calories, protein_g: 10, carbs_g: 10, fat_g: 1, fiber_g: null, sugar_g: null, ...extras })
const foods = [food('chicken', 200), food('rice', 130), food('banana', 89), food('milk', 61), food('whole milk', 61), food('coffee', 1, { serving_size: '100 ml' }), food('tea', 1, { serving_size: '100 ml' }), food('sugar', 400), food('honey', 304), food('orange juice', 45, { serving_size: '100 ml' }), food('Water', 0, { serving_size: '100 ml', protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 })]
const code = fs.readFileSync(path.join(root, 'app/api/native/voice-assistant/route.ts'), 'utf8')
const ast = ts.createSourceFile('route.ts', code, ts.ScriptTarget.Latest, true)
const printer = ts.createPrinter()
const stripped = ast.statements.filter((item) => !ts.isImportDeclaration(item)).map((item) => printer.printNode(ts.EmitHint.Unspecified, item, ast)).join('\n').replace(/^export\s+/gm, '')
let balance = 1000
let charges = []
const ctx = vm.createContext({
  ...actual('lib/native-voice-mood-context.ts'),
  ...actual('lib/native-voice-food-copy.ts'),
  process: { env: Object.freeze({}) }, Date: FixtureDate, Intl, URL, URLSearchParams, Buffer, crypto, ...require('./voice-recorded-source-fixture.cjs'), AbortController, setTimeout, clearTimeout, NextRequest: Request,
  console: { log() {}, warn() {}, error() {} },
  fetch() { throw Error('Network forbidden') }, OpenAI: class { constructor() { throw Error('Provider client forbidden') } },
  ...actual('lib/food/serving-measurements.ts'), ...actual('lib/native-voice-time.ts'), ...actual('lib/exercise/voice-duration.ts'), ...actual('lib/native-voice-spoken-quantities.ts'),
  resolveHelfiTtsVoice: () => 'marin', aiConsentRequiredResponse: async () => null,
  beginVoiceActionTrace: () => ({}), finishVoiceActionTrace: async (response) => response,
  getServerSession: async () => ({ user: { id: 'synthetic-user' } }), authOptions: {},
  getUserIdFromNativeAuth: async () => null,
  NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
  CreditManager: class { async getWalletStatus() { return { plan: 'synthetic-paid-plan', totalAvailableCents: balance } } async chargeCents(value) { charges.push(value); return true } },
  prisma: {
    user: { findUnique: async () => ({ id: 'synthetic-user' }) },
    healthGoal: { findFirst: async () => null }, foodLog: { findMany: async () => [] }, foodLibraryItem: { findMany: async () => [] },
    exerciseType: { findFirst: async ({ where }) => ({ id: 1, name: String(where.name.contains), met: 3, category: 'synthetic' }) },
  },
  searchLocalFoods: async () => [], searchDiaryFoods: async () => ({ ok: true, json: async () => ({ foods: [] }) }), searchCustomFoodMacros: async (query) => foods.filter((item) => item.name.toLowerCase() === query.toLowerCase()),
  signNativeVoiceDraft: () => 'synthetic-review-token',
  // Fixture trust only; real token signatures/expiry are tested separately.
  verifyNativeVoiceDraft: (_user, draft) => draft?.reviewToken === 'synthetic-review-token',
  findHealthIntakeReviewMatch: async () => null,
  createNativeVoicePromptHandoff: async () => ({ token: 'synthetic-private-handoff' }),
  assertAiUsageAllowed: async () => {}, isAiSafetyError: () => false, logAiUsageEvent: async () => {},
})
vm.runInContext(ts.transpileModule(stripped, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, ctx)
const results = []
async function send(text, extra = {}) {
  charges = []
  const body = { transcript: text, localDate: '2026-10-17', tzOffsetMin: -660, timeZone: 'Australia/Melbourne', aiConsentGranted: true, voiceReply: false, ...extra }
  const response = await ctx.POST({ headers: { get: () => 'application/json' }, json: async () => body })
  return { ...response, charges: [...charges] }
}
function reviewed(action, extras) { return { action, canConfirm: true, localDate: '2026-10-17', transcript: 'Synthetic previous request', reviewToken: 'synthetic-review-token', ...extras } }
async function check(name, run) {
  try { await run(); results.push({ name, pass: true }) }
  catch (error) { results.push({ name, pass: false, error: error.message }) }
}
function proposal(result, action, canConfirm = true) {
  assert.equal(result.status, 200, JSON.stringify(result.body))
  assert.equal(result.body.draft?.action, action, JSON.stringify(result.body.draft))
  assert.equal(result.body.draft?.canConfirm, canConfirm, JSON.stringify(result.body.draft))
  assert.equal(result.body.confirmNow, undefined, 'Initial logging must prepare review')
  return result.body.draft
}
async function run() {
  FixtureDate.setNow(Date.parse('2026-10-17T01:00:00.000Z'))
  const actions = [
    ['natural positive mood', 'I am feeling good today', 'mood', (d) => assert(d.mood.mood >= 5)],
    ['natural sad mood', 'I feel sad today', 'mood', (d) => assert(d.mood.mood <= 3)],
    ['numeric mood is exact', 'Log my mood as 3 out of 7', 'mood', (d) => assert.equal(d.mood.mood, 3)],
    ['spoken mood number and explicit note are exact', 'Log my mood today as five out of seven. Add the note Voice repair test mood.', 'mood', (d) => { assert.equal(d.mood.mood, 5); assert.equal(d.mood.note, 'Voice repair test mood') }],
    ['self-corrected mood uses latest feeling', 'I feel happy, no actually I feel sad', 'mood', (d) => assert(d.mood.mood <= 3, JSON.stringify(d.mood))],
    ['measured food', 'Log 100 g chicken for lunch', 'food_build_meal', (d) => { assert.equal(d.food.meal, 'lunch'); assert.equal(d.food.items.length, 1) }],
    ['natural eaten meal', 'I had 100 g chicken and 50 g rice for lunch', 'food_build_meal', (d) => assert.equal(d.food.items.length, 2)],
    ['plain hydration', 'Log 250 ml water', 'water', (d) => { assert.equal(d.water.amountMl, 250); assert.equal(d.food, undefined) }],
    ['natural drank hydration', 'I drank 250 ml water', 'water', (d) => assert.equal(d.water.amountMl, 250)],
    ['black coffee nutrition', 'Log 250 ml black coffee', 'water', (d) => assert(d.food.items.length >= 1)],
    ['coffee milk sugar nutrition', 'Log 250 ml coffee with 50 ml whole milk and 2 teaspoons sugar', 'water', (d) => assert.equal(d.food.items.length, 3)],
    ['calorie-containing drink', 'Log 250 ml unsweetened orange juice', 'water', (d) => assert(d.food.nutrition.calories > 100)],
    ['walk details', 'I walked 3 km for 45 minutes', 'exercise', (d) => { assert.equal(d.exercise.distanceKm, 3); assert.equal(d.exercise.durationMinutes, 45) }],
    ['running time', 'I ran for 30 minutes', 'exercise', (d) => assert.equal(d.exercise.durationMinutes, 30)],
    ['step count retained', 'I walked 5000 steps', 'exercise', (d) => assert.equal(d.exercise.steps, 5000)],
    ['yoga is exercise', 'I did yoga for 20 minutes', 'exercise', (d) => assert.equal(d.exercise.durationMinutes, 20)],
    ['spoken twenty minutes yoga', 'Log twenty minutes yoga', 'exercise', (d) => assert.equal(d.exercise.durationMinutes, 20)],
    ['spoken half an hour yoga', 'Log half an hour yoga', 'exercise', (d) => assert.equal(d.exercise.durationMinutes, 30)],
    ['spoken compound water volume', 'Log one hundred and fifty millilitres water', 'water', (d) => { assert.equal(d.water.amountMl, 150); assert.equal(d.food, undefined) }],
    ['spoken compound milk volume', 'Log one hundred and fifty millilitres milk', 'water', (d) => { assert.equal(d.water.amountMl, 150); assert.equal(d.food.items.length, 1) }],
    ['plain milk does not ask about added sugar', 'Log 150 ml milk', 'water', (d) => { assert.equal(d.water.amountMl, 150); assert.equal(d.water.sweetener.type, 'free'); assert.equal(d.food.items.length, 1) }],
    ['spoken compound coffee milk and mixed fraction sugar retain all ingredients', 'Log two hundred and fifty millilitres coffee with fifty millilitres whole milk and one and a half teaspoons sugar', 'water', (d) => { assert.equal(d.water.amountMl, 250); assert.equal(d.food.items.length, 3); assert.equal(d.water.sweetener.grams, 6); assert.match(d.transcript, /one and a half/) }],
    ['measured food splitting keeps compound number and original ingredient display', 'Log one hundred and fifty grams chicken and fifty grams rice for lunch', 'food_build_meal', (d) => { assert.equal(d.food.items.length, 2); assert.equal(d.food.nutrition.calories, 365); assert.match(d.food.draftText, /one hundred and fifty grams chicken/) }],
    ['health journal content', 'Write in my health journal that I slept well', 'journal', (d) => { assert.match(d.journal.content, /I slept well/); assert.equal(d.journal.journalType, 'health') }],
    ['journal context', 'I enjoyed my walk', 'journal', (d) => assert.equal(d.journal.content, 'I enjoyed my walk'), { launchContext: { section: 'journal', title: 'Health Journal' } }],
    ['health-intake medication', 'Add medication metformin 500 mg at night to Health Intake', 'health_intake_items', (d) => { assert.equal(d.autoSave, false); assert.match(JSON.stringify(d.healthIntake), /metformin|500 mg/) }],
    ['health-intake supplement', 'I take vitamin D 1000 IU in the morning', 'health_intake_items', (d) => { assert.equal(d.autoSave, false); assert.match(JSON.stringify(d.healthIntake), /1000 IU/i) }],
  ]
  for (const [name, text, action, inspect, extra] of actions) await check(name, async () => inspect(proposal(await send(text, extra), action)))
  await check('negated happiness asks clarification or proposes a nonpositive feeling', async () => {
    const r = await send('I am not happy today'); assert.equal(r.status, 200); assert.equal(r.body.draft?.action, 'mood')
    assert(r.body.draft.canConfirm === false || r.body.draft.mood?.mood <= 4, JSON.stringify(r.body.draft))
  })
  for (const text of ['Is coffee good for me?', 'I feel full', 'I had a good coffee', 'I did not do yoga for 20 minutes']) await check(`other meanings must not become emotional/exercise logs: ${text}`, async () => {
    const r = await send(text); assert.equal(r.status, 200)
    assert.equal(r.body.draft?.canConfirm, false, JSON.stringify(r.body.draft))
  })
  for (const text of ['I had a coffee', 'Log some chicken', 'Log 250 ml coffee with milk and no sugar', 'Log one or two cups water', 'Log minus fifty ml water', 'Log -50ml water', 'Log twenty or thirty minutes yoga', 'Log 150 ml flavoured milk', 'Log 150 ml milk with sugar']) await check(`unclear amount requires review: ${text}`, async () => {
    const result = await send(text); assert.equal(result.status, 200); assert.equal(result.body.draft?.canConfirm, false, JSON.stringify(result.body.draft)); assert.equal(result.body.confirmNow, undefined)
  })
  const water = proposal(await send('Log 250 ml water'), 'water')
  const mood = reviewed('mood', { mood: { mood: 5, tags: [], note: 'Feeling good' } })
  for (const text of ['yes', 'yes please', 'go ahead', 'save it']) await check(`natural confirm: ${text}`, async () => {
    const r = await send(text, { confirmationDraft: water }); assert.equal(r.body.confirmNow, true, JSON.stringify(r.body)); assert.equal(r.body.chargedCredits, 0); assert.equal(r.charges.length, 0)
  })
  for (const text of ['no', 'no thank you', 'discard it', 'do not save']) await check(`natural discard: ${text}`, async () => {
    const r = await send(text, { confirmationDraft: water }); assert.equal(r.body.rejectNow, true, JSON.stringify(r.body)); assert.equal(r.body.draft, null); assert.equal(r.charges.length, 0)
  })
  await check('zero-balance confirmation remains free', async () => {
    balance = 0; try { const r = await send('yes', { confirmationDraft: water }); assert.equal(r.body.confirmNow, true, JSON.stringify(r.body)) } finally { balance = 1000 }
  })
  await check('zero-balance correction and discard remain free; a new action requires credits', async () => {
    balance = 0
    try {
      const corrected = await send('Change it to 500 ml', { confirmationDraft: water })
      assert.equal(proposal(corrected, 'water').water.amountMl, 500); assert.equal(corrected.charges.length, 0)
      const discarded = await send('no thanks', { confirmationDraft: water })
      assert.equal(discarded.status, 200); assert.equal(discarded.body.rejectNow, true); assert.equal(discarded.charges.length, 0)
      assert.equal((await send('Log 500 ml water')).status, 402)
    } finally { balance = 1000 }
  })
  await check('reviewed mood correction retains requested numeric score', async () => {
    const r = await send('Change my mood to 2 out of 7', { confirmationDraft: mood }); const d = proposal(r, 'mood'); assert.equal(d.mood.mood, 2); assert.equal(r.charges.length, 0)
  })
  await check('rating-only mood correction preserves its explicit note and note-only correction preserves rating', async () => {
    const original = proposal(await send('Log my mood as five out of seven. Add the note Voice repair test mood.'), 'mood')
    const changed = proposal(await send('Actually make it two out of seven', { confirmationDraft: original }), 'mood'); assert.equal(changed.mood.mood, 2); assert.equal(changed.mood.note, 'Voice repair test mood')
    const editedNote = proposal(await send('Change the note to Voice repair second note', { confirmationDraft: changed }), 'mood'); assert.equal(editedNote.mood.mood, 2); assert.equal(editedNote.mood.note, 'Voice repair second note')
    assert.equal(ctx.tryParseMoodRequest('I answered five out of seven questions correctly'), null)
  })
  await check('actual mood route preserves explicit context and context-only correction; model-invented context is ignored',async()=>{
    const original=proposal(await send('Log mood as five out of seven. Energy two out of five, sleep quality three out of five, medication effect 4/5. Intensity seventy percent. Feelings are calm and hopeful.'),'mood')
    assert.equal(original.mood.context.energyLevel,2);assert.equal(original.mood.context.sleepQuality,3);assert.equal(original.mood.context.medicationEffect,4);assert.equal(original.mood.context.intensityPercent,70)
    const corrected=proposal(await send('Change energy to four out of five',{confirmationDraft:original}),'mood');assert.equal(corrected.mood.mood,5);assert.equal(corrected.mood.note,original.mood.note);assert.equal(corrected.mood.context.energyLevel,4);assert.equal(corrected.mood.context.sleepQuality,3)
    const invented=await ctx.normalizeDraft({action:'mood',mood:{mood:5,context:{energyLevel:5}}},'Log mood as five out of seven','2026-10-17','synthetic-user',null,0,[],{section:'mood'})
    assert.equal(invented.draft.mood.context.energyLevel,undefined)
  })
  await check('reviewed water volume correction stays in current request', async () => {
    const r = await send('Change it to 500 ml', { confirmationDraft: water }); assert.equal(proposal(r, 'water').water.amountMl, 500); assert.equal(r.charges.length, 0)
  })
  await check('new water request replaces mood review instead of confirming mood', async () => {
    const r = await send('Log 500 ml water', { confirmationDraft: mood }); assert.equal(proposal(r, 'water').water.amountMl, 500)
  })
  await check('explicit past date and time retained', async () => {
    const d = proposal(await send('Log 250 ml water on 2026-10-12 at 8 am'), 'water'); assert.equal(d.localDate, '2026-10-12'); assert.equal(d.localTime, '08:00')
  })
  await check('new drink or mood cannot inherit an earlier reviewed meal clock', async () => {
    const pending = reviewed('food_build_meal', { localTime: '07:30', timeZone: 'Australia/Melbourne', food: { meal: 'breakfast', items: [], nutrition: {} } })
    const drink = proposal(await send('Log 250 ml black coffee', { confirmationDraft: pending }), 'water')
    assert.equal(drink.localTime, undefined)
    const feeling = proposal(await send('I feel good today', { confirmationDraft: pending }), 'mood')
    assert.equal(feeling.localTime, undefined)
  })
  await check('new same-kind drink clock stays unset while a real correction keeps the reviewed clock', async () => {
    const pending = proposal(await send('Log 250 ml water at 7:30 am'), 'water')
    const fresh = proposal(await send('Log 250 ml black coffee', { confirmationDraft: pending }), 'water'); assert.equal(fresh.localTime, undefined); assert.equal(fresh.water.drinkType, 'Coffee')
    const corrected = proposal(await send('Change it to 500 ml', { confirmationDraft: pending }), 'water'); assert.equal(corrected.localTime, '07:30')
    const changedDate = proposal(await send('Change the date to 2026-06-15', { confirmationDraft: pending }), 'water')
    assert.equal(changedDate.localTime, '07:30'); assert.equal(changedDate.tzOffsetMin, -600); assert.equal(changedDate.localDate, '2026-06-15')
  })
  await check('fresh explicit and natural drink requests leave the old review date while actual corrections retain it', async () => {
    const pending = proposal(await send('Log 250 ml water on 2026-06-15 at 7:30 am'), 'water')
    for (const text of ['Log 250 ml black coffee', 'I drank 250 ml black coffee']) {
      const fresh = proposal(await send(text, { confirmationDraft: pending }), 'water')
      assert.equal(fresh.localDate, '2026-10-17'); assert.equal(fresh.localTime, undefined); assert.equal(fresh.water.drinkType, 'Coffee')
    }
    const corrected = proposal(await send('Actually change it to 500 ml', { confirmationDraft: pending }), 'water')
    assert.equal(corrected.localDate, '2026-06-15'); assert.equal(corrected.localTime, '07:30'); assert.equal(corrected.water.amountMl, 500)
    const yoga = proposal(await send('Log twenty minutes yoga', { confirmationDraft: pending }), 'exercise')
    assert.equal(yoga.localDate, '2026-10-17'); assert.equal(yoga.localTime, undefined)
    assert.equal(ctx.isExplicitNewVoiceCommand('Make it 500 ml water'), false)
    assert.equal(ctx.isExplicitNewVoiceCommand('Add 50 ml milk to this coffee'), false)
  })
  const actionRequest = { url: 'https://helfi.invalid/api/native/voice-assistant', headers: new Headers({ authorization: 'synthetic-original-auth' }) }
  const normalizeRegistered = (parsed, text) => ctx.normalizeDraft(parsed, text, '2026-10-17', 'synthetic-user', null, -660, [], { section: 'dashboard', title: 'Dashboard' }, [], 'AU', actionRequest, 'Australia/Melbourne')
  await check('actual app_read normalizer preserves verified helper facts and honest failure without a save', async () => {
    const parsed = { action: 'app_read', appRead: { action: 'credit.balance', values: {} } }
    let calls = 0
    ctx.readVoiceAppData = async (request, user, input) => { assert.equal(request, actionRequest); assert.equal(user, 'synthetic-user'); assert.equal(input, parsed.appRead); calls++; return { action: input.action, verified: true, safeToClaimSaved: false, message: 'You have 123 credits available.', data: { availableCredits: 123 } } }
    const result = await normalizeRegistered(parsed, 'Check my credit balance')
    assert.equal(result.draft.action, 'health_question'); assert.equal(result.draft.canConfirm, false); assert.equal(result.draft.autoSave, false); assert.equal(result.draft.appRead.data.availableCredits, 123); assert.equal(calls, 1)
    ctx.readVoiceAppData = async () => { throw Error('The app could not verify your balance.') }
    const failed = await normalizeRegistered(parsed, 'Check my credit balance')
    assert.equal(failed.draft.reasonCode, 'app_read_unverified'); assert.equal(failed.draft.canConfirm, false); assert.equal(failed.draft.appRead, undefined); assert(!/0 credits|zero credits|saved/i.test(failed.draft.confirmationMessage))
  })
  await check('actual recipe URL normalizer prepares the ten-credit review and never imports', async () => {
    let preparations = 0
    ctx.executeVoiceRecipeUrlImport = () => { throw Error('Preparation must not execute import') }
    ctx.prepareVoiceRecipeUrlImport = async (request, user, text, options) => { assert.equal(request, actionRequest); assert.equal(user, 'synthetic-user'); assert.equal(options.destination, 'library'); preparations++; return { action: 'recipe_import_url', canConfirm: true, autoSave: false, confirmationMessage: 'Import this recipe for 10 credits? Nothing has been saved.', recipeImport: { url: 'https://example.com/recipe', destination: 'library', costCredits: 10 } } }
    const result = await normalizeRegistered({ action: 'recipe_import_url' }, 'Import and save this recipe https://example.com/recipe to my library')
    assert.equal(preparations, 1); assert.equal(result.draft.action, 'recipe_import_url'); assert.equal(result.draft.recipeImport.costCredits, 10); assert.equal(result.draft.canConfirm, true); assert.equal(result.draft.autoSave, false); assert.match(result.draft.confirmationMessage, /Nothing has been saved/)
  })
  await check('actual support normalizer separates registered read facts from a reviewed send', async () => {
    let reads = 0, preparations = 0
    ctx.executeVoiceSupportAction = () => { throw Error('Preparation must not send support') }
    ctx.readVoiceSupportFacts = async (request, user, input) => { assert.equal(request, actionRequest); assert.equal(user, 'synthetic-user'); assert.equal(input.action, 'support.list'); reads++; return { status: 'facts', tickets: [{ id: 'owned-ticket', subject: 'Voice test', status: 'OPEN' }] } }
    ctx.prepareVoiceSupportAction = async (request, user, input) => { assert.equal(request, actionRequest); assert.equal(user, 'synthetic-user'); assert.equal(input.action, 'support.create'); preparations++; return { action: 'support_action', canConfirm: true, autoSave: false, confirmationMessage: 'Send this exact support message: Test words?', supportAction: { action: input.action, payload: { message: input.values.message } } } }
    const read = await normalizeRegistered({ action: 'support_action', supportAction: { action: 'support.list', values: {} } }, 'Show my support tickets')
    assert.equal(read.draft.action, 'health_question'); assert.equal(read.draft.canConfirm, false); assert.match(read.draft.confirmationMessage, /Voice test.*OPEN/)
    const review = await normalizeRegistered({ action: 'support_action', supportAction: { action: 'support.create', values: { message: 'Test words' } } }, 'Send a support message saying Test words')
    assert.equal(review.draft.action, 'support_action'); assert.equal(review.draft.canConfirm, true); assert.equal(review.draft.supportAction.payload.message, 'Test words'); assert.equal(reads, 1); assert.equal(preparations, 1)
  })
  await check('actual report normalizer delegates only a registered review and never generates', async () => {
    let preparations = 0
    assert(fs.readFileSync(path.join(root, 'lib/native-voice-report-actions.ts'), 'utf8').includes("'reports.weekly.generate':"), 'Boundary fixture must use the actual registered report action')
    ctx.executeVoiceReportAction = () => { throw Error('Preparation must not generate report') }
    ctx.prepareVoiceReportAction = async (request, user, input) => { assert.equal(request, actionRequest); assert.equal(user, 'synthetic-user'); assert.equal(input.action, 'reports.weekly.generate'); preparations++; return { action: 'report_action', canConfirm: true, autoSave: false, confirmationMessage: 'Generate your report using the normal credit checks?', reportAction: input } }
    const result = await normalizeRegistered({ action: 'report_action', reportAction: { action: 'reports.weekly.generate', values: {} } }, 'Generate my weekly report')
    assert.equal(preparations, 1); assert.equal(result.draft.action, 'report_action'); assert.equal(result.draft.canConfirm, true); assert.equal(result.draft.autoSave, false); assert.equal(result.draft.reportAction.action, 'reports.weekly.generate')
  })
  const genericLunchFavorite = [{ id: 'synthetic-generic-lunch', label: 'For lunch', meal: 'lunch', nutrition: { calories: 481, protein: 20, carbs: 60, fat: 18, fiber: null, sugar: null }, items: [{ name: 'Generic saved lunch', calories: 481 }] }]
  await check('naming a reviewed 1020-calorie meal preserves food and cannot substitute a generic lunch favorite', async () => {
    const pending = reviewed('food_build_meal', { food: { meal: 'lunch', mealName: 'Reviewed restaurant meal', draftText: 'Reviewed restaurant foods', nutrition: { calories: 1020, protein: 40, carbs: 120, fat: 30, fiber: null, sugar: null }, items: [{ id: 'original-one', name: 'Original restaurant food', serving_size: '1 serving', calories: 1020 }] } })
    const r = await send('Call this meal Voice repair test lunch', { confirmationDraft: pending, favorites: genericLunchFavorite })
    const d = proposal(r, 'food_build_meal')
    assert.equal(d.food.mealName, 'Voice repair test lunch'); assert.equal(d.food.nutrition.calories, 1020)
    assert.equal(JSON.stringify(d.food.items), JSON.stringify(pending.food.items)); assert.equal(r.charges.length, 0)
  })
  await check('a new restaurant lunch request cannot become the generic For lunch favorite', async () => {
    const r = await send('Log one McDonalds Big Mac and one large fries for lunch', { favorites: genericLunchFavorite })
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.notEqual(r.body.draft?.action, 'food_favorite', JSON.stringify(r.body.draft))
    assert.notEqual(r.body.draft?.food?.favoriteId, 'synthetic-generic-lunch')
  })
  for (const [text, extra] of [
    ['Change my coffee to 500 ml', {}],
    ['Delete my water entry', {}],
    ['Change my mood entry to 2 out of 7', {}],
    ['Change it to 500 ml', { followUpDraft: { action: 'record_action', canConfirm: false, localDate: '2026-10-17', recordAction: { operation: 'update', entity: 'water', query: 'Coffee', localDate: '2026-10-17', changes: {} } } }],
    ['Make it 2000 calories', { followUpDraft: { action: 'preference_action', canConfirm: false, localDate: '2026-10-17', preferenceAction: { operation: 'update', changes: { dailyCalorieTarget: 1900 } } } }],
  ]) await check(`existing-entry or setting request never becomes a fresh log: ${text}`, async () => {
    const r = await send(text, extra)
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert(!['water', 'food_build_meal', 'food_draft', 'mood', 'exercise'].includes(r.body.draft?.action), JSON.stringify(r.body.draft))
    assert.equal(r.body.confirmNow, undefined)
  })
  for (const text of ['I want to hurt myself', 'Should I stop my medication?', 'What should I do about chest pain?']) await check(`health safety: ${text}`, async () => {
    const r = await send(text); assert.equal(r.status, 200); assert.equal(r.body.draft?.canConfirm, false); assert.equal(r.body.confirmNow, undefined)
  })
  await check('symptom note is safe review/handoff rather than diagnosis', async () => {
    const r = await send('Record a symptom note: headache for two hours'); assert.equal(r.status, 200)
    assert(['symptom_note', 'app_handoff'].includes(r.body.draft?.action), JSON.stringify(r.body.draft))
    assert(!/you have|diagnosis is/i.test(r.body.draft.confirmationMessage))
  })
  for (const text of ['Delete all my meal history', 'Transfer 100 dollars', 'yes']) await check(`unsupported or contextless command cannot claim/save: ${text}`, async () => {
    const r = await send(text); assert.equal(r.status, 200); assert.equal(r.body.confirmNow, undefined); assert.equal(r.body.draft?.canConfirm, false, JSON.stringify(r.body.draft))
  })
  console.log(JSON.stringify({ scope: 'Actual route/functions with synthetic account, foods and I/O; no provider or microphone/save proof', passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results }, null, 2))
  if (results.some((r) => !r.pass)) process.exitCode = 1
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
