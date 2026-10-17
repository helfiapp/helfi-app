#!/usr/bin/env node
'use strict'
// Runs the actual new bridge, existing food helper, normal Food Diary GET,
// and normal Health Journal POST/GET. All storage/auth/transport is synthetic.
const fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript'), assert = require('assert/strict'), crypto = require('crypto')
const root = path.resolve(__dirname, '..'), cache = new Map(), copy = value => structuredClone(value)
const response = (body, options = {}) => new Response(JSON.stringify(body), { status: options.status || 200, headers: { 'content-type': 'application/json' } })
class Req extends Request {}
let actor = 'owner', entries = [], foods = [], serial = 0, calls = [], foodCalls = [], createHook, readHook
const matches = (row, where) => Object.entries(where || {}).every(([key, value]) => {
  if (key === 'OR') return value.some(condition => matches(row, condition))
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([operator, expected]) => operator === 'gte' ? new Date(row[key]).getTime() >= new Date(expected).getTime() : operator === 'lte' ? new Date(row[key]).getTime() <= new Date(expected).getTime() : operator === 'in' ? expected.includes(row[key]) : false)
  return row[key] === value
})
const prisma = { user: { findUnique: async ({ where }) => ['owner', 'other'].map(id => ({ id, email: id + '@example.test' })).find(row => row.email === where.email) || null },
foodLog: {
  findUnique: async ({ where }) => copy(foods.find(row => row.id === where.id) || null),
  findMany: async ({ where }) => copy(foods.filter(row => matches(row, where))),
  updateMany: forbidden,
}, healthJournalEntry: {
  create: async ({ data }) => { if (data.id && entries.some(row => row.id === data.id)) throw Object.assign(Error('Synthetic duplicate'), { code: 'P2002' }); const entry = { id: `entry-${++serial}`, ...copy(data), createdAt: '2026-10-17T01:00:00.000Z' }; entries.push(entry); return copy(entry) },
  findUnique: async ({ where }) => copy(entries.find(row => row.id === where.id) || null),
  findMany: async ({ where }) => copy(entries.filter(row => row.userId === where.userId && row.localDate === where.localDate)),
} }
const allowed = new Set(['lib/native-assistant-domain-adapters.ts', 'lib/native-assistant-action-id.ts', 'lib/native-voice-food-management.ts', 'app/api/health-journal/route.ts', 'app/api/food-log/route.ts'])
function forbidden() { throw Error('Unexpected service dependency during provider-free proof') }
function load(relative) {
  if (cache.has(relative)) return cache.get(relative)
  assert(allowed.has(relative), 'Unexpected real source load: ' + relative)
  const module = { exports: {} }; cache.set(relative, module.exports)
  const source = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(source, { module, exports: module.exports, require: name => {
    if (name === 'crypto') return crypto
    if (name === './native-assistant-action-id' || name === '@/lib/native-assistant-action-id') return load('lib/native-assistant-action-id.ts')
    if (name === 'next/server') return { NextRequest: Req, NextResponse: { json: response } }
    if (name === '@prisma/client') return { Prisma: { JsonNull: null } }
    if (name === 'next-auth') return { getServerSession: async () => actor ? { user: { id: actor, email: actor + '@example.test' } } : null }
    if (name === 'next-auth/jwt') return { getToken: async () => null }
    if (name === '@/lib/native-auth') return { getUserIdFromNativeAuth: async () => actor }
    if (name === '@/lib/auth') return { authOptions: {} }
    if (name === '@/lib/prisma') return { prisma }
    if (name === '@/lib/health-journal-db') return { ensureHealthJournalSchema: async () => undefined }
    if (['@/lib/native-voice-review-token', '@/lib/native-voice-record-actions', '@/lib/native-voice-resolved-food', '@/lib/native-voice-spoken-quantities', '@/lib/native-voice-recipe-metadata', '@/lib/blob-paths', '@/lib/native-voice-food-copy', '@/lib/food/barcode-corrections', '@/lib/food/openfoodfacts', '@/lib/insights/regeneration-service', '@/lib/object-storage', '@/lib/food-photo-storage', '@/lib/blob-access', '@/lib/write-guard', '@/lib/notification-inbox', '@/lib/food-log-categories'].includes(name)) return new Proxy({}, { get: () => forbidden })
    throw Error('Forbidden bootstrap/provider dependency: ' + name)
  }, Request, Response, Headers, URL, Date, JSON, Map, Set, AbortController, Buffer, process: { env: {} }, console: { log: () => {}, error: () => {}, warn: () => {} } }, { filename: relative })
  cache.set(relative, module.exports); return module.exports
}
const api = load('lib/native-assistant-domain-adapters.ts'), foodApi = load('lib/native-voice-food-management.ts'), journalRoute = load('app/api/health-journal/route.ts'), foodRoute = load('app/api/food-log/route.ts')
const context = (extra = {}) => ({ actorId: 'owner', localDate: '2026-10-17', ...extra })
const request = () => new Req('https://helfi.example.test/api/native/voice-assistant', { headers: { authorization: 'Bearer synthetic', 'x-helfi-voice-capabilities': 'food-management-v1' } })
const foodIo = { userId: async () => actor, call: async (_request, call) => {
  foodCalls.push(copy(call)); assert.equal(call.domain, 'diary')
  const url = new URL('https://helfi.example.test/api/food-log'); url.searchParams.set('date', call.localDate)
  if (call.id) url.searchParams.set('id', call.id)
  const result = await foodRoute.GET(new Req(url, { headers: { authorization: 'Bearer synthetic' } }))
  const data = await result.json()
  if (!result.ok) throw Error('Synthetic normal Food Diary GET rejected: ' + result.status)
  return data
} }
const services = {
  authenticatedActor: async () => actor,
  foodRead: async (ctx, action, values) => foodApi.prepareVoiceFoodManagement(request(), ctx.actorId, { action, values }, '', ctx.localDate, foodIo),
  healthJournal: {
    create: async (ctx, values, actionId) => {
      calls.push({ operation: 'create', values: copy(values) })
      const result = await journalRoute.POST(new Req('https://helfi.example.test/api/health-journal', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer synthetic' }, body: JSON.stringify({ ...values, ...(services.healthJournal.actionIdsSupported ? { clientActionId: actionId } : {}) }) }))
      assert.equal(result.status, 200); const data = await result.json(); return createHook ? createHook(data, ctx) : data
    },
    read: async (ctx, values) => {
      calls.push({ operation: 'read', values: copy(values) })
      const result = await journalRoute.GET(new Req('https://helfi.example.test/api/health-journal?date=' + values.localDate, { headers: { authorization: 'Bearer synthetic' } }))
      assert.equal(result.status, 200); const data = await result.json(); return readHook ? readHook(data, ctx) : data
    },
  },
}
const adapters = api.createNativeAssistantDomainAdapters(services), create = adapters['journal.health.create'], journalRead = adapters['journal.health.read']
const claim = { receiptClaimed: true, actionId: 'server-durable-action-1' }
const prepare = (values, ctx = context()) => create.prepare(ctx, values)
const execute = (prepared, ctx = context(), receipt = claim) => create.execute(ctx, prepared.data, receipt)
const nutrition = (calories, fiber = null) => ({ calories_kcal: calories, protein_g: 10, carbs_g: 20, fat_g: 3, fiber_g: fiber, sugar_g: 0 })
function reset() {
  services.healthJournal.actionIdsSupported = false
  actor = 'owner'; entries = []; serial = 0; calls = []; foodCalls = []; createHook = undefined; readHook = undefined
  foods = [{ id: 'food-1', userId: 'owner', localDate: '2026-10-17', name: 'Stored breakfast', meal: 'breakfast', nutrients: nutrition(100), items: [], createdAt: new Date('2026-10-17T00:00:00Z') }, { id: 'food-2', userId: 'owner', localDate: '2026-10-17', name: 'Stored lunch', meal: 'lunch', nutrients: nutrition(200, 0), items: [], createdAt: new Date('2026-10-17T01:00:00Z') }]
}
let count = 0
async function check(name, run) { reset(); await run(); count++; console.log('PASS ' + name) }
async function run() {
  await check('fixed operation set exposes two real domains with no arbitrary route or paid action', async () => {
    assert.deepEqual(Object.keys(adapters).sort(), ['food.diary.detail', 'food.diary.list', 'food.diary.totals', 'journal.health.create', 'journal.health.read'])
    assert.equal(adapters['food.diary.totals'].execute, undefined)
    assert.equal(adapters['journal.health.create'].read, undefined)
  })
  await check('structured literal journal note survives preparation without phrase parsing or writes', async () => {
    const content = 'Today I discussed Mood Journal.\n“Do not rewrite this note.” Exact punctuation!'
    const prepared = await prepare({ content, localDate: '2026-10-16' })
    assert.equal(prepared.data.content, content); assert.match(prepared.summary, /Health Journal/); assert(prepared.summary.endsWith(content)); assert.equal(prepared.cost.maximumCredits, 0)
    assert.equal(entries.length, 0); assert.equal(calls.length, 0)
  })
  await check('same actual manual POST and GET create one owned note and read back exact literal values', async () => {
    const content = '  Exact note.\nSecond line.  ', p = await prepare({ content, localDate: '2026-10-16' }), result = await execute(p)
    assert.equal(result.status, 'completed'); assert.equal(result.saved, true); assert.equal(result.entry.content, content.trim()); assert.equal(result.entry.localDate, '2026-10-16'); assert.equal(result.actionId, claim.actionId)
    assert.equal(entries.length, 1); assert.equal(entries[0].userId, 'owner'); assert.equal(calls.filter(call => call.operation === 'create').length, 1)
    assert.equal(await create.verify(context(), result, p.data), true)
    const reopened = await journalRead.read(context(), { id: result.entry.id, localDate: '2026-10-16' }); assert.equal(reopened.entry.content, content.trim()); assert.equal(reopened.safeToClaimSaved, false)
  })
  await check('account mismatch, forged owner, missing claim and cancelled context refuse before normal POST', async () => {
    const p = await prepare({ content: 'Exact note.' })
    actor = 'other'; await assert.rejects(() => execute(p)); actor = 'owner'
    await assert.rejects(() => create.execute(context(), { ...p.data, actorId: 'other' }, claim))
    await assert.rejects(() => execute(p, context(), { receiptClaimed: false, actionId: 'false' }))
    const abort = new AbortController(); abort.abort(); await assert.rejects(() => execute(p, context({ signal: abort.signal })))
    assert.equal(entries.length, 0); assert.equal(calls.length, 0)
  })
  await check('unsupported destination metadata, malformed dates and arbitrary fields never silently discard data', async () => {
    for (const values of [{ content: 'Text', title: 'Unsupported' }, { content: 'Text', images: ['untrusted'] }, { content: 'Text', localDate: '2026-02-30' }, { content: 'Text', ownerId: 'other' }, { content: '' }, { content: 'Text', endpoint: '/api/arbitrary' }]) await assert.rejects(() => prepare(values))
    assert.equal(calls.length, 0); assert.equal(entries.length, 0)
  })
  await check('POST receipt without an exact GET result stays uncertain and does not repeat the write', async () => {
    const p = await prepare({ content: 'Exact note.' }); readHook = () => ({ entries: [] })
    await assert.rejects(() => execute(p), error => error.code === 'journal_save_uncertain' && error.retrySafe === false && error.possibleEntryId === 'entry-1')
    assert.equal(entries.length, 1); assert.equal(calls.filter(call => call.operation === 'create').length, 1)
  })
  await check('lost POST result preserves uncertainty even if the normal handler already committed', async () => {
    const p = await prepare({ content: 'Exact note.' }); createHook = () => { throw Error('Synthetic response lost') }
    await assert.rejects(() => execute(p), error => error.code === 'journal_save_uncertain' && error.retrySafe === false)
    assert.equal(entries.length, 1); assert.equal(calls.filter(call => call.operation === 'create').length, 1)
  })
  await check('wrong content, duplicated rows and foreign ownership cannot turn POST success into saved proof', async () => {
    for (const mode of ['content', 'duplicate', 'foreign']) {
      reset(); const p = await prepare({ content: 'Exact note.' })
      readHook = data => mode === 'content' ? { entries: data.entries.map(row => ({ ...row, content: 'Different' })) } : mode === 'duplicate' ? { entries: [data.entries[0], data.entries[0]] } : { entries: data.entries.map(row => ({ ...row, userId: 'other' })) }
      await assert.rejects(() => execute(p), error => error.code === 'journal_save_uncertain' && error.retrySafe === false)
      assert.equal(calls.filter(call => call.operation === 'create').length, 1)
    }
  })
  await check('account changes after submission suppress completion and retain one possible save', async () => {
    const p = await prepare({ content: 'Exact note.' }); createHook = data => { actor = 'other'; return data }
    await assert.rejects(() => execute(p), error => error.code === 'journal_save_uncertain' && error.retrySafe === false)
    assert.equal(entries.length, 1); assert.equal(calls.length, 1)
  })
  await check('readback verification notices later manual edits and never accepts only matching IDs', async () => {
    const p = await prepare({ content: 'Exact note.' }), result = await execute(p)
    entries[0].content = 'New manual edit.'
    assert.equal(await create.verify(context(), result, p.data), false)
    await assert.rejects(() => journalRead.read(context(), { id: 'missing' }))
    actor = 'other'; await assert.rejects(() => journalRead.read(context(), { id: result.entry.id }))
    assert.equal(entries.length, 1)
  })
  await check('actual normal diary GET and existing helper return owned exact totals preserving unknown and zero', async () => {
    const totals = await adapters['food.diary.totals'].read(context(), { localDate: '2026-10-17' })
    assert.equal(totals.verified, true); assert.equal(totals.safeToClaimSaved, false); assert.equal(totals.data.totals.calories_kcal, 300); assert.equal(totals.data.totals.fiber_g, null); assert.equal(totals.data.totals.sugar_g, 0)
    const list = await adapters['food.diary.list'].read(context(), { limit: 1 }); assert.equal(list.data.entries.length, 1); assert.equal(list.data.totalCount, 2); assert.equal(list.data.truncated, true)
    const detail = await adapters['food.diary.detail'].read(context(), { id: 'food-2', sourceDate: '2026-10-17' }); assert.equal(detail.data.entry.label, 'Stored lunch')
    assert.equal(entries.length, 0); assert.equal(calls.length, 0)
  })
  await check('actual diary strict fields and ownership gates reject invented owner/endpoints and invalid dates', async () => {
    for (const values of [{ endpoint: '/api/paid' }, { userId: 'other' }, { localDate: '2026-02-30' }, { meal: 'invented' }]) await assert.rejects(() => adapters['food.diary.list'].read(context(), values))
    assert.equal(foodCalls.length, 0)
    foods[0].userId = 'other'; const own = await adapters['food.diary.list'].read(context(), {}); assert.equal(own.data.entries.length, 1); assert.equal(own.data.entries[0].id, 'food-2')
    await assert.rejects(() => adapters['food.diary.detail'].read(context(), { id: 'food-1', sourceDate: '2026-10-17' }))
    assert.equal(calls.length, 0)
  })
  await check('normal diary GET enforces missing authentication and local-date source of truth', async () => {
    actor = null; assert.equal((await foodRoute.GET(new Req('https://helfi.example.test/api/food-log?date=2026-10-17'))).status, 401)
    actor = 'owner'; foods[0].createdAt = new Date('2026-10-16T01:00:00Z'); foods[1].localDate = '2026-10-16'
    const result = await adapters['food.diary.list'].read(context(), {}); assert.equal(result.data.entries.length, 1); assert.equal(result.data.entries[0].id, 'food-1')
  })
  console.log(`Voice 2 domain adapters: ${count} offline groups passed; actual journal POST/GET and diary GET/helper, synthetic storage/auth only. No providers, live accounts or credits.`)
}
module.exports = {
  load, api, services, adapters, context, reset,
  entries: () => entries,
  calls: () => calls,
  setActor: value => { actor = value },
  setCreateHook: value => { createHook = value },
  setReadHook: value => { readHook = value },
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1 })
