// Measurement only: never authorizes work, charges a wallet or enforces a budget.
// Published USD rates checked 18 October 2026:
// https://developers.openai.com/api/docs/models/gpt-6-luna
// https://developers.openai.com/api/docs/guides/voice-latency-cost
// One tracker represents ONE allocated provider connection, including reconnects.
type ObjectValue = Record<string, unknown>

export type LiveVoiceUsageOptions = {
  voiceModel?: string
  backendModel?: string
  serviceTier?: string
}

export type LiveVoiceUsageSummary = {
  allocated: boolean
  sessionClosed: boolean
  finalUsageReceived: boolean
  finalComplete: boolean
  costIncomplete: boolean
  invoiceConfirmed: false
  providerSeconds: number
  estimatedBillableSeconds: number
  responseCount: number
  responsesWithUsage: number
  missingUsageResponses: number
  unknownModelResponses: number
  unknownTierResponses: number
  incompleteCacheResponses: number
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  outputTokens: number
  voiceUsdAtPublishedRate: number | null
  backendUsdAtStandardRates: number | null
  totalUsdAtStandardRates: number | null
}

type ResponseMeasurement = {
  terminal: boolean
  valid: boolean
  input: number
  cached: number
  written: number
  output: number
  modelKnown: boolean
  tierKnown: boolean
  cacheKnown: boolean
  usd: number
}

const object = (value: unknown): ObjectValue | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : null
const tokenCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const secondsCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512
const emptyResponse = (): ResponseMeasurement => ({ terminal: false, valid: false, input: 0, cached: 0, written: 0, output: 0, modelKnown: false, tierKnown: false, cacheKnown: false, usd: 0 })
const usd = (value: number) => Math.round(value * 1e12) / 1e12

export function createLiveVoiceUsageTracker(options: LiveVoiceUsageOptions = {}) {
  // IDs are retained only inside this closure for deduplication. No payload,
  // transcript, model name, error text, account ID or response ID is returned.
  const responses = new Map<string, ResponseMeasurement>()
  let allocated = false
  let providerSeconds = 0
  let sessionClosed = false
  let finalUsageReceived = false
  let malformedTerminal = false
  let inconsistentFinal = false
  let backendExternallyMetered = false

  const recordSeconds = (value: unknown) => {
    if (!secondsCount(value)) return false
    providerSeconds = Math.max(providerSeconds, value)
    return true
  }

  const recordResponse = (event: ObjectValue) => {
    const response = object(event.response)
    const id = response?.id
    const terminal = event.type === 'response.completed' || event.type === 'response.incomplete' || event.type === 'response.failed' || event.type === 'response.cancelled'
    if (!identifier(id)) {
      if (terminal) malformedTerminal = true
      return
    }
    const previous = responses.get(id)
    // A repeated terminal receipt cannot add tokens or replace its first usage.
    if (previous?.terminal) return
    if (!terminal) {
      if (event.type === 'response.created' || event.type === 'response.in_progress') responses.set(id, previous || emptyResponse())
      return
    }
    const result = emptyResponse()
    result.terminal = true
    responses.set(id, result)
    const usage = object(response?.usage)
    const details = object(usage?.input_tokens_details)
    const input = usage?.input_tokens, output = usage?.output_tokens
    const cached = details?.cached_tokens, rawWritten = details?.cache_write_tokens
    // Missing cache-write accounting is explicitly uncertain, rather than
    // silently presented as an exact zero-write provider bill.
    const written = rawWritten === undefined ? 0 : rawWritten
    if (!tokenCount(input) || !tokenCount(output) || !tokenCount(cached) || !tokenCount(written) || cached + written > input) return
    if (usage?.total_tokens !== undefined && (!tokenCount(usage.total_tokens) || usage.total_tokens !== input + output)) return
    const model = response?.model === undefined ? options.backendModel : response.model
    const tier = response?.service_tier === undefined ? options.serviceTier : response.service_tier
    result.valid = true
    result.input = input; result.output = output; result.cached = cached; result.written = written
    result.modelKnown = model === 'gpt-6-luna'
    result.tierKnown = tier === 'default' || tier === 'standard'
    result.cacheKnown = tokenCount(rawWritten)
    // This is always an explicitly STANDARD-rate estimate, even when the
    // effective tier is unknown or unsupported. Never an invoice assertion.
    if (result.modelKnown) {
      const long = input > 272000
      result.usd = ((input - cached - written) * (long ? 0.20 : 0.10)
        + cached * (long ? 0.02 : 0.01)
        + written * (long ? 0.25 : 0.125)
        + output * (long ? 0.75 : 0.50)) / 1e6
    }
  }

  return {
    markAllocated() { allocated = true },
    markBackendExternallyMetered() { backendExternallyMetered = true },
    record(payload: unknown) {
      const event = object(payload)
      if (!event) return
      if (event.type === 'session.usage.updated') {
        const value = object(event.usage)?.seconds
        if (finalUsageReceived && secondsCount(value) && value > providerSeconds) inconsistentFinal = true
        recordSeconds(value)
      } else if (event.type === 'session.closed') {
        sessionClosed = true
        if (finalUsageReceived) return
        const value = object(event.usage)?.seconds
        if (secondsCount(value)) {
          inconsistentFinal = value < providerSeconds
          recordSeconds(value)
          finalUsageReceived = true
        }
      } else if (event.type === 'response.event') {
        const nested = object(event.event)
        if (nested) recordResponse(nested)
      }
    },
    summary(): LiveVoiceUsageSummary {
      const values = [...responses.values()]
      const complete = values.filter(value => value.valid)
      const missing = values.filter(value => !value.valid || !value.terminal).length
      const unknownModel = complete.filter(value => !value.modelKnown).length
      const unknownTier = complete.filter(value => !value.tierKnown).length
      const incompleteCache = complete.filter(value => !value.cacheKnown).length
      const finalComplete = allocated && finalUsageReceived && !inconsistentFinal && !malformedTerminal && missing === 0 && !backendExternallyMetered
      // WebRTC initialization charges 15 seconds; it is credited against
      // duration, not added a second time. This floor is an ESTIMATE, while
      // providerSeconds always preserves the actual reported duration.
      const billable = allocated ? Math.max(15, providerSeconds) : providerSeconds
      const voice = options.voiceModel === 'gpt-live-1' ? usd(billable * 0.05 / 60) : null
      const backend = backendExternallyMetered || missing || malformedTerminal || unknownModel ? null : usd(complete.reduce((sum, value) => sum + value.usd, 0))
      return {
        allocated, sessionClosed, finalUsageReceived, finalComplete,
        costIncomplete: !finalComplete || voice === null || unknownModel > 0 || unknownTier > 0 || incompleteCache > 0,
        invoiceConfirmed: false,
        providerSeconds, estimatedBillableSeconds: billable,
        responseCount: values.length, responsesWithUsage: complete.length, missingUsageResponses: missing,
        unknownModelResponses: unknownModel, unknownTierResponses: unknownTier, incompleteCacheResponses: incompleteCache,
        inputTokens: complete.reduce((sum, value) => sum + value.input, 0),
        cachedInputTokens: complete.reduce((sum, value) => sum + value.cached, 0),
        cacheWriteTokens: complete.reduce((sum, value) => sum + value.written, 0),
        outputTokens: complete.reduce((sum, value) => sum + value.output, 0),
        voiceUsdAtPublishedRate: voice, backendUsdAtStandardRates: backend,
        totalUsdAtStandardRates: voice === null || backend === null ? null : usd(voice + backend),
      }
    },
  }
}
