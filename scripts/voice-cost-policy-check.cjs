#!/usr/bin/env node
'use strict'
// Actual server policy, synthetic money/usage/proofs only. No app config,
// credentials, network, provider, wallet or database access.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../lib/voice-cost-policy.ts'), 'utf8')
assert(!/^import\s/m.test(source))
const api = {}
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: api })
const U = api.VOICE_COST_UNITS_PER_USD_MICRO
const context = { accountId: 'synthetic-test-account', nowMs: 1000 }
const zeroDeductions = () => ({ storeFee: 0n, paymentFee: 0n, tax: 0n, fx: 0n, affiliate: 0n, refunds: 0n, otherVariableCosts: 0n })
const proof = (extra = {}) => ({ kind: 'customer_realized_revenue', accountId: context.accountId, purchaseId: 'synthetic-purchase', settlementEvidenceId: 'synthetic-evidence', paidUsdMicros: 10000000n, creditsIssued: 700n, deductionsUsdMicros: zeroDeductions(), verified: { purchase: true, settlement: true, currencyConversion: true, creditAllocation: true, storeFee: true, paymentFee: true, tax: true, fx: true, affiliate: true, refunds: true, otherVariableCosts: true }, ...extra })
const funded = value => { const decision = api.proveVoiceFunding(value, context); assert.equal(decision.allowed, true, decision.reason); return decision.funding }
const rate = { model: 'gpt-6-luna', serviceTier: 'default', regionalProcessing: false }
const backend = (extra = {}) => api.voiceBackendCostUnits({ ...rate, inputTokens: 5000n, cachedInputTokens: 0n, cacheWriteTokens: 0n, outputTokens: 500n, ...extra })
let groups = 0
function check(label, work) { work(); groups++; console.log('PASS ' + label) }
check('all revenue deductions, discount paid amount and credit allocation determine net; no face-value lookup', () => {
  const funding = funded(proof({ paidUsdMicros: 8000000n, deductionsUsdMicros: { storeFee: 2000000n, paymentFee: 100000n, tax: 400000n, fx: 50000n, affiliate: 1500000n, refunds: 500000n, otherVariableCosts: 250000n } }))
  assert.equal(funding.netUsdMicros, 3200000n); assert.equal(funding.providerBudgetCostUnits, 1600000n * U)
})
check('missing purchase, settlement, currency, fee, tax, refund, affiliate or allocation evidence fails closed', () => {
  const original = proof()
  for (const field of Object.keys(original.verified)) assert.equal(api.proveVoiceFunding({ ...original, verified: { ...original.verified, [field]: false } }, context).allowed, false, field)
  for (const value of [null, {}, { ...original, accountId: 'other' }, { ...original, purchaseId: '' }, { ...original, settlementEvidenceId: '' }, { ...original, paidUsdMicros: 0n }, { ...original, creditsIssued: 0n }, { ...original, paidUsdMicros: 10000000 }, { ...original, deductionsUsdMicros: {} }, { ...original, deductionsUsdMicros: { ...zeroDeductions(), tax: -1n } }]) assert.equal(api.proveVoiceFunding(value, context).allowed, false)
  assert.equal(api.proveVoiceFunding(proof({ deductionsUsdMicros: { ...zeroDeductions(), refunds: 10000000n } }), context).allowed, false)
})
check('subscription, topup, discounted and affiliate funding use their own actual net denominators', () => {
  const subscription = funded(proof({ deductionsUsdMicros: { ...zeroDeductions(), storeFee: 3000000n } }))
  assert.equal(api.voiceProviderBudgetForCredits(subscription, 1n), 5000n * U)
  const topup = funded(proof({ paidUsdMicros: 5000000n, creditsIssued: 250n, deductionsUsdMicros: { ...zeroDeductions(), storeFee: 1500000n } }))
  assert.equal(api.voiceProviderBudgetForCredits(topup, 1n), 7000n * U)
  const affiliate = funded(proof({ deductionsUsdMicros: { ...zeroDeductions(), storeFee: 3000000n, affiliate: 5000000n } }))
  assert.equal(affiliate.netUsdMicros, 2000000n); assert(api.voiceProviderBudgetForCredits(affiliate, 1n) < api.voiceProviderBudgetForCredits(subscription, 1n))
  const discounted = funded(proof({ paidUsdMicros: 5000000n, deductionsUsdMicros: { ...zeroDeductions(), storeFee: 1500000n } }))
  assert.equal(api.voiceProviderBudgetForCredits(discounted, 1n), 2500n * U)
})
check('Live allocation minimum is counted once; cumulative exact units preserve fractional microUSD', () => {
  assert.equal(api.liveVoiceCostUnits({ model: 'gpt-live-1', allocated: false, durationMs: 0n }), 0n)
  assert.equal(api.liveVoiceCostUnits({ model: 'gpt-live-1', allocated: true, durationMs: 1n }), 12500n * U)
  assert.equal(api.liveVoiceCostUnits({ model: 'gpt-live-1', allocated: true, durationMs: 90000n }), 75000n * U)
  const fractional = api.liveVoiceCostUnits({ model: 'gpt-live-1', allocated: false, durationMs: 1n })
  assert.equal(api.voiceCostUnitsToUsdMicrosCeil(fractional), 1n)
  assert.equal(api.voiceCostUnitsToUsdMicrosCeil(fractional * 6n), 5n, 'Sum exact units before rounding')
})
check('actual cached reads/writes replace ordinary input and long context prices the full request', () => {
  assert.equal(backend(), 750n * U)
  const cached = backend({ inputTokens: 1200n, cachedInputTokens: 400n, cacheWriteTokens: 500n, outputTokens: 200n })
  assert.equal(cached, 196500n * U / 1000n)
  assert.equal(api.voiceCostUnitsToUsdMicrosCeil(cached), 197n)
  const at = backend({ inputTokens: 272000n }), above = backend({ inputTokens: 272001n })
  assert.equal(at, (27200n + 250n) * U); assert.equal(above, 547752n * U / 10n)
})
check('bounded backend reservation covers worst-case cache writes/output and verified external costs', () => {
  const reservation = api.reserveVoiceBackendCostUnits({ ...rate, maxInputTokens: 5000n, maxOutputTokens: 10000n, externalCostReserveUsdMicros: 200n, externalCostsVerified: true })
  assert.equal(reservation, 5825n * U)
  for (const cacheWriteTokens of [0n, 2500n, 5000n]) assert(backend({ cacheWriteTokens, outputTokens: 10000n }) <= reservation)
  assert.throws(() => api.reserveVoiceBackendCostUnits({ ...rate, maxInputTokens: 5000n, maxOutputTokens: 10000n, externalCostReserveUsdMicros: 0n, externalCostsVerified: false }))
})
check('missing cache writes use an explicit safe upper bound, with measured split preserved when present', () => {
  const input = { ...rate, inputTokens: 5000n, cachedInputTokens: 1000n, cacheWriteTokens: null, outputTokens: 500n }
  const quote = api.voiceBackendCostQuote(input)
  assert.equal(quote.costBasis, 'conservative_cache_write_bound'); assert.equal(quote.invoiceConfirmed, false)
  for (const written of [0n, 1000n, 4000n]) assert(quote.costUnits >= backend({ cachedInputTokens: 1000n, cacheWriteTokens: written }))
  const measured = api.voiceBackendCostQuote({ ...input, cacheWriteTokens: 0n })
  assert.equal(measured.costBasis, 'reported_usage'); assert.equal(measured.costUnits, backend({ cachedInputTokens: 1000n }))
  assert.throws(() => api.voiceBackendCostQuote({ ...input, cachedInputTokens: 5001n }))
  assert.throws(() => api.voiceBackendCostQuote({ ...input, serviceTier: 'auto' }))
})
check('unsupported models/tiers/regional prices, malformed counters and guessed cache counts are rejected', () => {
  for (const extra of [{ model: 'unknown' }, { serviceTier: 'auto' }, { serviceTier: 'priority' }, { regionalProcessing: true }, { cachedInputTokens: undefined }, { cacheWriteTokens: undefined }, { inputTokens: -1n }, { outputTokens: 1 }, { cachedInputTokens: 5001n }]) assert.throws(() => backend(extra))
  assert.throws(() => api.liveVoiceCostUnits({ model: 'unknown', allocated: true, durationMs: 0n }))
})
check('30s/1min/5min actual-cost illustrations require 6/11/52 credits at verified net floor and 50% margin', () => {
  const funding = funded(proof({ deductionsUsdMicros: { ...zeroDeductions(), storeFee: 3000000n } }))
  for (const [ms, turns, expected] of [[30000n, 1n, 6n], [60000n, 2n, 11n], [300000n, 10n, 52n]]) {
    const cost = api.liveVoiceCostUnits({ model: 'gpt-live-1', allocated: true, durationMs: ms }) + backend() * turns
    const credits = api.voiceCreditsForCumulativeCost(funding, cost); assert.equal(credits, expected)
    assert(api.voiceProviderBudgetForCredits(funding, credits) >= cost)
    assert(api.voiceProviderBudgetForCredits(funding, credits - 1n) < cost)
  }
})
check('round only the cumulative credit charge; repeated settlements have zero delta and cannot invent money', () => {
  const funding = funded(proof({ deductionsUsdMicros: { ...zeroDeductions(), storeFee: 3000000n } }))
  const one = api.voiceCreditsForCumulativeCost(funding, backend())
  assert.equal(one, 1n); assert.equal(api.voiceCreditsForCumulativeCost(funding, backend() * 4n), 1n)
  assert.equal(api.voiceCreditsForCumulativeCost(funding, backend() * 4n) - one, 0n)
  assert.throws(() => api.voiceProviderBudgetForCredits(funding, 701n))
})
check('reservation considers spent plus ALL pending holds and rejects over-budget work before provider call', () => {
  const funding = funded(proof({ deductionsUsdMicros: { ...zeroDeductions(), storeFee: 3000000n } }))
  const request = { funding, coveredCredits: 10n, spentCostUnits: 10000n * U, pendingCostUnits: 35000n * U, requestedCostUnits: 5000n * U }
  assert.equal(api.canReserveVoiceCost(request).allowed, true)
  assert.equal(api.canReserveVoiceCost({ ...request, requestedCostUnits: 5000n * U + 1n }).allowed, false)
  assert.equal(api.canReserveVoiceCost({ ...request, coveredCredits: 0n }).allowed, false)
  assert.equal(api.canReserveVoiceCost({ ...request, spentCostUnits: 51000n * U, requestedCostUnits: 0n }).allowed, false)
})
check('operator tests require explicit confirmed funded budget, account binding and unexpired authority', () => {
  const operator = { kind: 'operator_test_budget', authorizationId: 'synthetic-approval', fundingEvidenceId: 'synthetic-funded-budget', accountId: context.accountId, fundedUsdMicros: 50000n, fundingConfirmed: true, expiresAtMs: 2000 }
  const funding = funded(operator); assert.equal(funding.providerBudgetCostUnits, 50000n * U)
  assert.equal(api.canReserveVoiceCost({ funding, coveredCredits: 0n, spentCostUnits: 0n, pendingCostUnits: 0n, requestedCostUnits: 50000n * U + 1n }).allowed, false)
  assert.throws(() => api.voiceCreditsForCumulativeCost(funding, 1n))
  for (const extra of [{ fundingConfirmed: false }, { accountId: 'other' }, { expiresAtMs: 1000 }, { fundedUsdMicros: 0n }, { fundingEvidenceId: '' }, { authorizationId: '' }]) assert.equal(api.proveVoiceFunding({ ...operator, ...extra }, context).allowed, false)
})
console.log(`PASS ${groups} actual-policy offline groups. No API, credentials, account, wallet or database access.`)
