#!/usr/bin/env node
'use strict'
// Synthetic planner proves structured typed/realtime wiring + retained context.
// It does not test a real model's understanding of any spoken/text request.
const assert = require('node:assert/strict'), fixture = require('./voice2-domain-adapters-check.cjs'), general = require('./voice2-general-assistant-check.cjs')
const { createAssistantToolBridge, assistantActionTools } = general.load('native-assistant-tool-bridge')
const { checkInventory, inventory } = require('./check-voice2-operation-coverage.cjs')
const clone = value => JSON.parse(JSON.stringify(value)), sessionId = 'offline-general-plan'
let groups = 0
async function check(name, run) { await run(); groups++; console.log('PASS ' + name) }
function setup(planner, extra = {}) {
  const f = general.setup(), turns = [], calls = { planner: 0, session: 0 }
  const bridge = createAssistantToolBridge({ runtime: f.runtime, readSession: async () => { calls.session++; return f.state() }, authorizePlanning: async ctx => { if (await fixture.services.authenticatedActor(ctx) !== ctx.actorId) throw Error('Synthetic access denied') }, authorizeCommand: async (_ctx, command, evidence) => { if (command.type === 'confirm' && evidence.text !== 'Yes, save that.') throw Error('Synthetic explicit confirmation policy refused') }, plannerKind: 'synthetic', conversation: { read: async () => clone(turns), append: async (actorId, id, turn) => { turns.push({ actorId, sessionId: id, ...turn }) } }, planner: async turn => { calls.planner++; return planner(turn) }, ...extra })
  return { ...f, bridge, turns, calls }
}
async function run() {
  await check('both channels share one action schema with strict fields and genuine required details', async () => {
    const f = setup(async () => ({ question: 'Synthetic question' })), tools = assistantActionTools(f.runtime, f.ctx())
    assert.equal(tools.length, 5); assert(tools.every(tool => tool.inputSchema.additionalProperties === false)); assert.deepEqual(tools.find(tool => tool.name === 'journal.health.create').inputSchema.required, ['content'])
    for (const tool of tools) assert(!Object.keys(tool.inputSchema.properties).some(key => ['ownerId', 'endpoint', 'url', 'method'].includes(key)))
  })
  await check('synthetic planner retains initial clarification across turns and forwards structured correction/confirmation unchanged', async () => {
    let turnNumber = 0
    const literal = 'Literal dinner note.\n“Do not change this.”', corrected = 'Corrected literal dinner note.'
    const f = setup(async turn => {
      assert.equal(turn.actions.length, 5); turnNumber++
      if (turnNumber === 1) { assert.equal(turn.channel, 'typed'); assert.equal(turn.session, null); return { question: 'What exact note should I save?' } }
      assert(turn.history.some(row => row.text === 'Please help me save a dinner note.'))
      assert(turn.history.some(row => row.text === 'What exact note should I save?'))
      if (turnNumber === 2) return { command: { type: 'plan', steps: [{ id: 'note', operation: 'journal.health.create', values: { content: literal } }] } }
      assert.equal(turn.session.steps[0].prepared, undefined); assert.equal(turn.session.steps[0].reviewDigest, undefined); assert.equal(turn.session.steps[0].actionId, undefined)
      if (turnNumber === 3) { assert(turn.session.steps[0].review.summary.endsWith(literal)); return { command: { type: 'correct', stepId: 'note', values: { content: corrected } } } }
      assert(turn.session.steps[0].review.summary.endsWith(corrected))
      return { command: { type: 'confirm', reviewId: turn.session.steps[0].review.id } }
    })
    const first = await f.bridge.turn(f.ctx(), sessionId, { channel: 'typed', text: 'Please help me save a dinner note.' }); assert.equal(first.question, 'What exact note should I save?')
    let result = await f.bridge.turn(f.ctx(), sessionId, { channel: 'realtime', text: literal }); assert.equal(result.session.steps[0].status, 'review'); assert.equal(fixture.entries().length, 0)
    result = await f.bridge.turn(f.ctx(), sessionId, { channel: 'typed', text: corrected }); assert.equal(result.session.steps[0].status, 'review'); assert.equal(fixture.entries().length, 0)
    result = await f.bridge.turn(f.ctx(), sessionId, { channel: 'realtime', text: 'Yes, save that.' }); assert.equal(result.session.status, 'completed'); assert.equal(fixture.entries().length, 1); assert.equal(fixture.entries()[0].content, corrected)
  })
  await check('provider planner cannot start without separate spending approval', async () => {
    const f = setup(async () => { throw Error('Must never start') }, { plannerKind: 'provider' })
    await assert.rejects(() => f.bridge.turn(f.ctx(), sessionId, { channel: 'typed', text: 'Test' }), /spending approval/); assert.equal(f.calls.planner, 0); assert.equal(f.calls.session, 0); assert.equal(f.turns.length, 0)
  })
  await check('revoked access or foreign stored history refuse before planning or mutations', async () => {
    const f = setup(async () => { throw Error('Must never start') }); fixture.setActor('other')
    await assert.rejects(() => f.bridge.turn(f.ctx(), sessionId, { channel: 'typed', text: 'Test' })); assert.equal(f.calls.planner, 0); assert.equal(f.calls.session, 0)
    fixture.setActor('owner'); f.turns.push({ actorId: 'other', sessionId, role: 'user', text: 'Foreign text' })
    await assert.rejects(() => f.bridge.turn(f.ctx(), sessionId, { channel: 'typed', text: 'Test' })); assert.equal(f.calls.planner, 0); assert.equal(fixture.entries().length, 0)
  })
  await check('model-generated arbitrary operation and request account fields never become app calls', async () => {
    const f = setup(async () => ({ command: { type: 'plan', steps: [{ id: 'bad', operation: 'arbitrary.endpoint', values: {} }] } }))
    await assert.rejects(() => f.bridge.turn(f.ctx(), sessionId, { channel: 'typed', text: 'Test' }), error => error.code === 'unknown_operation'); assert.equal(fixture.entries().length, 0)
    await assert.rejects(() => f.bridge.turn(f.ctx(), sessionId, { channel: 'typed', text: 'Test', actorId: 'other' })); assert.equal(f.calls.planner, 1)
  })
  await check('a planner tool call cannot confirm an unrelated human turn or bypass normal decision policy', async () => {
    const f = setup(async turn => ({ command: { type: 'confirm', reviewId: turn.session.steps[0].review.id } }))
    await f.handle({ type: 'plan', steps: [{ id: 'note', operation: 'journal.health.create', values: { content: 'Requires explicit permission.' } }] })
    await assert.rejects(() => f.bridge.turn(f.ctx(), sessionId, { channel: 'typed', text: 'How many calories did I have?' }), /confirmation policy refused/)
    assert.equal(fixture.entries().length, 0); assert.equal(f.state().steps[0].status, 'review')
  })
  await check('coverage checks source changes and route additions while distinguishing proof from production', async () => {
    const result = checkInventory(); assert.equal(result.offlineRegisteredOperations, 5); assert.equal(result.productionGeneralAssistantOperations, 0); assert.equal(result.releaseCoverageGaps, 321)
    const routeChange = clone(inventory); routeChange.routeInventory.stack.push('NewManualArea'); assert.throws(() => checkInventory(routeChange), /routes changed/)
    const first = inventory.sourceFiles[0]; assert.throws(() => checkInventory(inventory, { sourceOverrides: { [first.path]: 'synthetic changed source' } }), /reconcile operation coverage/)
    const newOperation = clone(inventory); newOperation.operations.push({ ...newOperation.operations[0], id: 'synthetic.new_manual_operation' }); newOperation.counts.total++; newOperation.counts.domain++
    assert.equal(checkInventory(newOperation).releaseCoverageGaps, 322, 'A newly declared manual operation must remain a release gap until registered')
  })
  console.log(`VOICE 2 tool bridge/coverage: ${groups} offline groups passed. Planner understanding and installed transport remain untested; no providers or credits.`)
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { run }
