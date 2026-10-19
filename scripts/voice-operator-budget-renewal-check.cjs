#!/usr/bin/env node
'use strict'
// Execute the actual startup through the existing secret-free VM fixture.
// Its injected clock is synthetic; no real configuration or I/O loads.
const assert = require('node:assert/strict')
const { setup } = require('./voice-session-start-check.cjs')
const ACCOUNT = 'cmcku4yvq000010l6z4ttp0ib'
const START = Date.parse('2026-10-19T00:30:00Z'), EXPIRY = Date.parse('2026-10-20T00:25:00Z')
const IDS = ['owner-voice-repair-2026-10-19-allowance-1', 'owner-voice-repair-2026-10-19-allowance-2']
const BUDGET = 60000000000n, MINIMUM = 8550000000n
const copy = value => structuredClone(value)
function error(code) { return Object.assign(Error(code), { code }) }
function store() {
  const old = { id: 'historical-expired-lot', userId: ACCOUNT, kind: 'operator_test_budget', sourceId: 'owner-voice-repair-2026-10-18', providerBudgetCostUnits: BUDGET, spentCostUnits: 55097357300n, heldCostUnits: 0n, expiresAt: new Date('2026-10-18T16:10:00Z'), revokedAt: null }
  return { lots: new Map([[old.sourceId, old]]), registrations: [], opens: [], old: copy(old) }
}
function lot(id, overrides = {}) {
  return { id: 'funding-' + id, sourceId: id, userId: ACCOUNT, kind: 'operator_test_budget', providerBudgetCostUnits: BUDGET, spentCostUnits: 0n, heldCostUnits: 0n, expiresAt: new Date(EXPIRY), revokedAt: null, ...overrides }
}
function harness(options = {}, shared = store()) {
  const f = setup({ operator: true, nowMs: START, ...options }), sessions = new Map()
  const originalOpen = f.ledger.openVoiceBillingSession, originalReserve = f.ledger.reserveVoiceSessionCost, originalSettle = f.ledger.settleVoiceSessionCost
  f.ledger.registerVoiceOperatorTestBudget = async proof => {
    shared.registrations.push(copy(proof))
    assert.equal(proof.accountId, ACCOUNT); assert(IDS.includes(proof.authorizationId))
    assert.equal(proof.fundedUsdMicros, 1000000n); assert.equal(proof.expiresAtMs, EXPIRY)
    assert.equal(proof.fundingEvidenceId, 'owner-explicit-usd3-total-voice-verification-2026-10-19T0030Z')
    assert.equal(proof.fundingConfirmed, true)
    assert(proof.expiresAtMs - f.clock < 86400000)
    let row = shared.lots.get(proof.authorizationId)
    if (!row) { row = lot(proof.authorizationId); shared.lots.set(proof.authorizationId, row) }
    return copy(row)
  }
  f.ledger.openVoiceBillingSession = async input => {
    shared.opens.push(copy(input))
    if (options.beforeOpen) options.beforeOpen(shared, input)
    if (!input.operatorFundingId) {
      if (options.refuseCustomer) throw error('voice_source_revenue_unverified')
      return originalOpen(input)
    }
    const funding = [...shared.lots.values()].find(row => row.id === input.operatorFundingId)
    assert(funding && funding.userId === f.userId && funding.expiresAt > new Date(f.clock))
    if (input.expiresAt > funding.expiresAt) throw error('operator_funding_expired')
    const remaining = funding.providerBudgetCostUnits - funding.spentCostUnits - funding.heldCostUnits
    if (remaining <= 0n) throw error('operator_budget_exhausted')
    const result = await originalOpen(input)
    if (result.newlyCreated) {
      const actual = [...f.financial.values()].find(row => row.id === result.id)
      actual.providerBudgetCostUnits = remaining
      result.providerBudgetCostUnits = remaining
      sessions.set(result.id, funding)
    }
    return result
  }
  f.ledger.reserveVoiceSessionCost = async input => {
    const funding = sessions.get(input.sessionId)
    if (funding) {
      if (funding.spentCostUnits + funding.heldCostUnits + input.maxCostUnits > funding.providerBudgetCostUnits) throw error('operator_budget_exhausted')
      funding.heldCostUnits += input.maxCostUnits
    }
    return originalReserve(input)
  }
  f.ledger.settleVoiceSessionCost = async input => {
    const funding = sessions.get(input.sessionId)
    if (funding && input.key !== 'initialization') {
      const hold = [...f.financial.values()].find(row => row.id === input.sessionId).reservations.find(row => row.key === input.key)
      funding.heldCostUnits -= hold.maxCostUnits
      funding.spentCostUnits += input.actualCostUnits
    }
    return originalSettle(input)
  }
  return { ...f, shared }
}
let groups = 0
async function check(name, work) { await work(); groups++; console.log('PASS ' + name) }
async function main() {
  await check('exact current authorization uses the first immutable US$1 lot and preserves the expired record', async () => {
    const f = harness(), response = await f.run(), body = await response.json()
    assert.equal(response.status, 200); assert.equal(body.helfiSession.marginBasis, 'operator_test_budget'); assert.equal(body.helfiSession.reservedCredits, 10)
    assert.equal(f.shared.opens[0].operatorFundingId, lot(IDS[0]).id)
    assert.deepEqual(f.shared.lots.get(f.shared.old.sourceId), f.shared.old)
    assert.equal(f.shared.registrations.length, 2)
  })
  await check('a smaller qualifying first allowance cannot shorten a call while the second dollar is available',async()=>{
    const shared=store(),first=lot(IDS[0],{spentCostUnits:BUDGET-11400000000n});shared.lots.set(IDS[0],first);const before=copy(first),f=harness({},shared),response=await f.run(),body=await response.json();assert.equal(response.status,200);assert.equal(shared.opens[0].operatorFundingId,lot(IDS[1]).id);assert.equal(body.helfiSession.deadlineMs-START,120000);assert.deepEqual(first,before);assert.deepEqual(shared.registrations.map(p=>p.authorizationId),IDS)
  })
  await check('spent plus held selects the second fixed lot without modifying the first', async () => {
    const shared = store(), first = lot(IDS[0], { spentCostUnits: BUDGET - MINIMUM, heldCostUnits: 1n })
    shared.lots.set(IDS[0], first); const before = copy(first)
    const f = harness({}, shared); assert.equal((await f.run()).status, 200)
    assert.equal(shared.opens[0].operatorFundingId, lot(IDS[1]).id); assert.deepEqual(first, before)
    assert.deepEqual(shared.registrations.map(proof => proof.authorizationId), IDS)
  })
  await check('the exact minimum covers 15 seconds, fixed service, backend and shutdown reserves', async () => {
    const shared = store(); shared.lots.set(IDS[0], lot(IDS[0], { spentCostUnits: BUDGET - MINIMUM })); shared.lots.set(IDS[1], lot(IDS[1], { heldCostUnits: BUDGET }))
    const f = harness({}, shared), response = await f.run(), body = await response.json(); assert.equal(response.status, 200)
    assert.equal(body.helfiSession.deadlineMs - START, 15000)
    assert.equal(f.calls.reserves.find(row => row.key === 'voice-infrastructure').maxCostUnits, 3000000000n)
    assert.equal(f.calls.reserves.find(row => row.key === 'voice-duration').maxCostUnits, 3750000000n)
    assert.equal(MINIMUM - 3000000000n - 3750000000n, 1800000000n)
  })
  await check('both insufficient lots refuse before allocation and never fall back to customer funding', async () => {
    const shared = store()
    shared.lots.set(IDS[0], lot(IDS[0], { heldCostUnits: BUDGET - MINIMUM + 1n }))
    shared.lots.set(IDS[1], lot(IDS[1], { spentCostUnits: BUDGET - MINIMUM + 1n }))
    const before = copy([...shared.lots])
    const f = harness({}, shared), response = await f.run(); assert.equal(response.status, 402)
    assert.equal((await response.json()).code, 'voice_budget_unavailable')
    assert.equal(shared.opens.length, 0); assert.equal(f.calls.posts.length, 0); assert.equal(f.calls.watchdogs, 0)
    assert.deepEqual([...shared.lots], before)
  })
  await check('repeat starts keep authorization IDs stable and cannot register more than two new dollars', async () => {
    const shared = store()
    for (let i = 0; i < 10; i++) { const f = harness({}, shared); assert.equal((await f.run('synthetic-repeat-' + i)).status, 200) }
    const exhausted = harness({}, shared); assert.equal((await exhausted.run('synthetic-after-exhaustion')).status, 402)
    assert.equal(exhausted.calls.posts.length, 0); assert.equal(exhausted.shared.opens.length, 10)
    const added = [...shared.lots.values()].filter(row => IDS.includes(row.sourceId))
    assert(added.length <= 2); assert.equal(new Set(shared.registrations.map(proof => proof.authorizationId)).size, 2)
    assert.equal(added.reduce((sum, row) => sum + row.providerBudgetCostUnits, 0n), 2n * BUDGET)
    assert(55097357300n + 2n * BUDGET < 3n * BUDGET)
    for (const row of added) assert(row.spentCostUnits + row.heldCostUnits <= row.providerBudgetCostUnits)
    assert.deepEqual(shared.lots.get(shared.old.sourceId), shared.old)
  })
  await check('wrong account, expiry, revoked or altered returned lots cannot fund a paid call', async () => {
    for (const override of [{ userId: 'another-account' }, { expiresAt: new Date(EXPIRY + 1) }, { revokedAt: new Date(START) }, { providerBudgetCostUnits: BUDGET + 1n }]) {
      const shared = store(); for (const id of IDS) shared.lots.set(id, lot(id, override))
      const f = harness({}, shared); assert.equal((await f.run()).status, 402); assert.equal(f.calls.posts.length, 0); assert.equal(shared.opens.length, 0)
    }
  })
  await check('customer behavior and authorization time boundaries receive no operator grant', async () => {
    for (const options of [{ operator: false, nowMs: START }, { nowMs: START - 1 }, { nowMs: EXPIRY }, { nowMs: EXPIRY + 1 }]) {
      const f = harness({ ...options, refuseCustomer: true }); assert.equal((await f.run()).status, 402)
      assert.equal(f.shared.registrations.length, 0); assert.equal(f.calls.posts.length, 0); assert.equal(f.shared.opens[0].operatorFundingId, undefined)
    }
    const f = harness({ operator: false }); const body = await (await f.run()).json()
    assert.equal(body.helfiSession.marginBasis, '50_percent_realized_net'); assert.equal(body.helfiSession.reservedCredits, 100); assert.equal(f.shared.registrations.length, 0)
  })
  await check('a concurrent hold won after selection is still enforced before any provider allocation', async () => {
    const f = harness({ beforeOpen(shared, input) { [...shared.lots.values()].find(row => row.id === input.operatorFundingId).heldCostUnits = BUDGET } })
    assert.equal((await f.run()).status, 402); assert.equal(f.calls.posts.length, 0); assert.equal(f.calls.watchdogs, 0)
    assert(f.shared.opens.every(row => row.operatorFundingId)); assert.equal(f.shared.registrations.length, 2)
  })
  console.log(`Voice operator renewal: ${groups} actual-startup offline groups passed; no provider, credentials, database or cloud access.`)
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
