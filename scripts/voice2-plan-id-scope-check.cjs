#!/usr/bin/env node
'use strict'
// Actual runtime/host/bridge/store plus normal water handlers from existing
// offline fixtures. Only storage/auth/planning are synthetic; no live calls.
const assert = require('node:assert/strict')
const loop = require('./voice2-planning-loop-check.cjs')
const hostFixture = require('./voice2-host-check.cjs')
const clone = value => JSON.parse(JSON.stringify(value))
const context = () => ({ actorId: 'owner', localDate: '2026-10-17', capabilities: [] })
const sid = 'planning_loop_owned'
const plan = steps => ({ type: 'plan', steps })
const read = id => ({ id, operation: 'stored.read', values: {} })
const write = (id, from) => ({ id, operation: 'stored.change', values: { text: { $from: from, path: ['value'] } } })
let groups = 0
async function check(name, run) { await run(); groups++; console.log('PASS ' + name) }
async function main() {
  await check('repeated identical requests may reuse a local read name in one durable conversation', async () => {
    const f = loop.setup((_turn, n) => n % 2 ? loop.readPlan('water') : { done: true })
    const first = await f.run('Read the same saved information.'), prior = clone(first.session.steps[0])
    const second = await f.run('Read the same saved information.')
    assert.equal(f.state.reads, 2); assert.equal(f.turns.length, 4); assert.equal(f.state.writes, 0)
    assert.equal(second.session.steps.length, 2); assert.equal(second.session.steps[0].id, prior.id)
    assert.deepEqual(second.session.steps[0].result, prior.result)
    assert.notEqual(second.session.steps[1].id, prior.id)
    assert.deepEqual(clone(second.session.currentStepIds), [second.session.steps[1].id])
    assert.equal((await f.history()).filter(row => row.role === 'user').length, 2)
  })
  await check('same-name reads in bounded continuation passes receive unique valid server IDs', async () => {
    const name = 'r'.repeat(80), f = loop.setup(() => loop.readPlan(name)), result = await f.run()
    const ids = result.session.steps.map(step => step.id)
    assert.equal(f.state.reads, 6); assert.equal(new Set(ids).size, 6); assert.equal(ids[0], name)
    assert(ids.every(id => /^[A-Za-z0-9_-]{1,80}$/.test(id)))
    assert.match(result.question, /more context/); assert.equal(f.state.writes, 0)
  })
  await check('same owned plan revision produces stable scoped names without mutating planner arguments', async () => {
    const ids = [], command = plan([read('source')]), original = clone(command)
    for (let index = 0; index < 2; index++) {
      const f = loop.setup(() => ({ done: true }))
      await f.host.runtime.handle(context(), sid, command)
      ids.push((await f.host.runtime.handle(context(), sid, command)).currentStepIds[0])
    }
    assert.equal(ids[0], ids[1]); assert.notEqual(ids[0], 'source'); assert.deepEqual(command, original)
  })
  await check('ambiguous local versus retained references refuse before any new read or write', async () => {
    const f = loop.setup(() => ({ done: true }))
    await f.host.runtime.handle(context(), sid, plan([read('source')]))
    const before = await f.raw(), reads = f.state.reads
    await assert.rejects(() => f.host.runtime.handle(context(), sid, plan([read('source'), write('change', 'source')])), error => error.code === 'invalid_reference' && /both an earlier result and a new action/.test(error.message))
    assert.deepEqual(await f.raw(), before); assert.equal(f.state.reads, reads)
    assert.equal(f.state.prepares, 0); assert.equal(f.state.writes, 0)
  })
  await check('duplicate names inside one plan still refuse without storing or executing anything', async () => {
    const f = loop.setup(() => ({ done: true }))
    await assert.rejects(() => f.host.runtime.handle(context(), sid, plan([read('same'), read('same')])), error => error.code === 'invalid_plan')
    assert.equal(await f.raw(), null); assert.equal(f.state.reads, 0); assert.equal(f.state.writes, 0)
  })
  await check('noncolliding local and retained historical references preserve their exact source', async () => {
    const f = loop.setup(() => ({ done: true }))
    await f.host.runtime.handle(context(), sid, plan([read('earlier')]))
    const prepared = await f.host.runtime.handle(context(), sid, plan([read('current'), write('first', 'current'), write('second', 'earlier')]))
    assert.equal(prepared.steps.find(step => step.id === 'first').prepared.data.text, 'Exact stored fact')
    assert.deepEqual(clone(prepared.steps.find(step => step.id === 'first').values.text), { $from: 'current', path: ['value'] })
    assert.deepEqual(clone(prepared.steps.find(step => step.id === 'second').values.text), { $from: 'earlier', path: ['value'] })
    assert.equal(f.state.writes, 0)
    const next = await f.dispatch({ type: 'confirm', reviewId: prepared.steps.find(step => step.id === 'first').reviewId })
    assert.equal(next.session.steps.find(step => step.id === 'second').review.summary, 'Save exact text: Exact stored fact')
    assert.equal(f.state.writes, 1)
  })
  await check('an exact previously returned server ID remains an unambiguous historical reference', async () => {
    const f = loop.setup(() => ({ done: true }))
    await f.host.runtime.handle(context(), sid, plan([read('source')]))
    const second = await f.host.runtime.handle(context(), sid, plan([read('source')]))
    const exact = second.currentStepIds[0]
    assert.notEqual(exact, 'source')
    const third = await f.host.runtime.handle(context(), sid, plan([read('source'), write('change', exact)]))
    assert.equal(third.steps.find(step => step.id === 'change').prepared.data.text, 'Exact stored fact')
    assert.equal(third.steps.find(step => step.id === exact).status, 'completed')
    assert.equal(third.steps.find(step => step.id === 'change').values.text.$from, exact)
    assert.equal(f.state.writes, 0)
  })
  await check('reused write names preserve old normal water receipts and replay identities after restart', async () => {
    const f = hostFixture.setup(), ctx = { actorId: 'synthetic-user', localDate: '2026-10-17', capabilities: [] }, sessionId = 'owned-host-session'
    f.plan([{ id: 'water', operation: 'water.create', values: { amount: 250, unit: 'ml' } }])
    const first = await f.host.run(ctx, sessionId, { channel: 'typed', text: 'Prepare my water.' }), review = first.session.steps[0].review.id
    await f.run({ type: 'confirm', reviewId: review }, 'confirm:' + review)
    const persistence = loop.load('lib/native-assistant-session-store.ts').createPrismaAssistantSessionStore(f.db.db)
    const saved = await persistence.readSession(ctx.actorId, sessionId)
    const restarted = f.make(), rawBefore = await restarted.snapshot(ctx, sessionId)
    const second = await restarted.run(ctx, sessionId, { channel: 'typed', text: 'Prepare my water again.' })
    const newStep = second.session.steps.find(step => step.status === 'review')
    assert(newStep); assert.notEqual(newStep.id, 'water'); assert.equal(f.normal.calls.post, 1)
    assert.deepEqual(second.session.steps[0].result, rawBefore.steps[0].result)
    const prepared = await persistence.readSession(ctx.actorId, sessionId)
    assert.equal(prepared.steps[0].actionId, saved.steps[0].actionId)
    assert.equal(prepared.steps[0].reviewId, saved.steps[0].reviewId)
    assert.deepEqual(prepared.steps[0].result, saved.steps[0].result)
    await restarted.run(ctx, sessionId, { channel: 'typed', text: '', command: { type: 'confirm', reviewId: review }, controlId: 'confirm:' + review })
    assert.equal(f.normal.calls.post, 1)
    await restarted.run(ctx, sessionId, { channel: 'typed', text: '', command: { type: 'confirm', reviewId: newStep.review.id }, controlId: 'confirm:' + newStep.review.id })
    assert.equal(f.normal.calls.post, 2)
    const completed = await persistence.readSession(ctx.actorId, sessionId)
    assert.equal(completed.steps[0].actionId, saved.steps[0].actionId)
    assert.notEqual(completed.steps[1].actionId, saved.steps[0].actionId)
  })
  await check('pending or uncertain plans cannot be replaced by another same-name plan', async () => {
    for (const uncertain of [false, true]) {
      const f = loop.setup(() => ({ command: plan([{ id: 'change', operation: 'stored.change', values: { text: 'Original exact note' } }]) }))
      const first = await f.run(); if (uncertain) { f.state.lost = true; await f.dispatch({ type: 'confirm', reviewId: first.session.steps[0].review.id }) }
      const before = await f.raw()
      await assert.rejects(() => f.host.runtime.handle(context(), sid, plan([read('change')])), error => error.code === 'existing_plan')
      assert.deepEqual(await f.raw(), before); assert.equal(f.state.reads, 0); assert.equal(f.state.writes, uncertain ? 1 : 0)
    }
  })
  await check('a scoped new water step recovers a lost normal response by its own durable action identity only', async () => {
    const f = hostFixture.setup(), ctx = { actorId: 'synthetic-user', localDate: '2026-10-17', capabilities: [] }, sessionId = 'owned-host-session'
    f.plan([{ id: 'water', operation: 'water.create', values: { amount: 250, unit: 'ml' } }])
    const first = await f.host.run(ctx, sessionId, { channel: 'typed', text: 'Prepare first water.' }), originalReview = first.session.steps[0].review.id
    await f.run({ type: 'confirm', reviewId: originalReview }, 'confirm:' + originalReview)
    const next = await f.host.run(ctx, sessionId, { channel: 'typed', text: 'Prepare another water.' }), scoped = next.session.steps.find(step => step.status === 'review')
    assert.notEqual(scoped.id, 'water'); f.normal.lose(true)
    const lost = await f.run({ type: 'confirm', reviewId: scoped.review.id }, 'confirm:' + scoped.review.id)
    const uncertain = lost.session.steps.find(step => step.id === scoped.id)
    assert.equal(uncertain.status, 'uncertain'); assert.equal(f.normal.calls.post, 2)
    const recovered = await f.make().run(ctx, sessionId, { channel: 'typed', text: '', command: { type: 'recover', actionId: uncertain.recoveryActionId }, controlId: 'recover:' + uncertain.recoveryActionId })
    assert.equal(recovered.session.steps.find(step => step.id === scoped.id).status, 'completed')
    assert.equal(recovered.session.steps.find(step => step.id === 'water').result.id, lost.session.steps.find(step => step.id === 'water').result.id)
    assert.equal(f.normal.calls.post, 2); assert.equal(f.normal.calls.get, 1)
  })
  console.log(`VOICE 2 plan ID scope: ${groups} actual-source offline groups passed. No model, account, live database, charge or deployment.`)
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { main }
