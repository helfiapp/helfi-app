#!/usr/bin/env node
'use strict'
// Execute the real preparation route with synthetic request/account/wallet
// fixtures. No application imports, keys, provider, network or real DB access.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
function sourceFunctions(relative) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8')
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true)
  const printer = ts.createPrinter()
  return ast.statements.filter(statement => !ts.isImportDeclaration(statement)).map(statement => printer.printNode(ts.EmitHint.Unspecified, statement, ast)).join('\n').replace(/^export\s+/gm, '')
}
function harness(options = {}) {
  const effects = { reads: [], wallet: 0, debit: 0, provider: 0, usage: [] }
  const forbidden = label => () => { throw Error(`Forbidden offline effect: ${label}`) }
  const ctx = vm.createContext({
    process: { env: Object.freeze({}) }, console: { log() {}, warn() {}, error() {} },
    Date, Intl, URL, URLSearchParams, Buffer, crypto, AbortController, setTimeout, clearTimeout,
    resolveHelfiTtsVoice: () => 'marin',
    aiConsentRequiredResponse: async () => options.deniedConsent ? { status: 403, body: { error: 'Synthetic consent denied' } } : null,
    getServerSession: async () => options.unauthorized ? null : { user: { id: options.userId || 'synthetic-user-a' } },
    getUserIdFromNativeAuth: async () => null, authOptions: {},
    beginVoiceActionTrace: () => ({}), finishVoiceActionTrace: async response => response,
    NextResponse: { json: (body, init) => ({ status: init?.status || 200, body }) },
    CreditManager: class {
      async getWalletStatus() { effects.wallet++; return options.wallet || { plan: 'synthetic-paid', totalAvailableCents: 100 } }
      async chargeCents() { effects.debit++; throw Error('Read-only control must not charge') }
    },
    prisma: new Proxy({ user: { findUnique: async ({ where }) => { effects.reads.push(where.id); return { id: where.id, country: 'AU' } } } }, { get(target, property) { if (!(property in target)) throw Error(`Read-only control touched ${String(property)}`); return target[property] } }),
    OpenAI: class { constructor() { effects.provider++; throw Error('Provider forbidden') } },
    fetch: forbidden('network'), chatCompletionWithCost: forbidden('command model'),
    searchLocalFoods: forbidden('food lookup'), searchCustomFoodMacros: forbidden('custom lookup'),
    logAiUsageEvent: async event => { effects.usage.push(event) },
    createNativeVoicePromptHandoff: async () => ({ token: 'synthetic-handoff' }),
  })
  for (const relative of ['lib/native-voice-time.ts', 'app/api/native/voice-assistant/route.ts']) {
    vm.runInContext(ts.transpileModule(sourceFunctions(relative), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, ctx, { filename: relative })
  }
  return { ctx, effects, send: (transcript, extra = {}) => ctx.POST({ headers: { get: () => 'application/json' }, json: async () => ({ transcript, localDate: '2026-10-17', tzOffsetMin: -660, timeZone: 'Australia/Melbourne', aiConsentGranted: true, voiceReply: false, ...extra }) }) }
}
async function run() {
  const cancellations = ['No, discard it.', 'Discard it', 'Cancel', 'cancel it please', 'Please cancel that draft.', 'forget it', 'No, forget it.', 'Never mind', 'no', 'no thanks', 'Stop']
  for (const text of cancellations) {
    const h = harness()
    const response = await h.send(text, { conversationHistory: [{ role: 'assistant', text: 'A previous meal was saved.' }] })
    assert.equal(response.status, 200, text)
    assert.equal(response.body.draft?.confirmationMessage, 'No draft is waiting to be saved. Anything already saved stays unchanged.', text)
    assert.equal(response.body.draft.canConfirm, false)
    assert.equal(response.body.draft.reasonCode, 'no_pending_review')
    assert.equal(response.body.draft.reviewToken, undefined)
    assert.equal(response.body.rejectNow, undefined, 'No claim that a previous review/save was discarded')
    assert.equal(response.body.confirmNow, undefined)
    assert.equal(response.body.chargedCredits, 0)
    assert.equal(response.body.audio, null)
    assert.equal(h.effects.wallet, 1, 'Existing paid/minimum credit gate remains')
    assert.equal(h.effects.debit, 0)
    assert.equal(h.effects.provider, 0)
    assert.deepEqual(h.effects.usage, [])
    assert.deepEqual(h.effects.reads, ['synthetic-user-a'])
    assert.doesNotMatch(response.body.draft.confirmationMessage, /nothing (?:has been|was) saved|cancelled|undone|deleted|not saved/i)
  }
  for (const text of ['Yes, save it', 'confirm', 'Confirm it please', 'save it', 'please save']) {
    const h = harness()
    const response = await h.send(text, { conversationHistory: [{ role: 'user', text: 'Log yesterday’s lunch' }] })
    assert.equal(response.status, 200)
    assert.match(response.body.draft.confirmationMessage, /^No reviewed draft is ready to save\./)
    assert.equal(response.body.draft.canConfirm, false)
    assert.equal(response.body.confirmNow, undefined)
    assert.equal(response.body.chargedCredits, 0)
    assert.equal(h.effects.debit, 0)
    assert.equal(h.effects.provider, 0)
  }
  const classifier = harness().ctx
  vm.runInContext(ts.transpileModule(sourceFunctions('lib/native-voice-action-observability.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, classifier)
  const noPending = classifier.buildNoPendingVoiceControlDraft('No, discard it.', '2026-10-17')
  const outcome = classifier.voiceActionOutcome({ success: true, draft: noPending }, 200, 'prepare')
  assert.equal(outcome.status, 'answered', 'A truthful state answer is not a failed food operation')
  assert.equal(outcome.reasonCode, 'no_pending_review')
  assert.equal(outcome.success, true)
  assert.equal(classifier.voiceActionOutcome({ success: true, draft: { ...noPending, canConfirm: true } }, 200, 'prepare').status, 'needs_review')
  for (const text of ['yes', 'okay', 'No milk in my coffee', 'Do not stop tracking my mood', 'No, log my mood as 3', 'Cancel the alarm at 7 pm', 'Discard the milk and use water', 'Forget it and log 100 g rice', 'Save my mood as 3', 'confirm this medication dose is safe', 'I want to kill myself', 'Cancel it because I want to hurt myself']) {
    assert.equal(classifier.buildNoPendingVoiceControlDraft(text, '2026-10-17'), null, `Substantive or ambiguous request stays outside the bounded handler: ${text}`)
  }
  const reviewed = { action: 'food_build_meal', canConfirm: true, localDate: '2026-10-17', transcript: 'Synthetic reviewed meal', reviewToken: 'synthetic-reviewed-token', food: { meal: 'lunch', items: [] } }
  for (const text of ['No', 'discard it', 'cancel']) {
    const h = harness()
    const response = await h.send(text, { confirmationDraft: reviewed })
    assert.equal(response.status, 200)
    assert.equal(response.body.rejectNow, true, 'Existing pending review rejection remains in its existing branch')
    assert.equal(response.body.draft, null)
    assert.equal(h.effects.wallet, 0)
  }
  const pending = { action: 'food_draft', canConfirm: false, localDate: '2026-10-17', food: { draftText: 'some rice' } }
  const pendingResult = await harness().send('cancel', { followUpDraft: pending })
  assert.equal(pendingResult.body.rejectNow, true)
  const existingConfirmation = await harness().send('confirm', { confirmationDraft: reviewed })
  assert.equal(existingConfirmation.body.confirmNow, true)
  assert.equal(existingConfirmation.body.draft.reviewToken, reviewed.reviewToken)
  const selfHarm = await harness().send('Cancel it because I want to hurt myself')
  assert.equal(selfHarm.status, 200)
  assert.match(selfHarm.body.draft.confirmationMessage, /urgent support/)
  assert.notEqual(selfHarm.body.draft.summary, 'No draft waiting')
  assert.equal((await harness({ unauthorized: true }).send('cancel')).status, 401)
  assert.equal((await harness({ deniedConsent: true }).send('cancel')).status, 403)
  assert.equal((await harness({ wallet: { totalAvailableCents: 100 } }).send('cancel')).status, 402)
  assert.equal((await harness({ wallet: { plan: 'synthetic-paid', totalAvailableCents: 0 } }).send('cancel')).status, 402)
  const isolated = harness({ userId: 'synthetic-user-b' })
  assert.equal((await isolated.send('No, discard it.')).status, 200)
  assert.deepEqual(isolated.effects.reads, ['synthetic-user-b'])
  console.log('PASS: anchored no-pending cancellation and explicit save requests return truthful read-only replies with zero new charge/provider/mutation. Existing account/consent/paid/safety gates, pending rejection and exact reviewed confirmation remain intact. Synthetic actual-source fixtures only.')
}
run().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
