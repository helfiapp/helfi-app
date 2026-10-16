#!/usr/bin/env node
'use strict'
// Actual web effect/save -> actual normal GET/POST, reusing isolated synthetic
// SQL/auth fixtures. No browser, network, credentials, provider or real storage.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const { execFileSync } = require('node:child_process')
if (process.argv[2] !== '--zone') {
  for (const zone of ['Australia/Melbourne', 'Pacific/Kiritimati', 'UTC']) process.stdout.write(execFileSync(process.execPath, [__filename, '--zone', zone], { env: { TZ: zone }, encoding: 'utf8' }))
  console.log('PASS web check-in explicit local day, full notes/N/A, account/day cache isolation and no stale saves. Synthetic normal handlers only.')
} else {
  const zone = process.argv[3], root = path.resolve(__dirname, '..')
  const expectedDate = zone === 'UTC' ? '2026-10-16' : '2026-10-17'
  const nativeFixture = fs.readFileSync(path.join(__dirname, 'native-checkin-local-date-check.cjs'), 'utf8').replace(/^#![^\n]*\n/, '')
  const commonEnd = nativeFixture.indexOf("if (process.argv[2]"), fixtureStart = nativeFixture.indexOf('  const root ='), fixtureEnd = nativeFixture.indexOf('  let count = 0')
  assert(commonEnd > 0 && fixtureStart > commonEnd && fixtureEnd > fixtureStart)
  const makeNormalFixture = new Function('require', '__dirname', 'process', `${nativeFixture.slice(0, commonEnd)}\n${nativeFixture.slice(fixtureStart, fixtureEnd)}\nreturn harness`)(require, __dirname, { argv: ['', '', '--zone', zone] })
  const source = fs.readFileSync(path.join(root, 'app/check-in/page.tsx'), 'utf8'), ast = ts.createSourceFile('check-in.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let helper, effect, save, assignment
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'deviceCheckinDate') helper = node.getText(ast)
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('CACHE_TTL_MS')) effect = node.arguments[0].getText(ast)
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleSave') save = node.initializer.getText(ast)
    if (ts.isExpressionStatement(node) && node.getText(ast) === 'accountRef.current = account') assignment = node.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast); assert(helper && effect && save && assignment)
  const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const tick = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); await new Promise(setImmediate) }
  function harness() {
    const normal = makeNormalFixture(), alerts = [], navigations = [], cache = new Map()
    let cookieAccount = 'A'
    const storage = { getItem: key => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value), removeItem: key => cache.delete(key), key: index => [...cache.keys()][index] ?? null, get length() { return cache.size } }
    const state = { ratings: {}, notes: {}, na: {}, issues: [], loading: true, saving: false, todayLocalDate: null }
    const box = { Date: normal.box.Date, URLSearchParams, accountRef: { current: '' }, todayLoadedRef: { current: null }, saveRequestRef: { current: null }, pendingIdRef: { current: null },
      window: { sessionStorage: storage, location: { search: '', assign: target => navigations.push(target) } }, sessionStorage: storage, document: { referrer: '' }, alert: text => alerts.push(text),
      fetch: (url, options = {}) => normal.box.fetch(new URL(url, 'https://offline.invalid').href, { ...options, headers: { ...options.headers, authorization: `Bearer synthetic-${cookieAccount}` } }),
    }
    for (const key of Object.keys(state)) box[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value }
    vm.createContext(box)
    vm.runInContext(compile(`${helper}\nglobalThis.make = (account, sessionStatus, ratings, notes, na, issues, saving, todayLocalDate) => { ${assignment}; return {mount:${effect}, save:${save}} }; globalThis.date=deviceCheckinDate`), box)
    const render = (account = 'A', status = 'authenticated') => { cookieAccount = account; return box.make(account, status, state.ratings, state.notes, state.na, state.issues, state.saving, state.todayLocalDate) }
    return { normal, box, state, alerts, navigations, cache, render }
  }
  let count = 0
  async function check(name, run) { await run(); count++; console.log(`PASS ${zone}: ${name}`) }
  async function main() {
    await check('web reads actual local-day Average/note/N/A and posts the same captured day preserving every other account/day', async () => {
      const h = harness(); h.normal.store().ratings.find(row => row.userId === 'A' && row.date === expectedDate && row.issueId === 'A-energy').value = 3
      h.render().mount(); await tick(); assert.equal(h.state.ratings['A-energy'], 3); assert.equal(h.state.notes['A-energy'], 'Exact A note'); assert.equal(h.state.na['A-sleep'], true)
      assert.equal(new URL(h.normal.requests[0].url).searchParams.get('localDate'), expectedDate)
      const before = structuredClone(h.normal.store().ratings.filter(row => row.userId !== 'A' || row.date !== expectedDate))
      h.state.notes['A-energy'] = 'Voice repair test check-in.'; await h.render().save()
      const post = h.normal.requests.find(row => row.method === 'POST'), body = JSON.parse(post.options.body)
      assert.equal(body.localDate, expectedDate); assert.equal(body.ratings.length, 2); assert.equal(body.ratings[0].note, 'Voice repair test check-in.'); assert.equal(body.ratings[1].isNa, true)
      assert.deepEqual(h.normal.store().ratings.filter(row => row.userId !== 'A' || row.date !== expectedDate), before); assert.equal(h.normal.reminders.length, 1); assert.deepEqual(h.navigations, ['/dashboard'])
      const stored = JSON.parse(h.cache.get(`checkins:today:cache:A:${expectedDate}`)); assert.equal(stored.localDate, expectedDate); assert.equal(stored.notes['A-energy'], 'Voice repair test check-in.')
    })
    await check('unloaded, failed-load, invalid-date and unauthenticated drafts never POST', async () => {
      const h = harness(); await h.render().save(); assert.equal(h.normal.requests.length, 0)
      h.normal.fail(true); h.render().mount(); await tick(); await h.render().save(); assert.equal(h.normal.writes.length, 0)
      h.normal.fail(false); h.normal.clock(NaN); h.render().mount(); await tick(); await h.render().save(); assert.equal(h.normal.requests.length, 1)
      h.render('', 'unauthenticated').mount(); await h.render('', 'unauthenticated').save(); assert.equal(h.normal.writes.length, 0)
    })
    await check('old unscoped, other-account and other-day caches cannot supply or authorize current ratings', async () => {
      const h = harness(), wrong = JSON.stringify({ account:'B',localDate:'2026-10-15',issues:[{id:'foreign',name:'PRIVATE'}],ratings:{foreign:6},notes:{foreign:'PRIVATE'},na:{},fetchedAt:Date.now() })
      h.cache.set('checkins:today:cache', wrong); h.cache.set(`checkins:today:cache:A:${expectedDate}`, wrong); h.normal.fail(true); h.render().mount(); await tick()
      assert.equal(h.state.issues.length, 0); await h.render().save(); assert.equal(h.normal.writes.length, 0)
    })
    await check('midnight old draft and old callback after new-day reload cannot silently move ratings', async () => {
      const h = harness(); h.normal.clock(new Date(`${expectedDate}T23:59:00`).toISOString()); const cleanup = h.render().mount(); await tick(); const oldDraft = h.render()
      h.normal.clock(new Date(`${expectedDate}T23:59:00`).getTime() + 120000); await oldDraft.save(); assert.equal(h.normal.writes.length, 0); assert(h.alerts.at(-1).includes('reload Today'))
      cleanup(); h.render().mount(); await tick(); await oldDraft.save(); assert.equal(h.normal.writes.length, 0)
      assert.equal(new URL(h.normal.requests.at(-1).url).searchParams.get('localDate'), h.box.date())
    })
    await check('read crossing midnight and late old-account response never populate the current view', async () => {
      const h = harness(); h.normal.clock(new Date(`${expectedDate}T23:59:00`).toISOString()); h.normal.hold('GET'); h.render().mount(); await tick()
      h.normal.clock(new Date(`${expectedDate}T23:59:00`).getTime() + 120000); h.normal.pending.shift()(); await tick(); assert.equal(h.box.todayLoadedRef.current, null)
      const other = harness(); other.normal.hold('GET'); const cleanup = other.render('A').mount(); await tick(); const next = other.render('B'); cleanup(); other.normal.hold(null); next.mount(); await tick(); other.normal.pending.shift()(); await tick()
      assert(other.state.issues.every(row => row.userId === 'B')); assert.equal(other.state.ratings['A-energy'], undefined); assert.equal(other.box.todayLoadedRef.current.account, 'B')
    })
    await check('late save after account switch cannot navigate/cache/claim success; duplicate tap sends once', async () => {
      const h = harness(); const cleanup = h.render().mount(); await tick(); h.normal.hold('POST'); const api = h.render(), pending = api.save(); await tick(); await api.save(); assert.equal(h.normal.requests.filter(row => row.method === 'POST').length, 1)
      const next = h.render('B'); cleanup(); h.normal.hold(null); next.mount(); await tick(); const alerts = h.alerts.length, cache = [...h.cache.entries()]; h.normal.pending.shift()(); await pending
      assert.equal(h.alerts.length, alerts); assert.deepEqual(h.navigations, []); assert.deepEqual([...h.cache.entries()], cache); assert.equal(h.state.saving, false)
    })
    await check('new=1 keeps the existing explicit blank-entry flow while binding its save to the loaded local day', async () => {
      const h = harness(); h.box.window.location.search = '?new=1'; h.render().mount(); await tick(); assert.equal(Object.keys(h.state.ratings).length, 0); assert.equal(Object.keys(h.state.notes).length, 0); assert.equal(Object.keys(h.state.na).length, 0)
      h.state.ratings['A-energy'] = 2; await h.render().save(); assert.equal(h.normal.writes.length, 2); assert(h.normal.writes.every(row => row.date === expectedDate))
    })
    console.log(`PASS ${zone}: ${count} actual web/normal-handler groups`)
  }
  main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
}
