#!/usr/bin/env node
'use strict'
// Actual confirm route, HMAC and persisted replay code, with a synthetic paid
// importer and synthetic normal recipe-review route. No app/network/env access.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const fixtureSource = fs.readFileSync(path.join(__dirname, 'voice-save-integrity-check.cjs'), 'utf8').replace(/^#!.*\n/, '')
const boundary = fixtureSource.indexOf('async function run() {')
assert(boundary > 0)
const fixture = new Function('require', '__dirname', `${fixtureSource.slice(0, boundary)}\nreturn { harness, signed, tokens, AuditDate }`)(require, __dirname)
class NextRequest extends Request {}
const plain = value => JSON.parse(JSON.stringify(value))
const owner = 'synthetic-user'
function setup(options = {}) {
  const h = fixture.harness(options), calls = [], reviewRequests = []
  const importedDraft = { action: 'recipe', transcript: 'Import https://recipes.example/meal', localDate: '2026-10-15', summary: 'Imported chicken recipe', confirmationMessage: 'Choose recipe library or servings eaten. Nothing has been saved.', canConfirm: false, autoSave: false, recipe: { text: 'Yield four; 200 g chicken; cook thoroughly.', importDraft: { title: 'Chicken recipe', servings: 4, ingredients: ['200 g chicken'], steps: ['Cook thoroughly.'] } } }
  const normalizedDraft = fixture.signed({ action: 'food_build_meal', transcript: 'Log this recipe for lunch', summary: 'Chicken, one serving', confirmationMessage: 'Review this recipe food before saving.', food: { meal: 'lunch', items: [] } })
  const draft = fixture.signed({ action: 'recipe_import_url', transcript: importedDraft.transcript, summary: 'Import recipe', confirmationMessage: 'Import for 10 credits?', recipeImport: { userId: owner, url: 'https://recipes.example/meal', costCredits: 10, destination: options.destination || 'diary', meal: 'lunch' } })
  Object.assign(h.route, { NextRequest, Headers, URL,
    executeVoiceRecipeUrlImport: async (request, userId, reviewed, context) => {
      assert.equal(userId, owner); assert.equal(context.receiptClaimed, true); assert(context.actionId.length > 20)
      assert(fixture.tokens.verifyNativeVoiceDraft(userId, reviewed)); calls.push(context.actionId)
      assert.equal(request.headers.get('authorization'), 'Bearer synthetic-original')
      if (options.importFailure) throw Error('Synthetic importer failed')
      return { kind: 'recipe_import', status: 'imported_not_saved', saved: false, actionId: context.actionId, costCredits: 10, message: 'Recipe imported for review. No food diary entry or saved recipe has been created.', nextRecipeDraft: importedDraft }
    },
    require: name => {
      assert.equal(name, '@/app/api/native/voice-assistant/route', 'Only the fixed normal recipe review handler may be loaded')
      return { POST: async request => {
        reviewRequests.push({ request, body: await request.json() })
        if (options.reviewFailure) throw Error('Synthetic normal review unavailable')
        return { ok: !options.reviewRejected, json: async () => options.reviewRejected ? { error: 'Synthetic food source unavailable' } : { draft: options.reviewUnresolved ? { action: 'food_draft', transcript: 'Log this recipe', localDate: importedDraft.localDate, summary: 'Recipe ingredient needs matching', confirmationMessage: 'Which chicken product should I use? Nothing has been saved.', canConfirm: false } : normalizedDraft } }
      } }
    },
  })
  const send = reviewed => h.route.POST(new NextRequest('https://helfi.invalid/api/native/voice-assistant/confirm', { method: 'POST', headers: { authorization: 'Bearer synthetic-original', 'x-helfi-voice-action-id': 'synthetic-import-action', 'content-type': 'application/json' }, body: JSON.stringify({ draft: reviewed || draft }) }))
  return { h, draft, calls, reviewRequests, importedDraft, normalizedDraft, send }
}
let count = 0
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`) }
async function main() {
  await check('actual confirm requires real signed explicit review before claiming or importing', async () => {
    const state = setup()
    for (const draft of [{ ...state.draft, canConfirm: false }, { ...state.draft, recipeImport: { ...state.draft.recipeImport, costCredits: 1 } }, { ...state.draft, reviewToken: 'tampered' }]) assert.equal((await state.send(draft)).status, 400)
    assert.equal(state.calls.length, 0); assert.equal(Object.keys(state.h.state().tokens).length, 0)
    assert.equal((await setup({ unauthorized: true }).send()).status, 401)
  })
  for (const destination of ['diary', 'library']) await check(`actual ${destination} confirmation imports once, reviews through normal route and replays identical stored result`, async () => {
    const state = setup({ destination })
    const first = await state.send(), replay = await state.send()
    assert.equal(first.status, 200); assert.equal(first.body.success, true)
    assert.equal(first.body.result.kind, 'recipe_import'); assert.equal(first.body.result.saved, false); assert.equal(first.body.result.status, 'imported_not_saved')
    assert.deepEqual(plain(first.body.result.nextRecipeDraft), plain(state.normalizedDraft))
    assert.equal(replay.status, 200); assert.equal(replay.body.idempotentReplay, true); assert.deepEqual(plain(replay.body.result), plain(first.body.result))
    assert.equal(state.calls.length, 1); assert.equal(state.reviewRequests.length, 1)
    const next = state.reviewRequests[0]
    assert.equal(next.request.method, 'POST'); assert.equal(new URL(next.request.url).pathname, '/api/native/voice-assistant')
    assert.equal(next.request.headers.get('authorization'), 'Bearer synthetic-original'); assert.equal(next.request.headers.get('x-helfi-voice-action-id'), 'synthetic-import-action')
    assert.equal(next.body.localDate, state.draft.localDate); assert.equal(next.body.voiceReply, false)
    assert.deepEqual(plain(next.body.followUpDraft), plain(state.importedDraft))
    assert.equal(next.body.transcript, destination === 'library' ? 'Save this recipe to my recipes' : 'Log this recipe for lunch')
    assert.equal(state.h.state().food.length, 0); assert.equal(state.h.state().water.length, 0); assert.equal(state.h.effects.length, 0)
  })
  for (const failure of ['reviewFailure', 'reviewRejected']) await check(`paid import retains full clarification and replays without another import after ${failure}`, async () => {
    const state = setup({ [failure]: true }), first = await state.send(), replay = await state.send()
    assert.equal(first.status, 200); assert.deepEqual(plain(first.body.result.nextRecipeDraft), plain(state.importedDraft))
    assert.equal(replay.body.idempotentReplay, true); assert.equal(state.calls.length, 1); assert.equal(state.reviewRequests.length, 1)
    assert.equal(state.h.state().food.length, 0)
  })
  await check('import failure keeps pending claim and retry cannot call paid importer again or claim saved', async () => {
    const state = setup({ importFailure: true })
    assert.equal((await state.send()).status, 500)
    const replay = await state.send()
    assert.equal(replay.status, 409); assert.equal(replay.body.code, 'voice_save_result_unconfirmed')
    assert.equal(state.calls.length, 1); assert.equal(state.reviewRequests.length, 0); assert.equal(state.h.state().food.length, 0)
  })
  await check('normal unresolved ingredient response becomes recipe clarification with the full imported source retained', async () => {
    const state = setup({ reviewUnresolved: true }), first = await state.send(), replay = await state.send()
    assert.equal(first.status, 200); assert.equal(first.body.result.saved, false)
    assert.equal(first.body.result.nextRecipeDraft.action, 'recipe'); assert.equal(first.body.result.nextRecipeDraft.canConfirm, false)
    assert.match(first.body.result.nextRecipeDraft.confirmationMessage, /Which chicken product/)
    assert.deepEqual(plain(first.body.result.nextRecipeDraft.recipe), plain(state.importedDraft.recipe))
    assert.deepEqual(plain(first.body.result), plain(replay.body.result)); assert.equal(state.calls.length, 1); assert.equal(state.reviewRequests.length, 1)
    assert.equal(state.h.state().food.length, 0)
  })
  console.log(`Voice recipe import confirmation: ${count} actual-source offline groups passed; synthetic importer/review only, no real charge/save/provider proof.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
