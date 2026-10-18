#!/usr/bin/env node
'use strict'
// Executes only the actual screen's loadAll callback with controlled responses.
// No React mount, app/server import, network, credentials or database is used.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const file = path.resolve(__dirname, '../native/src/screens/TrackCaloriesScreen.tsx')
const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let callback, creditCallback
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadAll') callback = node.initializer
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'refreshCreditBalance') creditCallback = node.initializer
  ts.forEachChild(node, visit)
}
visit(ast)
assert(callback && ts.isCallExpression(callback), 'Actual loadAll callback must exist')
assert(creditCallback && ts.isCallExpression(creditCallback), 'Actual guarded credit callback must exist')
const printer = ts.createPrinter()
const expression = printer.printNode(ts.EmitHint.Expression, callback, ast)
const creditExpression = printer.printNode(ts.EmitHint.Expression, creditCallback, ast)
const code = ts.transpileModule(`globalThis.makeLoadAll = (selectedDate, session, authHeaders) => {
  const creditReadIdentity = session?.token ? 'synthetic-account:' + session.token : null;
  creditReadGuardRef.current.setAccount(creditReadIdentity);
  const refreshCreditBalance = ${creditExpression};
  return ${expression};
}`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
function pure(relative) {
  const exports = {}
  const source = fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
  new Function('exports', 'require', compiled)(exports, (id) => { throw Error('Unexpected pure import ' + id) })
  return exports
}
const { createVoiceActionReadGuard } = pure('native/src/voice/voiceActionReadRefresh.ts')
const { walletCreditBalance } = pure('native/src/voice/voiceCreditSettlement.ts')
const tick = async () => { for (let index = 0; index < 16; index++) await Promise.resolve() }
const response = (body, ok = true) => ({ ok, json: async () => body })
function harness(initialLoading = false) {
  const state = { loading: initialLoading, entries: [], waterEntries: [], exerciseEntries: ['new-health-import'], exerciseCalories: 900 }
  const loadingEvents = []
  const alerts = []
  const creditReadGuardRef = { current: createVoiceActionReadGuard() }
  creditReadGuardRef.current.mount()
  let activeBatch
  const setters = {}
  for (const name of ['Loading', 'Entries', 'WaterEntries', 'ExerciseEntries', 'ExerciseCalories', 'CreditsRemaining', 'CreditsPercentUsed', 'FoodAnalysisUsageCount', 'FoodAnalysisCostPerUse', 'FoodAnalysisUsageLabel', 'DailyTargets', 'Favorites']) {
    setters[`set${name}`] = (value) => { state[name[0].toLowerCase() + name.slice(1)] = value; if (name === 'Loading') loadingEvents.push(value) }
  }
  const context = vm.createContext({ ...setters, Date, URLSearchParams, API_BASE_URL: 'https://helfi.invalid', useCallback: (fn) => fn,
    creditReadGuardRef, walletCreditBalance,
    loadRequestIdRef: { current: 0 }, healthExerciseRevisionRef: { current: 0 },
    buildNativeAuthHeaders: (token) => ({ authorization: `Bearer ${token}` }),
    normalizeFoodApiEntry: (entry) => ({ ...entry }), normalizeFavoriteList: (items) => items,
    numberOrZero: (value) => Number(value) || 0, clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    buildDailyTargetsFromUserData: (value) => value.targets || {}, DEFAULT_TARGETS: {}, Alert: { alert: (...args) => alerts.push(args) },
    fetch(url, options) {
      const batch = activeBatch
      assert(batch, 'Each synthetic request belongs to an explicit invocation')
      const parsed = new URL(url)
      return new Promise((resolve, reject) => batch.requests.push({ path: parsed.pathname, date: parsed.searchParams.get('date') || parsed.searchParams.get('localDate'), headers: options.headers, resolve, reject }))
    },
  })
  vm.runInContext(code, context)
  function start({ silent = false, date = '2026-10-17', token = 'synthetic-A', authenticated = true } = {}) {
    const batch = { requests: [], date, token }
    activeBatch = batch
    const load = context.makeLoadAll(date, authenticated ? { token } : null, authenticated ? { authorization: `Bearer ${token}` } : null)
    batch.promise = load(silent ? { silent: true } : undefined)
    if (authenticated) assert.equal(batch.requests.filter((request) => !['/api/food-log', '/api/water-log', '/api/exercise-entries'].includes(request.path)).length, 3, 'Credits, feature usage and user data remain separate supporting requests')
    activeBatch = null
    return batch
  }
  function primary(batch, { tag = batch.token, fail = false, ok = true, logs } = {}) {
    for (const request of batch.requests.filter((item) => ['/api/food-log', '/api/water-log', '/api/exercise-entries'].includes(item.path))) {
      if (fail && request.path === '/api/food-log') request.reject(Error('synthetic primary failure'))
      else request.resolve(response(request.path === '/api/food-log' ? { logs: logs || [{ id: tag, localDate: batch.date }] }
        : request.path === '/api/water-log' ? { entries: [{ id: `water-${tag}` }] } : { entries: [{ id: `exercise-${tag}` }], exerciseCalories: 123 }, ok))
    }
  }
  function secondary(batch, fail = false) {
    for (const request of batch.requests.filter((item) => !['/api/food-log', '/api/water-log', '/api/exercise-entries'].includes(item.path))) {
      if (fail && request.path === '/api/credit/status') request.reject(Error('synthetic supporting failure'))
      else request.resolve(response(request.path === '/api/credit/status' ? { credits: { total: 100 }, percentUsed: 10 }
        : request.path === '/api/user-data' ? { favorites: [], targets: { calories: 2000 } } : { featureUsage: {} }))
    }
  }
  return { state, loadingEvents, alerts, context, start, primary, secondary }
}
let passed = 0
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`) }
async function run() {
  await check('initial foreground load stays busy until primary data, then clears before supporting requests', async () => {
    const h = harness(true); const load = h.start()
    await tick(); assert.equal(h.state.loading, true); assert.equal(h.state.entries.length, 0)
    h.primary(load); await tick(); assert.equal(h.state.loading, false); assert.equal(h.state.entries[0].id, 'synthetic-A')
    h.secondary(load); await load.promise
  })
  await check('foreground then silent, older first: latest silent primary releases existing loading', async () => {
    const h = harness(); const old = h.start({ token: 'old' }); const latest = h.start({ silent: true, token: 'latest' })
    h.primary(old); h.secondary(old); await old.promise
    assert.equal(h.state.loading, true); assert.equal(h.state.entries.length, 0)
    h.primary(latest); await tick(); assert.equal(h.state.loading, false); assert.equal(h.state.entries[0].id, 'latest')
    h.secondary(latest); await latest.promise
  })
  await check('foreground then silent, latest first: late stale results never replace latest data', async () => {
    const h = harness(); const old = h.start({ token: 'old' }); const latest = h.start({ silent: true, token: 'latest' })
    h.primary(latest); h.secondary(latest); await latest.promise
    assert.equal(h.state.loading, false)
    h.primary(old); h.secondary(old); await old.promise
    assert.equal(h.state.loading, false); assert.equal(h.state.entries[0].id, 'latest'); assert.equal(h.state.waterEntries[0].id, 'water-latest')
  })
  await check('multiple foreground/silent overlaps only let latest completion clear loading', async () => {
    for (const silentFlags of [[false, false, true], [false, true, false], [true, false, true]]) {
      const h = harness(true)
      const loads = silentFlags.map((silent, index) => h.start({ silent, token: `load-${index}` }))
      for (const load of loads.slice(0, -1)) { h.primary(load); h.secondary(load); await load.promise; assert.equal(h.state.loading, true) }
      const latest = loads.at(-1); h.primary(latest); await tick(); assert.equal(h.state.loading, false)
      h.secondary(latest); await latest.promise; assert.equal(h.state.entries[0].id, 'load-2')
    }
  })
  await check('latest silent primary failure clears busy state without a new alert or stale data', async () => {
    const h = harness(); const old = h.start({ token: 'old' }); const latest = h.start({ silent: true, token: 'latest' })
    h.primary(latest, { fail: true }); h.secondary(latest); await latest.promise
    assert.equal(h.state.loading, false); assert.equal(h.alerts.length, 0)
    h.primary(old); h.secondary(old); await old.promise
    assert.equal(h.state.entries.length, 0); assert.equal(h.state.loading, false)
  })
  await check('latest foreground failure releases loading and retains its existing error notice', async () => {
    const h = harness(); const load = h.start()
    h.primary(load, { fail: true }); h.secondary(load); await load.promise
    assert.equal(h.state.loading, false); assert.equal(h.alerts.length, 1)
  })
  await check('ordinary silent refresh never turns the loading screen on', async () => {
    const h = harness(); const load = h.start({ silent: true })
    await tick(); assert.equal(h.state.loading, false); assert(!h.loadingEvents.includes(true))
    h.primary(load); h.secondary(load); await load.promise
    assert(!h.loadingEvents.includes(true)); assert.equal(h.state.loading, false)
  })
  await check('a newer account/date invocation keeps its own headers/date and ignores previous results', async () => {
    const h = harness(); const old = h.start({ token: 'account-A', date: '2026-10-16' }); const latest = h.start({ token: 'account-B', date: '2026-10-17', silent: true })
    assert(old.requests.filter((request) => request.date).every((request) => request.date === '2026-10-16'))
    assert(latest.requests.filter((request) => request.date).every((request) => request.date === '2026-10-17'))
    assert(latest.requests.every((request) => request.headers.authorization === 'Bearer account-B'))
    h.primary(old); h.secondary(old); await old.promise; assert.equal(h.state.loading, true)
    h.primary(latest); h.secondary(latest); await latest.promise
    assert.equal(h.state.entries[0].localDate, '2026-10-17'); assert.equal(h.state.entries[0].id, 'account-B'); assert.equal(h.state.loading, false)
  })
  await check('a newer Health import revision keeps imported exercise while meals/water finish', async () => {
    const h = harness(true); const load = h.start({ silent: true }); h.context.healthExerciseRevisionRef.current++
    h.primary(load); h.secondary(load); await load.promise
    assert.equal(JSON.stringify(h.state.exerciseEntries), JSON.stringify(['new-health-import'])); assert.equal(h.state.exerciseCalories, 900)
    assert.equal(h.state.entries.length, 1); assert.equal(h.state.waterEntries.length, 1); assert.equal(h.state.loading, false)
  })
  await check('empty, dated, missing-date and cross-day server rows still reach the unchanged normalizer', async () => {
    for (const logs of [[], [{ id: 'dated', localDate: '2026-10-17' }], [{ id: 'legacy', createdAt: '2026-10-16T13:30:00.000Z' }], [{ id: 'corrected-server-result', localDate: '2026-10-16', createdAt: '2026-10-16T13:30:00.000Z' }]]) {
      const h = harness(true); const load = h.start(); h.primary(load, { logs }); h.secondary(load); await load.promise
      assert.equal(JSON.stringify(h.state.entries), JSON.stringify(logs)); assert.equal(h.state.loading, false)
    }
  })
  await check('failed supporting refresh still clears loading after primary completion', async () => {
    const h = harness(true); const load = h.start({ silent: true })
    h.primary(load); await tick(); assert.equal(h.state.loading, false)
    h.secondary(load, true); await load.promise; assert.equal(h.state.loading, false); assert.equal(h.alerts.length, 0)
  })
  await check('failed supporting credit refresh preserves the previously verified wallet while other supporting requests finish', async () => {
    const h = harness(true); const initial = h.start()
    h.primary(initial); h.secondary(initial); await initial.promise
    assert.equal(h.state.creditsRemaining, 100); assert.equal(h.state.creditsPercentUsed, 10)
    const refresh = h.start({ silent: true }); h.primary(refresh); h.secondary(refresh, true); await refresh.promise
    assert.equal(h.state.creditsRemaining, 100); assert.equal(h.state.creditsPercentUsed, 10)
    assert.equal(h.state.loading, false); assert.equal(h.alerts.length, 0); assert.deepEqual(h.state.dailyTargets, { calories: 2000 })
  })
  await check('unauthenticated foreground exit clears initial loading and makes no requests', async () => {
    const h = harness(true); const load = h.start({ authenticated: false }); await load.promise
    assert.equal(load.requests.length, 0); assert.equal(h.state.loading, false)
  })
  console.log(`Food native loading races: ${passed} actual-source offline groups passed; no UI/runtime or live-save claim.`)
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
