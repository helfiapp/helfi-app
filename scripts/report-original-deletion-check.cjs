const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, mocks, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, Buffer, Date, URL, console: { error() {} }, ...globals,
    require: id => { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id] },
  }, { filename: file })
  return module.exports
}

function fixture() {
  const state = { session: { user: { id: 'synthetic-owner', email: 'owner@example.test' } }, storageFailure: null,
    objectExists: true, markerFailure: false, transactionFailure: false, processingFailure: false,
    report: { id: 'synthetic-report', userId: 'synthetic-owner', status: 'PENDING', s3Key: 'reports/synthetic.pdf',
      originalDeletedAt: null, retainOriginal: false, consentRecordId: 'synthetic-consent', isPasswordProtected: false,
      consentRecord: { decryptionConsent: true, passwordConsent: true } },
    labs: [], audit: [], events: [], commands: [], counts: { head: 0, extract: 0, encrypt: 0, create: 0, transactions: 0 },
  }
  class Command { constructor(input) { this.input = input } }
  const aws = Object.fromEntries(['DeleteObjectsCommand', 'GetObjectCommand', 'HeadObjectCommand', 'ListObjectsV2Command', 'PutObjectCommand'].map(name => [name, Command]))
  aws.S3Client = class { async send(command) {
    state.events.push('storage.delete'); state.commands.push(command.input)
    if (state.storageFailure === 'throw') throw Error('Synthetic storage unavailable')
    if (state.storageFailure === 'logical') return { Errors: [{ Code: 'AccessDenied', Key: 'synthetic-private-key' }] }
    state.objectExists = false
    return {}
  } }
  const storage = load('lib/object-storage.ts', {
    '@aws-sdk/client-s3': aws, '@aws-sdk/s3-request-presigner': {}, '@vercel/blob': {}, crypto: {},
  }, { process: { env: { OBJECT_STORAGE_PROVIDER: 'aws-s3', HELFI_AWS_S3_BUCKET: 'synthetic-bucket', HELFI_AWS_S3_REGION: 'synthetic-region' } } })
  const tx = {
    auditEvent: { updateMany: async () => { state.events.push('db.audit.detach') } },
    labResult: { deleteMany: async () => { state.events.push('db.labs.delete'); state.labs = [] } },
    report: { delete: async () => { state.events.push('db.report.delete'); state.report = null }, count: async () => state.report ? 1 : 0 },
    consentRecord: { deleteMany: async () => { state.events.push('db.consent.delete') } },
  }
  const prisma = {
    user: { findUnique: async () => ({ id: 'synthetic-owner' }) },
    report: {
      findUnique: async () => state.report ? { ...state.report } : null,
      updateMany: async ({ where, data }) => {
        if (state.claimFailure) {
          if (state.claimFailure === 'concurrent') state.report.status = 'PROCESSING'
          throw Error('Synthetic processing claim failure')
        }
        if (!state.report || !where.status.in.includes(state.report.status)) return { count: 0 }
        state.events.push(`db.claim.${data.status}`); Object.assign(state.report, data); return { count: 1 }
      },
      update: async ({ data }) => {
        if (data.originalDeletedAt && state.markerFailure) throw Error('Synthetic marker write failure')
        state.events.push(data.originalDeletedAt ? 'db.original.marker' : `db.status.${data.status}`)
        Object.assign(state.report, data)
        return { ...state.report }
      },
    },
    labResult: {
      create: async ({ data }) => { state.counts.create++; const row = { id: `lab-${state.counts.create}`, ...data }; state.labs.push(row); return row },
      count: async () => state.labs.length,
    },
    $transaction: async fn => { state.counts.transactions++; if (state.transactionFailure) throw Error('Synthetic transaction failure'); return fn(tx) },
  }
  const enums = new Proxy({}, { get: (_target, key) => key })
  const mocks = {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    'next-auth': { getServerSession: async () => state.session }, 'next-auth/next': { getServerSession: async () => state.session },
    '@/lib/auth': { authOptions: {} }, '@/lib/prisma': { prisma },
    '@/lib/object-storage': { ...storage, head: async () => { state.counts.head++; return { url: 'https://synthetic.invalid/report' } } },
    '@/lib/audit': { createAuditEvent: async event => { state.audit.push(event) } },
    '@prisma/client': { AuditEventType: enums, ReportStatus: enums },
    '@/lib/pdf-processor': { processPDF: async () => {
      state.counts.extract++; if (state.processingFailure) throw Error('Synthetic unreadable PDF')
      return { pageCount: 1, labValues: [{ analyteName: 'synthetic-a', value: '1' }, { analyteName: 'synthetic-b', value: '2' }] }
    } },
    '@/lib/encryption': { verifyPasswordHash: async password => {
      if (password !== 'synthetic-valid-password' && state.wrongPasswordHold) await state.wrongPasswordHold
      return password === 'synthetic-valid-password'
    }, encryptFieldsBatch: async fields => {
      state.counts.encrypt++; return { encryptedFields: Object.fromEntries(Object.entries(fields).map(([key]) => [key, `encrypted-${key}`])), wrappedKey: 'synthetic-wrapped-key' }
    } }, '@/lib/file-encryption': { decryptBuffer: buffer => buffer },
  }
  const globals = { process: { env: {} }, fetch: async url => {
    assert.equal(url, 'https://synthetic.invalid/report')
    return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }
  } }
  return { state, storage,
    original: load('app/api/reports/[id]/delete-original/route.ts', mocks, globals).POST,
    remove: load('app/api/reports/[id]/route.ts', mocks, globals).DELETE,
    process: load('app/api/reports/[id]/process/route.ts', mocks, globals).POST,
    request: { headers: new Headers(), json: async () => ({}) }, params: { params: { id: 'synthetic-report' } },
  }
}

async function main() {
  for (const failure of ['throw', 'logical']) {
    const f = fixture(); f.state.storageFailure = failure
    assert.equal((await f.original(f.request, f.params)).status, 500)
    assert.equal(f.state.report.originalDeletedAt, null); assert.equal(f.state.objectExists, true)
    assert.equal(f.state.audit.length, 0)
    f.state.storageFailure = null
    assert.equal((await f.original(f.request, f.params)).status, 200)
    assert.ok(f.state.report.originalDeletedAt); assert.equal(f.state.report.retainOriginal, false)
    assert.equal(f.state.objectExists, false); assert.equal(f.state.audit.filter(e => e.eventType === 'ORIGINAL_DELETED').length, 1)
    assert.equal((await f.original(f.request, f.params)).status, 400)
  }
  console.log('PASS explicit original deletion reports transport/per-object storage failures and remains retryable')
  {
    const f = fixture(); f.state.markerFailure = true
    assert.equal((await f.original(f.request, f.params)).status, 500)
    assert.equal(f.state.objectExists, false); assert.equal(f.state.report.originalDeletedAt, null)
    f.state.markerFailure = false
    assert.equal((await f.original(f.request, f.params)).status, 200, 'already-absent storage deletion is safe to retry')
    assert.equal(f.state.audit.length, 1)
  }
  console.log('PASS failed deletion-marker write preserves an idempotent retry without a false audit event')
  for (const failure of ['throw', 'logical']) {
    const f = fixture(); f.state.storageFailure = failure; f.state.labs.push({ id: 'existing-lab' })
    assert.equal((await f.remove(f.request, f.params)).status, 500)
    assert.equal(f.state.counts.transactions, 0); assert.ok(f.state.report); assert.equal(f.state.labs.length, 1)
    f.state.storageFailure = null; f.state.transactionFailure = true
    assert.equal((await f.remove(f.request, f.params)).status, 500)
    assert.ok(f.state.report); assert.equal(f.state.labs.length, 1)
    f.state.transactionFailure = false
    assert.equal((await f.remove(f.request, f.params)).status, 200)
    assert.equal(f.state.report, null); assert.equal(f.state.labs.length, 0)
    assert.ok(f.state.events.indexOf('storage.delete') < f.state.events.indexOf('db.report.delete'))
  }
  console.log('PASS whole-report deletion retains rows/file reference on storage failure and deletes storage before rows')
  for (const failure of ['throw', 'logical', 'marker']) {
    const f = fixture(); f.state.storageFailure = failure === 'marker' ? null : failure; f.state.markerFailure = failure === 'marker'
    const result = await f.process(f.request, f.params)
    assert.equal(result.status, 503); assert.equal(result.body.status, 'COMPLETED'); assert.equal(result.body.originalDeleted, false)
    assert.equal(f.state.report.status, 'COMPLETED'); assert.equal(f.state.report.originalDeletedAt, null)
    assert.equal(f.state.labs.length, 2); assert.equal(f.state.audit.filter(e => e.eventType === 'ORIGINAL_DELETED').length, 0)
    const counts = { ...f.state.counts }
    f.state.storageFailure = null; f.state.markerFailure = false
    const retry = await f.process(f.request, f.params)
    assert.equal(retry.status, 200); assert.equal(retry.body.labValueCount, 2)
    assert.deepEqual(f.state.counts, counts, 'cleanup retry must not download, extract, encrypt or create results again')
    assert.equal(f.state.labs.length, 2); assert.ok(f.state.report.originalDeletedAt)
    assert.equal(f.state.audit.filter(e => e.eventType === 'ORIGINAL_DELETED').length, 1)
    const commandsAfterCleanup = f.state.commands.length, auditAfterCleanup = f.state.audit.length
    const confirmed = await f.process(f.request, f.params)
    assert.equal(confirmed.status, 200); assert.equal(confirmed.body.success, true)
    assert.equal(confirmed.body.reportId, 'synthetic-report'); assert.equal(confirmed.body.labValueCount, 2)
    assert.deepEqual(f.state.counts, counts, 'confirming completed cleanup must not repeat extraction')
    assert.equal(f.state.commands.length, commandsAfterCleanup, 'confirming deleted originals must not delete again')
    assert.equal(f.state.audit.length, auditAfterCleanup, 'confirming deleted originals must not audit deletion again')
  }
  console.log('PASS successful extraction survives cleanup failure; retry only removes the original, never repeats extraction')
  {
    const f = fixture()
    assert.equal((await f.process(f.request, f.params)).status, 200)
    assert.equal(f.state.report.status, 'COMPLETED'); assert.ok(f.state.report.originalDeletedAt)
    assert.equal(f.state.labs.length, 2); assert.equal(f.state.labs[0].valueEncrypted, 'encrypted-value')
    const retained = fixture(); retained.state.report.retainOriginal = true
    assert.equal((await retained.process(retained.request, retained.params)).status, 200)
    assert.equal(retained.state.commands.length, 0); assert.equal(retained.state.report.originalDeletedAt, null)
    const retainedCounts = { ...retained.state.counts }
    const retainedAgain = await retained.process(retained.request, retained.params)
    assert.equal(retainedAgain.status, 200); assert.equal(retainedAgain.body.labValueCount, 2)
    assert.deepEqual(retained.state.counts, retainedCounts); assert.equal(retained.state.commands.length, 0)
    const failed = fixture(); failed.state.processingFailure = true
    assert.equal((await failed.process(failed.request, failed.params)).status, 500)
    assert.equal(failed.state.report.status, 'FAILED'); assert.equal(failed.state.commands.length, 0)
  }
  console.log('PASS ordinary processing/encrypted result saves, retained originals and genuine extraction failures retain behavior')
  for (const handler of ['original', 'remove', 'process']) {
    for (const [setup, expected] of [[f => { f.state.session = null }, 401], [f => { f.state.report.userId = 'synthetic-other' }, 403], [f => { f.state.report = null }, 404]]) {
      const f = fixture(); setup(f)
      assert.equal((await f[handler](f.request, f.params)).status, expected)
      assert.equal(f.state.commands.length, 0); assert.equal(f.state.counts.transactions, 0); assert.equal(f.state.counts.create, 0)
    }
  }
  const processing = fixture(); processing.state.report.status = 'PROCESSING'
  assert.equal((await processing.remove(processing.request, processing.params)).status, 409)
  assert.equal(processing.state.commands.length, 0)
  const consent = fixture(); consent.state.report.isPasswordProtected = true; consent.state.report.consentRecord.passwordConsent = false
  assert.equal((await consent.process(consent.request, consent.params)).status, 403)
  assert.equal(consent.state.commands.length, 0)
  console.log('PASS ownership/authentication/not-found/processing and password-consent protections run before deletion')
  {
    const f = fixture()
    await f.storage.del([]); assert.equal(f.state.commands.length, 0)
    await f.storage.del(['reports/synthetic.pdf', 'reports/synthetic.pdf'])
    assert.equal(f.state.commands.length, 1); assert.equal(f.state.commands[0].Delete.Objects.length, 1)
    f.state.storageFailure = 'logical'
    await assert.rejects(f.storage.del('reports/synthetic.pdf'), /could not delete/)
  }
  console.log('PASS actual S3 deletion rejects per-object errors and preserves empty/deduplicated inputs; synthetic storage only')
  await checkUploadCleanupCaller();
  await checkInitialProcessingRecovery();
  await checkProcessingClaim();
}

function uploadCallerFixture() {
  const backend = fixture(), calls = [], completions = [], cells = []
  const originalReport = { ...backend.state.report }
  let cursor = 0, created = 0, processFailure = false, processOverride = null, heldProcess = null, conversions = 0, statusOverride = null
  const react = {
    useState(initial) { const index = cursor++; if (!cells[index]) cells[index] = { value: initial }; return [cells[index].value, value => { cells[index].value = value }] },
    useRef(initial) { const index = cursor++; if (!cells[index]) cells[index] = { value: { current: initial } }; return cells[index].value },
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
  }
  const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
  const transport = async (url, options) => {
    calls.push({ url, method: options.method || 'GET', cache: options.cache, body: typeof options.body === 'string' ? JSON.parse(options.body) : null })
    if (url === '/api/reports/presign') {
      created++
      const id = created === 1 ? 'synthetic-report' : `synthetic-report-${created}`
      const body = JSON.parse(options.body)
      backend.state.report = { ...originalReport, id, retainOriginal: body.retentionConsent, isPasswordProtected: body.isPasswordProtected, passwordHash: body.isPasswordProtected ? 'synthetic-hash:synthetic-salt' : null }
      backend.state.objectExists = true
      return response({ reportId: id })
    }
    if (/^\/api\/reports\/[^/]+\/upload$/.test(url)) return response({ success: true })
    if (url === '/api/reports/list') {
      if (statusOverride) return statusOverride()
      return response({ reports: backend.state.report ? [{ id: backend.state.report.id, status: backend.state.report.status, processingError: backend.state.report.processingError }] : [] })
    }
    const match = url.match(/^\/api\/reports\/([^/]+)\/process$/)
    assert.ok(match, 'Only the normal owned report workflow may be requested')
    if (heldProcess) await heldProcess
    if (processFailure) throw Error('Synthetic process transport failure')
    const result = await backend.process({ headers: new Headers(), json: async () => JSON.parse(options.body || '{}') }, { params: { id: match[1] } })
    const processResponse = response(result.body, result.status)
    return processOverride ? processOverride(result.body, processResponse) : processResponse
  }
  class FormData { append() {} }
  const mocks = { react, 'pdf-lib': { PDFDocument: { create: async () => { conversions++; throw Error('A retry must not rebuild a PDF') } } }, './ConsentGate': { __esModule: true, default: 'SyntheticConsentGate' } }
  const source = fs.readFileSync('components/reports/LabReportUpload.tsx', 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, fetch: transport, FormData,
    require: id => { assert.ok(id in mocks, `Unexpected upload import ${id}`); return mocks[id] },
  })
  const render = () => { cursor = 0; return module.exports.default({ compact: true, onUploadComplete: id => completions.push(id) }) }
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? node.children.map(text).join('') : typeof node === 'string' ? node : ''
  const find = (tree, predicate) => {
    if (Array.isArray(tree)) { for (const child of tree) { const found = find(child, predicate); if (found) return found } }
    else if (tree && typeof tree === 'object') { if (predicate(tree)) return tree; return find(tree.children, predicate) }
    return null
  }
  const button = label => find(render(), node => node.type === 'button' && text(node) === label)
  const select = () => {
    const input = find(render(), node => node.type === 'input' && node.props.type === 'file')
    input.props.onChange({ target: { files: [{ name: 'synthetic.pdf', size: 10 }] } })
  }
  const consent = () => find(render(), node => node.type === 'SyntheticConsentGate').props.onConsent({ decryptionConsent: true, passwordConsent: true, retentionConsent: false })
  return { backend, calls, completions, render, text, find, button, select, consent,
    begin: async () => { select(); consent(); await button('Upload and Process PDF').props.onClick() },
    transportFailure: value => { processFailure = value }, overrideProcess: value => { processOverride = value },
    overrideStatus: value => { statusOverride = value },
    holdProcess: () => { let resolve; heldProcess = new Promise(done => { resolve = done }); return () => { heldProcess = null; resolve() } },
    convertedCount: () => conversions, createdCount: () => created,
  }
}

async function checkUploadCleanupCaller() {
  const f = uploadCallerFixture(); f.backend.state.storageFailure = 'logical'
  await f.begin()
  assert.equal(f.backend.state.report.status, 'COMPLETED'); assert.equal(f.backend.state.labs.length, 2)
  assert.ok(f.text(f.render()).includes('Report processed; cleanup pending'))
  assert.ok(!f.text(f.render()).includes('Processing Failed'))
  assert.ok(f.button('Retry original-file cleanup')); assert.equal(f.button('Upload and Process PDF'), null)
  assert.equal(f.completions.length, 0)
  const counts = { ...f.backend.state.counts }
  await f.button('Retry original-file cleanup').props.onClick()
  assert.ok(f.button('Retry original-file cleanup'), 'a repeated cleanup failure must remain retryable')
  f.transportFailure(true); await f.button('Retry original-file cleanup').props.onClick()
  assert.ok(f.button('Retry original-file cleanup'), 'network failure must not return to a new upload')
  f.transportFailure(false); f.backend.state.storageFailure = null
  const resume = f.holdProcess(), retry = f.button('Retry original-file cleanup').props.onClick
  const first = retry(), overlapping = retry()
  assert.ok(f.text(f.render()).includes('Retrying original-file cleanup...'))
  assert.ok(!f.text(f.render()).includes('Decrypting, extracting'))
  resume(); await Promise.all([first, overlapping])
  assert.deepEqual(f.backend.state.counts, counts, 'cleanup retry must not download, extract, encrypt or create more lab results')
  assert.equal(f.calls.filter(call => call.url === '/api/reports/presign').length, 1)
  assert.equal(f.calls.filter(call => call.url.endsWith('/upload')).length, 1)
  assert.equal(f.calls.filter(call => call.url.endsWith('/process')).length, 4, 'one initial process and three actual retry attempts; duplicate click ignored')
  assert.ok(f.calls.filter(call => call.url.endsWith('/process')).every(call => call.url === '/api/reports/synthetic-report/process'))
  assert.deepEqual(f.completions, ['synthetic-report']); assert.equal(f.backend.state.labs.length, 2)
  assert.equal(f.convertedCount(), 0); assert.equal(f.createdCount(), 1)
  assert.ok(f.backend.state.report.originalDeletedAt)
  assert.ok(f.text(f.render()).includes('PDF Processed Successfully!'))
  f.button('Upload Another Report').props.onClick(); assert.equal(f.button('Upload and Process PDF'), null)

  const normal = uploadCallerFixture(); await normal.begin()
  assert.deepEqual(normal.completions, ['synthetic-report'])
  const failed = uploadCallerFixture(); failed.backend.state.processingFailure = true; await failed.begin()
  assert.ok(failed.text(failed.render()).includes('Processing Failed')); assert.ok(failed.button('Try Again'))
  assert.equal(failed.completions.length, 0)
  const foreign = uploadCallerFixture(); foreign.backend.state.storageFailure = 'logical'
  foreign.overrideProcess((body, result) => ({ ...result, json: async () => ({ ...body, reportId: 'synthetic-other-report' }) })); await foreign.begin()
  assert.equal(foreign.button('Retry original-file cleanup'), null); assert.equal(foreign.completions.length, 0)
  for (const lostResponse of ['transport', 'json']) {
    const lost = uploadCallerFixture(); lost.backend.state.storageFailure = 'logical'; await lost.begin()
    const extractionCounts = { ...lost.backend.state.counts }
    lost.backend.state.storageFailure = null
    lost.overrideProcess((_body, result) => {
      if (lostResponse === 'transport') throw Error('Synthetic response lost after successful cleanup')
      return { ...result, json: async () => { throw new SyntaxError('Synthetic malformed cleanup response') } }
    })
    await lost.button('Retry original-file cleanup').props.onClick()
    assert.ok(lost.backend.state.report.originalDeletedAt, 'the backend has already completed cleanup before response failure')
    assert.ok(lost.button('Retry original-file cleanup'), 'an unconfirmed response must remain cleanup-pending')
    assert.equal(lost.button('Upload and Process PDF'), null); assert.equal(lost.completions.length, 0)
    const deleteCount = lost.backend.state.commands.length, auditCount = lost.backend.state.audit.length
    lost.overrideProcess(null)
    await lost.button('Retry original-file cleanup').props.onClick()
    assert.deepEqual(lost.completions, ['synthetic-report'], 'a same-report confirmation completes exactly once after response loss')
    assert.ok(lost.text(lost.render()).includes('PDF Processed Successfully!'))
    assert.deepEqual(lost.backend.state.counts, extractionCounts)
    assert.equal(lost.backend.state.commands.length, deleteCount); assert.equal(lost.backend.state.audit.length, auditCount)
    assert.equal(lost.backend.state.labs.length, 2); assert.equal(lost.createdCount(), 1); assert.equal(lost.convertedCount(), 0)
    assert.equal(lost.calls.filter(call => call.url === '/api/reports/presign').length, 1)
    assert.equal(lost.calls.filter(call => call.url.endsWith('/upload')).length, 1)
    assert.equal(lost.calls.filter(call => call.url.endsWith('/process')).length, 3)
    assert.ok(lost.calls.filter(call => call.url.endsWith('/process')).every(call => call.url === '/api/reports/synthetic-report/process'))
  }
  const denied = uploadCallerFixture(); denied.backend.state.storageFailure = 'logical'; await denied.begin()
  const deniedCounts = { ...denied.backend.state.counts }, deniedDeleteCount = denied.backend.state.commands.length
  denied.backend.state.report.userId = 'synthetic-other'; denied.backend.state.storageFailure = null
  await denied.button('Retry original-file cleanup').props.onClick()
  assert.ok(denied.button('Retry original-file cleanup')); assert.equal(denied.completions.length, 0)
  assert.equal(denied.button('Upload and Process PDF'), null)
  assert.deepEqual(denied.backend.state.counts, deniedCounts); assert.equal(denied.backend.state.commands.length, deniedDeleteCount)
  denied.backend.state.report.userId = 'synthetic-owner'
  await denied.button('Retry original-file cleanup').props.onClick()
  assert.deepEqual(denied.completions, ['synthetic-report']); assert.equal(denied.createdCount(), 1)
  const guarded = uploadCallerFixture(); guarded.select(); assert.equal(guarded.button('Upload and Process PDF'), null)
  guarded.consent()
  guarded.find(guarded.render(), node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } })
  await guarded.button('Upload and Process PDF').props.onClick()
  assert.equal(guarded.calls.length, 0); assert.ok(guarded.text(guarded.render()).includes('Password is required'))
  console.log('PASS actual upload caller keeps completed results, retries only the same report cleanup, ignores duplicate retry, preserves ordinary failure/consent/password/callback behavior')
}

main().catch(error => { console.error(error); process.exitCode = 1 })


async function checkInitialProcessingRecovery() {
  for (const failure of ['transport', 'json']) {
    for (const storageFailure of [null, 'logical']) {
      const f = uploadCallerFixture(); f.backend.state.storageFailure = storageFailure
      f.overrideProcess((_body, result) => {
        if (failure === 'transport') throw Error('Synthetic initial response lost after server processing')
        return { ...result, json: async () => { throw new SyntaxError('Synthetic initial unreadable response') } }
      })
      await f.begin()
      assert.equal(f.backend.state.report.status, 'COMPLETED'); assert.equal(f.backend.state.labs.length, 2)
      assert.ok(f.button('Check report status')); assert.equal(f.button('Try Again'), null)
      assert.equal(f.button('Upload and Process PDF'), null); assert.equal(f.completions.length, 0)
      const counts = { ...f.backend.state.counts }
      f.overrideProcess(null)
      const check = f.button('Check report status').props.onClick
      await Promise.all([check(), check()])
      assert.equal(f.calls.filter(c => c.url === '/api/reports/list').length, 1, 'duplicate status clicks must not repeat confirmation or callback')
      assert.deepEqual(f.backend.state.counts, counts)
      if (storageFailure) {
        assert.ok(f.button('Retry original-file cleanup')); assert.equal(f.completions.length, 0)
        f.backend.state.storageFailure = null
        await f.button('Retry original-file cleanup').props.onClick()
      }
      assert.deepEqual(f.completions, ['synthetic-report']); assert.equal(f.createdCount(), 1)
      assert.equal(f.calls.filter(c => c.url.endsWith('/upload')).length, 1)
      assert.ok(f.calls.filter(c => c.url.endsWith('/process')).every(c => c.url === '/api/reports/synthetic-report/process'))
      assert.ok(f.calls.filter(c => c.url === '/api/reports/list').every(c => c.method === 'GET' && c.cache === 'no-store'))
      assert.equal(f.backend.state.labs.length, 2); assert.equal(f.convertedCount(), 0)
    }
  }
  console.log('PASS initial post-server transport/JSON loss retains the same report; owned no-store status confirmation never reuploads or extracts again')

  const pending = uploadCallerFixture(); pending.transportFailure(true)
  pending.select(); pending.consent()
  pending.find(pending.render(), n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } })
  pending.find(pending.render(), n => n.type === 'input' && n.props.type === 'password').props.onChange({ target: { value: 'synthetic-valid-password' } })
  await pending.button('Upload and Process PDF').props.onClick()
  assert.equal(pending.backend.state.report.status, 'PENDING'); assert.equal(pending.backend.state.counts.extract, 0)
  assert.ok(pending.button('Check report status')); pending.transportFailure(false)
  await pending.button('Check report status').props.onClick()
  assert.ok(pending.button('Retry processing this report')); assert.equal(pending.calls.filter(c => c.url.endsWith('/process')).length, 1, 'status check alone must not start paid processing')
  const resume = pending.holdProcess(), handler = pending.button('Retry processing this report').props.onClick
  const first = handler(), duplicate = handler(); resume(); await Promise.all([first, duplicate])
  assert.equal(pending.backend.state.counts.extract, 1); assert.equal(pending.createdCount(), 1)
  assert.equal(pending.calls.filter(c => c.url.endsWith('/upload')).length, 1)
  assert.equal(pending.calls.filter(c => c.url.endsWith('/process')).length, 2)
  assert.equal(pending.calls.filter(c => c.url.endsWith('/process'))[1].body.password, 'synthetic-valid-password', 'uncertainty must not discard the required PDF password')
  assert.deepEqual(pending.completions, ['synthetic-report'])
  console.log('PASS an initial request that never reached the server can explicitly retry the same PENDING report, preserving password and suppressing duplicate retry clicks')

  const active = uploadCallerFixture(); active.transportFailure(true); await active.begin()
  active.transportFailure(false); active.backend.state.report.status = 'PROCESSING'
  for (let i = 0; i < 2; i++) await active.button('Check report status').props.onClick()
  assert.ok(active.text(active.render()).includes('still processing')); assert.ok(active.button('Check report status'))
  assert.equal(active.button('Retry processing this report'), null); assert.equal(active.backend.state.counts.extract, 0)
  assert.equal(active.calls.filter(c => c.url.endsWith('/process')).length, 1)
  active.backend.state.report.status = 'COMPLETED'; active.backend.state.report.originalDeletedAt = new Date(); active.backend.state.labs.push({ id: 'completed-by-original-request' })
  await active.button('Check report status').props.onClick()
  assert.deepEqual(active.completions, ['synthetic-report']); assert.equal(active.backend.state.counts.extract, 0)
  console.log('PASS PROCESSING remains checkable without a second extraction, and later COMPLETED confirms once')

  const unknown = uploadCallerFixture(); unknown.transportFailure(true); await unknown.begin(); unknown.transportFailure(false)
  for (const reply of [
    () => ({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) }),
    () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Synthetic unreadable status') } }),
    () => { throw Error('Synthetic status transport failure') },
    () => ({ ok: true, status: 200, json: async () => ({ reports: [{ id: 'some-other-report', status: 'COMPLETED' }] }) }),
    () => ({ ok: true, status: 200, json: async () => ({ reports: null }) }),
    () => ({ ok: true, status: 200, json: async () => ({ reports: [{ id: 'synthetic-report', status: 'UNRECOGNIZED' }] }) }),
  ]) {
    unknown.overrideStatus(reply); await unknown.button('Check report status').props.onClick()
    assert.ok(unknown.button('Check report status')); assert.equal(unknown.button('Try Again'), null)
    assert.equal(unknown.button('Upload and Process PDF'), null); assert.equal(unknown.button('Retry processing this report'), null)
    assert.equal(unknown.completions.length, 0); assert.equal(unknown.backend.state.counts.extract, 0)
  }
  unknown.overrideStatus(null)
  unknown.backend.state.report.status = 'FAILED'; unknown.backend.state.report.processingError = 'Synthetic extraction failed'
  await unknown.button('Check report status').props.onClick()
  assert.ok(unknown.text(unknown.render()).includes('Synthetic extraction failed')); assert.ok(unknown.button('Try Again'))
  assert.equal(unknown.calls.filter(c => c.url.endsWith('/process')).length, 1, 'a confirmed failure must not automatically retry paid processing')
  assert.equal(unknown.completions.length, 0)
  console.log('PASS denied/unreadable/missing status stays uncertain; a confirmed FAILED result is truthful and never automatically reprocessed')
}

async function checkProcessingClaim() {
  const f = fixture()
  const results = await Promise.all([f.process(f.request, f.params), f.process(f.request, f.params)])
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(f.state.counts.extract, 1)
  assert.equal(f.state.labs.length, 2); assert.equal(f.state.report.status, 'COMPLETED')
  assert.equal(f.state.audit.filter(e => e.eventType === 'PDF_PROCESSING_STARTED').length, 1)
  assert.equal(f.state.audit.filter(e => e.eventType === 'PDF_PROCESSING_FAILED').length, 0)
  const active = fixture(); active.state.report.status = 'PROCESSING'
  assert.equal((await active.process(active.request, active.params)).status, 409)
  assert.equal(active.state.report.status, 'PROCESSING'); assert.equal(active.state.counts.extract, 0); assert.equal(active.state.audit.length, 0)
  const noClaim = fixture(); noClaim.state.claimFailure = true
  assert.equal((await noClaim.process(noClaim.request, noClaim.params)).status, 500)
  assert.equal(noClaim.state.report.status, 'PENDING'); assert.equal(noClaim.state.counts.extract, 0); assert.equal(noClaim.state.audit.length, 0)
  const concurrentFailure = fixture(); concurrentFailure.state.claimFailure = 'concurrent'
  assert.equal((await concurrentFailure.process(concurrentFailure.request, concurrentFailure.params)).status, 500)
  assert.equal(concurrentFailure.state.report.status, 'PROCESSING'); assert.equal(concurrentFailure.state.counts.extract, 0); assert.equal(concurrentFailure.state.audit.length, 0)
  console.log('PASS concurrent same-report requests have one extraction winner; unclaimed/in-flight/failed-claim requests cannot mark another processing run failed')

  const wrong = fixture(); wrong.state.report.isPasswordProtected = true; wrong.state.report.passwordHash = 'synthetic-hash:synthetic-salt'
  let release; wrong.state.wrongPasswordHold = new Promise(resolve => { release = resolve })
  const wrongRequest = { ...wrong.request, json: async () => ({ password: 'synthetic-wrong-password' }) }
  const rightRequest = { ...wrong.request, json: async () => ({ password: 'synthetic-valid-password' }) }
  const staleWrong = wrong.process(wrongRequest, wrong.params)
  // Yield until the stale wrong-password request has captured the pending report.
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await wrong.process(rightRequest, wrong.params)).status, 200)
  release(); assert.equal((await staleWrong).status, 409)
  assert.equal(wrong.state.report.status, 'COMPLETED'); assert.equal(wrong.state.counts.extract, 1)
  assert.equal(wrong.state.audit.filter(e => e.eventType === 'PDF_PROCESSING_FAILED').length, 0)
  const denied = fixture(); denied.state.report.isPasswordProtected = true; denied.state.report.passwordHash = 'synthetic-hash:synthetic-salt'
  assert.equal((await denied.process({ ...denied.request, json: async () => ({ password: 'synthetic-wrong-password' }) }, denied.params)).status, 401)
  assert.equal(denied.state.report.status, 'DECRYPTION_FAILED'); assert.equal(denied.state.counts.extract, 0)
  const retry = await denied.process({ ...denied.request, json: async () => ({ password: 'synthetic-valid-password' }) }, denied.params)
  assert.equal(retry.status, 200); assert.equal(denied.state.counts.extract, 1)
  console.log('PASS stale password failures cannot overwrite another winner; normal wrong-password and explicit corrected-password behavior remain intact')
}
