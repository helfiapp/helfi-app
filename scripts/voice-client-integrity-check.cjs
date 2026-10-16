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
const jsxHandlers = new Map()
const footerExpressions = new Map()
const constants = []
let autoStartEffect, messageFocusEffect
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(file))
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    if (['primaryFooterLabel', 'discardFooterLabel'].includes(node.name.text)) footerExpressions.set(node.name.text, node.initializer.getText(file))
    if (['NOT_SAVED_MESSAGE', 'CONFIRM_DRAFT_TEXTS', 'REJECT_DRAFT_TEXTS', 'VOICE_CONVERSATION_MEMORY_KEY', 'VOICE_CONVERSATION_MEMORY_TTL_MS', 'MAX_VOICE_CONVERSATION_TURNS', 'VOICE_ASSISTANT_OPENING_EVENT', 'SPOKEN_REPLY_VOICE_NAME'].includes(node.name.text)) constants.push(`const ${node.getText(file)}`)
    if (node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(file) === 'useCallback') callbacks.set(node.name.text, node.initializer.arguments[0].getText(file))
  }
  if (ts.isPropertyAssignment(node) && ts.isArrowFunction(node.initializer)) properties.set(node.name.getText(file), node.initializer.getText(file))
  if (ts.isJsxAttribute(node) && node.name.text === 'onChangeText' && node.initializer?.expression && node.initializer.expression.getText(file).includes('setTranscript(value)')) jsxHandlers.set('messageChange', node.initializer.expression.getText(file))
  if (ts.isJsxAttribute(node) && node.name.text === 'onLayout' && node.initializer?.expression?.getText(file).includes('messageSectionYRef.current')) jsxHandlers.set('messageLayout', node.initializer.expression.getText(file))
  if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect' && node.arguments[0]?.getText(file).includes('realtimeAutoStartRef.current = true')) autoStartEffect = node.arguments[0].getText(file)
  if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect' && node.arguments[0]?.getText(file).includes('requestAnimationFrame(focusRequestedMessageInput)')) messageFocusEffect = node.arguments[0].getText(file)
  ts.forEachChild(node, visit)
}
visit(file)
const helperNames = ['newRealtimeBillingSessionId', 'newVoiceActionRunId', 'voiceConversationStorageKey', 'traceVoiceAction', 'isConfirmedVoiceSave', 'isValidNativeDeviceReceipt', 'nativeDeviceIoForVoice', 'reviewedNativeDevicePrompt', 'isConfirmedRecipeImport', 'verifiedActionCompletionMessage', 'confirmationRequestResult', 'isPendingFollowUpDraft', 'nativeVoiceTimeZone', 'cleanFavoriteText', 'normalizeControlText', 'isConfirmingDraftText', 'isRejectingDraftText', 'isExplicitNewVoiceCommand', 'supportsNativeVoiceInput', 'mealLabel', 'compactRecipeVoiceReply', 'spokenReplyTextForDraft', 'voiceFoodSourceNotice', 'reviewPromptForDraft', 'spokenReviewPromptForDraft', 'realtimeToolResult', 'voiceResultStatusFromDraft']
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
    setTimeout: () => 1, clearTimeout: noop, AppState: { currentState: 'active' }, console: { info: noop },
    session: { token: 'synthetic-token' }, openRef: { current: true },
    voiceMemoryUserId: 'synthetic-owner', voiceAccountUserIdRef: { current: 'synthetic-owner' },
    messageScrollRef: { current: null }, messageInputRef: { current: null }, messageSectionYRef: { current: null }, pendingMessageFocusRef: { current: null },
    nativeDeviceReviewRef: { current: null },
    voiceProviderMountedRef: { current: true }, voiceAccountTokenRef: { current: 'synthetic-token' },
    voiceSessionActiveRef: { current: false }, realtimeVoiceRunRef: { current: 0 },
    realtimeVoiceConnectedRef: { current: false }, realtimeActionGuardRef: { current: null },
    realtimeVoiceAbortRef: { current: null }, realtimeActionAbortRef: { current: null },
    draftRequestAbortRef: { current: null }, realtimeVoiceConnectTimeoutRef: { current: null },
    realtimeVoiceStopRef: { current: null }, realtimeVoiceMuteRef: { current: null },
    realtimeVoicePromptRef: { current: null }, realtimeVoiceFlushRef: { current: null }, voiceGreetingConversationRef: { current: '' }, realtimeBillingSessionIdRef: { current: 'synthetic-conversation' },
    openAppTargetRef: { current: noop },
    pendingReviewAnswerRef: { current: true }, voiceSaveRequestsRef: { current: 0 },
    REALTIME_VOICE_SERVER_TIMEOUT_MS: 12000, REALTIME_VOICE_MEDIA_TIMEOUT_MS: 4000,
    Alert: { alert: noop },
    makeConversationTurn: (role, text) => ({ role, text }),
  }
  for (const name of ['addVoiceActivity', 'setMessageFocusRequest', 'requestMessageInputFocus', 'setRealtimeVoiceAvailable', 'setRealtimeVoiceStatus', 'setRealtimeVoiceError', 'setVoiceReplyPreference', 'clearRealtimeConnectTimeout', 'clearReviewSilenceTimer', 'setBusy', 'setDraft', 'setPendingFollowUpDraft', 'setChargedCredits', 'setReviewCorrectionActive', 'setTranscript', 'setLaunchContext', 'appendConversationTurns', 'requestVoiceReply', 'resumeVoiceSessionListening', 'setConfirming', 'setSaveError', 'setSaveSuccessNotice', 'closePanel']) box[name] = noop
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
async function verifyVoiceGreetingLifecycle() {
  const box = baseBox(), starts = []
  Object.assign(box, {
    liveVoiceEnabled: true, voiceRecordingSupported: true, checkingRealtimeVoice: false, realtimeVoiceAvailable: true, realtimeVoiceError: '',
    hasNativeRealtimeVoiceSupport: () => true, requestAiDataSharingPermission: async () => true,
    startHelfiRealtimeVoiceSession: async params => { starts.push(params); params.callbacks.onConnectStage('microphone-sending'); params.callbacks.onStatus('live'); return { stop: async () => {}, setMicrophoneMuted: noop, promptAssistant: noop, flushTranscript: noop } },
  })
  evaluate(box, `globalThis.start = ${callback('startVoiceSession')}`)
  await box.start()
  assert.equal(starts[0].greetOnConnect, true, 'The first microphone conversation requests the fixed greeting')
  await box.start()
  assert.equal(starts[1].greetOnConnect, false, 'A connection retry in the same conversation cannot repeat the greeting')
  box.realtimeBillingSessionIdRef.current = 'synthetic-new-conversation'
  await box.start()
  assert.equal(starts[2].greetOnConnect, true, 'An explicit new microphone conversation receives a fresh greeting')
  box.openRef.current = false
  await box.start()
  assert.equal(starts.length, 3, 'End/Close cannot schedule a later greeting')
  const failedBox = baseBox(), attempts = []
  Object.assign(failedBox, { liveVoiceEnabled: true, voiceRecordingSupported: true, checkingRealtimeVoice: false, realtimeVoiceAvailable: true, realtimeVoiceError: '', hasNativeRealtimeVoiceSupport: () => true, requestAiDataSharingPermission: async () => true, startHelfiRealtimeVoiceSession: async params => { attempts.push(params.greetOnConnect); if (attempts.length === 1) throw Error('Synthetic pre-connection failure'); params.callbacks.onConnectStage('microphone-sending'); return { stop: async () => {}, setMicrophoneMuted: noop, promptAssistant: noop, flushTranscript: noop } } })
  evaluate(failedBox, `globalThis.start = ${callback('startVoiceSession')}`)
  await failedBox.start(); await failedBox.start(); await failedBox.start()
  assert.deepEqual(attempts, [true, true, false], 'Failure before actual readiness must not consume the first welcome; a later connection retry cannot repeat a completed connection welcome')
}
async function draftRequest(text, response, realtime = true, overrides = {}) {
  const box = baseBox()
  const original = foodDraft()
  const bodies = []
  const saveOptions = []
  const traces = [], headers = [], turns = [], opened = []
  Object.assign(box, {
    draft: original, transcript: '', pendingFollowUpDraft: null, voiceReply: false,
    launchContext: { section: 'food', date: '2026-10-15', meal: 'snacks' }, requestConversationHistory: [],
    normalizeLaunchContext: (value) => value, todayLocalDate: () => '2026-10-15',
    followUpTranscript: () => null, isPendingFollowUpDraft: () => false,
    requestAiDataSharingPermission: async () => true, loadVoiceFavorites: async () => [],
    buildNativeAuthHeaders: () => ({}), makeConversationTurn: (role, text) => ({ role, text }),
    console: { info: (...values) => traces.push(values) },
    appendConversationTurns: value => turns.push(...value), openAppTargetRef: { current: value => opened.push(value) },
    fetch: async (_url, options) => { bodies.push(JSON.parse(options.body)); headers.push(options.headers); return {} },
    fetchNativeVoiceAssistant: async (factory) => { await factory('https://offline.invalid'); return { res: { ok: true }, data: response || { draft: original } } },
    saveDraft: async (_draft, options) => { saveOptions.push(options); return { success: true, result: { kind: 'food', id: 'synthetic-saved-food', message: 'Saved by synthetic server' } } },
    ...overrides,
  })
  evaluate(box, `${overrides.useActualSave ? `globalThis.saveDraft = ${callback('saveDraft')};` : ''}globalThis.run = ${callback('sendDraftRequest')}`)
  const result = await box.run({ transcriptOverride: text, suppressSpokenReply: !overrides.allowSpokenReply, realtimeActionHint: realtime ? { action: 'food_build_meal' } : undefined, ...overrides.requestOptions })
  return { original, bodies, saveOptions, result, traces, headers, turns, opened }
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
async function verifyPreferenceCompletionEvents() {
  for (const action of ['weekly_reports.update', 'coach_preferences.update']) for (const scenario of ['valid', 'account-before', 'account-after', 'end-after']) {
    const box=baseBox(),events=[],timers=[],notices=[],requests=[];let complete
    const draft={...foodDraft(),action:'preference_action',preferenceAction:{action,userId:'synthetic-owner',values:{enabled:false}}}
    Object.assign(box,{todayLocalDate:()=>draft.localDate,buildNativeAuthHeaders:()=>({}),DeviceEventEmitter:{emit:(name,payload)=>events.push({name,payload})},setTimeout:run=>timers.push(run),setSaveSuccessNotice:value=>notices.push(value),fetch:async(_url,options)=>{requests.push(JSON.parse(options.body));return new Promise(resolve=>{complete=resolve})},fetchNativeVoiceConfirm:factory=>factory('https://offline.invalid')})
    evaluate(box,`globalThis.run = ${callback('saveDraft')}`)
    if(scenario==='account-before')box.voiceAccountUserIdRef.current='other-owner'
    const pending=box.run(draft,{closeOnSuccess:false,voiceActionRunId:'synthetic-completion-53'})
    if(scenario!=='account-before'){
      if(scenario==='account-after')box.voiceAccountUserIdRef.current='other-owner'
      if(scenario==='end-after')box.realtimeVoiceRunRef.current++
      complete({res:{ok:true},data:{success:true,result:{kind:'preference_action',id:action,operation:'update',status:'saved',message:'Your setting change is saved and verified.'}}})
    }
    assert.equal(Boolean(await pending),scenario==='valid');assert.equal(notices.length,scenario==='valid'?1:0)
    if(scenario==='valid'){
      timers.forEach(run=>run())
      const refresh=events.filter(event=>event.name==='helfi:settings-changed');assert.equal(refresh.length,3)
      const target=events.find(event=>event.name==='helfi:navigate-native-web-tool').payload.nativeTarget
      assert.equal(action==='coach_preferences.update'?target.route:target.tab,action==='coach_preferences.update'?'SmartHealthCoach':'Settings')
      if(action==='coach_preferences.update')assert.equal(target.params.tab,'settings')
      for(const event of refresh){assert.equal(event.payload.source,'voice-assistant');assert.equal(event.payload.accountId,'synthetic-owner');assert.equal(event.payload.completionId,'synthetic-completion-53');assert.equal(event.payload.action,action);assert.equal(event.payload.kind,'preference_action');assert.deepEqual(JSON.parse(JSON.stringify(event.payload.values)),{enabled:false})}
      const count=events.length;box.voiceAccountUserIdRef.current='other-owner';timers.forEach(run=>run());assert.equal(events.length,count,'Delayed completion events cannot cross accounts')
    }else assert.equal(events.length,0)
    if(scenario==='account-before')assert.equal(requests.length,0)
  }
  console.log('PASS same-account exact preference completion fields, stable repeat ID, stale account/end refusal and delayed-event isolation')
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
  resolveResponse({ res: { ok: true }, data: { success: true, result: { kind: 'food', ids: ['synthetic-food'], message: 'Saved' } } })
  await pending
  assert.equal(box.voiceSaveRequestsRef.current, 0)
  assert.equal(notices.length, 1)
  assert.ok(events.some((event) => event.name === 'helfi:food-log-changed' && event.payload.localDate === '2026-10-14'))
  const failed = box.run(foodDraft(), { closeOnSuccess: false })
  resolveResponse({ res: { ok: false }, data: { error: 'Synthetic save failure' } })
  assert.equal(await failed, null)
  assert.equal(box.voiceSaveRequestsRef.current, 0)
  assert.equal(notices.length, 1, 'Failed save must not produce another success notice')
  for (const data of [{}, { success: false }, { success: true, result: { kind: 'food' } }, { success: true, result: { kind: 'unknown', id: 'synthetic-id' } }]) {
    const malformed = box.run(foodDraft(), { closeOnSuccess: false })
    resolveResponse({ res: { ok: true }, data })
    assert.equal(await malformed, null, 'An HTTP200 without a valid saved-entry receipt cannot claim a save')
    assert.equal(notices.length, 1)
  }
  box.closePanel = () => { assert.equal(box.voiceSaveRequestsRef.current, 0, 'A completed save must not be described as pending when closing its panel') }
  const closing = box.run(foodDraft())
  resolveResponse({ res: { ok: true }, data: { success: true, result: { kind: 'food', ids: ['synthetic-saved-food'], message: 'Saved' } } })
  assert.ok(await closing)
}
async function verifyConfirmBackendIsolation() {
  const actualFetch = functions.get('fetchNativeVoiceConfirm')
  assert(actualFetch, 'Actual confirmation transport helper must exist')
  for (const helperName of ['fetchNativeVoiceConfirm', 'fetchNativeVoiceAssistant', 'fetchNativeVoiceTts']) {
  const actualTransport = functions.get(helperName)
  assert(actualTransport, `Actual charged/mutating transport ${helperName} must exist`)
  for (const base of ['http://127.0.0.1:3000', 'https://helfi.ai']) {
    for (const status of [200, 400, 402, 404, 409, 500, 502, 503]) {
      const requests = [], response = { status, ok: status === 200, json: async () => ({ error: 'Exact configured-server reason', degraded: true }) }
      const box = { API_BASE_URL: base, __DEV__: true, VOICE_ACCESS_FALLBACK_API_BASE_URL: 'https://unexpected-live.invalid', shouldRetryVoiceAssistantOnLive: () => { throw Error('Confirmation must never consult fallback policy') } }
      vm.runInNewContext(ts.transpileModule(`${actualTransport}\nglobalThis.run = ${helperName}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, box)
      const result = await box.run(async url => { requests.push(url); return response })
      assert.deepEqual(requests, [base], `HTTP${status} ${helperName} sends once on ${base}; a possible first debit/write cannot be repeated`)
      assert.equal(result.res, response); assert.equal(result.data.error, 'Exact configured-server reason')
    }
    for (const error of [new Error('Exact connection failed after send'), Object.assign(new Error('Exact aborted request'), { name: 'AbortError' })]) {
      const requests = [], box = { API_BASE_URL: base }
      vm.runInNewContext(ts.transpileModule(`${actualTransport}\nglobalThis.run = ${helperName}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, box)
      await assert.rejects(box.run(async url => { requests.push(url); throw error }), value => value === error)
      assert.deepEqual(requests, [base], 'A lost response cannot trigger a second request after a possible write')
    }
    const requests = [], box = { API_BASE_URL: base }
    vm.runInNewContext(ts.transpileModule(`${actualTransport}\nglobalThis.run = ${helperName}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, box)
    const result = await box.run(async url => { requests.push(url); return { status: 500, ok: false, json: async () => { throw Error('Synthetic invalid JSON') } } })
    assert.deepEqual(requests, [base]); assert.equal(result.res.status, 500); assert.deepEqual(JSON.parse(JSON.stringify(result.data)), {})
  }
  }
  for (const scenario of ['500', 'network']) {
    const transport = { API_BASE_URL: 'http://127.0.0.1:3000' }
    vm.runInNewContext(ts.transpileModule(`${functions.get('fetchNativeVoiceAssistant')}\nglobalThis.run = fetchNativeVoiceAssistant`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, transport)
    const requests = []
    let possibleDebits = 0
    const result = await draftRequest('Log my coffee', null, false, { fetchNativeVoiceAssistant: transport.run, fetch: async (url) => {
      requests.push(url); possibleDebits++
      if (scenario === 'network') throw Error('Exact network failure after possible debit')
      return { ok: false, status: 500, json: async () => ({ error: 'Exact configured preparation failure after possible debit' }) }
    } })
    assert.equal(result.result.ok, false); assert.equal(requests.length, 1); assert.equal(possibleDebits, 1); assert.equal(result.saveOptions.length, 0)
    assert.equal(requests[0], 'http://127.0.0.1:3000/api/native-voice-assistant'); assert(result.result.message.includes('after possible debit'))
  }
  for (const scenario of ['500', 'network', 'success']) {
    const box = baseBox(), requests = [], errors = [], turns = [], notices = [], events = []
    let writes = 0
    Object.assign(box, { API_BASE_URL: 'http://127.0.0.1:3000', todayLocalDate: () => '2026-10-15', buildNativeAuthHeaders: () => ({}),
      fetch: async (url, options) => {
        requests.push({ url, options }); writes++ // Synthetic server committed before responding or losing its response.
        if (scenario === 'network') throw Error('Exact network result unavailable')
        return { ok: scenario === 'success', status: scenario === 'success' ? 200 : 500, json: async () => scenario === 'success' ? { success: true, result: { kind: 'food', ids: ['synthetic-once'], message: 'Saved once' } } : { error: 'Exact local failure; no old live fallback' } }
      }, setSaveError: value => errors.push(value), appendConversationTurns: values => turns.push(...values), setSaveSuccessNotice: value => notices.push(value), DeviceEventEmitter: { emit: (...value) => events.push(value) },
    })
    evaluate(box, `${actualFetch}\nglobalThis.run = ${callback('saveDraft')}`)
    const result = await box.run(foodDraft(), { closeOnSuccess: false })
    assert.equal(requests.length, 1); assert.equal(writes, 1, 'Actual save callback and transport cannot cause a second write after a possibly committed first request')
    assert.equal(requests[0].url, 'http://127.0.0.1:3000/api/native-voice-assistant-confirm'); assert.equal(requests[0].options.method, 'POST')
    assert.equal(box.voiceSaveRequestsRef.current, 0)
    if (scenario === 'success') { assert(result); assert.equal(notices.length, 1) }
    else {
      assert.equal(result, null); assert.equal(notices.length, 0); assert.equal(events.length, 0)
      const exact = scenario === '500' ? 'Exact local failure; no old live fallback' : 'Exact network result unavailable'
      assert.equal(errors.at(-1), exact); assert(turns.some(turn => turn.text.includes(exact)))
    }
  }
  console.log('PASS: actual preparation/speech/confirmation transports and draft/save callbacks send once only to configured local/production backend; HTTP errors, degraded data, invalid JSON, network loss and abort never retry live or repeat a possible debit/write, and exact server errors remain visible.')
}
async function verifyReviewSaveErrorLifecycle() {
  const original = foodDraft()
  for (const next of [{ ...original, reviewToken: 'synthetic-corrected-review' }, { ...original, reviewToken: 'synthetic-fresh-review' }, { ...original, canConfirm: false, reviewToken: undefined }]) {
    let error = 'Exact previous confirmation failure'
    const result = await draftRequest('change milk to 50 ml', { draft: next }, false, { draft: original, setSaveError: value => { error = value } })
    assert.equal(result.result.ok, true); assert.equal(error, '', 'Successfully accepted replacement draft clears an old review failure')
  }
  let error = 'Exact previous confirmation failure'
  await draftRequest('review the same draft', { draft: { ...original } }, false, { draft: original, setSaveError: value => { error = value } })
  assert.equal(error, 'Exact previous confirmation failure', 'The same signed failed review retains its error until a real retry')
  const failure = await draftRequest('change milk to 50 ml', null, false, { draft: original, setSaveError: value => { error = value }, fetchNativeVoiceAssistant: async () => ({ res: { ok: false }, data: { error: 'Synthetic preparation failed' } }) })
  assert.equal(failure.result.ok, false); assert.equal(error, 'Exact previous confirmation failure', 'Failed preparation does not erase the existing failed-review evidence')
  const pending = { current: null }
  const cancelled = await draftRequest('change milk to 50 ml', { draft: { ...original, reviewToken: 'synthetic-never-accepted' } }, false, { draft: original, draftRequestAbortRef: pending, setSaveError: value => { error = value }, loadVoiceFavorites: async () => { pending.current.abort(); return [] } })
  assert.equal(cancelled.result.ok, false); assert.equal(error, 'Exact previous confirmation failure', 'Aborted preparation cannot clear the existing review error')
  for (const ok of [true, false]) {
    const box = baseBox(), changed = []
    let bottleError = 'Exact previous bottle confirmation failure'
    Object.assign(box, { API_BASE_URL: 'https://offline.invalid', voiceImageAbortRef: { current: null }, launchContext: {}, normalizeLaunchContext: value => value, todayLocalDate: () => '2026-10-17',
      FormData: class { append() {} }, buildNativeAuthHeaders: () => ({}), voiceReply: false, setVisionChoicesOpen: noop,
      fetch: async () => ({ ok, json: async () => ok ? { draft: { ...original, reviewToken: 'synthetic-new-bottle-review' } } : { error: 'Synthetic bottle preparation failed' } }),
      setSaveError: value => { bottleError = value }, setDraft: value => changed.push(value),
    })
    evaluate(box, `globalThis.run = ${callback('submitHealthIntakeBottleImage')}`)
    await box.run('supplement', { uri: 'synthetic://bottle.jpg' })
    assert.equal(bottleError, ok ? '' : 'Exact previous bottle confirmation failure')
    assert.equal(changed.some(value => value?.reviewToken === 'synthetic-new-bottle-review'), ok)
  }
  console.log('PASS: successful replacement/correction/bottle reviews clear stale save errors; same signed review and failed/aborted preparation retain their actual confirmation error.')
}
async function verifySingleSpokenReplyRequest() {
  const note = `${'Complete journal note sentence. '.repeat(50)}EXACT FINAL NOTE.`
  const journal = { action: 'journal', canConfirm: true, localDate: '2026-10-17', journal: { journalType: 'health', content: note }, confirmationMessage: 'Short server summary only.' }
  for (const mode of ['typed-spoken', 'recorded-audio', 'live', 'typed-text']) {
    const spoken = [], forms = []
    const result = await draftRequest('Write my exact journal note', { draft: journal }, mode === 'live', {
      voiceReply: mode !== 'typed-text', allowSpokenReply: mode !== 'live', requestVoiceReply: async text => spoken.push(text),
      ...(mode === 'recorded-audio' ? {
        FormData: class { fields = new Map(); append(key, value) { this.fields.set(key, value) } }, audioMimeFromUri: () => 'audio/m4a',
        requestOptions: { audioUri: 'synthetic://note.m4a', durationMillis: 1000 },
        fetch: async (_url, options) => { forms.push(options.body); return {} },
      } : {}),
    })
    assert.equal(result.result.ok, true)
    if (mode === 'recorded-audio') assert.equal(forms[0].fields.get('voiceReply'), 'false', 'Audio form never purchases an unused embedded reply')
    else assert.equal(result.bodies[0].voiceReply, false, 'Typed/live preparation never purchases unused embedded audio')
    assert.equal(spoken.length, ['typed-spoken', 'recorded-audio'].includes(mode) ? 1 : 0)
    if (spoken.length) { assert(spoken[0].includes(note)); assert(spoken[0].endsWith('Would you like me to save that for you?')) }
  }
  console.log('PASS: spoken typed/audio requests prepare with voiceReply=false and request exactly one complete standalone review; live/text preparation purchases no unused embedded speech.')
}
async function verifyRecipeImportClient() {
  const owner = 'synthetic-recipe-owner'
  const draft = { action: 'recipe_import_url', transcript: 'Import https://recipes.example/meal', localDate: '2026-10-17', summary: 'Import recipe', confirmationMessage: 'Import this recipe link for 10 credits? I will show the imported recipe for review before saving any food.', canConfirm: true, reviewToken: 'synthetic-import-review', recipeImport: { userId: owner, url: 'https://recipes.example/meal', costCredits: 10 } }
  const next = { action: 'recipe', transcript: draft.transcript, localDate: draft.localDate, summary: 'Imported chicken recipe', confirmationMessage: 'This makes four servings. Would you like to save the recipe, or log the servings you ate? Nothing has been saved.', canConfirm: false, autoSave: false, recipe: { text: 'Chicken recipe\nYield: four servings\n200 g chicken\nCook thoroughly.', importDraft: { title: 'Chicken recipe', servings: 4, ingredients: ['200 g chicken'], steps: ['Cook thoroughly.'] } } }
  const imported = { success: true, result: { kind: 'recipe_import', status: 'imported_not_saved', saved: false, actionId: 'synthetic-import-receipt', costCredits: 10, message: 'Recipe imported for review. No food diary entry or saved recipe has been created.', nextRecipeDraft: next } }
  for (const [current, handoff, labels] of [[draft, false, ['Import recipe · 10 credits', "Don't import"]], [foodDraft(), false, ['Save this', "Don't save"]], [{ appTarget: { buttonLabel: 'Open Reports' } }, true, ['Open Reports', 'Cancel']]]) {
    const footer = vm.createContext({ draft: current, primaryFooterIsHandoff: handoff })
    vm.runInContext(ts.transpileModule(`globalThis.labels = [${footerExpressions.get('primaryFooterLabel')}, ${footerExpressions.get('discardFooterLabel')}]`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, footer)
    assert.deepEqual(JSON.parse(JSON.stringify(footer.labels)), labels, 'Actual footer keeps distinct handoff, save and paid-import consent wording')
  }
  function setup(response = imported) {
    const box = baseBox(), requests = [], turns = [], events = [], notices = [], drafts = [], pending = [], credits = [], closed = []
    let resolve
    Object.assign(box, { voiceMemoryUserId: owner, voiceAccountUserIdRef: { current: owner }, todayLocalDate: () => draft.localDate, buildNativeAuthHeaders: () => ({}), DeviceEventEmitter: { emit: (...value) => events.push(value) },
      fetch: async (_, options) => { requests.push(JSON.parse(options.body)); return new Promise(done => { resolve = done }) }, fetchNativeVoiceConfirm: async factory => factory('https://offline.invalid'),
      appendConversationTurns: value => turns.push(...value), setSaveSuccessNotice: value => notices.push(value), setDraft: value => drafts.push(value), setPendingFollowUpDraft: value => pending.push(value), setChargedCredits: value => credits.push(value), closePanel: () => closed.push(true),
    })
    evaluate(box, `globalThis.save = ${callback('saveDraft')}`)
    return { box, requests, turns, events, notices, drafts, pending, credits, closed, resolve: (data = response) => resolve({ res: { ok: true }, data }) }
  }
  for (const replay of [false, true]) {
    const state = setup({ ...imported, idempotentReplay: replay })
    const running = state.box.save(draft)
    assert.equal(await state.box.save(draft), null, 'One pending import prevents a duplicate paid confirmation')
    state.resolve(); const data = await running
    assert.ok(data); assert.equal(state.requests.length, 1); assert.equal(state.box.voiceSaveRequestsRef.current, 0)
    assert.equal(state.drafts[0].action, 'recipe'); assert.equal(state.pending[0].recipe.importDraft.servings, 4); assert.deepEqual(state.credits, [10])
    assert.equal(state.events.length, 0); assert.equal(state.notices.length, 0); assert.equal(state.closed.length, 0)
    assert(state.turns[0].text.includes('No food diary entry or saved recipe has been created.') && state.turns[0].text.includes('200 g chicken') && state.turns[0].text.includes('Would you like to save the recipe'))
    assert(state.box.reviewPromptForDraft(draft).includes(draft.recipeImport.url))
    assert(state.box.spokenReviewPromptForDraft(draft).includes('10 credits?'))
    const result = state.box.confirmationRequestResult(data, draft, 'synthetic-action')
    assert.equal(result.ok, true); assert.equal(result.saved, false); assert.equal(result.status, 'needs_clarification')
    const tool = state.box.realtimeToolResult(result)
    assert.equal(tool.safeToClaimSaved, false); assert(tool.spokenReply.includes(next.confirmationMessage), 'Recipe continuation must keep its actual destination/portion question')
    const body = await draftRequest('log two servings', { draft: next }, false, { draft: next, pendingFollowUpDraft: next, isPendingFollowUpDraft: state.box.isPendingFollowUpDraft })
    assert.equal(body.bodies[0].followUpDraft.recipe.importDraft.servings, 4, 'Clarification retains complete imported recipe through the normal app brain')
  }
  const ready = { ...foodDraft(), localDate: draft.localDate, transcript: draft.transcript, recipe: next.recipe, autoSave: false }
  const state = setup({ ...imported, result: { ...imported.result, nextRecipeDraft: ready } })
  const importing = state.box.save(draft); state.resolve(); const data = await importing
  const result = state.box.confirmationRequestResult(data, draft, 'synthetic-action')
  assert.equal(result.saved, false); assert.equal(result.needsReview, true); assert.equal(result.status, 'review_draft'); assert(result.reviewPrompt.endsWith('Would you like me to save that for you?'))
  assert.equal(state.requests.length, 1); assert.equal(state.events.length, 0)
  const saving = state.box.save(ready, { closeOnSuccess: false }); state.resolve({ success: true, result: { kind: 'food', ids: ['synthetic-food-after-import'], message: 'Food saved after a separate review.' } }); await saving
  assert.equal(state.requests.length, 2, 'Only the separate second confirmation may save the reviewed recipe food')
  assert(state.events.some(([name]) => name === 'helfi:food-log-changed')); assert.equal(state.notices.length, 1)
  for (const patch of [{ saved: true }, { status: 'saved' }, { costCredits: 9 }, { actionId: '' }, { nextRecipeDraft: null }, { nextRecipeDraft: { ...ready, reviewToken: '' } }, { nextRecipeDraft: { ...next, localDate: '2026-10-16' } }, { nextRecipeDraft: { ...next, autoSave: true } }, { nextRecipeDraft: { ...next, recipe: {} } }]) {
    const invalid = setup({ ...imported, result: { ...imported.result, ...patch } })
    const running = invalid.box.save(draft); invalid.resolve(); assert.equal(await running, null)
    assert.equal(invalid.events.length, 0); assert.equal(invalid.notices.length, 0); assert.equal(invalid.drafts.length, 0)
  }
  for (const reason of ['account-before', 'account-after', 'end', 'run', 'abort']) {
    const stale = setup(), controller = new AbortController()
    if (reason === 'account-before') stale.box.voiceAccountUserIdRef.current = 'other-owner'
    const running = stale.box.save(draft, { signal: controller.signal })
    if (reason === 'account-before') { assert.equal(await running, null); assert.equal(stale.requests.length, 0); continue }
    if (reason === 'account-after') stale.box.voiceAccountUserIdRef.current = 'other-owner'
    if (reason === 'end') stale.box.openRef.current = false
    if (reason === 'run') stale.box.realtimeVoiceRunRef.current++
    if (reason === 'abort') controller.abort()
    stale.resolve(); assert.equal(await running, null); assert.equal(stale.drafts.length, 0); assert.equal(stale.turns.length, 0); assert.equal(stale.events.length, 0)
  }
  const request = await draftRequest('yes', {}, false, { draft, saveDraft: async () => imported })
  assert.equal(request.result.saved, false); assert.equal(request.result.status, 'needs_clarification'); assert.equal(request.result.ok, true)
  const interpreted = await draftRequest('please import that link', { confirmNow: true, draft }, false, { draft, saveDraft: async () => imported })
  assert.equal(interpreted.result.saved, false); assert.equal(interpreted.result.status, 'needs_clarification')
  console.log('PASS: recipe imports review 10 credits, require exact imported-not-saved receipts, keep full next recipe context and separate save consent, never refresh/close/claim save on import, and ignore duplicate/account/End/abort responses.')
}
async function verifySupportAndReportClient() {
  const owner = 'synthetic-action-owner'
  const exactText = `Exact support message start ${'Keep these exact reviewed words. '.repeat(180)} EXACT SUPPORT MESSAGE END`
  const review = `Send a new support ticket: Exact reviewed subject with this exact text: “${exactText}”. Closing this chat may request a transcript email. Would you like me to confirm this action?`
  const supportDraft = action => ({ action: 'support_action', transcript: 'Send support my exact message', localDate: '2026-10-17', summary: 'Support review', confirmationMessage: review, canConfirm: true, reviewToken: 'synthetic-support-review', supportAction: { action, userId: owner, ...(action === 'support.create' ? {} : { ticketId: 'selected-ticket' }), payload: { message: exactText, subject: 'Exact reviewed subject' } } })
  const reportDraft = { action: 'report_action', transcript: 'Create my weekly report', localDate: '2026-10-17', summary: 'Request weekly report', confirmationMessage: 'Request a weekly report. At least 400 credits must be available. Final charges use actual usage, not a fixed fee. This turns on weekly reports. Would you like me to request it?', canConfirm: true, reviewToken: 'synthetic-report-review', reportAction: { action: 'reports.weekly.generate', userId: owner } }
  const supportResult = action => ({ success: true, result: { kind: 'support_action', action, id: action === 'support.create' ? 'created-ticket' : 'selected-ticket', status: 'completed', actionId: 'synthetic-support-receipt', message: action === 'support.delete' ? 'The selected support ticket was deleted.' : action === 'support.end_chat' ? 'The selected support chat was closed. Email delivery is not verified.' : 'The reviewed support action was saved. Email delivery is not verified.' } })
  const reportResult = reportStatus => ({ success: true, result: { kind: 'report_action', action: 'reports.weekly.generate', actionId: 'synthetic-report-receipt', reportId: 'actual-report-id', reportStatus, status: reportStatus === 'RUNNING' ? 'preparing' : 'requested', generated: false, unlocked: false, emailDeliveryVerified: false, message: reportStatus === 'LOCKED' ? 'The report request is recorded, but the report is locked. Please review Billing.' : reportStatus === 'RUNNING' ? 'Your report request is recorded and is being prepared.' : 'Your report request is recorded. The report service reports its status as ready.' } })
  function setup() {
    const box = baseBox(), events = [], turns = [], notices = [], drafts = [], requests = [], closed = []
    let resolve
    Object.assign(box, { voiceMemoryUserId: owner, voiceAccountUserIdRef: { current: owner }, buildNativeAuthHeaders: () => ({}), DeviceEventEmitter: { emit: (...event) => events.push(event) },
      fetch: async (_url, options) => { requests.push(JSON.parse(options.body)); return new Promise(done => { resolve = done }) }, fetchNativeVoiceConfirm: async factory => factory('https://offline.invalid'),
      appendConversationTurns: value => turns.push(...value), setSaveSuccessNotice: value => notices.push(value), setDraft: value => drafts.push(value), closePanel: () => { assert.equal(box.voiceSaveRequestsRef.current, 0); closed.push(true) },
    })
    evaluate(box, `globalThis.save = ${callback('saveDraft')}`)
    return { box, events, turns, notices, drafts, requests, closed, resolve: data => resolve({ res: { ok: true }, data }) }
  }
  const probe = setup().box
  for (const prompt of [probe.reviewPromptForDraft(supportDraft('support.create')), probe.spokenReviewPromptForDraft(supportDraft('support.create'))]) assert.equal(prompt, review, 'Support review must keep full exact message, subject, side effects and final question beyond500/4000chars')
  const spoken = probe.realtimeToolResult({ ok: true, action: 'support_action', needsReview: true, status: 'review_draft', reviewPrompt: review })
  assert.equal(spoken.spokenReply, review.replace(/\s+/g, ' ').trim(), 'Spoken support review preserves every word and the final question without truncation'); assert.equal(spoken.safeToClaimSaved, false)
  assert.equal(probe.reviewPromptForDraft(reportDraft), reportDraft.confirmationMessage)
  for (const draft of [supportDraft('support.create'), reportDraft]) {
    const footer = vm.createContext({ draft, primaryFooterIsHandoff: false })
    vm.runInContext(ts.transpileModule(`globalThis.labels = [${footerExpressions.get('primaryFooterLabel')}, ${footerExpressions.get('discardFooterLabel')}]`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, footer)
    assert.deepEqual(JSON.parse(JSON.stringify(footer.labels)), [draft.action === 'support_action' ? 'Confirm support action' : 'Request report', 'Cancel'])
  }
  assert(source.includes('accessibilityLabel={primaryFooterLabel} onPress={() => void confirmDraft()}') && source.includes('style={styles.voiceReviewSaveText}>{primaryFooterLabel}'), 'Live fallback uses the same actual import/action consent label as the typed footer')
  const cases = ['support.create', 'support.reply', 'support.end_chat', 'support.feedback', 'support.delete'].map(action => [supportDraft(action), supportResult(action)])
  cases.push(...['READY', 'RUNNING', 'LOCKED'].map(status => [reportDraft, reportResult(status)]))
  for (const [draft, data] of cases) {
    const state = setup(), running = state.box.save(draft)
    assert.equal(await state.box.save(draft), null)
    state.resolve(data); assert.ok(await running); assert.equal(state.requests.length, 1)
    const outcome = state.box.confirmationRequestResult(data, draft, 'synthetic-action')
    assert.equal(outcome.ok, true); assert.equal(outcome.saved, false); assert.equal(state.box.realtimeToolResult(outcome).safeToClaimSaved, false)
    assert.equal(state.events.filter(([name]) => name === 'helfi:voice-action-saved').length, 0)
    const completed = state.events.find(([name]) => name === 'helfi:voice-action-completed')[1]
    assert.equal(completed.accountId, owner); assert.equal(completed.source, 'voice-assistant'); assert.equal(completed.kind, draft.action); assert.equal(completed.action, data.result.action); assert.equal(typeof completed.completionId, 'string'); assert(completed.completionId)
    if (draft.action === 'support_action') assert.equal(completed.ticketId, data.result.id)
    const target = state.events.find(([name]) => name === 'helfi:navigate-native-web-tool')[1]
    assert.equal(draft.action === 'support_action' ? target.nativeTarget.route : target.nativeTarget.tab, draft.action === 'support_action' ? 'Support' : 'Insights')
    assert.equal(state.notices[0].title, draft.action === 'support_action' ? 'Support action completed' : 'Report requested')
    assert(!/email (?:was )?(?:delivered|sent)|report (?:was )?(?:generated|unlocked|saved)/i.test(state.turns[0].text))
    assert.equal(state.closed.length, 1); assert.equal(state.drafts[0], null)
    const typed = await draftRequest('yes', {}, false, { draft, saveDraft: async () => data })
    assert.equal(typed.result.ok, true); assert.equal(typed.result.saved, false)
  }
  const invalidCases = [
    ...[{ id: 'wrong-ticket' }, { action: 'support.delete' }, { status: 'pending' }, { id: '' }, { actionId: '' }, { message: 'Your email was delivered.' }, { saved: true }].map(patch => [supportDraft('support.reply'), { ...supportResult('support.reply'), result: { ...supportResult('support.reply').result, ...patch } }]),
    ...[{ reportId: '' }, { actionId: '' }, { action: 'reports.unlock' }, { reportStatus: 'FAILED' }, { generated: true }, { unlocked: true }, { emailDeliveryVerified: true }, { status: 'requested' }, { message: 'Your report was generated and emailed.' }].map(patch => [reportDraft, { ...reportResult('RUNNING'), result: { ...reportResult('RUNNING').result, ...patch } }]),
  ]
  for (const [draft, data] of invalidCases) {
    const state = setup(), running = state.box.save(draft); state.resolve(data)
    assert.equal(await running, null); assert.equal(state.notices.length, 0); assert.equal(state.events.length, 0)
  }
  for (const draft of [supportDraft('support.reply'), reportDraft]) for (const reason of ['account-before', 'account-after', 'end', 'run', 'abort']) {
    const state = setup(), controller = new AbortController()
    if (reason === 'account-before') state.box.voiceAccountUserIdRef.current = 'another-owner'
    const running = state.box.save(draft, { signal: controller.signal })
    if (reason === 'account-before') { assert.equal(await running, null); assert.equal(state.requests.length, 0); continue }
    if (reason === 'account-after') state.box.voiceAccountUserIdRef.current = 'another-owner'
    if (reason === 'end') state.box.openRef.current = false
    if (reason === 'run') state.box.realtimeVoiceRunRef.current++
    if (reason === 'abort') controller.abort()
    state.resolve(draft.action === 'support_action' ? supportResult('support.reply') : reportResult('RUNNING'))
    assert.equal(await running, null); assert.equal(state.events.length, 0); assert.equal(state.turns.length, 0); assert.equal(state.notices.length, 0)
  }
  const pending = { ...supportDraft('support.reply'), canConfirm: false, confirmationMessage: 'Which exact support subject?' }
  assert(probe.isPendingFollowUpDraft(pending))
  const selection = await draftRequest('Exact subject', { draft: pending }, false, { draft: pending, pendingFollowUpDraft: pending })
  assert.equal(selection.bodies[0].followUpDraft.supportAction.payload.message, exactText)
  console.log('PASS: support/report reviews retain full exact messages, subject, side effects and charges; exact account-bound receipts navigate normal screens without claiming saved/generated/unlocked reports or delivered email; malformed/duplicate/late outcomes remain unconfirmed.')
}
async function verifyReviewedRecordChanges() {
  const expectedEvents = { food: 'helfi:food-log-changed', water: 'helfi:food-log-changed', exercise: 'helfi:food-log-changed', favorite: 'helfi:food-log-changed', custom_food: 'helfi:food-log-changed', mood: 'helfi:mood-log-changed', journal: 'helfi:health-journal-changed', mood_journal: 'helfi:mood-journal-changed' }
  for (const [entity, eventName] of Object.entries(expectedEvents)) {
    const box = baseBox(), events = [], notices = []
    const draft = { ...foodDraft(), action: 'record_action', recordAction: { operation: 'delete', entity, id: 'synthetic-record', localDate: '2026-10-14' } }
    Object.assign(box, {
      todayLocalDate: () => '2026-10-15', buildNativeAuthHeaders: () => ({}),
      DeviceEventEmitter: { emit: (name, payload) => events.push({ name, payload }) },
      fetch: async () => ({ res: { ok: true }, data: { success: true, result: { kind: 'record_action', id: 'synthetic-record', operation: 'delete', entity, message: 'Synthetic record deleted.' } } }),
      fetchNativeVoiceConfirm: factory => factory('https://offline.invalid'), setSaveSuccessNotice: value => notices.push(value),
    })
    evaluate(box, `globalThis.save = ${callback('saveDraft')}`)
    assert.ok(await box.save(draft, { closeOnSuccess: false }))
    assert.equal(notices[0].message, 'Synthetic record deleted.')
    assert.ok(events.some(event => event.name === eventName && event.payload.localDate === '2026-10-14'))
    assert.ok(events.some(event => event.name === 'helfi:navigate-native-web-tool'))
    assert.equal(box.isConfirmedVoiceSave({ success: true, result: { kind: 'record_action', id: 'synthetic-record', operation: 'pretend', entity } }, 'record_action'), false)
  }
}
async function verifyAdditionalRecordedActions() {
  const owner = 'synthetic-owner'
  for (const entity of ['symptom_note', 'supplement', 'medication']) for (const operation of entity === 'symptom_note' ? ['delete'] : ['update', 'delete']) {
    const draft = { ...foodDraft(), action: 'record_action', recordAction: { id: 'synthetic-record', entity, operation, localDate: '2026-10-17', timeZone: 'Australia/Melbourne', ownerId: entity === 'symptom_note' ? undefined : owner, beforeHash: 'synthetic-stale-proof', changes: operation === 'delete' ? {} : { timing: ['Morning'] } } }
    const message = entity === 'symptom_note' ? 'Deleted the reviewed symptom note record.' : `${operation === 'delete' ? 'Removed' : 'Corrected'} the item in your recorded ${entity} list.`
    const receipt = { success: true, result: { kind: 'record_action', entity, operation, id: 'synthetic-record', message } }
    for (const scenario of ['valid', 'clinical-message', 'wrong-verb', 'wrong-id', 'account-before', 'account-after', 'end-after']) {
      const box = baseBox(), events = [], notices = [], requests = [], timers = []
      let complete
      Object.assign(box, { voiceMemoryUserId: owner, voiceAccountUserIdRef: { current: owner }, todayLocalDate: () => '2026-10-17', buildNativeAuthHeaders: () => ({}), DeviceEventEmitter: { emit: (name, value) => events.push({ name, value }) },
        setSaveSuccessNotice: value => notices.push(value), setTimeout: run => timers.push(run),
        fetch: async (_url, options) => { requests.push(JSON.parse(options.body)); return new Promise(resolve => { complete = resolve }) }, fetchNativeVoiceConfirm: factory => factory('https://offline.invalid'),
      })
      evaluate(box, `globalThis.save = ${callback('saveDraft')}`)
      if (scenario === 'account-before') box.voiceAccountUserIdRef.current = 'different-account'
      const pending = box.save(draft, { closeOnSuccess: false })
      if (scenario !== 'account-before') {
        const data = JSON.parse(JSON.stringify(receipt))
        if (scenario === 'clinical-message') data.result.message = 'Stop taking that medication now.'
        if (scenario === 'wrong-id') data.result.id = 'different-record'
        if (scenario === 'wrong-verb') data.result.operation = operation === 'delete' ? 'update' : 'delete'
        if (scenario === 'account-after') box.voiceAccountUserIdRef.current = 'different-account'
        if (scenario === 'end-after') box.realtimeVoiceRunRef.current++
        complete({ res: { ok: true }, data })
      }
      assert.equal(Boolean(await pending), scenario === 'valid')
      assert.equal(notices.length, scenario === 'valid' ? 1 : 0)
      if (scenario === 'valid') {
        assert.equal(requests[0].draft.recordAction.beforeHash, draft.recordAction.beforeHash)
        const eventName = entity === 'symptom_note' ? 'helfi:symptom-notes-changed' : 'helfi:health-intake-changed'
        assert.ok(events.some(event => event.name === eventName))
        const navigation = events.find(event => event.name === 'helfi:navigate-native-web-tool').value
        assert.equal(navigation.nativeTarget.route, entity === 'symptom_note' ? 'SymptomNotes' : 'NativeWebTool')
        if (entity === 'symptom_note') assert.equal(navigation.nativeTarget.params.initialTab, 'history')
        else assert.match(navigation.nativeTarget.params.path, /^\/onboarding\?step=6&voiceActionNonce=/)
        const count = events.length
        box.voiceAccountUserIdRef.current = 'different-account'; timers.forEach(run => run())
        assert.equal(events.length, count)
      } else assert.equal(events.length, 0)
      if (scenario === 'account-before') assert.equal(requests.length, 0)
    }
    const correction = await draftRequest('actually correct that recorded timing to morning', { draft }, false, { draft })
    assert.equal(correction.bodies[0].confirmationDraft.recordAction.id, draft.recordAction.id)
    assert.deepEqual(correction.bodies[0].confirmationDraft.recordAction.changes, draft.recordAction.changes)
    const pendingDraft = { ...draft, canConfirm: false }
    const clarification = await draftRequest('the second recorded entry', { draft: pendingDraft }, false, { draft: pendingDraft, pendingFollowUpDraft: pendingDraft })
    assert.equal(clarification.bodies[0].followUpDraft.recordAction.entity, entity)
    assert.equal(clarification.result.status, 'needs_clarification')
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../native/src/screens/SymptomNotesScreen.tsx'), 'utf8')
  const file = ts.createSourceFile('SymptomNotesScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let historyCallback, listenerEffect
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'loadHistory') historyCallback = node.initializer.arguments[0].getText(file)
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect' && node.arguments[0].getText(file).includes("addListener('helfi:symptom-notes-changed'")) listenerEffect = node.arguments[0].getText(file)
    ts.forEachChild(node, visit)
  }
  visit(file)
  const received = [], loading = [], completions = []
  const state = { authHeaders: {}, API_BASE_URL: 'https://offline.invalid', historyLoadRunRef: { current: 0 }, historyAccountRef: { current: 'synthetic-owner' }, fetch: () => new Promise(resolve => completions.push(resolve)), setHistoryItems: rows => received.push(rows), setHistoryError: noop, setHistoryLoading: value => loading.push(value) }
  vm.createContext(state)
  vm.runInContext(ts.transpileModule(`globalThis.load = ${historyCallback}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state)
  const old = state.load(), latest = state.load()
  completions[0]({ ok: true, json: async () => ({ history: [{ id: 'older' }] }) }); await old
  assert.equal(received.length, 0); assert.equal(loading.filter(value => value === false).length, 0)
  completions[1]({ ok: true, json: async () => ({ history: [{ id: 'current' }] }) }); await latest
  assert.equal(received[0][0].id, 'current')
  const oldAccount = state.load(); state.historyAccountRef.current = 'another-account'
  completions[2]({ ok: true, json: async () => ({ history: [{ id: 'private-old-account' }] }) }); await oldAccount
  assert.equal(received.length, 1)
  let listener, loads = 0, tab = ''
  Object.assign(state, { loadHistory: () => { loads++ }, setActiveTab: value => { tab = value }, DeviceEventEmitter: { addListener: (_name, run) => { listener = run; return { remove: noop } } } })
  vm.runInContext(ts.transpileModule(`globalThis.cleanup = (${listenerEffect})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state)
  listener(); assert.equal(tab, 'history'); assert.equal(loads, 1)
  state.cleanup(); listener(); assert.equal(loads, 1)
  console.log('PASS: symptom deletion and recorded intake corrections require exact factual receipts, retain review context, isolate account/End responses and refresh the appropriate existing history/list screen.')
}
async function verifyNotificationClient() {
  const owner = 'synthetic-owner'
  const actions = ['notifications.mark_read', 'notifications.delete', 'notifications.mark_all_visible_read', 'notifications.delete_all_visible']
  const prepared = action => ({ ...foodDraft(), action: 'notification_action', notificationAction: { action, userId: owner, ids: ['notification-a', 'notification-b'], beforeHash: 'synthetic-reviewed-hash', preparedAt: Date.now() } })
  const receipt = action => ({ success: true, result: { kind: 'notification_action', id: action, saved: true, status: 'saved', entity: 'notification', operation: action.includes('delete') ? 'delete' : 'update', ids: ['notification-b', 'notification-a'], message: 'Two reviewed notifications changed and checked.' } })
  function harness(data) {
    const box = baseBox(), events = [], notices = [], errors = [], timers = [], requests = []
    Object.assign(box, {
      voiceMemoryUserId: owner, voiceAccountUserIdRef: { current: owner }, todayLocalDate: () => '2026-10-17', buildNativeAuthHeaders: () => ({}),
      DeviceEventEmitter: { emit: (name, payload) => events.push({ name, payload }) }, setTimeout: callback => timers.push(callback),
      fetch: async (_url, options) => { requests.push(JSON.parse(options.body)); return { res: { ok: true }, data } },
      fetchNativeVoiceConfirm: factory => factory('https://offline.invalid'), setSaveSuccessNotice: value => notices.push(value), setSaveError: value => errors.push(value),
    })
    evaluate(box, `globalThis.save = ${callback('saveDraft')}`)
    return { box, events, notices, errors, timers, requests }
  }
  for (const action of actions) {
    const { box, events, notices, timers, requests } = harness(receipt(action))
    assert.ok(await box.save(prepared(action), { closeOnSuccess: false }))
    assert.equal(requests[0].draft.notificationAction.action, action)
    assert.equal(notices.length, 1)
    assert.ok(events.some(event => event.name === 'helfi:notifications-inbox-changed'))
    assert.ok(events.some(event => event.name === 'helfi:navigate-native-web-tool' && event.payload.nativeTarget.route === 'NotificationsInbox'))
    const count = events.length
    box.voiceAccountUserIdRef.current = 'different-owner'
    timers.forEach(run => run())
    assert.equal(events.length, count, 'Delayed notification refresh cannot reach a different account')
  }
  const valid = receipt(actions[0])
  for (const changes of [
    { saved: false }, { status: 'not_saved' }, { status: 'review_again' }, { entity: 'food' }, { operation: 'delete' },
    { id: 'notifications.unknown' }, { id: 'notifications.mark_all_visible_read' },
    { ids: [] }, { ids: ['notification-a'] }, { ids: ['notification-a', 'unknown'] }, { ids: ['notification-a', 'notification-a'] }, { message: '' },
  ]) {
    const { box, events, notices, errors } = harness({ success: true, result: { ...valid.result, ...changes } })
    assert.equal(await box.save(prepared(actions[0]), { closeOnSuccess: false }), null)
    assert.equal(events.length, 0, 'Malformed or partial inbox receipts cannot navigate or emit success')
    assert.equal(notices.length, 0)
    assert.match(errors.at(-1), /inbox/)
  }
  const { box: stale, requests: lateRequests } = harness(valid)
  stale.voiceAccountUserIdRef.current = 'another-account'
  assert.equal(await stale.save(prepared(actions[0]), { closeOnSuccess: false }), null)
  assert.equal(lateRequests.length, 0, 'An old account review cannot dispatch a notification mutation')
  for (const reason of ['account', 'end']) {
    const { box, events, notices } = harness(valid)
    let finish
    box.fetch = async () => new Promise(resolve => { finish = resolve })
    const pending = box.save(prepared(actions[0]), { closeOnSuccess: false })
    if (reason === 'account') box.voiceAccountUserIdRef.current = 'another-account'
    else box.realtimeVoiceRunRef.current++
    finish({ res: { ok: true }, data: valid })
    assert.equal(await pending, null)
    assert.equal(events.length, 0, `A notification receipt after ${reason} cannot affect the current UI`)
    assert.equal(notices.length, 0)
  }
  const pendingDraft = { ...prepared(actions[0]), canConfirm: false }
  const followup = await draftRequest('the second notification please', { draft: pendingDraft }, false, { draft: pendingDraft, pendingFollowUpDraft: pendingDraft })
  assert.equal(followup.bodies[0].followUpDraft.notificationAction.action, actions[0])
  assert.equal(followup.result.status, 'needs_clarification')
  const confirmed = await draftRequest('yes', { draft: prepared(actions[0]) }, false, { draft: prepared(actions[0]) })
  assert.equal(confirmed.saveOptions.length, 1)

  const inboxSource = fs.readFileSync(path.resolve(__dirname, '../native/src/screens/NotificationInboxScreen.tsx'), 'utf8')
  const ast = ts.createSourceFile('NotificationInboxScreen.tsx', inboxSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let effect, inboxLoad, focusEffect
  function find(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes("addListener('helfi:notifications-inbox-changed'")) effect = node.arguments[0].getText(ast)
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadInbox') inboxLoad = node.initializer.arguments[0].getText(ast)
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useFocusEffect') focusEffect = node.arguments[0].arguments[0].getText(ast)
    ts.forEachChild(node, find)
  }
  find(ast)
  assert.ok(effect)
  let listener, loads = 0, removed = 0
  const state = { DeviceEventEmitter: { addListener: (_name, callback) => { listener = callback; return { remove: () => { removed++ } } } }, loadInbox: () => { loads++ } }
  vm.createContext(state)
  vm.runInContext(ts.transpileModule(`globalThis.cleanup = (${effect})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state)
  listener(); assert.equal(loads, 1, 'The existing normal authenticated inbox reload runs after voice success')
  state.cleanup(); listener(); assert.equal(loads, 1, 'A queued old listener cannot reload after account/unmount cleanup')
  assert.equal(removed, 1)
  for (const order of ['old-first', 'new-first', 'old-error']) {
    const requests = [], received = [], loading = [], errors = []
    const state = {
      mode: 'signedIn', authHeaders: { authorization: 'Bearer synthetic' }, API_BASE_URL: 'https://offline.invalid',
      inboxLoadRunRef: { current: 0 }, inboxAccountRef: { current: 'synthetic-account-a' },
      fetch: () => new Promise(resolve => requests.push(resolve)),
      setLoading: value => loading.push(value), setItems: value => received.push(value), setError: value => errors.push(value), setSelectedIds: noop,
    }
    vm.createContext(state)
    vm.runInContext(ts.transpileModule(`globalThis.load = ${inboxLoad}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state)
    const older = state.load(), newer = state.load()
    const finishOld = async () => { requests[0]({ ok: order !== 'old-error', json: async () => order === 'old-error' ? { error: 'old response failed' } : { items: [{ id: 'old' }] } }); await older }
    const finishNew = async () => { requests[1]({ ok: true, json: async () => ({ items: [{ id: 'new' }] }) }); await newer }
    if (order === 'new-first') { await finishNew(); await finishOld() }
    else {
      await finishOld()
      assert.equal(received.length, 0)
      assert.equal(loading.filter(value => value === false).length, 0, 'A superseded response cannot stop the latest loading indicator')
      await finishNew()
    }
    assert.equal(received.length, 1); assert.equal(received[0][0].id, 'new')
    assert.equal(errors.filter(Boolean).length, 0, 'A superseded failure cannot replace the current inbox with an error')
    assert.equal(loading.filter(value => value === false).length, 1)
    const priorCount = received.length, priorLoading = loading.length
    const oldAccount = state.load()
    state.inboxAccountRef.current = 'synthetic-account-b'
    requests[2]({ ok: true, json: async () => ({ items: [{ id: 'private-old-account' }] }) }); await oldAccount
    assert.equal(received.length, priorCount, 'An old account response cannot show its inbox in the current account')
    assert.equal(loading.length, priorLoading + 1, 'An old account response cannot update current loading state')
    state.loadInbox = state.load
    vm.runInContext(ts.transpileModule(`globalThis.unfocus = (${focusEffect})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state)
    state.unfocus()
    requests[3]({ ok: true, json: async () => ({ items: [{ id: 'after-unfocus' }] }) })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(received.length, priorCount, 'A focused-screen load cannot update state after focus cleanup')
  }
  console.log('PASS: notification client requires exact complete reviewed receipts, preserves clarification context, refreshes the normal inbox and ignores stale account/session callbacks.')
}
function verifyFoodVoiceEntry() {
  const foodFile = ts.createSourceFile('TrackCaloriesScreen.tsx', fs.readFileSync(path.resolve(__dirname, '../native/src/screens/TrackCaloriesScreen.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let handlers
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(foodFile) === 'Pressable' && node.attributes.properties.some(item => ts.isJsxAttribute(item) && item.name.text === 'accessibilityLabel' && item.initializer?.text === 'Talk to Helfi')) {
      handlers = new Map(node.attributes.properties.filter(item => ts.isJsxAttribute(item) && ['onPress', 'onLongPress', 'onAccessibilityAction'].includes(item.name.text)).map(item => [item.name.text, item.initializer.expression.getText(foodFile)]))
    }
    ts.forEachChild(node, visit)
  }
  visit(foodFile)
  assert.equal(handlers.size, 3)
  for (const topAddMeal of ['lunch', undefined]) {
    const opened = [], box = { topAddMeal, selectedDate: '2026-10-16', openVoiceAssistant: value => opened.push(value) }
    vm.createContext(box)
    for (const [name, handler] of handlers) vm.runInContext(ts.transpileModule(`globalThis.${name} = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, box)
    box.onPress(); assert.equal(opened.at(-1).mode, undefined, 'Food short tap retains normal one-tap voice')
    box.onLongPress(); assert.equal(opened.at(-1).mode, 'conversation', 'Food long press opens no-microphone history/text mode')
    box.onAccessibilityAction({ nativeEvent: { actionName: 'conversation' } }); assert.equal(opened.at(-1).mode, 'conversation')
    for (const value of opened) { assert.equal(value.context.section, 'food'); assert.equal(value.context.date, '2026-10-16'); assert.equal(value.context.meal, topAddMeal || 'breakfast') }
    box.onAccessibilityAction({ nativeEvent: { actionName: 'unrelated' } }); assert.equal(opened.length, 3)
  }
}
async function verifyConfirmationTranscript() {
  const draft = foodDraft()
  const confirmation = await draftRequest('that is exactly how I wanted it', { confirmNow: true, draft }, true)
  assert.equal(confirmation.saveOptions.length, 1)
  assert.equal(confirmation.turns.filter(turn => turn.role === 'assistant').length, 0, 'An interpreted yes cannot append the old review question again before its save receipt')
  assert.ok(confirmation.turns.some(turn => turn.role === 'user'))
  const integrated = await draftRequest('that is exactly how I wanted it', { confirmNow: true, draft }, true, { useActualSave: true, DeviceEventEmitter: { emit: noop }, fetchNativeVoiceConfirm: async factory => { await factory('https://offline.invalid'); return { res: { ok: true }, data: { success: true, result: { kind: 'food', ids: ['synthetic-saved-meal'], message: 'Meal added to lunch.' } } } } })
  assert.equal(integrated.result.saved, true)
  assert.deepEqual(integrated.turns.filter(turn => turn.role === 'assistant').map(turn => turn.text), ['Meal added to lunch.'], 'The real request and save callbacks append only the actual save receipt after interpreted confirmation')
  const rejected = await draftRequest('actually I would rather leave it out', { rejectNow: true, draft }, true)
  assert.equal(rejected.saveOptions.length, 0)
  assert.equal(rejected.turns.filter(turn => turn.role === 'assistant').length, 1)
  assert.match(rejected.turns.find(turn => turn.role === 'assistant').text, /not saved/i)
  assert.ok(!rejected.turns.some(turn => turn.text === draft.confirmationMessage), 'An interpreted rejection cannot repeat the stale review question')
}
async function verifyMemoryAndEntryModes() {
  const memory = new Map(), received = []
  const box = baseBox()
  Object.assign(box, {
    voiceMemoryUserId: 'synthetic-account-a',
    AsyncStorage: { getItem: async key => memory.get(key) || null, setItem: async (key, value) => { memory.set(key, value) }, removeItem: async key => { memory.delete(key) } },
    setConversationTurns: value => received.push(value),
  })
  evaluate(box, `globalThis.saveMemory = ${callback('saveConversationMemory')}; globalThis.loadMemory = ${callback('loadConversationMemory')}`)
  const turns = Array.from({ length: 80 }, (_, i) => ({ id: `turn-${i}`, role: i % 2 ? 'assistant' : 'user', text: `Synthetic conversation line ${i}` }))
  box.saveMemory(turns)
  const scopedKey = box.voiceConversationStorageKey(box.voiceMemoryUserId)
  assert.ok(memory.has(scopedKey))
  assert.equal((await box.loadMemory()).length, 80, 'A normal conversation retains substantially more than eight lines')
  const saved = JSON.parse(memory.get(scopedKey))
  saved.savedAt -= 2 * 60 * 60 * 1000
  memory.set(scopedKey, JSON.stringify(saved))
  assert.equal((await box.loadMemory()).length, 80, 'Previous conversation remains readable after the old thirty-minute cutoff')
  memory.delete(scopedKey)
  memory.set('helfi_voice_recent_conversation_v1', JSON.stringify({ ...saved, userId: 'different-synthetic-account' }))
  assert.equal((await box.loadMemory()).length, 0, 'A legacy conversation belonging to another account is never loaded')
  assert.ok(memory.has('helfi_voice_recent_conversation_v1'), 'Reading does not erase another account history')
  memory.set('helfi_voice_recent_conversation_v1', JSON.stringify(saved))
  assert.equal((await box.loadMemory()).length, 80, 'Matching-account legacy history remains accessible')
  let finishRead
  box.AsyncStorage.getItem = async () => new Promise(resolve => { finishRead = resolve })
  const late = box.loadMemory()
  box.voiceAccountTokenRef.current = 'another-synthetic-account-token'
  const receivedBefore = received.length
  finishRead(JSON.stringify(saved))
  assert.equal((await late).length, 0)
  assert.equal(received.length, receivedBefore, 'An account change during history loading cannot restore private old-account turns')
  for (const mode of ['conversation', 'text', 'voice']) {
    const entry = baseBox(), state = {}, calls = { access: 0, starts: 0, memory: 0 }
    Object.assign(entry, {
      voiceRecordingSupported: true, liveVoiceEnabled: true, typedMode: false, conversationReviewOnly: false,
      open: true, voicePaidAccessGranted: false, realtimeVoiceAvailable: true, realtimeAutoStartRef: { current: false },
      Vibration: { vibrate: noop }, DeviceEventEmitter: { emit: noop },
      normalizeLaunchContext: value => value || {}, loadConversationMemory: async () => { calls.memory++; return turns },
      ensureVoicePaidAccess: async () => { calls.access++; return true },
      stopRealtimeVoiceSession: async () => { entry.realtimeVoiceRunRef.current++ },
      startVoiceSession: () => { calls.starts++ },
    })
    for (const name of ['setVoiceActivity', 'setSpokenReplyStatus', 'setCheckingRealtimeVoice', 'setMicrophoneMuted', 'setAutoSubmitToken', 'setLoadingConversationMemory', 'setVisionChoicesOpen', 'setRealtimeVoiceName']) entry[name] = noop
    entry.setConversationReviewOnly = value => { entry.conversationReviewOnly = value; state.review = value }
    entry.setTypedMode = value => { entry.typedMode = value; state.text = value }
    entry.setVoicePaidAccessGranted = value => { entry.voicePaidAccessGranted = value }
    entry.setOpen = value => { entry.open = value }
    evaluate(entry, `globalThis.openEntry = ${callback('openVoiceAssistant')}; globalThis.autoStart = ${autoStartEffect}`)
    await entry.openEntry(mode === 'voice' ? undefined : { mode })
    // The separate readiness effect has made availability true after access.
    entry.realtimeVoiceAvailable = true
    entry.autoStart()
    assert.equal(calls.memory, 1)
    assert.equal(calls.access, mode === 'voice' ? 1 : 0, `${mode} entry has the correct paid-access behavior`)
    assert.equal(calls.starts, mode === 'voice' ? 1 : 0, `${mode} entry cannot unexpectedly start a paid microphone session`)
    assert.equal(state.review, mode === 'conversation')
    assert.equal(state.text, mode === 'text')
  }
  const iconFile = ts.createSourceFile('VoiceAssistantIconButton.tsx', fs.readFileSync(path.resolve(__dirname, '../native/src/voice/VoiceAssistantIconButton.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const events = new Map()
  function iconVisit(node) {
    if (ts.isJsxAttribute(node) && ['onPress', 'onLongPress', 'onAccessibilityAction'].includes(node.name.text)) events.set(node.name.text, node.initializer.expression.getText(iconFile))
    ts.forEachChild(node, iconVisit)
  }
  iconVisit(iconFile)
  const opened = [], iconBox = { onPress: undefined, context: { section: 'food' }, openVoiceAssistant: value => opened.push(value) }
  vm.createContext(iconBox)
  for (const name of ['onPress', 'onLongPress', 'onAccessibilityAction']) vm.runInContext(`globalThis.${name} = ${events.get(name)}`, iconBox)
  iconBox.onPress()
  assert.equal(opened.at(-1).mode, undefined, 'Normal microphone tap preserves one-tap voice')
  iconBox.onLongPress()
  assert.equal(opened.at(-1).mode, 'conversation')
  iconBox.onAccessibilityAction({ nativeEvent: { actionName: 'conversation' } })
  assert.equal(opened.at(-1).mode, 'conversation')
  const ended = baseBox(), endingOrder = [], endingState = {}
  Object.assign(ended, {
    recording: null, recordingStoppingRef: { current: false }, spokenReplyRunRef: { current: 0 },
    realtimeVoiceFlushRef: { current: () => { endingOrder.push('flush'); assert.equal(ended.realtimeVoiceRunRef.current, 0) } },
    setConversationReviewOnly: value => { endingState.review = value }, setTypedMode: value => { endingState.text = value },
    clearVoiceTurnTimers: noop, setBottleCameraOpen: noop, setRecordingStarting: noop, setSpokenReplyStatus: noop,
    stopRealtimeVoiceSession: async () => { endingOrder.push('stop') }, stopPlayback: async () => {},
  })
  evaluate(ended, `globalThis.end = ${callback('endVoiceSession')}`)
  ended.end()
  assert.equal(endingOrder[0], 'flush', 'End captures pending words before invalidating audio callbacks')
  assert.equal(endingState.review, true)
  assert.equal(endingState.text, false)
  assert.equal(ended.openRef.current, true, 'End leaves the retained transcript visible')
}

async function verifyExplicitMessageFocus() {
  assert(messageFocusEffect && jsxHandlers.has('messageLayout'))
  assert(source.includes('ref={messageScrollRef}') && source.includes('ref={messageInputRef}'))
  const box = baseBox(), scrolled = [], focused = [], frames = new Map(), cancelled = []
  let sequence = 0
  Object.assign(box, { open: true, typedMode: false, conversationReviewOnly: true, voiceSessionActive: false, loadingConversationMemory: true, messageFocusRequest: 0,
    messageScrollRef: { current: { scrollTo: value => scrolled.push(value) } }, messageInputRef: { current: { focus: () => focused.push(true) } },
    setMessageFocusRequest: update => { box.messageFocusRequest = update(box.messageFocusRequest) },
    setConversationReviewOnly: value => { box.conversationReviewOnly = value }, setTypedMode: value => { box.typedMode = value },
    endVoiceSession: () => { box.realtimeVoiceRunRef.current++; box.pendingMessageFocusRef.current = null; box.messageSectionYRef.current = null },
    requestAnimationFrame: run => { const id = ++sequence; frames.set(id, run); return id }, cancelAnimationFrame: id => { cancelled.push(id); frames.delete(id) },
  })
  evaluate(box, `globalThis.requestMessageInputFocus = ${callback('requestMessageInputFocus')}; globalThis.focusRequestedMessageInput = ${callback('focusRequestedMessageInput')}; globalThis.type = ${callback('typeVoiceMessage')}; globalThis.layout = ${jsxHandlers.get('messageLayout')}; globalThis.focusEffect = ${messageFocusEffect}`)
  box.type(); assert.equal(box.messageFocusRequest, 0, 'Loading history cannot start the text-focus transition')
  box.loadingConversationMemory = false
  box.type(); assert.equal(box.typedMode, true); assert.equal(box.conversationReviewOnly, false)
  const cleanup = box.focusEffect(); assert.equal(frames.size, 1)
  for (const run of frames.values()) run(); frames.clear()
  assert.equal(scrolled.length, 0, 'Wait for actual message-section layout instead of guessing the end of long history')
  box.layout({ nativeEvent: { layout: { y: 75000 } } })
  assert.equal(scrolled[0].y, 74988); assert.equal(scrolled[0].animated, false); assert.equal(focused.length, 1)
  box.layout({ nativeEvent: { layout: { y: 75100 } } }); box.focusRequestedMessageInput()
  assert.equal(scrolled.length, 1, 'New transcript layouts and reading/corrections cannot keep forcing the view to scroll')
  cleanup(); assert.equal(cancelled.length, 1)
  for (const reason of ['closed', 'account', 'run', 'unmounted', 'reading', 'loading']) {
    box.openRef.current = true; box.voiceProviderMountedRef.current = true; box.voiceAccountTokenRef.current = 'synthetic-token'; box.typedMode = true; box.conversationReviewOnly = false; box.loadingConversationMemory = false
    box.requestMessageInputFocus()
    if (reason === 'closed') box.openRef.current = false
    if (reason === 'account') box.voiceAccountTokenRef.current = 'other-account'
    if (reason === 'run') box.realtimeVoiceRunRef.current++
    if (reason === 'unmounted') box.voiceProviderMountedRef.current = false
    if (reason === 'reading') box.conversationReviewOnly = true
    if (reason === 'loading') box.loadingConversationMemory = true
    box.focusRequestedMessageInput(); assert.equal(scrolled.length, 1, `${reason} transition cannot focus an old message request`)
    box.pendingMessageFocusRef.current = null
  }
  const opening = baseBox(), requests = []
  Object.assign(opening, { realtimeAutoStartRef: { current: false }, voiceRecordingSupported: true, Vibration: { vibrate: noop }, DeviceEventEmitter: { emit: noop }, stopRealtimeVoiceSession: async () => {}, loadConversationMemory: async () => {}, normalizeLaunchContext: value => value, setConversationReviewOnly: noop, setTypedMode: noop, setOpen: noop, requestMessageInputFocus: () => requests.push('focus'), ensureVoicePaidAccess: async () => true })
  for (const name of ['setVoiceActivity', 'setSpokenReplyStatus', 'setCheckingRealtimeVoice', 'setMicrophoneMuted', 'setAutoSubmitToken', 'setLoadingConversationMemory', 'setVisionChoicesOpen', 'setRealtimeVoiceName', 'setVoicePaidAccessGranted']) opening[name] = noop
  evaluate(opening, `globalThis.openEntry = ${callback('openVoiceAssistant')}`)
  await opening.openEntry({ mode: 'conversation' }); assert.equal(requests.length, 0)
  await opening.openEntry({ mode: 'text' }); assert.equal(requests.length, 1, 'Explicit text-mode opening requests message focus after retained memory is loaded')
  console.log('PASS: explicit typing/open-text reveals and focuses the measured message section after long retained history exactly once; loading/account/End/unmount guards prevent late focus and reading/corrections never auto-scroll.')
}

async function verifyNativeDeviceHost() {
  const fixtureSource = fs.readFileSync(path.resolve(__dirname, 'voice-native-device-actions-check.cjs'), 'utf8').replace(/^#!.*\n/, '')
  const boundary = fixtureSource.indexOf('let count=0')
  assert(boundary > 0)
  const { client } = new Function('require', '__dirname', `${fixtureSource.slice(0, boundary)}\nreturn { client }`)(require, __dirname)
  const owner = 'synthetic-health-owner', date = '2026-10-17', watch = { sourceId: 'synthetic.watch', sourceName: 'Exact Watch Source' }
  // Noon UTC is this fixture's reviewed day in UTC, Melbourne and Los Angeles.
  // Keep the real calendar/Intl guard; never depend on the build machine's now.
  const fixtureNow = Date.parse(`${date}T12:00:00Z`)
  class DeviceFixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixtureNow])) }
    static now() { return fixtureNow }
  }
  let token = 0
  function setup(action, empty = false) {
    const box = baseBox(), writes = [], calls = [], events = [], turns = [], notices = [], drafts = [], store = new Map(), requests = []
    const state = { userId: owner, ready: true, enabled: false, source: null, busy: false }
    let supported = true, resolve
    const provider = {
      getSnapshot: () => ({ ...state }),
      setEnabled: async value => { calls.push(['enabled', value]); state.enabled = value },
      setSource: async value => { calls.push(['source', value]); state.source = value },
      readSources: async date => { calls.push(['sources', date]); return [watch] },
      refresh: async (manual, date) => { calls.push(['refresh', manual, date]); return empty ? { imported: false } : { imported: true, summary: { localDate: date, selectedSource: state.source, activeEnergyKcal: 123 } } },
    }
    const draft = { action: 'device_action', transcript: 'Apply the exact Apple Health control', localDate: date, summary: 'Apple Health control', confirmationMessage: 'Apply the exact reviewed Apple Health control? This does not grant Health permissions.', canConfirm: true, requiresDeviceReview: true, reviewToken: `synthetic-health-token-${++token}`, deviceAction: action }
    const authorization = { success: true, deviceActionAuthorized: true, authorizedDeviceAction: action, status: 'device_authorized', safeToClaimSaved: false }
    Object.assign(box, { Date: DeviceFixtureDate, voiceMemoryUserId: owner, voiceAccountUserIdRef: { current: owner }, appleHealthSyncRef: { current: provider },
      AsyncStorage: { getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { writes.push(key); store.set(key, value) } },
      isAppleHealthSupportedDevice: () => supported, getSleepDeviceEditorState: client.getSleepDeviceEditorState, validateNativeDeviceAction: client.validateNativeDeviceAction, captureNativeDeviceReview: client.captureNativeDeviceReview, applyReviewedNativeDeviceAction: client.applyReviewedNativeDeviceAction,
      buildNativeAuthHeaders: () => ({}), todayLocalDate: () => date,
      fetch: async (_url, options) => { requests.push(JSON.parse(options.body)); return new Promise(done => { resolve = done }) }, fetchNativeVoiceConfirm: async factory => factory('https://offline.invalid'),
      DeviceEventEmitter: { emit: (...value) => events.push(value) }, appendConversationTurns: value => turns.push(...value), setSaveSuccessNotice: value => notices.push(value), setDraft: value => drafts.push(value),
    })
    evaluate(box, `globalThis.save = ${callback('saveDraft')}`)
    const io = box.nativeDeviceIoForVoice(() => box.appleHealthSyncRef.current, () => box.voiceAccountUserIdRef.current, () => box.openRef.current && box.voiceAccountTokenRef.current === 'synthetic-token' && box.voiceAccountUserIdRef.current === owner)
    return { box, state, provider, draft, authorization, calls, writes, events, turns, notices, drafts, store, requests, io, setSupported: value => { supported = value }, resolve: (data = authorization) => resolve({ res: { ok: true }, data }), capture: async () => { box.nativeDeviceReviewRef.current = await client.captureNativeDeviceReview(draft.reviewToken, owner, action, io) } }
  }
  const cases = [{ action: 'apple_health.automatic.update', values: { enabled: true } }, { action: 'apple_health.source.select', values: { sourceName: watch.sourceName } }, { action: 'apple_health.import', values: { localDate: date } }]
  const future = setup({ action: 'apple_health.import', values: { localDate: '2026-10-18' } })
  await assert.rejects(future.capture(), /today or an earlier activity date/)
  assert.equal(future.calls.length + future.writes.length + future.requests.length, 0, 'A future activity date still cannot import, write or request authorization')
  const earlier = setup({ action: 'apple_health.import', values: { localDate: '2026-10-16' } })
  await earlier.capture()
  for (const action of cases) for (const empty of action.action === 'apple_health.import' ? [false, true] : [false]) {
    const f = setup(action, empty); await f.capture()
    const prompt = f.box.spokenReviewPromptForDraft(f.draft, f.box.nativeDeviceReviewRef.current)
    assert(prompt.includes('Current phone source: Apple Health totals') && prompt.includes('Automatic foreground updates are off'))
    const running = f.box.save(f.draft, { closeOnSuccess: false })
    assert.equal(await f.box.save(f.draft), null); assert.equal(f.calls.filter(call => call[0] !== 'sources').length, 0, 'No device write/import may happen before server authorization')
    f.resolve(); const data = await running
    assert.ok(data); assert.equal(f.requests.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].draft)), f.draft, 'Phone before-state display must not mutate the HMAC-signed server draft')
    assert.equal(data.result.verified, !empty); assert.equal(f.box.isConfirmedVoiceSave(data, 'device_action'), !empty)
    const result = f.box.confirmationRequestResult(data, f.draft, 'synthetic-device-action'), tool = f.box.realtimeToolResult(result)
    assert.equal(result.ok, true); assert.equal(result.saved, !empty); assert.equal(tool.safeToClaimSaved, !empty); assert(tool.instruction.includes('Never claim OS permission'))
    assert.equal(f.notices.length, empty ? 0 : 1)
    if (!empty) assert(f.events.some(([name, target]) => name === 'helfi:navigate-native-web-tool' && target.nativeTarget.route === 'Devices'))
    assert.equal(f.events.filter(([name]) => name === 'helfi:food-log-changed').length, action.action === 'apple_health.import' && !empty ? 1 : 0)
    if (action.action === 'apple_health.automatic.update') assert.equal(f.state.enabled, true)
    if (action.action === 'apple_health.source.select') assert.equal(f.state.source.sourceId, watch.sourceId)
    if (action.action === 'apple_health.import') { assert.equal(f.calls.filter(call => call[0] === 'refresh').length, 1); assert.equal(f.calls.find(call => call[0] === 'refresh')[2], date) }
    const replay = f.box.save(f.draft, { closeOnSuccess: false }); f.resolve(); const duplicate = await replay
    assert.equal(duplicate.result.idempotentReplay, true)
    assert.equal(f.calls.filter(call => call[0] === (action.action === 'apple_health.import' ? 'refresh' : action.action.endsWith('source.select') ? 'source' : 'enabled')).length, 1)
  }
  for (const reason of ['not-ready', 'busy', 'foreign', 'unsupported']) {
    const f = setup(cases[0])
    if (reason === 'not-ready') f.state.ready = false
    if (reason === 'busy') f.state.busy = true
    if (reason === 'foreign') f.state.userId = 'another-health-account'
    if (reason === 'unsupported') f.setSupported(false)
    await assert.rejects(f.capture()); assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0)
  }
  for (const patch of [{ deviceActionAuthorized: false }, { safeToClaimSaved: true }, { status: 'saved' }, { authorizedDeviceAction: { action: 'apple_health.automatic.update', values: { enabled: false } } }]) {
    const f = setup(cases[0]); await f.capture(); const running = f.box.save(f.draft); f.resolve({ ...f.authorization, ...patch })
    assert.equal(await running, null); assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0); assert.equal(f.notices.length, 0)
  }
  for (const reason of ['account-before', 'account-after', 'end', 'run', 'abort', 'loading-after']) {
    const f = setup(cases[0]); await f.capture(); const controller = new AbortController()
    if (reason === 'account-before') f.box.voiceAccountUserIdRef.current = 'another-owner'
    const running = f.box.save(f.draft, { signal: controller.signal })
    if (reason === 'account-before') { assert.equal(await running, null); assert.equal(f.requests.length, 0); continue }
    if (reason === 'account-after') f.box.voiceAccountUserIdRef.current = 'another-owner'
    if (reason === 'end') f.box.openRef.current = false
    if (reason === 'run') f.box.realtimeVoiceRunRef.current++
    if (reason === 'abort') controller.abort()
    if (reason === 'loading-after') f.state.ready = false
    f.resolve(); assert.equal(await running, null); assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0); assert.equal(f.events.length, 0)
  }
  const f = setup(cases[0])
  const pending = await draftRequest('turn automatic Apple Health on', { draft: f.draft }, false, { ...f.box, fetch: async () => ({}), draft: null, pendingFollowUpDraft: null })
  assert.equal(pending.result.needsReview, true); assert(f.box.nativeDeviceReviewRef.current); assert.equal(f.calls.length, 0)
  const fresh = setup(cases[0])
  const reissued = await draftRequest('please apply that change', { confirmNow: true, draft: fresh.draft }, false, { ...fresh.box, fetch: async () => ({}), draft: fresh.draft, pendingFollowUpDraft: null })
  assert.equal(reissued.result.saved, false); assert.equal(reissued.result.needsReview, true); assert.equal(fresh.calls.length, 0)
  assert(fresh.box.nativeDeviceReviewRef.current, 'A confirmation with no matching captured phone review must ask again using actual current phone state')
  const rejected = setup(cases[1])
  const discarded = await draftRequest('please leave that change out', { rejectNow: true, draft: rejected.draft }, false, { ...rejected.box, fetch: async () => ({}), draft: rejected.draft, pendingFollowUpDraft: null })
  assert.equal(discarded.result.saved, false); assert.equal(rejected.calls.length, 0); assert.equal(rejected.box.nativeDeviceReviewRef.current, null, 'A refusal must not discover Health sources or request device access')
  const notReady = setup(cases[0]); notReady.state.ready = false
  const unavailable = await draftRequest('turn automatic Apple Health on', { draft: notReady.draft }, false, { ...notReady.box, fetch: async () => ({}), draft: null, pendingFollowUpDraft: null })
  assert.equal(unavailable.result.ok, false); assert(!notReady.drafts.some(draft => draft?.canConfirm)); assert.equal(notReady.calls.length, 0)
  const sleep = setup({ action: 'sleep.settings.update', values: { enabled: true } })
  const refused = await draftRequest('turn sleep listening on', { draft: sleep.draft }, false, { ...sleep.box, fetch: async () => ({}), draft: null, pendingFollowUpDraft: null })
  assert.equal(refused.result.ok, false); assert.equal(sleep.writes.length, 0)
  const malformed = { kind: 'native_device_action', id: 'apple_health.import', entity: 'apple_health', operation: 'import', status: 'imported', verified: true, localDate: date, message: `Apple Health confirmed the activity import for ${date}.` }
  for (const patch of [{ id: 'sleep.settings.update' }, { verified: false }, { operation: 'update' }, { entity: 'device_settings' }, { localDate: '2026-02-30' }, { message: 'OS permission was granted.' }]) assert.equal(f.box.isValidNativeDeviceReceipt({ ...malformed, ...patch }), false)
  console.log('PASS: actual device host captures live ready/account/source state before review; exact server authorization alone cannot claim a save; real helper storage/readback proves only the three existing Apple Health actions, deduplicates replay, refuses unsupported Sleep and blocks late/altered/unready work; no-data never claims import.')
}

function localPreferenceModule() {
  const exports = {}
  const module = { exports }
  const storage = new Map(), writes = [], colors = []
  const AsyncStorage = { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { writes.push([key, value]); storage.set(key, value) } }
  const box = { exports, module, Promise, Map, WeakSet, Date, Object, String, Error, require: name => {
    if (name === '@react-native-async-storage/async-storage') return { default: AsyncStorage }
    if (name === 'react-native') return { Appearance: { setColorScheme: value => colors.push(value) } }
    throw new Error(`Unexpected import: ${name}`)
  } }
  vm.createContext(box)
  const actual = fs.readFileSync(path.resolve(__dirname, '../native/src/voice/localPreferenceActions.ts'), 'utf8')
  vm.runInContext(ts.transpileModule(actual, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, box)
  return { api: module.exports, storage, writes, colors }
}
async function verifyLocalPreferences() {
  const { api, storage, writes, colors } = localPreferenceModule()
  const account = 'synthetic-account', token = 'synthetic-signed-review'
  let current = true
  const isCurrent = () => current
  const valid = [{ key: 'darkMode', value: true }, { key: 'hapticsEnabled', value: false }, { key: 'profileVisibility', value: 'friends' }, { key: 'dataAnalytics', value: false }]
  for (const preference of valid) {
    const review = await api.captureLocalPreferenceReview(token, account, preference, isCurrent)
    const before = writes.length
    assert.equal(storage.get(preference.key), undefined, 'Preparing a review must never write a setting')
    const [first, duplicate] = await Promise.all([
      api.applyReviewedLocalPreference(review, token, account, preference, isCurrent),
      api.applyReviewedLocalPreference(review, token, account, preference, isCurrent),
    ])
    assert.equal(first.kind, 'local_preference_action')
    assert.equal(duplicate.id, preference.key)
    assert.equal(storage.get(preference.key), String(preference.value))
    assert.equal(writes.length, before + 1, 'Concurrent confirmations perform one device write')
    const replay = await api.applyReviewedLocalPreference(review, token, account, preference, isCurrent)
    assert.equal(replay.idempotentReplay, true)
    assert.equal(writes.length, before + 1, 'A repeated confirmation checks storage without writing again')
  }
  assert.deepEqual(colors, ['dark'], 'Only dark mode changes Appearance; other preferences save their flags only')
  for (const preference of [{ key: 'billing', value: true }, { key: 'darkMode', value: 'true' }, { key: 'profileVisibility', value: 'everyone' }, { key: 'dataAnalytics', value: true, extra: 'no arbitrary keys' }, { key: 'profileVisibility', value: { toString: () => 'private' } }]) {
    assert.throws(() => api.validateLocalPreference(preference))
  }
  const preference = { key: 'darkMode', value: false }
  const review = await api.captureLocalPreferenceReview(token, account, preference, isCurrent)
  const before = writes.length
  for (const [otherToken, otherAccount, authorized] of [['different-review', account, preference], [token, 'different-account', preference], [token, account, { ...preference, value: true }]]) {
    await assert.rejects(api.applyReviewedLocalPreference(review, otherToken, otherAccount, authorized, isCurrent))
  }
  current = false
  await assert.rejects(api.applyReviewedLocalPreference(review, token, account, preference, isCurrent))
  current = true
  await assert.rejects(api.applyReviewedLocalPreference({ ...review, expiresAt: 0 }, token, account, preference, isCurrent))
  storage.set('darkMode', 'changed-after-review')
  await assert.rejects(api.applyReviewedLocalPreference(review, token, account, preference, isCurrent), /changed after your review/)
  assert.equal(writes.length, before, 'Mismatch, stopped account, expiry and stale review never write')
  storage.set('darkMode', 'true')
  let releaseRead, stagedWrites = 0
  const io = { getItem: () => new Promise(resolve => { releaseRead = resolve }), setItem: async () => { stagedWrites++ }, setColorScheme: noop, now: () => Date.now() }
  const stopped = api.applyReviewedLocalPreference(review, token, account, preference, isCurrent, io)
  current = false; releaseRead('true')
  await assert.rejects(stopped)
  assert.equal(stagedWrites, 0, 'Stop during the pre-write read prevents any later write')
  current = true
  let reads = 0
  const falseProofIo = { ...io, getItem: async () => ++reads === 1 ? 'true' : 'false-readback', setItem: async () => { stagedWrites++ } }
  await assert.rejects(api.applyReviewedLocalPreference(review, token, account, preference, isCurrent, falseProofIo), /did not confirm/)
  assert.equal(colors.length, 1, 'An unverified dark mode write cannot claim Appearance was applied')

  for (const response of [{ success: true }, { success: true, localPreferenceAuthorized: true, authorizedPreference: { key: 'darkMode', value: true } }, { success: true, localPreferenceAuthorized: true, authorizedPreference: preference }]) {
    const box = baseBox(), notices = [], events = []
    const clientModule = localPreferenceModule()
    Object.assign(box, clientModule.api, {
      voiceMemoryUserId: account, voiceAccountUserIdRef: { current: account }, localPreferenceReviewRef: { current: await clientModule.api.captureLocalPreferenceReview(token, account, preference, () => true) },
      todayLocalDate: () => '2026-10-17', buildNativeAuthHeaders: () => ({}),
      DeviceEventEmitter: { emit: (name, payload) => events.push({ name, payload }) },
      fetch: async () => ({ res: { ok: true }, data: response }),
      fetchNativeVoiceConfirm: factory => factory('https://offline.invalid'), setSaveSuccessNotice: value => notices.push(value),
    })
    evaluate(box, `globalThis.save = ${callback('saveDraft')}`)
    const result = await box.save({ ...foodDraft(), action: 'local_preference_action', reviewToken: token, localPreference: preference }, { closeOnSuccess: false })
    const authorized = response.authorizedPreference?.value === false
    assert.equal(Boolean(result), authorized, 'Actual save callback accepts only the exact server authorization')
    assert.equal(clientModule.writes.length, authorized ? 1 : 0)
    assert.equal(notices.length, authorized ? 1 : 0)
    if (authorized) assert.ok(events.some(event => event.name === 'helfi:device-preference-changed'))
  }
  for (const stopReason of ['end', 'account']) {
    const clientModule = localPreferenceModule(), box = baseBox()
    let finishServer
    const notices = []
    Object.assign(box, clientModule.api, {
      voiceMemoryUserId: account, voiceAccountUserIdRef: { current: account },
      localPreferenceReviewRef: { current: await clientModule.api.captureLocalPreferenceReview(token, account, preference, () => true) },
      todayLocalDate: () => '2026-10-17', buildNativeAuthHeaders: () => ({}), DeviceEventEmitter: { emit: noop },
      fetch: async () => new Promise(resolve => { finishServer = resolve }), fetchNativeVoiceConfirm: factory => factory('https://offline.invalid'),
      setSaveSuccessNotice: value => notices.push(value),
    })
    evaluate(box, `globalThis.save = ${callback('saveDraft')}`)
    const result = box.save({ ...foodDraft(), action: 'local_preference_action', reviewToken: token, localPreference: preference }, { closeOnSuccess: false })
    if (stopReason === 'end') box.realtimeVoiceRunRef.current++
    else box.voiceAccountUserIdRef.current = 'different-account'
    finishServer({ res: { ok: true }, data: { success: true, localPreferenceAuthorized: true, authorizedPreference: preference } })
    assert.equal(await result, null)
    assert.equal(clientModule.writes.length, 0, `A server authorization arriving after ${stopReason} cannot cause a device write`)
    assert.equal(notices.length, 0)
  }
  const proposed = { ...foodDraft(), action: 'local_preference_action', localPreference: preference, reviewToken: token }
  const captured = { current: null }
  const prepared = await draftRequest('turn off dark mode', { draft: proposed }, false, { ...api, localPreferenceReviewRef: captured, voiceMemoryUserId: account, voiceAccountUserIdRef: { current: account } })
  assert.equal(prepared.result.status, 'review_draft')
  assert.equal(captured.current.preference.key, 'darkMode', 'Actual app-brain callback captures the device value before displaying the signed review')
  assert.equal(captured.current.beforeValue, 'true')
  for (const action of ['record_action', 'preference_action', 'local_preference_action']) {
    const pending = { ...proposed, action, canConfirm: false }
    assert.equal(evaluate(baseBox(), '').isPendingFollowUpDraft(pending), true)
    assert.equal(evaluate(baseBox(), '').voiceResultStatusFromDraft(pending), 'needs_clarification')
  }
  for (const screen of ['SettingsScreen', 'PrivacySettingsScreen']) {
    const screenSource = fs.readFileSync(path.resolve(__dirname, `../native/src/screens/${screen}.tsx`), 'utf8')
    const screenFile = ts.createSourceFile(`${screen}.tsx`, screenSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let effect
    function find(node) {
      if (ts.isCallExpression(node) && node.expression.getText(screenFile) === 'useEffect' && node.arguments[0]?.getText(screenFile).includes("addListener('helfi:device-preference-changed'")) effect = node.arguments[0].getText(screenFile)
      ts.forEachChild(node, find)
    }
    find(screenFile)
    assert.ok(effect, `${screen} subscribes to actual device-setting refresh`)
    const reads = [], received = [], loaded = []
    let listener, removed = false
    const state = {
      STORAGE_KEYS: { darkMode: 'darkMode', hapticsEnabled: 'hapticsEnabled', profileVisibility: 'profileVisibility', dataAnalytics: 'dataAnalytics' }, PROFILE_VISIBILITY_KEY: 'profileVisibility', DATA_ANALYTICS_KEY: 'dataAnalytics',
      AsyncStorage: { getItem: key => new Promise(resolve => reads.push({ key, resolve })) },
      DeviceEventEmitter: { addListener: (_name, callback) => { listener = callback; return { remove: () => { removed = true } } } },
      Appearance: { setColorScheme: noop }, setLocalLoaded: value => loaded.push(value), setLoaded: value => loaded.push(value),
      setDarkMode: value => received.push(['darkMode', value]), setHapticsEnabled: value => received.push(['hapticsEnabled', value]),
      setProfileVisibility: value => received.push(['profileVisibility', value]), setDataAnalytics: value => received.push(['dataAnalytics', value]),
    }
    vm.createContext(state)
    vm.runInContext(ts.transpileModule(`globalThis.cleanup = (${effect})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state)
    const initialReads = reads.splice(0)
    listener()
    const refreshReads = reads.splice(0)
    initialReads.forEach(read => read.resolve(read.key === 'profileVisibility' ? 'private' : 'false'))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(received.length, 0, `${screen} ignores a stale mount read after a newer preference refresh`)
    refreshReads.forEach(read => read.resolve(read.key === 'profileVisibility' ? 'friends' : 'true'))
    await new Promise(resolve => setImmediate(resolve))
    assert.ok(received.some(([key, value]) => key === 'profileVisibility' && value === 'friends'))
    assert.equal(loaded.at(-1), true)
    state.cleanup()
    assert.equal(removed, true)
  }
  console.log('PASS: device settings require exact server authorization, account-bound current review, explicit confirmation and storage proof; stop, stale values, malformed replies, duplicate confirmations and readback failures remain honest.')
}

async function main() {
  const box = evaluate(baseBox(), '')
  const noticeState = baseBox(), activity = [], errors = []
  Object.assign(noticeState, {
    realtimeRunId: 0, voiceSessionActiveRef: { current: true },
    setRealtimeVoiceError: message => errors.push(message),
    addVoiceActivity: (message, kind) => activity.push({ message, kind }),
  })
  evaluate(noticeState, `globalThis.notice = ${properties.get('onNotice')}; globalThis.failure = ${properties.get('onError')}`)
  noticeState.notice("I didn't hear anything. Please try speaking again.")
  assert.equal(errors.at(-1), '')
  assert.equal(activity.at(-1).kind, 'done')
  assert.match(activity.at(-1).message, /didn't hear anything/)
  noticeState.failure('Synthetic genuine service failure')
  assert.equal(activity.at(-1).kind, 'error')
  assert.equal(activity.at(-1).message, 'Synthetic genuine service failure', 'Real service errors retain the exact useful message')
  noticeState.voiceSessionActiveRef.current = false
  noticeState.notice('Late silence notice')
  assert.equal(activity.length, 2, 'A stopped conversation ignores late notices')
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
  assert.match(separate.headers[0]['x-helfi-voice-action-id'], /^action_[A-Za-z0-9_]+$/)
  assert.equal(separate.result.voiceActionRunId, separate.headers[0]['x-helfi-voice-action-id'])
  assert.ok(!JSON.stringify(separate.traces).includes('250 ml'), 'Structured traces must never contain request text or quantities')
  const handoff = { action: 'app_handoff', canConfirm: false, appTarget: { path: '/water', title: 'Water Intake', nativeTarget: { type: 'stack', route: 'WaterIntake' } }, summary: 'Open water', confirmationMessage: 'Water is ready.' }
  const navigation = await draftRequest('open water', { draft: handoff })
  assert.equal(navigation.opened.length, 1, 'A safe open-screen request actually invokes native navigation')
  const proposal = await draftRequest('log lunch', { draft: { ...draft, appTarget: handoff.appTarget } })
  assert.equal(proposal.opened.length, 0, 'A proposal awaiting consent never navigates as though it were saved')
  const no = await draftRequest('no')
  assert.equal(no.bodies.length, 0)
  assert.ok(no.turns.some(turn => turn.role === 'assistant' && /not saved/i.test(turn.text)))
  assert.equal(box.voiceResultStatusFromDraft({ action: 'food_draft', canConfirm: false, confirmationMessage: 'I could not match that item.' }), 'needs_clarification')
  const empty = await draftRequest('open water', {})
  assert.equal(empty.result.ok, false, 'HTTP200 without a complete app answer is an error')
  const typing = baseBox(), typedText = [], clearedDrafts = []
  typing.setTranscript = value => typedText.push(value)
  typing.setDraft = value => clearedDrafts.push(value)
  evaluate(typing, `globalThis.change = ${jsxHandlers.get('messageChange')}`)
  typing.change('yes')
  assert.equal(typedText[0], 'yes')
  assert.equal(clearedDrafts.length, 0, 'Typing a correction or yes must retain the signed review until the app brain handles it')
  const busySave = baseBox()
  busySave.busy = true; busySave.confirming = false; busySave.draft = draft
  let saveCalls = 0
  busySave.saveDraft = async () => { saveCalls++ }
  evaluate(busySave, `globalThis.confirm = ${callback('confirmDraft')}`)
  await busySave.confirm()
  assert.equal(saveCalls, 0, 'A pending correction must finish before a button can save the older proposal')
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
  const sourceWarning = 'The matching nutrition uses Canadian menu data.'
  assert.ok(box.spokenReviewPromptForDraft({ ...longDraft, confirmationMessage: `I found this meal. ${sourceWarning} Please review it.` }).includes(sourceWarning), 'Short spoken summaries retain disclosed non-local nutrition sources')
  assert.ok(box.reviewPromptForDraft({ ...draft, food: { ...draft.food, sourceNote: sourceWarning } }).includes(sourceWarning))
  const tool = box.realtimeToolResult({ ok: true, needsReview: true, reviewPrompt: spoken, status: 'review_draft' })
  assert.equal(tool.spokenReply, spoken)
  assert.equal(tool.safeToClaimSaved, false)
  assert.ok(!box.reviewPromptForDraft({ ...draft, localTime: '99:99' }).includes('99:99'))
  const exactFoodRecordReview = `Update selected entry. Complete ingredient basis: Coffee: 250 ml; Milk: 50 ml; Sugar: 8 g. Consumed portion: all listed ingredient amounts. Nutrition: 65 kcal; fibre unknown. ${'Full exact cooking instruction. '.repeat(240)} FINAL STORED STEP. Nothing has changed yet. Would you like me to save this exact change?`
  for (const entity of ['food', 'water', 'favorite', 'custom_food']) {
    const reviewed = { action: 'record_action', canConfirm: true, summary: 'Short identity only', confirmationMessage: exactFoodRecordReview, recordAction: { entity, id: 'selected', operation: entity === 'favorite' || entity === 'custom_food' ? 'create' : 'update' } }
    assert.equal(box.reviewPromptForDraft(reviewed), exactFoodRecordReview)
    assert.equal(box.spokenReviewPromptForDraft(reviewed), exactFoodRecordReview, 'Food/drink/library reviews cannot truncate ingredients, portion, totals or final stored steps')
    const spoken = box.realtimeToolResult({ ok: true, needsReview: true, status: 'review_draft', action: 'record_action', reviewPrompt: box.spokenReviewPromptForDraft(reviewed) })
    assert.equal(spoken.spokenReply, exactFoodRecordReview.replace(/\s+/g, ' ').trim()); assert.equal(spoken.safeToClaimSaved, false)
  }
  const structuredLibrarySpeech = 'Save Exact recipe to Favorites. Recipe yield: 4 servings. Complete ingredient basis: Milk: 100 ml; Sugar: 8 g. Stored nutrition portion: 4 of 4 recipe servings. Nutrition: fibre unknown. 100 full cooking steps are retained in the written review and saved recipe. This does not add a food diary entry. Would you like me to save it?'
  const libraryReview = { action: 'record_action', canConfirm: true, confirmationMessage: exactFoodRecordReview, recordAction: { entity: 'favorite', operation: 'create', spokenReview: structuredLibrarySpeech, changes: { nutrition: { __importRecipe: { servings: 4, steps: Array(100).fill('Full stored cooking step') } } } } }
  assert.equal(box.reviewPromptForDraft(libraryReview), exactFoodRecordReview, 'Written library review keeps full stored steps')
  assert.equal(box.spokenReviewPromptForDraft(libraryReview), structuredLibrarySpeech, 'Spoken library review retains structured ingredients/yield/portion and step count without reading the step wall')
  assert.equal(libraryReview.recordAction.changes.nutrition.__importRecipe.steps.length, 100)
  const moodDraft = { action: 'mood', canConfirm: true, summary: 'Mood 5/7', localDate: draft.localDate, mood: { mood: 5, tags: ['calm', 'hopeful'], note: 'Voice repair test mood' } }
  for (const prompt of [box.reviewPromptForDraft(moodDraft), box.spokenReviewPromptForDraft(moodDraft)]) {
    for (const text of ['Mood 5/7', 'tags: calm, hopeful', 'note: “Voice repair test mood”', draft.localDate, 'Would you like me to save that for you?']) assert.ok(prompt.includes(text), `Exact mood review retains ${text}`)
  }
  const longMood = { ...moodDraft, mood: { ...moodDraft.mood, tags: Array.from({ length: 8 }, (_, i) => `exact reviewed mood tag ${i}`), note: `Exact note start ${'reviewed words '.repeat(15)} exact note end` } }
  const longMoodPrompt = box.spokenReviewPromptForDraft(longMood)
  assert.ok(longMoodPrompt.length > 500, 'Long mood fixture exercises the concise-summary boundary')
  assert.equal(longMoodPrompt, box.reviewPromptForDraft(longMood), 'Spoken mood review cannot drop note or tags at the concise-summary boundary')
  assert.ok(longMoodPrompt.includes('exact note end') && longMoodPrompt.includes('exact reviewed mood tag 7'))
  const contextualMood = { ...moodDraft, localTime: '19:30', mood: { ...moodDraft.mood, context: { intensityPercent: 0, feelings: ['calm', 'hopeful', 'exact last feeling'], energyLevel: 1, sleepQuality: 2, nutrition: 3, supplements: 4, medicationEffect: 5, physicalActivity: 1, localHour: 19 } } }
  for (const prompt of [box.reviewPromptForDraft(contextualMood), box.spokenReviewPromptForDraft(contextualMood)]) for (const expected of ['Mood 5/7', 'Voice repair test mood', 'intensity: 0%', 'feelings: calm, hopeful, exact last feeling', 'energy: 1/5', 'sleep quality: 2/5', 'nutrition: 3/5', 'supplements: 4/5', 'medication effect: 5/5', 'physical activity: 1/5', 'local hour (0–23): 19', 'at 19:30', 'Would you like me to save that for you?']) assert(prompt.includes(expected), expected)
  const noContext = box.reviewPromptForDraft(moodDraft)
  assert(!/intensity:|feelings:|energy:|local hour/.test(noContext), 'Omitted mood context cannot be invented')
  const longContextMood = { ...contextualMood, mood: { ...contextualMood.mood, note: 'Exact note '.repeat(500) } }
  const completeMoodSpeech = box.spokenReviewPromptForDraft(longContextMood)
  assert(completeMoodSpeech.length > 4000)
  assert.equal(box.realtimeToolResult({ ok: true, needsReview: true, status: 'review_draft', action: 'mood', reviewPrompt: completeMoodSpeech }).spokenReply, completeMoodSpeech)
  const journal = { action: 'journal', canConfirm: true, summary: 'Voice repair test', localDate: '2026-10-17', localTime: '19:30', journal: { title: 'Voice repair test', content: 'Voice repair test health journal. I took a calm walk today.', tags: ['walk', 'calm'], journalType: 'health' } }
  for (const prompt of [box.reviewPromptForDraft(journal), box.spokenReviewPromptForDraft(journal)]) {
    for (const expected of ['Health journal', 'note: “Voice repair test health journal. I took a calm walk today.”', journal.localDate, 'Would you like me to save that for you?']) assert(prompt.includes(expected), `Journal review retains ${expected}`)
    for (const unsupported of ['title:', 'tags:', 'at 19:30']) assert(!prompt.includes(unsupported), `Health journal review cannot promise unsupported ${unsupported}`)
  }
  const longJournal = { ...journal, journal: { ...journal.journal, journalType: 'mood', content: `Exact opening sentence.\n${'The entire user journal sentence stays here. '.repeat(300)}\nEXACT FINAL JOURNAL SENTENCE.` } }
  const journalWritten = box.reviewPromptForDraft(longJournal), journalSpoken = box.spokenReviewPromptForDraft(longJournal)
  assert(journalWritten.includes(longJournal.journal.content), 'Written journal review preserves every character of the user content, including line breaks')
  for (const expected of ['Mood journal', 'title: “Voice repair test”', 'tags: walk, calm', 'at 19:30']) assert(journalWritten.includes(expected), `Mood journal retains actual ${expected}`)
  assert(journalWritten.length > 6000); assert.equal(journalSpoken, journalWritten)
  assert.equal(box.realtimeToolResult({ ok: true, needsReview: true, status: 'review_draft', action: 'journal', reviewPrompt: journalSpoken }).spokenReply, journalWritten.replace(/\s+/g, ' ').trim(), 'Spoken tool output must retain all journal words and final save question beyond500/4000/6000chars')
  const fallbackJournalSpeech = []
  await draftRequest('Write my complete journal note', { draft: { ...longJournal, confirmationMessage: 'Short server journal excerpt only.' } }, false, { draft: null, voiceReply: true, allowSpokenReply: true, requestVoiceReply: async value => { fallbackJournalSpeech.push(value) } })
  assert.equal(fallbackJournalSpeech.length, 1)
  assert.equal(fallbackJournalSpeech[0], journalSpoken, 'Recorded-audio/voice-reply dispatch uses the full actual journal review rather than the short server excerpt')
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
  await verifyPreferenceCompletionEvents()
  await verifyConfirmBackendIsolation()
  await verifyReviewSaveErrorLifecycle()
  await verifySingleSpokenReplyRequest()
  await verifyRecipeImportClient()
  await verifySupportAndReportClient()
  await verifyReviewedRecordChanges()
  await verifyNotificationClient()
  await verifyAdditionalRecordedActions()
  await verifyMemoryAndEntryModes()
  await verifyExplicitMessageFocus()
  await verifyNativeDeviceHost()
  verifyFoodVoiceEntry()
  await verifyConfirmationTranscript()
  await verifyVoiceGreetingLifecycle()
  await verifyLocalPreferences()
  console.log('PASS: actual native voice callbacks preserve correction drafts/date/time, keep natural confirmation live, retain complete concise save questions, use iPad identity, prevent late startup, cancel preparation safely, and confirm only successful saves. Offline mocks only; no real audio or server result is claimed.')
}
module.exports = { verifyVoiceGreetingLifecycle }
if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
