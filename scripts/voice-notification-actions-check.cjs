#!/usr/bin/env node
'use strict'
// Actual action adapter and inbox route, synthetic owned rows and normal auth.
// No database, network, app imports, secrets, provider or device activity.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
class NextRequest extends Request { get nextUrl() { return new URL(this.url) } }
const NextResponse = { json: (value, options = {}) => new Response(JSON.stringify(value), { ...options, headers: { 'content-type': 'application/json' } }) }
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
let rows, writes, calls, mode, abortAfterPost
const owner = 'synthetic-owner'
const row = (id, patch = {}) => ({ id, userId: owner, title: `Notice ${id}`, body: 'Synthetic notification body', url: '/mood', status: 'unread', createdAt: '2026-10-17T09:00:00Z', visible: true, ...patch })
function reset(initial = [row('a'), row('b'), row('other', { userId: 'other-owner' }), row('hidden', { visible: false })]) { rows = structuredClone(initial); writes = []; calls = []; mode = ''; abortAfterPost = null }
const routeCode = fs.readFileSync(path.join(root, 'app/api/notifications/inbox/route.ts'), 'utf8').split('\n').filter(line => !line.startsWith('import ')).join('\n').replace(/^export /gm, '')
const route = vm.createContext({ NextRequest, NextResponse, URL, process: { env: {} }, authOptions: {},
  getServerSession: async () => null, getToken: async () => null,
  getUserIdFromNativeAuth: async request => request.headers.get('authorization') === 'Bearer synthetic-owner' ? owner : request.headers.get('authorization') === 'Bearer synthetic-other' ? 'other-owner' : null,
  listInboxNotifications: async (userId, { limit, offset, status }) => {
    calls.push({ userId, limit, offset, status })
    if (mode === 'malformed') return null
    if (mode === 'foreign') return [row('foreign', { userId: 'other-owner' })]
    if (mode === 'duplicate') return [row('a'), row('a')]
    return structuredClone(rows.filter(item => item.userId === userId && item.visible && (status === 'all' || item.status === status)).slice(offset, offset + limit))
  },
  markNotificationRead: async (userId, id) => {
    writes.push({ action: 'mark_read', userId, id })
    if (mode === 'failed' || mode === 'partial' && writes.length === 2) return false
    if (mode !== 'ignored') { const item = rows.find(row => row.userId === userId && row.id === id); if (item) item.status = 'read' }
    abortAfterPost?.()
    return true
  },
  deleteNotifications: async (userId, ids) => {
    writes.push({ action: 'delete_selected', userId, ids })
    if (mode === 'failed') throw new Error('synthetic handler failure')
    if (mode === 'ignored') return ids.length
    const before = rows.length
    rows = rows.filter(item => item.userId !== userId || !ids.includes(item.id))
    abortAfterPost?.()
    return before - rows.length
  },
  markAllNotificationsRead: async () => { throw Error('Unreviewed all-account mutation forbidden') },
  deleteAllNotifications: async () => { throw Error('Unreviewed all-account deletion forbidden') },
})
vm.runInContext(transpile(`${routeCode}\nglobalThis.api = { GET, POST }`), route)
const moduleState = { exports: {} }
const moduleBox = vm.createContext({ exports: moduleState.exports, module: moduleState, URL, Headers, Date, Set, Map, Error, Object, String,
  require: name => {
    if (name === 'next/server') return { NextRequest }
    if (name === 'crypto') return crypto
    if (name === '@/app/api/notifications/inbox/route') return route.api
    throw new Error(`Unexpected app import: ${name}`)
  },
})
vm.runInContext(transpile(fs.readFileSync(path.join(root, 'lib/native-voice-notification-actions.ts'), 'utf8')), moduleBox)
const { prepareVoiceNotificationAction: prepare, executeVoiceNotificationAction: execute, VOICE_NOTIFICATION_ACTION_SCHEMAS: schemas } = moduleState.exports
const request = token => new NextRequest('https://helfi.invalid/api/native/voice-assistant', { headers: { authorization: `Bearer ${token || 'synthetic-owner'}`, 'x-helfi-voice-action-id': 'synthetic-action', 'x-native-token': 'synthetic-normal-token' } })
let count = 0
async function check(name, run) { reset(); await run(); count++; console.log(`PASS ${name}`) }
async function main() {
  await check('fixed schema exposes only reviewed inbox actions', async () => {
    assert.deepEqual(Object.keys(schemas).sort(), ['notifications.delete', 'notifications.delete_all_visible', 'notifications.mark_all_visible_read', 'notifications.mark_read'])
    for (const input of [{ action: 'arbitrary', values: {} }, { action: 'notifications.delete', values: { ids: ['a'], endpoint: '/bad' } }, { action: 'notifications.delete', values: { ids: ['a'], titles: ['Notice a'] } }, { action: 'notifications.delete_all_visible', values: { ids: ['a'] } }, { action: 'notifications.mark_read', values: { ids: [] } }]) await assert.rejects(prepare(request(), owner, input))
    assert.equal(calls.length, 0); assert.equal(writes.length, 0)
  })
  for (const action of Object.keys(schemas)) await check(`${action} prepares without writes and verifies exact normal-handler results`, async () => {
    const bulk = action.includes('_visible')
    const prepared = await prepare(request(), owner, { action, values: bulk ? {} : { titles: ['Notice a'] } })
    assert.equal(writes.length, 0)
    assert.equal(prepared.ids.length, bulk ? 2 : 1)
    assert.ok(prepared.summary.includes('reviewed notifications'))
    const result = await execute(request(), owner, prepared)
    assert.equal(result.saved, true); assert.equal(result.status, 'saved')
    assert.equal(result.operation, action.includes('delete') ? 'delete' : 'update')
    assert.ok(writes.every(write => write.userId === owner))
    assert.ok(rows.some(item => item.id === 'other') && rows.some(item => item.id === 'hidden'))
    assert.ok(!writes.some(write => write.action === 'delete_all' || write.action === 'mark_all_read'))
  })
  await check('normal handler retains exact original authentication and correlation headers', async () => {
    const seen = []
    const originalGet = route.api.GET, originalPost = route.api.POST
    route.api.GET = request => { seen.push(request); return originalGet(request) }
    route.api.POST = request => { seen.push(request); return originalPost(request) }
    try {
      const prepared = await prepare(request(), owner, { action: 'notifications.mark_read', values: { ids: ['a'] } })
      assert.equal((await execute(request(), owner, prepared)).saved, true)
      for (const req of seen) {
        assert.equal(req.headers.get('authorization'), 'Bearer synthetic-owner')
        assert.equal(req.headers.get('x-native-token'), 'synthetic-normal-token')
        assert.equal(req.headers.get('x-helfi-voice-action-id'), 'synthetic-action')
        assert.equal(new URL(req.url).pathname, '/api/notifications/inbox')
      }
    } finally { route.api.GET = originalGet; route.api.POST = originalPost }
  })
  await check('missing, hidden, foreign and ambiguous selectors never mutate', async () => {
    rows.push(row('duplicate-title', { title: 'Notice a' }))
    for (const values of [{ ids: ['other'] }, { ids: ['hidden'] }, { ids: ['made-up'] }, { titles: ['Notice a'] }, { titles: ['Notice'] }]) await assert.rejects(prepare(request(), owner, { action: 'notifications.delete', values }))
    assert.equal(writes.length, 0)
  })
  await check('unauthorized normal route and foreign or malformed list responses remain failures', async () => {
    await assert.rejects(prepare(request('invalid'), owner, { action: 'notifications.delete', values: { ids: ['a'] } }))
    for (mode of ['foreign', 'malformed', 'duplicate']) await assert.rejects(prepare(request(), owner, { action: 'notifications.delete', values: { ids: ['a'] } }))
    assert.equal(writes.length, 0)
  })
  await check('account, review age, future time and unsupported prepared action do not write', async () => {
    const prepared = await prepare(request(), owner, { action: 'notifications.delete', values: { ids: ['a'] } })
    for (const altered of [{ ...prepared, userId: 'other-owner' }, { ...prepared, preparedAt: 0 }, { ...prepared, preparedAt: Date.now() + 60000 }, { ...prepared, action: 'arbitrary' }, { ...prepared, ids: ['a', 'a'] }]) assert.equal((await execute(request(), owner, altered)).saved, false)
    assert.equal(writes.length, 0)
  })
  await check('changed reviewed content and new arrivals require new bulk review', async () => {
    const selected = await prepare(request(), owner, { action: 'notifications.delete', values: { ids: ['a'] } })
    rows[0].body = 'changed since review'
    assert.equal((await execute(request(), owner, selected)).status, 'review_again')
    const bulk = await prepare(request(), owner, { action: 'notifications.delete_all_visible', values: {} })
    rows.unshift(row('new-arrival'))
    assert.equal((await execute(request(), owner, bulk)).status, 'review_again')
    assert.equal(writes.length, 0)
  })
  await check('selected deletion preserves a notification arriving after review', async () => {
    const prepared = await prepare(request(), owner, { action: 'notifications.delete', values: { ids: ['a'] } })
    rows.unshift(row('new-arrival'))
    assert.equal((await execute(request(), owner, prepared)).saved, true)
    assert.ok(rows.some(item => item.id === 'new-arrival'))
  })
  await check('bulk write never includes a notification arriving after its final read', async () => {
    const prepared = await prepare(request(), owner, { action: 'notifications.delete_all_visible', values: {} })
    const original = route.api.POST
    route.api.POST = request => { rows.unshift(row('new-arrival')); return original(request) }
    try { assert.equal((await execute(request(), owner, prepared)).saved, true) } finally { route.api.POST = original }
    assert.ok(rows.some(item => item.id === 'new-arrival'))
    assert.deepEqual(Array.from(writes[0].ids).sort(), ['a', 'b'])
  })
  await check('false success, ignored write and wrong delete counts never claim complete success', async () => {
    for (const action of ['notifications.mark_read', 'notifications.delete']) for (const failure of ['failed', 'ignored']) {
      reset()
      const prepared = await prepare(request(), owner, { action, values: { ids: ['a'] } })
      mode = failure
      const result = await execute(request(), owner, prepared)
      assert.equal(result.saved, false); assert.equal(result.status, 'not_saved')
      assert.match(result.message, /may have changed/)
    }
  })
  await check('partial mark-read batch states uncertainty without claiming nothing changed', async () => {
    const prepared = await prepare(request(), owner, { action: 'notifications.mark_all_visible_read', values: {} })
    mode = 'partial'
    const result = await execute(request(), owner, prepared)
    assert.equal(result.saved, false); assert.match(result.message, /Some notifications may have changed/)
    assert.equal(rows.find(item => item.id === 'a').status, 'read')
    assert.equal(rows.find(item => item.id === 'b').status, 'unread')
  })
  await check('already-read selection verifies status without another write', async () => {
    rows[0].status = 'read'
    const prepared = await prepare(request(), owner, { action: 'notifications.mark_read', values: { ids: ['a'] } })
    const result = await execute(request(), owner, prepared)
    assert.equal(result.saved, true); assert.equal(result.status, 'already_set'); assert.equal(writes.length, 0)
  })
  await check('paging resolves later owned IDs and refuses an incomplete oversized inbox', async () => {
    reset(Array.from({ length: 201 }, (_, i) => row(`page-${i}`)))
    const prepared = await prepare(request(), owner, { action: 'notifications.mark_read', values: { ids: ['page-200'] } })
    assert.deepEqual(calls.map(call => call.offset), [0, 100, 200])
    assert.equal((await execute(request(), owner, prepared)).saved, true)
    reset(Array.from({ length: 1001 }, (_, i) => row(`large-${i}`)))
    await assert.rejects(prepare(request(), owner, { action: 'notifications.delete_all_visible', values: {} }), /large inbox/)
    assert.equal(writes.length, 0)
  })
  await check('cancelled requests cannot start writes and cancellation after one batch item stops later writes', async () => {
    const controller = new AbortController()
    const req = new NextRequest(request(), { signal: controller.signal })
    const prepared = await prepare(req, owner, { action: 'notifications.mark_all_visible_read', values: {} })
    controller.abort()
    assert.equal((await execute(req, owner, prepared)).saved, false)
    assert.equal(writes.length, 0)
    const second = new AbortController(), req2 = new NextRequest(request(), { signal: second.signal })
    abortAfterPost = () => second.abort()
    const result = await execute(req2, owner, prepared)
    assert.equal(result.saved, false); assert.match(result.message, /may have changed/)
    assert.equal(writes.length, 1)
  })
  console.log(`Voice notification actions: ${count} actual-source offline groups passed. No real notifications were read, changed or deleted.`)
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
