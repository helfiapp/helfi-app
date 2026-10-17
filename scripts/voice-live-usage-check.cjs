#!/usr/bin/env node
'use strict'
// Run the actual pure native helper with synthetic events only. No app env,
// provider client, network, microphone, wallet or account storage is loaded.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const file = path.join(__dirname, '../native/src/voice/liveVoiceUsage.ts')
const source = fs.readFileSync(file, 'utf8')
assert(!/^import\s/m.test(source), 'The measurement helper must stay pure')
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: exportsObject })
const create = options => exportsObject.createLiveVoiceUsageTracker({ voiceModel: 'gpt-live-1', backendModel: 'gpt-6-luna', serviceTier: 'default', ...options })
const update = seconds => ({ type: 'session.usage.updated', usage: { seconds } })
const closed = seconds => ({ type: 'session.closed', usage: { seconds } })
const response = (id = 'private-response', extra = {}, type = 'response.completed') => ({ type: 'response.event', event: { type, response: { id, model: 'gpt-6-luna', service_tier: 'default', usage: { input_tokens: 5000, output_tokens: 500, total_tokens: 5500, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } }, ...extra } } })
const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
let groups = 0
const check = (label, work) => { work(); groups++; console.log('PASS ' + label) }

check('cumulative seconds use max, ignore stale snapshots, and final close is counted once', () => {
  const tracker = create(); tracker.markAllocated(); tracker.markAllocated()
  for (const seconds of [12, 12, 10, 30]) tracker.record(update(seconds))
  tracker.record(closed(31)); tracker.record(closed(999))
  const value = tracker.summary(); assert.equal(value.providerSeconds, 31); assert.equal(value.estimatedBillableSeconds, 31)
  assert.equal(value.finalComplete, true); assert.equal(value.costIncomplete, false); close(value.totalUsdAtStandardRates, 31 / 60 * .05)
})
check('unallocated, allocation-only and sub-15-second receipts do not double-add initialization', () => {
  const tracker = create(); assert.equal(tracker.summary().totalUsdAtStandardRates, 0); assert.equal(tracker.summary().finalComplete, false)
  tracker.markAllocated(); close(tracker.summary().totalUsdAtStandardRates, .0125); assert.equal(tracker.summary().costIncomplete, true)
  tracker.record(closed(3)); assert.equal(tracker.summary().providerSeconds, 3); assert.equal(tracker.summary().estimatedBillableSeconds, 15)
  close(tracker.summary().totalUsdAtStandardRates, .0125)
  const ninety = create(); ninety.markAllocated(); ninety.record(closed(90)); close(ninety.summary().totalUsdAtStandardRates, .075)
})
check('nested backend terminal receipts deduplicate IDs and preserve input/output/cache counts', () => {
  const tracker = create(); tracker.markAllocated()
  const event = response(); tracker.record(event); tracker.record(event); tracker.record(response('private-response', { usage: { input_tokens: 999999 } }))
  tracker.record(closed(30)); const value = tracker.summary()
  assert.equal(value.responseCount, 1); assert.equal(value.inputTokens, 5000); assert.equal(value.outputTokens, 500)
  close(value.backendUsdAtStandardRates, .00075); close(value.totalUsdAtStandardRates, .02575)
  assert.equal(value.costIncomplete, false); assert.equal(value.invoiceConfirmed, false)
})
check('cached reads and writes replace ordinary input, reasoning is already inside output total', () => {
  const tracker = create(); tracker.markAllocated()
  tracker.record(response('cache', { usage: { input_tokens: 1200, output_tokens: 200, total_tokens: 1400, input_tokens_details: { cached_tokens: 400, cache_write_tokens: 500 }, output_tokens_details: { reasoning_tokens: 150 } } }))
  tracker.record(closed(60)); const value = tracker.summary()
  assert.equal(value.cachedInputTokens, 400); assert.equal(value.cacheWriteTokens, 500); assert.equal(value.outputTokens, 200)
  close(value.backendUsdAtStandardRates, (300 * .1 + 400 * .01 + 500 * .125 + 200 * .5) / 1e6)
})
check('long-context premium starts strictly above 272000 tokens and prices the entire request', () => {
  for (const input of [272000, 272001]) {
    const tracker = create(); tracker.markAllocated()
    tracker.record(response('long', { usage: { input_tokens: input, output_tokens: 500, total_tokens: input + 500, input_tokens_details: { cached_tokens: 1000, cache_write_tokens: 2000 } } }))
    tracker.record(closed(60)); close(tracker.summary().backendUsdAtStandardRates, ((input - 3000) * (input > 272000 ? .2 : .1) + 1000 * (input > 272000 ? .02 : .01) + 2000 * (input > 272000 ? .25 : .125) + 500 * (input > 272000 ? .75 : .5)) / 1e6)
  }
})
check('unknown models preserve tokens and refuse a fabricated dollar total', () => {
  const tracker = create(); tracker.markAllocated(); tracker.record(response('unknown', { model: 'private-unknown-model' })); tracker.record(closed(30))
  const value = tracker.summary(); assert.equal(value.inputTokens, 5000); assert.equal(value.unknownModelResponses, 1)
  assert.equal(value.backendUsdAtStandardRates, null); assert.equal(value.totalUsdAtStandardRates, null); assert.equal(value.costIncomplete, true)
  const voice = create({ voiceModel: 'unsupported' }); voice.markAllocated(); voice.record(closed(30)); assert.equal(voice.summary().voiceUsdAtPublishedRate, null)
})
check('unknown tier and missing cache-write counts remain explicit standard-rate estimates only', () => {
  const tracker = create({ serviceTier: undefined }); tracker.markAllocated()
  tracker.record(response('tier', { service_tier: undefined, usage: { input_tokens: 5000, output_tokens: 500, input_tokens_details: { cached_tokens: 0 } } })); tracker.record(closed(30))
  const value = tracker.summary(); close(value.totalUsdAtStandardRates, .02575); assert.equal(value.finalComplete, true)
  assert.equal(value.unknownTierResponses, 1); assert.equal(value.incompleteCacheResponses, 1); assert.equal(value.costIncomplete, true)
})
check('missing, malformed and impossible token counts cannot appear as a complete cost receipt', () => {
  for (const usage of [null, {}, { input_tokens: -1, output_tokens: 0 }, { input_tokens: '5', output_tokens: 1 }, { input_tokens: 1, output_tokens: 2, total_tokens: 99, input_tokens_details: { cached_tokens: 0 } }, { input_tokens: 5, output_tokens: 2, input_tokens_details: { cached_tokens: 6 } }, { input_tokens: 5, output_tokens: Infinity, input_tokens_details: { cached_tokens: 0 } }]) {
    const tracker = create(); tracker.markAllocated(); tracker.record(response('bad', { usage })); tracker.record(closed(30))
    assert.equal(tracker.summary().costIncomplete, true); assert.equal(tracker.summary().finalComplete, false); assert.equal(tracker.summary().totalUsdAtStandardRates, null)
  }
})
check('pending, failed and incomplete backend work is measured without claiming zero spend', () => {
  const pending = create(); pending.markAllocated(); pending.record(response('pending', {}, 'response.created')); pending.record(closed(30))
  assert.equal(pending.summary().finalComplete, false); assert.equal(pending.summary().missingUsageResponses, 1)
  for (const type of ['response.failed', 'response.incomplete', 'response.cancelled']) {
    const tracker = create(); tracker.markAllocated(); tracker.record(response('failure', {}, type)); tracker.record(closed(30))
    close(tracker.summary().backendUsdAtStandardRates, .00075); assert.equal(tracker.summary().finalComplete, true)
    const noUsage = create(); noUsage.markAllocated(); noUsage.record(response('failure', { usage: null }, type)); noUsage.record(closed(30)); assert.equal(noUsage.summary().costIncomplete, true)
  }
})
check('missing/contradictory final seconds and anonymous terminal receipts stay uncertain', () => {
  for (const seconds of [undefined, null, '30', -1, Infinity, NaN]) {
    const tracker = create(); tracker.markAllocated(); tracker.record(update(20)); tracker.record(closed(seconds)); assert.equal(tracker.summary().finalComplete, false)
  }
  const tracker = create(); tracker.markAllocated(); tracker.record(update(20)); tracker.record(closed(15)); assert.equal(tracker.summary().providerSeconds, 20); assert.equal(tracker.summary().costIncomplete, true)
  const after = create(); after.markAllocated(); after.record(closed(20)); after.record(update(21)); assert.equal(after.summary().finalComplete, false)
  const anonymous = create(); anonymous.markAllocated(); anonymous.record(response('', {})); anonymous.record(closed(30)); assert.equal(anonymous.summary().totalUsdAtStandardRates, null)
})
check('reconnects have independent initialization and summary contains no private payload or identifiers', () => {
  const trackers = [create(), create()]
  for (const tracker of trackers) { tracker.markAllocated(); tracker.record({ type: 'session.input_transcript.delta', delta: 'PRIVATE_HEALTH_TRANSCRIPT' }); tracker.record(response('PRIVATE_RESPONSE_ID', { instructions: 'PRIVATE_INSTRUCTIONS' })); tracker.record(closed(5)) }
  close(trackers.reduce((sum, tracker) => sum + tracker.summary().voiceUsdAtPublishedRate, 0), .025)
  const value = trackers[0].summary(); assert(!JSON.stringify(value).includes('PRIVATE'))
  assert(Object.values(value).every(item => item === null || typeof item === 'number' || typeof item === 'boolean'))
  value.inputTokens = 999; assert.equal(trackers[0].summary().inputTokens, 5000, 'Summary cannot mutate measurements')
})
check('server-owned backend charges cannot be reported as a client-observed zero or complete total', () => {
  const tracker = create(); tracker.markAllocated(); tracker.markBackendExternallyMetered(); tracker.record(closed(30))
  const value = tracker.summary(); close(value.voiceUsdAtPublishedRate, .025)
  assert.equal(value.backendUsdAtStandardRates, null); assert.equal(value.totalUsdAtStandardRates, null)
  assert.equal(value.finalComplete, false); assert.equal(value.costIncomplete, true)
})
console.log(`PASS ${groups} actual-helper offline groups; no network, API, credentials, wallet or account writes.`)
