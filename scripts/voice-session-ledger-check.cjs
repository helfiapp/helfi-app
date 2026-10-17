#!/usr/bin/env node
'use strict'
// Actual ledger + CreditManager + policy with transactional synthetic storage.
// No real database, app environment, credentials, network or provider access.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), crypto = require('node:crypto')
let data, sequence = 0, queue = Promise.resolve(), locks = 0
const tables = ['user', 'creditTopUp', 'voiceFundingLot', 'voiceBillingSession', 'voiceSessionAllocation', 'voiceCostReservation']
const clone = value => structuredClone(value)
const equal = (a, b) => a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b
function matches(row, where = {}) {
  return Object.entries(where).every(([field, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('gt' in value) return row[field] > value.gt
      if ('gte' in value) return row[field] >= value.gte
      if (field === 'sessionId_key' || field === 'userId_billingRunId') return matches(row, value)
    }
    return equal(row[field], value)
  })
}
const defaults = model => model === 'voiceFundingLot' ? { committedCredits: 0, creditsIssued: 0, netUsdMicros: 0n, spentCostUnits: 0n, heldCostUnits: 0n, revokedAt: null }
  : model === 'voiceBillingSession' ? { state: 'OPEN', chargedCredits: 0, refundedCredits: 0, forfeitedCredits: 0, spentCostUnits: 0n, heldCostUnits: 0n, finalUsageConfirmed: false, marginBps: 5000 }
    : model === 'voiceCostReservation' ? { state: 'PENDING', observedCostUnits: 0n, actualCostUnits: null, providerSessionId: null }
      : model === 'voiceSessionAllocation' ? { chargedCredits: 0, refundedCredits: 0, forfeitedCredits: 0 } : {}
const db = {}
for (const model of tables) db[model] = {
  async findUnique({ where }) { return clone(data[model].find(row => matches(row, where)) || null) },
  async findMany({ where = {}, orderBy } = {}) { const rows = data[model].filter(row => matches(row, where)); if (orderBy) { const [field, order] = Object.entries(orderBy)[0]; rows.sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * (order === 'asc' ? 1 : -1)) } return clone(rows) },
  async create({ data: input }) {
    if (model === 'voiceFundingLot' && data[model].some(row => row.sourceKey === input.sourceKey || (input.revenueEvidenceKey && row.revenueEvidenceKey === input.revenueEvidenceKey))) throw new Error('synthetic unique violation')
    const row = { id: `${model}-${String(++sequence).padStart(5, '0')}`, ...defaults(model), createdAt: new Date(), ...clone(input) }; data[model].push(row); return clone(row)
  },
  async update({ where, data: patch }) {
    const row = data[model].find(row => matches(row, where)); if (!row) throw new Error(`missing ${model}`)
    for (const [field, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !(value instanceof Date) && ('increment' in value || 'decrement' in value)) row[field] += 'increment' in value ? value.increment : -value.decrement
      else row[field] = clone(value)
    }
    return clone(row)
  },
}
db.$executeRaw = async (_parts, account) => { assert.equal(typeof account, 'string'); locks++; return 1 }
db.$transaction = async work => {
  const before = queue; let release; queue = new Promise(resolve => { release = resolve }); await before
  const snapshot = clone(data)
  try { return await work(db) } catch (error) { data = snapshot; throw error } finally { release() }
}
const modules = {}
function load(relative) {
  if (modules[relative]) return modules[relative]
  const exports = {}; modules[relative] = exports
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
  const requireStub = name => name === 'node:crypto' ? crypto : name === '@/lib/prisma' ? { prisma: db }
    : name.startsWith('@/lib/') ? load(name.replace('@/', '') + '.ts') : (() => { throw new Error(`Unexpected import ${name}`) })()
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: requireStub, Date, process: { env: {} }, console }, { filename: relative })
  return exports
}
const ledger = load('lib/voice-session-ledger.ts'), { CreditManager } = load('lib/credit-system.ts'), U = 60000n
const now = () => new Date(), future = ms => new Date(Date.now() + ms), account = 'synthetic-owner'
function reset({ monthlyRemaining = 0, additional = 100, topup = 0 } = {}) {
  data = Object.fromEntries(tables.map(table => [table, []])); locks = 0
  const current = now(), cycle = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1))
  data.user.push({ id: account, additionalCredits: additional, walletMonthlyUsedCents: 700 - monthlyRemaining, walletMonthlyResetAt: cycle,
    subscription: monthlyRemaining ? { id: 'subscription-1', plan: 'PREMIUM', monthlyPriceCents: 1000, startDate: cycle, endDate: future(86400000 * 60) } : null })
  if (topup) data.creditTopUp.push({ id: 'topup-1', userId: account, amountCents: topup, usedCents: 0, expiresAt: future(86400000) })
}
const proof = (extra = {}) => ({ kind: 'customer_realized_revenue', accountId: account, purchaseId: 'synthetic-purchase', settlementEvidenceId: 'synthetic-settlement', paidUsdMicros: 10000000n, creditsIssued: 100n,
  deductionsUsdMicros: { storeFee: 3000000n, paymentFee: 0n, tax: 0n, fx: 0n, affiliate: 0n, refunds: 0n, otherVariableCosts: 0n },
  verified: { purchase: true, settlement: true, currencyConversion: true, creditAllocation: true, storeFee: true, paymentFee: true, tax: true, fx: true, affiliate: true, refunds: true, otherVariableCosts: true }, ...extra })
const operator = () => ledger.registerVoiceOperatorTestBudget({ kind: 'operator_test_budget', accountId: account, authorizationId: 'one-approved-task', fundingEvidenceId: 'one-explicit-project-expense', fundedUsdMicros: 1000000n, fundingConfirmed: true, expiresAtMs: Date.now() + 3600000 })
const open = (run, funding, cost = 10000n * U, reserve = 10) => ledger.openVoiceBillingSession({ userId: account, billingRunId: run, reserveCredits: reserve, operatorFundingId: funding?.id, initialReservationKey: 'initial', initialReserveCostUnits: cost, expiresAt: future(600000) })
const receipt = (session, cost, reservationKey = 'initial') => ({ userId: account, sessionId: session.id, key: reservationKey, actualCostUnits: cost, receiptDigest: crypto.createHash('sha256').update(`${reservationKey}:${cost}`).digest('hex') })
let groups = 0
async function check(label, work) { reset(); await work(); groups++; console.log('PASS ' + label) }
async function main() {
  await check('unknown customer funding rolls back actual wallet debit, session and allocations', async () => {
    const before = clone(data.user)
    await assert.rejects(open('unknown', null), /voice_source_revenue_unverified/)
    assert.deepEqual(data.user, before); assert.equal(data.voiceBillingSession.length, 0); assert.equal(data.voiceSessionAllocation.length, 0)
  })
  await check('shared $1 operator budget serializes concurrent attempts and never replenishes on reuse', async () => {
    const funding = await operator()
    const attempts = await Promise.allSettled([open('a', funding, 600000n * U), open('b', funding, 600000n * U)])
    assert.equal(attempts.filter(value => value.status === 'fulfilled').length, 1); assert.equal(data.user[0].additionalCredits, 90)
    const session = attempts.find(value => value.status === 'fulfilled').value
    await ledger.settleVoiceSessionCost(receipt(session, 250000n * U)); await ledger.closeVoiceBillingSession({ userId: account, sessionId: session.id, finalUsageConfirmed: true })
    const last = await open('last', funding, 750000n * U)
    await ledger.settleVoiceSessionCost(receipt(last, 750000n * U)); await ledger.closeVoiceBillingSession({ userId: account, sessionId: last.id, finalUsageConfirmed: true })
    await assert.rejects(open('exhausted', funding, 1n), /operator_budget_exhausted/)
    const reused = await operator(); assert.equal(reused.spentCostUnits, 1000000n * U); assert.equal(reused.expiresAt.getTime(), funding.expiresAt.getTime())
  })
  await check('precharged voice credits cannot also be spent by the ordinary AI wallet path', async () => {
    reset({ additional: 10 }); const funding = await operator(), session = await open('reserved', funding)
    assert.equal(await new CreditManager(account).chargeCents(1), false)
    await ledger.settleVoiceSessionCost(receipt(session, 0n)); await ledger.closeVoiceBillingSession({ userId: account, sessionId: session.id, finalUsageConfirmed: true })
    assert.equal(data.user[0].additionalCredits, 10); assert.equal(locks > 0, true)
  })
  await check('a delayed old-month status reset cannot erase a concurrent voice reservation', async () => {
    reset({ monthlyRemaining: 1, additional: 0 })
    data.user[0].walletMonthlyResetAt = new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth() - 1, 1))
    const original = db.user.findUnique
    let enteredResolve, releaseResolve, first = true
    const entered = new Promise(resolve => { enteredResolve = resolve }), release = new Promise(resolve => { releaseResolve = resolve })
    db.user.findUnique = async args => {
      const value = await original(args)
      if (first) { first = false; enteredResolve(); await release }
      return value
    }
    try {
      const status = new CreditManager(account).getWalletStatus()
      await entered
      const reservation = db.$transaction(tx => new CreditManager(account).reserveVoiceCreditsInTransaction(10, tx))
      await new Promise(resolve => setTimeout(resolve, 5))
      releaseResolve(); await status; assert(await reservation)
      assert.equal(data.user[0].walletMonthlyUsedCents, 10)
      assert.equal((await new CreditManager(account).getWalletStatus()).monthlyRemainingCents, 690)
    } finally { db.user.findUnique = original; releaseResolve() }
  })
  await check('actual CreditManager receipts/refunds preserve monthly, additional and exact top-up source', async () => {
    reset({ monthlyRemaining: 5, additional: 3, topup: 10 }); const manager = new CreditManager(account)
    const allocations = await db.$transaction(tx => manager.reserveVoiceCreditsInTransaction(12, tx))
    assert.deepEqual(Array.from(allocations, value => [value.bucket, value.credits]), [['monthly', 5], ['additional', 3], ['topup', 4]])
    assert.equal(data.user[0].walletMonthlyUsedCents, 700); assert.equal(data.user[0].additionalCredits, 0); assert.equal(data.creditTopUp[0].usedCents, 4)
    await db.$transaction(tx => manager.refundVoiceCreditsInTransaction(allocations, tx))
    assert.equal(data.user[0].walletMonthlyUsedCents, 695); assert.equal(data.user[0].additionalCredits, 3); assert.equal(data.creditTopUp[0].usedCents, 0)
  })
  await check('monthly reset and expired top-up never turn a refund into additional or renewed funds', async () => {
    reset({ monthlyRemaining: 5, additional: 3, topup: 10 }); const manager = new CreditManager(account)
    const allocations = await db.$transaction(tx => manager.reserveVoiceCreditsInTransaction(12, tx))
    data.user[0].walletMonthlyResetAt = future(1); data.user[0].walletMonthlyUsedCents = 0
    data.creditTopUp[0].expiresAt = new Date(Date.now() - 1)
    const refund = await db.$transaction(tx => manager.refundVoiceCreditsInTransaction(allocations, tx))
    assert.equal(refund.forfeitedCredits, 5); assert.equal(data.user[0].additionalCredits, 3); assert.equal(data.user[0].walletMonthlyUsedCents, 0)
    assert.equal(data.creditTopUp[0].usedCents, 0); assert(data.creditTopUp[0].expiresAt < now()); assert.equal((await manager.getWalletStatus()).topUps.length, 0)
  })
  await check('verified customer funding settles cumulative cost once and refunds original top-up only', async () => {
    reset({ additional: 0, topup: 100 })
    await ledger.registerVoiceCustomerFundingLot({ proof: proof(), source: { bucket: 'topup', sourceId: 'topup-1', cycleStartedAt: null }, expiresAt: future(3600000) })
    const session = await open('customer', null, 100000n * U)
    await ledger.settleVoiceSessionCost(receipt(session, 40000n * U))
    const result = await ledger.closeVoiceBillingSession({ userId: account, sessionId: session.id, finalUsageConfirmed: true })
    assert.equal(result.chargedCredits, 2); assert.equal(result.refundedCredits, 8); assert.equal(data.creditTopUp[0].usedCents, 2); assert.equal(data.user[0].additionalCredits, 0)
    const again = await ledger.closeVoiceBillingSession({ userId: account, sessionId: session.id, finalUsageConfirmed: true }); assert.equal(again.refundedCredits, 8); assert.equal(data.creditTopUp[0].usedCents, 2)
    assert.equal(data.voiceFundingLot[0].committedCredits, 2)
  })
  await check('mixed sources use the lowest actual net unit value even when that lot is smaller than the total reserve', async () => {
    reset({ monthlyRemaining: 2, additional: 0, topup: 2 })
    await ledger.registerVoiceCustomerFundingLot({ proof: proof({ purchaseId: 'monthly-proof', settlementEvidenceId: 'monthly-settlement', creditsIssued: 700n }), source: { bucket: 'monthly', sourceId: 'subscription-1', cycleStartedAt: data.user[0].walletMonthlyResetAt.toISOString() }, expiresAt: future(3600000) })
    await ledger.registerVoiceCustomerFundingLot({ proof: proof({ purchaseId: 'discounted-topup', settlementEvidenceId: 'topup-settlement', paidUsdMicros: 10000n, creditsIssued: 2n, deductionsUsdMicros: { ...proof().deductionsUsdMicros, storeFee: 3000n } }), source: { bucket: 'topup', sourceId: 'topup-1', cycleStartedAt: null }, expiresAt: future(3600000) })
    const session = await open('mixed-source', null, 6000n * U, 4)
    assert.equal(session.rateNetUsdMicros, 7000n); assert.equal(session.rateCredits, 2); assert.equal(session.providerBudgetCostUnits, 7000n * U)
    await ledger.settleVoiceSessionCost(receipt(session, 5000n * U))
    const closed = await ledger.closeVoiceBillingSession({ userId: account, sessionId: session.id, finalUsageConfirmed: true })
    assert.equal(closed.chargedCredits, 3); assert.equal(closed.refundedCredits, 1)
    assert.equal(data.user[0].walletMonthlyUsedCents, 700); assert.equal(data.creditTopUp[0].usedCents, 1)
  })
  await check('partial observations retain remaining holds; missing final usage prevents all refunds', async () => {
    const funding = await operator(), session = await open('partial', funding, 100000n * U)
    await ledger.checkpointVoiceSessionCost(receipt(session, 20000n * U)); await ledger.checkpointVoiceSessionCost(receipt(session, 20000n * U))
    assert.equal(data.voiceFundingLot[0].spentCostUnits, 20000n * U); assert.equal(data.voiceFundingLot[0].heldCostUnits, 80000n * U)
    const result = await ledger.closeVoiceBillingSession({ userId: account, sessionId: session.id, finalUsageConfirmed: false })
    assert.equal(result.state, 'UNCERTAIN'); assert.equal(data.user[0].additionalCredits, 90); assert.equal(data.voiceFundingLot[0].heldCostUnits, 80000n * U)
    await ledger.settleVoiceSessionCost(receipt(session, 30000n * U)); const resolved = await ledger.closeVoiceBillingSession({ userId: account, sessionId: session.id, finalUsageConfirmed: true })
    assert.equal(resolved.state, 'CLOSED'); assert.equal(data.voiceFundingLot[0].heldCostUnits, 0n); assert.equal(data.voiceFundingLot[0].spentCostUnits, 30000n * U)
  })
  await check('repeated reservation/settlement keys are idempotent and changed receipts fail atomically', async () => {
    const funding = await operator(), session = await open('same', funding)
    const replay = await open('same', funding); assert.equal(replay.id, session.id); assert.equal(session.newlyCreated, true); assert.equal(replay.newlyCreated, false); assert.equal(data.user[0].additionalCredits, 90)
    await assert.rejects(ledger.reserveVoiceSessionCost({ userId: account, sessionId: session.id, key: 'initial', kind: 'initialization', maxCostUnits: 999n }), /voice_reservation_conflict/)
    const input = receipt(session, 100n); await ledger.settleVoiceSessionCost(input); await ledger.settleVoiceSessionCost(input)
    assert.equal(data.voiceFundingLot[0].spentCostUnits, 100n)
    await assert.rejects(ledger.settleVoiceSessionCost({ ...input, actualCostUnits: 101n }), /voice_receipt_conflict/)
    assert.equal(data.voiceFundingLot[0].spentCostUnits, 100n)
    await assert.rejects(ledger.bindVoiceProviderConnection({ userId: 'another-user', sessionId: session.id, key: 'initial', providerSessionId: 'provider-id' }), /voice_session_not_found/)
  })
  await check('parallel identical HTTP attempts have exactly one cleanup owner and one wallet precharge', async () => {
    const funding = await operator()
    const results = await Promise.all([open('parallel-same-attempt', funding), open('parallel-same-attempt', funding)])
    assert.equal(results.filter(value => value.newlyCreated).length, 1)
    assert.equal(results.filter(value => !value.newlyCreated).length, 1)
    assert.equal(results[0].id, results[1].id); assert.equal(data.user[0].additionalCredits, 90)
    assert.equal(data.voiceCostReservation.length, 1); assert.equal(data.voiceFundingLot[0].heldCostUnits, 10000n * U)
  })
  await check('customer unused expired credits release commitment without resurrecting spendable money', async () => {
    reset({ additional: 0, topup: 100 })
    const lot = await ledger.registerVoiceCustomerFundingLot({ proof: proof(), source: { bucket: 'topup', sourceId: 'topup-1', cycleStartedAt: null }, expiresAt: future(3600000) })
    const session = await open('customer-expiry', null, 100000n * U)
    data.creditTopUp[0].expiresAt = new Date(Date.now() - 1); data.voiceFundingLot[0].expiresAt = new Date(Date.now() - 1)
    await ledger.settleVoiceSessionCost(receipt(session, 40000n * U)); await ledger.closeVoiceBillingSession({ userId: account, sessionId: session.id, finalUsageConfirmed: true })
    assert.equal(data.creditTopUp[0].usedCents, 2); assert.equal(data.voiceFundingLot[0].committedCredits, 2)
    assert.equal((await new CreditManager(account).getWalletStatus()).totalAvailableCents, 0)
    await assert.rejects(open('customer-expired-retry', null), /insufficient_credits/)
    assert.equal(data.voiceFundingLot[0].id, lot.id)
  })
  await check('old monthly customer reservation cannot refund into or fund a new wallet cycle', async () => {
    reset({ monthlyRemaining: 10, additional: 0 })
    await ledger.registerVoiceCustomerFundingLot({ proof: proof({ creditsIssued: 700n }), source: { bucket: 'monthly', sourceId: 'subscription-1', cycleStartedAt: data.user[0].walletMonthlyResetAt.toISOString() }, expiresAt: future(3600000) })
    const session = await open('old-month', null)
    data.user[0].walletMonthlyResetAt = future(1); data.user[0].walletMonthlyUsedCents = 0; data.voiceFundingLot[0].expiresAt = new Date(Date.now() - 1)
    await ledger.settleVoiceSessionCost(receipt(session, 0n))
    const closed = await ledger.closeVoiceBillingSession({ userId: account, sessionId: session.id, finalUsageConfirmed: true })
    assert.equal(closed.forfeitedCredits, 10); assert.equal(closed.refundedCredits, 0)
    assert.equal(data.user[0].walletMonthlyUsedCents, 0); assert.equal(data.user[0].additionalCredits, 0); assert.equal(data.voiceFundingLot[0].committedCredits, 0)
    await assert.rejects(open('new-month-with-old-proof', null), /voice_source_revenue_unverified/)
    assert.equal(data.user[0].walletMonthlyUsedCents, 0)
  })
  await check('revoked or expired funding cannot authorize more paid work', async () => {
    const funding = await operator(), session = await open('revoked', funding)
    await ledger.revokeVoiceFundingLot({ userId: account, fundingLotId: funding.id })
    await assert.rejects(ledger.reserveVoiceSessionCost({ userId: account, sessionId: session.id, key: 'new', kind: 'backend', maxCostUnits: 1n }), /voice_session_not_active/)
    await assert.rejects(open('new-after-revocation', funding), /operator_funding_unavailable/)
  })
  await check('provider overrun is recorded truthfully and stops further calls rather than hiding expense', async () => {
    const funding = await operator(), session = await open('overrun', funding, 100n)
    const hold = await ledger.settleVoiceSessionCost(receipt(session, 101n)); assert.equal(hold.state, 'UNCERTAIN'); assert.equal(data.voiceFundingLot[0].spentCostUnits, 101n)
    await assert.rejects(ledger.reserveVoiceSessionCost({ userId: account, sessionId: session.id, key: 'again', kind: 'backend', maxCostUnits: 1n }), /voice_session_not_active/)
    assert.equal((await ledger.closeVoiceBillingSession({ userId: account, sessionId: session.id, finalUsageConfirmed: true })).state, 'UNCERTAIN')
  })
  console.log(`PASS ${groups} actual ledger/wallet transactional offline groups. No real database/provider/account access.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
