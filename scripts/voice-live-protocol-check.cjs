#!/usr/bin/env node
'use strict'

// Offline protocol checks: actual TypeScript code, synthetic HTTP/WebRTC mocks.
// No local environment, real account, provider, server or microphone is accessed.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
function sourceWithoutImports(relative) {
  const file = ts.createSourceFile(relative, fs.readFileSync(path.join(root, relative), 'utf8'), ts.ScriptTarget.Latest, true)
  return file.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => node.getText(file)).join('\n')
}
const routeSource = sourceWithoutImports('app/api/native/voice-assistant/realtime/route.ts')
const nativeSource = sourceWithoutImports('native/src/voice/realtimeVoice.ts')
const compile = (code) => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const noop = () => {}
const quiet = { info: noop, warn: noop, error: noop }
const tick = () => new Promise((resolve) => setImmediate(resolve))
class NextResponse extends Response {
  static json(data, options = {}) {
    return new NextResponse(JSON.stringify(data), { ...options, headers: { 'content-type': 'application/json', ...options.headers } })
  }
}
async function routeCase(options = {}) {
  const providerCalls = []
  const charges = []
  const debits = []
  const logs = []
  const claimQueries = []
  const sockets = []
  const socketTimers = new Map()
  const ledger = options.ledger || []
  let timerSequence = 0
  const controller = new AbortController()
  if (options.alreadyAborted) controller.abort()
  const env = { HELFI_VOICE_REALTIME_ENABLED: 'true', OPENAI_API_KEY: 'synthetic-offline-placeholder', ...(options.env || {}) }
  class MockWebSocket extends EventTarget {
    constructor(url, init) {
      super()
      this.url = url
      this.init = init
      this.sent = []
      this.closes = 0
      this.acknowledged = false
      sockets.push(this)
      queueMicrotask(() => this.dispatchEvent(new Event(options.cleanupError ? 'error' : 'open')))
    }
    send(text) {
      const event = JSON.parse(text)
      this.sent.push(event)
      if (event.type === 'session.close' && !options.cleanupNoAck) {
        queueMicrotask(() => {
          const reply = new Event('message')
          reply.data = JSON.stringify({ type: 'session.closed' })
          this.acknowledged = true
          this.dispatchEvent(reply)
        })
      }
    }
    close() { this.closes++; this.dispatchEvent(new Event('close')) }
  }
  class CreditManager {
    constructor(userId) { this.userId = userId }
    async getWalletStatus() { return options.wallet || { plan: 'synthetic-paid', totalAvailableCents: 100 } }
    async chargeCentsOnce(amount, details) {
      charges.push({ amount, details })
      if (options.chargeFailure) return { success: false, charged: false, reused: false }
      const prior = ledger.find((entry) => entry.userId === this.userId && entry.runId === details.runId && entry.feature === details.feature && entry.success && entry.errorMessage !== 'insufficient_credits')
      if (prior || options.reused) return { success: true, charged: false, reused: true }
      debits.push(amount)
      ledger.push({ userId: this.userId, runId: details.runId, feature: details.feature, createdAt: new Date(), success: true, errorMessage: null })
      if (options.abortDuringCharge) controller.abort()
      return { success: true, charged: true, reused: false }
    }
  }
  const box = {
    exports: {}, process: { env }, NextResponse, crypto, AbortController, FormData, Date, Promise, console: quiet,
    resolveHelfiRealtimeVoice: () => 'marin', exactChatGptVoiceAvailable: () => false,
    aiConsentRequiredResponse: async () => options.deniedConsent ? NextResponse.json({ error: 'Synthetic consent denied' }, { status: 403 }) : null,
    getUserIdFromNativeAuth: async () => options.unauthorized ? null : 'synthetic-user', getServerSession: async () => null,
    authOptions: {}, prisma: {
      user: { findUnique: async () => ({ id: 'synthetic-user' }) },
      aIUsageEvent: { findFirst: async (query) => {
        claimQueries.push(query)
        const { where } = query
        return ledger.find((entry) => entry.userId === where.userId && entry.runId === where.runId && entry.feature === where.feature && entry.createdAt >= where.createdAt.gte) || null
      } },
    }, CreditManager,
    WebSocket: MockWebSocket,
    setTimeout: (fn, delay) => { const id = ++timerSequence; socketTimers.set(id, { fn, delay }); return id },
    clearTimeout: (id) => socketTimers.delete(id),
    assertAiUsageAllowed: async () => { if (options.safety) throw { syntheticSafety: true } },
    isAiSafetyError: (error) => Boolean(error.syntheticSafety), logAiUsageEvent: async (event) => { logs.push(event) },
    fetch: async (url, request) => {
      providerCalls.push({ url, request })
      if (options.abortDuringProvider) controller.abort()
      if (options.providerThrow) throw new Error('Synthetic network failure')
      const body = options.providerBody ?? (options.legacy ? 'synthetic-answer-sdp' : JSON.stringify({ session: { id: 'synthetic-live-session' }, transport: { sdp: 'synthetic-answer-sdp' } }))
      return { ok: !options.providerBad, status: options.providerBad ? 503 : 200, text: async () => body }
    },
  }
  vm.createContext(box)
  vm.runInContext(compile(routeSource), box, { timeout: 5000 })
  const headers = new Headers({ authorization: 'synthetic-token', 'x-helfi-ai-consent': options.headerConsent === false ? 'false' : 'true', 'x-helfi-voice-session-id': 'synthetic-conversation-123' })
  if (!options.legacy) headers.set('x-helfi-voice-protocol', 'live-v1')
  const request = { headers, signal: controller.signal, text: async () => options.emptyOffer ? '' : 'synthetic-complete-offer', nextUrl: new URL('https://offline.invalid/api/native/voice-assistant/realtime') }
  const running = box.exports.POST(request)
  await tick()
  if (options.cleanupNoAck) {
    for (const { fn } of [...socketTimers.values()]) fn()
  }
  const response = await running
  return { response, text: await response.text(), providerCalls, charges, debits, logs, claimQueries, ledger, sockets, socketTimers }
}
async function checkRoute() {
  const live = await routeCase()
  assert.equal(live.response.status, 200)
  assert.equal(live.providerCalls[0].url, 'https://api.openai.com/v1/live/sessions')
  const body = JSON.parse(live.providerCalls[0].request.body)
  assert.equal(body.session.model, 'gpt-live-1')
  assert.equal(body.session.store, false)
  assert.equal(body.session.delegation.responses.model, 'gpt-6-luna')
  assert.equal(body.session.delegation.responses.parallel_tool_calls, false)
  assert.ok(body.session.delegation.responses.tools.some((tool) => tool.name === 'request_helfi_action'))
  assert.equal(body.transport.type, 'webrtc')
  assert.equal(body.transport.sdp, 'synthetic-complete-offer')
  assert.equal(live.response.headers.get('x-helfi-voice-protocol'), 'live-v1')
  assert.equal(JSON.parse(live.text).transport.sdp, 'synthetic-answer-sdp')
  assert.equal(live.charges.length, 1)
  assert.equal(live.charges[0].details.model, 'gpt-live-1')
  assert.equal(live.sockets.length, 0, 'Successful client handoff must keep its Live session open')
  const legacy = await routeCase({ legacy: true })
  assert.equal(legacy.response.status, 200)
  assert.equal(legacy.providerCalls[0].url, 'https://api.openai.com/v1/realtime/calls')
  assert.equal(JSON.parse(legacy.providerCalls[0].request.body.get('session')).model, 'gpt-realtime-2.1')
  assert.equal(legacy.providerCalls[0].request.body.get('sdp'), 'synthetic-complete-offer')
  assert.equal(legacy.text, 'synthetic-answer-sdp')
  assert.equal(legacy.response.headers.get('x-helfi-voice-protocol'), 'realtime')
  assert.equal(legacy.sockets.length, 0)
  const cases = [
    [{ unauthorized: true }, 401, false], [{ deniedConsent: true }, 403, false],
    [{ headerConsent: false }, 403, false], [{ emptyOffer: true }, 400, false],
    [{ wallet: { totalAvailableCents: 100, topUps: [] } }, 402, false],
    [{ wallet: { plan: 'synthetic-paid', totalAvailableCents: 9 } }, 402, false],
    [{ safety: true }, 429, false], [{ env: { HELFI_VOICE_REALTIME_ENABLED: 'false' } }, 503, false],
    [{ env: { OPENAI_API_KEY: '' } }, 500, false], [{ providerBad: true }, 502, true],
    [{ providerThrow: true }, 500, true], [{ providerBody: '{}' }, 502, true],
    [{ providerBody: 'invalid synthetic JSON' }, 500, true], [{ abortDuringProvider: true }, 499, true],
  ]
  for (const [options, status, providerExpected] of cases) {
    const result = await routeCase(options)
    assert.equal(result.response.status, status, JSON.stringify(options))
    assert.equal(result.providerCalls.length, Number(providerExpected), JSON.stringify(options))
    assert.equal(result.charges.length, 0, `Failure must not charge: ${JSON.stringify(options)}`)
    assert.equal(result.debits.length, 0)
    assert.equal(result.socketTimers.size, 0)
  }
  const reused = await routeCase({ reused: true })
  assert.equal(reused.response.headers.get('x-helfi-charged-credits'), '0')
  assert.equal(reused.logs[0].costCents, 0)
  const failedCharge = await routeCase({ chargeFailure: true })
  assert.equal(failedCharge.response.status, 402)
  assert.equal(failedCharge.logs.length, 0)
  assert.equal(failedCharge.debits.length, 0)
  const cancelled = await routeCase({ alreadyAborted: true })
  assert.equal(cancelled.response.status, 499)
  assert.equal(cancelled.charges.length, 0)
  assert.equal(cancelled.providerCalls.length, 0, 'An already-cancelled request must not create a provider session')
  function assertClosed(result, expectedId = 'synthetic-live-session') {
    assert.equal(result.sockets.length, 1, 'An allocated Live session that was not handed off needs cleanup')
    const socket = result.sockets[0]
    assert.equal(socket.url, `wss://api.openai.com/v1/live/sessions/${encodeURIComponent(expectedId)}/attach`)
    assert.equal(socket.init.headers.Authorization, 'Bearer synthetic-offline-placeholder')
    assert.ok(socket.init.headers['OpenAI-Safety-Identifier'])
    assert.equal(socket.sent.length, 1)
    assert.equal(socket.sent[0].type, 'session.close')
    assert.equal(socket.acknowledged, true, 'Cleanup requires a session.closed acknowledgement')
    assert.equal(socket.closes, 1)
    assert.equal(result.socketTimers.size, 0)
  }
  assertClosed(failedCharge)
  const afterProviderCancel = await routeCase({ abortDuringProvider: true })
  assert.equal(afterProviderCancel.charges.length, 0)
  assertClosed(afterProviderCancel)
  const missingSdp = await routeCase({ providerBody: JSON.stringify({ session: { id: 'synthetic/orphan id' }, transport: {} }) })
  assert.equal(missingSdp.response.status, 502)
  assert.equal(missingSdp.debits.length, 0)
  assertClosed(missingSdp, 'synthetic/orphan id')
  for (const failure of ['cleanupNoAck', 'cleanupError']) {
    const result = await routeCase({ chargeFailure: true, [failure]: true })
    assert.equal(result.response.status, 402)
    assert.equal(result.socketTimers.size, 0, 'Failed cleanup must also release its timeout')
    assert.equal(result.sockets[0].acknowledged, false)
    assert.equal(result.sockets[0].closes, 1)
  }
  const duringCharge = await routeCase({ abortDuringCharge: true })
  assert.equal(duringCharge.response.status, 499)
  assert.equal(duringCharge.debits.length, 1)
  assert.equal(duringCharge.ledger.length, 1, 'Cancellation must retain the successful retry claim')
  assertClosed(duringCharge)
  const emptyWallet = { totalAvailableCents: 0, topUps: [], additionalCreditsCents: 0 }
  const retry = await routeCase({ ledger: duringCharge.ledger, wallet: emptyWallet })
  assert.equal(retry.response.status, 200, 'A paid conversation can reconnect with a zero wallet')
  assert.equal(retry.debits.length, 0, 'An already-paid retry must not debit again')
  assert.equal(retry.charges.length, 1, 'The final atomic charge authority must still run')
  assert.equal(retry.response.headers.get('x-helfi-charged-credits'), '0')
  assert.equal(retry.sockets.length, 0)
  const query = retry.claimQueries[0]
  assert.equal(query.where.userId, 'synthetic-user')
  assert.equal(query.where.runId, duringCharge.ledger[0].runId)
  assert.equal(query.where.feature, 'voice-assistant:realtime-charge-marker')
  assert.ok(Math.abs(query.where.createdAt.gte.getTime() - (Date.now() - 2 * 60 * 60 * 1000)) < 2000)
  const base = duringCharge.ledger[0]
  for (const changes of [
    { userId: 'another-synthetic-user' }, { runId: 'another-conversation' },
    { feature: 'another-feature' }, { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000 - 5000) },
    { success: false }, { errorMessage: 'insufficient_credits' },
  ]) {
    const denied = await routeCase({ ledger: [{ ...base, ...changes }], wallet: emptyWallet })
    assert.equal(denied.response.status, 402, `Out-of-scope/invalid claim cannot bypass paid access: ${JSON.stringify(changes)}`)
    assert.equal(denied.providerCalls.length, 0)
    assert.equal(denied.charges.length, 0)
  }
  const finalAuthority = await routeCase({ ledger: duringCharge.ledger, wallet: emptyWallet, chargeFailure: true })
  assert.equal(finalAuthority.response.status, 402, 'A preliminary claim lookup cannot override final atomic charge failure')
  assertClosed(finalAuthority)
}
function nativeHarness(options = {}) {
  const statuses = [], errors = [], transcripts = [], assistant = [], actions = [], sent = [], requests = []
  const timers = new Map()
  let sequence = 0, clock = 1000000, trackStops = 0, closes = 0, userSpeech = 0, pc
  let outputEnergy = 0, outputLevel = 0
  const schedule = (fn, delay, repeat) => { const id = ++sequence; timers.set(id, { fn, delay, at: clock + delay, repeat }); return id }
  class ClockDate extends Date { static now() { return clock } }
  const localTrack = { enabled: true, stop: () => { trackStops++ } }
  const remoteTrack = { kind: 'audio', enabled: true, _setVolume: noop, stop: () => { trackStops++ } }
  const localStream = { getTracks: () => [localTrack], getAudioTracks: () => [localTrack] }
  class Peer {
    constructor(configuration) { pc = this; this.configuration = configuration; this.connectionState = 'new'; this.iceGatheringState = options.waitIce ? 'gathering' : 'complete'; this.onicegatheringstatechange = noop }
    addTrack() {}
    close() { closes++ }
    getSenders() { return [{ track: localTrack }] }
    getReceivers() { return [{ track: remoteTrack }] }
    getTransceivers() { return [] }
    async getStats() { return [
      { type: 'outbound-rtp', kind: 'audio', packetsSent: options.missingMicrophone ? 0 : 10, bytesSent: options.missingMicrophone ? 0 : 100 },
      { type: 'inbound-rtp', kind: 'audio', packetsReceived: 100, bytesReceived: 10000, audioLevel: outputLevel, totalAudioEnergy: outputEnergy },
    ] }
    createDataChannel() { this.channel = { readyState: 'open', send: (data) => sent.push(JSON.parse(data)), close: noop }; return this.channel }
    async createOffer() { return { sdp: 'synthetic-initial-offer' } }
    async setLocalDescription() { this.localDescription = { sdp: 'synthetic-complete-offer' } }
    async setRemoteDescription(answer) {
      assert.equal(answer.sdp, 'synthetic-answer-sdp')
      this.channel.onopen()
      this.connectionState = 'connected'; this.onconnectionstatechange()
      if (!options.missingSpeaker) this.ontrack({ track: remoteTrack, streams: [] })
      if (!options.missingSession) this.channel.onmessage({ data: JSON.stringify({ type: options.legacy ? 'session.created' : 'session.started' }) })
    }
  }
  const box = {
    exports: {}, process: { env: {} }, __DEV__: false, API_BASE_URL: 'https://offline.invalid', console: quiet,
    Date: ClockDate, Promise, Map, Set, Error, AbortController, buildNativeAuthHeaders: () => ({ authorization: 'synthetic-token' }),
    setTimeout: (fn, delay) => schedule(fn, delay, false), clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: (id) => timers.delete(id),
    require: (name) => name === 'react-native-webrtc'
      ? { RTCPeerConnection: Peer, RTCSessionDescription: function(value) { return value }, mediaDevices: { getUserMedia: async () => localStream } }
      : name === 'react-native-incall-manager' ? { start: noop, stop: noop, setForceSpeakerphoneOn: noop, setSpeakerphoneOn: noop } : { NativeModules: {} },
    fetch: async (url, request) => {
      requests.push({ url, request })
      return { ok: true, headers: new Headers(options.legacy ? {} : { 'x-helfi-voice-protocol': 'live-v1' }), text: async () => options.legacy ? 'synthetic-answer-sdp' : JSON.stringify({ session: { id: 'synthetic-live-session' }, transport: { sdp: 'synthetic-answer-sdp' } }) }
    },
  }
  vm.createContext(box)
  vm.runInContext(compile(`${nativeSource}\nglobalThis.auditEcho = likelyAssistantEcho`), box, { timeout: 5000 })
  const controller = new AbortController()
  const started = box.exports.startHelfiRealtimeVoiceSession({
    token: 'synthetic-token', billingSessionId: 'synthetic-conversation-123', signal: controller.signal,
    callbacks: {
      onStatus: (status) => statuses.push(status), onError: (error) => errors.push(error),
      onTranscript: (text) => transcripts.push(text), onAssistantText: (text) => assistant.push(text), onUserSpeech: () => { userSpeech++; options.onUserSpeech?.() },
      onActionRequest: async (args) => { actions.push(args); return options.action ? options.action(args) : { ok: true, saved: false, safeToClaimSaved: false, needsReview: true, spokenReply: 'Synthetic review. Would you like me to save that for you?' } },
    },
  }).then((session) => ({ session }), (error) => ({ error }))
  const emit = (payload) => pc.channel.onmessage?.({ data: JSON.stringify(payload) })
  const advance = async (duration) => {
    clock += duration
    for (const [id, timer] of [...timers]) {
      if (!timers.has(id) || timer.at > clock) continue
      if (timer.repeat) timer.at = clock + timer.delay
      else timers.delete(id)
      timer.fn()
    }
    await tick()
  }
  return { box, started, controller, statuses, errors, transcripts, assistant, actions, sent, requests, timers, emit, advance,
    output: (energy, level = 0) => { outputEnergy = energy; outputLevel = level },
    peer: () => pc, stoppedTracks: () => trackStops, closes: () => closes, userSpeech: () => userSpeech }
}
const toolEvent = (id) => ({ type: 'response.event', event: { type: 'response.output_item.done', item: { type: 'function_call', name: 'request_helfi_action', call_id: id, arguments: JSON.stringify({ request: 'log 250 ml water', action: 'water', needsReview: true }) } } })
async function checkNative() {
  const native = nativeHarness()
  const { session, error } = await native.started
  assert.ok(session, error?.message)
  assert.ok(native.statuses.includes('live'))
  assert.equal(native.peer().configuration.iceServers.length, 0, 'OpenAI media must not wait for an unrelated external STUN service')
  assert.equal(native.requests[0].request.headers['x-helfi-voice-protocol'], 'live-v1')
  assert.equal(native.requests[0].request.body, 'synthetic-complete-offer')
  assert.equal(native.box.auditEcho('no milk', '100 ml coffee with milk', Date.now()), false)
  native.emit({ type: 'session.output_transcript.delta', event_id: 'assistant-1', delta: 'Here is your ', start_ms: 0, end_ms: 100 })
  native.emit({ type: 'session.output_transcript.delta', event_id: 'assistant-2', delta: 'review.', start_ms: 100, end_ms: 200 })
  await native.advance(250)
  assert.ok(!native.statuses.includes('speaking'), 'Caption/packet arrival alone cannot prove audible speech')
  native.output(0.03)
  await native.advance(250)
  assert.equal(native.statuses.at(-1), 'speaking', 'Increasing output audio energy is actual playback evidence')
  await native.advance(750)
  assert.equal(native.statuses.at(-1), 'live')
  assert.equal(native.assistant[0], 'Here is your review.')
  native.emit({ type: 'session.input_transcript.delta', event_id: 'user-1', delta: 'no ', start_ms: 300, end_ms: 400 })
  native.emit({ type: 'session.input_transcript.delta', event_id: 'user-2', delta: 'milk', start_ms: 400, end_ms: 500 })
  native.emit({ type: 'session.input_transcript.delta', event_id: 'user-2', delta: 'milk', start_ms: 400, end_ms: 500 })
  assert.equal(native.userSpeech(), 0, 'Live captions are display evidence, not authoritative speech-start cancellation')
  assert.equal(native.actions.length, 0, 'Caption fragments never execute app actions')
  native.emit(toolEvent('call-1'))
  native.emit(toolEvent('call-1'))
  await tick()
  assert.equal(native.actions.length, 1)
  assert.equal(native.transcripts[0], 'no milk')
  const result = native.sent.find((item) => item.type === 'response.item.create')
  assert.equal(result.item.type, 'function_call_output')
  assert.equal(result.item.call_id, 'call-1')
  assert.equal(JSON.parse(result.item.output).safeToClaimSaved, false)
  assert.ok(native.sent.some((item) => item.type === 'response.create'))
  native.emit({ type: 'response.event', event: { type: 'response.failed' } })
  assert.ok(native.errors.at(-1).includes('Nothing is confirmed saved'))
  session.promptAssistant('Synthetic clarification')
  assert.ok(native.sent.some((item) => item.type === 'session.instructions.append'))
  native.emit({ type: 'session.input_transcript.delta', event_id: 'late-caption', delta: 'pending', start_ms: 500, end_ms: 600 })
  const oldHandler = native.peer().channel.onmessage
  await session.stop()
  oldHandler({ data: JSON.stringify(toolEvent('after-stop')) })
  await native.advance(15000)
  assert.equal(native.actions.length, 1)
  assert.equal(native.transcripts.length, 1, 'Stopped captions do not flush later')
  assert.equal(native.timers.size, 0)
  assert.ok(native.stoppedTracks() > 0 && native.closes() > 0)
  assert.ok(native.sent.some((item) => item.type === 'session.close'))
  for (const action of [async () => { throw new Error('Synthetic app failure') }, () => null]) {
    const errored = nativeHarness({ action })
    const failedSession = (await errored.started).session
    errored.emit(toolEvent('failed-call'))
    await tick()
    const failedOutput = JSON.parse(errored.sent.find((item) => item.type === 'response.item.create').item.output)
    assert.equal(failedOutput.saved, false)
    assert.equal(failedOutput.safeToClaimSaved, false)
    await failedSession.stop()
    assert.equal(errored.timers.size, 0)
  }
  let completeAction
  const preparation = new AbortController()
  const pending = nativeHarness({ onUserSpeech: () => preparation.abort(), action: () => new Promise((resolve) => { completeAction = resolve }) })
  const pendingSession = (await pending.started).session
  pending.emit(toolEvent('pending-call'))
  await tick()
  const stateBeforeDelayedCaption = pending.statuses.at(-1)
  pending.emit({ type: 'session.input_transcript.delta', event_id: 'delayed-original-caption', delta: 'log water', start_ms: 0, end_ms: 100 })
  assert.equal(preparation.signal.aborted, false, 'A delayed caption for the original request must not cancel its already-issued action')
  assert.equal(pending.statuses.at(-1), stateBeforeDelayedCaption, 'Delayed display captions must not replace actual preparation state with a claim that the microphone currently hears speech')
  await pendingSession.stop()
  completeAction({ saved: true, safeToClaimSaved: true })
  await tick()
  assert.equal(pending.sent.filter((item) => item.type === 'response.item.create').length, 0, 'A late completed tool must not restart a stopped conversation')
  assert.equal(pending.timers.size, 0)
  const gathering = nativeHarness({ waitIce: true })
  await tick()
  assert.equal(gathering.requests.length, 0, 'Wait for ICE gathering before submitting the full offer')
  await gathering.advance(8000)
  assert.equal(gathering.requests.length, 0, 'A valid gathering delay must retain its separate ten-second budget')
  gathering.peer().iceGatheringState = 'complete'
  gathering.peer().onicegatheringstatechange()
  const gathered = await gathering.started
  assert.ok(gathered.session)
  assert.equal(gathering.requests[0].request.body, 'synthetic-complete-offer')
  await gathered.session.stop()
  assert.equal(gathering.timers.size, 0)
  const gatheringTimeout = nativeHarness({ waitIce: true })
  await tick()
  await gatheringTimeout.advance(10000)
  const timedOut = await gatheringTimeout.started
  assert.match(timedOut.error?.message || '', /media connection took too long/)
  assert.equal(gatheringTimeout.requests.length, 0)
  assert.equal(gatheringTimeout.timers.size, 0)
  assert.ok(gatheringTimeout.stoppedTracks() > 0 && gatheringTimeout.closes() > 0)
  for (const option of ['waitIce', 'missingMicrophone', 'missingSpeaker', 'missingSession']) {
    const waiting = nativeHarness({ [option]: true })
    await tick()
    assert.ok(!waiting.statuses.includes('live'), `${option} must not look ready`)
    waiting.controller.abort()
    const settled = await waiting.started
    assert.ok(settled.error)
    assert.equal(waiting.timers.size, 0)
    assert.ok(waiting.stoppedTracks() > 0 && waiting.closes() > 0)
    if (option === 'waitIce') assert.equal(waiting.requests.length, 0, 'Cancel during ICE must not reach provider handshake')
  }
  const repeatedStart = nativeHarness()
  const repeatedSession = (await repeatedStart.started).session
  repeatedStart.emit({ type: 'session.started' })
  await repeatedSession.stop()
  assert.equal(repeatedStart.timers.size, 0, 'Repeated session-start notification must not leak a playback timer')
  const immediate = nativeHarness()
  const immediateSession = (await immediate.started).session
  immediate.emit(toolEvent('stop-before-microtask'))
  await immediateSession.stop()
  await tick()
  assert.equal(immediate.actions.length, 0, 'A queued tool must not start app work after stop')
  assert.equal(immediate.timers.size, 0)
  const legacy = nativeHarness({ legacy: true })
  const legacySession = (await legacy.started).session
  legacy.emit({ type: 'response.function_call_arguments.done', name: 'request_helfi_action', call_id: 'legacy-call', arguments: JSON.stringify({ request: 'log water', action: 'water', needsReview: true }) })
  await tick()
  assert.ok(legacy.sent.some((item) => item.type === 'conversation.item.create' && item.item.call_id === 'legacy-call'))
  await legacySession.stop()
  assert.ok(legacy.sent.some((item) => item.type === 'response.cancel'))
  assert.equal(legacy.timers.size, 0)
}
async function checkMetering() {
  const source = sourceWithoutImports('lib/cost-meter.ts')
  function meter(env = {}) {
    const box = { exports: {}, process: { env } }
    vm.createContext(box)
    vm.runInContext(compile(source), box, { timeout: 5000 })
    return box.exports.estimateTranscriptionCostCents
  }
  const estimate = meter()
  assert.equal(estimate(600), 6, 'Existing callers retain the mini-transcribe rate and 2x markup')
  assert.equal(estimate(600, 'gpt-4o-mini-transcribe'), 6)
  assert.equal(estimate(600, 'gpt-transcribe'), 9, 'New transcription model uses its own rate and the same markup')
  assert.equal(estimate(-1, 'gpt-transcribe'), 1)
  assert.equal(estimate(NaN), 1)
  assert.equal(meter({ HELFI_PRICE_GPT_TRANSCRIBE_USD_PER_MINUTE: '0.009' })(600, 'gpt-transcribe'), 18)
}
async function main() {
  const errors = []
  for (const [name, check] of [['route', checkRoute], ['native', checkNative], ['model metering', checkMetering]]) {
    try { await check(); console.log(`PASS: ${name} Live protocol checks (offline mocks).`) }
    catch (error) { errors.push(`${name}: ${error.stack || error.message}`) }
  }
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('PASS: negotiated Live/legacy config, guarded handshake, safe tools, captions/audio evidence, ICE cancellation and cleanup. No real server/audio result is claimed.')
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
