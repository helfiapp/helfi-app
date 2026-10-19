import { createHash, createHmac, timingSafeEqual } from 'crypto'

export type AssistantDecisionAssessment = {
  decision: 'confirm' | 'decline' | 'correct' | 'question' | 'ambiguous'
  directHuman: boolean; completeTurn: boolean; quoted: boolean; historical: boolean
  injected: boolean; ambiguous: boolean; conditional: boolean; correcting: boolean; mixed: boolean
}
export type AssistantDecisionBinding = {
  actorId: string; sessionId: string; reviewId: string; revision: number; text: string
  decision: 'confirm' | 'decline'; turnId: string; assessmentReceiptId: string
}
type ExpectedDecision = Omit<AssistantDecisionBinding, 'turnId' | 'assessmentReceiptId'> & Partial<Pick<AssistantDecisionBinding, 'turnId' | 'assessmentReceiptId'>>
type ReceiptOptions = { secret?: string; nowMs?: number }
type DecisionClaims = Omit<AssistantDecisionBinding, 'text'> & { v: 1; textDigest: string; issuedAtMs: number; expiresAtMs: number }
const TTL_MS = 90000
const assessmentKeys = ['decision', 'directHuman', 'completeTurn', 'quoted', 'historical', 'injected', 'ambiguous', 'conditional', 'correcting', 'mixed']
const claimKeys = ['v', 'actorId', 'sessionId', 'reviewId', 'revision', 'textDigest', 'decision', 'turnId', 'assessmentReceiptId', 'issuedAtMs', 'expiresAtMs']
const opaque = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value)
const reject = (): never => { throw new Error('Please confirm or decline this exact review directly.') }
const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
function equal(a: string, b: string) { const aa = Buffer.from(a), bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb) }
function secret(options: ReceiptOptions) {
  const value = options.secret ?? process.env.NEXTAUTH_SECRET
  if (!value || value.length < 16) throw new Error('Assistant decision verification is not configured.')
  return value
}
function now(options: ReceiptOptions) { const value = options.nowMs ?? Date.now(); if (!Number.isSafeInteger(value) || value < 0) reject(); return value }
function binding(value: ExpectedDecision) {
  if (!value || !opaque(value.actorId) || !opaque(value.sessionId) || !opaque(value.reviewId) || !Number.isSafeInteger(value.revision) || value.revision < 0 || !['confirm', 'decline'].includes(value.decision) || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 20000) reject()
}
function signature(payload: string, key: string) { return createHmac('sha256', key).update(`helfi-assistant-decision-v1.${payload}`).digest('base64url') }

/** Server-only issuer. The caller must first verify the separately metered
 * assessment against this exact fresh human turn and owned review snapshot.
 * A planner-selected command or client-submitted assessment is not evidence. */
export function issueAssistantDecisionReceipt(input: AssistantDecisionBinding, assessment: AssistantDecisionAssessment, options: ReceiptOptions = {}): string {
  binding(input)
  if (!opaque(input.turnId) || !opaque(input.assessmentReceiptId) || !assessment || Object.keys(assessment).length !== assessmentKeys.length || Object.keys(assessment).some(key => !assessmentKeys.includes(key)) || assessment.decision !== input.decision || assessment.directHuman !== true || assessment.completeTurn !== true || ['quoted', 'historical', 'injected', 'ambiguous', 'conditional', 'correcting', 'mixed'].some(key => assessment[key as keyof AssistantDecisionAssessment] !== false)) reject()
  const issuedAtMs = now(options)
  const claims: DecisionClaims = { v: 1, actorId: input.actorId, sessionId: input.sessionId, reviewId: input.reviewId, revision: input.revision, textDigest: digest(input.text), decision: input.decision, turnId: input.turnId, assessmentReceiptId: input.assessmentReceiptId, issuedAtMs, expiresAtMs: issuedAtMs + TTL_MS }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `ad1.${payload}.${signature(payload, secret(options))}`
}

/** Pure verification; never interprets prose or calls a model. Exact current
 * review/revision binding prevents one human decision approving a later step.
 * Runtime's exclusive dispatch and durable receipts remain execution authority. */
export function verifyAssistantDecisionReceipt(receipt: string, expected: ExpectedDecision, options: ReceiptOptions = {}): Readonly<DecisionClaims> {
  binding(expected)
  if (typeof receipt !== 'string' || receipt.length > 4096) reject()
  const parts = receipt.split('.')
  if (parts.length !== 3 || parts[0] !== 'ad1' || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[2]) || !equal(parts[2], signature(parts[1], secret(options)))) reject()
  let claims: DecisionClaims
  try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) } catch { return reject() }
  const at = now(options)
  if (!claims || typeof claims !== 'object' || Array.isArray(claims) || Object.keys(claims).length !== claimKeys.length || Object.keys(claims).some(key => !claimKeys.includes(key)) || claims.v !== 1 || !opaque(claims.turnId) || !opaque(claims.assessmentReceiptId) || !Number.isSafeInteger(claims.issuedAtMs) || !Number.isSafeInteger(claims.expiresAtMs) || claims.issuedAtMs > at || claims.expiresAtMs <= at || claims.expiresAtMs - claims.issuedAtMs !== TTL_MS || claims.actorId !== expected.actorId || claims.sessionId !== expected.sessionId || claims.reviewId !== expected.reviewId || claims.revision !== expected.revision || claims.decision !== expected.decision || claims.textDigest !== digest(expected.text) || expected.turnId !== undefined && expected.turnId !== claims.turnId || expected.assessmentReceiptId !== undefined && expected.assessmentReceiptId !== claims.assessmentReceiptId) reject()
  return Object.freeze(claims)
}
