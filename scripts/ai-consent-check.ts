import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { AI_SHARING_CONSENT_VERSION as version, AI_SHARING_DISCLOSURE as disclosure, isAiProcessingRequest } from '../lib/ai-consent-text'

function load(path: string, context: Record<string, any>) {
  const file = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const code = file.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(file)).join('\n')
  const box: any = { exports: {}, console, Date, Promise, Error, ...context }
  vm.createContext(box)
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, box)
  return box
}

async function main() {
  let webUser: string | null = 'account-a'
  let requestHeaders: Headers | null = new Headers()
  const records = new Map<string, any>()
  const writes: any[] = []
  let budgets = 0
  class MockRequest extends Request { cookies = { get: () => undefined } }
  const prisma = {
    aiDataSharingConsent: {
      findUnique: async ({ where }: any) => records.get(where.userId) || null,
      upsert: async (args: any) => {
        writes.push(args)
        records.set(args.where.userId, { ...(records.get(args.where.userId) || args.create), ...args.update })
      },
    },
    aIUsageEvent: { aggregate: async () => { budgets++; return { _count: { _all: 0 }, _sum: { costCents: 0 } } } },
  }
  const base = { prisma, AI_SHARING_CONSENT_VERSION: version, AI_SHARING_DISCLOSURE: disclosure,
    NextRequest: MockRequest, NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status || 200, headers: options.headers }) },
    headers: async () => { if (!requestHeaders) throw Error('Outside request'); return requestHeaders },
    getServerSession: async () => webUser ? { user: { id: webUser } } : null, authOptions: {},
    getUserIdFromNativeAuth: async (req: Request) => req.headers.get('x-native-token') === 'synthetic-b' ? 'account-b' : null,
  }
  const server = load('lib/ai-consent.ts', base).exports
  const api = load('app/api/ai-consent/route.ts', { ...base, ...server }).exports
  const request = (body?: any, headers?: Headers) => new MockRequest('https://helfi.ai/api/ai-consent', { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  assert.equal((await api.GET(request())).body.granted, false)
  assert.equal((await server.aiConsentRequiredResponse(request())).status, 403)
  await assert.rejects(() => server.assertAiSharingConsent({ userId: 'account-b' }), /allow AI help/)
  assert.equal((await api.POST(request({ granted: 1, version }))).status, 400)
  assert.equal((await api.POST(request({ granted: true, version: 'old' }))).status, 400)
  assert.equal(writes.length, 0)
  await api.POST(request({ granted: true, version, userId: 'account-b' }))
  assert.equal(records.get('account-a').granted, true)
  assert.equal(records.has('account-b'), false, 'request body cannot grant another account')
  assert.equal(records.get('account-a').disclosure, disclosure)
  assert.equal(await server.aiConsentRequiredResponse(request()), null)
  webUser = 'account-b'
  assert.equal((await api.GET(request())).body.granted, false, 'one account cannot inherit another account permission')
  webUser = 'account-a'
  await api.POST(request({ granted: true, version }, new Headers({ 'x-native-token': 'synthetic-b' })))
  assert.equal(records.get('account-b').granted, true, 'explicit native identity takes precedence')
  await api.POST(request({ granted: false, version }))
  assert.equal((await api.GET(request())).body.granted, false)
  assert.equal((await server.aiConsentRequiredResponse(request())).status, 403)
  assert.ok(records.get('account-a').withdrawnAt)
  const safety = load('lib/ai-safety.ts', { prisma, assertAiSharingConsent: server.assertAiSharingConsent,
    process: { env: {} }, getCircuitState: async () => ({ open: false }), openCircuit: async () => {}, reportCriticalError: async () => {} }).exports
  await assert.rejects(() => safety.assertAiUsageAllowed({ userId: 'account-a' }), /allow AI help/)
  assert.equal(budgets, 0, 'withdrawal stops before the AI budget or provider can run')
  requestHeaders = null; webUser = null
  await safety.assertAiUsageAllowed({ userId: 'account-b', feature: 'reports:weekly' })
  records.set('account-b', { ...records.get('account-b'), granted: false })
  await assert.rejects(() => safety.assertAiUsageAllowed({ userId: 'account-b', feature: 'reports:weekly' }), /allow AI help/)
  assert.equal((await api.GET(request())).status, 401)
  assert.equal((await api.POST(request({ granted: true, version }))).status, 401)
  records.set('account-b', { granted: true, version: 'old' })
  assert.equal(await server.hasAiSharingConsent('account-b'), false)

  let token = 'synthetic-a'
  let grant = false
  let postOk = true
  let alert: any = null
  let sends = 0
  const native = load('native/src/lib/aiConsent.ts', {
    AbortController, setTimeout, clearTimeout,
    API_BASE_URL: 'https://helfi.ai', buildNativeAuthHeaders: (value: string) => ({ 'x-native-token': value }),
    AsyncStorage: { getItem: async (key: string) => key === 'helfi_auth_session_v1' ? JSON.stringify({ token }) : 'granted', removeItem: async () => {} },
    Alert: { alert: (...args: any[]) => { alert = args } },
    fetch: async (_url: string, options: any = {}) => {
      if (options.method === 'POST') { sends++; if (postOk) grant = JSON.parse(options.body).granted }
      return { ok: options.method === 'POST' ? postOk : true, json: async () => ({ granted: grant, version }) }
    },
  }).exports
  assert.equal(native.AI_SHARING_DISCLOSURE, disclosure, 'web and native present identical permission text')
  assert.equal(await native.hasAiDataSharingPermission(), false, 'old local grant is not proof of current server permission')
  const declined = native.requestAiDataSharingPermission()
  await new Promise(done => setImmediate(done))
  alert[2][0].onPress()
  assert.equal(await declined, false); assert.equal(sends, 0)
  postOk = false
  const failed = native.requestAiDataSharingPermission()
  await new Promise(done => setImmediate(done))
  alert[2][1].onPress()
  assert.equal(await failed, false, 'failed server save never grants AI permission')
  postOk = true
  const changed = native.requestAiDataSharingPermission()
  await new Promise(done => setImmediate(done))
  const before = sends; token = 'synthetic-b'; alert[2][1].onPress()
  assert.equal(await changed, false); assert.equal(sends, before, 'account switch cancels pending approval')
  const accepted = native.requestAiDataSharingPermission()
  await new Promise(done => setImmediate(done))
  alert[2][1].onPress()
  assert.equal(await accepted, true); assert.equal(await native.hasAiDataSharingPermission(), true)
  assert.equal(await native.revokeAiDataSharingPermission(), true)
  assert.equal(await native.hasAiDataSharingPermission(), false)

  for (const path of ['/api/analyze-food', '/api/analyze-symptoms/chat', '/api/test-vision', '/api/native/voice-assistant/realtime', '/api/insights/regenerate-targeted', '/api/insights/issues/example/sections/nutrition/chat', '/api/reports/weekly/trigger']) assert.equal(isAiProcessingRequest(path, 'POST'), true, path)
  for (const path of ['/api/food-log', '/api/food-data', '/api/barcode/lookup', '/api/ai-consent', '/api/reports/example/process']) assert.equal(isAiProcessingRequest(path, 'POST'), false, path)
  assert.equal(isAiProcessingRequest('/api/test-vision', 'GET'), false, 'reading stored history remains available')
  assert.equal(isAiProcessingRequest('/api/reports/weekly/preferences', 'POST', '{"enabled":true}'), true)
  assert.equal(isAiProcessingRequest('/api/reports/weekly/preferences', 'POST', '{"enabled":false}'), false)
  console.log('PASS: real consent API, account isolation, native identity, withdrawal, background guard, decline, failed grant, account switch, disclosure and tracking boundaries.')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
