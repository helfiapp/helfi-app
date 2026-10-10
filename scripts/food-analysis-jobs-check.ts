import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'

// Execute the real job, wallet and endpoint functions with an in-memory
// transactional database and recorded model responses. No app credentials,
// real account, network, live AI request or database mutation is used.
const priorAuthSecret = process.env.AUTH_SECRET
const priorNextAuthSecret = process.env.NEXTAUTH_SECRET
delete process.env.NEXTAUTH_SECRET
process.env.AUTH_SECRET = 'offline-food-job-test-secret-that-is-not-a-real-credential'
type Row = Record<string, any>
let jobs = new Map<string, Row>()
let users = new Map<string, Row>()
let events: Row[] = []
let topUps: Row[] = []
let consent = true
let transactionTail = Promise.resolve()
let failUsage = false
let failCommitAcknowledgement = false
let starts = 0
let retrieves = 0
let mode: 'pending' | 'completed' | 'failed' | 'transport' | 'uncertain' = 'pending'
const clone = <T>(value: T): T => structuredClone(value)
function matches(row: Row, where: Row): boolean {
  return Object.entries(where || {}).every(([key, value]) => {
    if (key === 'OR') return value.some((condition: Row) => matches(row, condition))
    if (key === 'AND') return value.every((condition: Row) => matches(row, condition))
    if (key === 'userId_requestId') return matches(row, value)
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.entries(value).every(([op, expected]) => op === 'in' ? (expected as any[]).includes(row[key])
        : op === 'gt' ? row[key] > expected! : op === 'gte' ? row[key] >= expected! : op === 'lte' ? row[key] <= expected! : false)
    }
    return row[key] === value
  })
}
function update(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    row[key] = value && typeof value === 'object' && !(value instanceof Date) && ('increment' in value || 'decrement' in value)
      ? Number(row[key] || 0) + Number(value.increment || 0) - Number(value.decrement || 0) : value
  }
}
const db: any = {
  $executeRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
    const sql = strings.join('?')
    if (sql.startsWith('UPDATE "User" SET "freeFood')) {
      const field = sql.includes('"freeFoodReanalysisRemaining"') ? 'freeFoodReanalysisRemaining' : 'freeFoodAnalysisRemaining'
      const row = users.get(values[0])
      if (!row || row[field] <= 0) return 0
      row[field]--; return 1
    }
    return 1
  },
  foodAnalysisJob: {
    findUnique: async ({ where }: any) => clone([...jobs.values()].find(row => matches(row, where)) || null),
    findFirst: async ({ where }: any) => clone([...jobs.values()].find(row => matches(row, where)) || null),
    count: async ({ where }: any) => [...jobs.values()].filter(row => matches(row, where)).length,
    create: async ({ data }: any) => {
      const row = { createdAt: new Date(), leaseOwner: null, leaseUntil: null, settledAt: null, errorCode: null, errorStatus: null, ...data }
      jobs.set(row.id, row); return clone(row)
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0
      for (const row of jobs.values()) if (matches(row, where)) { update(row, data); count++ }
      return { count }
    },
    update: async ({ where, data }: any) => { const row = jobs.get(where.id)!; update(row, data); return clone(row) },
  },
  user: {
    findUnique: async ({ where }: any) => clone(users.get(where.id) || null),
    update: async ({ where, data }: any) => { const row = users.get(where.id)!; update(row, data); return clone(row) },
    updateMany: async ({ where, data }: any) => {
      let count = 0
      for (const row of users.values()) if (matches(row, where)) { update(row, data); count++ }
      return { count }
    },
  },
  creditTopUp: {
    findMany: async ({ where }: any) => clone(topUps.filter(row => matches(row, where)).sort((a, b) => +a.expiresAt - +b.expiresAt)),
    update: async ({ where, data }: any) => { const row = topUps.find(row => row.id === where.id)!; update(row, data); return clone(row) },
  },
  aiDataSharingConsent: { findUnique: async () => ({ granted: consent, version: 'test-version' }) },
  aIUsageEvent: { create: async ({ data }: any) => { if (failUsage) throw new Error('offline usage failure'); events.push(clone(data)); return data } },
}
db.$transaction = async (work: (tx: any) => Promise<any>) => {
  const prior = transactionTail
  let release!: () => void
  transactionTail = new Promise(resolve => { release = resolve })
  await prior
  const backup = { jobs: clone(jobs), users: clone(users), events: clone(events), topUps: clone(topUps) }
  let result
  try { result = await work(db) }
  catch (error) { jobs = backup.jobs; users = backup.users; events = backup.events; topUps = backup.topUps; throw error }
  finally { release() }
  if (failCommitAcknowledgement) { failCommitAcknowledgement = false; throw new Error('offline lost commit acknowledgement') }
  return result
}
class BackgroundError extends Error { constructor(public code: string, public status = 503) { super(code); Object.setPrototypeOf(this, BackgroundError.prototype) } }
const recordedCompletion = { completion: { choices: [{ message: { content: 'Recorded completed food output' } }] }, costCents: 3, promptTokens: 100, completionTokens: 200 }
const adapter = {
  FoodPhotoBackgroundError: BackgroundError,
  startFoodBackgroundCompletion: async (_openai: any, _params: any, context: any) => {
    starts++
    assert.match(context.runId, /^[A-Za-z0-9:_-]+$/)
    assert.ok(!context.runId.includes('example'))
    if (mode === 'uncertain') throw new BackgroundError('food_background_start_uncertain')
    return { responseId: 'resp_offline_' + starts }
  },
  retrieveFoodBackgroundCompletion: async () => {
    retrieves++
    if (mode === 'transport') throw new BackgroundError('food_background_retrieve_uncertain')
    if (mode === 'failed') return { status: 'failed', error: 'food_background_incomplete' }
    return mode === 'completed' ? { status: 'completed', result: clone(recordedCompletion) } : { status: 'pending' }
  },
}
function load(file: string, mocks: Record<string, any>): any {
  const result: any = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  const context = { exports: result.exports, module: result, require: (name: string) => {
    if (name === 'crypto') return crypto
    if (!(name in mocks)) throw new Error('Unexpected module ' + name)
    return mocks[name]
  }, Buffer, Date, Blob, FormData, Set, process, console }
  vm.runInNewContext(code, context, { filename: file })
  return result.exports
}
const wallet = load('lib/credit-system.ts', { '@/lib/prisma': { prisma: db }, '@/lib/subscription-utils': { isSubscriptionActive: () => false } })
const jobApi = load('lib/food-analysis-jobs.ts', { 'server-only': {}, '@/lib/prisma': { prisma: db }, '@/lib/credit-system': wallet, '@/lib/ai-consent-text': { AI_SHARING_CONSENT_VERSION: 'test-version' }, '@/lib/food-photo-background': adapter })
const writeGuard = load('lib/write-guard.ts', {})
const writeMiddleware = load('lib/prisma-write-guard.ts', { './write-guard': writeGuard })
const userId = 'offline-user-a'
function reset() {
  jobs.clear(); users.clear(); events = []; topUps = []; starts = 0; retrieves = 0; consent = true; failUsage = false; mode = 'pending'
  users.set(userId, { id: userId, additionalCredits: 100, walletMonthlyUsedCents: 0, walletMonthlyResetAt: new Date(), subscription: null, freeFoodAnalysisRemaining: 1, freeFoodReanalysisRemaining: 1, dailyFoodAnalysisUsed: 0, monthlyFoodAnalysisUsed: 0, totalFoodAnalysisCount: 0, totalAnalysisCount: 0 })
}
const input = { fields: { forceFresh: '1', analysisHint: 'small visible bowl' }, image: Buffer.from('offline-private-photo').toString('base64'), name: 'private-photo.jpg', mime: 'image/jpeg' }
const params = { model: 'gpt-6.1-sol', messages: [{ role: 'user', content: 'offline-only prompt' }], max_completion_tokens: 6144 }
const nutrients = { calories: 120, protein_g: 4, carbs_g: 12, fat_g: 6, fiber_g: null, sugar_g: 0 }
const result = { success: true, analysis: 'Recorded photo nutrition.', analysisId: 'food-offline-ready', items: [{ name: 'visible food', servings: 1, ...nutrients, nutritionCoversServing: true }], total: nutrients }
const usage = [{ feature: 'food:image-analysis', model: 'gpt-6.1-sol', promptTokens: 100, completionTokens: 200, costCents: 3, image: { width: 500, height: 500, bytes: 1000, mime: 'image/jpeg' } }, { feature: 'food:analysis', model: 'gpt-6.1-sol', promptTokens: 100, completionTokens: 200, costCents: 3 }]
async function newJob(requestId = crypto.randomUUID()) { return jobApi.createFoodJob(userId, requestId, input) }
async function acquire(id: string) { const job = await jobApi.ownedFoodJob(userId, id); const execution = await jobApi.FoodJobExecution.acquire(job); assert.ok(execution); return execution }
async function pending(work: Promise<any>) { await assert.rejects(work, (error: any) => error instanceof jobApi.FoodJobPending) }

async function main() {
  reset()
  const requestId = crypto.randomUUID()
  const duplicateJobs = await Promise.all(Array.from({ length: 10 }, () => newJob(requestId)))
  assert.equal(jobs.size, 1, 'simultaneous retry POSTs create one durable job')
  const job = duplicateJobs[0]
  assert.ok(!job.encryptedState.includes('private-photo') && !job.encryptedState.includes('small visible bowl'))
  await assert.rejects(jobApi.createFoodJob(userId, requestId, { ...input, fields: { analysisHint: 'different input' } }), (error: any) => error.code === 'food_job_request_conflict')
  assert.equal(await jobApi.ownedFoodJob('offline-other-user', job.id), null, 'another account cannot read/poll the job')
  assert.equal(await jobApi.ownedFoodJob(userId, '../../not-a-job'), null)
  assert.throws(() => jobApi.decryptFoodJobState({ ...job, userId: 'offline-other-user' }), /food_job_state_unavailable/, 'ciphertext is bound to account and job')
  assert.throws(() => jobApi.decryptFoodJobState({ ...job, id: crypto.randomUUID() }), /food_job_state_unavailable/)
  assert.throws(() => jobApi.validatedFoodRequestId('too-short'), /food_job_invalid_request_id/)
  assert.equal(jobApi.validFoodJobResult(result), true)
  assert.equal(jobApi.validFoodJobResult({ ...result, total: { ...nutrients, calories: null } }), false, 'unknown core values cannot be billed as a complete result')
  assert.equal(jobApi.validFoodJobResult({ ...result, items: [] }), false)
  assert.equal(jobApi.validFoodJobResult({ ...result, total: { ...nutrients, fat_g: 0 } }), true, 'known zero stays valid')
  const first = await acquire(job.id)
  assert.equal(await jobApi.FoodJobExecution.acquire(await jobApi.ownedFoodJob(userId, job.id)), null, 'only one request holds a job lease')
  await pending(first.completion({}, params, 'food:photo-analysis'))
  assert.equal(starts, 1)
  assert.equal(events.length, 0)
  assert.equal(users.get(userId)!.additionalCredits, 100)
  await first.release()
  for (let i = 0; i < 3; i++) { const waiting = await acquire(job.id); await pending(waiting.pollPendingStage({})); await waiting.release() }
  assert.equal(starts, 1, 'pending polling never repeats model generation')
  mode = 'transport'
  const transient = await acquire(job.id); await pending(transient.pollPendingStage({})); await transient.release()
  mode = 'completed'
  const retrieved = await acquire(job.id); await pending(retrieved.pollPendingStage({})); await retrieved.release()
  const resumed = await acquire(job.id)
  assert.equal(JSON.stringify(await resumed.completion({}, params, 'food:photo-analysis')), JSON.stringify(recordedCompletion))
  assert.equal(starts, 1, 'completed stages resume from server state')
  await resumed.prepare(result, false, false, usage)
  // Many retried settlement calls run through the actual wallet implementation.
  const finalized = await Promise.all(Array.from({ length: 15 }, () => jobApi.settleFoodJob(resumed.job, resumed.leaseOwner)))
  assert.equal(users.get(userId)!.additionalCredits, 90)
  assert.equal(users.get(userId)!.monthlyFoodAnalysisUsed, 1)
  assert.equal(users.get(userId)!.totalAnalysisCount, 1)

  assert.equal(events.length, 2)
  assert.ok(finalized.every(row => row.jobId === job.id))
  const completed = await jobApi.ownedFoodJob(userId, job.id)
  const completedState = jobApi.decryptFoodJobState(completed)
  assert.equal(completedState.input, undefined, 'completed storage removes the photo')
  assert.equal(completedState.context, undefined, 'completed storage removes health context')
  assert.equal(completedState.stages.length, 0, 'completed storage removes provider response IDs')
  assert.equal(completedState.result.items[0].nutritionCoversServing, true)


  // Poll B may have fetched its row before poll A checkpoints and releases.
  // Acquiring the lease must reread that checkpoint, rather than resurrecting
  // B's stale empty stage array and issuing the same provider request again.
  reset()
  const checkpointJob = await newJob()
  const beforeCheckpoint = await jobApi.ownedFoodJob(userId, checkpointJob.id)
  const checkpointWriter = await acquire(checkpointJob.id)
  await pending(checkpointWriter.completion({}, params, 'food:photo-analysis'))
  await checkpointWriter.release()
  const checkpointReader = await jobApi.FoodJobExecution.acquire(beforeCheckpoint)
  assert.ok(checkpointReader)
  assert.equal(checkpointReader.state.stages.length, 1, 'a stale fetched row must observe the newly persisted provider stage after claiming its lease')
  assert.equal(checkpointReader.state.stages[0].status, 'pending')
  await pending(checkpointReader.completion({}, params, 'food:photo-analysis'))
  assert.equal(starts, 1, 'stale-row acquisition cannot submit a second provider generation')
  mode = 'completed'
  await pending(checkpointReader.pollPendingStage({}))
  await checkpointReader.release()

  // The same race at the prepared-result boundary must retain both the ready
  // result and its saved billing decision, with no replay of the AI pipeline.
  const beforePreparation = await jobApi.ownedFoodJob(userId, checkpointJob.id)
  const preparationWriter = await acquire(checkpointJob.id)
  await preparationWriter.prepare(result, false, false, usage)
  await preparationWriter.release()
  const preparationReader = await jobApi.FoodJobExecution.acquire(beforePreparation)
  assert.ok(preparationReader)
  assert.equal(preparationReader.job.status, 'prepared', 'the acquired job metadata must come from the fresh leased row')
  assert.equal(preparationReader.state.prepared.result.jobId, checkpointJob.id, 'stale-row acquisition must preserve the ready result')
  const checkpointFinal = await preparationReader.settle()
  assert.equal(checkpointFinal.jobId, checkpointJob.id)
  assert.equal(starts, 1)
  assert.equal(users.get(userId)!.additionalCredits, 90)
  assert.equal(users.get(userId)!.totalAnalysisCount, 1)

  // Reproduce the actual middleware suppression rather than assume a generic
  // mock behaves like production. Its read guard records even updateMany, and
  // the capitalized model lookup falls back to count:0 on the second call.
  reset()
  users.get(userId)!.freeFoodAnalysisRemaining = 2
  const guardRows = new Map<string, Row>()
  let middleware!: (params: any, next: any) => Promise<any>
  const guardedPrisma: any = {
    $use: (fn: any) => { middleware = fn },
    $executeRawUnsafe: async () => 0,
    $queryRawUnsafe: async (sql: string, ...values: any[]) => {
      if (sql.startsWith('SELECT')) return clone(guardRows.has(values[0] + ':' + values[1]) ? [guardRows.get(values[0] + ':' + values[1])] : [])
      if (sql.includes('INSERT INTO WriteGuard')) {
        guardRows.set(values[1] + ':' + values[2], { id: values[0], payloadHash: values[3], lastSeenAt: new Date(), hitCount: 1, lastRecordId: values[4] || null }); return []
      }
      if (sql.includes('UPDATE WriteGuard')) {
        const id = values[values.length - 1]
        const row = [...guardRows.values()].find(row => row.id === id)
        if (row) { row.lastSeenAt = new Date(); row.hitCount++; if (sql.includes('payloadHash = $1')) row.payloadHash = values[0] }
      }
      return []
    },
  }
  writeMiddleware.attachWriteGuard(guardedPrisma)
  const guardedArgs = { where: { id: userId, freeFoodAnalysisRemaining: { gt: 0 } }, data: { freeFoodAnalysisRemaining: { decrement: 1 } } }
  assert.equal((await middleware({ model: 'User', action: 'updateMany', args: guardedArgs }, () => db.user.updateMany(guardedArgs))).count, 1)
  assert.equal((await middleware({ model: 'User', action: 'updateMany', args: guardedArgs }, () => db.user.updateMany(guardedArgs))).count, 0, 'real middleware suppresses a distinct second free-use payload')
  assert.equal(users.get(userId)!.freeFoodAnalysisRemaining, 1)
  users.get(userId)!.freeFoodAnalysisRemaining = 2
  const twoA = await newJob(); const twoB = await newJob()
  const secondA = await acquire(twoA.id); const secondB = await acquire(twoB.id)
  await secondA.prepare(result, true, false, usage); await secondB.prepare(result, true, false, usage)
  const bothFree = await Promise.all([secondA.settle(), secondB.settle()])
  assert.equal(bothFree.length, 2, 'static locked free-use SQL admits both distinct jobs without middleware suppression')
  assert.equal(users.get(userId)!.freeFoodAnalysisRemaining, 0)
  assert.equal(users.get(userId)!.totalAnalysisCount, 2)
  assert.equal(users.get(userId)!.additionalCredits, 100)

  reset()
  const staleJob = await newJob(); const stale = await acquire(staleJob.id)
  jobs.get(staleJob.id)!.leaseUntil = new Date(Date.now() - 1)
  const successor = await acquire(staleJob.id)
  await pending(stale.prepare(result, false, false, usage))
  assert.equal(users.get(userId)!.additionalCredits, 100, 'a stale request cannot prepare or charge after lease takeover')
  await successor.prepare(result, false, false, usage)
  successor.startedAt = Date.now() - 17_000
  await pending(successor.settle())
  assert.equal((await jobApi.ownedFoodJob(userId, staleJob.id)).status, 'prepared', 'ready result survives a short-request handoff before billing')
  await successor.release()
  const finalShortRequest = await acquire(staleJob.id); await finalShortRequest.settle()
  assert.equal(users.get(userId)!.additionalCredits, 90)

  reset()
  mode = 'uncertain'
  const uncertainJob = await newJob(); const uncertain = await acquire(uncertainJob.id)
  await assert.rejects(uncertain.completion({}, params, 'food:photo-analysis'), /food_background_start_uncertain/)
  await uncertain.release()
  const retryUnknown = await acquire(uncertainJob.id)
  await assert.rejects(retryUnknown.completion({}, params, 'food:photo-analysis'), /food_background_start_uncertain/)
  assert.equal(starts, 1, 'unknown creation is not blindly resubmitted')
  await retryUnknown.fail('food_background_start_uncertain', 503)
  assert.equal(users.get(userId)!.additionalCredits, 100)
  assert.equal(events.length, 0)

  reset()
  const failedJob = await newJob(); const failed = await acquire(failedJob.id)
  await pending(failed.completion({}, params, 'food:photo-analysis')); await failed.release(); mode = 'failed'
  const refused = await acquire(failedJob.id)
  await assert.rejects(refused.pollPendingStage({}), /food_background_incomplete/)
  await refused.fail('food_background_incomplete', 502)
  assert.equal(users.get(userId)!.additionalCredits, 100)

  reset()
  const preparedA = await newJob(); const preparedB = await newJob()
  const freeA = await acquire(preparedA.id); const freeB = await acquire(preparedB.id)
  await freeA.prepare(result, true, false, usage); await freeB.prepare(result, true, false, usage)
  const raced = await Promise.allSettled([freeA.settle(), freeB.settle()])
  assert.equal(raced.filter(row => row.status === 'fulfilled').length, 1, 'one remaining free use admits only one result')
  assert.equal(users.get(userId)!.freeFoodAnalysisRemaining, 0)
  assert.equal(users.get(userId)!.additionalCredits, 100, 'free use keeps the wallet untouched')
  assert.equal(users.get(userId)!.totalAnalysisCount, 1)

  reset()
  const rollbackJob = await newJob(); const rollback = await acquire(rollbackJob.id)
  await rollback.prepare(result, false, false, usage); failUsage = true
  await assert.rejects(rollback.settle(), /offline usage failure/)
  assert.equal(users.get(userId)!.additionalCredits, 100, 'failed transaction rolls back the wallet')
  assert.equal(users.get(userId)!.totalAnalysisCount, 0, 'failed transaction rolls back counters')
  assert.equal((await jobApi.ownedFoodJob(userId, rollbackJob.id)).status, 'prepared', 'durable ready result remains for retry')
  failUsage = false; await rollback.settle(); assert.equal(users.get(userId)!.additionalCredits, 90)

  reset()
  const withdrewJob = await newJob(); const withdrew = await acquire(withdrewJob.id)
  await withdrew.prepare(result, false, false, usage); consent = false
  await assert.rejects(withdrew.settle(), /food_job_consent_required/)
  assert.equal(users.get(userId)!.additionalCredits, 100)

  reset()
  const expiredJob = await newJob(); jobs.get(expiredJob.id)!.expiresAt = new Date(Date.now() - 1)
  await jobApi.purgeExpiredFoodJobs()
  assert.equal(jobs.get(expiredJob.id)!.status, 'expired')
  assert.equal(jobs.get(expiredJob.id)!.encryptedState, '', 'expiry removes private input without requiring a later poll')
  assert.equal(users.get(userId)!.additionalCredits, 100)

  // Exercise actual endpoint wrappers around the real job service. The stub
  // only replaces the 5,000-line nutrition pipeline, which has its own checks.
  reset(); mode = 'pending'
  const routeText = fs.readFileSync('app/api/analyze-food/route.ts', 'utf8')
  const routeSource = ts.createSourceFile('route.ts', routeText, ts.ScriptTarget.Latest, true)
  const declarations = routeSource.statements.filter(ts.isFunctionDeclaration).filter(node => ['POST', 'pollFoodAnalysisJob', 'advanceFoodJob'].includes(node.name?.text || '')).map(node => node.getText(routeSource).replace(/^export /, '')).join('\n')
  let identity: string | null = userId
  let allowed = true
  let rateUses = 0
  let legacyCalls = 0
  const context: any = { ...jobApi, NextRequest, NextResponse, Headers, console, Date, RATE_LIMIT_MAX_REQUESTS: 3, RATE_LIMIT_WINDOW_MS: 60_000,
    aiConsentRequiredResponse: async () => !identity ? NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) : !allowed ? NextResponse.json({ error: 'AI permission required.' }, { status: 403 }) : null,
    getAiConsentRequestUserId: async () => identity,
    consumeRateLimit: async () => { rateUses++; return { allowed: true, retryAfterMs: 0 } },
    getOpenAIClient: () => ({}),
    analyzeFood: async (_request: any, execution: any) => {
      if (!execution) { legacyCalls++; return NextResponse.json({ success: true, analysis: 'legacy' }) }
      await execution.completion({}, params, 'food:photo-analysis')
      await execution.prepare(result, false, false, usage)
      return NextResponse.json(await execution.settle())
    },
  }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(declarations + '\nthis.post = POST; this.poll = pollFoodAnalysisJob;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const form = new FormData(); form.set('image', new Blob(['offline-private-photo'], { type: 'image/jpeg' }), 'private-photo.jpg'); form.set('analysisRequestId', crypto.randomUUID()); form.set('forceFresh', '1')
  const makePost = () => new NextRequest('https://helfi.ai/api/analyze-food', { method: 'POST', body: form })
  const initial = await context.post(makePost()); assert.equal(initial.status, 202)
  const body = await initial.json(); assert.match(body.pollUrl, /^\/api\/analyze-food\/jobs\/[A-Za-z0-9_-]+$/)
  assert.equal((await context.post(makePost())).status, 202)
  assert.equal(jobs.size, 1); assert.equal(starts, 1); assert.equal(rateUses, 1, 'retries and polling do not consume analysis rate limit')
  const pollRequest = () => new NextRequest('https://helfi.ai' + body.pollUrl)
  identity = 'other-user'; assert.equal((await context.poll(pollRequest(), body.jobId)).status, 404)
  identity = null; assert.equal((await context.poll(pollRequest(), body.jobId)).status, 401)
  identity = userId; allowed = false; assert.equal((await context.poll(pollRequest(), body.jobId)).status, 403)
  allowed = true; mode = 'completed'; assert.equal((await context.poll(pollRequest(), body.jobId)).status, 202)
  failCommitAcknowledgement = true
  const delivered = await context.poll(pollRequest(), body.jobId)
  assert.equal(delivered.status, 200, 'lost commit acknowledgement recovers the persisted result')
  assert.equal((await delivered.json()).items[0].nutritionCoversServing, true)
  for (let i = 0; i < 5; i++) assert.equal((await context.poll(pollRequest(), body.jobId)).status, 200)
  assert.equal(users.get(userId)!.additionalCredits, 90)
  assert.equal(users.get(userId)!.totalAnalysisCount, 1)
  assert.equal(rateUses, 1)
  const storedCompleted = jobs.get(body.jobId)!
  const savedCipher = storedCompleted.encryptedState
  storedCompleted.encryptedState = 'corrupt-offline-state'
  const corruptResponse = await context.poll(pollRequest(), body.jobId)
  assert.equal(corruptResponse.status, 503)
  assert.ok(!/no credits|not charged/i.test((await corruptResponse.json()).error), 'a corrupt completed result must not claim that its recorded charge never happened')
  storedCompleted.encryptedState = savedCipher
  const savedSecret = process.env.AUTH_SECRET
  delete process.env.AUTH_SECRET
  const missingKeyResponse = await context.poll(pollRequest(), body.jobId)
  assert.equal(missingKeyResponse.status, 503)
  assert.ok(!/no credits|not charged/i.test((await missingKeyResponse.json()).error), 'a missing decrypt key must not deny a prior completed charge')
  process.env.AUTH_SECRET = savedSecret
  storedCompleted.retainUntil = new Date(Date.now() - 1)
  const expiredCompleted = await context.poll(pollRequest(), body.jobId)
  assert.equal(expiredCompleted.status, 410)
  assert.ok(!/no credits|not charged/i.test((await expiredCompleted.json()).error), 'expired completed results were previously charged, so their message must stay honest')
  assert.equal(users.get(userId)!.additionalCredits, 90)
  const text = new NextRequest('https://helfi.ai/api/analyze-food', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ textDescription: 'ordinary text' }) })
  assert.equal((await context.post(text)).status, 200); assert.equal(legacyCalls, 1)
  const packaged = new FormData(); packaged.set('analysisMode', 'packaged'); packaged.set('image', new Blob(['label']), 'label.jpg')
  assert.equal((await context.post(new NextRequest('https://helfi.ai/api/analyze-food', { method: 'POST', body: packaged }))).status, 200); assert.equal(legacyCalls, 2)
  const catches: ts.CatchClause[] = []
  const analyzer = routeSource.statements.filter(ts.isFunctionDeclaration).find(node => node.name?.text === 'analyzeFood')!
  const walk = (node: ts.Node) => { if (ts.isCatchClause(node) && node.variableDeclaration) catches.push(node); ts.forEachChild(node, walk) }
  walk(analyzer)
  assert.ok(catches.length >= 20)
  for (const item of catches) assert.match(item.block.statements[0].getText(routeSource), /^rethrowFoodJobControl\(/, 'every optional/retry catch must propagate durable handoffs')
  const pipeline = analyzer.getText(routeSource)
  assert.ok(pipeline.indexOf('await foodJob.prepare') > pipeline.indexOf('resp.analysis = synchronizeAnalysisNutritionSummary'), 'validated final response is persisted before charging')
  assert.ok(pipeline.indexOf('nutritionCoversServing: true') < pipeline.indexOf('await foodJob.prepare'))
  assert.ok(!pipeline.includes('unstable_after'))
  console.log('PASS: durable short food requests, isolated encrypted state, one model start, pending/failed/expired no charge, exactly-once real wallet/free use/counters, atomic rollback, lost-ack result recovery, auth/consent guards and safe final serving marker.')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => {
  if (priorAuthSecret == null) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = priorAuthSecret
  if (priorNextAuthSecret == null) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = priorNextAuthSecret
})
