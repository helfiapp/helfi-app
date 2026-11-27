const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function compile(source, mocks = {}, globals = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, Date, Number, JSON, console: { error() {} }, ...globals,
    require: id => { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id] },
  })
  return module.exports
}
const load = (file, mocks, globals) => compile(fs.readFileSync(file, 'utf8'), mocks, globals)
const owner = { id: 'synthetic-owner', email: 'owner@example.test', name: 'Old Name', image: null }
const auth = () => ({ token: 'synthetic-token', expiresAt: Date.now() + 60000, user: { ...owner } })
const response = (body, status = 200) => ({ ok: status < 400, status, body, json: async () => body })

function profileFixture() {
  const source = fs.readFileSync('app/api/user-data/route.ts', 'utf8')
  const block = source.slice(source.indexOf('    // 8. Merge profile'), source.indexOf("    console.log('✅ POST", source.indexOf('    // 8. Merge profile')))
  const state = { user: { ...owner }, profile: { firstName: 'Old', lastName: 'Name', bio: 'Keep me', dateOfBirth: '1990-02-03', gender: 'female' }, fail: false, events: [] }
  let queue = Promise.resolve()
  const prisma = { $transaction: fn => {
    const pending = queue.then(async () => {
      const before = JSON.parse(JSON.stringify({ user: state.user, profile: state.profile }))
      let locked = false
      const tx = {
        $queryRaw: async (sql, id) => { assert.equal(id, owner.id); assert.match(sql.join('?'), /FOR UPDATE/); locked = true; state.events.push('lock') },
        user: { update: async ({ data }) => { assert.ok(locked); Object.assign(state.user, data) } },
        healthGoal: {
          findFirst: async () => { assert.ok(locked); return { category: JSON.stringify(state.profile) } },
          deleteMany: async () => { state.profile = null },
          create: async ({ data }) => { if (state.fail) throw Error('Synthetic DB failure'); state.profile = JSON.parse(data.category) },
        },
      }
      try { return await fn(tx) } catch (error) { Object.assign(state, before); throw error }
    })
    queue = pending.catch(() => {})
    return pending
  } }
  const { save } = compile(`export async function save(data, normalizedBirthdate = '') { const user = ${JSON.stringify(owner)}; ${block}; return { status: 200 } }`, {}, { prisma, NextResponse: { json: (body, opts) => ({ body, status: opts.status }) } })
  return { state, save }
}

function contextFixture() {
  const identity = load('native/src/lib/nativeAuthSession.ts', {})
  const stored = new Map(), states = []
  let writes = null, failure = false, index = 0
  const storage = {
    getItem: async key => stored.get(key) || null,
    setItem: async (key, value) => { if (writes) await writes.promise; if (failure) throw Error('Synthetic cache failure'); stored.set(key, value) },
    getAllKeys: async () => [...stored.keys()], multiRemove: async keys => keys.forEach(key => stored.delete(key)), removeItem: async key => stored.delete(key),
  }
  const react = { createContext: () => ({ Provider: 'Provider' }), createElement: (_, props) => ({ props }), useState: initial => { const n = index++; states[n] = initial; return [initial, value => { states[n] = value }] },
    useRef: current => ({ current }), useEffect() {}, useMemo: fn => fn(), useContext() {},
  }
  const context = load('native/src/state/AppModeContext.tsx', { react, '@react-native-async-storage/async-storage': storage, '../lib/nativeAuthSession': identity })
  return { ...identity, provider: context.AppModeProvider({ children: null }).props.value, states, stored,
    stallWrites: () => (writes = deferred()), failWrites: () => { failure = true } }
}

function screenFixture(platform) {
  const native = platform === 'native'
  const file = native ? 'native/src/screens/AccountSettingsScreen.tsx' : 'app/account/page.tsx'
  const source = fs.readFileSync(file, 'utf8')
  const start = source.indexOf('  const saveAccount = useCallback(')
  const end = source.indexOf(native ? '  useFocusEffect(' : '  useSaveOnLeave(', start)
  let current = auth(), activeIdentity = {}, status = 'idle', data = { fullName: 'Mary Jane van Doe', email: owner.email }, requests = [], refreshes = 0
  let confirmedName = 'Mary Jane van Doe'
  let handler = async url => url.endsWith('/me') ? response({ user: { ...owner, name: 'Mary Jane van Doe' } }) : response({ success: true })
  const globals = {
    session: current, accountData: data, accountRef: { current: data }, accountSnapshotRef: { current: '' }, dirtyRef: { current: true },
    ownerRef: { current: owner.id }, saveQueue: { current: Promise.resolve() }, sessionRef: { current }, formIdentityRef: { current: activeIdentity },
    getCurrentNativeAuthSession: () => activeIdentity, API_BASE_URL: 'https://example.test', buildNativeAuthHeaders: () => ({}),
    refreshProfileRef: { current: async () => { refreshes++; return true } },
    setSaveStatus: value => { status = value }, setLoading() {}, hasInitializedRef: { current: true }, setHasUnsavedChanges() {}, setAccountData: value => { data = value },
    useCallback: fn => fn,
    refreshSession: async () => ({ user: { ...owner, name: confirmedName } }), refreshData: async () => { refreshes++ },
    fetch: async (url, options) => { requests.push({ url, ...options }); return handler(url, options) },
  }
  const { saveAccount, loadAccount } = compile(`${source.slice(start, end)}; export { saveAccount${native ? ', loadAccount' : ''} }`, {}, globals)
  return { saveAccount, loadAccount, requests, globals, status: () => status, data: () => data, refreshes: () => refreshes,
    setFetch: value => { handler = value }, setConfirmedName: value => { confirmedName = value }, switchAccount: () => { activeIdentity = {}; globals.ownerRef.current = 'other-owner' } }
}

function webLoadFixture(httpStatus = 200, invalidJson = false) {
  const source = fs.readFileSync('app/account/page.tsx', 'utf8')
  const start = source.indexOf('  useEffect(() => {\n    const ownerId =')
  assert.ok(start >= 0)
  const end = source.indexOf('\n\n  useEffect(', start + 1)
  const gate = deferred()
  let data, cleanup, globalRefreshes = 0
  const requests = []
  const globals = {
    session: { user: owner }, ownerRef: { current: owner.id }, dirtyRef: { current: false },
    accountRef: { current: null }, accountSnapshotRef: { current: '' }, hasInitializedRef: { current: false },
    refreshSessionRef: { current: () => { globalRefreshes++; return gate.promise } },
    refreshSession: () => { globalRefreshes++; return gate.promise },
    fetch: async (url, options) => {
      requests.push({ url, options })
      assert.equal(url, '/api/auth/session'); assert.equal(options.cache, 'no-store'); assert.equal(options.method, undefined)
      const result = response(await gate.promise, httpStatus)
      if (invalidJson) result.json = async () => { throw Error('Synthetic invalid JSON') }
      return result
    }, setHasUnsavedChanges() {}, setSaveStatus() {},
    setAccountData: next => { data = next }, useEffect: callback => { cleanup = callback() },
  }
  compile(source.slice(start, end), {}, globals)
  return { gate, globals, requests, globalRefreshes: () => globalRefreshes, data: () => data, unmount: () => cleanup() }
}

async function main() {
  {
    const fresh = { user: { ...owner, name: 'Changed On Another Device' } }
    const f = webLoadFixture()
    assert.equal(f.requests.length, 1, 'one ordinary read per mounted effect')
    assert.equal(f.globalRefreshes(), 0, 'opening Account must not mutate global session loading')
    assert.equal(f.data().fullName, owner.name)
    f.gate.resolve(fresh); await tick()
    assert.equal(f.data().fullName, fresh.user.name)
    for (const change of ['dirty', 'account', 'unmount', 'foreign-result', 'saved-after-load-started']) {
      const g = webLoadFixture()
      if (change === 'dirty') g.globals.dirtyRef.current = true
      if (change === 'account') g.globals.ownerRef.current = 'other-owner'
      if (change === 'unmount') g.unmount()
      if (change === 'saved-after-load-started') g.globals.accountSnapshotRef.current = 'New confirmed save'
      g.gate.resolve(change === 'foreign-result' ? { user: { ...fresh.user, id: 'other-owner' } } : fresh)
      await tick()
      assert.equal(g.data().fullName, owner.name, change)
      assert.equal(g.requests.length, 1); assert.equal(g.globalRefreshes(), 0)
    }
    for (const [status, invalidJson] of [[500, false], [200, true]]) {
      const failed = webLoadFixture(status, invalidJson)
      failed.gate.resolve(fresh); await tick(); await tick()
      assert.equal(failed.data().fullName, owner.name, 'failed refresh retains current form')
      assert.equal(failed.requests.length, 1, 'failed read must not retry in a loop')
      assert.equal(failed.globalRefreshes(), 0)
    }
    await tick()
    assert.equal(f.requests.length, 1); assert.equal(f.globalRefreshes(), 0)
    console.log('PASS actual web load uses one no-store read without global session mutation; preserves late/foreign/dirty/snapshot/unmount and failed-read guards')
  }
  {
    const f = profileFixture()
    assert.equal((await f.save({ accountNameOwnerId: owner.id, profileInfo: { firstName: 'Mary', lastName: 'Jane van Doe' } })).status, 200)
    assert.equal(f.state.user.name, 'Mary Jane van Doe')
    assert.equal(f.state.profile.bio, 'Keep me'); assert.equal(f.state.profile.dateOfBirth, '1990-02-03'); assert.equal(f.state.profile.gender, 'female')
    f.state.fail = true
    assert.equal((await f.save({ profileInfo: { firstName: 'Lost', lastName: 'Write' } })).status, 500)
    assert.equal(f.state.user.name, 'Mary Jane van Doe'); assert.equal(f.state.profile.firstName, 'Mary')
    console.log('PASS actual profile block commits name/metadata together and rolls both back after storage failure')
  }
  {
    const f = profileFixture()
    await Promise.all([f.save({ profileInfo: { bio: 'New bio', dateOfBirth: '1991-04-05' } }), f.save({ accountNameOwnerId: owner.id, profileInfo: { firstName: 'Single', lastName: '' } })])
    assert.equal(f.state.profile.bio, 'New bio'); assert.equal(f.state.profile.dateOfBirth, '1991-04-05'); assert.equal(f.state.user.name, 'Single'); assert.equal(f.state.events.length, 2)
    assert.equal((await f.save({ accountNameOwnerId: 'other-owner', profileInfo: { firstName: 'Wrong', lastName: 'Account' } })).status, 409)
    assert.equal((await f.save({ accountNameOwnerId: owner.id, profileInfo: { firstName: '', lastName: '' } })).status, 400)
    assert.equal(f.state.user.name, 'Single')
    console.log('PASS concurrent partial profile edits preserve latest unrelated fields; wrong-account and blank saves fail')
  }
  {
    const me = load('app/api/native-auth/me/route.ts', {
      'next-auth/jwt': { getToken: async () => ({ ...owner, name: 'Stale Token Name' }) },
      '@/lib/prisma': { prisma: { user: { findUnique: async () => ({ ...owner, name: 'Fresh Saved Name' }) } } },
      'next/server': { NextResponse: { json: (body, opts) => ({ ...response(body, opts.status), headers: new Headers() }) } },
    }, { process: { env: { NEXTAUTH_SECRET: 'synthetic-secret' } } })
    const result = await me.GET({})
    assert.equal(result.body.user.name, 'Fresh Saved Name'); assert.equal(result.body.user.id, owner.id)
    console.log('PASS native account readback uses saved name rather than stale token display data')
  }
  for (const rememberMe of [false, true]) {
    const f = contextFixture(), current = auth()
    await f.provider.signIn({ rememberMe, session: current })
    const identity = f.getCurrentNativeAuthSession(), before = f.stored.get('helfi_auth_session_v1')
    assert.equal(await f.provider.refreshProfile(identity, { ...owner, name: 'Fresh Name' }), true)
    assert.equal(f.getCurrentNativeAuthSession(), identity, 'metadata must preserve consent identity')
    assert.equal(f.states[2].token, current.token); assert.equal(f.states[2].expiresAt, current.expiresAt); assert.equal(f.states[2].user.name, 'Fresh Name')
    if (rememberMe) {
      const cached = JSON.parse(f.stored.get('helfi_auth_session_v1')), previous = JSON.parse(before)
      assert.equal(cached.expiresAt, previous.expiresAt); assert.equal(cached.token, previous.token); assert.equal(cached.user.name, 'Fresh Name')
    } else assert.equal(f.stored.has('helfi_auth_session_v1'), false)
    assert.equal(await f.provider.refreshProfile(identity, { ...owner, email: 'other@example.test' }), false)
    f.failWrites()
    assert.equal(await f.provider.refreshProfile(identity, { ...owner, name: 'Current Run Name' }), true)
    assert.equal(f.states[2].user.name, 'Current Run Name')
    await f.provider.signOut()
    assert.equal(await f.provider.refreshProfile(identity, { ...owner, name: 'Late Name' }), false)
  }
  console.log('PASS metadata refresh preserves token/identity/expiry/remember choice and handles cache failure/sign-out')
  {
    const f = contextFixture(); await f.provider.signIn({ rememberMe: true, session: auth() })
    const identity = f.getCurrentNativeAuthSession(), gate = f.stallWrites()
    const refresh = f.provider.refreshProfile(identity, { ...owner, name: 'Delayed Name' }); await tick()
    const logout = f.provider.signOut(); gate.resolve(); await Promise.all([refresh, logout])
    assert.equal(f.getCurrentNativeAuthSession(), null); assert.equal(f.stored.has('helfi_auth_session_v1'), false)
    console.log('PASS delayed metadata cache write cannot restore a signed-out session')
  }
  for (const platform of ['web', 'native']) {
    {
      const f = screenFixture(platform); await f.saveAccount()
      assert.equal(f.status(), 'saved'); assert.equal(f.refreshes(), 1)
      assert.deepEqual(JSON.parse(f.requests[0].body), { accountNameOwnerId: owner.id, profileInfo: { firstName: 'Mary', lastName: 'Jane van Doe' } })
    }
    {
      const f = screenFixture(platform); f.setFetch(async () => response({ error: 'Synthetic failure' }, 500)); await f.saveAccount()
      assert.equal(f.status(), 'error'); assert.equal(f.globals.dirtyRef.current, true); assert.equal(f.refreshes(), 0)
    }
    {
      const f = screenFixture(platform), gate = deferred(); f.setFetch(() => gate.promise)
      const save = f.saveAccount(); await tick(); f.switchAccount(); gate.resolve(response({ success: true })); await save
      assert.notEqual(f.status(), 'saved'); assert.equal(f.refreshes(), 0)
    }
    {
      const f = screenFixture(platform), gate = deferred(); f.setFetch(async url => url.endsWith('/me') ? response({ user: { ...owner, name: 'Mary Jane van Doe' } }) : gate.promise)
      const save = f.saveAccount(); await tick(); f.globals.accountRef.current = { fullName: 'Later Edit', email: owner.email }; gate.resolve(response({ success: true })); await save
      assert.equal(f.globals.accountRef.current.fullName, 'Later Edit'); assert.equal(f.globals.dirtyRef.current, true)
    }
    {
      const f = screenFixture(platform)
      f.setConfirmedName('Old Name')
      if (platform === 'native') f.setFetch(async url => url.endsWith('/me') ? response({ user: { ...owner, name: 'Old Name' } }) : response({ success: true }))
      await f.saveAccount()
      assert.equal(f.status(), 'error'); assert.equal(f.globals.dirtyRef.current, true); assert.equal(f.refreshes(), 0)
    }
    if (platform === 'native') {
      const f = screenFixture(platform), gate = deferred()
      f.setFetch(async url => url.endsWith('/me') ? gate.promise : response({ success: true }))
      const save = f.saveAccount(); await tick(); f.switchAccount(); gate.resolve(response({ user: { ...owner, name: 'Mary Jane van Doe' } })); await save
      assert.notEqual(f.status(), 'saved'); assert.equal(f.refreshes(), 0)
    }
    {
      const f = screenFixture(platform), gate = deferred()
      let savedName = ''
      f.setFetch(async (url, options) => {
        if (url.endsWith('/me')) return response({ user: { ...owner, name: savedName } })
        const profile = JSON.parse(options.body).profileInfo
        savedName = `${profile.firstName} ${profile.lastName}`.trim()
        f.setConfirmedName(savedName)
        if (savedName === 'Mary Jane van Doe') await gate.promise
        return response({ success: true })
      })
      const first = f.saveAccount()
      const next = { fullName: 'New Multi Word Name', email: owner.email }
      f.globals.accountRef.current = next
      const second = f.saveAccount({ payload: next })
      await tick(); assert.equal(f.requests.length, 1, 'overlapping saves must serialize')
      gate.resolve(); await Promise.all([first, second])
      assert.equal(savedName, next.fullName); assert.equal(f.data().fullName, next.fullName); assert.equal(f.status(), 'saved')
    }
    {
      const f = screenFixture(platform); f.switchAccount(); await f.saveAccount()
      assert.equal(f.requests.length, 0, 'old account form cannot start a save for another account')
    }
    {
      const f = screenFixture(platform), gate = deferred()
      const original = { fullName: owner.name, email: owner.email }
      f.globals.accountSnapshotRef.current = JSON.stringify(original)
      let savedName = ''
      f.setFetch(async (url, options) => {
        if (url.endsWith('/me')) return response({ user: { ...owner, name: savedName } })
        const profile = JSON.parse(options.body).profileInfo
        savedName = `${profile.firstName} ${profile.lastName}`.trim()
        f.setConfirmedName(savedName)
        if (savedName === 'Mary Jane van Doe') await gate.promise
        return response({ success: true })
      })
      const first = f.saveAccount(); await tick()
      f.globals.accountRef.current = original
      f.globals.dirtyRef.current = false
      const revertedBlur = f.saveAccount()
      gate.resolve(); await Promise.all([first, revertedBlur])
      assert.equal(savedName, owner.name)
      assert.equal(f.requests.filter(request => request.method === 'POST').length, 2)
      assert.equal(f.globals.dirtyRef.current, false)
      assert.equal(f.data().fullName, owner.name)
      await f.saveAccount()
      assert.equal(f.requests.filter(request => request.method === 'POST').length, 2, 'unchanged blur must not save again')
    }
    {
      const f = screenFixture(platform), gate = deferred()
      const original = { fullName: owner.name, email: owner.email }
      f.globals.accountSnapshotRef.current = JSON.stringify(original)
      f.setFetch(async url => url.endsWith('/me') ? response({ user: { ...owner, name: 'Mary Jane van Doe' } }) : gate.promise)
      const save = f.saveAccount(); await tick()
      f.globals.accountRef.current = original
      f.globals.dirtyRef.current = false
      gate.resolve(response({ success: true })); await save
      assert.equal(f.globals.dirtyRef.current, true, 'confirmation must mark a reverted draft dirty against the new saved name')
      assert.equal(f.status(), 'idle')
    }
    console.log(`PASS actual ${platform} save callback preserves later edits and queued reversions, skips unchanged saves, rejects late account replies and reports failures`)
  }
  {
    const f = screenFixture('native'); f.globals.dirtyRef.current = false
    await f.loadAccount()
    assert.equal(f.data().fullName, 'Mary Jane van Doe'); assert.equal(f.data().email, owner.email)
    assert.equal(f.refreshes(), 1, 'accepted fresh name must refresh remembered display metadata')
    const g = screenFixture('native'), gate = deferred(); g.globals.dirtyRef.current = false
    g.setFetch(() => gate.promise)
    const loading = g.loadAccount(); g.switchAccount(); gate.resolve(response({ user: { ...owner, name: 'Late Owner Name' } })); await loading
    assert.notEqual(g.data().fullName, 'Late Owner Name')
    assert.equal(g.refreshes(), 0)
    const h = screenFixture('native'), delayed = deferred(); h.globals.dirtyRef.current = false
    h.setFetch(() => delayed.promise)
    const read = h.loadAccount()
    h.globals.accountSnapshotRef.current = 'New confirmed save'
    delayed.resolve(response({ user: { ...owner, name: 'Older Read' } })); await read
    assert.notEqual(h.data().fullName, 'Older Read')
    assert.equal(h.refreshes(), 0)
    const failed = screenFixture('native'); let rejectLoad
    failed.setFetch(() => new Promise((_, reject) => { rejectLoad = reject }))
    const pendingFailure = failed.loadAccount(); await tick(); failed.switchAccount()
    rejectLoad(Error('Synthetic old-account read failure')); await pendingFailure
    assert.notEqual(failed.status(), 'error', 'old-account load error must not paint replacement account')
    assert.equal(failed.refreshes(), 0)
    const dirty = screenFixture('native'); await dirty.loadAccount()
    assert.equal(dirty.refreshes(), 0, 'dirty form must not refresh remembered display metadata')
    const foreign = screenFixture('native'); foreign.globals.dirtyRef.current = false
    foreign.setFetch(async () => response({ user: { ...owner, id: 'foreign-owner', name: 'Foreign' } }))
    await foreign.loadAccount(); assert.equal(foreign.refreshes(), 0)
    console.log('PASS actual native load reads saved account data and rejects late account replies')
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
