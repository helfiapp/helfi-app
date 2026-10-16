#!/usr/bin/env node
'use strict'
// Real adapter + real report/device GET handlers under synthetic auth/storage.
// Fixed water/wallet response fixtures exercise response boundaries only; no
// network, database, environment files, credentials, device or provider calls.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const root = path.resolve(__dirname, '..')
class NextRequest extends Request { get nextUrl() { return new URL(this.url) } }
const NextResponse = { json: (data, init = {}) => new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json' } }) }
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
function load(file, imports) {
  const module = { exports: {} }
  const box = vm.createContext({ module, exports: module.exports, URL, Headers, Request, Response, Date, Set, Map, Error, Object, String, Number, console: { error() {}, warn() {} }, process: { env: { NEXT_PUBLIC_REPORTS_ENABLED: 'true' } }, require: name => { if (name === 'next/server') return { NextRequest, NextResponse }; if (Object.hasOwn(imports, name)) return imports[name]; throw Error(`Unexpected app import: ${name}`) } })
  vm.runInContext(transpile(fs.readFileSync(path.join(root, file), 'utf8')), box, { filename: file })
  return { api: module.exports, box }
}
const owner = 'synthetic-owner', selectedDate = '2026-10-17'
let accountId, webId, calls, healing, providerCalls, writes, complete, state, latest, weekly, uploaded, connected, responses, afterHandler, readFailure
function reset() {
  accountId = owner; webId = null; calls = []; healing = []; providerCalls = []; writes = []; complete = true; readFailure = false; afterHandler = null
  state = { reportsEnabled: false, nextReportDueAt: null, lastReportAt: null, reportsEnabledAt: null }
  latest = { id: 'weekly-1', userId: owner, status: 'LOCKED', periodStart: '2026-10-10', periodEnd: '2026-10-16', summary: 'PRIVATE SUMMARY', dataSummary: { secretHealth: true }, report: 'PRIVATE REPORT' }
  weekly = [structuredClone(latest)]
  uploaded = [{ id: 'upload-1', originalFileName: 'PRIVATE FILE NAME', status: 'DECRYPTION_FAILED', createdAt: new Date('2026-10-16T01:00:00Z'), processingError: 'PRIVATE PROCESSING ERROR' }]
  connected = { fitbit: true, garmin: true }
  responses = {
    credit: { schemaVersion: 2, debugStage: 'success', hasAccess: true, totalAvailableCents: 1255, additionalAvailableCents: 700, topUps: [{ id: 'PRIVATE TOPUP', availableCents: 555 }], credits: { total: 1255 }, plan: 'PRIVATE PLAN' },
    goal: { targetMl: 2600, source: 'custom', exerciseBonusMl: 100 },
    water: { entries: [{ id: 'water-1', userId: owner, amountMl: 250, localDate: selectedDate, label: 'PRIVATE LABEL' }, { id: 'water-2', userId: owner, amountMl: 236.588, localDate: selectedDate }] },
  }
}
const auth = { getWeeklyReportRequestUser: async () => accountId ? { id: webId || accountId, email: 'synthetic@example.invalid' } : null, isWeeklyReportHealthSetupComplete: async () => complete }
const common = { 'next-auth': { getServerSession: async () => webId ? { user: { id: webId } } : null }, '@/lib/auth': { authOptions: {} }, '@/lib/native-auth': { getUserIdFromNativeAuth: async request => request.headers.get('authorization') === 'Bearer synthetic' ? accountId : null } }
const prisma = {
  user: { findUnique: async ({ where }) => { assert.equal(where.id, owner); return { gender: 'female', weight: 60, height: 160, healthGoals: [{ name: 'Sleep' }], subscription: { plan: 'premium' } } } },
  account: { findFirst: async ({ where }) => { calls.push({ account: where }); assert.equal(where.userId, webId || accountId); if (readFailure) throw Error('synthetic account read failure'); return connected[where.provider] ? { userId: where.userId, providerAccountId: 'PRIVATE PROVIDER ID', access_token: 'SYNTHETIC TOKEN NEVER OUTPUT' } : null } },
  report: { findMany: async ({ where }) => { calls.push({ reports: where }); assert.equal(where.userId, webId || accountId); return uploaded } },
  garminWebhookLog: { findMany: async () => { writes.push('backfill scan'); return [] }, count: async () => 0, findFirst: async () => null, updateMany: async () => { writes.push('backfill write') } },
}
const reportDeps = {
  '@/lib/weekly-health-report': {
    getWeeklyReportState: async id => { assert.equal(id, owner); return state }, getLatestWeeklyReport: async id => { assert.equal(id, owner); return latest },
    setWeeklyReportsEnabled: async () => { healing.push('enable'); state = { ...state, nextReportDueAt: '2026-10-24T01:00:00Z', reportsEnabled: true } },
    markWeeklyReportOnboardingComplete: async () => { healing.push('onboarding') }, ensureReadyWeeklyReportNextDueInFuture: async (_, current) => { healing.push('reschedule'); return current },
    listWeeklyReports: async id => { assert.equal(id, owner); return weekly },
  },
  '@/lib/weekly-report-request-auth': auth,
  '@/lib/prisma': { prisma }, '@/lib/subscription-utils': { isSubscriptionActive: () => true }, '@/lib/health-setup-completion': { isHealthSetupComplete: () => true },
}
const statusRoute = load('app/api/reports/weekly/status/route.ts', reportDeps)
const weeklyRoute = load('app/api/reports/weekly/list/route.ts', reportDeps)
const uploadRoute = load('app/api/reports/list/route.ts', { ...common, '@/lib/prisma': { prisma } })
const fitbitRoute = load('app/api/fitbit/status/route.ts', { ...common, '@/lib/prisma': { prisma } })
const garminRoute = load('app/api/garmin/status/route.ts', { ...common, '@/lib/prisma': { prisma }, '@/lib/garmin-oauth': { fetchGarminUserId: async () => { providerCalls.push('garmin'); return { status: 200 } }, deregisterGarminUser: async () => { throw Error('Disconnect forbidden') } }, '@/lib/garmin-db': { ensureGarminSchema: async () => { writes.push('schema') } } })
const observed = (name, handler) => ({ GET: async request => { calls.push({ name, request }); const response = await handler(request); afterHandler?.(name); return response } })
const fixture = key => observed(key, async () => NextResponse.json(responses[key]))
const adapter = load('lib/native-voice-app-reads.ts', {
  '@/lib/weekly-report-request-auth': auth,
  '@/app/api/reports/weekly/status/route': observed('weeklyStatus', statusRoute.api.GET),
  '@/app/api/reports/weekly/list/route': observed('weeklyList', weeklyRoute.api.GET),
  '@/app/api/reports/list/route': observed('uploaded', uploadRoute.api.GET),
  '@/app/api/credit/status/route': fixture('credit'), '@/app/api/hydration-goal/route': fixture('goal'), '@/app/api/water-log/route': fixture('water'),
  '@/app/api/fitbit/status/route': observed('fitbit', fitbitRoute.api.GET), '@/app/api/garmin/status/route': observed('garmin', garminRoute.api.GET),
}).api
const request = signal => new NextRequest('https://helfi.invalid/api/native/voice-assistant', { headers: { authorization: 'Bearer synthetic', 'x-native-token': 'synthetic', 'x-helfi-voice-action-id': 'synthetic-read' }, signal })
const read = (action, values = {}, req = request(), id = owner) => adapter.readVoiceAppData(req, id, { action, values }, selectedDate)
const plain = value => JSON.parse(JSON.stringify(value))
let count = 0
async function check(name, run) { reset(); await run(); assert.deepEqual(writes, []); count++; console.log(`PASS ${name}`) }
async function main() {
  await check('exact fixed schema rejects arbitrary URL/method/account/run/unlock/preview before handlers', async () => {
    assert.deepEqual(Object.keys(adapter.VOICE_APP_READ_SCHEMAS).sort(), ['credit.balance', 'devices.status', 'hydration.status', 'reports.list', 'reports.status', 'reports.weekly.read'])
    for (const [action, values] of [['reports.run', {}], ['reports.status', { preview: true }], ['credit.balance', { provider: 'openai' }], ['devices.status', { provider: 'apple' }], ['reports.list', { limit: 11 }], ['reports.list', { limit: '5' }], ['reports.list', { kind: 'all' }], ['hydration.status', { localDate: '2026-02-30' }], ['devices.status', { url: '/api/delete', method: 'DELETE', userId: owner }]]) await assert.rejects(read(action, values))
    assert.equal(calls.length, 0)
  })
  await check('missing or mismatched normal authenticated account cannot read', async () => {
    accountId = null; await assert.rejects(read('credit.balance'), error => error.status === 401)
    accountId = owner; webId = 'other-owner'; await assert.rejects(read('credit.balance'), error => error.status === 401)
    webId = null; await assert.rejects(read('credit.balance', {}, request(), 'other-owner'), error => error.status === 401)
    assert.equal(calls.length, 0)
  })
  await check('actual report status read retains lock and never heals or schedules or reveals report contents', async () => {
    const result = await read('reports.status')
    assert.equal(result.verified, true); assert.equal(result.safeToClaimSaved, false)
    assert.equal(result.data.status, 'LOCKED'); assert.equal(result.data.reportsEnabled, false)
    assert.match(result.message, /locked/); assert.deepEqual(healing, [])
    assert(!JSON.stringify(result).includes('PRIVATE')); assert.equal(calls[0].request.nextUrl.search, '?voiceReadOnly=1')
    for (const status of ['READY', 'RUNNING', 'FAILED']) { latest.status = status; assert.equal((await read('reports.status')).data.status, status) }
    latest = null; assert.equal((await read('reports.status')).data.reportId, null)
  })
  await check('read-only report request preserves Health Setup gate and default manual healing remains', async () => {
    complete = false
    assert.equal((await read('reports.status')).data.healthSetupComplete, false)
    await assert.rejects(read('reports.list'), error => error.status === 403)
    assert.deepEqual(healing, [])
    complete = true
    const response = await statusRoute.api.GET(new NextRequest('https://helfi.invalid/api/reports/weekly/status'))
    assert.equal(response.status, 200); assert.deepEqual(healing, ['enable', 'reschedule'])
  })
  await check('actual report lists keep enabled gate, limit and exact status/date projections without content', async () => {
    weekly.push({ ...latest, id: 'weekly-2', status: 'READY', periodStart: '2026-10-03', periodEnd: '2026-10-09' })
    const weeklyResult = await read('reports.list', { limit: 1 })
    assert.equal(weeklyResult.data.reports.length, 1); assert(!JSON.stringify(weeklyResult).includes('PRIVATE'))
    const uploadedResult = await read('reports.list', { kind: 'uploaded' })
    assert.equal(uploadedResult.data.reports[0].status, 'DECRYPTION_FAILED'); assert(!JSON.stringify(uploadedResult).includes('PRIVATE'))
    weeklyRoute.box.process.env.NEXT_PUBLIC_REPORTS_ENABLED = 'false'
    try { assert.equal((await read('reports.list')).data.enabled, false) } finally { weeklyRoute.box.process.env.NEXT_PUBLIC_REPORTS_ENABLED = 'true' }
    assert.deepEqual(healing, [])
  })
  await check('foreign duplicate invalid report status/date never becomes verified list', async () => {
    for (const patch of [{ userId: 'other-owner' }, { status: 'invented' }, { periodStart: '2026-02-30' }]) { weekly = [{ ...latest, ...patch }]; await assert.rejects(read('reports.list')) }
    weekly = [latest, latest]; await assert.rejects(read('reports.list'))
    uploaded[0].status = 'invented'; await assert.rejects(read('reports.list', { kind: 'uploaded' }))
  })
  await check('exact owned READY report summary and stored section are read verbatim without generation', async () => {
    weekly[0]={...latest,status:'READY',summary:'Keep this exact stored summary.',report:{summary:'Other stored text',sections:{nutrition:{working:[{name:'Protein at lunch',reason:'This is the exact stored reason.'}],suggested:['A stored suggestion.'],avoid:[]}}}}
    const summary=await read('reports.weekly.read',{reportId:'weekly-1'})
    assert.equal(summary.data.storedText,'Keep this exact stored summary.');assert.match(summary.message,/Stored report summary/);assert.equal(summary.safeToClaimSaved,false)
    const section=await read('reports.weekly.read',{periodStart:latest.periodStart,periodEnd:latest.periodEnd,section:'nutrition'})
    assert.equal(section.data.storedContent.working[0].reason,'This is the exact stored reason.');assert.match(section.message,/A stored suggestion\./)
    assert.deepEqual(plain(section.data.navigation.nativeTarget),{type:'tab',tab:'Insights'});assert.deepEqual(healing,[]);assert.equal(providerCalls.length,0)
    assert(calls.filter(call=>call.request).every(call=>call.request.nextUrl.pathname==='/api/reports/weekly/list'&&call.request.method==='GET'))
  })
  await check('report content stays unavailable for locked/running/failed or incomplete Health Setup', async () => {
    for(const status of ['LOCKED','RUNNING','FAILED']){weekly[0]={...latest,status};const result=await read('reports.weekly.read',{reportId:'weekly-1'});assert.equal(result.data.status,status);assert(!JSON.stringify(result).includes('PRIVATE'));assert.equal(result.data.storedText,undefined)}
    complete=false;await assert.rejects(read('reports.weekly.read',{reportId:'weekly-1'}),error=>error.status===403)
    assert.deepEqual(healing,[]);assert.equal(providerCalls.length,0)
  })
  await check('exact report period ambiguity and absent/foreign IDs never select or reveal guessed content', async () => {
    weekly.push({...latest,id:'same-period-2',status:'READY'})
    const ambiguous=await read('reports.weekly.read',{periodStart:latest.periodStart,periodEnd:latest.periodEnd})
    assert.equal(ambiguous.data.selectionRequired,true);assert.equal(ambiguous.data.choices.length,2);assert(!JSON.stringify(ambiguous).includes('PRIVATE'))
    const missing=await read('reports.weekly.read',{reportId:'not-owned'});assert.equal(missing.data.selectionRequired,true);assert.equal(missing.data.choices.length,0)
    weekly=[{...latest,userId:'other-user',status:'READY'}];await assert.rejects(read('reports.weekly.read',{reportId:'weekly-1'}))
  })
  await check('read schema refuses ambiguous selectors, invalid dates, invented sections and read-time mutations', async () => {
    for(const values of [{},{reportId:'weekly-1',periodStart:latest.periodStart,periodEnd:latest.periodEnd},{periodStart:latest.periodStart},{periodStart:'2026-02-30',periodEnd:'2026-03-01'},{reportId:'weekly-1',section:'invented'},{reportId:'weekly-1',unlock:true}])await assert.rejects(read('reports.weekly.read',values))
    assert.equal(calls.length,0)
  })
  await check('wallet total includes authoritative available credits without cents conversion or provider billing', async () => {
    const result = await read('credit.balance')
    assert.deepEqual(plain(result.data), { availableCredits: 1255, balanceTiming: 'before_current_voice_request_charge' }); assert.match(result.message, /1255 credits/); assert.match(result.message, /Before any charge for this voice request/)
    assert(!JSON.stringify(result).includes('PRIVATE')); assert.equal(result.safeToClaimSaved, false)
    assert.deepEqual(calls.filter(call => call.request).map(call => call.request.nextUrl.pathname), ['/api/credit/status'])
    responses.credit.totalAvailableCents = 0; assert.equal((await read('credit.balance')).data.availableCredits, 0)
  })
  await check('degraded HTTP200 wallet zeros and missing invalid balances never claim zero', async () => {
    for (const patch of [{ hasAccess: false, totalAvailableCents: 0 }, { debugStage: 'wallet-calc' }, { schemaVersion: 1 }, { totalAvailableCents: -1 }, { totalAvailableCents: '1255' }, { totalAvailableCents: null }]) { const original = responses.credit; responses.credit = { ...original, ...patch }; await assert.rejects(read('credit.balance')); responses.credit = original }
  })
  await check('hydration uses selected local calendar date, authoritative mL and normal custom goal', async () => {
    const result = await read('hydration.status')
    assert.deepEqual(plain(result.data), { localDate: selectedDate, loggedMl: 486.588, targetMl: 2600, goalSource: 'custom', entryCount: 2 })
    assert(!JSON.stringify(result).includes('PRIVATE'))
    const paths = calls.filter(call => call.request).map(call => call.request.nextUrl.pathname + call.request.nextUrl.search)
    assert.deepEqual(paths, ['/api/hydration-goal?date=2026-10-17', '/api/water-log?localDate=2026-10-17'])
    responses.water.entries = []; assert.equal((await read('hydration.status')).data.loggedMl, 0)
    await assert.rejects(read('hydration.status', { localDate: '2026-10-99' }))
  })
  await check('partial foreign wrong-day duplicate or unit-only water data never becomes a total', async () => {
    for (const patch of [{ userId: 'other-owner' }, { localDate: '2026-10-16' }, { amountMl: null, amount: 250, unit: 'ml' }, { amountMl: -1 }]) { const original = responses.water.entries[0]; responses.water.entries[0] = { ...original, ...patch }; await assert.rejects(read('hydration.status')); responses.water.entries[0] = original }
    responses.water.entries.push(responses.water.entries[0]); await assert.rejects(read('hydration.status'))
    responses.water.entries = []; responses.goal.targetMl = 0; await assert.rejects(read('hydration.status'))
  })
  await check('actual native Fitbit/Garmin readonly checks stored own state without tokens provider schema or backfill', async () => {
    const result = await read('devices.status')
    assert.equal(result.data.devices.length, 2); assert(result.data.devices.every(row => row.storedConnection === true && row.liveVerified === false))
    assert.match(result.message, /live device access and syncing were not tested/)
    assert(!/PRIVATE|TOKEN|providerAccountId|access_token/.test(JSON.stringify(result)))
    assert.deepEqual(providerCalls, []); assert.deepEqual(writes, [])
    connected.garmin = false
    const disconnected = await read('devices.status', { provider: 'garmin' })
    assert.equal(disconnected.data.devices.length, 1); assert.equal(disconnected.data.devices[0].storedConnection, false)
  })
  await check('original manual Garmin GET still checks provider and original DELETE auth is not broadened', async () => {
    webId = owner
    const response = await garminRoute.api.GET(new NextRequest('https://helfi.invalid/api/garmin/status'))
    assert.equal(response.status, 200); assert.deepEqual(providerCalls, ['garmin']); assert.deepEqual(writes, ['backfill scan'])
    writes.length = 0; webId = null
    assert.equal((await garminRoute.api.DELETE()).status, 401)
    assert.equal((await fitbitRoute.api.DELETE(request())).status, 401)
    assert.equal((await uploadRoute.api.GET(new NextRequest('https://helfi.invalid/api/reports/list'))).status, 401)
  })
  await check('device read failures never turn into disconnected or complete success', async () => {
    readFailure = true; await assert.rejects(read('devices.status'))
    assert.deepEqual(providerCalls, [])
  })
  await check('fixed handler requests retain original auth and correlation with no body or mutation', async () => {
    for (const action of ['reports.status', 'reports.list', 'credit.balance', 'hydration.status', 'devices.status']) await read(action)
    for (const call of calls.filter(call => call.request)) {
      assert.equal(call.request.method, 'GET'); assert.equal(call.request.body, null)
      assert.equal(call.request.headers.get('authorization'), 'Bearer synthetic'); assert.equal(call.request.headers.get('x-native-token'), 'synthetic'); assert.equal(call.request.headers.get('x-helfi-voice-action-id'), 'synthetic-read')
      assert.equal(call.request.headers.get('cache-control'), 'no-store'); assert.equal(call.request.nextUrl.origin, 'https://helfi.invalid')
    }
  })
  await check('abort before and between reads prevents late result and later handler work', async () => {
    const before = new AbortController(); before.abort(); await assert.rejects(read('credit.balance', {}, request(before.signal)), error => error.status === 499); assert.equal(calls.length, 0)
    const between = new AbortController(); afterHandler = name => { if (name === 'goal') between.abort() }
    await assert.rejects(read('hydration.status', {}, request(between.signal)), error => error.status === 499)
    assert(!calls.some(call => call.name === 'water'))
  })
  console.log(`Voice app reads: ${count} actual-source offline groups passed. Wallet/water use boundary fixtures; no live account, microphone or provider verification.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
