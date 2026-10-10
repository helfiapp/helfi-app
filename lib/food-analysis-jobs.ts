import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto'
import type OpenAI from 'openai'
import { prisma } from '@/lib/prisma'
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system'
import { AI_SHARING_CONSENT_VERSION } from '@/lib/ai-consent-text'
import type { CompletionWithCost } from '@/lib/metered-openai'
import type { UsageLogInput } from '@/lib/ai-usage-logger'
import { startFoodBackgroundCompletion, retrieveFoodBackgroundCompletion, FoodPhotoBackgroundError } from '@/lib/food-photo-background'

const JOB_LIFETIME_MS = 9 * 60_000
const RESULT_RETENTION_MS = 24 * 60 * 60_000
const LEASE_MS = 40_000
const REQUEST_BUDGET_MS = 16_000
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_STAGES = 16
const JOB_ID = /^[A-Za-z0-9_-]{16,128}$/
const REQUEST_ID = /^[A-Za-z0-9_-]{16,128}$/

type PhotoInput = { fields: Record<string, string>; image: string; name: string; mime: string }
type Stage = { key: string; status: 'starting' | 'pending' | 'completed' | 'failed'; responseId?: string; result?: CompletionWithCost; error?: string }
type PreparedFoodResult = { result: any; freeUse: boolean; isReanalysis: boolean; events: UsageLogInput[] }
export type FoodJobState = {
  rateChecked?: boolean
  input?: PhotoInput
  context?: { allergies: { allergies: string[]; diabetesType?: string }; dietTypes: string[]; country?: string | null; tokenCap?: number; rateChecked?: boolean }
  stages: Stage[]
  prepared?: PreparedFoodResult
  result?: any
}
export type FoodJobRecord = {
  id: string; userId: string; requestId: string; inputHash: string; status: string; encryptedState: string
  createdAt: Date; expiresAt: Date; retainUntil: Date; leaseOwner: string | null; leaseUntil: Date | null
  settledAt: Date | null; errorCode: string | null; errorStatus: number | null
}
export class FoodJobPending extends Error {
  constructor() { super('food_job_pending'); this.name = 'FoodJobPending' }
}
export class FoodJobError extends Error {
  constructor(public code: string, public status = 502) { super(code); this.name = 'FoodJobError' }
}
export const isFoodJobPending = (error: unknown): error is FoodJobPending => error instanceof FoodJobPending
// Pending yields must escape every optional-repair catch. A swallowed yield
// would start another AI request and could return/charge an incomplete result.
export function rethrowFoodJobControl(error: unknown): void {
  if (error instanceof FoodJobPending || error instanceof FoodJobError || error instanceof FoodPhotoBackgroundError) throw error
}

function encryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  if (!secret || secret.length < 24) throw new FoodJobError('food_job_encryption_unavailable', 503)
  return createHash('sha256').update('helfi-food-analysis-jobs:v1:').update(secret).digest()
}
export function encryptFoodJobState(state: FoodJobState, userId: string, jobId: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(JSON.stringify(['food-job-v1', userId, jobId])))
  const bytes = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), bytes.toString('base64')].join('.')
}
export function decryptFoodJobState(job: FoodJobRecord): FoodJobState {
  try {
    const [version, iv, tag, encrypted, extra] = job.encryptedState.split('.')
    if (version !== 'v1' || extra != null || !iv || !tag || !encrypted) throw new Error('invalid')
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'))
    decipher.setAAD(Buffer.from(JSON.stringify(['food-job-v1', job.userId, job.id])))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    const state = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8'))
    if (!state || !Array.isArray(state.stages)) throw new Error('invalid')
    return state
  } catch (error) {
    if (error instanceof FoodJobError) throw error
    throw new FoodJobError('food_job_state_unavailable', 503)
  }
}

/** Only the original request's accepted input is retained; never auth headers. */
export async function photoJobInput(form: FormData): Promise<PhotoInput> {
  const image = form.get('image')
  if (!image || typeof image === 'string' || image.size <= 0 || image.size > MAX_IMAGE_BYTES) throw new FoodJobError('food_job_invalid_image', 400)
  const fields: Record<string, string> = {}
  for (const name of ['isReanalysis', 'analysisMode', 'labelScan', 'barcode', 'barcodeName', 'barcodeBrand', 'forceFresh', 'analysisHint', 'feedbackReasons', 'feedbackDown', 'feedbackMissing', 'feedbackItems']) {
    const value = form.get(name)
    if (typeof value === 'string') {
      if (value.length > 10_000) throw new FoodJobError('food_job_invalid_input', 400)
      fields[name] = value
    }
  }
  return { fields, image: Buffer.from(await image.arrayBuffer()).toString('base64'), name: image.name.slice(0, 255), mime: image.type.slice(0, 100) }
}
export function foodJobForm(state: FoodJobState): FormData {
  if (!state.input) throw new FoodJobError('food_job_input_unavailable', 410)
  const form = new FormData()
  for (const [key, value] of Object.entries(state.input.fields)) form.set(key, value)
  form.set('image', new Blob([Buffer.from(state.input.image, 'base64')], { type: state.input.mime }), state.input.name)
  return form
}
export function validatedFoodRequestId(value: unknown): string {
  if (value == null || value === '') return randomUUID()
  if (typeof value !== 'string' || !REQUEST_ID.test(value)) throw new FoodJobError('food_job_invalid_request_id', 400)
  return value
}
function inputHash(input: PhotoInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}
export async function existingFoodJob(userId: string, requestId: string): Promise<FoodJobRecord | null> {
  return (prisma as any).foodAnalysisJob.findUnique({ where: { userId_requestId: { userId, requestId } } })
}
export async function createFoodJob(userId: string, requestId: string, input: PhotoInput): Promise<FoodJobRecord> {
  await purgeExpiredFoodJobs()
  const hash = inputHash(input)
  const existing = await existingFoodJob(userId, requestId)
  if (existing) {
    if (existing.inputHash !== hash) throw new FoodJobError('food_job_request_conflict', 409)
    return existing
  }
  const now = new Date()
  // Serializes simultaneous new requests for this account without holding a
  // database transaction while contacting the model or a nutrition provider.
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`food-jobs:${userId}`}))`
    const duplicate = await tx.foodAnalysisJob.findUnique({ where: { userId_requestId: { userId, requestId } } })
    if (duplicate) {
      if (duplicate.inputHash !== hash) throw new FoodJobError('food_job_request_conflict', 409)
      return duplicate
    }
    const active = await tx.foodAnalysisJob.count({ where: { userId, status: { in: ['pending', 'prepared'] }, expiresAt: { gt: now } } })
    if (active >= 3) throw new FoodJobError('food_job_too_many_active', 429)
    const id = randomUUID()
    return tx.foodAnalysisJob.create({ data: {
      id, userId, requestId, inputHash: hash, status: 'pending',
      encryptedState: encryptFoodJobState({ input, stages: [], rateChecked: true }, userId, id),
      expiresAt: new Date(now.getTime() + JOB_LIFETIME_MS), retainUntil: new Date(now.getTime() + RESULT_RETENTION_MS),
    } })
  }, { maxWait: 1000, timeout: 5000 })
}
/** Called by normal requests and the authenticated housekeeping schedule. */
export async function purgeExpiredFoodJobs(now = new Date()): Promise<void> {
  await (prisma as any).foodAnalysisJob.updateMany({ where: { status: { in: ['pending', 'prepared'] }, expiresAt: { lte: now } }, data: {
    status: 'expired', errorCode: 'food_job_expired', errorStatus: 410,
    encryptedState: '', leaseOwner: null, leaseUntil: null,
  } })
  await (prisma as any).foodAnalysisJob.updateMany({ where: { status: 'completed', retainUntil: { lte: now } }, data: {
    status: 'expired', errorCode: 'food_job_result_expired', errorStatus: 410,
    encryptedState: '', leaseOwner: null, leaseUntil: null,
  } })
  await (prisma as any).foodAnalysisJob.updateMany({ where: { status: { in: ['failed', 'expired'] }, retainUntil: { lte: now } }, data: {
    encryptedState: '', leaseOwner: null, leaseUntil: null,
  } })
}
export async function ownedFoodJob(userId: string, id: string): Promise<FoodJobRecord | null> {
  if (!JOB_ID.test(id)) return null
  return (prisma as any).foodAnalysisJob.findFirst({ where: { id, userId } })
}
export function foodJobPublicError(job: Pick<FoodJobRecord, 'errorCode' | 'errorStatus'> & { status?: string; settledAt?: Date | null }): { error: string; code: string; status: number } {
  const code = job.errorCode || 'food_job_failed'
  const status = job.errorStatus || 502
  return { code, status, error: code === 'food_job_insufficient_credits' ? 'Insufficient credits. Your photo was not charged.'
    : code === 'food_job_result_expired' ? 'This saved photo result has expired. Please analyse the photo again.'
    : code === 'food_job_expired' || code === 'food_background_expired' ? 'This photo analysis expired. Please try the photo again. No credits were used.'
    : job.status === 'failed' && !job.settledAt ? 'The photo could not be analysed. Please try again. No credits were used.'
    : 'The photo result could not be retrieved. Please retry the same request.' }
}
export const foodJobPendingBody = (job: Pick<FoodJobRecord, 'id'>) => ({ status: 'pending', jobId: job.id, pollUrl: `/api/analyze-food/jobs/${job.id}`, retryAfterMs: 1500 })

export class FoodJobExecution {
  readonly leaseOwner: string
  readonly startedAt = Date.now()
  state: FoodJobState
  stageIndex = 0
  private constructor(public job: FoodJobRecord, leaseOwner: string) {
    this.leaseOwner = leaseOwner
    this.state = decryptFoodJobState(job)
  }

  static async acquire(job: FoodJobRecord): Promise<FoodJobExecution | null> {
    const now = new Date()
    if (!['pending', 'prepared'].includes(job.status)) return null
    if (job.expiresAt <= now) {
      await (prisma as any).foodAnalysisJob.updateMany({ where: { id: job.id, userId: job.userId, status: { in: ['pending', 'prepared'] }, expiresAt: { lte: now } }, data: {
        status: 'expired', errorCode: 'food_job_expired', errorStatus: 410, encryptedState: encryptFoodJobState({ stages: [] }, job.userId, job.id), leaseOwner: null, leaseUntil: null,
      } })
      throw new FoodJobError('food_job_expired', 410)
    }
    const leaseOwner = randomUUID()
    const claimed = await (prisma as any).foodAnalysisJob.updateMany({ where: {
      id: job.id, userId: job.userId, status: { in: ['pending', 'prepared'] }, expiresAt: { gt: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    }, data: { leaseOwner, leaseUntil: new Date(now.getTime() + LEASE_MS) } })
    if (claimed.count !== 1) return null
    try {
      // Another poll can checkpoint and release between the original read and
      // this claim. Resume only the latest state protected by our own lease.
      const current = await (prisma as any).foodAnalysisJob.findFirst({ where: { id: job.id, userId: job.userId, leaseOwner } })
      if (!current) return null
      return new FoodJobExecution(current, leaseOwner)
    } catch (error) {
      await (prisma as any).foodAnalysisJob.updateMany({ where: { id: job.id, userId: job.userId, leaseOwner }, data: { leaseOwner: null, leaseUntil: null } }).catch(() => {})
      throw error
    }
  }
  async save(): Promise<void> {
    const saved = await (prisma as any).foodAnalysisJob.updateMany({ where: {
      id: this.job.id, userId: this.job.userId, leaseOwner: this.leaseOwner, leaseUntil: { gt: new Date() }, status: { in: ['pending', 'prepared'] },
    }, data: { encryptedState: encryptFoodJobState(this.state, this.job.userId, this.job.id) } })
    if (saved.count !== 1) throw new FoodJobPending()
  }
  async release(): Promise<void> {
    await (prisma as any).foodAnalysisJob.updateMany({ where: { id: this.job.id, userId: this.job.userId, leaseOwner: this.leaseOwner }, data: { leaseOwner: null, leaseUntil: null } })
  }
  async fail(code: string, status: number): Promise<boolean> {
    const safeCode = /^[a-zA-Z0-9_:-]{1,100}$/.test(code) ? code : 'food_job_failed'
    const changed = await (prisma as any).foodAnalysisJob.updateMany({ where: {
      id: this.job.id, userId: this.job.userId, leaseOwner: this.leaseOwner, status: { in: ['pending', 'prepared'] },
    }, data: { status: 'failed', errorCode: safeCode, errorStatus: status, encryptedState: encryptFoodJobState({ stages: [] }, this.job.userId, this.job.id), leaseOwner: null, leaseUntil: null } })
    return changed.count === 1
  }
  async freezeContext(context: NonNullable<FoodJobState['context']>): Promise<void> {
    if (this.state.context) return
    this.state.context = context
    await this.save()
  }
  async pollPendingStage(openai: OpenAI): Promise<void> {
    const stage = this.state.stages.find(item => item.status === 'pending' || item.status === 'starting')
    if (!stage) return
    if (stage.status === 'starting' || !stage.responseId) throw new FoodJobError('food_background_start_uncertain', 503)
    await this.pollStage(openai, stage)
  }
  private async pollStage(openai: OpenAI, stage: Stage): Promise<never> {
    if (!stage.responseId) throw new FoodJobError('food_job_stage_unavailable', 503)
    let polled
    try { polled = await retrieveFoodBackgroundCompletion(openai, stage.responseId) }
    catch (error) {
      if (error instanceof FoodPhotoBackgroundError && ['food_background_retrieve_uncertain', 'food_background_rate_limit'].includes(error.code)) throw new FoodJobPending()
      throw error
    }
    if (polled.status === 'pending') throw new FoodJobPending()
    if (polled.status === 'failed') {
      stage.status = 'failed'; stage.error = polled.error
      await this.save()
      throw new FoodJobError(polled.error, polled.error === 'food_background_expired' ? 410 : 502)
    }
    stage.status = 'completed'; stage.result = polled.result
    await this.save()
    throw new FoodJobPending()
  }
  async completion(openai: OpenAI, params: any, feature?: string): Promise<CompletionWithCost> {
    const index = this.stageIndex++
    if (index >= MAX_STAGES) throw new FoodJobError('food_job_stage_limit', 502)
    const key = createHash('sha256').update(JSON.stringify(params)).digest('hex')
    let stage = this.state.stages[index]
    if (stage && stage.key !== key) throw new FoodJobError('food_job_stage_changed', 409)
    if (stage?.status === 'completed' && stage.result) return stage.result
    if (stage?.status === 'failed') throw new FoodJobError(stage.error || 'food_job_stage_failed', 502)
    // A process could disappear after the provider accepted creation but before
    // its response ID was saved. Never resubmit that uncertain stage.
    if (stage?.status === 'starting') throw new FoodJobError('food_background_start_uncertain', 503)
    if (Date.now() - this.startedAt > REQUEST_BUDGET_MS - 8000) throw new FoodJobPending()
    if (!stage) {
      stage = { key, status: 'starting' }
      this.state.stages[index] = stage
      await this.save()
      try {
        const started = await startFoodBackgroundCompletion(openai, params, { userId: this.job.userId, runId: `${this.job.id}:${index}:${key}`, feature })
        stage.responseId = started.responseId
        stage.status = 'pending'
        await this.save()
      } catch (error) {
        rethrowFoodJobControl(error)
        throw new FoodJobError('food_background_start_uncertain', 503)
      }
      throw new FoodJobPending()
    }
    // Avoid spending the model-retrieval request's remaining time on provider
    // lookups. The next short request resumes the existing nutrition pipeline.
    return this.pollStage(openai, stage)
  }
  async prepare(result: any, freeUse: boolean, isReanalysis: boolean, events: UsageLogInput[]): Promise<void> {
    if (!validFoodJobResult(result)) throw new FoodJobError('food_job_invalid_result', 502)
    this.state.prepared = { result: { ...result, jobId: this.job.id }, freeUse, isReanalysis, events }
    const saved = await (prisma as any).foodAnalysisJob.updateMany({ where: {
      id: this.job.id, userId: this.job.userId, leaseOwner: this.leaseOwner, status: 'pending', expiresAt: { gt: new Date() }, leaseUntil: { gt: new Date() },
    }, data: { status: 'prepared', encryptedState: encryptFoodJobState(this.state, this.job.userId, this.job.id) } })
    if (saved.count !== 1) throw new FoodJobPending()
    this.job.status = 'prepared'
  }
  async settle(): Promise<any> {
    if (!this.state.prepared) throw new FoodJobError('food_job_result_unavailable', 503)
    if (Date.now() - this.startedAt > REQUEST_BUDGET_MS - 10_000) throw new FoodJobPending()
    return settleFoodJob(this.job, this.leaseOwner)
  }
}

export function validFoodJobResult(result: any): boolean {
  const core = (item: any) => ['calories', 'protein_g', 'carbs_g', 'fat_g'].every(key => typeof item?.[key] === 'number' && Number.isFinite(item[key]) && item[key] >= 0)
  return result?.success === true && typeof result.analysis === 'string' && result.analysis.trim().length > 0 &&
    typeof result.analysisId === 'string' && Array.isArray(result.items) && result.items.length > 0 &&
    result.items.every((item: any) => typeof item?.name === 'string' && item.name.trim() && core(item)) && core(result.total)
}

/** Result, fixed-price payment/free use, usage and counters commit together. */
export async function settleFoodJob(job: FoodJobRecord, leaseOwner: string): Promise<any> {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2000ms'`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${job.userId}))`
    const current = await tx.foodAnalysisJob.findFirst({ where: { id: job.id, userId: job.userId } })
    if (!current) throw new FoodJobError('food_job_not_found', 404)
    const state = decryptFoodJobState(current)
    if (current.status === 'completed' && current.settledAt && state.result) return state.result
    if (current.status !== 'prepared' || current.leaseOwner !== leaseOwner || current.leaseUntil <= new Date()) throw new FoodJobPending()
    if (current.expiresAt <= new Date()) throw new FoodJobError('food_job_expired', 410)
    const prepared = state.prepared
    if (!prepared || !validFoodJobResult(prepared.result)) throw new FoodJobError('food_job_invalid_result', 502)
    // Consent can be withdrawn while the model works: never charge/release a
    // result after withdrawal, including at the final transaction boundary.
    const consent = await tx.aiDataSharingConsent.findUnique({ where: { userId: job.userId } })
    if (!consent?.granted || consent.version !== AI_SHARING_CONSENT_VERSION) throw new FoodJobError('food_job_consent_required', 403)
    if (prepared.freeUse) {
      // The generic 30-second Prisma write guard suppresses identical
      // updateMany payloads across distinct jobs. The job itself supplies the
      // durable exactly-once guard; keep the conditional decrement as static,
      // parameterized SQL in this same locked transaction.
      const consumed = prepared.isReanalysis
        ? await tx.$executeRaw`UPDATE "User" SET "freeFoodReanalysisRemaining" = "freeFoodReanalysisRemaining" - 1, "updatedAt" = NOW() WHERE "id" = ${job.userId} AND "freeFoodReanalysisRemaining" > 0`
        : await tx.$executeRaw`UPDATE "User" SET "freeFoodAnalysisRemaining" = "freeFoodAnalysisRemaining" - 1, "updatedAt" = NOW() WHERE "id" = ${job.userId} AND "freeFoodAnalysisRemaining" > 0`
      if (consumed !== 1) throw new FoodJobError('food_job_insufficient_credits', 402)
    } else {
      const cm = new CreditManager(job.userId)
      if (!(await cm.chargeFoodJobInTransaction(prepared.isReanalysis ? CREDIT_COSTS.FOOD_REANALYSIS : CREDIT_COSTS.FOOD_ANALYSIS, tx))) throw new FoodJobError('food_job_insufficient_credits', 402)
    }
    await tx.user.update({ where: { id: job.userId }, data: prepared.isReanalysis ? {
      dailyFoodReanalysisUsed: { increment: 1 }, totalAnalysisCount: { increment: 1 },
    } : { dailyFoodAnalysisUsed: { increment: 1 }, totalFoodAnalysisCount: { increment: 1 }, totalAnalysisCount: { increment: 1 }, monthlyFoodAnalysisUsed: { increment: 1 } } })
    // Log once in the same transaction. Completed polling never reruns logs.
    const seen = new Set<string>()
    for (const entry of prepared.events) {
      const identity = `${entry.feature}:${entry.scanId || ''}`
      if (seen.has(identity)) continue
      seen.add(identity)
      await tx.aIUsageEvent.create({ data: {
        feature: entry.feature, userId: job.userId, userLabel: entry.userLabel || null, scanId: prepared.result.analysisId,
        model: entry.model, promptTokens: entry.promptTokens, completionTokens: entry.completionTokens,
        totalTokens: entry.promptTokens + entry.completionTokens, costCents: entry.costCents,
        detail: entry.callDetail || entry.detail || null, endpoint: '/api/analyze-food', success: true,
        imageWidth: entry.image?.width ?? null, imageHeight: entry.image?.height ?? null, imageBytes: entry.image?.bytes ?? null,
        imageMime: entry.image?.mime ?? null, runId: job.id,
      } })
    }
    // Delete the original image, health context and provider IDs at completion.
    await tx.foodAnalysisJob.update({ where: { id: job.id }, data: {
      status: 'completed', settledAt: new Date(), encryptedState: encryptFoodJobState({ stages: [], result: prepared.result }, job.userId, job.id),
      leaseOwner: null, leaseUntil: null, errorCode: null, errorStatus: null,
    } })
    return prepared.result
  }, { maxWait: 1000, timeout: 10_000 })
}
