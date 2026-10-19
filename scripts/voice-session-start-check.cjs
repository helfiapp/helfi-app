#!/usr/bin/env node
'use strict'
// Execute the actual allocator with synthetic storage, funding, queues,
// sockets and fetch. Never load app config, credentials, a provider or DB.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), crypto = require('node:crypto')
const source = fs.readFileSync(path.join(__dirname, '../lib/voice-session-start.ts'), 'utf8')
const costSource = fs.readFileSync(path.join(__dirname, '../lib/voice-cost-policy.ts'), 'utf8')
const closedCollateral = require('./voice-closed-collateral-check.cjs')
const U = 60000n, INFRA = 3000000000n
const clone = value => structuredClone(value)
function setup(options = {}) {
  let clock = options.nowMs ?? Date.parse('2026-10-17T18:00:00Z'), financialSequence = 0, queue = Promise.resolve(), ready = false
  class FixtureDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])) } static now() { return clock } }
  const calls = { events: [], posts: [], closes: [], settlements: [], finalizations: [], reserves: [], funding: 0, claims: 0, dispatches: 0, watchdogs: 0, logs: [], responses: [] }
  const runtime = new Map(), financial = new Map(), controller = new AbortController(), timers = new Set()
  const userId = options.operator ? 'cmcku4yvq000010l6z4ttp0ib' : 'synthetic-customer'
  const request = { headers: new Headers({ 'x-helfi-voice-attempt-id': 'synthetic-attempt-one' }), signal: controller.signal }
  const cost = {}, costContext = { exports: cost }
  vm.runInNewContext(ts.transpileModule(costSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, costContext)
  const findRuntime = sessionId => runtime.get(sessionId) || null
  const byId = sessionId => [...financial.values()].find(row => row.id === sessionId)
  const apply = (row, patch) => { for (const [key, value] of Object.entries(patch)) row[key] = clone(value); return clone(row) }
  const db = { voiceSessionRuntime: {
    async findUnique({ where }) { const row = findRuntime(where.sessionId); return row ? clone(row) : null },
    async findMany({ where }) { return [...runtime.values()].filter(row => row.userId === where.userId && (!where.state?.in || where.state.in.includes(row.state))).map(clone) },
    async create({ data }) { calls.events.push('runtime-create'); if (options.runtimeCreateFails) throw Error('Synthetic runtime storage failure'); assert(!runtime.has(data.sessionId)); runtime.set(data.sessionId, clone(data)); return clone(data) },
    async update({ where, data }) { const row = findRuntime(where.sessionId); assert(row); calls.events.push(data.configuration?.allocationIntent?.state === 'posted' ? 'intent-posted' : 'runtime-update'); return apply(row, data) },
    async updateMany({ where, data }) { const row = findRuntime(where.sessionId); if (row) apply(row, data); return { count: row ? 1 : 0 } },
  }, voiceBillingSession: {
    async findFirst({ where, include }) { assert.equal(where.userId, userId); assert.equal(include.reservations, true); assert.equal(include.allocations, true); const row = byId(where.id); return row?.userId === userId ? clone(row) : null },
  }, voiceFundingLot: {
    async findMany({ where }) { assert.equal(where.userId, userId); return (options.priorFundingLots || []).filter(row => row.userId === userId && where.id.in.includes(row.id)).map(clone) },
  }, $executeRaw: async (_parts, account) => { assert.equal(account, userId); calls.events.push('account-lock'); return 1 },
  async $transaction(work) { const prior = queue; let release; queue = new Promise(resolve => { release = resolve }); await prior; try { return await work(db) } finally { release() } } }
  const ledger = {
    async registerVoiceOperatorTestBudget(proof) { calls.funding++; assert.equal(proof.fundedUsdMicros, 1000000n); assert.equal(proof.accountId, userId); return { id: 'operator-funded-task', userId, kind: 'operator_test_budget', expiresAt: new FixtureDate(proof.expiresAtMs), providerBudgetCostUnits: 60000000000n, spentCostUnits: 0n, heldCostUnits: 0n, revokedAt: null } },
    async openVoiceBillingSession(input) {
      calls.claims++; calls.events.push('financial-claim')
      if (options.fundingRefused) throw Object.assign(Error('Synthetic unverified proceeds'), { code: 'voice_source_revenue_unverified' })
      let row = financial.get(input.billingRunId)
      if (row) return { ...clone(row), newlyCreated: false }
      row = { id: 'financial-' + ++financialSequence, mode: input.operatorFundingId ? 'operator_test_budget' : 'customer_realized_revenue', state: 'OPEN', reservedCredits: input.reserveCredits,
        providerBudgetCostUnits: options.budgetUnits || 60000000000n, reservations: [{ key: input.initialReservationKey, kind: 'initialization', maxCostUnits: input.initialReserveCostUnits, state: 'PENDING' }] }
      financial.set(input.billingRunId, row); return { ...clone(row), newlyCreated: true }
    },
    async reserveVoiceSessionCost(input) { calls.reserves.push(clone(input)); calls.events.push('reserve-' + input.key); const row = byId(input.sessionId); assert(row); row.reservations.push({ key: input.key, kind: input.kind, maxCostUnits: input.maxCostUnits, state: 'PENDING' }); return clone(row.reservations.at(-1)) },
    async settleVoiceSessionCost(input) { calls.settlements.push(clone(input)); const row = byId(input.sessionId), hold = row.reservations.find(value => value.key === input.key); assert(hold); assert.equal(hold.state, 'PENDING', 'Allocator must not settle the same hold twice'); Object.assign(hold, { state: 'SETTLED', actualCostUnits: input.actualCostUnits }); return clone(hold) },
    async bindVoiceProviderConnection(input) { calls.events.push('bind-provider'); assert.equal(input.providerSessionId, 'provider-synthetic'); return {} },
    async getVoiceBillingSession(_user, sessionId) { return clone(byId(sessionId)) },
    async closeVoiceBillingSession(input) { calls.finalizations.push(clone(input)); const row = byId(input.sessionId); row.state = input.finalUsageConfirmed && row.reservations.every(hold => hold.state === 'SETTLED') ? 'CLOSED' : 'UNCERTAIN'; return clone(row) },
  }
  class FixtureSocket {
    constructor(url) { this.listeners = {}; this.provider = decodeURIComponent(url.split('/').at(-2)); calls.events.push('cleanup-attach'); queueMicrotask(() => this.emit('open')) }
    on(name, listener) { (this.listeners[name] ||= []).push(listener); return this }
    emit(name, value) { for (const listener of this.listeners[name] || []) listener(value) }
    send(raw) { assert.equal(JSON.parse(raw).type, 'session.close'); calls.closes.push(this.provider); queueMicrotask(() => options.closeUnconfirmed ? this.emit('close') : this.emit('message', JSON.stringify({ type: 'session.closed', session: { id: options.foreignClose ? 'another-provider' : this.provider }, usage: { seconds: 20 } }))); if (options.foreignClose) queueMicrotask(() => this.emit('close')) }
    close() { this.emit('close') }
  }
  const modules = {
    'node:crypto': { __esModule: true, default: crypto }, ws: { __esModule: true, default: FixtureSocket },
    'next/server': { NextResponse: { json(body, init) { calls.responses.push({ body: clone(body), status: init?.status || 200 }); if ((init?.status || 200) === 200) assert(ready, 'SDP handoff must wait for the healthy monitor'); return Response.json(body, init) } } },
    '@/lib/prisma': { prisma: db }, '@/lib/credit-system': { CreditManager: class { async getWalletStatus() { calls.events.push('wallet'); if (options.abortAfterWallet) controller.abort(); return { totalAvailableCents: options.wallet ?? 100 } } } },
    '@/lib/ai-safety': { assertAiUsageAllowed: async () => { calls.events.push('consent'); if (options.consentRefused) throw Error('Synthetic consent refusal') } },
    '@/lib/voice-session-ledger': ledger, '@/lib/voice-cost-policy': cost,
    '@/lib/voice-closed-collateral': closedCollateral.load('voice-closed-collateral'),
    '@/lib/voice-session-control': { signVoiceSessionControlToken: () => 'synthetic-scoped-worker-control' },
    '@/lib/voice-session-worker-dispatch': {
      async sendVoiceWatchdog() { calls.watchdogs++; calls.events.push('watchdog'); if (options.abortAfterQueue) controller.abort(); if (options.queueFails && calls.watchdogs === 1) throw Error('Synthetic queue failure'); return 'synthetic-queue-receipt' },
      async dispatchVoiceSessionWorker(job) { calls.dispatches++; calls.events.push('dispatch'); const row = findRuntime(job.sessionId); if (options.workerBackendHold) byId(job.sessionId).reservations.push({ key: 'worker-backend', kind: 'backend', maxCostUnits: 10000000n, state: 'PENDING' }); if (options.dispatchAmbiguous) throw Error('Synthetic dispatch accepted but response lost'); if (options.cancelDuringDispatch) controller.abort(); if (!options.monitorNeverReady) { ready = true; row.state = 'ready'; row.lastHeartbeatAt = new FixtureDate(clock - (options.staleHeartbeat ? 10001 : 0)) } },
    },
    '@/lib/native-assistant-command-tool': { nativeAssistantCommandInstructions: () => 'SYNTHETIC_PRIVATE_INSTRUCTIONS', nativeAssistantCommandTool: () => ({ type: 'function', name: 'request_helfi_action', parameters: { type: 'object' } }) },
  }
  const api = {}
  const context = { exports: api, require(name) { if (!(name in modules)) throw Error('Unexpected import ' + name); return modules[name] },
    Date: FixtureDate, Buffer, AbortController, console: { error: (...values) => calls.logs.push(values), info: (...values) => calls.logs.push(values) },
    process: { env: { OPENAI_API_KEY: 'synthetic-non-secret-offline-placeholder' } },
    setTimeout(callback, ms) { const timer = { callback, ms }; timers.add(timer); if (ms === 150) queueMicrotask(() => { if (timers.has(timer)) { clock += ms; callback() } }); return timer }, clearTimeout(timer) { timers.delete(timer) },
    async fetch(url, init) {
      calls.events.push('provider-post'); calls.posts.push({ url, init: clone({ method: init.method, headers: init.headers, body: JSON.parse(init.body) }) })
      assert(calls.watchdogs >= 1, 'A durable watchdog must be queued before provider allocation')
      const row = [...runtime.values()].at(-1)
      assert.equal(row.configuration.allocationIntent.state, 'posted', 'Durable intent precedes provider POST')
      assert.equal(row.configuration.allocationIntent.clientRequestId, init.headers['X-Client-Request-Id'])
      if (options.providerAmbiguous) throw Error('Synthetic provider response lost')
      return { ok: !options.providerRejected, async json() { return { session: { id: 'provider-synthetic', providerSecret: 'SYNTHETIC_PRIVATE_PROVIDER_METADATA' }, transport: { type: 'webrtc', sdp: options.missingSdp ? '' : 'synthetic-answer-sdp', secret: 'SYNTHETIC_PRIVATE_TRANSPORT' }, secret: 'SYNTHETIC_PRIVATE_ROOT' } } }
    },
  }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, context)
  const run = async (attempt = 'synthetic-attempt-one') => { request.headers.set('x-helfi-voice-attempt-id', attempt); return api.startMeteredLiveVoiceSession({ request, userId, sdp: 'synthetic-offer-sdp', general: { sessionId: 'synthetic-app-session', localDate: '2026-10-18', timeZone: 'Australia/Melbourne' }, frontend: { model: options.model || 'gpt-live-1', store: false, instructions: 'Synthetic voice instructions', delegation: { type: 'responses', responses: { model: 'MUST_BE_OVERRIDDEN' } } } }) }
  return { run, calls, financial, runtime, controller, request, userId, ledger, get clock() { return clock } }
}
const OPERATOR_IDS=['owner-voice-repair-2026-10-19-allowance-1','owner-voice-repair-2026-10-19-allowance-2']
const OPERATOR_START=Date.parse('2026-10-19T00:30:00Z'),OPERATOR_EXPIRY=Date.parse('2026-10-20T00:25:00Z'),OPERATOR_DOLLAR=60000000000n,OPERATOR_MINIMUM=8550000000n
function operatorSelection(overrides=[{},{}]){
 const f=setup({operator:true,nowMs:OPERATOR_START}),proofs=[],opens=[]
 const lots=OPERATOR_IDS.map((sourceId,index)=>({id:'synthetic-funded-'+index,sourceId,userId:f.userId,kind:'operator_test_budget',providerBudgetCostUnits:OPERATOR_DOLLAR,spentCostUnits:0n,heldCostUnits:0n,expiresAt:new Date(OPERATOR_EXPIRY),revokedAt:null,...overrides[index]}))
 f.ledger.registerVoiceOperatorTestBudget=async proof=>{proofs.push(clone(proof));assert(OPERATOR_IDS.includes(proof.authorizationId));assert.equal(proof.accountId,f.userId);assert.equal(proof.fundedUsdMicros,1000000n);assert.equal(proof.expiresAtMs,OPERATOR_EXPIRY);assert.equal(proof.fundingEvidenceId,'owner-explicit-usd3-total-voice-verification-2026-10-19T0030Z');return clone(lots[OPERATOR_IDS.indexOf(proof.authorizationId)])}
 const original=f.ledger.openVoiceBillingSession
 f.ledger.openVoiceBillingSession=async input=>{opens.push(clone(input));assert(input.operatorFundingId,'Operator authorization cannot fall back to customer funds');const lot=lots.find(l=>l.id===input.operatorFundingId),remaining=lot.providerBudgetCostUnits-lot.spentCostUnits-lot.heldCostUnits;assert(remaining>=OPERATOR_MINIMUM);const result=await original(input);result.providerBudgetCostUnits=remaining;return result}
 return{...f,lots,proofs,opens}
}
let groups = 0
async function check(label, work) { await work(); groups++; console.log('PASS ' + label) }
async function main() {
  await check('unverified funding, missing credits, consent and unsupported model refuse before provider work', async () => {
    for (const options of [{ fundingRefused: true }, { wallet: 9 }, { consentRefused: true }, { model: 'unpriced-live-model' }]) {
      const f = setup(options), response = await f.run(); assert(response.status >= 400); assert.equal(f.calls.posts.length, 0); assert.equal(f.calls.dispatches, 0)
    }
    const f = setup({ fundingRefused: true }), response = await f.run(); assert.equal(response.status, 402); assert.equal((await response.json()).code, 'voice_funding_unverified')
  })
  await check('queue and durable correlation precede POST; only healthy monitor can receive whitelisted SDP', async () => {
    const f = setup(), response = await f.run(), body = await response.json(); assert.equal(response.status, 200)
    assert(f.calls.events.indexOf('watchdog') < f.calls.events.indexOf('provider-post')); assert(f.calls.events.indexOf('intent-posted') < f.calls.events.indexOf('provider-post'))
    assert.equal(f.calls.posts[0].init.body.session.delegation.type, 'client'); assert.deepEqual(f.calls.posts[0].init.body.session.client.data_channel.allowed_client_events, ['session.close', 'session.instructions.append'])
    assert.deepEqual(body.transport, { type: 'webrtc', sdp: 'synthetic-answer-sdp' }); assert.deepEqual(body.session, { id: 'provider-synthetic' })
    assert(!JSON.stringify(body).includes('SYNTHETIC_PRIVATE')); assert(!JSON.stringify(body).includes('synthetic-scoped-worker-control')); assert(!JSON.stringify(body).includes('offline-placeholder'))
    assert.equal(body.helfiSession.marginBasis, '50_percent_realized_net'); assert.equal(f.calls.finalizations.length, 0)
  })
  await check('operator test expense is labeled separately from customer realized-net margin', async () => {
    const f = setup({ operator: true, nowMs: Date.parse('2026-10-19T00:30:00Z') }), body = await (await f.run()).json(); assert.equal(f.calls.funding, 2); assert.equal(body.helfiSession.marginBasis, 'operator_test_budget'); assert.equal(body.helfiSession.reservedCredits, 10)
  })
  await check('operator selects larger verified allowance instead of an earlier qualifying nineteen-cent remainder',async()=>{
    const f=operatorSelection([{spentCostUnits:48600000000n},{}]),before=clone(f.lots),response=await f.run(),body=await response.json();assert.equal(response.status,200);assert.equal(f.opens[0].operatorFundingId,f.lots[1].id);assert.equal(body.helfiSession.deadlineMs-OPERATOR_START,120000);assert.deepEqual(f.lots,before);assert.deepEqual(f.proofs.map(p=>p.authorizationId),OPERATOR_IDS);assert.equal(f.proofs.reduce((n,p)=>n+p.fundedUsdMicros,0n),2000000n)
  })
  await check('operator ranking subtracts spent and concurrent holds while equal balances retain stable fixed order',async()=>{
    for(const balances of [[{spentCostUnits:10000000000n,heldCostUnits:30000000000n},{spentCostUnits:30000000000n}],[{spentCostUnits:20000000000n,heldCostUnits:10000000000n},{spentCostUnits:10000000000n,heldCostUnits:20000000000n}]]){const f=operatorSelection(balances);assert.equal((await f.run()).status,200);assert.equal(f.opens[0].operatorFundingId,f.lots[balances[0].heldCostUnits===30000000000n?1:0].id);assert.deepEqual(f.proofs.map(p=>p.authorizationId),OPERATOR_IDS)}
  })
  await check('operator ignores invalid bigger lots and preserves exact minimum funding and expiry rules',async()=>{
    for(const invalid of [{expiresAt:new Date(OPERATOR_EXPIRY-1)},{expiresAt:new Date(OPERATOR_EXPIRY+1)},{revokedAt:new Date(OPERATOR_START)},{userId:'another-account'},{providerBudgetCostUnits:OPERATOR_DOLLAR+1n}]){const f=operatorSelection([{spentCostUnits:OPERATOR_DOLLAR-OPERATOR_MINIMUM},invalid]),response=await f.run(),body=await response.json();assert.equal(response.status,200);assert.equal(f.opens[0].operatorFundingId,f.lots[0].id);assert.equal(body.helfiSession.deadlineMs-OPERATOR_START,15000);assert.equal(f.calls.reserves.find(h=>h.key==='voice-duration').maxCostUnits,3750000000n)}
  })
  await check('both operator allowances below minimum refuse before provider work with no extra authority',async()=>{
    const f=operatorSelection([{spentCostUnits:OPERATOR_DOLLAR-OPERATOR_MINIMUM+1n},{heldCostUnits:OPERATOR_DOLLAR-OPERATOR_MINIMUM+1n}]),before=clone(f.lots);assert.equal((await f.run()).status,402);assert.equal(f.opens.length,0);assert.equal(f.calls.posts.length,0);assert.equal(f.calls.watchdogs,0);assert.deepEqual(f.lots,before);assert.deepEqual(f.proofs.map(p=>p.authorizationId),OPERATOR_IDS);assert.equal(f.proofs.reduce((n,p)=>n+p.fundedUsdMicros,0n),2000000n)
  })
  await check('duplicate HTTP attempt never allocates or cleans up the original active call', async () => {
    const f = setup(); assert.equal((await f.run()).status, 200)
    const before = { posts: f.calls.posts.length, closes: f.calls.closes.length, settlements: f.calls.settlements.length, finalizations: f.calls.finalizations.length }
    const duplicate = await f.run(); assert.equal(duplicate.status, 409)
    assert.deepEqual({ posts: f.calls.posts.length, closes: f.calls.closes.length, settlements: f.calls.settlements.length, finalizations: f.calls.finalizations.length }, before)
  })
  await check('parallel identical attempts hand off at most one provider connection', async () => {
    const f = setup(), results = await Promise.all([f.run(), f.run()]); assert.equal(results.filter(value => value.status === 200).length, 1); assert.equal(results.filter(value => value.status === 409).length, 1)
    assert.equal(f.calls.posts.length, 1); assert.equal(f.calls.closes.length, 0); assert.equal(f.calls.finalizations.length, 0)
  })
  await check('failed startup before provider still books its fixed service allocation without an AWS invoice claim', async () => {
    for (const options of [{ queueFails: true }, { runtimeCreateFails: true }]) {
      const f = setup(options), result = await f.run(); assert.equal(result.status, 503); assert.equal(f.calls.posts.length, 0)
      assert.equal(f.calls.settlements.find(value => value.key === 'voice-infrastructure').actualCostUnits, INFRA)
      assert.equal(f.calls.settlements.find(value => value.key === 'voice-duration').actualCostUnits, 0n)
      assert.equal(f.calls.finalizations.at(-1).finalUsageConfirmed, true)
      assert(!JSON.stringify(f.calls.logs).includes('invoice')); assert(!JSON.stringify(f.calls.logs).includes('SYNTHETIC_PRIVATE'))
    }
  })
  await check('cancellation before funding never allocates; cancellation after queue settles only known own costs', async () => {
    const early = setup({ abortAfterWallet: true }); assert.equal((await early.run()).status, 503); assert.equal(early.calls.claims, 0); assert.equal(early.calls.posts.length, 0)
    const queued = setup({ abortAfterQueue: true }); assert.equal((await queued.run()).status, 503); assert.equal(queued.calls.posts.length, 0)
    assert.equal(queued.calls.settlements.find(value => value.key === 'voice-infrastructure').actualCostUnits, INFRA); assert.equal(queued.calls.finalizations.at(-1).finalUsageConfirmed, true)
  })
  await check('ambiguous provider allocation retains voice allowance, books overhead and refuses a fresh attempt', async () => {
    const f = setup({ providerAmbiguous: true }); assert.equal((await f.run()).status, 503)
    const row = [...f.financial.values()][0]; assert.equal(row.state, 'UNCERTAIN'); assert.equal(row.reservations.find(value => value.key === 'voice-duration').state, 'PENDING')
    assert.equal(f.calls.settlements.find(value => value.key === 'voice-infrastructure').actualCostUnits, INFRA)
    const stored = [...f.runtime.values()][0]; assert.equal(stored.state, 'uncertain'); assert.equal(stored.configuration.allocationIntent.state, 'posted')
    assert.equal((await f.run('another-synthetic-attempt')).status, 409); assert.equal(f.calls.posts.length, 1); assert.equal(f.calls.claims, 1)
  })
  await check('new allocation accepts proved closed voice with complete retained collateral, without settling or refunding old work', async () => {
    for (const mode of ['operator_test_budget', 'customer_realized_revenue']) {
      const prior = closedCollateral.fixture(mode), userId = mode === 'operator_test_budget' ? 'cmcku4yvq000010l6z4ttp0ib' : 'synthetic-customer'
      prior.actorId = prior.runtime.userId = prior.financial.userId = userId
      for (const lot of prior.fundingLots) lot.userId = userId
      const f = setup({ operator: mode === 'operator_test_budget', nowMs: Date.parse('2026-10-19T00:30:00Z'), priorFundingLots: prior.fundingLots })
      f.runtime.set(prior.runtime.sessionId, clone(prior.runtime)); f.financial.set('previous-billing-run', clone(prior.financial))
      const before = clone(f.financial.get('previous-billing-run')), runtimeBefore = clone(f.runtime.get(prior.runtime.sessionId))
      assert.equal((await f.run()).status, 200); assert.equal(f.calls.posts.length, 1)
      assert.deepEqual(f.financial.get('previous-billing-run'), before); assert.deepEqual(f.runtime.get(prior.runtime.sessionId), runtimeBefore)
      assert(f.calls.settlements.every(row => row.sessionId !== prior.financial.id)); assert(f.calls.finalizations.every(row => row.sessionId !== prior.financial.id))
    }
  })
  await check('startup still refuses unknown voice, lost collateral, revoked funding and pending executable work before any new claim', async () => {
    for (const mutate of [p => { p.runtime.toolJobs.completion.finalUsageConfirmed = false }, p => { p.financial.reservations[1].state = 'PENDING' }, p => { p.financial.heldCostUnits = 0n }, p => { p.fundingLots[0].revokedAt = new Date() }, p => { p.runtime.toolJobs.jobs[0].status = 'pending' }, p => { p.runtime.providerSessionId = null }]) {
      const prior = closedCollateral.fixture(), userId = 'synthetic-customer'
      prior.actorId = prior.runtime.userId = prior.financial.userId = userId
      for (const lot of prior.fundingLots) lot.userId = userId
      mutate(prior)
      const f = setup({ priorFundingLots: prior.fundingLots })
      f.runtime.set(prior.runtime.sessionId, clone(prior.runtime)); f.financial.set('previous-billing-run', clone(prior.financial))
      assert.equal((await f.run()).status, 409); assert.equal(f.calls.posts.length, 0); assert.equal(f.calls.claims, 0); assert.equal(f.calls.settlements.length, 0)
    }
  })
  await check('an existing provider ID never permits overlapping allocating attaching ready or closing calls', async () => {
    for (const state of ['allocating', 'attaching', 'ready', 'closing']) {
      const f = setup()
      f.runtime.set('previous-runtime', { sessionId: 'previous-runtime', userId: f.userId, providerSessionId: 'known-but-not-proved-closed', state })
      assert.equal((await f.run()).status, 409); assert.equal(f.calls.posts.length, 0); assert.equal(f.calls.claims, 0); assert.equal(f.calls.settlements.length, 0)
    }
  })
  await check('known rejected allocation closes the exact provider and settles reported duration plus service', async () => {
    const f = setup({ providerRejected: true }); assert.equal((await f.run()).status, 503)
    assert.deepEqual(f.calls.closes, ['provider-synthetic']); assert.equal(f.calls.settlements.find(value => value.key === 'voice-duration').actualCostUnits, 1000000000n)
    assert.equal(f.calls.settlements.find(value => value.key === 'voice-infrastructure').actualCostUnits, INFRA); assert.equal([...f.financial.values()][0].state, 'CLOSED')
  })
  await check('unconfirmed or foreign close receipt cannot release voice usage as zero', async () => {
    for (const options of [{ providerRejected: true, closeUnconfirmed: true }, { providerRejected: true, foreignClose: true }]) {
      const f = setup(options); await f.run(); assert.equal(f.calls.settlements.filter(value => value.key === 'voice-duration').length, 0)
      assert.equal(f.calls.finalizations.at(-1).finalUsageConfirmed, false); assert.equal([...f.runtime.values()][0].state, 'uncertain')
    }
  })
  await check('worker dispatch ambiguity and cancellation never race a second financial settlement', async () => {
    for (const options of [{ dispatchAmbiguous: true, workerBackendHold: true }, { cancelDuringDispatch: true, workerBackendHold: true }, { monitorNeverReady: true }, { staleHeartbeat: true }]) {
      const f = setup(options); assert.equal((await f.run()).status, 503); assert.equal(f.calls.dispatches, 1)
      assert.equal(f.calls.settlements.filter(value => value.key !== 'initialization').length, 0); assert.equal(f.calls.finalizations.length, 0); assert.equal(f.calls.closes.length, 1)
      assert.equal(f.calls.responses.filter(value => value.status === 200).length, 0)
    }
  })
  console.log(`Voice startup: ${groups} actual-source offline groups passed. All I/O synthetic; no provider, credentials, wallet, queue or database access.`)
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { setup, main }
