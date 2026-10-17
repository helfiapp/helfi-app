// Trusted server callers only. No provider calls and no client-supplied funding
// proofs/costs. The route/worker must authenticate and calculate costs before
// using this ledger. All money stays integer; decimal strings cross JSON.
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { CreditManager, computeNextWalletResetAt, type VoiceCreditAllocation } from '@/lib/credit-system'
import { proveVoiceFunding, VoiceCostPolicyError, VOICE_COST_UNITS_PER_USD_MICRO, VOICE_TARGET_NET_MARGIN_BPS,
  voiceCreditsForCumulativeCost, type VoiceCustomerFundingProof, type VoiceOperatorFundingProof, type VoiceFunding } from '@/lib/voice-cost-policy'

const db = prisma as any
const transactionOptions = { maxWait: 10000, timeout: 20000 }
function fail(code: string): never { throw new VoiceCostPolicyError(code) }
const key = (value: string, label: string) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) fail(`invalid_${label}`)
  return value
}
const amount = (value: bigint) => { if (typeof value !== 'bigint' || value < BigInt(0)) fail('invalid_cost'); return value }
const credits = (value: number) => { if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647) fail('invalid_credits'); return value }
const date = (value: Date) => { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail('invalid_expiry'); return value }
const canonical = (value: any): any => typeof value === 'bigint' ? value.toString() : value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(field => [field, canonical(value[field])])) : value
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const sourceKey = (userId: string, source: Pick<VoiceCreditAllocation, 'bucket' | 'sourceId' | 'cycleStartedAt'>) => digest({ userId, bucket: source.bucket, sourceId: source.sourceId, cycleStartedAt: source.cycleStartedAt })

async function locked<T>(userId: string, work: (tx: any) => Promise<T>): Promise<T> {
  key(userId, 'user')
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
    return work(tx)
  }, transactionOptions)
}

function fundingFromSession(session: any): VoiceFunding {
  return session.mode === 'operator_test_budget'
    ? { kind: session.mode, providerBudgetCostUnits: session.providerBudgetCostUnits }
    : { kind: 'customer_realized_revenue', netUsdMicros: session.rateNetUsdMicros, creditsIssued: BigInt(session.rateCredits), providerBudgetCostUnits: session.providerBudgetCostUnits }
}
async function sessionFor(tx: any, userId: string, sessionId: string) {
  const session = await tx.voiceBillingSession.findUnique({ where: { id: key(sessionId, 'session') } })
  if (!session || session.userId !== userId) fail('voice_session_not_found')
  return session
}
function active(session: any, now = new Date()) {
  if (session.state !== 'OPEN' || session.expiresAt <= now) fail('voice_session_not_active')
}
async function operatorFor(tx: any, session: any, requireActive: boolean, now = new Date()) {
  if (!session.operatorFundingId) return null
  const lot = await tx.voiceFundingLot.findUnique({ where: { id: session.operatorFundingId } })
  if (!lot || lot.userId !== session.userId || lot.kind !== 'operator_test_budget') fail('operator_funding_missing')
  if (requireActive && (lot.revokedAt || lot.expiresAt <= now)) fail('operator_funding_expired')
  return lot
}

export async function registerVoiceCustomerFundingLot(input: { proof: VoiceCustomerFundingProof; source: Pick<VoiceCreditAllocation, 'bucket' | 'sourceId' | 'cycleStartedAt'>; expiresAt: Date }) {
  const { proof, source } = input, userId = proof.accountId, now = new Date()
  const decision = proveVoiceFunding(proof, { accountId: userId, nowMs: now.getTime() })
  if (!decision.allowed || decision.funding.kind !== 'customer_realized_revenue') fail(decision.allowed ? 'invalid_customer_funding' : decision.reason)
  const funding = decision.funding
  credits(Number(funding.creditsIssued)); date(input.expiresAt)
  if (input.expiresAt <= now || !['monthly', 'topup'].includes(source.bucket)) fail('voice_source_revenue_unverified')
  key(source.sourceId, 'source')
  return locked(userId, async tx => {
    if (source.bucket === 'topup') {
      const topup = await tx.creditTopUp.findUnique({ where: { id: source.sourceId } })
      if (!topup || topup.userId !== userId || topup.amountCents !== Number(funding.creditsIssued) || input.expiresAt > topup.expiresAt || source.cycleStartedAt !== null) fail('voice_source_allocation_unverified')
    } else {
      const user = await tx.user.findUnique({ where: { id: userId }, include: { subscription: true } })
      const cycle = user?.walletMonthlyResetAt?.toISOString() || null
      const nextReset = computeNextWalletResetAt(user?.subscription?.startDate || null, now)
      if (!user?.subscription || user.subscription.id !== source.sourceId || !source.cycleStartedAt || cycle !== source.cycleStartedAt || !nextReset || input.expiresAt > nextReset) fail('voice_source_allocation_unverified')
    }
    const sourceHash = sourceKey(userId, source)
    const existing = await tx.voiceFundingLot.findUnique({ where: { sourceKey: sourceHash } })
    const persistedProof = canonical(proof)
    if (existing) {
      if (digest(existing.proof) !== digest(persistedProof) || existing.expiresAt.getTime() !== input.expiresAt.getTime()) fail('voice_funding_proof_conflict')
      return existing
    }
    // The same purchase cannot fund a second source/cycle. Stable proof IDs
    // are checked under the per-user lock before creating the only lot.
    const prior = await tx.voiceFundingLot.findMany({ where: { userId, kind: 'customer_realized_revenue' } })
    if (prior.some((lot: any) => lot.proof?.purchaseId === proof.purchaseId || lot.proof?.settlementEvidenceId === proof.settlementEvidenceId)) fail('voice_revenue_already_allocated')
    return tx.voiceFundingLot.create({ data: { userId, kind: funding.kind, sourceKey: sourceHash, revenueEvidenceKey: digest({ purchaseId: proof.purchaseId }), sourceBucket: source.bucket, sourceId: source.sourceId,
      cycleStartedAt: source.cycleStartedAt ? new Date(source.cycleStartedAt) : null, creditsIssued: Number(funding.creditsIssued), netUsdMicros: funding.netUsdMicros,
      providerBudgetCostUnits: funding.providerBudgetCostUnits, proof: persistedProof, expiresAt: input.expiresAt } })
  })
}

export async function registerVoiceOperatorTestBudget(proof: VoiceOperatorFundingProof) {
  const now = new Date(), userId = proof.accountId
  // Only an explicitly supplied task authorization may create this budget.
  // Routes must not accept this proof from a customer or manufacture a new
  // authorization ID each day/session. Reuse never replenishes or extends it.
  const sourceHash = digest({ operator: userId, authorization: proof.authorizationId })
  return locked(userId, async tx => {
    const existing = await tx.voiceFundingLot.findUnique({ where: { sourceKey: sourceHash } })
    if (existing) {
      if (existing.proof?.fundingEvidenceId !== proof.fundingEvidenceId || existing.providerBudgetCostUnits !== proof.fundedUsdMicros * VOICE_COST_UNITS_PER_USD_MICRO) fail('operator_funding_proof_conflict')
      return existing
    }
    const decision = proveVoiceFunding(proof, { accountId: userId, nowMs: now.getTime() })
    if (!decision.allowed) fail(decision.reason)
    if (proof.fundedUsdMicros > BigInt(1000000) || proof.expiresAtMs - now.getTime() > 24 * 60 * 60 * 1000) fail('operator_test_authority_exceeded')
    return tx.voiceFundingLot.create({ data: { userId, kind: 'operator_test_budget', sourceKey: sourceHash, sourceBucket: 'operator', sourceId: proof.authorizationId,
      providerBudgetCostUnits: decision.funding.providerBudgetCostUnits, proof: canonical(proof), expiresAt: new Date(proof.expiresAtMs) } })
  })
}

type OpenSession = { userId: string; billingRunId: string; reserveCredits: number; operatorFundingId?: string; initialReservationKey: string; initialReserveCostUnits: bigint; expiresAt: Date }
async function reserveInTransaction(tx: any, session: any, input: { key: string; kind: string; maxCostUnits: bigint }) {
  key(input.key, 'reservation_key'); key(input.kind, 'cost_kind'); amount(input.maxCostUnits)
  const existing = await tx.voiceCostReservation.findUnique({ where: { sessionId_key: { sessionId: session.id, key: input.key } } })
  if (existing) {
    if (existing.kind !== input.kind || existing.maxCostUnits !== input.maxCostUnits) fail('voice_reservation_conflict')
    return existing
  }
  active(session)
  if (session.mode === 'customer_realized_revenue') {
    const allocations = await tx.voiceSessionAllocation.findMany({ where: { sessionId: session.id } })
    for (const allocation of allocations) {
      const lot = allocation.fundingLotId ? await tx.voiceFundingLot.findUnique({ where: { id: allocation.fundingLotId } }) : null
      if (!lot || lot.userId !== session.userId || lot.revokedAt || lot.expiresAt <= new Date()) fail('voice_source_funding_revoked')
    }
  }
  if (session.spentCostUnits + session.heldCostUnits + input.maxCostUnits > session.providerBudgetCostUnits) fail('voice_budget_exhausted')
  const operator = await operatorFor(tx, session, true)
  if (operator && operator.spentCostUnits + operator.heldCostUnits + input.maxCostUnits > operator.providerBudgetCostUnits) fail('operator_budget_exhausted')
  if (operator) await tx.voiceFundingLot.update({ where: { id: operator.id }, data: { heldCostUnits: { increment: input.maxCostUnits } } })
  await tx.voiceBillingSession.update({ where: { id: session.id }, data: { heldCostUnits: { increment: input.maxCostUnits } } })
  return tx.voiceCostReservation.create({ data: { sessionId: session.id, key: input.key, kind: input.kind, maxCostUnits: input.maxCostUnits } })
}

export async function openVoiceBillingSession(input: OpenSession) {
  key(input.billingRunId, 'billing_run'); credits(input.reserveCredits); date(input.expiresAt); amount(input.initialReserveCostUnits)
  return locked(input.userId, async tx => {
    const existing = await tx.voiceBillingSession.findUnique({ where: { userId_billingRunId: { userId: input.userId, billingRunId: input.billingRunId } } })
    if (existing) {
      if (existing.reservedCredits !== input.reserveCredits || existing.operatorFundingId !== (input.operatorFundingId || null)) fail('voice_session_claim_conflict')
      active(existing)
      await reserveInTransaction(tx, existing, { key: input.initialReservationKey, kind: 'initialization', maxCostUnits: input.initialReserveCostUnits })
      return { ...await tx.voiceBillingSession.findUnique({ where: { id: existing.id } }), newlyCreated: false }
    }
    const now = new Date()
    if (input.expiresAt <= now || input.expiresAt.getTime() - now.getTime() > 15 * 60 * 1000) fail('invalid_voice_session_expiry')
    const manager = new CreditManager(input.userId)
    const allocations = await manager.reserveVoiceCreditsInTransaction(input.reserveCredits, tx)
    if (!allocations) fail('insufficient_credits')
    let operator: any = null, rate: any = null, budget = BigInt(0)
    const resolved: Array<{ allocation: VoiceCreditAllocation; lot: any }> = []
    if (input.operatorFundingId) {
      operator = await tx.voiceFundingLot.findUnique({ where: { id: input.operatorFundingId } })
      if (!operator || operator.kind !== 'operator_test_budget' || operator.userId !== input.userId || operator.revokedAt || operator.expiresAt <= now || input.expiresAt > operator.expiresAt) fail('operator_funding_unavailable')
      budget = BigInt(operator.providerBudgetCostUnits) - BigInt(operator.spentCostUnits) - BigInt(operator.heldCostUnits)
      if (budget <= BigInt(0)) fail('operator_budget_exhausted')
      allocations.forEach(allocation => resolved.push({ allocation, lot: null }))
    } else {
      for (const allocation of allocations) {
        const lot = await tx.voiceFundingLot.findUnique({ where: { sourceKey: sourceKey(input.userId, { bucket: allocation.bucket, sourceId: allocation.sourceId, cycleStartedAt: allocation.cycleStartedAt }) } })
        if (!lot || lot.kind !== 'customer_realized_revenue' || lot.userId !== input.userId || lot.revokedAt || lot.expiresAt <= now || input.expiresAt > lot.expiresAt
          || lot.committedCredits + allocation.credits > lot.creditsIssued) fail('voice_source_revenue_unverified')
        if (!rate || lot.netUsdMicros * BigInt(rate.creditsIssued) < rate.netUsdMicros * BigInt(lot.creditsIssued)) rate = lot
        resolved.push({ allocation, lot })
        await tx.voiceFundingLot.update({ where: { id: lot.id }, data: { committedCredits: { increment: allocation.credits } } })
      }
      if (!rate || rate.netUsdMicros <= BigInt(0)) fail('voice_source_revenue_unverified')
      // The rate represents the lowest verified unit value across sources.
      // More credits may span several lots, so calculate without treating the
      // cheapest lot's original size as the session's allocation limit.
      budget = rate.netUsdMicros * VOICE_COST_UNITS_PER_USD_MICRO * (BigInt(10000) - VOICE_TARGET_NET_MARGIN_BPS) * BigInt(input.reserveCredits) / (BigInt(rate.creditsIssued) * BigInt(10000))
    }
    const session = await tx.voiceBillingSession.create({ data: { userId: input.userId, billingRunId: input.billingRunId, mode: operator ? 'operator_test_budget' : 'customer_realized_revenue', operatorFundingId: operator?.id || null,
      reservedCredits: input.reserveCredits, rateNetUsdMicros: rate?.netUsdMicros || BigInt(0), rateCredits: rate?.creditsIssued || 0,
      marginBps: Number(VOICE_TARGET_NET_MARGIN_BPS), providerBudgetCostUnits: budget, expiresAt: input.expiresAt } })
    for (const { allocation, lot } of resolved) await tx.voiceSessionAllocation.create({ data: { sessionId: session.id, fundingLotId: lot?.id || null, bucket: allocation.bucket,
      sourceId: allocation.sourceId, cycleStartedAt: allocation.cycleStartedAt ? new Date(allocation.cycleStartedAt) : null, reservedCredits: allocation.credits } })
    await reserveInTransaction(tx, session, { key: input.initialReservationKey, kind: 'initialization', maxCostUnits: input.initialReserveCostUnits })
    return { ...await tx.voiceBillingSession.findUnique({ where: { id: session.id } }), newlyCreated: true }
  })
}

export async function reserveVoiceSessionCost(input: { userId: string; sessionId: string; key: string; kind: string; maxCostUnits: bigint }) {
  return locked(input.userId, async tx => reserveInTransaction(tx, await sessionFor(tx, input.userId, input.sessionId), input))
}

export async function bindVoiceProviderConnection(input: { userId: string; sessionId: string; key: string; providerSessionId: string }) {
  key(input.providerSessionId, 'provider_session')
  return locked(input.userId, async tx => {
    const session = await sessionFor(tx, input.userId, input.sessionId); active(session)
    const hold = await tx.voiceCostReservation.findUnique({ where: { sessionId_key: { sessionId: session.id, key: input.key } } })
    if (!hold || hold.state !== 'PENDING' || (hold.providerSessionId && hold.providerSessionId !== input.providerSessionId)) fail('voice_provider_binding_conflict')
    return tx.voiceCostReservation.update({ where: { id: hold.id }, data: { providerSessionId: input.providerSessionId } })
  })
}

type CostReceipt = { userId: string; sessionId: string; key: string; actualCostUnits: bigint; receiptDigest: string }
async function recordCost(input: CostReceipt, final: boolean) {
  amount(input.actualCostUnits)
  if (!/^[a-f0-9]{64}$/.test(input.receiptDigest)) fail('invalid_voice_receipt_digest')
  return locked(input.userId, async tx => {
    const session = await sessionFor(tx, input.userId, input.sessionId)
    const hold = await tx.voiceCostReservation.findUnique({ where: { sessionId_key: { sessionId: session.id, key: input.key } } })
    if (!hold) fail('voice_reservation_missing')
    if (hold.state === 'SETTLED') {
      if (hold.actualCostUnits !== input.actualCostUnits || hold.receiptDigest !== input.receiptDigest) fail('voice_receipt_conflict')
      return hold
    }
    if (session.state === 'CLOSED') fail('voice_session_closed')
    if (input.actualCostUnits < hold.observedCostUnits) fail('voice_usage_regressed')
    const observed = BigInt(hold.observedCostUnits), maximum = BigInt(hold.maxCostUnits)
    const increment = input.actualCostUnits - observed
    const previousHeld = maximum > observed ? maximum - observed : BigInt(0)
    const nextHeld = final ? BigInt(0) : maximum > input.actualCostUnits ? maximum - input.actualCostUnits : BigInt(0)
    const released = previousHeld - nextHeld
    const overrun = input.actualCostUnits > hold.maxCostUnits
    const operator = await operatorFor(tx, session, false)
    if (operator) await tx.voiceFundingLot.update({ where: { id: operator.id }, data: { spentCostUnits: { increment }, heldCostUnits: { decrement: released } } })
    await tx.voiceBillingSession.update({ where: { id: session.id }, data: { spentCostUnits: { increment }, heldCostUnits: { decrement: released }, ...(overrun ? { state: 'UNCERTAIN' } : {}) } })
    return tx.voiceCostReservation.update({ where: { id: hold.id }, data: { observedCostUnits: input.actualCostUnits, ...(final ? { actualCostUnits: input.actualCostUnits, receiptDigest: input.receiptDigest, state: overrun ? 'UNCERTAIN' : 'SETTLED' } : {}) } })
  })
}
export const checkpointVoiceSessionCost = (input: CostReceipt) => recordCost(input, false)
export const settleVoiceSessionCost = (input: CostReceipt) => recordCost(input, true)

export async function closeVoiceBillingSession(input: { userId: string; sessionId: string; finalUsageConfirmed: boolean }) {
  return locked(input.userId, async tx => {
    const session = await sessionFor(tx, input.userId, input.sessionId)
    if (session.state === 'CLOSED') return session
    const holds = await tx.voiceCostReservation.findMany({ where: { sessionId: session.id } })
    if (!input.finalUsageConfirmed || holds.some((hold: any) => hold.state !== 'SETTLED') || session.heldCostUnits !== BigInt(0) || session.spentCostUnits > session.providerBudgetCostUnits) {
      return tx.voiceBillingSession.update({ where: { id: session.id }, data: { state: 'UNCERTAIN', finalUsageConfirmed: false } })
    }
    const charge = session.mode === 'operator_test_budget' ? (session.spentCostUnits > BigInt(0) ? session.reservedCredits : 0)
      : Number(voiceCreditsForCumulativeCost(fundingFromSession(session), session.spentCostUnits))
    if (charge > session.reservedCredits) fail('voice_settlement_exceeds_reserved_credits')
    const allocations = await tx.voiceSessionAllocation.findMany({ where: { sessionId: session.id }, orderBy: { id: 'asc' } })
    let toCharge = charge, refunded = 0, forfeited = 0
    const manager = new CreditManager(input.userId)
    for (const allocation of allocations) {
      const charged = Math.min(toCharge, allocation.reservedCredits), release = allocation.reservedCredits - charged
      toCharge -= charged
      const refund = release ? await manager.refundVoiceCreditsInTransaction([{ bucket: allocation.bucket, sourceId: allocation.sourceId,
        cycleStartedAt: allocation.cycleStartedAt?.toISOString() || null, credits: release }], tx) : { refundedCredits: 0, forfeitedCredits: 0 }
      refunded += refund.refundedCredits; forfeited += refund.forfeitedCredits
      if (allocation.fundingLotId && release) await tx.voiceFundingLot.update({ where: { id: allocation.fundingLotId }, data: { committedCredits: { decrement: release } } })
      await tx.voiceSessionAllocation.update({ where: { id: allocation.id }, data: { chargedCredits: charged, refundedCredits: refund.refundedCredits, forfeitedCredits: refund.forfeitedCredits } })
    }
    if (toCharge !== 0) fail('voice_allocation_receipt_inconsistent')
    return tx.voiceBillingSession.update({ where: { id: session.id }, data: { state: 'CLOSED', chargedCredits: charge, refundedCredits: refunded, forfeitedCredits: forfeited,
      finalUsageConfirmed: true, closedAt: new Date() } })
  })
}

export async function getVoiceBillingSession(userId: string, sessionId: string) {
  return locked(userId, async tx => {
    const session = await sessionFor(tx, userId, sessionId)
    return { ...session, reservations: await tx.voiceCostReservation.findMany({ where: { sessionId } }) }
  })
}

export async function revokeVoiceFundingLot(input: { userId: string; fundingLotId: string }) {
  return locked(input.userId, async tx => {
    const lot = await tx.voiceFundingLot.findUnique({ where: { id: key(input.fundingLotId, 'funding_lot') } })
    if (!lot || lot.userId !== input.userId) fail('voice_funding_not_found')
    await tx.voiceFundingLot.update({ where: { id: lot.id }, data: { revokedAt: new Date() } })
    const allocations = await tx.voiceSessionAllocation.findMany({ where: { fundingLotId: lot.id } })
    const sessions = await tx.voiceBillingSession.findMany({ where: { userId: input.userId, state: 'OPEN' } })
    for (const session of sessions) if (session.operatorFundingId === lot.id || allocations.some((allocation: any) => allocation.sessionId === session.id)) {
      await tx.voiceBillingSession.update({ where: { id: session.id }, data: { state: 'UNCERTAIN' } })
    }
    // No automatic hold release while a provider session may still be running.
    return tx.voiceFundingLot.findUnique({ where: { id: lot.id } })
  })
}
