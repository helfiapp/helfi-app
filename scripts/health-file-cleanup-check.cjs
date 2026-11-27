const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const paths = {
  bulk: 'app/api/medical-images/history/route.ts',
  single: 'app/api/medical-images/history/[id]/route.ts',
  mood: 'app/api/mood/journal/entries/[id]/route.ts',
}
function load(file, mocks, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, Buffer, Date, URL, console: { error() {}, warn() {} }, AbortController, setTimeout, clearTimeout, ...globals,
    require: id => { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id] },
  }, { filename: file })
  return module.exports
}
const clone = value => JSON.parse(JSON.stringify(value))
const privateKey = 'medical-images/synthetic-owner/private-file'
function fixture() {
  const state = {
    session: { user: { email: 'owner@example.test' } }, nativeId: null, configured: true,
    failure: null, failAtBatch: 1, dbFailure: false, events: [], commands: [], dbWrites: 0,
    analyses: [1, 2].map(n => ({ id: `analysis-${n}`, userId: 'synthetic-owner', imageFileId: `file-${n}`,
      imageFile: { cloudinaryId: `${privateKey}-${n}.png`, secureUrl: '' } })),
    files: ['file-1', 'file-2'], objects: new Set([`${privateKey}-1.png`, `${privateKey}-2.png`]),
    entry: { id: 'entry-1', userId: 'synthetic-owner', title: 'Original title', content: 'Original notes',
      images: ['mood-journal/synthetic-owner/old.png', 'mood-journal/synthetic-owner/keep.png'],
      audio: ['mood-journal/synthetic-owner/old.m4a'], tags: ['original'] },
  }
  for (const key of [...state.entry.images, ...state.entry.audio, 'mood-journal/synthetic-owner/new.png']) state.objects.add(key)
  const storageEnv = { OBJECT_STORAGE_PROVIDER: 'aws-s3', HELFI_AWS_S3_BUCKET: 'synthetic-bucket', HELFI_AWS_S3_REGION: 'synthetic-region' }
  const configure = value => { state.configured = value; storageEnv.HELFI_AWS_S3_BUCKET = value ? 'synthetic-bucket' : '' }
  class Command { constructor(input) { this.input = input } }
  const aws = Object.fromEntries(['DeleteObjectsCommand', 'GetObjectCommand', 'HeadObjectCommand', 'ListObjectsV2Command', 'PutObjectCommand'].map(name => [name, Command]))
  aws.S3Client = class { constructor(options) { state.clientOptions = [...(state.clientOptions || []), options] } async send(command, options = {}) {
    if (state.sdkBackoff === (command.input.Delete ? 'delete' : 'head')) {
      assert.equal(options.abortSignal.aborted, false)
      state.freshHttp = (state.freshHttp || 0) + 1; state.sdkPending = 1
      state.events.push('transport.backoff.started')
      return new Promise((resolve, reject) => {
        const abort = () => { state.events.push('transport.backoff.http-aborted'); options.abortSignal.removeEventListener('abort', abort) }
        options.abortSignal.addEventListener('abort', abort, { once: true })
        state.releaseSdk = () => {
          options.abortSignal.removeEventListener('abort', abort)
          if (options.abortSignal.aborted) state.blockedRetries = (state.blockedRetries || 0) + 1; else state.freshHttp++
          state.sdkPending = 0
          if (state.lateReject) reject(Error('Synthetic late SDK rejection')); else resolve(command.input.Delete ? {} : { ContentLength: 1 })
        }
      })
    }
    const abortableHold = async (kind) => {
      assert.ok(options.abortSignal, 'Mood transports require the same real abort signal')
      state.pendingTransports = (state.pendingTransports || 0) + 1
      state.events.push(`transport.${kind}.started`)
      try {
        await new Promise((resolve, reject) => {
          const abort = () => { state.events.push(`transport.${kind}.aborted`); reject(Error('Synthetic transport aborted')) }
          if (options.abortSignal.aborted) abort(); else options.abortSignal.addEventListener('abort', abort, { once: true })
        })
      } finally { state.pendingTransports-- }
    }
    if (!command.input.Delete) {
      const key = command.input.Key
      state.headCommands = [...(state.headCommands || []), key]; state.events.push('storage.head')
      if (state.hangHeads) await abortableHold('head')
      if (state.headHold) await state.headHold
      if (state.headFailure || !state.objects.has(key)) throw Error('Synthetic missing or unreadable object metadata')
      if (state.expireAfterHead) state.txExpired = true
      return { ContentLength: 1 }
    }
    const keys = command.input.Delete.Objects.map(item => item.Key)
    state.commands.push([...keys]); state.events.push('storage.delete')
    if (state.hangDeletes) await abortableHold('delete')
    if (state.failure && state.commands.length === state.failAtBatch) {
      if (state.failure === 'partial') { state.objects.delete(keys[0]); return { Errors: [{ Key: keys[keys.length - 1], Code: 'AccessDenied' }] } }
      throw Error(`Synthetic storage failure at ${privateKey}`)
    }
    for (const key of keys) state.objects.delete(key)
    if (state.afterStorage) { const hook = state.afterStorage; state.afterStorage = null; await hook() }
    return {}
  } }
  const storage = load('lib/object-storage.ts', { '@aws-sdk/client-s3': aws, '@aws-sdk/s3-request-presigner': { getSignedUrl: async () => 'https://metadata-only.invalid/no-body' }, '@vercel/blob': {}, crypto: {} }, { process: { env: storageEnv } })
  const blobPaths = load('lib/blob-paths.ts', {})
  const lazy = fn => ({ then: (resolve, reject) => Promise.resolve().then(fn).then(resolve, reject) })
  let lockTail = Promise.resolve()
  const prisma = {
    user: { findUnique: async () => ({ id: 'synthetic-owner' }) },
    medicalImageAnalysis: {
      findMany: async ({ where }) => clone(state.analyses.filter(item => item.userId === where.userId)),
      findFirst: async ({ where }) => clone(state.analyses.find(item => item.userId === where.userId && item.id === where.id) || null),
      deleteMany: ({ where }) => lazy(() => { const before = state.analyses.length; state.analyses = state.analyses.filter(item => !(item.userId === where.userId && (!where.id || where.id.in.includes(item.id)))); state.events.push('db.analysis.delete'); state.dbWrites++; return { count: before - state.analyses.length } }),
      delete: ({ where }) => lazy(() => { state.analyses = state.analyses.filter(item => item.id !== where.id); state.events.push('db.analysis.delete'); state.dbWrites++; return { id: where.id } }),
    },
    file: { deleteMany: ({ where }) => lazy(() => { const ids = typeof where.id === 'string' ? [where.id] : where.id.in; state.files = state.files.filter(id => !ids.includes(id)); state.events.push('db.file.delete'); state.dbWrites++; return { count: ids.length } }) },
    $transaction: async (queries, options) => {
      if (typeof queries !== 'function') {
        if (state.dbFailure) throw Error(`Synthetic DB failure at ${privateKey}`)
        const results = []; for (const query of queries) results.push(await query); return results
      }
      assert.equal(options.maxWait, 5000); assert.equal(options.timeout, 20000)
      let release, snapshot, written = false
      const tx = {
        $queryRawUnsafe: async (sql, ...values) => {
          if (sql.includes('FOR UPDATE')) {
            const prior = lockTail
            const held = new Promise(resolve => { release = resolve }); lockTail = prior.then(() => held)
            state.waitingLocks = (state.waitingLocks || 0) + 1
            await prior; if (state.lockWait) await state.lockWait; state.waitingLocks--; snapshot = clone(state.entry)
            state.events.push('tx.row.lock')
          }
          if (state.txExpired) throw Error('Synthetic transaction expired')
          return sql === 'SELECT 1' ? [{ '?column?': 1 }] : prisma.$queryRawUnsafe(sql, ...values)
        },
        $executeRawUnsafe: async (...values) => {
          if (state.txExpired) throw Error('Synthetic transaction expired')
          const result = await prisma.$executeRawUnsafe(...values); written = true; return result
        },
      }
      try {
        const result = await queries(tx)
        if (state.commitFailure) throw Error('Synthetic commit failed')
        return result
      } catch (error) {
        if (written) state.entry = snapshot
        throw error
      } finally {
        if (release) { state.events.push('tx.row.unlock'); release() }
      }
    },
    $queryRawUnsafe: async (_sql, userId, id) => clone(state.entry && state.entry.userId === userId && state.entry.id === id ? [state.entry] : []),
    $executeRawUnsafe: async (sql, ...values) => {
      if (state.dbFailure) throw Error(`Synthetic DB failure at ${privateKey}`)
      const updating = sql.trim().startsWith('UPDATE')
      const userId = values[updating ? 8 : 0], id = values[updating ? 9 : 1]
      if (!state.entry || state.entry.userId !== userId || state.entry.id !== id) return 0
      state.dbWrites++; state.events.push(updating ? 'db.entry.update' : 'db.entry.delete')
      if (updating) Object.assign(state.entry, { localDate: values[0], title: values[1], content: values[2], images: JSON.parse(values[3]), tags: JSON.parse(values[4]), audio: JSON.parse(values[5]), prompt: values[6], template: values[7] })
      else state.entry = null
      return 1
    },
  }
  const mocks = {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    'next-auth': { getServerSession: async () => state.session }, '@/lib/auth': { authOptions: {} },
    '@/lib/native-auth': { getUserIdFromNativeAuth: async () => state.nativeId }, '@/lib/prisma': { prisma },
    '@/lib/object-storage': storage, '@/lib/file-encryption': {}, '@/lib/signed-file': {},
    '@/app/api/mood/_db': { ensureMoodTables: async () => {} },
    '@/lib/blob-access': { extractScopedBlobPath: (value, scope) => { assert.equal(scope, 'mood-journal'); return blobPaths.extractBlobPathWithPrefixes(value, ['mood-journal/']) }, mapToSignedBlobUrl: value => value },
  }
  const moodTimers = {
    setTimeout: (callback, ms) => { assert.equal(ms, 10000); state.storageDeadline = callback; state.deadlineMs = ms; return callback },
    clearTimeout: callback => { if (state.storageDeadline === callback) state.storageDeadline = null },
  }
  const bulk = load(paths.bulk, mocks), single = load(paths.single, mocks), mood = load(paths.mood, mocks, moodTimers)
  const request = body => ({ json: async () => body || {} })
  const body = { title: ' Updated ', content: ' Kept notes ', images: ['mood-journal/synthetic-owner/keep.png', 'mood-journal/synthetic-owner/new.png'], audio: [], tags: ['kept'], localDate: '2026-11-27', prompt: 'prompt', template: 'template' }
  return { state, configure, body, request,
    bulk: () => bulk.DELETE(request()), single: () => single.DELETE(request(), { params: { id: 'analysis-1' } }),
    moodDelete: () => mood.DELETE(request(), { params: { id: 'entry-1' } }), moodPut: (value = body) => mood.PUT(request(value), { params: { id: 'entry-1' } }),
  }
}
function assertSafeFailure(result) {
  assert.equal(result.status, 500); assert.notEqual(result.body.success, true)
  assert.ok(!JSON.stringify(result.body).includes(privateKey), 'responses must not expose private storage/DB details')
  assert.ok(!JSON.stringify(result.body).includes('mood-journal/')); assert.deepEqual(Object.keys(result.body), ['error'])
}
async function main() {
  for (const handler of ['single', 'bulk']) for (const failure of ['throw', 'partial']) {
    const f = fixture(), original = clone({ analyses: f.state.analyses, files: f.state.files })
    f.state.failure = failure
    assertSafeFailure(await f[handler]()); assert.equal(f.state.dbWrites, 0)
    assert.equal(JSON.stringify({ analyses: f.state.analyses, files: f.state.files }), JSON.stringify(original))
    const firstKeys = JSON.stringify(f.state.commands[0]); f.state.failure = null
    assert.equal((await f[handler]()).status, 200)
    assert.equal(JSON.stringify(f.state.commands[1]), firstKeys, 'retry must retain the exact original target set, including already-deleted files')
    assert.equal(f.state.analyses.length, handler === 'single' ? 1 : 0)
    assert.ok(f.state.events.indexOf('storage.delete') < f.state.events.indexOf('db.analysis.delete'))
  }
  console.log('PASS medical single/bulk storage exceptions and partial per-object failures retain exact references for retry')
  for (const handler of ['single', 'bulk']) {
    const f = fixture(); f.configure(false)
    assertSafeFailure(await f[handler]()); assert.equal(f.state.dbWrites, 0); assert.equal(f.state.commands.length, 0)
    f.configure(true); assert.equal((await f[handler]()).status, 200)
    const empty = fixture(); empty.configure(false)
    empty.state.analyses.forEach(row => { row.imageFileId = null; row.imageFile = null })
    assert.equal((await empty[handler]()).status, 200); assert.equal(empty.state.commands.length, 0)
    const failedDb = fixture(); failedDb.state.dbFailure = true
    assertSafeFailure(await failedDb[handler]()); assert.equal(failedDb.state.analyses.length, 2); assert.equal(failedDb.state.files.length, 2)
    assert.equal(failedDb.state.dbWrites, 0); assert.ok(failedDb.state.commands.length > 0)
    failedDb.state.dbFailure = false; assert.equal((await failedDb[handler]()).status, 200)
  }
  const none = fixture(); none.configure(false); none.state.analyses = []
  const cleared = await none.bulk(); assert.equal(cleared.status, 200); assert.equal(cleared.body.deletedCount, 0)
  console.log('PASS medical missing storage refuses real targets, empty originals remain deletable and post-storage DB failure stays retryable')
  for (const handler of ['moodDelete', 'moodPut']) for (const failure of ['throw', 'partial', 'unconfigured']) {
    const f = fixture(), original = JSON.stringify(f.state.entry)
    if (failure === 'unconfigured') f.configure(false); else f.state.failure = failure
    assertSafeFailure(await f[handler]()); assert.equal(JSON.stringify(f.state.entry), original); assert.equal(f.state.dbWrites, 0)
    if (failure === 'unconfigured') assert.equal(f.state.commands.length, 0)
    const firstKeys = f.state.commands[0] && JSON.stringify(f.state.commands[0])
    f.configure(true); f.state.failure = null
    assert.equal((await f[handler]()).status, 200)
    if (firstKeys) assert.equal(JSON.stringify(f.state.commands[1]), firstKeys)
    assert.ok(f.state.events.indexOf('storage.delete') < f.state.events.findIndex(event => event.startsWith('db.entry.')))
    if (handler === 'moodDelete') assert.equal(f.state.entry, null)
    else {
      assert.equal(f.state.entry.title, 'Updated'); assert.equal(f.state.entry.content, 'Kept notes')
      assert.equal(JSON.stringify(f.state.entry.images), JSON.stringify(f.body.images)); assert.equal(f.state.entry.audio.length, 0)
      const removed = f.state.commands.flat(); assert.ok(removed.includes('mood-journal/synthetic-owner/old.png'))
      assert.ok(!removed.includes('mood-journal/synthetic-owner/keep.png')); assert.ok(!removed.includes('mood-journal/synthetic-owner/new.png'))
      assert.ok(f.state.objects.has('mood-journal/synthetic-owner/keep.png')); assert.ok(f.state.objects.has('mood-journal/synthetic-owner/new.png'))
    }
  }
  console.log('PASS Mood PUT/DELETE cleanup failures preserve full original entry, retained/new media and retry ordering')
  {
    const f = fixture(); const keys = Array.from({ length: 105 }, (_, n) => `mood-journal/synthetic-owner/batch-${n}.png`)
    f.state.entry.images = keys; f.state.entry.audio = [keys[0]]; keys.forEach(key => f.state.objects.add(key))
    f.state.failure = 'throw'; f.state.failAtBatch = 2
    assertSafeFailure(await f.moodDelete()); assert.equal(f.state.dbWrites, 0); assert.ok(f.state.entry)
    assert.equal(f.state.commands.length, 2); assert.equal(f.state.commands[0].length, 100); assert.equal(f.state.commands[1].length, 5)
    assert.ok(!f.state.objects.has(keys[0])); assert.ok(f.state.objects.has(keys[104]))
    f.state.failure = null; assert.equal((await f.moodDelete()).status, 200)
    assert.equal(JSON.stringify(f.state.commands.slice(2)), JSON.stringify(f.state.commands.slice(0, 2)))
    assert.equal(f.state.entry, null); assert.ok(keys.every(key => !f.state.objects.has(key)))
  }
  console.log('PASS partial multi-batch Mood cleanup keeps every reference and retries identical deduplicated targets')
  for (const handler of ['moodDelete', 'moodPut']) {
    const f = fixture(), original = JSON.stringify(f.state.entry); f.state.dbFailure = true
    assertSafeFailure(await f[handler]()); assert.equal(JSON.stringify(f.state.entry), original); assert.equal(f.state.dbWrites, 0)
    const firstKeys = JSON.stringify(f.state.commands[0]); f.state.dbFailure = false
    assert.equal((await f[handler]()).status, 200); assert.equal(JSON.stringify(f.state.commands[1]), firstKeys)
  }
  console.log('PASS Mood post-storage DB failures return a truthful error and retain references for idempotent retry')
  {
    const f = fixture(); f.configure(false); f.state.entry.images = ['data:image/png;base64,synthetic', 'https://other.example.test/file.png']; f.state.entry.audio = ['blob:synthetic-local']
    assert.equal((await f.moodPut({ ...f.body, images: f.state.entry.images, audio: f.state.entry.audio })).status, 200)
    assert.equal((await f.moodDelete()).status, 200); assert.equal(f.state.commands.length, 0)
    const kept = fixture(); kept.configure(false)
    assert.equal((await kept.moodPut({ ...kept.body, images: kept.state.entry.images, audio: kept.state.entry.audio })).status, 200)
    assert.equal(kept.state.commands.length, 0, 'retaining originals or adding media needs no cleanup call')
  }
  console.log('PASS no-original/local/external media and retained originals do not require configured storage for unrelated edits')
  {
    const f = fixture()
    f.state.entry.images = [`/api/blob?path=${encodeURIComponent('mood-journal/synthetic-owner/scoped.png')}&token=synthetic`, 'food-photos/foreign.png']
    f.state.entry.audio = ['https://synthetic-bucket.s3.ap-southeast-2.amazonaws.com/mood-journal/synthetic-owner/audio.m4a']
    assert.equal((await f.moodDelete()).status, 200)
    assert.equal(JSON.stringify(f.state.commands.flat()), JSON.stringify(['mood-journal/synthetic-owner/scoped.png', 'mood-journal/synthetic-owner/audio.m4a']))
  }
  console.log('PASS actual scoped-path normalization removes only owned Mood-scope originals, not unrelated/local references')
  for (const handler of ['single', 'bulk', 'moodDelete', 'moodPut']) {
    const f = fixture(); f.state.session = null
    const result = await f[handler](); assert.equal(result.status, handler.startsWith('mood') ? 404 : 401)
    assert.equal(f.state.commands.length, 0); assert.equal(f.state.dbWrites, 0)
  }
  for (const handler of ['single', 'moodDelete', 'moodPut']) {
    const f = fixture(); f.state.analyses = []; f.state.entry = null
    assert.equal((await f[handler]()).status, 404); assert.equal(f.state.commands.length, 0); assert.equal(f.state.dbWrites, 0)
  }
  const invalid = fixture(); assert.equal((await invalid.moodPut({})).status, 400)
  assert.equal(invalid.state.commands.length, 0); assert.equal(invalid.state.dbWrites, 0)
  console.log('PASS unchanged ordinary authentication, missing-entry and empty-content validation precede storage/database writes')
  {
    const f = fixture(), newPath = 'medical-images/synthetic-owner/new-arrival.png'
    const arriving = { id: 'analysis-new', userId: 'synthetic-owner', imageFileId: 'file-new', imageFile: { cloudinaryId: newPath, secureUrl: '' } }
    f.state.afterStorage = () => {
      f.state.analyses.push(arriving); f.state.files.push('file-new'); f.state.objects.add(newPath)
      f.state.events.push('upload.arrived')
    }
    const result = await f.bulk()
    assert.equal(result.status, 200); assert.equal(result.body.success, true); assert.equal(result.body.deletedCount, 2)
    assert.equal(JSON.stringify(f.state.analyses), JSON.stringify([arriving]), 'a new analysis arriving during storage cleanup was not selected for deletion')
    assert.equal(JSON.stringify(f.state.files), JSON.stringify(['file-new'])); assert.ok(f.state.objects.has(newPath))
    assert.ok(!f.state.commands.flat().includes(newPath))
    assert.ok(f.state.events.indexOf('storage.delete') < f.state.events.indexOf('upload.arrived'))
    assert.ok(f.state.events.indexOf('upload.arrived') < f.state.events.indexOf('db.analysis.delete'))
  }
  console.log('PASS clearing image history deletes only selected owned analyses, preserving a new upload arriving during cleanup')
  await checkSerializedMoodMedia()
  await checkStorageAbortContract()
  await checkRetryBackoffAndLateResults()
  await checkLockWaitDeadlineWithoutMedia()
}
main().catch(error => { console.error(error); process.exitCode = 1 })


async function checkSerializedMoodMedia() {
  const a = 'mood-journal/synthetic-owner/old.png', b = 'mood-journal/synthetic-owner/keep.png', added = 'mood-journal/synthetic-owner/new.png'
  const gate = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
  const turn = () => new Promise(resolve => setImmediate(resolve))
  const first = fixture(); first.state.entry.audio = []
  const read = gate(), resume = gate(); first.state.afterStorage = async () => { read.resolve(); await resume.promise }
  const saving = first.moodPut({ ...first.body, images: [b], audio: [] }); await read.promise
  const stale = first.moodPut({ ...first.body, images: [a], audio: [] }); await turn()
  assert.equal(first.state.waitingLocks, 1, 'second PUT must wait before reading/deleting a same-entry media snapshot')
  assert.equal(first.state.commands.length, 1); assert.equal(first.state.dbWrites, 0)
  resume.resolve(); assert.equal((await saving).status, 200); assertSafeFailure(await stale)
  assert.equal(JSON.stringify(first.state.entry.images), JSON.stringify([b])); assert.ok(first.state.objects.has(b)); assert.equal(first.state.objects.has(a), false)
  assert.equal(first.state.commands.length, 1, 'stale retained A must be checked before removing the currently retained B')
  assert.equal(first.state.dbWrites, 1); assert.equal(JSON.stringify(first.state.headCommands), JSON.stringify([a]))
  console.log('PASS two PUTs serialize through storage/write; old-client stale retained media cannot resurrect a deleted attachment')

  const sequential = fixture(); sequential.state.entry.audio = []
  assert.equal((await sequential.moodPut({ ...sequential.body, images: [b], audio: [] })).status, 200)
  const deletes = sequential.state.commands.length
  assertSafeFailure(await sequential.moodPut({ ...sequential.body, images: [a], audio: [] }))
  assert.equal(sequential.state.commands.length, deletes); assert.equal(JSON.stringify(sequential.state.entry.images), JSON.stringify([b]))
  assert.ok(sequential.state.objects.has(b))
  const ordinary = await sequential.moodPut({ ...sequential.body, images: [b, added], audio: [] })
  assert.equal(ordinary.status, 200); assert.ok(sequential.state.objects.has(added)); assert.ok(sequential.state.objects.has(b))
  assert.equal(JSON.stringify(sequential.state.entry.images), JSON.stringify([b, added]))
  console.log('PASS stale legacy forms are refused after another completed save; extant newly introduced owned media still saves without a version field')

  const deleteFirst = fixture(); deleteFirst.state.entry.audio = []
  const deletionRead = gate(), deletionResume = gate(); deleteFirst.state.afterStorage = async () => { deletionRead.resolve(); await deletionResume.promise }
  const deleting = deleteFirst.moodDelete(); await deletionRead.promise
  const laterPut = deleteFirst.moodPut({ ...deleteFirst.body, images: [added], audio: [] }); await turn()
  assert.equal(deleteFirst.state.waitingLocks, 1); assert.equal(deleteFirst.state.dbWrites, 0)
  deletionResume.resolve(); assert.equal((await deleting).status, 200); assert.equal((await laterPut).status, 404)
  assert.equal(deleteFirst.state.entry, null); assert.equal(deleteFirst.state.dbWrites, 1)
  const putFirst = fixture(); putFirst.state.entry.audio = []
  const saveRead = gate(), saveResume = gate(); putFirst.state.afterStorage = async () => { saveRead.resolve(); await saveResume.promise }
  const earlierPut = putFirst.moodPut({ ...putFirst.body, images: [added], audio: [] }); await saveRead.promise
  const laterDelete = putFirst.moodDelete(); await turn(); assert.equal(putFirst.state.waitingLocks, 1)
  saveResume.resolve(); assert.equal((await earlierPut).status, 200); assert.equal((await laterDelete).status, 200)
  assert.equal(putFirst.state.entry, null); assert.equal(putFirst.state.objects.has(added), false)
  assert.equal(putFirst.state.dbWrites, 2)
  console.log('PASS PUT/DELETE both lock orders use a fresh media snapshot: completed new media is deleted; a save after deletion gets404')

  for (const variant of ['missing', 'provider', 'foreign']) {
    const f = fixture(), before = JSON.stringify(f.state.entry)
    const path = variant === 'foreign' ? 'mood-journal/someone-else/nonexistent.png' : added
    if (variant === 'missing') f.state.objects.delete(path)
    if (variant === 'provider') f.state.headFailure = true
    assertSafeFailure(await f.moodPut({ ...f.body, images: [path], audio: [] }))
    assert.equal(f.state.commands.length, 0); assert.equal(f.state.dbWrites, 0); assert.equal(JSON.stringify(f.state.entry), before)
    if (variant === 'foreign') assert.equal((f.state.headCommands || []).length, 0)
  }
  const retained = fixture(), legacy = 'mood-journal/legacy-format/retained.png'
  retained.state.entry.images = [legacy]; retained.state.entry.audio = []; retained.configure(false)
  assert.equal((await retained.moodPut({ ...retained.body, images: [legacy], audio: [] })).status, 200)
  assert.equal((retained.state.headCommands || []).length, 0); assert.equal(retained.state.commands.length, 0)
  console.log('PASS missing/unreadable/foreign newly introduced media is rejected before deletion; already-retained legacy paths keep existing behavior')

  const expired = fixture(), previous = JSON.stringify(expired.state.entry); expired.state.expireAfterHead = true
  assertSafeFailure(await expired.moodPut())
  assert.equal(expired.state.commands.length, 0); assert.equal(expired.state.dbWrites, 0); assert.equal(JSON.stringify(expired.state.entry), previous)
  expired.state.txExpired = false; expired.state.expireAfterHead = false
  assert.equal((await expired.moodPut()).status, 200)
  const commit = fixture(), initial = JSON.stringify(commit.state.entry); commit.state.commitFailure = true
  assertSafeFailure(await commit.moodPut())
  assert.equal(JSON.stringify(commit.state.entry), initial, 'failed commit rolls back metadata but cannot recreate deleted bytes')
  assert.ok(commit.state.commands.length > 0); commit.state.commitFailure = false
  assert.equal((await commit.moodPut()).status, 200)
  console.log('PASS expired transaction cannot start deletion after metadata lookup; failed post-storage commit retains retryable metadata without pretending to restore bytes')
}


async function checkStorageAbortContract() {
  const turn = () => new Promise(resolve => setImmediate(resolve))
  for (const phase of ['head', 'delete']) {
    const f = fixture(), before = JSON.stringify(f.state.entry)
    if (phase === 'head') f.state.hangHeads = true; else f.state.hangDeletes = true
    const running = f.moodPut()
    for (let i = 0; !f.state.pendingTransports && i < 10; i++) await turn()
    assert.equal(f.state.pendingTransports, 1); assert.equal(f.state.deadlineMs, 10000)
    const deadline = f.state.storageDeadline; assert.equal(typeof deadline, 'function'); deadline()
    assertSafeFailure(await running)
    assert.equal(f.state.pendingTransports, 0); assert.equal(f.state.dbWrites, 0); assert.equal(JSON.stringify(f.state.entry), before)
    assert.ok(f.state.events.indexOf('transport.' + phase + '.aborted') < f.state.events.indexOf('tx.row.unlock'), 'abort-aware transport must settle before the transaction releases its row lock')
    assert.equal(f.state.storageDeadline, null, 'all exits clear the deadline')
    if (phase === 'head') assert.equal(f.state.commands.length, 0)
    f.state.hangHeads = false; f.state.hangDeletes = false
    assert.equal((await f.moodPut()).status, 200); assert.equal(f.state.storageDeadline, null)
  }
  const bounded = fixture(); bounded.state.hangHeads = true
  const images = Array.from({ length: 12 }, (_, n) => 'mood-journal/synthetic-owner/new-image-' + n + '.png')
  const audio = Array.from({ length: 12 }, (_, n) => 'mood-journal/synthetic-owner/new-audio-' + n + '.m4a')
  for (const key of [...images, ...audio]) bounded.state.objects.add(key)
  const checking = bounded.moodPut({ ...bounded.body, images, audio })
  for (let i = 0; bounded.state.pendingTransports !== 4 && i < 10; i++) await turn()
  assert.equal(bounded.state.pendingTransports, 4); assert.equal(bounded.state.headCommands.length, 4, 'metadata concurrency is bounded to four')
  bounded.state.storageDeadline(); assertSafeFailure(await checking)
  assert.equal(bounded.state.headCommands.length, 4, 'deadline must not start queued metadata batches')
  assert.equal(bounded.state.pendingTransports, 0); assert.equal(bounded.state.commands.length, 0); assert.equal(bounded.state.dbWrites, 0)
  console.log('PASS abort-aware active HTTP fixtures stop before row unlock; metadata concurrency stays bounded and queued batches stop')

  for (const provider of ['aws-s3', 'vercel-blob']) for (const operation of ['head', 'del']) {
    const controller = new AbortController(); let started, count = 0, aborted = false
    const reached = new Promise(resolve => { started = resolve })
    const hold = async options => {
      count++; assert.equal(options.abortSignal, controller.signal); started()
      await new Promise((resolve, reject) => {
        const abort = () => { aborted = true; reject(Error('Synthetic request aborted')) }
        if (options.abortSignal.aborted) abort(); else options.abortSignal.addEventListener('abort', abort, { once: true })
      })
    }
    class Command { constructor(input) { this.input = input } }
    const aws = Object.fromEntries(['DeleteObjectsCommand', 'GetObjectCommand', 'HeadObjectCommand', 'ListObjectsV2Command', 'PutObjectCommand'].map(name => [name, Command]))
    aws.S3Client = class { async send(_command, options) { return hold(options) } }
    const storage = load('lib/object-storage.ts', {
      '@aws-sdk/client-s3': aws, '@aws-sdk/s3-request-presigner': {},
      '@vercel/blob': { head: (_key, options) => hold(options), del: (_key, options) => hold(options) }, crypto: {},
    }, { process: { env: { OBJECT_STORAGE_PROVIDER: provider, HELFI_AWS_S3_BUCKET: 'synthetic', HELFI_AWS_S3_REGION: 'synthetic', BLOB_READ_WRITE_TOKEN: 'synthetic-not-a-credential' } } })
    const running = storage[operation]('mood-journal/synthetic-owner/file', { abortSignal: controller.signal })
    await reached; controller.abort(); await assert.rejects(running, /aborted/)
    assert.equal(aborted, true); assert.equal(count, 1)
    await assert.rejects(storage[operation]('mood-journal/synthetic-owner/file', { abortSignal: controller.signal }))
    assert.equal(count, 1, 'pre-aborted request must not reach either provider')
  }
  console.log('PASS actual storage head/del forward AbortSignal to BOTH supported providers and reject pre-aborted operations without transport')
}


async function checkRetryBackoffAndLateResults() {
  const turn = () => new Promise(resolve => setImmediate(resolve))
  for (const phase of ['head', 'delete']) for (const lateReject of [false, true]) {
    const f = fixture(), original = JSON.stringify(f.state.entry)
    f.state.sdkBackoff = phase; f.state.lateReject = lateReject
    const running = f.moodPut()
    for (let i = 0; !f.state.sdkPending && i < 10; i++) await turn()
    assert.equal(f.state.sdkPending, 1); assert.equal(f.state.freshHttp, 1)
    assert.ok(f.state.clientOptions.every(options => options.maxAttempts === 1), 'signal-bound AWS calls must disable retry sleeps')
    f.state.storageDeadline(); const response = await running; assertSafeFailure(response)
    assert.equal(f.state.sdkPending, 1, 'SDK backoff may remain pending; the caller must already have returned safely')
    assert.equal(f.state.dbWrites, 0); assert.equal(JSON.stringify(f.state.entry), original)
    assert.ok(f.state.events.indexOf('transport.backoff.http-aborted') < f.state.events.indexOf('tx.row.unlock'))
    f.state.releaseSdk(); await turn()
    assert.equal(f.state.blockedRetries, 1); assert.equal(f.state.freshHttp, 1, 'aborted retry must not send fresh HTTP')
    assert.equal(f.state.dbWrites, 0); assert.equal(JSON.stringify(f.state.entry), original, 'late SDK result/rejection must not publish an application write')
  }
  for (const provider of ['aws-s3', 'vercel-blob']) for (const operation of ['head', 'del']) for (const lateReject of [false, true]) {
    const controller = new AbortController(); let entered, release, freshHttp = 0, blockedRetry = 0, httpAborted = false, published = false
    const reached = new Promise(resolve => { entered = resolve })
    const listeners = new Set(), add = controller.signal.addEventListener.bind(controller.signal), remove = controller.signal.removeEventListener.bind(controller.signal)
    controller.signal.addEventListener = (type, fn, options) => { if (type === 'abort') listeners.add(fn); return add(type, fn, options) }
    controller.signal.removeEventListener = (type, fn, options) => { if (type === 'abort') listeners.delete(fn); return remove(type, fn, options) }
    const sdk = options => {
      assert.equal(options.abortSignal, controller.signal); freshHttp++; entered()
      return new Promise((resolve, reject) => {
        const abort = () => { httpAborted = true; controller.signal.removeEventListener('abort', abort) }
        controller.signal.addEventListener('abort', abort, { once: true })
        release = () => {
          controller.signal.removeEventListener('abort', abort)
          if (controller.signal.aborted) blockedRetry++; else freshHttp++
          if (lateReject) reject(Error('Synthetic delayed SDK error')); else resolve({ ContentLength: 1 })
        }
      })
    }
    class Command { constructor(input) { this.input = input } }
    const aws = Object.fromEntries(['DeleteObjectsCommand', 'GetObjectCommand', 'HeadObjectCommand', 'ListObjectsV2Command', 'PutObjectCommand'].map(name => [name, Command]))
    aws.S3Client = class { constructor(options) { assert.equal(options.maxAttempts, 1) } async send(_command, options) { return sdk(options) } }
    const storage = load('lib/object-storage.ts', {
      '@aws-sdk/client-s3': aws, '@aws-sdk/s3-request-presigner': {}, crypto: {},
      '@vercel/blob': { head: (_key, options) => sdk(options), del: (_key, options) => sdk(options) },
    }, { process: { env: { OBJECT_STORAGE_PROVIDER: provider, HELFI_AWS_S3_BUCKET: 'synthetic', HELFI_AWS_S3_REGION: 'synthetic', BLOB_READ_WRITE_TOKEN: 'synthetic-not-a-credential' } } })
    const running = storage[operation]('mood-journal/synthetic-owner/file', { abortSignal: controller.signal }).then(() => { published = true })
    await reached; controller.abort(); await assert.rejects(running)
    assert.equal(httpAborted, true); assert.equal(listeners.size, 0, 'wrapper and transport remove their abort listeners')
    release(); await turn()
    assert.equal(blockedRetry, 1); assert.equal(freshHttp, 1); assert.equal(published, false)
  }
  console.log('PASS actual abort-bound wrapper returns before SDK retry sleeps, cancels HTTP on both providers, blocks fresh aborted retries, removes listeners and consumes late outcomes without writes')
}


async function checkLockWaitDeadlineWithoutMedia() {
  for (const handler of ['moodPut', 'moodDelete']) {
    const f = fixture(); f.state.entry.images = []; f.state.entry.audio = []
    const before = JSON.stringify(f.state.entry); let release
    f.state.lockWait = new Promise(resolve => { release = resolve })
    const running = handler === 'moodPut' ? f.moodPut({ ...f.body, images: [], audio: [] }) : f.moodDelete()
    for (let i = 0; !f.state.waitingLocks && i < 10; i++) await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.state.waitingLocks, 1); assert.equal(typeof f.state.storageDeadline, 'function')
    f.state.storageDeadline(); release(); assertSafeFailure(await running)
    assert.equal(f.state.dbWrites, 0); assert.equal(JSON.stringify(f.state.entry), before)
    assert.equal(f.state.commands.length, 0); assert.equal((f.state.headCommands || []).length, 0)
    assert.equal(f.state.storageDeadline, null)
  }
  const retained = fixture(), key = 'mood-journal/synthetic-owner/keep.png'
  retained.state.entry.images = [key]; retained.state.entry.audio = []; retained.configure(false)
  const signed = '/api/blob?path=' + encodeURIComponent(key) + '&token=synthetic'
  assert.equal((await retained.moodPut({ ...retained.body, images: [signed], audio: [] })).status, 200)
  assert.equal(JSON.stringify(retained.state.entry.images), JSON.stringify([key]))
  assert.equal(retained.state.commands.length, 0); assert.equal((retained.state.headCommands || []).length, 0)
  console.log('PASS deadline during row-lock wait prevents no-media PUT/DELETE writes; retained signed URLs normalize exactly as before without a storage requirement')
}
