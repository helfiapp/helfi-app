const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, mocks, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, Date, Number, AbortController, setTimeout, clearTimeout, ...globals,
    require: id => { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id] },
  }, { filename: file })
  return module.exports
}

const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const session = (id = 'account-a', token = `synthetic-${id}`) => ({ token, expiresAt: Date.now() + 60000, user: { id, email: `${id}@example.test` } })
const version = '2026-10-04'

function fixture(timeoutMs) {
  const identity = load('native/src/lib/nativeAuthSession.ts', {})
  const stored = new Map(), states = [], effects = [], requests = [], alerts = []
  let failWrite = false, granted = false, fetchHandler = null, storageRead = null, stateIndex = 0
  const storage = {
    getItem: async key => storageRead ? storageRead(key) : stored.get(key) || null,
    setItem: async (key, value) => { if (failWrite) throw Error('Synthetic storage failure'); stored.set(key, value) },
    getAllKeys: async () => [...stored.keys()],
    removeItem: async key => { stored.delete(key) },
    multiRemove: async keys => keys.forEach(key => stored.delete(key)),
  }
  const React = { createContext: () => ({ Provider: 'Provider' }), createElement: (type, props) => ({ type, props }),
    useState: initial => { const index = stateIndex++; states[index] = initial; return [initial, value => { states[index] = value }] },
    useEffect: effect => { effects.push(effect) }, useMemo: factory => factory(), useRef: current => ({ current }), useContext: () => null,
  }
  const context = load('native/src/state/AppModeContext.tsx', {
    react: React, '@react-native-async-storage/async-storage': storage, '../lib/nativeAuthSession': identity,
  })
  const provider = context.AppModeProvider({ children: null }).props.value
  const consent = load('native/src/lib/aiConsent.ts', {
    'react-native': { Alert: { alert: (...args) => alerts.push(args) } },
    '@react-native-async-storage/async-storage': storage,
    '../config': { API_BASE_URL: 'https://example.test' },
    './nativeAuthHeaders': { buildNativeAuthHeaders: token => ({ authorization: `Bearer ${token}` }) },
    './nativeAuthSession': identity,
  }, { setTimeout: (callback, ms) => setTimeout(callback, timeoutMs ?? ms), fetch: async (url, options) => {
    requests.push({ url, ...options })
    if (fetchHandler) return fetchHandler(url, options)
    if (options.method === 'POST') granted = JSON.parse(options.body).granted
    return { ok: true, json: async () => ({ granted, version }) }
  } })
  return { ...identity, provider, consent, stored, states, requests, alerts,
    failWrites: () => { failWrite = true }, setGranted: value => { granted = value },
    setStorageRead: handler => { storageRead = handler },
    setFetch: handler => { fetchHandler = handler }, hydrate: async () => { const cleanup = effects[0](); await tick(); return cleanup },
  }
}

async function main() {
  {
    const f = fixture(), current = session()
    await f.provider.signIn({ rememberMe: false, session: current })
    assert.equal(f.stored.has('helfi_auth_session_v1'), false, 'nonpersistent sign-in must remain nonpersistent')
    assert.equal(f.getCurrentNativeAuthSession().token, current.token)
    const first = f.consent.requestAiDataSharingPermission(), second = f.consent.requestAiDataSharingPermission()
    await tick()
    assert.equal(f.requests.length, 1); assert.equal(f.alerts.length, 1, 'same-session requests share one disclosure')
    f.alerts[0][2][1].onPress()
    assert.equal(await first, true); assert.equal(await second, true)
    assert.equal(f.requests[1].headers.authorization, `Bearer ${current.token}`)
    assert.equal(await f.consent.revokeAiDataSharingPermission(), true)
    assert.equal(await f.consent.hasAiDataSharingPermission(), false)
    assert.equal(f.stored.has('helfi_auth_session_v1'), false)
    console.log('PASS nonpersistent sign-in can grant/check/withdraw server consent; concurrent prompt is shared')
  }
  {
    const f = fixture(), current = session()
    f.failWrites()
    await f.provider.signIn({ rememberMe: true, session: current })
    f.setGranted(true)
    assert.equal(await f.consent.hasAiDataSharingPermission(), true, 'storage failure must not break a valid in-memory session')
    await f.provider.signOut()
    const count = f.requests.length
    assert.equal(f.getCurrentNativeAuthSession(), null)
    assert.equal(await f.consent.requestAiDataSharingPermission(), false)
    assert.equal(f.requests.length, count)
    console.log('PASS failed persistence preserves current-run access; sign-out immediately removes consent access')
  }
  {
    const f = fixture(), current = session()
    f.stored.set('helfi_auth_session_v1', JSON.stringify({ ...current, mode: 'signedIn' }))
    const cleanup = await f.hydrate()
    f.setGranted(true)
    assert.equal(await f.consent.hasAiDataSharingPermission(), true)
    cleanup()
    assert.equal(f.getCurrentNativeAuthSession(), null)
    for (const expiresAt of [Date.now() - 1, NaN, Infinity]) {
      f.setCurrentNativeAuthSession({ ...current, expiresAt })
      assert.equal(await f.consent.hasAiDataSharingPermission(), false)
    }
    assert.equal(f.requests.length, 1)
    console.log('PASS remembered-session hydration, provider cleanup and expired/invalid sessions fail closed')
  }
  for (const action of ['signIn', 'signOut']) {
    const f = fixture(), old = session(), current = session('account-b'), pending = deferred()
    f.setStorageRead(() => pending.promise)
    await f.hydrate()
    if (action === 'signIn') await f.provider.signIn({ rememberMe: false, session: current })
    else await f.provider.signOut()
    pending.resolve(JSON.stringify({ ...old, mode: 'signedIn' }))
    await tick()
    assert.equal(f.getCurrentNativeAuthSession()?.token || null, action === 'signIn' ? current.token : null)
  }
  {
    const f = fixture()
    const signingIn = f.provider.signIn({ rememberMe: false, session: session() })
    await f.provider.signOut()
    await signingIn
    assert.equal(f.getCurrentNativeAuthSession(), null)
  }
  console.log('PASS late saved-session hydration cannot replace a newer sign-in or undo sign-out')
  for (const method of ['GET', 'POST']) {
    for (const sameToken of [false, true]) {
      const f = fixture(), current = session(), pending = deferred()
      f.setCurrentNativeAuthSession(current)
      f.setFetch(async () => pending.promise)
      const request = method === 'GET' ? f.consent.hasAiDataSharingPermission() : f.consent.grantAiDataSharingPermission(current.token)
      f.setCurrentNativeAuthSession(sameToken ? current : session('account-b'))
      pending.resolve({ ok: true, json: async () => ({ granted: true, version }) })
      assert.equal(await request, false, `${method} cannot authorize after ${sameToken ? 'same-token re-login' : 'account change'}`)
    }
  }
  console.log('PASS delayed GET/POST replies cannot authorize another account or a replacement session')
  {
    const f = fixture(), current = session()
    f.setCurrentNativeAuthSession(current)
    const old = f.consent.requestAiDataSharingPermission()
    await tick()
    f.setCurrentNativeAuthSession(session('account-b'))
    const fresh = f.consent.requestAiDataSharingPermission()
    await tick()
    const before = f.requests.length
    f.alerts[0][2][1].onPress()
    assert.equal(await old, false)
    assert.equal(f.requests.length, before, 'stale disclosure cannot write consent')
    const concurrentFresh = f.consent.requestAiDataSharingPermission()
    await tick()
    assert.equal(f.alerts.length, 2, 'old completion cannot clear the new session request')
    f.alerts[1][2][1].onPress()
    assert.equal(await fresh, true); assert.equal(await concurrentFresh, true)
    console.log('PASS account changes during disclosure cannot grant or reuse permission for the wrong session')
  }
  {
    const f = fixture(), current = session()
    f.setCurrentNativeAuthSession(current)
    assert.equal(await f.consent.grantAiDataSharingPermission('synthetic-other-token'), false)
    assert.equal(f.requests.length, 0)
    f.setFetch(async () => ({ ok: false, json: async () => ({ granted: true, version }) }))
    assert.equal(await f.consent.grantAiDataSharingPermission(), false)
    f.setFetch(async () => ({ ok: true, json: async () => ({ granted: true, version: 'old' }) }))
    assert.equal(await f.consent.hasAiDataSharingPermission(), false)
    f.setFetch(async () => { throw Error('Synthetic outage') })
    assert.equal(await f.consent.hasAiDataSharingPermission(), false)
    assert.equal(await f.consent.grantAiDataSharingPermission(), false)
    f.setFetch(null)
    const declined = f.consent.requestAiDataSharingPermission()
    await tick()
    const count = f.requests.length
    f.alerts[0][2][0].onPress()
    assert.equal(await declined, false)
    assert.equal(f.requests.length, count, 'declining never posts consent')
    console.log('PASS stale caller token, server failure, old disclosure version, outage and decline fail closed')
  }
  {
    const f = fixture(1)
    f.setCurrentNativeAuthSession(session())
    let aborted = false
    f.setFetch(async (_url, { signal }) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(Error('Synthetic timeout')) })
    }) }))
    assert.equal(await f.consent.hasAiDataSharingPermission(), false)
    assert.equal(aborted, true, 'the timeout must include reading the response body')
    console.log('PASS consent response-body stall is covered by the existing request timeout')
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
