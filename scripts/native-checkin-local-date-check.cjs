#!/usr/bin/env node
'use strict'
// Actual native load/save + actual normal GET/POST with synthetic auth/SQL.
// No network, app/server startup, real storage, credentials or environment files.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const { execFileSync } = require('node:child_process')
if (process.argv[2] !== '--zone') {
  for (const zone of ['Australia/Melbourne', 'Pacific/Kiritimati', 'UTC']) process.stdout.write(execFileSync(process.execPath, [__filename, '--zone', zone], { env: { TZ: zone }, encoding: 'utf8' }))
  console.log('PASS native check-in local-date parity. Synthetic native-to-normal-handler execution only.')
} else {
  const root = path.resolve(__dirname, '..'), zone = process.argv[3]
  const initialInstant = '2026-10-16T15:15:00.000Z', expectedDate = zone === 'UTC' ? '2026-10-16' : '2026-10-17'
  const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
  const nativeSource = read('native/src/screens/DailyCheckInScreen.tsx'), ast = ts.createSourceFile('DailyCheckInScreen.tsx', nativeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let helper, load, save, accountEffect, accountAssignment
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'deviceCheckinDate') helper = node.getText(ast)
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadToday') load = node.initializer.arguments[0].getText(ast)
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'save') save = node.initializer.getText(ast)
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('setIssues([])')) accountEffect = node.arguments[0].getText(ast)
    if (ts.isExpressionStatement(node) && node.getText(ast).startsWith('todayAccountRef.current = authHeaders')) accountAssignment = node.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast); assert(helper && load && save && accountEffect && accountAssignment)
  const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  function harness() {
    let instant = Date.parse(initialInstant), failLoad = false, hold = null
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [instant])) } static now() { return instant } }
    const alerts = [], requests = [], pending = [], writes = [], reminders = []
    let store = { issues: ['A', 'B'].flatMap(userId => [{ id: `${userId}-energy`, userId, name: 'Energy', polarity: 'positive' }, { id: `${userId}-sleep`, userId, name: 'Sleep', polarity: 'positive' }]), ratings: ['A', 'B'].flatMap(userId => [
      { issueId: `${userId}-energy`, userId, date: expectedDate, value: 0, note: `Exact ${userId} note`, isNa: false },
      { issueId: `${userId}-sleep`, userId, date: expectedDate, value: null, note: 'Exact N/A note', isNa: true },
      { issueId: `${userId}-energy`, userId, date: '2026-10-15', value: 6, note: 'Other day unchanged', isNa: false },
    ]) }
    const sqlClient = getStore => ({ $executeRaw: async query => {
      if (query.text.includes('DELETE FROM CheckinRatings')) { const [user, date, ids] = query.values; getStore().ratings = getStore().ratings.filter(row => !(row.userId === user && row.date === date && ids.includes(row.issueId))); return 1 }
      if (query.text.includes('INSERT INTO CheckinRatings')) { for (const value of query.values[0]) { const [id, userId, issueId, date, score, note, isNa] = value.values; getStore().ratings.push({ id, userId, issueId, date, value: score, note, isNa, timestamp: new Clock().toISOString() }); writes.push({ userId, issueId, date }) }; return 1 }
      throw Error('Unexpected synthetic SQL write')
    } })
    const prisma = { ...sqlClient(() => store), $executeRawUnsafe: async () => 0,
      $queryRawUnsafe: async (query, userId, ...args) => {
        if (query.includes('FROM CheckinIssues')) return store.issues.filter(row => row.userId === userId && (!args.length || args.includes(row.id)))
        if (query.includes('FROM CheckinRatings')) return store.ratings.filter(row => row.userId === userId && row.date === args[0]).slice().reverse()
        throw Error('Unexpected synthetic SQL read')
      }, $transaction: async fn => { const next = structuredClone(store); const result = await fn(sqlClient(() => next)); store = next; return result },
    }
    const serverAst = ts.createSourceFile('today.ts', read('app/api/checkins/today/route.ts'), ts.ScriptTarget.Latest, true)
    const serverCode = serverAst.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(serverAst)).join('\n').replace(/^export\s+/gm, '')
    const response = (body, status = 200) => new Response(JSON.stringify(body), { status })
    const server = vm.createContext({ URL, Date: Clock, prisma, crypto: require('node:crypto'), Prisma: { sql: (parts, ...values) => ({ text: parts.join('?'), values }), join: values => values },
      getCheckinUser: async req => { const id = req.headers.get('authorization')?.match(/^Bearer synthetic-([AB])$/)?.[1]; return id ? { id } : null },
      NextResponse: { json: (body, options) => response(body, options?.status || 200) }, deleteNotificationsByType: async (...args) => reminders.push(args), console: { error() {} },
    })
    vm.runInContext(compile(`${serverCode}\ncheckinTablesEnsured = true; globalThis.api = {GET, POST}`), server)
    const state = { issues: [], ratings: {}, notes: {}, na: {}, detailsOpen: {}, loading: true, saving: false, todayLocalDate: null }
    const box = { Date: Clock, API_BASE_URL: 'https://offline.invalid', todayAccountRef: { current: null }, todayLoadRunRef: { current: 0 }, todayLoadedRef: { current: null }, todaySaveRef: { current: null }, Alert: { alert: (...args) => alerts.push(args) },
      fetch: async (url, options) => {
        const method = options?.method || 'GET'; requests.push({ url, method, options })
        const req = new Request(url, { ...options, ...(method === 'GET' ? {} : { method }) })
        const result = failLoad && method === 'GET' ? response({ error: 'Exact synthetic load failure' }, 500) : await server.api[method](req)
        if (hold === method) return new Promise(resolve => pending.push(() => resolve(result)))
        return result
      },
    }
    for (const key of Object.keys(state)) box[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { state[key] = value }
    vm.createContext(box)
    vm.runInContext(compile(`${helper}\nglobalThis.make = (authHeaders, issues, ratings, notes, na, todayLocalDate) => { ${accountAssignment}; const loadToday = ${load}; return { load: loadToday, save: ${save}, resetAccount: ${accountEffect} } }; globalThis.date = deviceCheckinDate`), box)
    const render = (account = 'A', reset = false) => { const api = box.make(account ? { Authorization: `Bearer synthetic-${account}`, 'x-native-token': `synthetic-${account}`, 'cache-control': 'no-store' } : null, state.issues, state.ratings, state.notes, state.na, state.todayLocalDate); if (reset) api.resetAccount(); return api }
    return { box, state, alerts, requests, writes, reminders, pending, render, store: () => store, clock: value => { instant = typeof value === 'number' ? value : Date.parse(value) }, fail: value => { failLoad = value }, hold: value => { hold = value } }
  }
  let count = 0
  async function check(name, run) { await run(); count++; console.log(`PASS ${zone}: ${name}`) }
  const tick = async () => { for (let index = 0; index < 30; index++) await Promise.resolve() }
  async function main() {
    await check('native GET and POST use same explicit valid local day with full ratings/notes/N/A and normal reminder cleanup', async () => {
      const h = harness(), api = h.render('A', true); await api.load()
      assert.equal(new URL(h.requests[0].url).searchParams.get('localDate'), expectedDate); assert.equal(h.state.ratings['A-energy'], 0); assert.equal(h.state.na['A-sleep'], true)
      const before = structuredClone(h.store().ratings.filter(row => row.userId !== 'A' || row.date !== expectedDate))
      h.state.ratings['A-energy'] = 4; h.state.notes['A-energy'] = 'Full updated local note'; await h.render().save()
      const sent = JSON.parse(h.requests.find(item => item.method === 'POST').options.body)
      assert.equal(sent.localDate, expectedDate); assert.equal(sent.ratings.length, 2); assert.equal(sent.ratings[0].note, 'Full updated local note'); assert.equal(sent.ratings[1].isNa, true)
      assert(h.writes.every(row => row.userId === 'A' && row.date === expectedDate)); assert.equal(h.reminders.length, 1)
      assert.deepEqual(h.store().ratings.filter(row => row.userId !== 'A' || row.date !== expectedDate), before)
      await h.render().load(); assert.equal(h.state.ratings['A-energy'], 4); assert.equal(h.state.notes['A-energy'], 'Full updated local note')
      assert.equal(h.requests[0].options.headers.Authorization, 'Bearer synthetic-A')
    })
    await check('unloaded/failed/invalid-date drafts cannot POST', async () => {
      const h = harness(); await h.render('A', true).save(); assert.equal(h.requests.length, 0)
      h.fail(true); await h.render().load(); await h.render().save(); assert.equal(h.requests.filter(row => row.method === 'POST').length, 0)
      h.fail(false); h.clock(NaN); await h.render().load(); await h.render().save(); assert.equal(h.requests.length, 1); assert.equal(h.box.date(), null)
      assert(h.alerts.some(row => row[0] === 'Could not load check-in'))
    })
    await check('cross-midnight old draft refuses save and explicit Reload Today loads new date first', async () => {
      const h = harness(); h.clock(new Date(`${expectedDate}T23:59:00`).toISOString()); await h.render('A', true).load(); const oldDraft = h.render()
      h.clock(new Date(`${expectedDate}T23:59:00`).getTime() + 2 * 60000); await h.render().save()
      assert.equal(h.requests.filter(row => row.method === 'POST').length, 0); assert.equal(h.writes.length, 0)
      const prompt = h.alerts.at(-1); assert.equal(prompt[0], 'Reload today’s check-in'); prompt[2].find(item => item.text === 'Reload Today').onPress(); await tick()
      assert.equal(new URL(h.requests.at(-1).url).searchParams.get('localDate'), h.box.date())
      await oldDraft.save(); assert.equal(h.writes.length, 0, 'Old rendered ratings cannot be moved to the newly loaded day by a stale save callback')
    })
    await check('read crossing midnight is never accepted as today', async () => {
      const h = harness(); h.clock(new Date(`${expectedDate}T23:59:00`).toISOString()); h.hold('GET'); const pending = h.render('A', true).load(); await tick()
      h.clock(new Date(`${expectedDate}T23:59:00`).getTime() + 2 * 60000); h.pending.shift()(); await pending
      assert.equal(h.box.todayLoadedRef.current, null); await h.render().save(); assert.equal(h.writes.length, 0)
    })
    await check('account switch and stale/failed load cannot leak another account or authorize old save', async () => {
      const h = harness(); h.hold('GET'); const oldApi = h.render('A', true); const old = oldApi.load(); await tick()
      const next = h.render('B', true); h.hold(null); await next.load(); h.pending.shift()(); await old
      assert(h.state.issues.every(row => row.userId === 'B')); assert.equal(h.state.ratings['A-energy'], undefined); assert.equal(h.box.todayLoadedRef.current.account, 'Bearer synthetic-B')
      const count = h.requests.length; await oldApi.load(); assert.equal(h.requests.length, count); assert.equal(h.box.todayLoadedRef.current.account, 'Bearer synthetic-B', 'Old account reload callback cannot invalidate the current account review')
      await h.render('A').save(); assert.equal(h.writes.length, 0)
      const unauth = h.render(null, true); await unauth.load(); await unauth.save(); assert.equal(h.state.loading, false); assert.equal(h.state.issues.length, 0)
    })
    await check('late save response is ignored after account switch and duplicate same-account tap sends once', async () => {
      const h = harness(); await h.render('A', true).load(); const api = h.render(); h.hold('POST'); const old = api.save(); await tick(); await api.save(); assert.equal(h.requests.filter(row => row.method === 'POST').length, 1)
      h.render('B', true); const before = h.alerts.length; h.pending.shift()(); await old; assert.equal(h.alerts.length, before); assert.equal(h.state.saving, false)
    })
    await check('save sent before midnight retains its captured date and names that date if response arrives tomorrow', async () => {
      const h = harness(); h.clock(new Date(`${expectedDate}T23:59:00`).toISOString()); await h.render('A', true).load(); h.hold('POST'); const old = h.render().save(); await tick()
      h.clock(new Date(`${expectedDate}T23:59:00`).getTime() + 2 * 60000); h.pending.shift()(); await old
      assert(h.writes.every(row => row.date === expectedDate)); assert.equal(h.alerts.at(-1)[0], 'Saved'); assert.equal(h.alerts.at(-1)[1], `Your check-in for ${expectedDate} is saved.`)
      await h.render().save(); assert.equal(h.requests.filter(row => row.method === 'POST').length, 1)
    })
    console.log(`PASS ${zone}: ${count} actual-source native/normal-handler groups`)
  }
  main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
}
