#!/usr/bin/env node
'use strict'
// Actual TTS route under synthetic auth, wallet and provider adapters only.
// No network, environment files, real credentials, audio devices or app writes.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const file = path.resolve(__dirname, '../app/api/native/voice-assistant/tts/route.ts')
const source = fs.readFileSync(file, 'utf8')
const NextResponse = { json: (data, init = {}) => new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json' } }) }
let state, count = 0
function reset() {
  state = { consentResponse: null, account: 'synthetic-user', native: null, wallet: { plan: 'synthetic-paid', totalAvailableCents: 10000 }, safety: null, providerError: null, audioError: null, emptyAudio: false, charge: true, calls: [], logs: [], errors: [] }
}
const imports = {
  '@/lib/ai-consent': { aiConsentRequiredResponse: async () => state.consentResponse },
  'next/server': { NextResponse }, 'next-auth': { getServerSession: async () => state.account ? { user: { id: state.account } } : null },
  '@/lib/auth': { authOptions: {} }, '@/lib/native-auth': { getUserIdFromNativeAuth: async () => state.native },
  '@/lib/prisma': { prisma: { user: { findUnique: async ({ where }) => ({ id: where.id }) } } },
  '@/lib/credit-system': { CreditManager: class {
    constructor(id) { assert.equal(id, state.account || state.native) }
    async getWalletStatus() { state.calls.push('wallet'); return state.wallet }
    async chargeCents(amount) { state.calls.push(['charge', amount]); return state.charge }
  } },
  '@/lib/ai-usage-logger': { logAiUsageEvent: async event => { state.logs.push(event) } },
  '@/lib/cost-meter': { estimateTextToSpeechCostCents: text => { state.calls.push(['estimate', text]); return 2 } },
  '@/lib/ai-safety': { assertAiUsageAllowed: async () => { state.calls.push('safety'); if (state.safety) throw state.safety }, isAiSafetyError: error => error === state.safety && Boolean(error) },
  '@/lib/openai-voice-config': { resolveHelfiTtsVoice: () => 'synthetic-voice' },
  openai: class { audio = { speech: { create: async input => { state.calls.push(['provider', input]); if (state.providerError) throw state.providerError; return { arrayBuffer: async () => { state.calls.push('audio_read'); if (state.audioError) throw state.audioError; return state.emptyAudio ? new ArrayBuffer(0) : Uint8Array.of(1, 2, 3).buffer } } } } } },
}
const moduleBox = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, {
  module: moduleBox, exports: moduleBox.exports, Response, Buffer,
  // Isolated synthetic configuration: never inherits the real process env.
  process: { env: { OPENAI_API_KEY: 'synthetic-not-a-real-key' } },
  console: { error: (...args) => state.errors.push(args) },
  require: name => { if (Object.hasOwn(imports, name)) return imports[name]; throw Error(`Unexpected import: ${name}`) },
}, { filename: file })
const post = async (text, extra = {}) => {
  const response = await moduleBox.exports.POST({ json: async () => ({ text, aiConsentGranted: true, ...extra }) })
  return { status: response.status, body: await response.json() }
}
const providers = () => state.calls.filter(call => call[0] === 'provider')
const charges = () => state.calls.filter(call => call[0] === 'charge')
async function check(name, fn) { reset(); await fn(); count++; console.log(`PASS ${name}`) }
async function main() {
  await check('complete reply beyond old 1200 cutoff reaches provider and billing unchanged', async () => {
    const text = `${'Every reviewed word remains. '.repeat(70)}EXACT FINAL SAVE QUESTION?`
    const result = await post(text)
    assert.equal(result.status, 200); assert.equal(providers()[0][1].input, text); assert.equal(providers()[0][1].model, 'gpt-4o-mini-tts')
    assert.equal(charges().length, 1); assert.equal(result.body.chargedCredits, 2); assert.equal(state.logs.length, 1)
    assert(state.calls.indexOf('audio_read') < state.calls.findIndex(call => call[0] === 'charge'), 'Complete audio must be received before any debit')
    assert.equal(state.calls.find(call => call[0] === 'estimate')[1], text)
  })
  await check('4096 API characters accepted intact, 4097 rejected before wallet/provider/debit', async () => {
    assert.equal((await post('a'.repeat(4096))).status, 200); assert.equal(providers()[0][1].input.length, 4096)
    reset(); const result = await post('a'.repeat(4097))
    assert.equal(result.status, 413); assert.equal(result.body.code, 'voice_reply_too_long'); assert.equal(result.body.chargedCredits, 0)
    assert.deepEqual(state.calls, []); assert.deepEqual(state.logs, []); assert(!result.body.audio)
  })
  await check('Unicode characters are not split or silently shortened at boundary', async () => {
    const text = '🌻'.repeat(4096)
    assert.equal((await post(text)).status, 200); assert.equal(providers()[0][1].input, text)
    reset(); assert.equal((await post(text + '🌻')).status, 413); assert.equal(providers().length, 0)
  })
  await check('2000 model-token rejection is truthful and has no charge or usage-success log', async () => {
    for (const error of [
      { status: 400, code: 'context_length_exceeded', message: 'PRIVATE INPUT' },
      { status: 400, code: 'invalid_request_error', message: 'Input text exceeds the maximum number of input tokens (2000)' },
      { status: 413, code: 'input_too_long', message: 'PRIVATE INPUT' },
    ]) {
      reset(); state.providerError = error; const result = await post('完整内容'.repeat(500))
      assert.equal(result.status, 413); assert.equal(result.body.chargedCredits, 0); assert.equal(charges().length, 0); assert.equal(state.logs.length, 0)
      assert(!JSON.stringify(result).includes('PRIVATE')); assert.deepEqual(state.errors, [])
    }
  })
  await check('unrelated provider failure remains error with fixed secret-safe log', async () => {
    for (const error of [{ status: 400, code: 'invalid_api_key', message: 'PRIVATE SECRET INPUT' }, { status: 500, message: 'maximum input tokens PRIVATE SECRET INPUT' }]) {
      reset(); state.providerError = error; const result = await post('Read this complete review.')
      assert.equal(result.status, 500); assert.equal(result.body.error, 'Voice reply failed'); assert.equal(charges().length, 0)
      assert.deepEqual(state.errors, [['[native voice assistant tts] failed']]); assert(!JSON.stringify(result).includes('PRIVATE'))
    }
  })
  await check('provider audio stream failure or empty audio never debits or logs successful speech', async () => {
    for (const failure of ['stream', 'empty']) {
      reset(); if (failure === 'stream') state.audioError = Error('PRIVATE synthetic audio stream read failure'); else state.emptyAudio = true
      const result = await post('Read the full review.')
      assert.equal(result.status, 500); assert.equal(result.body.error, 'Voice reply failed'); assert(!result.body.audio)
      assert.equal(providers().length, 1); assert.equal(charges().length, 0); assert.equal(state.logs.length, 0)
      assert.deepEqual(state.errors, [['[native voice assistant tts] failed']]); assert(!JSON.stringify(result).includes('PRIVATE'))
    }
  })
  await check('normal global consent, account, body consent and empty input gates remain', async () => {
    state.consentResponse = NextResponse.json({ error: 'consent' }, { status: 403 }); assert.equal((await post('text')).status, 403)
    reset(); state.account = null; assert.equal((await post('text')).status, 401)
    reset(); assert.equal((await post('text', { aiConsentGranted: false })).status, 403)
    reset(); assert.equal((await post(' \n\t ')).status, 400)
    assert.equal(providers().length, 0); assert.equal(charges().length, 0)
    reset(); state.account = null; state.native = 'synthetic-native'; assert.equal((await post('text')).status, 200)
  })
  await check('paid access, sufficient credit, usage safety and failed debit stay truthful', async () => {
    state.wallet = { totalAvailableCents: 1000 }; assert.equal((await post('text')).status, 402); assert.equal(providers().length, 0)
    reset(); state.wallet.totalAvailableCents = 1; assert.equal((await post('text')).status, 402); assert.equal(providers().length, 0)
    reset(); state.safety = new Error('synthetic safety limit'); assert.equal((await post('text')).status, 429); assert.equal(providers().length, 0)
    reset(); state.charge = false; assert.equal((await post('text')).status, 402); assert.equal(state.logs.length, 0)
  })
  // Reuse the existing isolated full-route fixture, not a rewritten billing
  // branch. Only its prepared reply and provider stream are controlled here.
  const matrixFile = path.resolve(__dirname, 'voice-action-matrix-check.cjs')
  const matrixSource = fs.readFileSync(matrixFile, 'utf8').replace(/^#![^\n]*\n/, '')
  const marker = matrixSource.indexOf('const results = []')
  assert(marker > 0, 'Actual-route fixture preamble must exist')
  const mainRoute = new Function('require', '__dirname', `${matrixSource.slice(0, marker)}; return {ctx, resetCharges:()=>{charges=[]}, charges:()=>charges}`)(require, __dirname)
  let inlineText = '', inlineFailure = null, inlineInputs = [], inlineLogs = []
  const inlineOpenai = { audio: { speech: { create: async request => { inlineInputs.push(request.input); if (inlineFailure === 'tokens') throw {status:400,code:'context_length_exceeded'}; return { arrayBuffer: async () => { if (inlineFailure === 'stream') throw Error('PRIVATE stream input'); return inlineFailure === 'empty' ? new ArrayBuffer(0) : Uint8Array.of(1,2,3).buffer } } } } } }
  mainRoute.ctx.getOpenAIClient = () => inlineOpenai
  mainRoute.ctx.tryParseHealthIntakeItemsRequest = () => ({ action: 'health_intake_items', canConfirm: true, confirmationMessage: inlineText, healthIntake: { items: [] } })
  mainRoute.ctx.estimateTextToSpeechCostCents = () => 2
  mainRoute.ctx.logAiUsageEvent = async event => inlineLogs.push(event)
  async function inlineRequest(text, failure = null) {
    inlineText = text; inlineFailure = failure; inlineInputs = []; inlineLogs = []; mainRoute.resetCharges()
    return mainRoute.ctx.POST({ headers: {get:()=> 'application/json'}, json: async () => ({transcript:'Record a supplement I took',localDate:'2026-10-17',tzOffsetMin:-660,aiConsentGranted:true,voiceReply:true}) })
  }
  await check('actual main route inline speech retains >1200 characters and final question at unchanged normal fee', async () => {
    const text = `${'Exact complete review. '.repeat(80)}Would you like me to save that for you?`
    const result = await inlineRequest(text)
    assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(inlineInputs[0], text); assert.equal(result.body.chargedCredits, 5); assert.equal(mainRoute.charges().length, 1)
    const boundary = await inlineRequest('a'.repeat(4096)); assert.equal(boundary.status, 200); assert.equal(inlineInputs[0].length, 4096)
  })
  await check('actual main route oversized inline reply fails before provider/debit/success speech log', async () => {
    const result = await inlineRequest('a'.repeat(4097))
    assert.equal(result.status, 500); assert.match(result.body.error, /too long/); assert.equal(inlineInputs.length, 0); assert.equal(mainRoute.charges().length, 0)
    assert(!inlineLogs.some(log => log.feature === 'voice-assistant:tts' && log.success)); assert(!result.body.audio)
  })
  await check('actual main route token/stream/empty failures have no debit or successful speech log', async () => {
    for (const failure of ['tokens', 'stream', 'empty']) {
      const result = await inlineRequest('Full reviewed note and final question.', failure)
      assert.equal(result.status, 500); assert.equal(mainRoute.charges().length, 0); assert(!result.body.audio)
      assert(!inlineLogs.some(log => log.feature === 'voice-assistant:tts' && log.success)); assert(!JSON.stringify(result).includes('PRIVATE'))
    }
  })
  console.log(`PASS ${count} actual-source TTS boundary groups. Synthetic provider only; no real speech generated.`)
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
