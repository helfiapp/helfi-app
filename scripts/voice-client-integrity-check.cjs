#!/usr/bin/env node
'use strict'

// Executes actual native client functions with synthetic state and offline mocks.
// Never reads environment files, account details, microphone audio or the network.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(path.resolve(__dirname, '../native/src/voice/VoiceAssistant.tsx'), 'utf8')
const file = ts.createSourceFile('VoiceAssistant.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const functions = new Map()
const callbacks = new Map()
const properties = new Map()
const constants = []
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(file))
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    if (['CONFIRM_DRAFT_TEXTS', 'REJECT_DRAFT_TEXTS'].includes(node.name.text)) constants.push(`const ${node.getText(file)}`)
    if (node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(file) === 'useCallback') callbacks.set(node.name.text, node.initializer.arguments[0].getText(file))
  }
  if (ts.isPropertyAssignment(node) && ts.isArrowFunction(node.initializer)) properties.set(node.name.getText(file), node.initializer.getText(file))
  ts.forEachChild(node, visit)
}
visit(file)
const helperNames = ['nativeVoiceTimeZone', 'cleanFavoriteText', 'normalizeControlText', 'isConfirmingDraftText', 'isRejectingDraftText', 'isExplicitNewVoiceCommand', 'supportsNativeVoiceInput', 'mealLabel', 'compactRecipeVoiceReply', 'spokenReplyTextForDraft', 'reviewPromptForDraft', 'spokenReviewPromptForDraft', 'realtimeToolResult', 'voiceResultStatusFromDraft']
const helpers = helperNames.map((name) => {
  assert.ok(functions.has(name), `Missing actual helper ${name}`)
  return functions.get(name)
}).join('\n')
const noop = () => {}
function evaluate(box, code) {
  vm.createContext(box)
  vm.runInContext(ts.transpileModule(`${helpers}\n${constants.join('\n')}\n${code}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, box, { timeout: 5000 })
  return box
}
function callback(name) {
  assert.ok(callbacks.has(name), `Missing actual callback ${name}`)
  return callbacks.get(name)
}
const foodDraft = () => ({
  action: 'food_build_meal', canConfirm: true, transcript: 'log chicken and rice',
  localDate: '2026-10-14', localTime: '18:35', tzOffsetMin: -660,
  summary: 'Chicken and rice', confirmationMessage: 'Please review this meal', reviewToken: 'synthetic-signed-review',
  food: { meal: 'lunch', entries: [{ name: 'Chicken', description: '100 g' }, { name: 'Rice', description: '150 g' }] },
})
function baseBox() {
  class LocalDate extends Date { getTimezoneOffset() { return -660 } }
  const box = { Date: LocalDate, Intl, Promise, AbortController, Math, Boolean, Number, String, Array, JSON,
    setTimeout: () => 1, clearTimeout: noop, AppState: { currentState: 'active' },
    session: { token: 'synthetic-token' }, openRef: { current: true },
    voiceProviderMountedRef: { current: true }, voiceAccountTokenRef: { current: 'synthetic-token' },
    voiceSessionActiveRef: { current: false }, realtimeVoiceRunRef: { current: 0 },
    realtimeVoiceConnectedRef: { current: false }, realtimeActionGuardRef: { current: null },
    realtimeVoiceAbortRef: { current: null }, realtimeActionAbortRef: { current: null },
    draftRequestAbortRef: { current: null }, realtimeVoiceConnectTimeoutRef: { current: null },
    realtimeVoiceStopRef: { current: null }, realtimeVoiceMuteRef: { current: null },
    realtimeVoicePromptRef: { current: null }, realtimeBillingSessionIdRef: { current: 'synthetic-conversation' },
    pendingReviewAnswerRef: { current: true }, voiceSaveRequestsRef: { current: 0 },
    REALTIME_VOICE_SERVER_TIMEOUT_MS: 12000, REALTIME_VOICE_MEDIA_TIMEOUT_MS: 4000,
    Alert: { alert: noop },
  }
  for (const name of ['addVoiceActivity', 'setRealtimeVoiceAvailable', 'setRealtimeVoiceStatus', 'setRealtimeVoiceError', 'setVoiceReplyPreference', 'clearRealtimeConnectTimeout', 'clearReviewSilenceTimer', 'setBusy', 'setDraft', 'setPendingFollowUpDraft', 'setChargedCredits', 'setReviewCorrectionActive', 'setTranscript', 'setLaunchContext', 'appendConversationTurns', 'requestVoiceReply', 'resumeVoiceSessionListening', 'setConfirming', 'setSaveError', 'setSaveSuccessNotice', 'closePanel']) box[name] = noop
  box.setContinuousVoiceSession = (active) => { box.voiceSessionActiveRef.current = active }
  return box
}
async function startupScenario(change, allowed = true, onStart) {
  const box = baseBox()
  let resolvePermission
  let starts = 0
  Object.assign(box, {
    liveVoiceEnabled: true, voiceRecordingSupported: true, checkingRealtimeVoice: false,
    realtimeVoiceAvailable: true, realtimeVoiceError: '', hasNativeRealtimeVoiceSupport: () => true,
    requestAiDataSharingPermission: () => new Promise((resolve) => { resolvePermission = resolve }),
    startHelfiRealtimeVoiceSession: async (params) => {
      starts++
      onStart?.(params)
      return { stop: async () => {}, setMicrophoneMuted: noop, promptAssistant: noop }
    },
  })
  evaluate(box, `globalThis.run = ${callback('startVoiceSession')}`)
  const pending = box.run()
  assert.equal(starts, 0, 'Permission check must complete before voice startup')
  change(box)
  resolvePermission(allowed)
  await pending
  return starts
}
async function draftRequest(text, response, realtime = true) {
  const box = baseBox()
  const original = foodDraft()
  const bodies = []
  const saveOptions = []
  Object.assign(box, {
    draft: original, transcript: '', pendingFollowUpDraft: null, voiceReply: false,
    launchContext: { section: 'food', date: '2026-10-15', meal: 'snacks' }, requestConversationHistory: [],
    normalizeLaunchContext: (value) => value, todayLocalDate: () => '2026-10-15',
    followUpTranscript: () => null, isPendingFollowUpDraft: () => false,
    requestAiDataSharingPermission: async () => true, loadVoiceFavorites: async () => [],
    buildNativeAuthHeaders: () => ({}), makeConversationTurn: (role, text) => ({ role, text }),
    fetch: async (_url, options) => { bodies.push(JSON.parse(options.body)); return {} },
    fetchNativeVoiceAssistant: async (factory) => { await factory('https://offline.invalid'); return { res: { ok: true }, data: response || { draft: original } } },
    saveDraft: async (_draft, options) => { saveOptions.push(options); return { result: { message: 'Saved by synthetic server' } } },
  })
  evaluate(box, `globalThis.run = ${callback('sendDraftRequest')}`)
  const result = await box.run({ transcriptOverride: text, suppressSpokenReply: true, realtimeActionHint: realtime ? { action: 'food_build_meal' } : undefined })
  return { original, bodies, saveOptions, result }
}
async function waterFollowUpRequest() {
  const box = baseBox(), bodies = []
  const pending = { action: 'water', canConfirm: false, localDate: '2026-10-15', transcript: 'Log 250 ml coffee with 50 ml whole milk', confirmationMessage: 'Should I log Coffee as sugar-free, or with sugar or honey?', water: { amount: 250, unit: 'ml', label: 'Coffee' } }
  Object.assign(box, {
    draft: pending, pendingFollowUpDraft: pending, transcript: '', voiceReply: false, launchContext: {}, requestConversationHistory: [],
    normalizeLaunchContext: value => value, todayLocalDate: () => '2026-10-15',
    // This obsolete rewrite would lose milk if the actual request callback used it.
    followUpTranscript: () => { throw new Error('Water answers must stay raw with the complete draft') },
    requestAiDataSharingPermission: async () => true, loadVoiceFavorites: async () => [], buildNativeAuthHeaders: () => ({}), makeConversationTurn: (role, text) => ({ role, text }),
    fetch: async (_url, options) => { bodies.push(JSON.parse(options.body)); return {} },
    fetchNativeVoiceAssistant: async factory => { await factory('https://offline.invalid'); return { res: { ok: true }, data: { draft: pending } } },
  })
  const actualPending = functions.get('isPendingFollowUpDraft')
  evaluate(box, `${actualPending}\nglobalThis.run = ${callback('sendDraftRequest')}`)
  await box.run({ transcriptOverride: 'no sugar', suppressSpokenReply: true })
  assert.equal(bodies[0].transcript, 'no sugar')
  assert.equal(bodies[0].followUpDraft.transcript, pending.transcript)
  assert.equal(typeof bodies[0].timeZone, 'string')
  const milkPending = { ...pending, confirmationMessage: 'How much milk should I add? Please give the amount in ml.' }
  assert(box.isPendingFollowUpDraft(milkPending), 'Milk clarification remains pending for the next amount')
  assert(box.isPendingFollowUpDraft({ ...pending, timingNeedsClarification: true }), 'Clock clarification remains pending')
}
async function speechDuringPreparation(saving) {
  const box = baseBox()
  const action = new AbortController()
  const draft = new AbortController()
  Object.assign(box, {
    realtimeRunId: 7, realtimeVoiceRunRef: { current: 7 }, voiceSessionActiveRef: { current: true },
    realtimeActionAbortRef: { current: action }, draftRequestAbortRef: { current: draft },
    voiceSaveRequestsRef: { current: saving ? 1 : 0 },
  })
  let message = ''
  box.setRealtimeVoiceError = (value) => { message = value }
  evaluate(box, `globalThis.run = ${properties.get('onUserSpeech')}`)
  box.run()
  assert.equal(action.signal.aborted, !saving)
  assert.equal(draft.signal.aborted, !saving)
  assert.equal(box.pendingReviewAnswerRef.current, false)
  if (saving) {
    assert.match(message, /still being confirmed/)
    assert.doesNotMatch(message, /not saved|cancelled|undone/)
  }
}
async function actionDuringSubmittedSave() {
  const box = baseBox()
  const action = new AbortController()
  Object.assign(box, {
    realtimeRunId: 7, realtimeVoiceRunRef: { current: 7 }, voiceSessionActiveRef: { current: true },
    realtimeActionAbortRef: { current: action }, voiceSaveRequestsRef: { current: 1 },
  })
  evaluate(box, `globalThis.run = ${properties.get('onActionRequest')}`)
  const result = await box.run({ request: 'no milk', action: 'food_build_meal', needsReview: true })
  assert.equal(action.signal.aborted, false, 'A correction tool call must not discard an outstanding save response')
  assert.equal(result.safeToClaimSaved, false)
  assert.match(result.message, /still being confirmed/)
}
async function verifySaveResult() {
  const box = baseBox()
  let resolveResponse
  const notices = []
  const events = []
  Object.assign(box, {
    todayLocalDate: () => '2026-10-15', buildNativeAuthHeaders: () => ({}),
    DeviceEventEmitter: { emit: (name, payload) => events.push({ name, payload }) },
    fetch: async () => new Promise((resolve) => { resolveResponse = resolve }),
    fetchNativeVoiceConfirm: async (factory) => factory('https://offline.invalid'),
    setSaveSuccessNotice: (notice) => notices.push(notice),
  })
  evaluate(box, `globalThis.run = ${callback('saveDraft')}`)
  const pending = box.run(foodDraft(), { closeOnSuccess: false })
  assert.equal(box.voiceSaveRequestsRef.current, 1)
  assert.equal(notices.length, 0, 'Do not claim save before its response')
  resolveResponse({ res: { ok: true }, data: { result: { kind: 'food', message: 'Saved' } } })
  await pending
  assert.equal(box.voiceSaveRequestsRef.current, 0)
  assert.equal(notices.length, 1)
  assert.ok(events.some((event) => event.name === 'helfi:food-log-changed' && event.payload.localDate === '2026-10-14'))
  const failed = box.run(foodDraft(), { closeOnSuccess: false })
  resolveResponse({ res: { ok: false }, data: { error: 'Synthetic save failure' } })
  assert.equal(await failed, null)
  assert.equal(box.voiceSaveRequestsRef.current, 0)
  assert.equal(notices.length, 1, 'Failed save must not produce another success notice')
}
async function main() {
  const box = evaluate(baseBox(), '')
  const draft = foodDraft()
  for (const text of ['make this dinner instead', 'make dinner', 'add 50 ml milk to lunch', 'add milk for lunch', 'log this for dinner', 'change the meal to breakfast', 'add one more egg']) {
    assert.equal(box.isExplicitNewVoiceCommand(text, draft), false, `Keep reviewed draft for: ${text}`)
    const request = await draftRequest(text)
    assert.equal(JSON.stringify(request.bodies[0].confirmationDraft), JSON.stringify(request.original))
    assert.equal(request.bodies[0].localDate, draft.localDate)
    assert.equal(request.bodies[0].tzOffsetMin, draft.tzOffsetMin)
  }
  for (const text of ['log 250 ml water', 'log another meal for dinner', 'open food diary']) assert.equal(box.isExplicitNewVoiceCommand(text, draft), true, `Keep separate commands independent: ${text}`)
  assert.equal(box.isExplicitNewVoiceCommand('log 500 ml water', { ...draft, action: 'water', food: undefined }), false, 'A restated water amount changes the current water proposal')
  const separate = await draftRequest('log 250 ml water')
  assert.equal(separate.bodies[0].confirmationDraft, null)
  for (const text of ['yes', 'yes, that sounds good']) {
    const request = await draftRequest(text, { confirmNow: true, draft })
    assert.equal(request.result.saved, true)
    assert.equal(request.saveOptions[0].closeOnSuccess, false, 'Both short and interpreted confirmations keep live voice open')
  }
  const typed = await draftRequest('yes, that sounds good', { confirmNow: true, draft }, false)
  assert.equal(typed.saveOptions[0].closeOnSuccess, true, 'Typed confirmation preserves existing close behavior')
  const longDraft = { ...draft, food: { ...draft.food, entries: Array.from({ length: 12 }, (_, i) => ({ name: `Ingredient ${i + 1} grilled chicken breast`, description: `${i + 1}00 grams, no skin, cooked weight` })) } }
  const full = box.reviewPromptForDraft(longDraft)
  assert.ok(full.includes('Ingredient 12') && full.includes('1200 grams'), 'Full review retains every ingredient and amount')
  const spoken = box.spokenReviewPromptForDraft(longDraft)
  assert.ok(spoken.length < 650, 'Long review uses a concise spoken summary')
  for (const value of ['Lunch', '12 food items', draft.localDate, draft.localTime, 'Would you like me to save that for you?']) assert.ok(spoken.includes(value), `Spoken review retains ${value}`)
  const tool = box.realtimeToolResult({ ok: true, needsReview: true, reviewPrompt: spoken, status: 'review_draft' })
  assert.equal(tool.spokenReply, spoken)
  assert.equal(tool.safeToClaimSaved, false)
  assert.ok(!box.reviewPromptForDraft({ ...draft, localTime: '99:99' }).includes('99:99'))
  assert.equal(box.supportsNativeVoiceInput('ios', true), false, 'iPad stays typed even in a narrow window')
  assert.equal(box.supportsNativeVoiceInput('ios', false), true, 'iPhone voice survives landscape width')
  assert.equal(box.supportsNativeVoiceInput('android', false), true)
  assert.equal(await startupScenario(noop), 1)
  const stageTimers = []
  assert.equal(await startupScenario((state) => {
    state.setTimeout = (_callback, delay) => { stageTimers.push(delay); return stageTimers.length }
  }, true, ({ callbacks }) => {
    callbacks.onConnectStage('local-offer-ready')
    callbacks.onConnectStage('server-answer-received')
  }), 1)
  assert.deepEqual(stageTimers, [12000, 12000, 4000], 'Local media gathering, server response and verified media connection need separate startup budgets')
  assert.equal(await startupScenario((state) => { state.openRef.current = false; state.realtimeVoiceRunRef.current++ }), 0, 'Done prevents late startup')
  assert.equal(await startupScenario((state) => { state.AppState.currentState = 'background' }), 0)
  assert.equal(await startupScenario((state) => { state.voiceAccountTokenRef.current = 'another-synthetic-account' }), 0)
  assert.equal(await startupScenario((state) => { state.voiceProviderMountedRef.current = false }), 0)
  assert.equal(await startupScenario((state) => { state.realtimeVoiceRunRef.current++ }), 0)
  assert.equal(await startupScenario(noop, false), 0)
  await waterFollowUpRequest()
  await speechDuringPreparation(false)
  await speechDuringPreparation(true)
  await actionDuringSubmittedSave()
  await verifySaveResult()
  console.log('PASS: actual native voice callbacks preserve correction drafts/date/time, keep natural confirmation live, retain complete concise save questions, use iPad identity, prevent late startup, cancel preparation safely, and confirm only successful saves. Offline mocks only; no real audio or server result is claimed.')
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
