#!/usr/bin/env node
'use strict'

// Compose the actual draft, signature and confirmation code using the existing
// strictly offline fixture loaders. Every food, account, clock and DB row is
// synthetic. No app imports, env files, network, provider or real database.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const scriptDirectory = __dirname
function fixturePreamble(name, returns) {
  const file = path.join(scriptDirectory, name)
  const source = fs.readFileSync(file, 'utf8').replace(/^#!.*\n/, '')
  const boundary = source.indexOf('async function run() {')
  assert.ok(boundary > 0, `Offline fixture boundary missing: ${name}`)
  // Reuse only fixture declarations; do not execute either suite's tests.
  return new Function('require', '__dirname', `${source.slice(0, boundary)}\nreturn ${returns}`)(require, scriptDirectory)
}
const draftRoute = fixturePreamble('voice-draft-integrity-check.cjs', 'ctx')
const saving = fixturePreamble('voice-save-integrity-check.cjs', '{ harness, tokens, AuditDate }')
draftRoute.crypto = crypto
draftRoute.signNativeVoiceDraft = saving.tokens.signNativeVoiceDraft
draftRoute.Date = saving.AuditDate
const json = value => JSON.parse(JSON.stringify(value))
async function run() {
  const request = 'Log 250 ml coffee with 50 ml whole milk and 2 teaspoons sugar'
  const parsed = draftRoute.tryParseWaterRequest(request, '2026-10-15')
  const summerDraft = draftRoute.applyDraftTiming(parsed, 'at 19:30', -660, undefined, 'Australia/Melbourne', '2026-10-15')
  const reviewedSummer = await draftRoute.sealReviewDraft('synthetic-user', summerDraft)
  assert(saving.tokens.verifyNativeVoiceDraft('synthetic-user', reviewedSummer))
  const corrected = await draftRoute.buildReviewedDraftCorrection(reviewedSummer, 'Change the date to June 1 2026', '2026-06-01')
  const winterDraft = draftRoute.applyDraftTiming(corrected, 'Change the date to June 1 2026', -660, reviewedSummer, 'Australia/Melbourne', '2026-10-15')
  const sealed = await draftRoute.sealReviewDraft('synthetic-user', winterDraft)
  assert(saving.tokens.verifyNativeVoiceDraft('synthetic-user', sealed))
  assert.equal(sealed.tzOffsetMin, -600)
  assert.equal(sealed.timeZone, 'Australia/Melbourne')
  const h = saving.harness()
  const response = await h.send(json(sealed))
  const replay = await h.send(json(sealed))
  assert.equal(response.status, 200)
  assert.equal(replay.status, 200)
  assert.equal(replay.body.idempotentReplay, true)
  assert.equal(h.state().water.length, 1)
  assert.equal(h.state().food.length, 1)
  assert.equal(h.state().food[0].nutrients.calories, 66)
  assert.equal(h.state().food[0].items.length, 3)
  assert.ok(Math.abs(h.state().food[0].items.find(item => /milk/i.test(item.name)).calories - 31.415) < 1e-9)
  assert.equal(h.state().food[0].createdAt.toISOString(), '2026-06-01T09:30:00.000Z')
  assert.equal(h.state().food[0].nutrients.fiber_g, null)
  assert.equal(saving.tokens.verifyNativeVoiceDraft('synthetic-user', { ...sealed, timeZone: 'UTC' }), false)
  assert.equal((await h.send({ ...json(sealed), timeZone: 'UTC' })).status, 400)
  const plain = saving.harness()
  const water = await draftRoute.sealReviewDraft('synthetic-user', draftRoute.tryParseWaterRequest('Log 250 ml plain water', '2026-10-15'))
  assert.equal((await plain.send(json(water))).status, 200)
  assert.equal(plain.state().water.length, 1)
  assert.equal(plain.state().food.length, 0)
  const rejected = saving.harness()
  const sweeteners = await draftRoute.sealReviewDraft('synthetic-user', draftRoute.tryParseWaterRequest('Log 250 ml coffee with 2 teaspoons sugar and one teaspoon honey', '2026-10-15'))
  assert.equal(sweeteners.canConfirm, false)
  assert.equal((await rejected.send(json(sweeteners))).status, 400)
  assert.equal(rejected.state().water.length, 0)
  assert.equal(rejected.state().food.length, 0)
  console.log('PASS: actual draft resolution → DST date correction → real signing/verification → atomic save/retry. Correct June 19:30 Melbourne timestamp, coffee/milk/sugar nutrition, one hydration and food row, optional nulls, signed-zone tamper rejection, plain-water-only save and unconfirmed-sweetener rejection. Synthetic fixtures only; no live audio/provider/data claim.')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
