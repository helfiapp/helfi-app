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
const localWelcomeSource = sourceWithoutImports('native/src/voice/localVoiceWelcome.ts')
const liveUsageSource = sourceWithoutImports('native/src/voice/liveVoiceUsage.ts')
const liveToolTurnSource = sourceWithoutImports('native/src/voice/liveVoiceToolTurn.ts')
const voiceJobsSource = sourceWithoutImports('native/src/voice/voiceSessionJobs.ts')
const generalAssistantSource = sourceWithoutImports('native/src/voice/generalAssistantActions.ts')
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
  const starts = [], snapshots = [], discoveries = [], wallets = [], auth = []
  const controller = new AbortController()
  if (options.alreadyAborted) controller.abort()
  // Synthetic presence only. No local settings or real credential is read.
  const env = { HELFI_VOICE_REALTIME_ENABLED: 'true', OPENAI_API_KEY: 'synthetic-offline-placeholder', ...(options.env || {}) }
  class CreditManager {
    constructor(userId) { this.userId = userId }
    async getWalletStatus() { wallets.push(this.userId); return options.wallet || { plan: 'synthetic-paid', totalAvailableCents: 100 } }
    async chargeCents() { throw Error('Route cannot make an unmetered flat charge') }
    async chargeCentsOnce() { throw Error('Route cannot revive a flat session charge') }
  }
  const answer = { session: { id: 'synthetic-provider-session' }, transport: { sdp: 'synthetic-answer-sdp' }, helfiSession: { id: 'owned-financial-session', reservedCredits: 10 }, delegation: 'server' }
  const actions = [{ id: 'water.read', kind: 'read', description: 'Read owned water', input: { type: 'object', properties: {}, required: [] } }]
  const box = {
    exports: {}, process: { env }, NextResponse, crypto, AbortController, FormData, Buffer, Date, Intl, Promise, console: quiet,
    resolveHelfiRealtimeVoice: () => 'marin', exactChatGptVoiceAvailable: () => false,
    aiConsentRequiredResponse: async () => options.deniedConsent ? NextResponse.json({ error: 'Synthetic consent denied' }, { status: 403 }) : null,
    getUserIdFromNativeAuth: async () => { auth.push('native'); return options.unauthorized ? null : 'synthetic-user' },
    getServerSession: async () => { auth.push('web'); return options.web ? { user: { id: 'synthetic-user' } } : null },
    authOptions: {}, prisma: { user: { findUnique: async () => options.missingWebUser ? null : ({ id: 'synthetic-user' }) } }, CreditManager,
    createNativeAssistantApp: (_request, timeZone) => ({ host: {
      snapshot: async (context, sessionId) => {
        snapshots.push({ context, sessionId, timeZone })
        assert.equal(context.actorId, 'synthetic-user')
        if (options.foreignSession) throw Error('Synthetic owned conversation mismatch')
        if (options.abortDuringSnapshot) controller.abort()
        return { id: sessionId, actorId: context.actorId, revision: 7, steps: [] }
      },
      discover: context => { discoveries.push(context); return actions },
    } }),
    startMeteredLiveVoiceSession: async input => {
      starts.push(input)
      if (options.safety) throw { syntheticSafety: true }
      if (options.startThrow) throw Error('Synthetic monitor unavailable')
      if (options.startRefused) return NextResponse.json({ code: 'voice_budget_unavailable' }, { status: 402 })
      return NextResponse.json(answer, { headers: { 'x-helfi-voice-protocol': 'live-v1', 'x-helfi-charged-credits': '0' } })
    },
    isAiSafetyError: error => Boolean(error?.syntheticSafety),
    fetch: () => { throw Error('Route must delegate all paid allocation to the metered startup') },
  }
  vm.createContext(box)
  vm.runInContext(compile(sourceWithoutImports('lib/native-assistant-registry.ts') + '\n' + sourceWithoutImports('lib/native-voice-time.ts') + '\n' + routeSource), box, { timeout: 5000 })
  const headers = new Headers({ authorization: 'synthetic-token', 'x-helfi-ai-consent': 'true', 'x-helfi-voice-protocol': 'live-v1', 'x-helfi-voice-metering': 'server-v1', 'x-helfi-voice-capabilities': 'general-assistant-v1,symptom-analysis-v1', 'x-helfi-assistant-session-id': 'owned-app-conversation', 'x-helfi-assistant-local-date': '2026-10-18', 'x-helfi-assistant-time-zone': 'Australia/Melbourne', 'x-helfi-voice-attempt-id': 'synthetic-attempt-12345' })
  for (const [name,value] of Object.entries(options.headers || {})) value === null ? headers.delete(name) : headers.set(name,value)
  if (options.legacy) headers.delete('x-helfi-voice-protocol')
  if (options.bundledWelcome) headers.set('x-helfi-voice-greeting','bundled-clip')
  const request = { headers, signal: controller.signal, text: async () => options.offer === undefined ? 'synthetic-complete-offer' : options.offer, nextUrl: new URL('https://offline.invalid/api/native/voice-assistant/realtime' + (options.readiness ? '?readiness=1' : '')) }
  const response = await box.exports[options.method || 'POST'](request)
  return { response, body: await response.json(), starts, snapshots, discoveries, wallets, auth, request }
}
async function checkRoute() {
  const live = await routeCase()
  assert.equal(live.response.status, 200, JSON.stringify(live.body))
  assert.equal(live.starts.length,1); assert.equal(live.snapshots.length,1); assert.equal(live.discoveries.length,1)
  const input = live.starts[0]
  assert.equal(input.request,live.request); assert.equal(input.userId,'synthetic-user'); assert.equal(input.sdp,'synthetic-complete-offer')
  assert.equal(input.general.sessionId,'owned-app-conversation'); assert.equal(input.general.localDate,'2026-10-18'); assert.equal(input.general.timeZone,'Australia/Melbourne')
  assert.equal(input.general.snapshot.actorId,input.userId); assert.equal(input.general.snapshot.revision,7)
  assert.equal(input.general.actions[0].id,'water.read')
  assert.equal(input.frontend.model,'gpt-live-1'); assert.equal(input.frontend.store,false); assert.equal(input.frontend.audio.output.voice,'marin')
  assert.equal(input.frontend.delegation.type,'client'); assert.equal(input.frontend.delegation.responses,undefined,'A client cannot launch an unreserved Responses backend')
  assert.equal(input.frontend.input,undefined,'No provider-generated paid opening welcome')
  assert.equal(live.wallets.length,0,'Funding/credit authority belongs to actual metered startup, not a second flat route charge')
  assert.equal(live.body.delegation,'server'); assert.equal(live.body.helfiSession.id,'owned-financial-session'); assert.equal(live.response.headers.get('x-helfi-charged-credits'),'0')
  const bundled=await routeCase({bundledWelcome:true})
  assert.match(bundled.starts[0].frontend.instructions,/application plays its own opening welcome recording/)
  assert.equal(bundled.starts[0].frontend.input,undefined)
  const cases=[
    [{deniedConsent:true},403], [{unauthorized:true},401], [{alreadyAborted:true},499],
    [{headers:{'x-helfi-ai-consent':'false'}},403], [{headers:{'x-helfi-ai-consent':null}},403],
    [{env:{HELFI_VOICE_REALTIME_ENABLED:'false'}},503], [{env:{OPENAI_API_KEY:''}},503],
    [{offer:''},400], [{offer:'   '},400], [{offer:'x'.repeat(160001)},400], [{offer:'💚'.repeat(40001)},400],
    [{legacy:true},426], [{headers:{'x-helfi-voice-protocol':'realtime'}},426],
    [{headers:{'x-helfi-voice-metering':null}},426], [{headers:{'x-helfi-voice-metering':'client-v1'}},426],
    [{headers:{'x-helfi-voice-capabilities':'legacy-only'}},400],
    [{headers:{'x-helfi-assistant-session-id':'foreign/unsafe'}},503], [{headers:{'x-helfi-assistant-session-id':''}},503],
    [{headers:{'x-helfi-assistant-time-zone':'Invalid/Zone'}},503], [{headers:{'x-helfi-assistant-local-date':'2026-02-30'}},503],
    [{foreignSession:true},503], [{abortDuringSnapshot:true},503],
  ]
  for(const[options,status]of cases){const result=await routeCase(options);assert.equal(result.response.status,status,JSON.stringify(options));assert.equal(result.starts.length,0,'Denied preflight must not allocate provider/funding: '+JSON.stringify(options));assert.equal(result.wallets.length,0)}
  const denied=await routeCase({deniedConsent:true});assert.equal(denied.auth.length,0);assert.equal(denied.snapshots.length,0)
  const web=await routeCase({unauthorized:true,web:true});assert.equal(web.response.status,200);assert.equal(web.starts[0].userId,'synthetic-user')
  assert.equal((await routeCase({unauthorized:true,web:true,missingWebUser:true})).response.status,401)
  for(const[options,status]of [[{safety:true},429],[{startThrow:true},503],[{startRefused:true},402]]){const result=await routeCase(options);assert.equal(result.response.status,status);assert.equal(result.starts.length,1)}
  for(const legacy of[false,true]){const ready=await routeCase({method:'GET',readiness:true,legacy});assert.equal(ready.body.ready,true);assert.equal(ready.body.model,'gpt-live-1');assert.equal(ready.body.protocol,'live-v1');assert.deepEqual(ready.body.supportedProtocols,['live-v1']);assert.equal(ready.body.metering,'server-v1');assert.equal(ready.starts.length,0);assert.equal(ready.auth.length,0)}
  assert.equal((await routeCase({method:'GET',readiness:true,env:{HELFI_VOICE_REALTIME_ENABLED:'false'}})).body.ready,false)
  assert.equal((await routeCase({method:'GET',readiness:true,env:{OPENAI_API_KEY:''}})).body.ready,false)
  const available=await routeCase({method:'GET'});assert.equal(available.body.available,true);assert.equal(available.body.protocol,'live-v1');assert.equal(available.starts.length,0)
  assert.equal((await routeCase({method:'GET',unauthorized:true})).response.status,401)
  assert.equal((await routeCase({method:'GET',wallet:{totalAvailableCents:100,topUps:[]}})).response.status,402)
}
function nativeHarness(options = {}) {
  const statuses = [], errors = [], notices = [], transcripts = [], assistant = [], actions = [], sent = [], requests = []
  const timers = new Map()
  let sequence = 0, clock = 1000000, trackStops = 0, closes = 0, userSpeech = 0, pc
  let outputEnergy = 0, outputLevel = 0, inputLevel = options.inputLevel || 0, inputEnergy = 0, inputDuration = 0
  const welcomePlays = [], welcomeStops = [], nativeListeners = new Map(), stages = [], jobs = [], jobResults = [], humans = [], usage = []
  let assetResolve, playResolve
  const emitWelcome = (status, extra = {}) => nativeListeners.get('HelfiVoiceWelcomePlayback')?.({ playbackId: welcomePlays.at(-1)?.id, status, ...extra })
  const bridge = { configureForVoice: async () => 'iPhone speaker', getVoiceAudioState: async () => ({}),
    playVoiceWelcome: async (uri, id) => { welcomePlays.push({uri,id}); if (options.failedWelcome) throw Error('Synthetic failure'); emitWelcome('started'); if(options.pendingPlay) return new Promise(resolve=>{playResolve=resolve}); return true },
    stopVoiceWelcome: async id => { welcomeStops.push(id) } }
  class NativeEventEmitter { addListener(name, listener) { nativeListeners.set(name, listener); return { remove: () => nativeListeners.delete(name) } } }
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
      { type: 'media-source', kind: 'audio', audioLevel: inputLevel, totalAudioEnergy: inputEnergy, totalSamplesDuration: inputDuration },
      { type: 'outbound-rtp', kind: 'audio', packetsSent: options.missingMicrophone ? 0 : 10, bytesSent: options.missingMicrophone ? 0 : 100 },
      { type: 'inbound-rtp', kind: 'audio', packetsReceived: 100, bytesReceived: 10000, audioLevel: outputLevel, totalAudioEnergy: outputEnergy },
    ] }
    createDataChannel() { this.channel = { readyState: 'open', send: (data) => {
      const event = JSON.parse(data); sent.push(event)
      if (event.type === 'session.close' && !options.missingFinalUsage) queueMicrotask(() => this.channel.onmessage?.({ data: JSON.stringify({ type: 'session.closed', usage: { seconds: 15 } }) }))
    }, close: noop }; return this.channel }
    async createOffer() { return { sdp: 'synthetic-initial-offer' } }
    async setLocalDescription() { this.localDescription = { sdp: 'synthetic-complete-offer' } }
    async setRemoteDescription(answer) {
      assert.equal(answer.sdp, 'synthetic-answer-sdp')
      this.channel.onopen()
      this.connectionState = 'connected'; this.onconnectionstatechange()
      if (!options.missingSpeaker) this.ontrack({ track: remoteTrack, streams: [] })
      if (options.userSpeaksFirst) this.channel.onmessage({ data: JSON.stringify(options.legacy ? { type: 'input_audio_buffer.speech_started' } : { type: 'session.input_transcript.delta', event_id: 'first-user', delta: 'Hello, I need help', start_ms: 0, end_ms: 400 }) })
      if (!options.missingSession) this.channel.onmessage({ data: JSON.stringify({ type: options.legacy ? 'session.created' : 'session.started' }) })
    }
  }
  const box = {
    exports: {}, process: { env: {} }, __DEV__: false, API_BASE_URL: 'https://offline.invalid', console: { ...quiet, info: (...args) => { if(args[0] === '[voice realtime usage]') usage.push(JSON.parse(args[1])) } },
    Date: ClockDate, Promise, Map, Set, Error, AbortController, buildNativeAuthHeaders: () => ({ authorization: 'synthetic-token' }),
    setTimeout: (fn, delay) => schedule(fn, delay, false), clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: (id) => timers.delete(id),
    require: (name) => name === 'react-native-webrtc'
      ? { RTCPeerConnection: Peer, RTCSessionDescription: function(value) { return value }, mediaDevices: { getUserMedia: async () => localStream } }
      : name === 'react-native-incall-manager' ? { start: noop, stop: noop, setForceSpeakerphoneOn: noop, setSpeakerphoneOn: noop }
      : name === 'expo-asset' ? { Asset: { fromModule: () => ({localUri: 'file:///synthetic/cache/helfi-welcome.mp3', downloadAsync: () => options.pendingAsset ? new Promise(resolve=>{assetResolve=resolve}) : Promise.resolve()}) } }
      : name.endsWith('/helfi-welcome.mp3') ? 42
      : name === 'react-native' ? { NativeModules: options.welcomeBridge ? {HelfiAudioRoute: bridge} : {}, NativeEventEmitter } : (()=>{throw Error('Unexpected native import')})(),
    fetch: async (url, request) => {
      requests.push({ url, request })
      if (String(url).includes('/voice-assistant/session')) {
        if (request.method === 'POST') { const body = JSON.parse(request.body); jobResults.push(body); const index = jobs.findIndex(job => job.callId === body.callId); if(index >= 0) jobs.splice(index,1); return {ok:true,json:async()=>({ok:true})} }
        return {ok:true,json:async()=>({sessionId:'synthetic-financial-session',state:'ready',jobs:JSON.parse(JSON.stringify(jobs))})}
      }
      return { ok: true, headers: new Headers(options.legacy ? {} : { 'x-helfi-voice-protocol': 'live-v1' }), text: async () => options.legacy ? 'synthetic-answer-sdp' : JSON.stringify({ session: { id: 'synthetic-live-session' }, transport: { sdp: 'synthetic-answer-sdp' }, ...(options.serverMetered ? {delegation:'server',helfiSession:{id:options.missingFinancialSession?'':'synthetic-financial-session'}} : {}) }) }
    },
  }
  vm.createContext(box)
  vm.runInContext(compile(`${localWelcomeSource}\n${liveUsageSource}\n${liveToolTurnSource}\n${voiceJobsSource}\n${generalAssistantSource}\n${nativeSource}\nglobalThis.auditEcho = likelyAssistantEcho`), box, { timeout: 5000 })
  const controller = new AbortController()
  const started = box.exports.startHelfiRealtimeVoiceSession({
    token: 'synthetic-token', billingSessionId: 'synthetic-conversation-123', signal: controller.signal, greetOnConnect: options.greetOnConnect,
    ...(options.serverMetered ? {assistantSessionId:'owned-app-conversation',localDate:'2026-10-18',timeZone:'Australia/Melbourne'} : {}),
    callbacks: {
      onConnectStage: stage => stages.push(stage), onStatus: (status) => statuses.push(status), onError: (error) => errors.push(error), onNotice: (notice) => notices.push(notice),
      onTranscript: (text) => transcripts.push(text), onHumanTranscript: text => humans.push(text), onAssistantText: (text) => assistant.push(text), onUserSpeech: () => { userSpeech++; options.onUserSpeech?.() },
      onActionRequest: async (args) => { actions.push(args); return options.action ? options.action(args) : { ok: true, saved: false, safeToClaimSaved: false, needsReview: true, spokenReply: 'Synthetic review. Would you like me to save that for you?' } },
    },
  }).then((session) => ({ session }), (error) => ({ error }))
  const emit = (payload) => {
    const responseId = payload.event?.response_id
    if (payload.type === 'response.event' && payload.event?.item?.type === 'function_call' && !options.manualToolLifecycle) pc.channel.onmessage?.({ data: JSON.stringify({ type: 'response.event', event: { type: 'response.created', response: { id: responseId } } }) })
    pc.channel.onmessage?.({ data: JSON.stringify(payload) })
    if (payload.type === 'response.event' && payload.event?.item?.type === 'function_call' && !options.manualToolLifecycle) pc.channel.onmessage?.({ data: JSON.stringify({ type: 'response.event', event: { type: 'response.completed', response: { id: responseId, output: [] } } }) })
  }
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
  return { box, started, controller, statuses, errors, notices, transcripts, assistant, actions, sent, requests, timers, emit, advance,
    welcomePlays, welcomeStops, stages, nativeListeners, emitWelcome, jobs, jobResults, humans, usage, asset:()=>assetResolve(), play:()=>playResolve(true),
    input:(level,energy=0,duration=0)=>{inputLevel=level;inputEnergy=energy;inputDuration=duration},
    output: (energy, level = 0) => { outputEnergy = energy; outputLevel = level },
    peer: () => pc, stoppedTracks: () => trackStops, closes: () => closes, userSpeech: () => userSpeech }
}
const toolEvent = (id) => ({ type: 'response.event', event: { type: 'response.output_item.done', response_id: `synthetic-response-${id}`, item: { type: 'function_call', name: 'request_helfi_action', call_id: id, arguments: JSON.stringify({ request: 'log 250 ml water', action: 'water', needsReview: true }) } } })
async function checkNative() {
  for (const legacy of [false,true]) {
    const welcome = nativeHarness({ greetOnConnect: true, legacy, welcomeBridge:true })
    const welcomeSession = (await welcome.started).session
    await tick()
    assert.ok(welcomeSession)
    assert.equal(welcome.welcomePlays.length,1)
    assert.equal(welcome.requests[0].request.headers['x-helfi-voice-greeting'],'bundled-clip')
    assert.equal(welcome.sent.filter(event=>event.type==='response.create').length,0, 'No delegated provider work for the welcome')
    assert.equal(welcome.assistant.length,0,'Start is not completion')
    assert.equal(welcome.statuses.at(-1),'speaking')
    welcome.emitWelcome('finished',{completed:true})
    assert.deepEqual(welcome.assistant,['Hi, I’m Helfi. What can I help you with?'])
    assert.equal(welcome.actions.length,0)
    assert.equal(welcome.requests.length,1, 'No extra paid/TTS connection')
    await welcomeSession.stop()
    assert.equal(welcome.timers.size,0)
    const firstUser=nativeHarness({greetOnConnect:true,legacy,welcomeBridge:true,userSpeaksFirst:true})
    const session=(await firstUser.started).session
    await tick()
    assert.equal(firstUser.welcomePlays.length,0,'User-first skips clip')
    await session.stop()
  }
  for (const legacy of [false,true]) {
    const noise=nativeHarness({greetOnConnect:true,legacy,welcomeBridge:true,inputLevel:.1})
    const session=(await noise.started).session;await tick()
    assert.equal(noise.welcomePlays.length,1,'A microphone startup spike without human text must not skip the welcome')
    noise.input(0,1,1);await noise.advance(250);noise.input(.2,1.1,2);await noise.advance(250)
    assert.equal(noise.welcomeStops.length,0,'Raw microphone level/energy never establishes caller speech')
    if(!legacy){noise.emit({type:'session.input_transcript.delta',delta:' ',event_id:'whitespace'});await tick();assert.equal(noise.welcomeStops.length,0,'Whitespace alone is not recognized caller words')}
    noise.emitWelcome('finished',{completed:true});noise.emitWelcome('finished',{completed:true})
    assert.deepEqual(noise.assistant,['Hi, I’m Helfi. What can I help you with?'],'Duplicate completion cannot repeat the welcome transcript')
    assert.equal(noise.actions.length,0);assert.equal(noise.requests.length,1)
    await session.stop();assert.equal(noise.timers.size,0)
  }
  for (const fragments of [['Hi, I’m Helfi. What can I help you with?'], ['Hi, ', 'I’m Helfi. ', 'What can I help you with?']]) {
    const echo=nativeHarness({greetOnConnect:true,welcomeBridge:true})
    const session=(await echo.started).session;await tick()
    for(let i=0;i<fragments.length;i++)echo.emit({type:'session.input_transcript.delta',delta:fragments[i],event_id:'welcome-echo-'+i})
    await tick()
    assert.equal(echo.welcomeStops.length,0,'The exact playing recording cannot interrupt itself through whole or fragmented captions')
    assert(!echo.stages.includes('welcome-user-first'),'The recording cannot falsely consume a genuine-caller-first decision')
    session.flushTranscript()
    assert.deepEqual(echo.transcripts,[fragments.join('')],'Ambiguous matching text remains visible; no caller text is discarded')
    echo.emitWelcome('finished',{completed:true})
    assert.deepEqual(echo.assistant,['Hi, I’m Helfi. What can I help you with?'])
    echo.emit({type:'session.input_transcript.delta',delta:'Hi, log 250 ml water',event_id:'after-welcome'})
    session.flushTranscript()
    assert.equal(echo.transcripts.at(-1),'Hi, log 250 ml water','Normal later caller words are untouched')
    assert.equal(echo.actions.length,0)
    await session.stop();assert.equal(echo.timers.size,0)
  }
  const caller=nativeHarness({greetOnConnect:true,welcomeBridge:true})
  const callerSession=(await caller.started).session;await tick()
  caller.emit({type:'session.input_transcript.delta',delta:'Hi, ',event_id:'caller-prefix'})
  assert.equal(caller.welcomeStops.length,0,'An ambiguous prefix only defers interruption')
  caller.emit({type:'session.input_transcript.delta',delta:'log 250 ml water',event_id:'caller-command'})
  await tick()
  assert.equal(caller.welcomeStops.length,1,'The first word differing from the recording interrupts it')
  assert(caller.stages.includes('welcome-user-first'))
  callerSession.flushTranscript()
  assert.deepEqual(caller.transcripts,['Hi, log 250 ml water'],'A genuine overlapping request is retained verbatim')
  caller.emitWelcome('finished',{completed:true})
  assert.equal(caller.assistant.length,0,'Interrupted playback never claims a finished welcome')
  await callerSession.stop();assert.equal(caller.timers.size,0)
  for (const reason of ['speech','caption','recognized','tool','end','abort','remote']) {
    const f=nativeHarness({greetOnConnect:true,welcomeBridge:true,legacy:reason==='recognized'})
    const session=(await f.started).session; await tick()
    if(reason==='speech')f.emit({type:'input_audio_buffer.speech_started'})
    if(reason==='caption')f.emit({type:'session.input_transcript.delta',delta:'Stop',event_id:'caller'})
    if(reason==='recognized')f.emit({type:'conversation.item.input_audio_transcription.completed',transcript:'Stop'})
    if(reason==='tool')f.emit(toolEvent('welcome-stop-tool'))
    if(reason==='end')await session.stop()
    if(reason==='abort')f.controller.abort()
    if(reason==='remote'){f.output(.2,.1);await f.advance(250)}
    await tick()
    assert(f.welcomeStops.length>0,`Welcome stops on ${reason}`)
    f.emitWelcome('finished',{completed:true})
    assert.equal(f.assistant.length,0,`No completed greeting after ${reason}`)
    await session.stop(); assert.equal(f.timers.size,0)
  }
  for (const pending of ['pendingAsset','pendingPlay']) {
    const f=nativeHarness({greetOnConnect:true,welcomeBridge:true,[pending]:true})
    const session=(await f.started).session;await tick();await session.stop()
    if(pending==='pendingAsset')f.asset();else f.play()
    await tick()
    assert.equal(f.assistant.length,0)
    if(pending==='pendingAsset')assert.equal(f.welcomePlays.length,0)
    else assert(f.welcomeStops.length>0)
    assert.equal(f.timers.size,0)
  }
  for(const options of [{},{welcomeBridge:true,failedWelcome:true}]){
    const f=nativeHarness({greetOnConnect:true,...options});const session=(await f.started).session;await tick()
    assert.equal(f.assistant.length,0);assert(f.notices.some(text=>/welcome.*(cannot|could not)|cannot.*welcome/.test(text)))
    assert(f.statuses.includes('live'));await session.stop();assert.equal(f.timers.size,0)
  }
  for(const outcome of ['failed','interrupted']){
    const first=nativeHarness({greetOnConnect:true,welcomeBridge:true,failedWelcome:outcome==='failed'})
    const firstSession=(await first.started).session;await tick()
    if(outcome==='interrupted')first.emitWelcome('interrupted',{completed:false})
    await tick();assert.equal(first.assistant.length,0,'Unsuccessful welcome must not claim completion')
    first.emitWelcome('finished',{completed:true});assert.equal(first.assistant.length,0,'Late finish after failure/interruption stays ignored')
    await firstSession.stop();assert.equal(first.timers.size,0)
    // The parent controls the consumed marker. The transport must honor a
    // retry for the same billing identity when playback never completed.
    const retry=nativeHarness({greetOnConnect:true,welcomeBridge:true})
    const retrySession=(await retry.started).session;await tick()
    assert.equal(retry.welcomePlays.length,1,`A ${outcome} welcome can retry`)
    retry.emitWelcome('finished',{completed:true});retry.emitWelcome('finished',{completed:true})
    assert.deepEqual(retry.assistant,['Hi, I’m Helfi. What can I help you with?'])
    assert.equal(retry.actions.length,0);assert.equal(retry.requests.length,1)
    await retrySession.stop();assert.equal(retry.timers.size,0)
  }
  const stoppedWelcome = nativeHarness({ greetOnConnect: true, legacy: true, missingSession: true })
  await tick()
  stoppedWelcome.controller.abort()
  assert.ok((await stoppedWelcome.started).error)
  assert.equal(stoppedWelcome.sent.filter(event => event.type === 'response.create').length, 0, 'Stop before readiness cannot play a late welcome')
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
  native.emit({ type: 'response.event', event: { type: 'response.failed', response: { id: 'synthetic-response-call-1' } } })
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
  legacy.emit({ type: 'conversation.item.input_audio_transcription.failed' })
  assert.match(legacy.notices.at(-1), /could not understand/)
  assert.equal(legacy.errors.length, 0, 'An unclear turn is a retry notice, not a failed voice service')
  legacy.emit({ type: 'response.function_call_arguments.done', name: 'request_helfi_action', call_id: 'legacy-call', arguments: JSON.stringify({ request: 'log water', action: 'water', needsReview: true }) })
  await tick()
  assert.ok(legacy.sent.some((item) => item.type === 'conversation.item.create' && item.item.call_id === 'legacy-call'))
  await legacySession.stop()
  assert.ok(legacy.sent.some((item) => item.type === 'response.cancel'))
  assert.equal(legacy.timers.size, 0)
  const silent = nativeHarness()
  const silentSession = (await silent.started).session
  await silent.advance(12000)
  assert.match(silent.notices.at(-1), /didn't hear anything/)
  assert.equal(silent.errors.length, 0, 'Ordinary silence must never be shown as a service failure')
  assert.equal(silent.statuses.at(-1), 'live', 'A silent connected microphone stays ready, not thinking about an unheard request')
  assert.ok(silent.sent.some(event => event.type === 'session.instructions.append' && event.delegation_id === null))
  await silentSession.stop()
  assert.equal(silent.timers.size, 0)
  const transcript = nativeHarness()
  const transcriptSession = (await transcript.started).session
  transcript.emit({ type: 'session.input_transcript.delta', event_id: 'final-user-words', delta: 'Synthetic last words', start_ms: 0, end_ms: 100 })
  transcriptSession.flushTranscript()
  assert.equal(transcript.transcripts[0], 'Synthetic last words', 'User End can retain pending words before stopping the connection')
  transcriptSession.flushTranscript()
  assert.equal(transcript.transcripts.length, 1, 'Flushing twice cannot duplicate a saved transcript turn')
  await transcriptSession.stop()
  assert.equal(transcript.timers.size, 0)
}
async function checkProtectedNative() {
  const job={callId:'server-call-one',actualHumanText:'Please read my water.',args:{request:'Read my water.',action:'assistant_plan',needsReview:false,assistantCommand:{type:'plan',steps:[{id:'water',operation:'water.read',values:{}}]}}}
  const f=nativeHarness({serverMetered:true,action:()=>({ok:true,saved:true,safeToClaimSaved:true,message:'Untrusted native claim',assistantContext:{id:'owned-app-conversation',actorId:'synthetic-user',revision:7}})})
  const {session,error}=await f.started;assert(session,error?.message)
  assert.equal(f.requests[0].request.headers['x-helfi-voice-metering'],'server-v1')
  assert.equal(f.requests[0].request.headers['x-helfi-assistant-session-id'],'owned-app-conversation')
  assert.match(f.requests[0].request.headers['x-helfi-voice-attempt-id'],/^[A-Za-z0-9_-]{12,100}$/)
  f.emit(toolEvent('unsolicited-channel-tool'));await tick()
  assert.equal(f.actions.length,0,'Protected sessions never run direct data-channel model tool calls')
  assert.equal(f.sent.filter(event=>event.type==='response.item.create'||event.type==='response.create').length,0)
  f.jobs.push(job);await f.advance(0)
  assert.equal(f.actions.length,1);assert.equal(f.actions[0].assistantCommand.steps[0].operation,'water.read')
  assert.deepEqual(f.humans,[job.actualHumanText],'Only immutable owned server-caption evidence reaches the app action host')
  assert.equal(f.jobResults.length,1);assert.equal(f.jobResults[0].sessionId,'synthetic-financial-session')
  assert.deepEqual(Object.keys(f.jobResults[0].result).sort(),['assistantContext','ok'])
  assert.equal(f.jobResults[0].result.saved,undefined,'Client saved=true is never delivered as canonical save proof')
  assert.equal(f.jobResults[0].result.message,undefined)
  f.jobs.push(job);await f.advance(750);assert.equal(f.actions.length,1,'A repeated immutable job does not repeat an app effect')
  await session.stop();assert.equal(f.timers.size,0)
  assert.equal(f.sent.filter(event=>event.type==='session.close').length,1)
  const final=f.usage.at(-1);assert.equal(final.finalUsageReceived,true);assert.equal(final.providerSeconds,15)
  assert.equal(final.backendUsdAtStandardRates,null);assert.equal(final.finalComplete,false,'Native voice receipt cannot certify server backend settlement')
  assert.equal(final.invoiceConfirmed,false)
  f.jobs.push({...job,callId:'late-job'});await f.advance(10000);assert.equal(f.actions.length,1)
  const missing=nativeHarness({serverMetered:true,missingFinalUsage:true}),open=await missing.started
  assert(open.session);const closing=open.session.stop();await missing.advance(2500);await closing
  const unknown=missing.usage.at(-1);assert.equal(unknown.finalUsageReceived,false);assert.equal(unknown.finalComplete,false);assert.equal(unknown.costIncomplete,true);assert.equal(unknown.totalUsdAtStandardRates,null)
  assert.equal(missing.timers.size,0);assert(missing.stoppedTracks()>0)
  const invalid=nativeHarness({serverMetered:true,missingFinancialSession:true}),denied=await invalid.started
  assert.match(denied.error?.message||'',/spending monitor returned no session/);assert.equal(invalid.actions.length,0);assert.equal(invalid.timers.size,0);assert(invalid.stoppedTracks()>0)
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
  for (const [name, check] of [['route', checkRoute], ['native', checkNative], ['protected native', checkProtectedNative], ['model metering', checkMetering]]) {
    try { await check(); console.log(`PASS: ${name} Live protocol checks (offline mocks).`) }
    catch (error) { errors.push(`${name}: ${error.stack || error.message}`) }
  }
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('PASS: protected Live startup boundary, compatibility transports, safe tools, captions/audio evidence, ICE cancellation and cleanup. Financial startup/worker execution is separately tested; no real server/audio result is claimed.')
}
module.exports = { checkRoute, checkNative }
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
