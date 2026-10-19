import { createHash } from 'node:crypto'
import { liveVoiceCostUnits, reserveVoiceBackendCostUnits, voiceBackendCostQuote } from './voice-cost-policy'

type Row = Record<string, any>
export type ClosedVoiceCollateralInput = { actorId: string; runtime: Row; financial: Row; fundingLots: Row[] }
const nonnegative = (value: unknown): value is bigint => typeof value === 'bigint' && value >= BigInt(0)
const integer = (value: unknown, maximum: number): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum
const units = (value: unknown): bigint | null => typeof value === 'string' && /^\d{1,30}$/.test(value) ? BigInt(value) : null
const opaque = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value)
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const digest = (value: any) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const receipt = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const OVERHEAD = BigInt(3000000000), CONFIG_POLICY = 'voice-service-overhead-2026-10-18-v1', RECEIPT_POLICY = 'voice-service-overhead-allocation-v1'

/** Read-only permission to allocate a DIFFERENT session. It neither settles
 * the old call nor releases money/credits. Call under the same account lock as
 * the ledger, using complete owned DB rows; missing proof always refuses.
 * Expiry does not erase existing collateral. New funding/expiry is separately
 * enforced by the normal ledger when opening the next session. */
export function canStartAfterClosedVoice(input: ClosedVoiceCollateralInput): boolean {
  try {
    const { actorId, runtime: runtime, financial: bill, fundingLots } = input
    if (!opaque(actorId) || !runtime || !bill || runtime.userId !== actorId || bill.userId !== actorId || !opaque(runtime.sessionId) || bill.id !== runtime.sessionId || runtime.state !== 'uncertain' || bill.state !== 'UNCERTAIN' || !opaque(runtime.providerSessionId)) return false
    const config = runtime.configuration, jobs = runtime.toolJobs, completion = jobs?.completion
    if (!config || !opaque(config.voiceHoldKey) || !opaque(config.infrastructureHoldKey) || config.voiceHoldKey === config.infrastructureHoldKey || config.infrastructurePolicyVersion !== CONFIG_POLICY || !completion || completion.finalUsageConfirmed !== true || !integer(completion.durationMs,900000) || !receipt(completion.receiptDigest) || !Array.isArray(jobs.jobs) || jobs.jobs.length > 20 || jobs.jobs.some((job: any) => job.status !== 'completed') || !Array.isArray(jobs.receipts) || jobs.receipts.length > 20) return false
    if (![bill.spentCostUnits,bill.heldCostUnits,bill.providerBudgetCostUnits].every(nonnegative) || bill.spentCostUnits + bill.heldCostUnits > bill.providerBudgetCostUnits || !integer(bill.reservedCredits,2147483647) || bill.reservedCredits < 1 || bill.chargedCredits !== 0 || bill.refundedCredits !== 0 || bill.forfeitedCredits !== 0) return false
    const holds = bill.reservations, allocations = bill.allocations
    if (!Array.isArray(holds) || holds.length < 2 || holds.length > 23 || new Set(holds.map(hold => hold.key)).size !== holds.length || !Array.isArray(allocations) || !allocations.length || allocations.length > 100 || !Array.isArray(fundingLots) || fundingLots.length > 100 || new Set(fundingLots.map(lot=>lot.id)).size !== fundingLots.length) return false
    let spent = BigInt(0), held = BigInt(0)
    for (const hold of holds) {
      if (hold.sessionId !== bill.id || !opaque(hold.key) || !nonnegative(hold.maxCostUnits) || !nonnegative(hold.observedCostUnits) || hold.observedCostUnits > hold.maxCostUnits || !['PENDING','SETTLED'].includes(hold.state)) return false
      if (hold.state === 'SETTLED') {
        if (!nonnegative(hold.actualCostUnits) || hold.actualCostUnits !== hold.observedCostUnits || !receipt(hold.receiptDigest)) return false
      } else {
        if (hold.kind !== 'backend' || hold.observedCostUnits !== BigInt(0) || hold.actualCostUnits !== null || hold.receiptDigest !== null) return false
        held += hold.maxCostUnits
      }
      spent += hold.observedCostUnits
    }
    if (spent !== bill.spentCostUnits || held !== bill.heldCostUnits) return false
    const voice = holds.find(hold=>hold.key===config.voiceHoldKey), overhead = holds.find(hold=>hold.key===config.infrastructureHoldKey)
    const voiceCost = liveVoiceCostUnits({model:'gpt-live-1',allocated:true,durationMs:BigInt(completion.durationMs)})
    if (!voice || voice.kind !== 'voice_duration' || voice.state !== 'SETTLED' || voice.providerSessionId !== runtime.providerSessionId || voice.maxCostUnits !== units(config.voiceReservedCostUnits) || voice.actualCostUnits !== voiceCost || voice.receiptDigest !== completion.receiptDigest) return false
    if (!overhead || overhead.kind !== 'service_overhead_allocation' || overhead.state !== 'SETTLED' || overhead.maxCostUnits !== OVERHEAD || overhead.actualCostUnits !== OVERHEAD || overhead.receiptDigest !== digest({sessionId:bill.id,policy:RECEIPT_POLICY,allocatedOverheadCostUnits:OVERHEAD.toString()})) return false
    const backends = holds.filter(hold=>hold.kind==='backend')
    if (backends.length !== jobs.receipts.length || new Set(jobs.receipts.map((row:any)=>row.key)).size !== jobs.receipts.length) return false
    const responseIds = new Set<string>()
    for (const hold of backends) {
      const entry = jobs.receipts.find((row:any)=>row.key===hold.key), reservation = entry?.reservation, settled = entry?.settled
      if (!reservation || reservation.key !== hold.key || !integer(reservation.maxInputTokens,168192) || reservation.maxInputTokens < 1 || !integer(reservation.maxOutputTokens,4096) || reservation.maxOutputTokens < 1) return false
      const maximum = reserveVoiceBackendCostUnits({model:'gpt-6-luna',serviceTier:'default',regionalProcessing:false,maxInputTokens:BigInt(reservation.maxInputTokens),maxOutputTokens:BigInt(reservation.maxOutputTokens),externalCostReserveUsdMicros:BigInt(0),externalCostsVerified:true})
      if (hold.maxCostUnits !== maximum || units(reservation.maxCostUnits) !== maximum) return false
      if (hold.state === 'PENDING') { if (settled) return false; continue }
      if (!settled || !opaque(settled.providerResponseId) || responseIds.has(settled.providerResponseId) || settled.receiptDigest !== hold.receiptDigest || settled.invoiceConfirmed !== false || units(settled.actualCostUnits) !== hold.actualCostUnits) return false
      const usage = settled.usage
      if (!usage || !integer(usage.inputTokens,reservation.maxInputTokens) || !integer(usage.cachedInputTokens,reservation.maxInputTokens) || !integer(usage.outputTokens,reservation.maxOutputTokens) || typeof usage.cacheWriteTokensMissing !== 'boolean' || usage.cacheWriteTokensMissing !== (usage.cacheWriteTokens === null) || usage.cacheWriteTokens !== null && !integer(usage.cacheWriteTokens,reservation.maxInputTokens)) return false
      const quote = voiceBackendCostQuote({model:'gpt-6-luna',serviceTier:'default',regionalProcessing:false,inputTokens:BigInt(usage.inputTokens),cachedInputTokens:BigInt(usage.cachedInputTokens),cacheWriteTokens:usage.cacheWriteTokens === null ? null : BigInt(usage.cacheWriteTokens),outputTokens:BigInt(usage.outputTokens)})
      if (quote.costUnits !== hold.actualCostUnits || quote.costBasis !== settled.costBasis) return false
      responseIds.add(settled.providerResponseId)
    }
    if (holds.some(hold=>![voice,overhead,...backends].includes(hold) && !(hold.kind==='initialization'&&hold.state==='SETTLED'&&hold.maxCostUnits===BigInt(0)&&hold.actualCostUnits===BigInt(0)))) return false
    if (allocations.some(row=>row.sessionId!==bill.id || !integer(row.reservedCredits,2147483647) || row.reservedCredits < 1 || row.chargedCredits !== 0 || row.refundedCredits !== 0 || row.forfeitedCredits !== 0) || allocations.reduce((sum,row)=>sum+row.reservedCredits,0)!==bill.reservedCredits) return false
    if (bill.mode === 'operator_test_budget') {
      const lot = fundingLots.find(lot=>lot.id===bill.operatorFundingId)
      return Boolean(lot && fundingLots.length===1 && lot.userId===actorId && lot.kind==='operator_test_budget' && !lot.revokedAt && [lot.providerBudgetCostUnits,lot.spentCostUnits,lot.heldCostUnits].every(nonnegative) && lot.spentCostUnits>=spent && lot.heldCostUnits>=held && lot.spentCostUnits+lot.heldCostUnits<=lot.providerBudgetCostUnits && bill.providerBudgetCostUnits<=lot.providerBudgetCostUnits && allocations.every(row=>row.fundingLotId===null))
    }
    if (bill.mode !== 'customer_realized_revenue' || bill.operatorFundingId !== null || bill.marginBps !== 5000 || !nonnegative(bill.rateNetUsdMicros) || bill.rateNetUsdMicros <= BigInt(0) || !integer(bill.rateCredits,2147483647) || bill.rateCredits<1) return false
    const ids = new Set(allocations.map(row=>row.fundingLotId))
    if (ids.size!==fundingLots.length || fundingLots.some(lot=>!ids.has(lot.id))) return false
    let minimumMatched = false
    for (const lot of fundingLots) {
      const rows = allocations.filter(row=>row.fundingLotId===lot.id), committed = rows.reduce((sum,row)=>sum+row.reservedCredits,0)
      if (lot.userId!==actorId || lot.kind!=='customer_realized_revenue' || lot.revokedAt || !nonnegative(lot.netUsdMicros) || lot.netUsdMicros<=BigInt(0) || !integer(lot.creditsIssued,2147483647) || lot.creditsIssued<1 || !integer(lot.committedCredits,lot.creditsIssued) || lot.committedCredits<committed || rows.some(row=>row.bucket!==lot.sourceBucket||row.sourceId!==lot.sourceId||String(row.cycleStartedAt??'')!==String(lot.cycleStartedAt??''))) return false
      const a=bill.rateNetUsdMicros*BigInt(lot.creditsIssued),b=lot.netUsdMicros*BigInt(bill.rateCredits)
      if(a>b)return false
      minimumMatched ||= a===b
    }
    return minimumMatched && bill.providerBudgetCostUnits === bill.rateNetUsdMicros*BigInt(60000)*BigInt(bill.reservedCredits)/(BigInt(bill.rateCredits)*BigInt(2))
  } catch { return false }
}
