import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { sanitizeGeneralAssistantCommand } from '../native/src/voice/generalAssistantActions'
import { liveVoiceCostUnits, reserveVoiceBackendCostUnits, voiceBackendCostQuote } from './voice-cost-policy'
import { formatNativeAssistantView } from './native-assistant-readable'
import { issueAssistantDecisionReceipt } from './native-assistant-decision'

const TOKEN_MS = 12 * 60 * 1000, LEASE_MS = 35000, MAX_JSON_BYTES = 180000
const MAX_JOB_BYTES = 1024 * 1024, RESULT_BYTES = 160000, RESULT_NODES = 5000
const OVERHEAD_UNITS = BigInt('3000000000'), OVERHEAD_POLICY = 'voice-service-overhead-allocation-v1'
type Row = Record<string, any>
export type VoiceSessionRuntimeRecord = { sessionId: string; userId: string; providerSessionId?: string | null; state: string; expiresAt: Date; leaseTokenHash?: string | null; leaseExpiresAt?: Date | null; lastHeartbeatAt?: Date | null; configuration: any; transcript: any; toolJobs: any }
export type VoiceSessionControlDependencies = {
  secret: () => string
  now?: () => number
  store: { locked<T>(userId: string, sessionId: string, work: (row: VoiceSessionRuntimeRecord, save: (patch: Row) => Promise<void>) => Promise<T>): Promise<T> }
  ledger: { get(userId: string, sessionId: string): Promise<any>; reserve(input: any): Promise<any>; bind(input: any): Promise<any>; settle(input: any): Promise<any>; close(input: any): Promise<any> }
  providerKey: () => Promise<string>
  scheduleWatchdog: (input: { sessionId: string; controlToken: string; expiresAtMs: number }, delaySeconds?: number) => Promise<string>
  assistantState: (userId: string, configuration: Row) => Promise<{ session: any; turns: any[] }>
  deriveToolResult: (input: { request: any; userId: string; configuration: Row; job: Row; evidence: any }) => Promise<Row>
}
export class VoiceSessionControlError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); this.name = 'VoiceSessionControlError' }
}
const fail = (code: string, status = 400): never => { throw new VoiceSessionControlError(code, status) }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const digest = (value: any) => hash(JSON.stringify(canonical(value)))
// Publication and response-loss recovery must bind the same immutable job,
// including independently assessed decision authority and its review fence.
// Mutable delivery state and the subsequently issued receipt are excluded.
const immutableVoiceJobIdentity = (value: Row) => ({
  callId: value.callId, args: clone(value.args), delegationId: value.delegationId, actualHumanText: value.actualHumanText,
  ...(value.reviewFence !== undefined ? { reviewFence: clone(value.reviewFence) } : {}),
  ...(value.assessment !== undefined ? { assessment: clone(value.assessment) } : {}),
})
const opaque = (value: unknown, maximum = 200): value is string => typeof value === 'string' && value.length <= maximum && /^[A-Za-z0-9_-]+$/.test(value)
const fields = (value: any, allowed: string[], required: string[] = allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail('invalid_voice_control_fields')
}
function bounded(value: any, maximum = MAX_JSON_BYTES, maximumNodes = 20000) {
  let nodes = 0
  const walk = (item: any, depth: number) => {
    if (++nodes > maximumNodes || depth > 24) fail('voice_control_too_large')
    if (item === null || typeof item === 'boolean' || typeof item === 'string' || typeof item === 'number' && Number.isFinite(item)) return
    if (Array.isArray(item)) { if (item.length > 1000) fail('voice_control_too_large'); item.forEach(child => walk(child, depth + 1)); return }
    if (!item || typeof item !== 'object') fail('invalid_voice_control_json')
    const keys = Object.keys(item)
    if (keys.length > 1000 || keys.some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) fail('invalid_voice_control_json')
    keys.forEach(key => walk(item[key], depth + 1))
  }
  walk(value, 0)
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maximum) fail('voice_control_too_large')
}
const integer = (value: any, maximum: number, minimum = 0) => { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail('invalid_voice_control_number'); return value as number }
const units = (value: any): bigint => { if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,24})$/.test(value)) fail('invalid_voice_control_cost'); return BigInt(value) }
const safeEqual = (actual: string, expected: string) => { const a = Buffer.from(actual), b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b) }
function secretValue(): string { const value = process.env.NEXTAUTH_SECRET; if (!value || value.length < 16) return fail('voice_control_not_configured', 503); return value }
export function signVoiceSessionControlToken(input: { sessionId: string; userId: string; expiresAtMs: number }, options: { secret?: string; nowMs?: number } = {}) {
  const now = options.nowMs ?? Date.now(), secret = options.secret ?? secretValue()
  if (!opaque(input.sessionId) || !opaque(input.userId) || secret.length < 16 || !Number.isSafeInteger(input.expiresAtMs) || input.expiresAtMs <= now || input.expiresAtMs > now + TOKEN_MS) fail('invalid_voice_control_token')
  const payload = Buffer.from(JSON.stringify({ sessionId: input.sessionId, userId: input.userId, exp: input.expiresAtMs, scope: 'voice-control' })).toString('base64url')
  return `v1.${payload}.${createHmac('sha256', secret).update(`v1.${payload}`).digest('base64url')}`
}
export const createVoiceControlToken = signVoiceSessionControlToken
function tokenClaims(token: string, secret: string, now: number): { sessionId: string; userId: string; exp: number } {
  if (typeof token !== 'string' || token.length > 1600 || secret.length < 16) fail('invalid_voice_control_token', 401)
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1' || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[2]) || !safeEqual(parts[2], createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url'))) fail('invalid_voice_control_token', 401)
  let payload: any
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) } catch { fail('invalid_voice_control_token', 401) }
  fields(payload, ['sessionId', 'userId', 'exp', 'scope'])
  if (!opaque(payload.sessionId) || !opaque(payload.userId) || payload.scope !== 'voice-control' || !Number.isSafeInteger(payload.exp) || payload.exp <= now || payload.exp > now + TOKEN_MS) fail('invalid_voice_control_token', 401)
  return payload
}
function configuration(row: VoiceSessionRuntimeRecord, now: number): Row {
  const value = row.configuration
  bounded(value)
  const forbidden = (item: any): boolean => item && typeof item === 'object' && Object.entries(item).some(([key, child]) => /^(?:providerKey|apiKey|authorization|cookie|accessToken|refreshToken|controlToken|secret)$/i.test(key) || forbidden(child))
  if (!value || typeof value !== 'object' || Array.isArray(value) || forbidden(value) || !opaque(value.assistantSessionId, 120) || !/^\d{4}-\d{2}-\d{2}$/.test(value.localDate) || typeof value.timeZone !== 'string' || value.backendModel !== 'gpt-6-luna' || typeof value.instructions !== 'string' || !value.instructions || !Array.isArray(value.tools) || value.tools.length !== 1 || value.tools[0]?.type !== 'function' || value.tools[0]?.name !== 'request_helfi_action') fail('invalid_voice_runtime_configuration')
  try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format(new Date(now)) } catch { fail('invalid_voice_runtime_configuration') }
  integer(value.maxInputBytes, 160000, 1); integer(value.maxOutputTokens, 4096, 1)
  integer(value.deadlineMs, new Date(row.expiresAt).getTime(), 1)
  if (!opaque(value.voiceHoldKey) || !opaque(value.infrastructureHoldKey) || units(value.voiceReservedCostUnits) <= BigInt(0) || units(value.infrastructureReservedCostUnits) !== OVERHEAD_UNITS) fail('invalid_voice_runtime_configuration')
  return value
}
function jobState(raw: any): { jobs: Row[]; receipts: Row[]; completion?: Row; watchdogReady?: boolean; watchdogLeaseTokenHash?: string } {
  const value = Array.isArray(raw) && raw.length === 0 ? { jobs: [], receipts: [] } : clone(raw)
  if (!value || !Array.isArray(value.jobs) || value.jobs.length > 20 || !Array.isArray(value.receipts) || value.receipts.length > 20) fail('invalid_voice_runtime_jobs')
  bounded(value, MAX_JOB_BYTES); return value
}
/** Only exact server-owned reservation/settlement pairs prove complete backend
 * accounting. Empty arrays on BOTH sides prove no authorized backend request;
 * a missing/changed/pending receipt is never converted to zero usage. */
function backendReceiptsVerified(financial: Row, receipts: Row[]): boolean {
  try {
    if (!Array.isArray(financial.reservations)) return false
    const holds = financial.reservations.filter((hold: any) => hold.kind === 'backend')
    if (holds.length !== receipts.length || new Set(holds.map((hold: any) => hold.key)).size !== holds.length || new Set(receipts.map(receipt => receipt.key)).size !== receipts.length) return false
    const responseIds = new Set<string>()
    return receipts.every(receipt => {
      const hold = holds.find((item: any) => item.key === receipt.key), reservation = receipt.reservation, settled = receipt.settled
      if (!hold || hold.state !== 'SETTLED' || typeof hold.maxCostUnits !== 'bigint' || typeof hold.actualCostUnits !== 'bigint' || hold.observedCostUnits !== hold.actualCostUnits || hold.actualCostUnits > hold.maxCostUnits || !reservation || reservation.key !== receipt.key || !settled || !opaque(settled.providerResponseId) || responseIds.has(settled.providerResponseId) || !/^[a-f0-9]{64}$/.test(settled.receiptDigest) || hold.receiptDigest !== settled.receiptDigest || settled.invoiceConfirmed !== false) return false
      const maxInputTokens = integer(reservation.maxInputTokens, 168192, 1), maxOutputTokens = integer(reservation.maxOutputTokens, 4096, 1)
      const maximum = reserveVoiceBackendCostUnits({ model: 'gpt-6-luna', serviceTier: 'default', regionalProcessing: false, maxInputTokens: BigInt(maxInputTokens), maxOutputTokens: BigInt(maxOutputTokens), externalCostReserveUsdMicros: BigInt(0), externalCostsVerified: true })
      if (units(reservation.maxCostUnits) !== maximum || hold.maxCostUnits !== maximum) return false
      const usage = settled.usage
      fields(usage, ['inputTokens', 'cachedInputTokens', 'cacheWriteTokens', 'outputTokens', 'cacheWriteTokensMissing'])
      if (typeof usage.cacheWriteTokensMissing !== 'boolean' || usage.cacheWriteTokensMissing !== (usage.cacheWriteTokens === null)) return false
      const quote = voiceBackendCostQuote({ model: 'gpt-6-luna', serviceTier: 'default', regionalProcessing: false, inputTokens: BigInt(integer(usage.inputTokens, maxInputTokens)), cachedInputTokens: BigInt(integer(usage.cachedInputTokens, maxInputTokens)), cacheWriteTokens: usage.cacheWriteTokens === null ? null : BigInt(integer(usage.cacheWriteTokens, maxInputTokens)), outputTokens: BigInt(integer(usage.outputTokens, maxOutputTokens)) })
      if (quote.costBasis !== settled.costBasis || quote.costUnits !== units(settled.actualCostUnits) || quote.costUnits !== hold.actualCostUnits) return false
      responseIds.add(settled.providerResponseId)
      return true
    })
  } catch { return false }
}
const baselineFor = (session: any, turns: any[]) => ({ revision: session?.revision ?? 0, userTurns: turns.filter(turn => turn.role === 'user').length, stepIds: session?.steps.map((step: any) => step.id) ?? [], pending: session?.steps.find((step: any) => !['completed', 'cancelled'].includes(step.status)) ? ((step: any) => ({ id: step.id, status: step.status, reviewId: step.reviewId ?? null, actionId: step.actionId ?? null }))(session.steps.find((step: any) => !['completed', 'cancelled'].includes(step.status))) : null })
const lostTransportResult = (value: any) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 3 && value.ok === false && value.saved === false && value.safeToClaimSaved === false
const unverifiedTransportResult = (): Row => {
  const message = 'Helfi could not verify the result of that request. Please check the normal screen before repeating it. I cannot confirm whether anything was saved.'
  return { ok: false, saved: false, safeToClaimSaved: false, needsReview: false, status: 'needs_clarification', action: 'assistant_plan', message, spokenReply: message, transportRecovery: { status: 'result_not_verified' } }
}

/** Native JSON supplies a version pointer only. Every statement below comes
 * from the authenticated owned normal host and durable action receipts. */
export function deriveVoiceToolResultFromOwnedState(input: { userId: string; configuration: Row; job: Row; evidence: any; session: any; view: any; turns: any[] }): Row {
  const { userId, configuration: config, job, evidence, session, view } = input, command = job.args.assistantCommand, baseline = job.baseline
  const recovery = lostTransportResult(evidence)
  if (recovery) {
    const identity = immutableVoiceJobIdentity(job)
    if (job.identity !== digest(identity) || session && (session.actorId !== userId || session.id !== config.assistantSessionId) || view && (view.actorId !== userId || view.id !== config.assistantSessionId) || input.turns.some(turn => turn.actorId !== userId || turn.sessionId !== config.assistantSessionId)) fail('voice_tool_result_not_verified', 409)
    // No execution or retry: an unchanged/missing owned session cannot prove
    // whether an HTTP request reached the normal handler. End only this job.
    if (!session && !view) return unverifiedTransportResult()
    if (!session || !view || view.revision !== session.revision) fail('voice_tool_result_not_verified', 409)
    if (session.revision === baseline.revision) {
      if (digest(baselineFor(session, input.turns)) !== digest(baseline)) fail('voice_tool_result_not_verified', 409)
      return unverifiedTransportResult()
    }
    if (command.type !== 'plan' && digest(session.steps.map((step: any) => step.id)) !== digest(baseline.stepIds)) fail('voice_tool_result_not_verified', 409)
  }
  const pointer = recovery ? { actorId: userId, id: config.assistantSessionId, revision: session.revision } : evidence?.assistantContext
  if (!session || !view || session.actorId !== userId || view.actorId !== userId || session.id !== config.assistantSessionId || view.id !== config.assistantSessionId || !pointer || pointer.actorId !== userId || pointer.id !== config.assistantSessionId || pointer.revision !== session.revision || view.revision !== session.revision || session.revision <= baseline.revision) fail('voice_tool_result_not_verified', 409)
  let target: any = null
  if (command.type === 'plan') {
    const current = (session.currentStepIds ?? []).map((id: string) => session.steps.find((step: any) => step.id === id))
    if (current.length !== command.steps.length || current.some((step: any, index: number) => !step || baseline.stepIds.includes(step.id) || step.operation !== command.steps[index].operation || digest(step.values) !== digest(command.steps[index].values))) fail('voice_tool_result_not_verified', 409)
  } else if (command.type === 'confirm' || command.type === 'decline') {
    if (baseline.pending?.reviewId !== command.reviewId || baseline.pending?.status !== 'review') fail('voice_tool_result_not_verified', 409)
    target = session.steps.find((step: any) => step.id === baseline.pending.id)
    if (!target || command.type === 'confirm' && (target.reviewId !== command.reviewId || !['completed', 'uncertain', 'awaiting_person'].includes(target.status)) || command.type === 'decline' && target.status !== 'cancelled') fail('voice_tool_result_not_verified', 409)
  } else if (command.type === 'recover') {
    if (baseline.pending?.actionId !== command.actionId || !['uncertain', 'executing', 'awaiting_person'].includes(baseline.pending?.status)) fail('voice_tool_result_not_verified', 409)
    target = session.steps.find((step: any) => step.id === baseline.pending.id)
    if (!target || target.actionId !== command.actionId) fail('voice_tool_result_not_verified', 409)
  } else if (command.type === 'correct') {
    target = session.steps.find((step: any) => step.id === command.stepId)
    if (baseline.pending?.id !== command.stepId || !target || !['review', 'needs_details', 'pending'].includes(target.status) || Object.entries(command.values).some(([key, value]) => digest(target.values[key]) !== digest(value))) fail('voice_tool_result_not_verified', 409)
  } else if (!['advance', 'stop'].includes(command.type)) fail('voice_tool_result_not_verified', 409)
  if (recovery && command.type === 'stop') {
    if (session.status !== 'stopped' || session.steps.some((step: any) => ['pending', 'needs_details', 'review'].includes(step.status)) || baseline.pending && ['pending', 'needs_details', 'review'].includes(baseline.pending.status) && session.steps.find((step: any) => step.id === baseline.pending.id)?.status !== 'cancelled') fail('voice_tool_result_not_verified', 409)
    if (session.steps.some((step: any) => !['completed', 'cancelled'].includes(step.status))) return unverifiedTransportResult()
  }
  // An advance has no immutable value/review/action identity of its own.
  // Preserve the dialogue, but do not attribute another transition to it.
  if (recovery && command.type === 'advance') return unverifiedTransportResult()
  if (recovery && (target ? ['pending', 'executing'].includes(target.status) : (session.currentStepIds ?? []).some((id: string) => ['pending', 'executing'].includes(session.steps.find((step: any) => step.id === id)?.status)))) return unverifiedTransportResult()
  const projectedTarget = target && view.steps.find((step: any) => step.id === target.id)
  const saved = Boolean(target?.status === 'completed' && projectedTarget?.kind === 'write' && target.actionId && projectedTarget.completionId === target.actionId && projectedTarget.completion?.verified === true && projectedTarget.completion.actorId === userId)
  const current = new Set(view.currentStepIds ?? []), pending = view.steps.find((step: any) => current.has(step.id) && !['completed', 'cancelled'].includes(step.status))
  const safeView = { ...view, currentStepIds: [...new Set([...(view.currentStepIds ?? []), ...(saved ? [target.id] : [])])] }
  const message = formatNativeAssistantView(safeView)
  if (!message || message.length > 24000) fail('voice_tool_result_not_verified', 409)
  const assistantState = { revision: session.revision, currentStepIds: [...(view.currentStepIds ?? [])], steps: view.steps.map((step: any) => ({ id: step.id, operation: step.operation, status: step.status, ...(step.review?.id ? { review: { id: step.review.id, cost: clone(step.review.cost) } } : {}), ...(step.recoveryActionId ? { recoveryActionId: step.recoveryActionId } : {}), ...(step.missing ? { missing: clone(step.missing) } : {}), ...(step.clarification ? { clarification: clone(step.clarification) } : {}) })) }
  // The full exact text appears once, rather than repeating a long note in
  // message, values, result and review.summary. Stable owned control IDs are
  // enough for the next reviewed confirm/correct/recover command.
  return { ok: true, saved, safeToClaimSaved: saved, needsReview: pending?.status === 'review', status: pending?.status === 'review' ? 'review_draft' : saved ? 'saved' : pending ? 'needs_clarification' : 'general_answer', action: 'assistant_plan', spokenReply: message, assistantState, assistantRevision: session.revision, ...(recovery ? { transportRecovery: { status: 'verified_owned_result' }, assistantContext: pointer } : {}) }
}

export function createVoiceSessionControl(deps: VoiceSessionControlDependencies) {
  const now = deps.now ?? Date.now
  const owned = async <T>(userId: string, sessionId: string, work: (row: VoiceSessionRuntimeRecord, save: (patch: Row) => Promise<void>) => Promise<T>) => {
    if (!opaque(userId) || !opaque(sessionId)) fail('voice_session_not_found', 404)
    return deps.store.locked(userId, sessionId, async (row, save) => {
      if (row.userId !== userId || row.sessionId !== sessionId) fail('voice_session_not_found', 404)
      return work(row, save)
    })
  }
  return Object.freeze({
    async worker(token: string, body: any): Promise<Row> {
      bounded(body); const claims = tokenClaims(token, deps.secret(), now())
      if (!body || body.sessionId !== claims.sessionId || typeof body.command !== 'string') fail('invalid_voice_control_session', 401)
      return owned(claims.userId, claims.sessionId, async (row, save) => {
        const config = configuration(row, now()), jobs = jobState(row.toolJobs), expiry = new Date(row.expiresAt).getTime()
        const base = ['sessionId', 'command', 'leaseToken']
        const fieldsFor = (extra: string[], required = extra) => fields(body, [...base, ...extra], ['sessionId', 'command', ...required])
        const lease = () => {
          if (typeof body.leaseToken !== 'string' || !row.leaseTokenHash || !safeEqual(hash(body.leaseToken), row.leaseTokenHash) || !row.leaseExpiresAt || new Date(row.leaseExpiresAt).getTime() <= now()) fail('voice_worker_lease_lost', 409)
        }
        const active = () => { if (!['attaching', 'ready'].includes(row.state) || now() >= expiry || now() >= config.deadlineMs) fail('voice_session_not_active', 409) }
        const billing = () => deps.ledger.get(row.userId, row.sessionId)
        const attachReply = async (leaseToken: string, closing = false): Promise<Row> => {
          const financial = await billing(), holds = financial.reservations ?? []
          const voice = holds.find((hold: any) => hold.key === config.voiceHoldKey), overhead = holds.find((hold: any) => hold.key === config.infrastructureHoldKey)
          if (!['OPEN', ...(closing ? ['UNCERTAIN'] : [])].includes(financial.state) || !voice || !overhead || voice.maxCostUnits !== units(config.voiceReservedCostUnits) || overhead.maxCostUnits !== OVERHEAD_UNITS || !row.providerSessionId) fail('voice_budget_not_reserved', 402)
          let initialAssistantState: Row | undefined
          if (!closing) {
            const source = await deps.assistantState(row.userId, config)
            if (source.session && (source.session.actorId !== row.userId || source.session.id !== config.assistantSessionId) || !Array.isArray(source.turns) || source.turns.some(turn => turn.actorId !== row.userId || turn.sessionId !== config.assistantSessionId)) fail('voice_tool_source_not_owned', 409)
            const baseline = baselineFor(source.session, source.turns)
            const current = source.session?.steps.find((step: any) => step.id === baseline.pending?.id)
            const summary = current?.status === 'review' ? current.prepared?.summary : undefined
            initialAssistantState = { revision: baseline.revision, pending: baseline.pending, ...(typeof summary === 'string' && summary.length <= 24000 ? { reviewText: summary } : {}) }
          }
          const key = await deps.providerKey()
          if (typeof key !== 'string' || !key || key.length > 1000) fail('voice_provider_not_configured', 503)
          return { claimed: true, leaseToken, providerKey: key, providerSessionId: row.providerSessionId, backendModel: config.backendModel, instructions: config.instructions, tools: clone(config.tools), ...(initialAssistantState ? { initialAssistantState } : {}), ...(config.initialInput ? { initialInput: clone(config.initialInput) } : {}), maxInputBytes: config.maxInputBytes, maxOutputTokens: config.maxOutputTokens, deadlineMs: config.deadlineMs, voiceHoldKey: config.voiceHoldKey, infrastructureHoldKey: config.infrastructureHoldKey, voiceReservedCostUnits: config.voiceReservedCostUnits, infrastructureReservedCostUnits: OVERHEAD_UNITS.toString(), infrastructureAllocationPolicyVersion: OVERHEAD_POLICY, infrastructureAllocationReceiptDigest: digest({ sessionId: row.sessionId, policy: OVERHEAD_POLICY, allocatedOverheadCostUnits: OVERHEAD_UNITS.toString() }), maxAffordableDurationMs: Math.max(0, Number(units(config.voiceReservedCostUnits) / BigInt(50000)) - 60000), watchdogReady: jobs.watchdogReady === true, pricing: clone(config.pricing) }
        }
        if (body.command === 'attach' || body.command === 'watchdog-claim') {
          fieldsFor([])
          if (['complete', 'closed'].includes(row.state) || jobs.completion?.finalUsageConfirmed === true || body.command === 'attach' && jobs.completion) return body.command === 'attach' ? { claimed: false } : { closeNeeded: false }
          const held = row.leaseTokenHash && row.leaseExpiresAt && new Date(row.leaseExpiresAt).getTime() > now()
          if (body.command === 'attach' && (row.state !== 'allocating' || held || now() >= config.deadlineMs || now() >= expiry)) return { claimed: false }
          if (body.command === 'watchdog-claim' && held && now() < config.deadlineMs && now() < expiry) {
            // The worker may die immediately after its latest heartbeat. A
            // healthy observation must continue the independent watchdog
            // chain rather than consume its only remaining cleanup message.
            await deps.scheduleWatchdog({ sessionId: row.sessionId, controlToken: token, expiresAtMs: claims.exp }, 30)
            jobs.watchdogReady = true; await save({ toolJobs: jobs })
            return { closeNeeded: false }
          }
          const leaseToken = randomBytes(32).toString('base64url')
          const previous = { leaseTokenHash: row.leaseTokenHash, leaseExpiresAt: row.leaseExpiresAt, state: row.state }
          const nextState = body.command === 'attach' ? 'attaching' : 'closing'
          await save({ leaseTokenHash: hash(leaseToken), leaseExpiresAt: new Date(now() + LEASE_MS), lastHeartbeatAt: new Date(now()), state: nextState })
          Object.assign(row, { leaseTokenHash: hash(leaseToken), leaseExpiresAt: new Date(now() + LEASE_MS), state: nextState })
          try {
            await deps.scheduleWatchdog({ sessionId: row.sessionId, controlToken: token, expiresAtMs: claims.exp }, 30)
            if (body.command === 'watchdog-claim') jobs.watchdogLeaseTokenHash = hash(leaseToken)
            else delete jobs.watchdogLeaseTokenHash
            jobs.watchdogReady = true; await save({ toolJobs: jobs })
            const reply = await attachReply(leaseToken, body.command === 'watchdog-claim')
            return body.command === 'attach' ? reply : { ...reply, closeNeeded: true }
          } catch (error) { await save({ ...previous, state: 'uncertain' }); throw error }
        }
        lease()
        if (body.command === 'heartbeat') {
          fieldsFor(['latestSeconds', 'backendCalls', 'delegations'], []); if (['complete', 'closed'].includes(row.state)) fail('voice_session_not_active', 409)
          if ((await billing()).state !== 'OPEN' || now() >= expiry || now() >= config.deadlineMs) fail('voice_session_not_active', 409)
          if (body.latestSeconds !== undefined && (typeof body.latestSeconds !== 'number' || !Number.isFinite(body.latestSeconds) || body.latestSeconds < 0 || body.latestSeconds > 900)) fail('invalid_voice_control_number')
          if (body.backendCalls !== undefined) integer(body.backendCalls, 20)
          if (body.delegations !== undefined) integer(body.delegations, 10)
          await save({ leaseExpiresAt: new Date(now() + LEASE_MS), lastHeartbeatAt: new Date(now()) }); return { allowed: true, state: row.state }
        }
        if (body.command === 'schedule-watchdog') {
          fieldsFor(['delaySeconds'], []); if (body.delaySeconds !== undefined && body.delaySeconds !== 30) fail('invalid_voice_watchdog_delay')
          await deps.scheduleWatchdog({ sessionId: row.sessionId, controlToken: token, expiresAtMs: claims.exp }, 30); jobs.watchdogReady = true; await save({ toolJobs: jobs }); return { allowed: true }
        }
        if (body.command === 'ready') {
          fieldsFor(['providerSessionId']); active()
          if (body.providerSessionId !== row.providerSessionId || jobs.watchdogReady !== true) fail('voice_provider_binding_conflict', 409)
          await deps.ledger.bind({ userId: row.userId, sessionId: row.sessionId, key: config.voiceHoldKey, providerSessionId: row.providerSessionId })
          await save({ state: 'ready', lastHeartbeatAt: new Date(now()), leaseExpiresAt: new Date(now() + LEASE_MS) }); return { allowed: true, ready: true }
        }
        if (body.command === 'reserve') {
          fieldsFor(['key', 'kind', 'maxCostUnits', 'maxInputTokens', 'maxOutputTokens', 'model', 'serviceTier', 'regionalProcessing']); active()
          if (row.state !== 'ready') fail('voice_session_not_ready', 409)
          if (!opaque(body.key) || body.kind !== 'backend' || body.model !== 'gpt-6-luna' || body.serviceTier !== 'default' || body.regionalProcessing !== false) fail('unsupported_voice_backend')
          const maxInputTokens = integer(body.maxInputTokens, config.maxInputBytes + 8192, 1), maxOutputTokens = integer(body.maxOutputTokens, config.maxOutputTokens, 1)
          const expected = reserveVoiceBackendCostUnits({ model: body.model, serviceTier: body.serviceTier, regionalProcessing: false, maxInputTokens: BigInt(maxInputTokens), maxOutputTokens: BigInt(maxOutputTokens), externalCostReserveUsdMicros: BigInt(0), externalCostsVerified: true })
          if (units(body.maxCostUnits) !== expected) fail('voice_cost_receipt_mismatch')
          const old = jobs.receipts.find(item => item.key === body.key)
          const metadata = { key: body.key, maxInputTokens, maxOutputTokens, maxCostUnits: expected.toString() }
          if (old && digest(old.reservation) !== digest(metadata) || !old && jobs.receipts.length >= 20) fail('voice_backend_request_limit', 409)
          const reserved = (await billing()).reservations.filter((hold: any) => hold.kind === 'backend')
          const existing = reserved.find((hold: any) => hold.key === body.key)
          if (old?.settled || existing && existing.state !== 'PENDING') fail('voice_backend_key_already_used', 409)
          if (!reserved.some((hold: any) => hold.key === body.key) && reserved.length >= 20) fail('voice_backend_request_limit', 409)
          await deps.ledger.reserve({ userId: row.userId, sessionId: row.sessionId, key: body.key, kind: 'backend', maxCostUnits: expected })
          lease(); active()
          if (!old) { jobs.receipts.push({ key: body.key, reservation: metadata }); bounded(jobs, MAX_JOB_BYTES); await save({ toolJobs: jobs }) }
          return { allowed: true }
        }
        if (body.command === 'settle') {
          fieldsFor(['key', 'actualCostUnits', 'receiptDigest', 'providerResponseId', 'usage', 'costBasis'])
          if (!opaque(body.key) || !opaque(body.providerResponseId) || !/^[a-f0-9]{64}$/.test(body.receiptDigest)) fail('invalid_voice_cost_receipt')
          fields(body.usage, ['inputTokens', 'cachedInputTokens', 'cacheWriteTokens', 'outputTokens', 'cacheWriteTokensMissing'])
          const receipt = jobs.receipts.find(item => item.key === body.key) ?? fail('voice_reservation_missing', 409)
          if (typeof body.usage.cacheWriteTokensMissing !== 'boolean' || body.usage.cacheWriteTokensMissing !== (body.usage.cacheWriteTokens === null)) fail('invalid_voice_cost_receipt')
          const usage = { inputTokens: BigInt(integer(body.usage.inputTokens, receipt.reservation.maxInputTokens)), cachedInputTokens: BigInt(integer(body.usage.cachedInputTokens, receipt.reservation.maxInputTokens)), cacheWriteTokens: body.usage.cacheWriteTokens === null ? null : BigInt(integer(body.usage.cacheWriteTokens, receipt.reservation.maxInputTokens)), outputTokens: BigInt(integer(body.usage.outputTokens, receipt.reservation.maxOutputTokens)) }
          const quote = voiceBackendCostQuote({ model: 'gpt-6-luna', serviceTier: 'default', regionalProcessing: false, ...usage }), expected = quote.costUnits
          if (body.costBasis !== quote.costBasis) fail('voice_cost_receipt_mismatch', 409)
          if (units(body.actualCostUnits) !== expected || jobs.receipts.some(item => item.key !== body.key && item.settled?.providerResponseId === body.providerResponseId)) fail('voice_cost_receipt_mismatch', 409)
          const binding = { actualCostUnits: expected.toString(), providerResponseId: body.providerResponseId, receiptDigest: body.receiptDigest, usage: body.usage, costBasis: quote.costBasis, invoiceConfirmed: false }
          if (receipt.settled && digest(receipt.settled) !== digest(binding)) fail('voice_cost_receipt_conflict', 409)
          await deps.ledger.settle({ userId: row.userId, sessionId: row.sessionId, key: body.key, actualCostUnits: expected, receiptDigest: body.receiptDigest })
          receipt.settled = clone(binding); bounded(jobs, MAX_JOB_BYTES); await save({ toolJobs: jobs }); return { allowed: true, costBasis: quote.costBasis, invoiceConfirmed: false }
        }
        if (body.command === 'enqueue-tool') {
          fieldsFor(['callId', 'args', 'delegationId', 'actualHumanText', 'reviewFence', 'assessment'], ['callId', 'args', 'delegationId', 'actualHumanText']); active()
          if (row.state !== 'ready') fail('voice_session_not_ready', 409)
          if ((await billing()).state !== 'OPEN') fail('voice_session_not_active', 409)
          if (!opaque(body.callId) || !opaque(body.delegationId) || typeof body.actualHumanText !== 'string' || !body.actualHumanText.trim() || body.actualHumanText.length > 20000) fail('invalid_voice_tool_request')
          fields(body.args, ['request', 'action', 'needsReview', 'assistantCommand'])
          const command = sanitizeGeneralAssistantCommand(body.args.assistantCommand)
          if (body.args.action !== 'assistant_plan' || typeof body.args.needsReview !== 'boolean' || typeof body.args.request !== 'string' || !command) fail('invalid_voice_tool_request')
          const replyFence = body.reviewFence ?? body.assessment?.reviewFence
          const args = { ...clone(body.args), request: body.actualHumanText, assistantCommand: command }, identity = immutableVoiceJobIdentity({ ...body, args, ...(replyFence !== undefined ? { reviewFence: replyFence } : {}) })
          const old = jobs.jobs.find(job => job.callId === body.callId)
          if (old) { if (old.identity !== digest(identity)) fail('voice_tool_call_conflict', 409); return { jobId: old.callId } }
          if (jobs.jobs.length >= 20 || new Set([...jobs.jobs.map(job => job.delegationId), body.delegationId]).size > 10 || jobs.jobs.some(job => job.status === 'pending')) fail('voice_tool_request_limit', 409)
          const source = await deps.assistantState(row.userId, config)
          lease(); active()
          if (source.session && (source.session.actorId !== row.userId || source.session.id !== config.assistantSessionId) || !Array.isArray(source.turns) || source.turns.some(turn => turn.actorId !== row.userId || turn.sessionId !== config.assistantSessionId)) fail('voice_tool_source_not_owned', 409)
          const baseline = baselineFor(source.session, source.turns)
          const checkFence = (fence: any) => {
            fields(fence, ['revision', 'stepId', 'reviewId'])
            integer(fence.revision, Number.MAX_SAFE_INTEGER)
            if (!opaque(fence.stepId, 80) || !opaque(fence.reviewId, 120) || baseline.revision !== fence.revision || baseline.pending?.status !== 'review' || baseline.pending.id !== fence.stepId || baseline.pending.reviewId !== fence.reviewId) fail('voice_review_changed', 409)
          }
          if (body.reviewFence !== undefined) checkFence(body.reviewFence)
          let decisionReceipt: string | undefined
          if (body.assessment !== undefined) {
            const decisionCommand = command && (command.type === 'confirm' || command.type === 'decline') ? command : fail('voice_decision_assessment_invalid', 409)
            fields(body.assessment, ['providerResponseId', 'result', 'exactHumanTextSha256', 'reviewFence'])
            checkFence(body.assessment.reviewFence)
            if (decisionCommand.reviewId !== baseline.pending?.reviewId || body.assessment.exactHumanTextSha256 !== hash(body.actualHumanText) || !opaque(body.assessment.providerResponseId)) fail('voice_decision_assessment_invalid', 409)
            const receipt = jobs.receipts.find(item => item.settled?.providerResponseId === body.assessment.providerResponseId)
            const financial = await billing()
            if (!receipt || !backendReceiptsVerified(financial, jobs.receipts) || jobs.jobs.some(job => job.assessment?.providerResponseId === body.assessment.providerResponseId)) fail('voice_decision_cost_unverified', 409)
            decisionReceipt = issueAssistantDecisionReceipt({ actorId: row.userId, sessionId: config.assistantSessionId, reviewId: decisionCommand.reviewId, revision: baseline.revision, text: body.actualHumanText, decision: decisionCommand.type, turnId: body.delegationId, assessmentReceiptId: body.assessment.providerResponseId }, body.assessment.result, { secret: deps.secret(), nowMs: now() })
          }
          const job = { ...identity, identity: digest(identity), status: 'pending', createdAtMs: now(), baseline, ...(decisionReceipt ? { decisionReceipt } : {}) }
          jobs.jobs.push(job)
          // Reserve the bounded canonical output BEFORE the phone can run an
          // app action. A saved note must not lose its receipt to a storage
          // limit after the normal handler has already committed it.
          bounded(jobs, MAX_JOB_BYTES - RESULT_BYTES, 20000 - RESULT_NODES)
          await save({ toolJobs: jobs }); return { jobId: job.callId }
        }
        if (body.command === 'poll-tools') {
          fieldsFor(['callIds'])
          if (!Array.isArray(body.callIds) || body.callIds.length > 20 || body.callIds.some((id: any) => !opaque(id)) || new Set(body.callIds).size !== body.callIds.length) fail('invalid_voice_tool_request')
          return { results: body.callIds.map((id: string) => { const job = jobs.jobs.find(item => item.callId === id); if (!job) return fail('voice_tool_not_found', 404); return { callId: id, status: job.status, ...(job.status === 'completed' ? { result: clone(job.result) } : {}) } }) }
        }
        if (body.command === 'complete') {
          fieldsFor(['finalUsageConfirmed', 'backendUsageConfirmed', 'seconds', 'reason', 'voiceHoldKey', 'infrastructureHoldKey', 'backendResponseIds', 'receiptDigest', 'durationMs', 'workerDurationMs', 'watchdog', 'infrastructureAllocationPolicyVersion', 'infrastructureAllocationReceiptDigest'], ['finalUsageConfirmed', 'backendUsageConfirmed', 'seconds', 'reason', 'voiceHoldKey', 'infrastructureHoldKey', 'backendResponseIds', 'receiptDigest', 'durationMs'])
          if (typeof body.finalUsageConfirmed !== 'boolean' || typeof body.backendUsageConfirmed !== 'boolean' || body.voiceHoldKey !== config.voiceHoldKey || body.infrastructureHoldKey !== config.infrastructureHoldKey || typeof body.reason !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(body.reason) || !/^[a-f0-9]{64}$/.test(body.receiptDigest) || !Array.isArray(body.backendResponseIds) || body.backendResponseIds.length > 20 || body.backendResponseIds.some((id: any) => !opaque(id)) || new Set(body.backendResponseIds).size !== body.backendResponseIds.length) fail('invalid_voice_final_receipt')
          if (body.finalUsageConfirmed) { integer(body.durationMs, 15 * 60 * 1000); if (typeof body.seconds !== 'number' || !Number.isFinite(body.seconds) || body.seconds < 0 || Math.ceil(body.seconds * 1000) !== body.durationMs) fail('invalid_voice_final_receipt') }
          else if (body.durationMs !== null || body.seconds !== null) fail('invalid_voice_final_receipt')
          if (body.workerDurationMs !== undefined) integer(body.workerDurationMs, 15 * 60 * 1000)
          if (body.watchdog !== undefined && typeof body.watchdog !== 'boolean') fail('invalid_voice_final_receipt')
          const overheadDigest = digest({ sessionId: row.sessionId, policy: OVERHEAD_POLICY, allocatedOverheadCostUnits: OVERHEAD_UNITS.toString() })
          if (body.infrastructureAllocationPolicyVersion !== undefined && body.infrastructureAllocationPolicyVersion !== OVERHEAD_POLICY || body.infrastructureAllocationReceiptDigest !== undefined && body.infrastructureAllocationReceiptDigest !== overheadDigest) fail('voice_cost_receipt_mismatch')
          const completion = { finalUsageConfirmed: body.finalUsageConfirmed, backendUsageConfirmed: body.backendUsageConfirmed, durationMs: body.durationMs, reason: body.reason, receiptDigest: body.receiptDigest, backendResponseIds: body.backendResponseIds }
          if (jobs.completion && digest(jobs.completion) === digest(completion)) return { allowed: true, state: row.state }
          // Unknown voice closure must remain retryable by the fenced
          // watchdog. A later real final receipt may settle that held cost;
          // a previously verified final receipt cannot be replaced/downgraded.
          if (jobs.completion?.finalUsageConfirmed === true) fail('voice_final_receipt_conflict', 409)
          if (body.finalUsageConfirmed) await deps.ledger.settle({ userId: row.userId, sessionId: row.sessionId, key: config.voiceHoldKey, actualCostUnits: liveVoiceCostUnits({ model: 'gpt-live-1', allocated: Boolean(row.providerSessionId), durationMs: BigInt(body.durationMs) }), receiptDigest: body.receiptDigest })
          // This is a declared conservative SERVICE allocation, never a claim
          // about an observed AWS invoice or an exact infrastructure charge.
          await deps.ledger.settle({ userId: row.userId, sessionId: row.sessionId, key: config.infrastructureHoldKey, actualCostUnits: OVERHEAD_UNITS, receiptDigest: overheadDigest })
          const financial = await billing()
          const verifiedBackend = backendReceiptsVerified(financial, jobs.receipts)
          const watchdogOwned = body.watchdog === true && row.state === 'closing' && jobs.watchdogLeaseTokenHash === row.leaseTokenHash
          const monitorConfirmed = body.backendUsageConfirmed && jobs.receipts.every(receipt => receipt.settled && body.backendResponseIds.includes(receipt.settled.providerResponseId)) && body.backendResponseIds.length === jobs.receipts.length
          const known = body.finalUsageConfirmed && verifiedBackend && (watchdogOwned || monitorConfirmed)
          const final = await deps.ledger.close({ userId: row.userId, sessionId: row.sessionId, finalUsageConfirmed: known })
          jobs.completion = completion; jobs.jobs.forEach(job => { if (job.status === 'pending') { job.status = 'completed'; job.result = { ok: false, saved: false, safeToClaimSaved: false, message: 'The voice session ended before this action was verified. Check the normal Helfi screen before trying again.' } } })
          await save({ state: final.state === 'CLOSED' ? 'complete' : 'uncertain', toolJobs: jobs, leaseExpiresAt: new Date(now() + LEASE_MS) })
          return { allowed: true, state: final.state === 'CLOSED' ? 'complete' : 'uncertain', finalUsageConfirmed: final.finalUsageConfirmed === true, allocatedOverheadCostUnits: OVERHEAD_UNITS.toString(), overheadPolicy: OVERHEAD_POLICY }
        }
        return fail('unsupported_voice_control')
      })
    },
    async nativeRead(userId: string, sessionId: string): Promise<Row> {
      return owned(userId, sessionId, async (row, save) => {
        if (now() >= new Date(row.expiresAt).getTime()) return { sessionId, state: 'expired', jobs: [] }
        if (['attaching', 'ready'].includes(row.state) && now() >= configuration(row, now()).deadlineMs) return { sessionId, state: 'expired', jobs: [] }
        if (['attaching', 'ready'].includes(row.state) && (await deps.ledger.get(userId, sessionId)).state !== 'OPEN') return { sessionId, state: 'uncertain', jobs: [] }
        const jobs = jobState(row.toolJobs)
        if (jobs.jobs.some(job => job.status === 'pending' && job.reviewFence && job.publishedAtMs === undefined)) {
          const config = configuration(row, now()), source = await deps.assistantState(userId, config)
          if (source.session && (source.session.actorId !== userId || source.session.id !== config.assistantSessionId) || !Array.isArray(source.turns) || source.turns.some(turn => turn.actorId !== userId || turn.sessionId !== config.assistantSessionId)) fail('voice_tool_source_not_owned', 409)
          const current = baselineFor(source.session, source.turns)
          let changed = false
          for (const job of jobs.jobs.filter(job => job.status === 'pending' && job.reviewFence && job.publishedAtMs === undefined)) {
            const fence = job.reviewFence
            if (current.revision !== fence.revision || current.pending?.status !== 'review' || current.pending.id !== fence.stepId || current.pending.reviewId !== fence.reviewId) {
              job.status = 'completed'; job.result = { ok: false, saved: false, safeToClaimSaved: false, needsReview: true, spokenReply: 'The review changed before this reply could run. Check the current review before deciding.', transportRecovery: { status: 'result_not_verified' } }; changed = true
            } else { job.publishedAtMs = now(); changed = true }
          }
          if (changed) await save({ toolJobs: jobs })
        }
        return { sessionId, state: row.state, jobs: ['attaching', 'ready'].includes(row.state) ? jobs.jobs.filter(job => job.status === 'pending').map(job => ({ callId: job.callId, args: clone(job.args), actualHumanText: job.actualHumanText })) : [] }
      })
    },
    async nativeResult(request: any, userId: string, body: any): Promise<Row> {
      bounded(body); fields(body, ['sessionId', 'callId', 'result'])
      if (!opaque(body.callId)) fail('invalid_voice_tool_request')
      return owned(userId, body.sessionId, async (row, save) => {
        if (now() >= new Date(row.expiresAt).getTime() || !['attaching', 'ready'].includes(row.state)) fail('voice_session_not_active', 409)
        const config = configuration(row, now()), jobs = jobState(row.toolJobs), job = jobs.jobs.find(item => item.callId === body.callId) ?? fail('voice_tool_not_found', 404)
        const accepted = (result: Row) => ({ accepted: true, ...(result.transportRecovery ? { recovery: { transportRecovery: clone(result.transportRecovery), ...(result.assistantContext ? { assistantContext: clone(result.assistantContext) } : {}) } } : {}) })
        // Recheck even a duplicate: a changed normal saved record must never
        // turn an old client response into newly verified completion.
        const result = await deps.deriveToolResult({ request, userId, configuration: config, job, evidence: body.result })
        bounded(result, RESULT_BYTES, RESULT_NODES)
        // An acknowledged uncertain delivery is immutable. A late app result
        // must be checked through the normal screen, never execute this job again.
        if (job.status === 'completed' && job.result?.transportRecovery?.status === 'result_not_verified' && lostTransportResult(body.result)) return accepted(job.result)
        if (job.status === 'completed') { if (digest(result) !== digest(job.result)) fail('voice_tool_result_conflict', 409); return accepted(result) }
        job.status = 'completed'; job.result = clone(result); bounded(jobs, MAX_JOB_BYTES); await save({ toolJobs: jobs }); return accepted(result)
      })
    },
  })
}

let defaultControl: ReturnType<typeof createVoiceSessionControl> | undefined
/** Lazy fixed production boundaries. Offline fixtures supply every dependency
 * and never load Prisma, environment settings, keys or cloud transport. */
export function getVoiceSessionControl() {
  if (defaultControl) return defaultControl
  const state = async (userId: string, config: Row) => {
    const [{ prisma }, { createPrismaAssistantSessionStore }] = await Promise.all([import('@/lib/prisma'), import('./native-assistant-session-store')])
    const persistence = createPrismaAssistantSessionStore(prisma)
    return { session: await persistence.readSession(userId, config.assistantSessionId), turns: await persistence.conversation.read(userId, config.assistantSessionId) }
  }
  const ledger = async () => import('./voice-session-ledger')
  defaultControl = createVoiceSessionControl({
    secret: secretValue,
    store: { locked: async (userId, sessionId, work) => {
      const { prisma } = await import('@/lib/prisma')
      return (prisma as any).$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`voice-runtime:${sessionId}`}))`
        const row = await tx.voiceSessionRuntime.findUnique({ where: { sessionId } })
        if (!row || row.userId !== userId) fail('voice_session_not_found', 404)
        return work(row, async patch => { await tx.voiceSessionRuntime.update({ where: { sessionId }, data: patch }); Object.assign(row, patch) })
      }, { maxWait: 10000, timeout: 20000 })
    } },
    ledger: { get: async (...args) => (await ledger()).getVoiceBillingSession(...args), reserve: async input => (await ledger()).reserveVoiceSessionCost(input), bind: async input => (await ledger()).bindVoiceProviderConnection(input), settle: async input => (await ledger()).settleVoiceSessionCost(input), close: async input => (await ledger()).closeVoiceBillingSession(input) },
    providerKey: async () => { const key = process.env.OPENAI_API_KEY; if (!key) return fail('voice_provider_not_configured', 503); return key },
    scheduleWatchdog: async (input, delay) => (await import('./voice-session-worker-dispatch')).sendVoiceWatchdog(input, delay),
    assistantState: state,
    deriveToolResult: async ({ request, userId, configuration: config, job, evidence }) => {
      const [{ createNativeAssistantApp }, stored] = await Promise.all([import('./native-assistant-app'), state(userId, config)])
      const context = { actorId: userId, localDate: config.localDate, capabilities: config.capabilities ?? ['general-assistant-v1'], signal: request.signal }
      const { host } = createNativeAssistantApp(request, config.timeZone)
      const view = await host.snapshot(context, config.assistantSessionId)
      if (request.signal?.aborted) fail('voice_tool_result_cancelled', 409)
      return deriveVoiceToolResultFromOwnedState({ userId, configuration: config, job, evidence, session: stored.session, turns: stored.turns, view })
    },
  })
  return defaultControl
}
