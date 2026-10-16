#!/usr/bin/env node
'use strict'
// Actual record bridge and authenticated symptom-history handlers. All rows,
// tokens and database replies are synthetic; no app imports or live requests.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
class NextRequest extends Request {}
const NextResponse = { json: (value, options = {}) => new Response(JSON.stringify(value), { ...options, headers: { 'content-type': 'application/json' } }) }
const quiet = { error() {}, warn() {}, log() {} }
const owner = 'synthetic-owner'
let records, reads, writes, mode, observed
const row = (id, patch = {}) => ({ id, userId: owner, symptoms: ['headache'], duration: 'two hours', notes: 'Synthetic factual note', summary: 'Synthetic original summary', analysisText: 'Synthetic original analysis', analysisData: { disclaimer: 'Synthetic only' }, createdAt: '2026-10-16T13:15:00.000Z', ...patch })
function reset(initial = [row('selected'), row('unrelated', { symptoms: ['cough'] }), row('foreign', { userId: 'another-owner' }), row('tomorrow', { createdAt: '2026-10-17T13:15:00.000Z' })]) { records = structuredClone(initial); reads = []; writes = []; mode = ''; observed = [] }
const prisma = {
  user: { findUnique: async ({ where }) => where.id ? { id: where.id } : null },
  symptomAnalysis: {
    findMany: async ({ where, select }) => {
      reads.push(where)
      if (mode === 'failed-read') throw Error('Synthetic database read failure')
      return records.filter(record => record.userId === where.userId).map(record => Object.fromEntries(Object.keys(select).map(key => [key, structuredClone(record[key])])))
    },
    deleteMany: async ({ where }) => {
      writes.push(where)
      if (mode === 'failed-delete') throw Error('Synthetic deletion failure')
      const matching = records.filter(record => record.userId === where.userId && record.id === where.id)
      if (mode === 'moved-not-deleted') matching.forEach(record => { record.createdAt = '2026-10-18T00:00:00.000Z' })
      else if (mode !== 'ignored-delete') records = records.filter(record => !matching.includes(record))
      return { count: matching.length }
    },
  },
}
function handler(relative) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8')
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true)
  const stripped = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n').replace(/^export /gm, '')
  const box = vm.createContext({ NextRequest, NextResponse, prisma, console: quiet, authOptions: {},
    getServerSession: async () => null,
    getUserIdFromNativeAuth: async request => {
      observed.push({ url: request.url, auth: request.headers.get('authorization'), action: request.headers.get('x-helfi-voice-action-id') })
      return request.headers.get('authorization') === 'Bearer synthetic-owner' ? owner : null
    },
  })
  vm.runInContext(compile(`${stripped}\nglobalThis.api = { ${relative.includes('[id]') ? 'DELETE' : 'GET, DELETE'} }`), box)
  return box.api
}
const history = handler('app/api/symptoms/history/route.ts')
const entry = handler('app/api/symptoms/history/[id]/route.ts')
const intakeText = fs.readFileSync(path.join(root, 'lib/native-voice-health-intake-record-actions.ts'), 'utf8')
const intakeAst = ts.createSourceFile('intake.ts', intakeText, ts.ScriptTarget.Latest, true)
const predicate = intakeAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'isHealthIntakeRecordEntity').getText(intakeAst).replace(/^export /, '')
const predicateBox = vm.createContext({})
vm.runInContext(compile(`${predicate}\nglobalThis.check = isHealthIntakeRecordEntity`), predicateBox)
const moduleState = { exports: {} }
const drinkLabels = { exports: {} }
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'lib/native-voice-drink-label.ts'), 'utf8')), { module: drinkLabels, exports: drinkLabels.exports })
const box = vm.createContext({ module: moduleState, exports: moduleState.exports, URL, Headers, Date, Intl, console: quiet,
  require: name => {
    if (name === 'crypto') return crypto
    if (name === 'next/server') return { NextRequest }
    if (name === '@/lib/native-voice-health-intake-record-actions') return { isHealthIntakeRecordEntity: predicateBox.check }
    if (name === '@/lib/native-voice-resolved-food') return {} // Unused food exports may never execute in this suite.
    if (name === '@/lib/native-voice-drink-label') return drinkLabels.exports
    if (name === '@/app/api/symptoms/history/route') return history
    if (name === '@/app/api/symptoms/history/[id]/route') return entry
    throw Error(`Unexpected app dependency: ${name}`)
  },
})
vm.runInContext(compile(fs.readFileSync(path.join(root, 'lib/native-voice-record-actions.ts'), 'utf8')), box)
const { prepareNativeVoiceRecordAction: prepare, executeNativeVoiceRecordAction: execute, invokeNativeVoiceRecordRoute: invoke } = moduleState.exports
const request = signal => new NextRequest('https://helfi.invalid/api/native/voice-assistant', { headers: { authorization: 'Bearer synthetic-owner', 'x-helfi-voice-action-id': 'synthetic-action' }, ...(signal ? { signal } : {}) })
const command = patch => ({ entity: 'symptom_note', operation: 'delete', localDate: '2026-10-17', timeZone: 'Australia/Melbourne', query: 'headache', changes: {}, ...patch })
let count = 0
async function check(name, run) { reset(); await run(); count++; console.log(`PASS ${name}`) }
async function main() {
  await check('review selects only one owned symptom record and performs no preparation write', async () => {
    const prepared = await prepare(request(), owner, command())
    assert.equal(prepared.canConfirm, true); assert.equal(prepared.recordAction.id, 'selected')
    assert.equal(prepared.recordAction.timeZone, 'Australia/Melbourne')
    assert.equal(writes.length, 0)
    assert.match(prepared.confirmationMessage, /headache symptom notes on 2026-10-17/)
    assert.ok(!prepared.confirmationMessage.includes('Synthetic original analysis'))
  })
  await check('normal exact-ID DELETE and readback retain every unrelated and other-account note', async () => {
    const before = structuredClone(records.filter(record => record.id !== 'selected'))
    const prepared = await prepare(request(), owner, command())
    const result = await execute(request(), owner, prepared.recordAction)
    assert.equal(result.kind, 'symptom_note'); assert.equal(result.operation, 'delete'); assert.equal(result.id, 'selected')
    assert.deepEqual(records, before)
    assert.deepEqual(JSON.parse(JSON.stringify(writes)), [{ id: 'selected', userId: owner }])
    assert.ok(observed.every(value => value.auth === 'Bearer synthetic-owner' && value.action === 'synthetic-action'))
    assert.ok(observed.every(value => new URL(value.url).pathname === '/api/symptoms/history' || new URL(value.url).pathname === '/api/symptoms/history/selected'))
  })
  await check('explicit local zone selects the correct day across midnight and daylight saving', async () => {
    assert.equal((await prepare(request(), owner, command({ id: 'selected', query: undefined, localDate: '2026-10-16' }))).canConfirm, false)
    const ny = await prepare(request(), owner, command({ id: 'selected', query: undefined, localDate: '2026-10-16', timeZone: 'America/New_York' }))
    assert.equal(ny.canConfirm, true)
    reset([row('winter', { createdAt: '2026-06-15T14:15:00.000Z' })])
    assert.equal((await prepare(request(), owner, command({ localDate: '2026-06-16' }))).canConfirm, true)
    assert.equal((await prepare(request(), owner, command({ localDate: '2026-06-15' }))).canConfirm, false)
  })
  await check('missing or invalid zone and update/create/extra-field requests cannot read or write', async () => {
    for (const patch of [{ timeZone: undefined }, { timeZone: 'invalid/timezone' }, { operation: 'update', changes: { notes: 'changed' } }, { operation: 'create' }, { changes: { notes: 'new note' } }, { changes: { symptoms: ['different'] } }, { changes: { analysisText: 'invented' } }]) assert.equal((await prepare(request(), owner, command(patch))).canConfirm, false)
    assert.equal(reads.length, 0); assert.equal(writes.length, 0)
  })
  await check('ambiguous same-day symptoms require exact identity and disclose local choice times', async () => {
    records.push(row('second-headache', { createdAt: '2026-10-16T14:15:00.000Z' }))
    const prepared = await prepare(request(), owner, command())
    assert.equal(prepared.canConfirm, false); assert.equal(prepared.choices.length, 2)
    assert.ok(prepared.choices.every(choice => choice.localDate === '2026-10-17'))
    assert.match(prepared.confirmationMessage, /Australia\/Melbourne/)
    assert.ok(!prepared.confirmationMessage.includes(' UTC'))
    const selected = await prepare(request(), owner, command({ id: 'second-headache' }))
    assert.equal(selected.canConfirm, true)
  })
  await check('foreign, missing and wrong-date identities never acquire save authority', async () => {
    for (const id of ['foreign', 'missing', 'tomorrow']) assert.equal((await prepare(request(), owner, command({ id }))).canConfirm, false)
    const unauthorized = new NextRequest(request(), { headers: { authorization: 'Bearer invalid' } })
    assert.equal((await prepare(unauthorized, owner, command())).canConfirm, false)
    const response = await entry.DELETE(request(), { params: { id: 'foreign' } })
    assert.equal(response.status, 404); assert.ok(records.some(record => record.id === 'foreign'))
  })
  await check('changed factual or analysis content invalidates the reviewed snapshot', async () => {
    const prepared = await prepare(request(), owner, command())
    records[0].notes = 'changed after review'
    await assert.rejects(execute(request(), owner, prepared.recordAction), /changed after the proposal/)
    assert.equal(writes.length, 0)
  })
  await check('normal handler failures and skipped deletes cannot produce success', async () => {
    for (const failure of ['failed-delete', 'ignored-delete', 'moved-not-deleted']) {
      reset()
      const prepared = await prepare(request(), owner, command())
      mode = failure
      await assert.rejects(execute(request(), owner, prepared.recordAction))
      assert.ok(records.some(record => record.id === 'selected'))
    }
  })
  await check('failed and malformed history reads never prove a deletion or create a proposal', async () => {
    mode = 'failed-read'
    assert.equal((await prepare(request(), owner, command())).canConfirm, false)
    mode = ''
    const prepared = await prepare(request(), owner, command())
    const invalidIo = async () => ({ success: true })
    await assert.rejects(execute(request(), owner, prepared.recordAction, invalidIo), /did not verify/)
    assert.equal(writes.length, 0)
  })
  await check('no bulk deletion or unsupported method can reach a normal history mutation', async () => {
    for (const method of ['DELETE', 'POST', 'PUT', 'PATCH']) await assert.rejects(invoke(request(), { entity: 'symptom_note', method, localDate: '2026-10-17' }))
    assert.equal(writes.length, 0); assert.equal(reads.length, 0)
  })
  await check('cancelled request cannot prepare or dispatch a late symptom deletion', async () => {
    const prepared = await prepare(request(), owner, command())
    const controller = new AbortController(); controller.abort()
    assert.equal((await prepare(request(controller.signal), owner, command())).canConfirm, false)
    await assert.rejects(execute(request(controller.signal), owner, prepared.recordAction), /stopped/)
    assert.equal(writes.length, 0)
  })
  console.log(`Voice symptom records: ${count} actual-source offline groups passed. No real symptom history was read or deleted; no diagnosis or update behavior added.`)
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
