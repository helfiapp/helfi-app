#!/usr/bin/env node
'use strict'
// Actual receipt/host/runtime/normal save code; synthetic assessment, identity,
// storage, clock and signing secret. This does not test model classification.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), crypto = require('node:crypto')
const storage = require('./voice2-session-store-check.cjs'), normalFixture = require('./voice2-normal-actions-check.cjs')
const SECRET = 'synthetic-decision-receipt-secret-only', START = Date.now(), modules = new Map()
let clock = START
class FixtureDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])) } static now() { return clock } }
function load(name) {
  if (modules.has(name)) return modules.get(name)
  assert(['native-assistant-decision', 'native-assistant-registry', 'native-assistant-runtime', 'native-assistant-host', 'native-assistant-tool-bridge', 'native-assistant-session-store', 'native-assistant-readable', 'native-assistant-completions', 'generalAssistantEffects'].includes(name))
  const file = name === 'generalAssistantEffects' ? '../native/src/voice/generalAssistantEffects.ts' : '../lib/' + name + '.ts'
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('exports', 'require', 'process', 'Date', code)(exports, id => {
    if (id === 'crypto') return crypto
    if (id === '../native/src/voice/generalAssistantEffects') return load('generalAssistantEffects')
    if (id.startsWith('./native-assistant-')) return load(id.slice(2))
    throw Error('Forbidden dependency ' + id)
  }, { env: { NEXTAUTH_SECRET: SECRET } }, FixtureDate)
  modules.set(name, exports); return exports
}
const receipt = load('native-assistant-decision'), hostApi = load('native-assistant-host')
const clean = decision => ({ decision, directHuman: true, completeTurn: true, quoted: false, historical: false, injected: false, ambiguous: false, conditional: false, correcting: false, mixed: false })
const base = text => ({ actorId: 'synthetic-user', sessionId: 'owned-decision-session', reviewId: 'owned-review', revision: 4, text, decision: 'confirm', turnId: 'fresh-human-turn', assessmentReceiptId: 'settled-assessment-receipt' })
const issue = binding => receipt.issueAssistantDecisionReceipt(binding, clean(binding.decision))
const plain = value => JSON.parse(JSON.stringify(value))
function setup(twoWrites = false) {
  const db = storage.database(), normal = normalFixture.setup()
  const { createAssistantRegistry } = load('native-assistant-registry'), { createPrismaAssistantSessionStore } = load('native-assistant-session-store')
  const operation = { id: 'water.create', description: 'Normal reviewed water save', kind: 'write', input: { type: 'object', properties: { amount: { type: 'number', minimum: 1, maximum: 1000 }, unit: { type: 'string', enum: ['ml'], maxLength: 2 } }, required: ['amount', 'unit'] }, normalHandler: 'actual normal confirmation saveWater',
    prepare: (context, values) => normal.creations.prepare(context, 'water.create', values), execute: (context, prepared, evidence) => normal.creations.execute(context, prepared.data, evidence), verify: (context, result, prepared) => normal.creations.verify(context, result, prepared.data), plannerResult: result => ({ message: result.message, id: result.id, saved: result.saved }) }
  const persistence = createPrismaAssistantSessionStore(db.db), originalRead = persistence.readSession
  let readCount = 0, onRead
  persistence.readSession = async (...args) => { if (onRead) await onRead(++readCount); return originalRead(...args) }
  const host = hostApi.createNativeAssistantHost({ registry: createAssistantRegistry([operation]), persistence, authenticate: async () => 'synthetic-user', plannerKind: 'synthetic', planner: async () => { throw Error('Decision dispatch must never invoke a planner') } })
  const context = { actorId: 'synthetic-user', localDate: '2026-10-19', capabilities: [] }, sessionId = 'owned-decision-session'
  const run = (input, hostState) => host.run(context, sessionId, { channel: 'realtime', text: '', ...input }, hostState)
  const prepare = () => run({ text: 'Prepare water for review.', command: { type: 'plan', steps: Array.from({ length: twoWrites ? 2 : 1 }, (_, i) => ({ id: 'water-' + i, operation: 'water.create', values: { amount: 250, unit: 'ml' } })) } })
  const decision = async (text, type = 'confirm') => {
    const state = await persistence.readSession(context.actorId, sessionId), review = state.steps.find(step => step.status === 'review')
    return { actorId: context.actorId, sessionId, reviewId: review.reviewId, revision: state.revision, text, decision: type, turnId: 'new-owned-human-turn', assessmentReceiptId: 'verified-settled-assessment' }
  }
  return { host, persistence, normal, context, sessionId, run, prepare, decision, onRead: work => { readCount = 0; onRead = work } }
}
let groups = 0
async function check(name, work) { clock = START; await work(); groups++; console.log('PASS ' + name) }
async function main() {
  await check('signed receipt permits arbitrary direct language with exact scope and no raw text inside', () => {
    for (const text of ['Yes save this note.', 'Please commit the reviewed change exactly as shown.', 'Oui, veuillez enregistrer cette modification.', 'この内容を保存してください。']) {
      const binding = base(text), token = issue(binding), verified = receipt.verifyAssistantDecisionReceipt(token, binding)
      assert.equal(verified.turnId, binding.turnId); assert.equal(verified.assessmentReceiptId, binding.assessmentReceiptId)
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
      assert.equal(payload.textDigest, crypto.createHash('sha256').update(text).digest('hex')); assert(!Object.hasOwn(payload, 'text')); assert(!JSON.stringify(payload).includes(text))
    }
  })
  await check('issuer refuses incomplete, quoted, historical, injected, ambiguous, conditional, corrected and mixed assessments', () => {
    for (const key of ['quoted', 'historical', 'injected', 'ambiguous', 'conditional', 'correcting', 'mixed']) assert.throws(() => receipt.issueAssistantDecisionReceipt(base('Untrusted contextual words'), { ...clean('confirm'), [key]: true }))
    for (const key of ['directHuman', 'completeTurn']) assert.throws(() => receipt.issueAssistantDecisionReceipt(base('Untrusted contextual words'), { ...clean('confirm'), [key]: false }))
    for (const key of Object.keys(clean('confirm'))) { const missing = clean('confirm'); delete missing[key]; assert.throws(() => receipt.issueAssistantDecisionReceipt(base('Yes'), missing)) }
    for (const decision of ['decline', 'correct', 'question', 'ambiguous']) assert.throws(() => receipt.issueAssistantDecisionReceipt(base('A fresh answer'), clean(decision)))
    assert.throws(() => receipt.issueAssistantDecisionReceipt(base('Yes'), { ...clean('confirm'), extra: false }))
  })
  await check('tampering, another key and every altered account/session/review/revision/text/turn/assessment/decision reject', () => {
    const binding = base('Yes save this note.'), token = issue(binding)
    for (const changed of [{ actorId: 'foreign' }, { sessionId: 'foreign' }, { reviewId: 'new-review' }, { revision: 5 }, { text: binding.text + ' ' }, { decision: 'decline' }, { turnId: 'another-turn' }, { assessmentReceiptId: 'another-paid-receipt' }]) assert.throws(() => receipt.verifyAssistantDecisionReceipt(token, { ...binding, ...changed }))
    assert.throws(() => receipt.verifyAssistantDecisionReceipt(token, binding, { secret: 'different-synthetic-signing-secret' }))
    const pieces = token.split('.'), payload = JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8')); payload.reviewId = 'forged-review'; pieces[1] = Buffer.from(JSON.stringify(payload)).toString('base64url'); assert.throws(() => receipt.verifyAssistantDecisionReceipt(pieces.join('.'), binding))
    for (const invalid of ['', null, token + '.extra', 'ad1.not-json.invalid']) assert.throws(() => receipt.verifyAssistantDecisionReceipt(invalid, binding))
  })
  await check('receipt is short-lived and cannot be accepted before issuance or at expiry', () => {
    const binding = base('Save the reviewed change.'), token = issue(binding)
    assert.throws(() => receipt.verifyAssistantDecisionReceipt(token, binding, { nowMs: START - 1 }))
    assert.equal(receipt.verifyAssistantDecisionReceipt(token, binding, { nowMs: START + 89999 }).decision, 'confirm')
    assert.throws(() => receipt.verifyAssistantDecisionReceipt(token, binding, { nowMs: START + 90000 }))
    assert.throws(() => receipt.verifyAssistantDecisionReceipt(token, binding, { nowMs: START + 90001 }))
  })
  await check('actual host executes the normal save from scoped receipt and never invokes a planner', async () => {
    const f = setup(); await f.prepare(); assert.equal(f.normal.calls.post, 0)
    const binding = await f.decision('Yes save this note.'), token = issue(binding)
    const result = await f.run({ text: binding.text, command: { type: 'confirm', reviewId: binding.reviewId }, decisionReceipt: token })
    assert.equal(result.session.status, 'completed'); assert.equal(f.normal.calls.post, 1)
    await assert.rejects(() => f.run({ text: binding.text, command: { type: 'confirm', reviewId: binding.reviewId }, decisionReceipt: token }))
    assert.equal(f.normal.calls.post, 1)
  })
  await check('one signed human turn cannot authorize the next review or a changed review revision', async () => {
    const f = setup(true); await f.prepare(); const binding = await f.decision('Please save the change I reviewed.'), token = issue(binding)
    const first = await f.run({ text: binding.text, command: { type: 'confirm', reviewId: binding.reviewId }, decisionReceipt: token })
    const next = first.session.steps.find(step => step.status === 'review'); assert(next); assert.equal(f.normal.calls.post, 1)
    await assert.rejects(() => f.run({ text: binding.text, command: { type: 'confirm', reviewId: next.review.id }, decisionReceipt: token }))
    const corrected = setup(); await corrected.prepare(); const prior = await corrected.decision('Save the exact review.'), stale = issue(prior)
    await corrected.run({ text: 'Change the amount to 300 ml.', command: { type: 'correct', stepId: 'water-0', values: { amount: 300, unit: 'ml' } } })
    await assert.rejects(() => corrected.run({ text: prior.text, command: { type: 'confirm', reviewId: prior.reviewId }, decisionReceipt: stale })); assert.equal(corrected.normal.calls.post, 0)
  })
  await check('invalid receipt cannot use the legacy Yes fallback; no receipt cannot authorize a model-only arbitrary command', async () => {
    const f = setup(); await f.prepare(); const binding = await f.decision('Yes')
    await assert.rejects(() => f.run({ text: 'Yes', command: { type: 'confirm', reviewId: binding.reviewId }, decisionReceipt: 'invalid' }))
    for (const text of ['Unrelated question?', 'The old note said yes.', 'Yes save this note.']) await assert.rejects(() => f.run({ text, command: { type: 'confirm', reviewId: binding.reviewId } }))
    assert.equal(f.normal.calls.post, 0)
    const result = await f.run({ text: 'Yes', command: { type: 'confirm', reviewId: binding.reviewId } }); assert.equal(result.session.status, 'completed'); assert.equal(f.normal.calls.post, 1)
  })
  await check('verified decline changes no saved data and existing exact UI controls remain separate', async () => {
    const f = setup(); await f.prepare(); const binding = await f.decision('Please discard the proposed change.', 'decline'), token = issue(binding)
    const result = await f.run({ text: binding.text, command: { type: 'decline', reviewId: binding.reviewId }, decisionReceipt: token }); assert.equal(result.session.steps[0].status, 'cancelled'); assert.equal(f.normal.calls.post, 0)
    const ui = setup(); await ui.prepare(); const current = await ui.decision('Yes'), receipt = issue(current)
    await assert.rejects(() => ui.run({ text: current.text, command: { type: 'confirm', reviewId: current.reviewId }, controlId: 'confirm:' + current.reviewId, decisionReceipt: receipt }))
    await assert.rejects(() => ui.run({ text: current.text, command: { type: 'stop' }, decisionReceipt: receipt }))
    await assert.rejects(() => ui.run({ text: current.text, decisionReceipt: receipt }))
    const saved = await ui.run({ command: { type: 'confirm', reviewId: current.reviewId }, controlId: 'confirm:' + current.reviewId }); assert.equal(saved.session.status, 'completed'); assert.equal(ui.normal.calls.post, 1)
  })
  await check('all fallback commands recheck the exact owned review fence inside exclusive dispatch', async () => {
    const valid = setup(); await valid.prepare(); const target = await valid.decision('Correct the amount.')
    const fence = { revision: target.revision, stepId: 'water-0', reviewId: target.reviewId }
    await valid.run({ text: target.text, command: { type: 'correct', stepId: 'water-0', values: { amount: 300, unit: 'ml' } } }, { expectedReviewFence: fence })
    assert.equal(valid.normal.calls.post, 0)
    for (const type of ['confirm', 'decline', 'correct', 'stop', 'advance']) {
      const f = setup(); await f.prepare(); const binding = await f.decision(type === 'decline' ? 'Discard this proposed change.' : 'Save exactly the reviewed values.', type === 'decline' ? 'decline' : 'confirm')
      const expected = { revision: binding.revision, stepId: 'water-0', reviewId: binding.reviewId }
      let reads = 0
      f.onRead(async count => { reads = count; if (count === 3) await f.persistence.store.runExclusive(f.context.actorId, f.sessionId, async (current, save) => { await save({ ...current, revision: current.revision + 1 }) }) })
      const command = type === 'confirm' || type === 'decline' ? { type, reviewId: binding.reviewId } : type === 'correct' ? { type, stepId: 'water-0', values: { amount: 300, unit: 'ml' } } : { type }
      await assert.rejects(() => f.run({ text: binding.text, command, ...(['confirm', 'decline'].includes(type) ? { decisionReceipt: issue(binding) } : {}) }, { expectedReviewFence: expected }), /review changed/)
      assert.equal(reads, 3); assert.equal(f.normal.calls.post, 0)
      assert.equal((await f.persistence.readSession(f.context.actorId, f.sessionId)).steps[0].status, 'review')
    }
    await assert.rejects(() => valid.run({ text: 'A new request' }, { expectedReviewFence: fence }))
  })
  console.log(`Assistant decision receipts: ${groups} actual-source offline groups passed. Assessment semantics are synthetic; no model, credentials, provider, wallet or database access.`)
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
