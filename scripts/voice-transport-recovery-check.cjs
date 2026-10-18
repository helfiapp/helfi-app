#!/usr/bin/env node
'use strict'
// Actual control, native poller, normal host and normal journal adapters.
// Authentication/storage/network boundaries are synthetic; no provider or spend.
const assert = require('node:assert/strict')
const { setup, args, enqueue } = require('./voice-session-control-check.cjs')
const polling = require('./voice-session-jobs-check.cjs')
const plain = value => JSON.parse(JSON.stringify(value))
const lost = () => ({ ok: false, saved: false, safeToClaimSaved: false })
const command = content => ({ type: 'plan', steps: [{ id: 'note', operation: 'journal.health.create', values: { content, localDate: '2026-10-17' } }] })
async function fixture() {
  const app = require('./voice2-app-host-check.cjs').setup(), f = setup(), a = await f.attach()
  const persistence = app.load('native-assistant-session-store').createPrismaAssistantSessionStore(app.db.db)
  const assembly = app.app.createNativeAssistantApp(app.request(app.body()), 'Australia/Melbourne')
  const update = async () => {
    const state = { session: await persistence.readSession('owner', 'app-owned-session'), turns: await persistence.conversation.read('owner', 'app-owned-session'), view: await assembly.host.snapshot({ actorId: 'owner', localDate: '2026-10-17', capabilities: ['general-assistant-v1'] }, 'app-owned-session') }
    f.state(state); return state
  }
  const run = async value => (await app.app.handleNativeAssistantRequest(app.request(app.body({ text: 'Prepare the exact note.', command: value })), app.planner)).json()
  const publish = async (value, callId = 'call-one') => enqueue(f, a.leaseToken, { callId, delegationId: callId, args: args(value), actualHumanText: 'Prepare the exact note.' })
  const deliver = (result = lost(), callId = 'call-one') => f.control.nativeResult({}, 'owner', { sessionId: 'billing-session', callId, result })
  return { app, f, a, update, run, publish, deliver }
}
let groups = 0
async function check(name, work) { await work(); groups++; console.log('PASS ' + name) }
async function main() {
  await check('lost review response reconciles the exact normal owned review without execution or save', async () => {
    const x = await fixture(), value = command('Exact recovery note.')
    await x.publish(value); const prepared = await x.run(value); await x.update()
    const result = await x.deliver(), stored = x.f.row().toolJobs.jobs[0].result
    assert.equal(stored.needsReview, true); assert.equal(stored.saved, false)
    assert.equal(result.recovery.transportRecovery.status, 'verified_owned_result')
    assert.deepEqual(plain(result.recovery.assistantContext), { id: 'app-owned-session', actorId: 'owner', revision: prepared.assistant.revision })
    assert.equal(x.app.counts().postCalls, 0); assert.equal(x.f.calls.settles, 0)
    assert.deepEqual(await x.deliver(), result); assert.equal(x.app.counts().postCalls, 0)
    assert.deepEqual(Object.keys(result.recovery).sort(), ['assistantContext', 'transportRecovery'])
    assert(!JSON.stringify(result).includes('reviewToken'))
  })
  await check('lost confirmation response recovers the real saved receipt exactly once', async () => {
    const x = await fixture(), value = command('One exact saved recovery note.')
    await x.publish(value); const prepared = await x.run(value); await x.update()
    await x.deliver({ assistantContext: prepared.assistant })
    await x.publish({ type: 'confirm', reviewId: prepared.draft.assistantPlan.reviewId }, 'confirm-one')
    await x.app.app.handleNativeAssistantConfirmation(x.app.request(x.app.body()), prepared.draft)
    await x.update(); const response = await x.deliver(lost(), 'confirm-one')
    const result = x.f.row().toolJobs.jobs.find(row => row.callId === 'confirm-one').result
    assert.equal(result.saved, true); assert.equal(result.safeToClaimSaved, true)
    assert.equal(result.transportRecovery.status, 'verified_owned_result')
    assert.equal(x.app.counts().postCalls, 1)
    assert.deepEqual(await x.deliver(lost(), 'confirm-one'), response); assert.equal(x.app.counts().postCalls, 1)
    assert.equal(x.f.calls.settles, 0)
  })
  await check('no-state delivery completes truthfully without falsely claiming nothing was saved', async () => {
    const x = await fixture(); await x.publish(command('No execution.'))
    const first = await x.deliver(), result = x.f.row().toolJobs.jobs[0].result
    assert.equal(result.ok, false); assert.equal(result.saved, false); assert.equal(result.safeToClaimSaved, false)
    assert.match(result.spokenReply, /could not verify the result/); assert.match(result.spokenReply, /normal screen before repeating/)
    assert.match(result.spokenReply, /cannot confirm whether anything was saved/)
    assert.deepEqual(plain(first.recovery), { transportRecovery: { status: 'result_not_verified' } })
    assert.equal(x.f.row().toolJobs.jobs[0].status, 'completed')
    assert.deepEqual(await x.deliver(), first); assert.equal(x.app.counts().postCalls, 0)
  })
  await check('unchanged owned baseline is not mistaken for the new job result', async () => {
    const x = await fixture(); await x.run(command('Earlier review.')); await x.update()
    await x.publish(command('New unreceived review.')); await x.deliver()
    assert.equal(x.f.row().toolJobs.jobs[0].result.transportRecovery.status, 'result_not_verified')
    assert.equal(x.f.row().toolJobs.jobs[0].result.assistantContext, undefined)
    assert.equal(x.app.counts().postCalls, 0)
  })
  await check('cross-account session view and conversation evidence are rejected before recovery', async () => {
    for (const change of [state => { state.session.actorId = 'other' }, state => { state.view.actorId = 'other' }, state => { state.turns = [{ actorId: 'other', sessionId: 'app-owned-session' }] }]) {
      const x = await fixture(), value = command('Owned content.')
      await x.publish(value); await x.run(value); const state = await x.update(); change(state); x.f.state(state)
      await assert.rejects(x.deliver, error => error.code === 'voice_tool_result_not_verified')
      assert.equal(x.f.row().toolJobs.jobs[0].status, 'pending'); assert.equal(x.app.counts().postCalls, 0)
    }
  })
  await check('mutated immutable jobs and unrelated new normal reviews cannot recover another result', async () => {
    for (const changedJob of [false, true]) {
      const x = await fixture(), value = command('Requested content.')
      await x.publish(value); await x.run(command(changedJob ? 'Requested content.' : 'Unrelated content.')); await x.update()
      if (changedJob) { const jobs = x.f.row().toolJobs; jobs.jobs[0].args.assistantCommand.steps[0].values.content = 'Changed immutable job.'; x.f.patch({ toolJobs: jobs }) }
      await assert.rejects(x.deliver, error => error.code === 'voice_tool_result_not_verified')
      assert.equal(x.f.row().toolJobs.jobs[0].status, 'pending'); assert.equal(x.app.counts().postCalls, 0)
    }
  })
  await check('in-flight preparation cannot become a verified finished review', async () => {
    const x = await fixture(), value = command('Still preparing.')
    await x.publish(value); await x.run(value); const state = await x.update()
    for (const collection of [state.session.steps, state.view.steps]) collection.find(row => row.operation === 'journal.health.create').status = 'pending'
    x.f.state(state); const result = await x.deliver()
    assert.equal(result.recovery.transportRecovery.status, 'result_not_verified'); assert.equal(result.recovery.assistantContext, undefined)
    assert.equal(x.app.counts().postCalls, 0)
  })
  await check('normal successful-pointer verification remains strict and no forged failed payload opts in', async () => {
    for (const invalid of [{ assistantContext: { id: 'app-owned-session', actorId: 'owner', revision: 999 } }, { ok: false, saved: true, safeToClaimSaved: false }, { ...lost(), extra: 'untrusted' }]) {
      const x = await fixture(); await x.publish(command('No execution.'))
      await assert.rejects(() => x.deliver(invalid), error => error.code === 'voice_tool_result_not_verified')
      assert.equal(x.f.row().toolJobs.jobs[0].status, 'pending'); assert.equal(x.app.counts().postCalls, 0)
    }
  })
  await check('lost stop recovery requires an actual stopped plan rather than an unrelated revision', async () => {
    for (const actuallyStopped of [true, false, 'status_only']) {
      const x = await fixture(); await x.run(command('Existing review.')); await x.update(); await x.publish({ type: 'stop' })
      if (actuallyStopped === true) { await x.run({ type: 'stop' }); await x.update(); const response = await x.deliver(); assert.equal(response.recovery.transportRecovery.status, 'verified_owned_result') }
      else { const state = await x.update(); state.session.revision++; state.view.revision++; if (actuallyStopped === 'status_only') state.session.status = 'stopped'; x.f.state(state); await assert.rejects(x.deliver, error => error.code === 'voice_tool_result_not_verified') }
      assert.equal(x.app.counts().postCalls, 0)
    }
  })
  await check('advance without an immutable action identity stays unverified after an unrelated revision', async () => {
    const x = await fixture(); await x.run(command('Existing review.')); await x.update(); await x.publish({ type: 'advance' })
    const state = await x.update(); state.session.revision++; state.view.revision++; x.f.state(state)
    const response = await x.deliver()
    assert.equal(response.recovery.transportRecovery.status, 'result_not_verified'); assert.equal(response.recovery.assistantContext, undefined)
    assert.equal(x.app.counts().postCalls, 0)
  })
  await check('a late matching normal result cannot silently rewrite an acknowledged unverified delivery', async () => {
    const x = await fixture(), value = command('A late result.')
    await x.publish(value); const first = await x.deliver(); await x.run(value); await x.update()
    assert.deepEqual(await x.deliver(), first)
    assert.equal(x.f.row().toolJobs.jobs[0].result.transportRecovery.status, 'result_not_verified')
    assert.equal(x.app.counts().postCalls, 0)
  })
  await check('actual native poller accepts no-state recovery and keeps dialogue alive without repeating app effect', async () => {
    const x = await fixture(); await x.publish(command('No received main action.'))
    // The reusable native fixture fixes its synthetic transport ID to
    // owned_session; map that fixture-only ID at the injected HTTP boundary.
    const native = polling.setup({ onJob: async () => lost(), fetch: async call => polling.response(call.method === 'GET' ? { ...await x.f.control.nativeRead('owner', 'billing-session'), sessionId: 'owned_session' } : await x.f.control.nativeResult({}, 'owner', { ...call.json, sessionId: 'billing-session' })) })
    await native.step()
    for (let index = 0; index < 50 && x.f.row().toolJobs.jobs[0].status !== 'completed'; index++) await native.tick()
    assert.equal(native.effects.length, 1); assert.equal(native.calls.filter(call => call.method === 'POST').length, 1)
    assert.equal(native.errors.length, 0); assert.equal(x.f.row().toolJobs.jobs[0].status, 'completed')
    const output = await x.f.worker('poll-tools', { callIds: ['call-one'] }, x.a.leaseToken)
    assert.equal(output.results[0].result.safeToClaimSaved, false); assert.equal(x.app.counts().postCalls, 0)
    native.run.stop()
  })
  console.log(`Voice transport recovery: ${groups} actual-source offline groups passed. No real auth, network, provider, account, database or spend.`)
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { main }
