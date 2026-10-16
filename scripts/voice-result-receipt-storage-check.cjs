#!/usr/bin/env node
'use strict'
// Reuse actual confirm + synthetic importer fixtures. No app/network/provider,
// credential/environment-file, real database or user-data access.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const fixture = fs.readFileSync(path.join(__dirname, 'voice-recipe-import-confirm-check.cjs'), 'utf8').replace(/^#!.*\n/, '')
const boundary = fixture.indexOf('async function main() {')
assert(boundary > 0)
const { setup, fixture: baseFixture } = new Function('require', '__dirname', `${fixture.slice(0, boundary)}\nreturn { setup, fixture }`)(require, __dirname)
const plain = value => JSON.parse(JSON.stringify(value))
function largeRecipe(state) {
  state.importedDraft.recipe.importDraft.steps = Array.from({ length: 300 }, (_, index) => `Рецепт 🥛 preparation ${index}: ${crypto.createHash('sha256').update(`public-synthetic-step-${index}`).digest('hex')}`)
  assert(Buffer.byteLength(JSON.stringify(state.importedDraft)) > 2704)
}
let passed = 0
async function check(label, run) { await run(); passed++; console.log(`PASS ${label}`) }
async function main() {
  await check('actual paid import confirmation persists a large Unicode result within bounded indexed rows and replays once', async () => {
    const state = setup({ reviewFailure: true }); largeRecipe(state)
    const first = await state.send(), replay = await state.send()
    assert.equal(first.status, 200); assert.equal(first.body.result.status, 'imported_not_saved'); assert.equal(first.body.result.saved, false)
    assert.deepEqual(plain(first.body.result.nextRecipeDraft), plain(state.importedDraft))
    assert.equal(replay.status, 200); assert.equal(replay.body.idempotentReplay, true)
    assert.deepEqual(plain(replay.body.result), plain(first.body.result)); assert.equal(state.calls.length, 1)
    const rows = Object.values(state.h.state().tokens)
    assert(rows.length > 30)
    assert(rows.every(row => Buffer.byteLength(row.identifier) + Buffer.byteLength(row.token) + 16 <= 2704))
    assert.equal(state.h.state().food.length, 0)
  })
  await check('actual post-import chunk failure publishes no partial completion and replay never invokes importer again', async () => {
    const state = setup({ reviewFailure: true, chunkFailures: 1 }); largeRecipe(state)
    const first = await state.send(), replay = await state.send()
    assert.equal(first.status, 500); assert.match(first.body.error, /chunk write failure/)
    assert.equal(replay.status, 409); assert.equal(replay.body.code, 'voice_save_result_unconfirmed'); assert.equal(state.calls.length, 1)
    const rows = Object.values(state.h.state().tokens)
    assert.equal(rows.length, 1); assert(rows[0].identifier.startsWith('native-voice-review-used:'))
    assert.equal(state.h.state().food.length, 0)
  })
  await check('a corrupted completed import receipt fails honestly without a second paid import', async () => {
    const state = setup({ reviewFailure: true }); largeRecipe(state)
    assert.equal((await state.send()).status, 200)
    const chunk = Object.values(state.h.state().tokens).find(row => row.identifier.startsWith('native-voice-review-chunk:'))
    chunk.identifier = `${chunk.identifier.slice(0, -1)}!`
    const replay = await state.send()
    assert.equal(replay.status, 409); assert.equal(replay.body.success, undefined); assert.equal(state.calls.length, 1)
  })
  await check('completed paid import recovers after review expiry from stored data only, until receipt expiry', async () => {
    const initial = baseFixture.AuditDate.now()
    try {
      const state = setup({ reviewFailure: true }); largeRecipe(state)
      const first = await state.send(); assert.equal(first.status, 200)
      baseFixture.AuditDate.setNow(initial + 31 * 60 * 1000)
      assert.equal(baseFixture.tokens.verifyNativeVoiceDraft('synthetic-user', state.draft), false, 'Actual current review window is30minutes')
      const altered = { ...state.draft, action: 'food_build_meal', canConfirm: false, transcript: 'altered request', recipeImport: { costCredits: 1 }, food: { items: [{ calories: -1 }] } }
      const recovered = await state.send(altered)
      assert.equal(recovered.status, 200); assert.equal(recovered.body.idempotentReplay, true); assert.deepEqual(plain(recovered.body.result), plain(first.body.result))
      assert.equal(state.calls.length, 1); assert.equal(state.reviewRequests.length, 1); assert.equal(state.h.state().food.length, 0)
      state.h.route.getServerSession = async () => ({ user: { id: 'other-user' } })
      state.h.route.prisma.user.findUnique = async ({ where }) => ({ id: where.id })
      assert.equal((await state.send()).status, 400, 'Another account cannot retrieve the opaque-token result')
      state.h.route.getServerSession = async () => ({ user: { id: 'synthetic-user' } })
      baseFixture.AuditDate.setNow(initial + 24 * 60 * 60 * 1000 + 1)
      assert.equal((await state.send()).status, 400); assert.equal(state.calls.length, 1)
    } finally { baseFixture.AuditDate.setNow(initial) }
  })
  await check('expired missing or pending import reviews cannot recover or execute an action', async () => {
    const initial = baseFixture.AuditDate.now()
    try {
      for (const pending of [false, true]) {
        baseFixture.AuditDate.setNow(initial)
        const state = setup()
        if (pending) await state.h.route.markReviewTokenUsed('synthetic-user', state.draft)
        baseFixture.AuditDate.setNow(initial + 31 * 60 * 1000)
        assert.equal((await state.send()).status, 400); assert.equal(state.calls.length, 0); assert.equal(state.h.state().food.length, 0)
      }
    } finally { baseFixture.AuditDate.setNow(initial) }
  })
  console.log(`Voice result receipt storage: ${passed} actual-source offline groups passed; PostgreSQL index-size rejection simulated, no live import or charge.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
