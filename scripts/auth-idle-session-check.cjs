#!/usr/bin/env node
'use strict'
// Runs the actual installed NextAuth SessionProvider/fetchData/BroadcastChannel
// and the real Helfi AuthProvider through a small hook/timer harness.
// Only fake HTTP/events exist in this VM; no real fetch, database or env loading.
// The constant-900s counterfactual and focus-refetch counterfactual expose
// installed-library behavior; they are never shipped app configurations.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto'), { createRequire } = require('node:module')
const ROOT = path.resolve(__dirname, '..'), repoRequire = createRequire(path.join(ROOT, 'package.json')), ts = repoRequire('typescript')
const realProvider = fs.readFileSync(path.join(ROOT, 'components/providers/AuthProvider.tsx'), 'utf8')
const library = fs.readFileSync(path.join(ROOT, 'node_modules/next-auth/react/index.js'), 'utf8'), utilities = fs.readFileSync(path.join(ROOT, 'node_modules/next-auth/client/_utils.js'), 'utf8')
const sha = value => crypto.createHash('sha256').update(value).digest('hex')
function hub(extra = {}) {
  const handlers = new Map()
  return { ...extra, addEventListener(name, callback) { const set = handlers.get(name) || new Set(); set.add(callback); handlers.set(name, set) },
    removeEventListener(name, callback) { handlers.get(name)?.delete(callback) }, dispatch(name, event = {}) { for (const callback of [...(handlers.get(name) || [])]) callback(event) },
    listenerCount() { return [...handlers.values()].reduce((n, set) => n + set.size, 0) } }
}
async function instance({ hidden = false, baselineMode = false, hypotheticalFocus = false } = {}) {
  let clock = 1000000, nextTimer = 0, activeBank, networkFail = false, destroyed = false
  const timers = new Map(), calls = [], broadcasts = [], fakeSession = { user: { id: 'synthetic-owner' }, expires: '2031-10-19T00:00:00Z' }
  const doc = hub({ visibilityState: hidden ? 'hidden' : 'visible' }), win = hub({ location: { href: 'https://example.invalid/dashboard' }, localStorage: { setItem(name, value) { broadcasts.push({ name, value }) } } })
  const nav = { onLine: true }, authBank = { values: [], effects: [], dirty: false }, providerBank = { values: [], effects: [], dirty: false }
  const react = { createContext: () => ({ Provider: 'context-provider' }),
    useState(initial) { const b = activeBank, i = b.index++; if (!(i in b.values)) b.values[i] = typeof initial === 'function' ? initial() : initial
      return [b.values[i], value => { const next = typeof value === 'function' ? value(b.values[i]) : value; if (!Object.is(next, b.values[i])) { b.values[i] = next; b.dirty = true } }] },
    useEffect(callback, deps) { const b = activeBank, i = b.index++, prior = b.effects[i]
      if (!prior || !deps || deps.some((value, index) => !Object.is(value, prior.deps[index]))) b.pending.push(() => { prior?.cleanup?.(); b.effects[i] = { deps, cleanup: callback() } }) },
    useMemo(callback) { activeBank.index++; return callback() }, useContext() { throw new Error('No context consumer allowed') } }
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  class FakeDate extends Date { static now() { return clock } }
  const safeLogger = { error() {}, warn() {}, debug() {} }, loggerModule = { __esModule: true, default: safeLogger, proxyLogger: () => safeLogger }
  const globals = { Date: FakeDate, URL, URLSearchParams, navigator: nav, window: win, document: doc, process: { env: {} }, console: { error() {}, warn() {}, log() {} },
    fetch: async url => { calls.push({ url, at: clock }); if (networkFail) throw new Error('synthetic offline request'); return { ok: true, json: async () => structuredClone(fakeSession) } },
    setInterval(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay, at: clock + delay }); return id }, clearInterval(id) { timers.delete(id) } }
  const utilsExports = {}, authExports = {}, outerExports = {}
  const fallbackRequire = name => name.startsWith('@babel/runtime/') ? repoRequire(name) : (() => { throw new Error('Unexpected import ' + name) })()
  vm.runInNewContext(utilities, { ...globals, exports: utilsExports, require: fallbackRequire }, { filename: 'actual-next-auth-client-utils.js' })
  const authRequire = name => name === 'react' ? react : name === 'react/jsx-runtime' ? jsx : name === '../utils/logger' ? loggerModule : name === '../utils/parse-url'
    ? repoRequire(path.join(ROOT, 'node_modules/next-auth/utils/parse-url.js')) : name === '../client/_utils' ? utilsExports : name === './types' ? {} : fallbackRequire(name)
  vm.runInNewContext(library, { ...globals, exports: authExports, require: authRequire }, { filename: 'actual-next-auth-react.js' })
  const outerRequire = name => name === 'react' ? react : name === 'react/jsx-runtime' ? jsx : name === 'next-auth/react' ? authExports : name === './AiConsentProvider' ? { AiConsentProvider: 'consent-provider' } : fallbackRequire(name)
  vm.runInNewContext(ts.transpileModule(realProvider, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { ...globals, exports: outerExports, require: outerRequire }, { filename: 'actual-helfi-auth-provider.js' })
  let props, sessionValue
  const renderBank = (bank, callback) => { activeBank = bank; bank.index = 0; bank.pending = []; bank.dirty = false; const result = callback(); return { result, effects: bank.pending.slice() } }
  function render() {
    const outer = renderBank(authBank, () => outerExports.AuthProvider({ children: null })); props = outer.result.props
    if (baselineMode) props.refetchInterval = 900 // Explicit old constant-interval counterfactual, not a second app source.
    if (hypotheticalFocus) props.refetchOnWindowFocus = true
    const provider = renderBank(providerBank, () => authExports.SessionProvider(props)); sessionValue = provider.result.props.value
    // Child passive effects run before the parent's mount visibility effect.
    for (const effect of [...provider.effects, ...outer.effects]) effect()
  }
  async function settle() {
    for (let i = 0; i < 30; i++) { await Promise.resolve(); if (!destroyed && (authBank.dirty || providerBank.dirty)) render() }
  }
  async function advance(ms) {
    const end = clock + ms
    for (;;) { let dueId, dueAt = Infinity; for (const [id, timer] of timers) if (timer.at < dueAt) { dueId = id; dueAt = timer.at }
      if (dueAt > end) break; clock = dueAt; const timer = timers.get(dueId); timer.at += timer.delay; timer.callback(); await settle() }
    clock = end; await settle()
  }
  render(); await settle()
  return { calls, broadcasts, props: () => props, status: () => sessionValue.status, advance, failNetwork(value) { networkFail = value },
    async visibility(value) { doc.visibilityState = value; doc.dispatch('visibilitychange'); await settle() },
    async focus() { win.dispatch('focus'); await settle() }, async online(value) { nav.onLine = value; win.dispatch(value ? 'online' : 'offline'); await settle() },
    async storage() { win.dispatch('storage', { key: 'nextauth.message', newValue: JSON.stringify({ event: 'session', data: { trigger: 'getSession' }, timestamp: clock / 1000 }) }); await settle() },
    destroy() { destroyed = true; for (const bank of [authBank, providerBank]) for (const effect of bank.effects) effect?.cleanup?.(); assert.equal(timers.size, 0); assert.equal(win.listenerCount(), 0); assert.equal(doc.listenerCount(), 0) } }
}
let groups = 0
async function check(label, work) { await work(); groups++; console.log('PASS ' + label) }
async function main() {
  await check('hidden real provider mounts normally but makes no periodic session reads for one simulated hour', async () => {
    const c = await instance({ hidden: true }); assert.equal(c.props().refetchOnWindowFocus, false); assert.equal(c.props().refetchWhenOffline, false); assert.equal(c.calls.length, 1); assert.equal(c.status(), 'authenticated'); assert.equal(c.props().refetchInterval, 0)
    await c.advance(3600000); assert.equal(c.calls.length, 1); assert.equal(c.status(), 'authenticated'); c.destroy()
  })
  await check('visible real provider retains the existing 15-minute interval and removes it when hidden', async () => {
    const c = await instance(); assert.equal(c.props().refetchInterval, 900); await c.advance(900000); assert.equal(c.calls.length, 2)
    await c.visibility('hidden'); await c.advance(3600000); assert.equal(c.calls.length, 2); assert.equal(c.status(), 'authenticated'); c.destroy()
  })
  await check('returning visible does not request immediately, even with transient network failure', async () => {
    const c = await instance({ hidden: true }); c.failNetwork(true); await c.visibility('visible'); await c.focus(); assert.equal(c.calls.length, 1); assert.equal(c.status(), 'authenticated')
    c.failNetwork(false); await c.advance(900000); assert.equal(c.calls.length, 2); c.destroy()
  })
  await check('offline semantics and remembered in-memory session stay intact across offline/online transitions', async () => {
    const c = await instance(); await c.online(false); await c.advance(3600000); assert.equal(c.calls.length, 1); assert.equal(c.status(), 'authenticated')
    await c.online(true); assert.equal(c.calls.length, 1); await c.advance(900000); assert.equal(c.calls.length, 2); c.destroy()
  })
  await check('actual installed NextAuth focus-refetch would clear the in-memory session on transient failure', async () => {
    const c = await instance({ hidden: true, hypotheticalFocus: true }); c.failNetwork(true); await c.visibility('visible')
    assert.equal(c.calls.length, 2); assert.equal(c.status(), 'unauthenticated'); c.destroy()
  })
  await check('existing visible timer failure remains a documented library risk rather than a claimed repair', async () => {
    const c = await instance(); c.failNetwork(true); await c.advance(900000); assert.equal(c.calls.length, 2); assert.equal(c.status(), 'unauthenticated'); c.destroy()
  })
  await check('another tab storage broadcast still causes a hidden read and existing synchronization is preserved', async () => {
    const c = await instance({ hidden: true }); await c.storage(); assert.equal(c.calls.length, 2); assert.equal(c.status(), 'authenticated'); c.destroy()
  })
  await check('old constant-interval control really polls while actual visibility churn leaves no timer/listener leaks', async () => {
    const old = await instance({ hidden: true, baselineMode: true }); await old.advance(3600000); assert.equal(old.calls.length, 5); old.destroy()
    const c = await instance(); for (let i = 0; i < 10; i++) { await c.visibility('hidden'); await c.visibility('visible') } c.destroy()
  })
  assert.equal(fs.readFileSync(path.join(ROOT, 'components/providers/AuthProvider.tsx'), 'utf8'), realProvider)
  console.log(`PASS ${groups} actual AuthProvider/installed-NextAuth offline groups. No source, real browser, DB, environment or provider access.`)
  console.log(JSON.stringify({ actualAuthProviderSha256: sha(realProvider), installedNextAuthVersion: repoRequire(path.join(ROOT, 'node_modules/next-auth/package.json')).version, installedReactSourceSha256: sha(library), installedClientUtilsSha256: sha(utilities), fakeNetworkOnly: true, actualBrowserOrMobileVerified: false }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
