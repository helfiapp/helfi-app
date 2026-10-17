// Server financial policy only. No provider, wallet, environment or IO access.
// Rates checked 18 October 2026 against OpenAI's GPT-6 Luna model/pricing pages.
// A funding proof MUST be assembled from trusted settlement/accounting records,
// never request JSON, nominal storefront prices or an existing credit balance.
export const VOICE_TARGET_NET_MARGIN_BPS = BigInt(5000)
export const VOICE_COST_UNITS_PER_USD_MICRO = BigInt(60000)
const BASIS_POINTS = BigInt(10000)
const USD_MICROS_PER_USD = BigInt(1000000)

export class VoiceCostPolicyError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'VoiceCostPolicyError' }
}

function nonnegative(value: bigint, field: string): bigint {
  if (typeof value !== 'bigint' || value < BigInt(0)) throw new VoiceCostPolicyError(`invalid_${field}`)
  return value
}
function positive(value: bigint, field: string): bigint {
  if (nonnegative(value, field) === BigInt(0)) throw new VoiceCostPolicyError(`invalid_${field}`)
  return value
}
function ceilDivide(value: bigint, divisor: bigint): bigint {
  return (value + divisor - BigInt(1)) / divisor
}
const nonempty = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 512

export type VoiceRevenueDeductions = {
  storeFee: bigint
  paymentFee: bigint
  tax: bigint
  fx: bigint
  affiliate: bigint
  refunds: bigint
  otherVariableCosts: bigint
}
export type VoiceCustomerFundingProof = {
  kind: 'customer_realized_revenue'
  accountId: string
  purchaseId: string
  settlementEvidenceId: string
  // Actual USD received before the deductions below, AFTER discounts. An
  // actual FX-converted settlement is required for non-USD purchases.
  paidUsdMicros: bigint
  creditsIssued: bigint
  deductionsUsdMicros: VoiceRevenueDeductions
  verified: {
    purchase: boolean
    settlement: boolean
    currencyConversion: boolean
    creditAllocation: boolean
    storeFee: boolean
    paymentFee: boolean
    tax: boolean
    fx: boolean
    affiliate: boolean
    refunds: boolean
    otherVariableCosts: boolean
  }
}
export type VoiceOperatorFundingProof = {
  kind: 'operator_test_budget'
  authorizationId: string
  fundingEvidenceId: string
  accountId: string
  fundedUsdMicros: bigint
  fundingConfirmed: boolean
  expiresAtMs: number
}
export type VoiceFunding =
  | { kind: 'customer_realized_revenue'; netUsdMicros: bigint; creditsIssued: bigint; providerBudgetCostUnits: bigint }
  | { kind: 'operator_test_budget'; providerBudgetCostUnits: bigint }
export type VoiceFundingDecision = { allowed: true; funding: VoiceFunding } | { allowed: false; reason: string }

export function proveVoiceFunding(proof: VoiceCustomerFundingProof | VoiceOperatorFundingProof, context: { accountId: string; nowMs: number }): VoiceFundingDecision {
  try {
    if (proof?.kind === 'operator_test_budget') {
      if (!proof.fundingConfirmed || !nonempty(proof.authorizationId) || !nonempty(proof.fundingEvidenceId)
        || !nonempty(context.accountId) || proof.accountId !== context.accountId
        || !Number.isSafeInteger(context.nowMs) || !Number.isSafeInteger(proof.expiresAtMs) || context.nowMs >= proof.expiresAtMs) return { allowed: false, reason: 'operator_funding_unverified' }
      const funded = positive(proof.fundedUsdMicros, 'operator_funding')
      // Operator-funded tests are explicit expenses. They promise NO margin
      // and cannot be turned into fictitious customer credit revenue.
      return { allowed: true, funding: { kind: proof.kind, providerBudgetCostUnits: funded * VOICE_COST_UNITS_PER_USD_MICRO } }
    }
    if (proof?.kind !== 'customer_realized_revenue' || !nonempty(context.accountId) || proof.accountId !== context.accountId
      || !nonempty(proof.purchaseId) || !nonempty(proof.settlementEvidenceId)) return { allowed: false, reason: 'realized_revenue_unverified' }
    const required = ['purchase', 'settlement', 'currencyConversion', 'creditAllocation', 'storeFee', 'paymentFee', 'tax', 'fx', 'affiliate', 'refunds', 'otherVariableCosts'] as const
    if (required.some(field => proof.verified?.[field] !== true)) return { allowed: false, reason: 'realized_revenue_unverified' }
    const paid = positive(proof.paidUsdMicros, 'paid_revenue'), credits = positive(proof.creditsIssued, 'issued_credits')
    const fields = ['storeFee', 'paymentFee', 'tax', 'fx', 'affiliate', 'refunds', 'otherVariableCosts'] as const
    const deducted = fields.reduce((sum, field) => sum + nonnegative(proof.deductionsUsdMicros?.[field], field), BigInt(0))
    if (deducted >= paid) return { allowed: false, reason: 'no_positive_realized_revenue' }
    const net = paid - deducted
    return { allowed: true, funding: { kind: proof.kind, netUsdMicros: net, creditsIssued: credits,
      providerBudgetCostUnits: net * VOICE_COST_UNITS_PER_USD_MICRO * (BASIS_POINTS - VOICE_TARGET_NET_MARGIN_BPS) / BASIS_POINTS } }
  } catch (error) {
    return { allowed: false, reason: error instanceof VoiceCostPolicyError ? error.code : 'invalid_funding_proof' }
  }
}

export function voiceCostUnitsToUsdMicrosCeil(costUnits: bigint): bigint {
  return ceilDivide(nonnegative(costUnits, 'cost_units'), VOICE_COST_UNITS_PER_USD_MICRO)
}
export function voiceExternalCostUnits(usdMicros: bigint): bigint {
  return nonnegative(usdMicros, 'external_cost') * VOICE_COST_UNITS_PER_USD_MICRO
}
export function liveVoiceCostUnits(input: { model: string; allocated: boolean; durationMs: bigint }): bigint {
  if (input.model !== 'gpt-live-1') throw new VoiceCostPolicyError('unsupported_voice_model')
  const measured = nonnegative(input.durationMs, 'duration')
  const billableMs = input.allocated && measured < BigInt(15000) ? BigInt(15000) : measured
  // $0.05/min = 50,000 microUSD/60,000ms. The chosen exact cost unit
  // denominator represents this and every supported token rate without loss.
  return billableMs * BigInt(50000)
}

type VoicePricingContext = { model: string; serviceTier: string; regionalProcessing: boolean }
function pricing(input: VoicePricingContext, inputTokens: bigint) {
  if (input.model !== 'gpt-6-luna') throw new VoiceCostPolicyError('unsupported_backend_model')
  if (input.serviceTier !== 'default' && input.serviceTier !== 'standard') throw new VoiceCostPolicyError('unsupported_service_tier')
  if (input.regionalProcessing !== false) throw new VoiceCostPolicyError('regional_price_unverified')
  const long = inputTokens > BigInt(272000)
  return { ordinary: long ? BigInt(200000) : BigInt(100000), cached: long ? BigInt(20000) : BigInt(10000), written: long ? BigInt(250000) : BigInt(125000), output: long ? BigInt(750000) : BigInt(500000) }
}

export function voiceBackendCostUnits(input: VoicePricingContext & { inputTokens: bigint; cachedInputTokens: bigint; cacheWriteTokens: bigint; outputTokens: bigint }): bigint {
  const total = nonnegative(input.inputTokens, 'input_tokens'), cached = nonnegative(input.cachedInputTokens, 'cached_tokens')
  const written = nonnegative(input.cacheWriteTokens, 'cache_write_tokens'), output = nonnegative(input.outputTokens, 'output_tokens')
  if (cached + written > total) throw new VoiceCostPolicyError('inconsistent_cache_tokens')
  const rates = pricing(input, total)
  return ((total - cached - written) * rates.ordinary + cached * rates.cached + written * rates.written + output * rates.output) * VOICE_COST_UNITS_PER_USD_MICRO / USD_MICROS_PER_USD
}

export function voiceBackendCostQuote(input: VoicePricingContext & { inputTokens: bigint; cachedInputTokens: bigint; cacheWriteTokens: bigint | null; outputTokens: bigint }): { costUnits: bigint; costBasis: 'reported_usage' | 'conservative_cache_write_bound'; invoiceConfirmed: false } {
  if (input.cacheWriteTokens !== null) return { costUnits: voiceBackendCostUnits(input as VoicePricingContext & { inputTokens: bigint; cachedInputTokens: bigint; cacheWriteTokens: bigint; outputTokens: bigint }), costBasis: 'reported_usage', invoiceConfirmed: false }
  const total = nonnegative(input.inputTokens, 'input_tokens'), cached = nonnegative(input.cachedInputTokens, 'cached_tokens')
  if (cached > total) throw new VoiceCostPolicyError('inconsistent_cache_tokens')
  // Missing provider write accounting is not zero. Charging the upper bound
  // covers every possible ordinary/write split at these verified rates; the
  // caller must retain this explicit basis rather than claim an invoice.
  return { costUnits: voiceBackendCostUnits({ ...input, cacheWriteTokens: total - cached }), costBasis: 'conservative_cache_write_bound', invoiceConfirmed: false }
}

export function reserveVoiceBackendCostUnits(input: VoicePricingContext & { maxInputTokens: bigint; maxOutputTokens: bigint; externalCostReserveUsdMicros: bigint; externalCostsVerified: boolean }): bigint {
  const maxInput = nonnegative(input.maxInputTokens, 'max_input_tokens'), maxOutput = positive(input.maxOutputTokens, 'max_output_tokens')
  if (input.externalCostsVerified !== true) throw new VoiceCostPolicyError('external_costs_unverified')
  const rates = pricing(input, maxInput)
  // All input at the higher cache-WRITE rate is conservative even if the
  // request writes its whole prompt; ordinary/cached input would cost less.
  return (maxInput * rates.written + maxOutput * rates.output) * VOICE_COST_UNITS_PER_USD_MICRO / USD_MICROS_PER_USD
    + voiceExternalCostUnits(input.externalCostReserveUsdMicros)
}

export function voiceProviderBudgetForCredits(funding: VoiceFunding, credits: bigint): bigint {
  if (funding.kind !== 'customer_realized_revenue') throw new VoiceCostPolicyError('operator_budget_is_not_credit_revenue')
  const requested = nonnegative(credits, 'covered_credits')
  if (requested > funding.creditsIssued) throw new VoiceCostPolicyError('credits_exceed_verified_allocation')
  return funding.netUsdMicros * VOICE_COST_UNITS_PER_USD_MICRO * (BASIS_POINTS - VOICE_TARGET_NET_MARGIN_BPS) * requested / (funding.creditsIssued * BASIS_POINTS)
}

export function voiceCreditsForCumulativeCost(funding: VoiceFunding, cumulativeCostUnits: bigint): bigint {
  if (funding.kind !== 'customer_realized_revenue') throw new VoiceCostPolicyError('operator_budget_is_not_credit_revenue')
  return ceilDivide(nonnegative(cumulativeCostUnits, 'cumulative_cost') * funding.creditsIssued * BASIS_POINTS,
    funding.netUsdMicros * VOICE_COST_UNITS_PER_USD_MICRO * (BASIS_POINTS - VOICE_TARGET_NET_MARGIN_BPS))
}

// coveredCredits is the total exclusively allocated to THIS session: credits
// already settled plus its still-locked credits. It is not the free wallet
// balance, which other requests may concurrently spend. Its lock/ownership,
// funding-lot consumption and idempotent updates belong in a DB transaction.
export function canReserveVoiceCost(input: { funding: VoiceFunding; coveredCredits: bigint; spentCostUnits: bigint; pendingCostUnits: bigint; requestedCostUnits: bigint }): { allowed: boolean; providerBudgetCostUnits: bigint; remainingCostUnits: bigint } {
  const spent = nonnegative(input.spentCostUnits, 'spent_cost'), pending = nonnegative(input.pendingCostUnits, 'pending_cost'), requested = nonnegative(input.requestedCostUnits, 'requested_cost')
  const budget = input.funding.kind === 'operator_test_budget' ? input.funding.providerBudgetCostUnits : voiceProviderBudgetForCredits(input.funding, input.coveredCredits)
  const remaining = budget > spent + pending ? budget - spent - pending : BigInt(0)
  return { allowed: spent + pending + requested <= budget, providerBudgetCostUnits: budget, remainingCostUnits: remaining }
}
