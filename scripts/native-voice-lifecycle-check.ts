import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const file = ts.createSourceFile('voice.ts', fs.readFileSync('native/src/voice/realtimeVoice.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const code = file.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(file)).join('\n')
async function scenario(missing = '', failure = '') {
  const statuses: string[] = []
  const timers = new Map<number, any>()
  const sent: any[] = []
  let seq = 0, trackStops = 0, closes = 0, routeStops = 0
  let pc: any
  const localTrack = { enabled: true, stop: () => { trackStops++ } }
  const remoteTrack = { kind: 'audio', enabled: true, _setVolume: () => {}, stop: () => { trackStops++ } }
  const stream = { getTracks: () => [localTrack], getAudioTracks: () => [localTrack] }
  class Peer {
    connectionState = 'new'
    onconnectionstatechange: any; ontrack: any
    channel: any
    constructor() { pc = this }
    addTrack() {}
    close() { closes++ }
    getSenders() { return [{ track: localTrack }] }
    getReceivers() { return [{ track: remoteTrack }] }
    getTransceivers() { return [] }
    async getStats() { return [{ type: 'outbound-rtp', kind: 'audio', packetsSent: missing === 'microphone' ? 0 : 10, bytesSent: missing === 'microphone' ? 0 : 100 }] }
    createDataChannel() { this.channel = { readyState: 'open', close: () => {}, send: () => {} }; return this.channel }
    async createOffer() { if (failure === 'offer') throw Error('Offer failed'); return { sdp: 'synthetic-offer' } }
    async setLocalDescription() {}
    async setRemoteDescription() {
      if (failure === 'answer') throw Error('Answer failed')
      if (missing !== 'channel') this.channel.onopen()
      if (missing !== 'peer') { this.connectionState = 'connected'; this.onconnectionstatechange() }
      if (missing !== 'speaker') this.ontrack({ track: remoteTrack, streams: [] })
      if (missing !== 'session') this.channel.onmessage({ data: '{"type":"session.created"}' })
    }
  }
  const box: any = { exports: {}, Date, Promise, Map, Set, Error, AbortController, process: { env: {} }, __DEV__: false,
    console: { info: () => {}, warn: () => {} },
    API_BASE_URL: 'https://helfi.ai', buildNativeAuthHeaders: () => ({ authorization: 'synthetic-token' }),
    setInterval: (fn: any) => { timers.set(++seq, fn); return seq }, clearInterval: (id: number) => timers.delete(id),
    setTimeout: (fn: any) => { timers.set(++seq, fn); return seq }, clearTimeout: (id: number) => timers.delete(id),
    require: (name: string) => name === 'react-native-webrtc' ? { RTCPeerConnection: Peer, RTCSessionDescription: function(value: any) { return value }, mediaDevices: { getUserMedia: async () => { if (failure === 'permission') throw Error('Microphone denied'); return stream } } } : name === 'react-native-incall-manager' ? { start: () => {}, stop: () => { routeStops++ }, setForceSpeakerphoneOn: () => {}, setSpeakerphoneOn: () => {} } : { NativeModules: {} },
    fetch: async (url: string, options: any) => {
      sent.push({ url, options })
      if (failure === 'network') throw Error('Network failed')
      return { ok: failure !== 'consent', headers: { get: () => null }, text: async () => failure === 'consent' ? '{"error":"AI permission is required"}' : 'synthetic-answer' }
    },
  }
  vm.createContext(box)
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, box)
  const controller = new AbortController()
  const promise = box.exports.startHelfiRealtimeVoiceSession({ token: 'synthetic-token', billingSessionId: 'same-conversation-123', signal: controller.signal, callbacks: { onStatus: (value: string) => statuses.push(value) } }).then((result: any) => ({ result }), (error: any) => ({ error }))
  await new Promise(done => setImmediate(done))
  if (missing) {
    assert.ok(!statuses.includes('live'), `missing ${missing} must not show a live connection`)
    controller.abort()
  }
  const settled = await promise
  if (failure || missing) {
    assert.ok(settled.error)
    if (failure) assert.match(settled.error.message, new RegExp(({ permission: 'Microphone denied', offer: 'Offer failed', network: 'Network failed', answer: 'Answer failed', consent: 'AI permission is required' } as any)[failure]))
    else assert.match(settled.error.message, /stopped/)
  }
  else {
    assert.ok(settled.result, settled.error?.message)
    assert.ok(statuses.includes('live'))
    settled.result.setMicrophoneMuted(true); assert.equal(localTrack.enabled, false)
    settled.result.setMicrophoneMuted(false); assert.equal(localTrack.enabled, true)
    await settled.result.stop()
    assert.equal(sent[0].options.headers['x-helfi-voice-session-id'], 'same-conversation-123')
  }
  assert.ok(closes > 0, 'failed/stopped connections close the peer')
  if (failure !== 'permission') assert.ok(trackStops > 0, 'microphone tracks are stopped on every exit')
  assert.ok(routeStops > 0, 'speaker route is released')
  assert.equal(timers.size, 0, 'background timers are removed on exit')
}
async function main() {
  for (const failure of ['permission', 'offer', 'network', 'answer', 'consent']) await scenario('', failure)
  for (const missing of ['channel', 'peer', 'speaker', 'session', 'microphone']) await scenario(missing)
  await scenario()
  console.log('PASS: actual voice lifecycle closes failed offers/network/answers/consent, stops tracks/timers, requires all audio/data readiness signals, and preserves retry billing identity.')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
