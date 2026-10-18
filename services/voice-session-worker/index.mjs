/** App-invoked Lambda worker. Importing this file does not read credentials,
 * open a socket, invoke a provider, or bootstrap the app. Tests inject all I/O. */
import { createHash } from 'node:crypto'

const CONTROL_PATH = '/api/internal/voice-session-control'
const MAX_BYTES = 160000, MAX_OUTPUT = 4096, MAX_EVENTS = 4000
const MAX_DELEGATIONS = 10, MAX_BACKEND_CALLS = 20, CLOSE_BUFFER_MS = 5000
const SCALE = 60000000000n
const EXPECTED = {
  scale: SCALE, voiceUnitsPerSecond: 50000000n,
  inputUnitsPerToken: 6000n, cachedInputUnitsPerToken: 600n,
  cacheWriteUnitsPerToken: 7500n, outputUnitsPerToken: 30000n,
  longInputUnitsPerToken: 12000n, longCachedInputUnitsPerToken: 1200n,
  longCacheWriteUnitsPerToken: 15000n, longOutputUnitsPerToken: 45000n,
}
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
const number = value => Number.isSafeInteger(value) && value >= 0
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 300 && !/[\r\n\0]/.test(value)
const units = value => typeof value === 'string' && /^\d{1,30}$/.test(value) ? BigInt(value) : null
const fail = code => { throw new Error(code) }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Live has no transcript-done event. These are bounded application heuristics,
 * never evidence of an exact word boundary or guaranteed complete turn.
 * https://developers.openai.com/api/docs/guides/live-conversations#transcript-deltas */
export function createVoiceTranscriptBoundary(io) {
  const records = [], turns = []
  const GAP_MS = 500, TAIL_MS = 1500, MIN_WAIT_MS = 1500, QUIET_MS = 1000, MAX_WAIT_MS = 4500
  let sealedOffset = -1, sealedEnd = -1
  const add = row => {
    const assistantBetween = records.some(item => item.speaker === 'assistant' && item.start_ms >= sealedEnd && item.end_ms <= row.start_ms)
    const late = row.speaker === 'user' && sealedOffset >= 0 && (row.end_ms <= sealedOffset || row.start_ms < sealedEnd || row.start_ms <= sealedEnd + GAP_MS && !assistantBetween)
    records.push({ ...row, receivedAt: io.now(), owner: late ? 'late_unassigned' : null })
  }
  const register = (id, offset) => { turns.push({ id, offset, receivedAt: io.now() }) }
  const select = turn => {
    const index = turns.indexOf(turn), previous = turns[index - 1]?.offset ?? -1, next = turns[index + 1]
    const available = records.filter(row => row.speaker === 'user' && row.owner === null)
    const selected = available.filter(row => row.start_ms <= turn.offset && row.end_ms > previous)
    let ambiguous = selected.some(row => row.start_ms <= previous)
    let end = selected.length ? Math.max(...selected.map(row => row.end_ms)) : turn.offset
    if (selected.length) {
      for (const row of available.filter(row => row.start_ms > turn.offset).sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms)) {
        if (row.start_ms > end + GAP_MS) break
        if (row.start_ms > turn.offset + TAIL_MS) ambiguous = true
        if (records.some(item => item.speaker === 'assistant' && item.start_ms >= end && item.end_ms <= row.start_ms)) break
        // Approximate timestamps cannot safely divide a nearby caption between
        // two already queued human delegations. Keep the entire span unsent.
        if (next && row.start_ms <= next.offset) ambiguous = true
        selected.push(row); end = Math.max(end, row.end_ms)
      }
    }
    if (next && selected.some(row => row.end_ms >= next.offset)) ambiguous = true
    return { selected, end, ambiguous }
  }
  const settle = async (id, deadlineMs) => {
    const turn = turns.find(item => item.id === id)
    if (!turn) return { ok: false, reason: 'transcript_missing' }
    const limit = Math.min(io.now() + MAX_WAIT_MS, deadlineMs)
    let fingerprint = '', stableAt = io.now(), current
    while (io.isActive() && io.now() < limit) {
      current = select(turn)
      const next = JSON.stringify([current.selected.map(row => records.indexOf(row)), current.ambiguous])
      if (next !== fingerprint) { fingerprint = next; stableAt = Math.max(turn.receivedAt, ...current.selected.map(row => row.receivedAt)) }
      if (current.selected.length && io.now() >= turn.receivedAt + MIN_WAIT_MS && io.now() >= stableAt + QUIET_MS) break
      await io.sleep(Math.min(100, Math.max(1, limit - io.now())))
    }
    if (!io.isActive()) return { ok: false, reason: 'transcript_stopped' }
    current = select(turn)
    if (JSON.stringify([current.selected.map(row => records.indexOf(row)), current.ambiguous]) !== fingerprint) stableAt = io.now()
    const stable = current.selected.length && io.now() >= turn.receivedAt + MIN_WAIT_MS && io.now() >= stableAt + QUIET_MS
    const ok = Boolean(stable && !current.ambiguous)
    for (const row of current.selected) row.owner = ok ? id : 'ambiguous_unassigned'
    sealedOffset = Math.max(sealedOffset, turn.offset)
    sealedEnd = Math.max(sealedEnd, ...current.selected.map(row => row.end_ms))
    if (!ok) return { ok: false, reason: current.ambiguous ? 'transcript_ownership_ambiguous' : 'transcript_not_settled' }
    // Preserve exact delivery order, spaces and repeated words, including
    // complete fragments whose approximate interval crosses the offset.
    const actualHumanText = records.filter(row => row.owner === id).map(row => row.text).join('').trim()
    const snapshot = records.filter(row => row.speaker === 'assistant' ? row.start_ms <= current.end : row.owner !== null && !['late_unassigned', 'ambiguous_unassigned'].includes(row.owner)).map(({ speaker, text, start_ms, end_ms }) => ({ speaker, text, start_ms, end_ms }))
    return actualHumanText ? { ok: true, actualHumanText, snapshot } : { ok: false, reason: 'transcript_missing' }
  }
  return { add, register, settle }
}

export function validateWorkerJob(value, allowOrigin = origin => origin === 'https://helfi.ai') {
  if (!value || typeof value !== 'object' || !id(value.sessionId) || typeof value.controlToken !== 'string' || value.controlToken.length < 16 || value.controlToken.length > 5000 || /[\r\n\0]/.test(value.controlToken)) fail('invalid_worker_job')
  let url
  try { url = new URL(value.appOrigin) } catch { fail('invalid_app_origin') }
  if (url.origin !== value.appOrigin || url.protocol !== 'https:' || !allowOrigin(url.origin)) fail('invalid_app_origin')
  const expiresAtMs = value.expiresAtMs ?? value.expiresAt
  if (!number(expiresAtMs)) fail('invalid_worker_expiry')
  return { sessionId: value.sessionId, controlToken: value.controlToken, appOrigin: url.origin, expiresAtMs }
}

function pricing(value) {
  if (!value || Object.entries(EXPECTED).some(([key, expected]) => units(String(value[key] ?? '')) !== expected)) fail('unsupported_provider_pricing')
  return EXPECTED
}
function configuration(value, now) {
  if (value?.claimed === false || value?.allowed === false) return null
  if (!id(value?.leaseToken) || typeof value.providerKey !== 'string' || !value.providerKey || value.providerKey.length > 10000 || !id(value.providerSessionId)) fail('invalid_worker_claim')
  if (value.backendModel !== 'gpt-6-luna' || typeof value.instructions !== 'string' || !Array.isArray(value.tools) || value.tools.length !== 1 || value.tools[0]?.type !== 'function' || value.tools[0].name !== 'request_helfi_action') fail('unsupported_backend_configuration')
  if (!number(value.maxInputBytes) || value.maxInputBytes < 1000 || value.maxInputBytes > MAX_BYTES || !number(value.maxOutputTokens) || value.maxOutputTokens < 16 || value.maxOutputTokens > MAX_OUTPUT) fail('invalid_backend_limits')
  if (!number(value.deadlineMs) || value.deadlineMs <= now + CLOSE_BUFFER_MS || value.deadlineMs > now + 540000 || !id(value.voiceHoldKey) || !id(value.infrastructureHoldKey) || value.watchdogReady !== true) fail('unprotected_worker_deadline')
  const rates = pricing(value.pricing)
  const voiceReserve = units(value.voiceReservedCostUnits) ?? (number(value.maxAffordableDurationMs) ? BigInt(value.maxAffordableDurationMs) * 50000n : null)
  if (voiceReserve === null || voiceReserve < 15000n * 50000n) fail('voice_reserve_missing')
  const initialInput = value.initialInput ?? []
  if (!Array.isArray(initialInput) || initialInput.some(item => !item || !['user', 'assistant', 'developer'].includes(item.role) || typeof item.content !== 'string')) fail('invalid_initial_history')
  return { ...value, rates, voiceReserve, initialInput }
}

export function backendReservation(maxInputTokens, maxOutputTokens, rates = EXPECTED) {
  const long = maxInputTokens > 272000
  return BigInt(maxInputTokens) * (long ? rates.longCacheWriteUnitsPerToken : rates.cacheWriteUnitsPerToken)
    + BigInt(maxOutputTokens) * (long ? rates.longOutputUnitsPerToken : rates.outputUnitsPerToken)
}
export function backendUsageCost(response, rates = EXPECTED) {
  const usage = response?.usage, details = usage?.input_tokens_details
  if (!id(response?.id) || !number(usage?.input_tokens) || !number(usage?.output_tokens) || !number(details?.cached_tokens)) fail('provider_usage_unconfirmed')
  // Missing cache-write detail is a labelled upper bound, never measured zero
  // or a claim about the provider invoice. Missing core counters still refuse.
  const written = details.cache_write_tokens, missingWrite = written === undefined
  if ((!missingWrite && !number(written)) || details.cached_tokens > usage.input_tokens || !missingWrite && details.cached_tokens + written > usage.input_tokens) fail('provider_cache_usage_unconfirmed')
  const long = usage.input_tokens > 272000
  const ordinary = long ? rates.longInputUnitsPerToken : rates.inputUnitsPerToken
  const cached = long ? rates.longCachedInputUnitsPerToken : rates.cachedInputUnitsPerToken
  const write = long ? rates.longCacheWriteUnitsPerToken : rates.cacheWriteUnitsPerToken
  const output = long ? rates.longOutputUnitsPerToken : rates.outputUnitsPerToken
  const calculated = missingWrite
    ? BigInt(usage.input_tokens - details.cached_tokens) * write + BigInt(details.cached_tokens) * cached + BigInt(usage.output_tokens) * output
    : BigInt(usage.input_tokens - details.cached_tokens - written) * ordinary + BigInt(details.cached_tokens) * cached + BigInt(written) * write + BigInt(usage.output_tokens) * output
  return {
    actualCostUnits: calculated.toString(), costBasis: missingWrite ? 'conservative_cache_write_bound' : 'reported_usage',
    usage: { inputTokens: usage.input_tokens, cachedInputTokens: details.cached_tokens, cacheWriteTokens: missingWrite ? null : written, outputTokens: usage.output_tokens, cacheWriteTokensMissing: missingWrite },
  }
}

async function readJson(response, maximum = 1000000) {
  const value = await response.text()
  if (bytes(value) > maximum) fail('response_exceeds_limit')
  try { return JSON.parse(value) } catch { fail('invalid_response_json') }
}
async function timedFetch(url, options, timeoutMs, fetcher = fetch) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort)
  if (options.signal?.aborted) controller.abort()
  try {
    const response = await fetcher(url, { ...options, signal: controller.signal })
    return { ok: response.ok, value: await readJson(response) }
  }
  finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort) }
}
async function appControl(job, command, payload) {
  const response = await timedFetch(`${job.appOrigin}${CONTROL_PATH}`, {
    method: 'POST', headers: { authorization: `Bearer ${job.controlToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: job.sessionId, command, ...payload }),
  }, 10000)
  if (!response.ok) fail('control_request_rejected')
  return response.value
}
async function providerResponse(config, body, signal, timeoutMs) {
  const response = await timedFetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { authorization: `Bearer ${config.providerKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal,
  }, timeoutMs)
  if (!response.ok) fail('backend_request_unconfirmed')
  return response.value
}
async function providerConnect(config, onEvent, onLost) {
  const { default: WebSocket } = await import('ws')
  return new Promise((resolve, reject) => {
    let opened = false
    const socket = new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(config.providerSessionId)}/attach`, {
      headers: { Authorization: `Bearer ${config.providerKey}` }, handshakeTimeout: 5000, maxPayload: 1000000, perMessageDeflate: false,
    })
    socket.on('message', data => {
      try { const event = JSON.parse(String(data)); onEvent(event) } catch { onLost('invalid_provider_event') }
    })
    socket.on('error', () => { if (!opened) reject(new Error('sideband_connection_failed')); else onLost('sideband_connection_lost') })
    socket.on('close', () => { if (!opened) reject(new Error('sideband_connection_failed')); else onLost('sideband_connection_lost') })
    socket.once('open', () => {
      opened = true
      resolve({ send: event => { if (socket.readyState !== WebSocket.OPEN) fail('sideband_closed'); socket.send(JSON.stringify(event)) }, close: () => socket.terminate() })
    })
  })
}

export function createVoiceSessionWorker(dependencies = {}) {
  const io = { now: Date.now, sleep: pause, control: appControl, connect: providerConnect, respond: providerResponse, allowOrigin: origin => origin === 'https://helfi.ai', ...dependencies }
  const command = (job, leaseToken, name, payload = {}) => io.control(job, name, { ...payload, ...(leaseToken ? { leaseToken } : {}) })

  async function watchdog(rawJob) {
    const job = validateWorkerJob(rawJob, io.allowOrigin)
    const claim = await command(job, '', 'watchdog-claim')
    if (claim?.closeNeeded !== true) return { status: 'no_close_needed' }
    if (!id(claim.leaseToken) || !id(claim.providerSessionId) || typeof claim.providerKey !== 'string' || !claim.providerKey) fail('invalid_watchdog_claim')
    let final = null, connection
    const start = io.now()
    try {
      connection = await io.connect(claim, event => { if (event?.type === 'session.closed' && Number.isFinite(event.usage?.seconds) && event.usage.seconds >= 0 && event.session?.id === claim.providerSessionId) final = event }, () => {})
      connection.send({ type: 'session.close', event_id: 'watchdog_close' })
      while (!final && io.now() - start < CLOSE_BUFFER_MS) await io.sleep(100)
    } catch { /* The scoped server callback retains every uncertain hold. */ }
    finally { try { connection?.close() } catch {} }
    let recorded
    try { recorded = await command(job, claim.leaseToken, 'complete', {
      finalUsageConfirmed: Boolean(final), backendUsageConfirmed: false, seconds: final?.usage.seconds ?? null,
      reason: final?.reason || 'watchdog_finalization_unconfirmed', voiceHoldKey: claim.voiceHoldKey,
      infrastructureHoldKey: claim.infrastructureHoldKey, receiptDigest: digest(final || { sessionId: job.sessionId, outcome: 'unconfirmed' }),
      backendResponseIds: [],
      durationMs: final ? Math.ceil(final.usage.seconds * 1000) : null, workerDurationMs: Math.max(0, io.now() - start), watchdog: true,
      infrastructureAllocationPolicyVersion: claim.infrastructureAllocationPolicyVersion,
      infrastructureAllocationReceiptDigest: claim.infrastructureAllocationReceiptDigest,
    }) } finally { claim.providerKey = '' }
    return { status: final ? 'voice_closed_backend_uncertain' : 'close_unconfirmed', finalReceiptRecorded: recorded?.allowed === true, financialFinalizationConfirmed: recorded?.state === 'complete' }
  }

  async function monitor(rawJob) {
    const job = validateWorkerJob(rawJob, io.allowOrigin), startedAt = io.now()
    if (job.expiresAtMs <= startedAt) return { status: 'expired_job' }
    const attached = await command(job, '', 'attach')
    if (attached?.claimed === false || attached?.allowed === false) return { status: 'claim_denied' }
    let config
    try { config = configuration(attached, startedAt) } catch {
      if (id(attached?.leaseToken)) await command(job, attached.leaseToken, 'complete', {
        finalUsageConfirmed: false, backendUsageConfirmed: false, seconds: null,
        durationMs: null, reason: 'invalid_worker_configuration',
        voiceHoldKey: attached.voiceHoldKey, infrastructureHoldKey: attached.infrastructureHoldKey,
        backendResponseIds: [], receiptDigest: digest({ sessionId: job.sessionId, outcome: 'invalid_configuration' }),
        infrastructureAllocationPolicyVersion: attached.infrastructureAllocationPolicyVersion,
        infrastructureAllocationReceiptDigest: attached.infrastructureAllocationReceiptDigest,
      }).catch(() => {})
      if (attached && typeof attached === 'object') attached.providerKey = ''
      return { status: 'configuration_refused' }
    }
    const leaseToken = config.leaseToken, controller = new AbortController()
    let connection, closing = false, closeReason = '', final = null, latestSeconds = 0, backendUnknown = false, ready = false, recorded
    let lastHeartbeat = startedAt, lastWatchdog = startedAt, sequence = 0, eventCount = 0, backendCalls = 0
    const delegations = new Set(), seenEvents = new Set(), seenResponses = new Set(), seenCallIds = new Set(), fragments = [], pendingBackend = new Set(), queuedDelegations = []
    // Keep the exact server-returned tool state (including fresh review IDs)
    // across human turns. Every subsequent full request is bounded again.
    const backendHistory = [...config.initialInput]
    let previousDelegationOffset = -1
    let chain = Promise.resolve()
    const transcriptBoundary = createVoiceTranscriptBoundary({ now: io.now, sleep: io.sleep, isActive: () => !closing })
    const requestClose = reason => {
      if (closing) return
      closing = true; closeReason = reason; controller.abort()
      try { connection?.send({ type: 'session.close', event_id: `close_${++sequence}` }) } catch {}
    }
    const control = async (name, payload = {}) => {
      if (closing && ['reserve', 'enqueue-tool', 'ready'].includes(name)) fail('session_closing')
      const result = await command(job, leaseToken, name, payload)
      if (result?.allowed === false || result?.stopRequested === true) { requestClose('financial_or_control_stop'); fail('control_denied') }
      return result
    }
    const sendContext = (delegationId, content) => {
      if (closing || !connection) return
      // Conservatively <=500 UTF-8 bytes, hence <=500 textual tokens. Preserve
      // full verified outputs in app state, never truncate saved literal data.
      const summary = bytes(content) <= 500 ? content : 'The app result is ready. Please read the full result shown in Helfi.'
      connection.send({ type: 'session.commentary.append', event_id: `result_${++sequence}`, delegation_id: delegationId, content: summary })
    }
    const toolResults = async (calls, delegationId, actualHumanText) => {
      if (!calls.length || calls.length > 20) fail('backend_tool_limit')
      const parsed = calls.map(call => {
        if (closing) fail('session_closing')
        if (!id(call.call_id) || call.name !== 'request_helfi_action' || seenCallIds.has(call.call_id) || typeof call.arguments !== 'string') fail('invalid_or_duplicate_backend_tool')
        let args
        try { args = JSON.parse(call.arguments) } catch { fail('invalid_backend_tool_arguments') }
        if (!args || typeof args !== 'object' || Array.isArray(args) || call.status && call.status !== 'completed') fail('invalid_backend_tool_arguments')
        seenCallIds.add(call.call_id)
        return { call, args }
      })
      const results = new Map()
      let resultNotVerified = false
      // The normal app has one owned action lane. Finish each queued call
      // before creating the next baseline, then return all outputs together.
      for (const { call, args } of parsed) {
        if (resultNotVerified) {
          results.set(call.call_id, { ok: false, saved: false, safeToClaimSaved: false, status: 'not_submitted', message: 'This action was not submitted because an earlier result in the same voice turn could not be verified.' })
          continue
        }
        const queued = await control('enqueue-tool', { callId: call.call_id, args, delegationId, actualHumanText })
        if (!id(queued.jobId)) fail('tool_queue_unconfirmed')
        while (!results.has(call.call_id) && !closing && io.now() < config.deadlineMs - CLOSE_BUFFER_MS) {
          const polled = await control('poll-tools', { callIds: [call.call_id] })
          if (!Array.isArray(polled.results)) fail('invalid_tool_poll')
          for (const row of polled.results) {
            if (row.callId !== call.call_id || !['pending', 'completed'].includes(row.status)) fail('foreign_tool_result')
            if (row.status === 'completed') {
              const result = row.result ?? { ok: false, saved: false, safeToClaimSaved: false, message: 'No verified app result was returned.' }
              if (results.has(row.callId) && JSON.stringify(results.get(row.callId)) !== JSON.stringify(result)) fail('conflicting_tool_result')
              results.set(row.callId, result)
              if (result.transportRecovery?.status === 'result_not_verified') resultNotVerified = true
            }
          }
          if (!results.has(call.call_id)) await io.sleep(250)
        }
        if (!results.has(call.call_id)) fail('tool_result_pending')
      }
      if (results.size !== calls.length) fail('tool_result_pending')
      return calls.map(call => ({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(results.get(call.call_id)) }))
    }
    const runDelegation = async (delegationId, previousOffset, offset) => {
      if (closing || !ready) return
      const transcript = await transcriptBoundary.settle(delegationId, config.deadlineMs - CLOSE_BUFFER_MS)
      if (!transcript.ok) { sendContext(delegationId, 'I could not safely capture the complete request. Please finish saying the full request before I submit it. No app command was submitted for this turn.'); return }
      const { snapshot, actualHumanText } = transcript
      const input = [...backendHistory, { role: 'user', content: JSON.stringify({ delegationId, actualHumanText, actualVoiceTranscriptFragments: snapshot }) }]
      let lastVerifiedSpeech = ''
      for (let continuation = 0; continuation < 20 && !closing; continuation++) {
        if (backendCalls >= MAX_BACKEND_CALLS || io.now() >= config.deadlineMs - CLOSE_BUFFER_MS) { requestClose('backend_or_duration_limit'); return }
        const body = { model: config.backendModel, service_tier: 'default', store: false, instructions: config.instructions,
          // The generic command's operation values intentionally permit
          // different fields. Prevent automatic strict-schema normalization.
          tools: config.tools.map(tool => ({ ...tool, strict: false })), parallel_tool_calls: false, max_output_tokens: config.maxOutputTokens, input }
        const bodyBytes = bytes(body)
        if (bodyBytes > config.maxInputBytes) { sendContext(delegationId, 'Please split that request into smaller parts. Nothing further was submitted.'); return }
        // Full explicit request, no previous_response_id or hidden stored history.
        // UTF-8 bytes plus markup headroom conservatively bound input tokens.
        const maxInputTokens = bodyBytes + 8192, key = `backend_${digest(delegationId)}_${++backendCalls}`
        const maximum = backendReservation(maxInputTokens, config.maxOutputTokens, config.rates)
        const reserved = await control('reserve', { key, kind: 'backend', maxCostUnits: maximum.toString(), maxInputTokens, maxOutputTokens: config.maxOutputTokens, model: config.backendModel, serviceTier: 'default', regionalProcessing: false })
        if (reserved.allowed !== true) { requestClose('backend_budget_denied'); return }
        pendingBackend.add(key)
        let response
        try {
          response = await io.respond(config, body, controller.signal, Math.min(30000, Math.max(1, config.deadlineMs - io.now() - CLOSE_BUFFER_MS)))
          if (seenResponses.has(response?.id)) fail('duplicate_backend_response')
          if (response.model !== config.backendModel || response.service_tier && !['default', 'standard'].includes(response.service_tier)) fail('unsupported_response_pricing')
          const cost = backendUsageCost(response, config.rates)
          if (BigInt(cost.actualCostUnits) > maximum || response.usage.input_tokens > maxInputTokens || response.usage.output_tokens > config.maxOutputTokens) fail('provider_usage_exceeds_reserve')
          seenResponses.add(response.id)
          const settled = await control('settle', { key, ...cost, providerResponseId: response.id, receiptDigest: digest({ id: response.id, usage: response.usage }) })
          if (settled.allowed !== true) fail('backend_settlement_unconfirmed')
          pendingBackend.delete(key)
        } catch { backendUnknown = true; requestClose('backend_usage_unconfirmed'); return }
        if (closing) return
        if (response.status !== 'completed') { sendContext(delegationId, 'I could not finish preparing that request. No additional app action was submitted.'); return }
        if (!Array.isArray(response.output)) fail('invalid_backend_output')
        const calls = response.output.filter(item => item?.type === 'function_call')
        if (calls.length) {
          input.push(...response.output)
          const returned = await toolResults(calls, delegationId, actualHumanText)
          input.push(...returned)
          const canonical = returned.map(item => { try { return JSON.parse(item.output) } catch { return null } }).filter(Boolean)
          const unknown = canonical.find(result => result.transportRecovery?.status === 'result_not_verified')
          if (unknown) {
            // An unverified app effect ends this delegation. Asking the model
            // to continue could silently repeat it under a new tool call ID.
            // Retain canonical outputs for the next genuine human turn only.
            const reply = typeof unknown.spokenReply === 'string' && unknown.spokenReply ? unknown.spokenReply : typeof unknown.message === 'string' && unknown.message ? unknown.message : 'Helfi could not verify the result. Please check the normal screen before repeating the request.'
            backendHistory.splice(0, backendHistory.length, ...input, { role: 'assistant', content: reply })
            sendContext(delegationId, reply)
            return
          }
          lastVerifiedSpeech = canonical.map(result => typeof result.spokenReply === 'string' ? result.spokenReply : typeof result.message === 'string' ? result.message : '').filter(Boolean).join('\n') || lastVerifiedSpeech
          continue
        }
        const answer = response.output.filter(item => item?.type === 'message' && item.role === 'assistant').flatMap(item => Array.isArray(item.content) ? item.content.filter(part => part?.type === 'output_text' && typeof part.text === 'string').map(part => part.text) : []).join('\n')
        const reply = lastVerifiedSpeech || answer.trim() || 'Please check the result shown in Helfi. No additional save is confirmed.'
        backendHistory.splice(0, backendHistory.length, ...input, { role: 'assistant', content: reply })
        sendContext(delegationId, reply)
        return
      }
    }
    const receive = event => {
      if (final) return
      if (event?.type === 'session.closed') {
        if (event.session?.id === config.providerSessionId && Number.isFinite(event.usage?.seconds) && event.usage.seconds >= latestSeconds && event.usage.seconds >= 0) final = event
        requestClose(final ? event.reason || 'provider_closed' : 'invalid_final_usage')
        return
      }
      if (closing) return
      // Sidebands reflect continuous audio packets. They are not transcript,
      // task or usage events and must not exhaust the bounded metadata lane.
      if (!['session.usage.updated', 'session.input_transcript.delta', 'session.output_transcript.delta', 'session.delegation.created', 'error'].includes(event?.type)) return
      if (++eventCount > MAX_EVENTS) { requestClose('provider_event_limit'); return }
      if (event?.event_id && seenEvents.has(event.event_id)) return
      if (event?.event_id) seenEvents.add(event.event_id)
      if (event?.type === 'session.usage.updated') {
        if (!Number.isFinite(event.usage?.seconds) || event.usage.seconds < latestSeconds) { requestClose('invalid_usage_snapshot'); return }
        latestSeconds = event.usage.seconds
        if (BigInt(Math.ceil(Math.max(15, latestSeconds) * 1000)) * 50000n + BigInt(CLOSE_BUFFER_MS) * 50000n >= config.voiceReserve) requestClose('voice_budget_limit')
      } else if (['session.input_transcript.delta', 'session.output_transcript.delta'].includes(event?.type)) {
        if (typeof event.delta !== 'string' || !Number.isFinite(event.start_ms) || !Number.isFinite(event.end_ms) || event.start_ms < 0 || event.end_ms < event.start_ms) { requestClose('invalid_transcript'); return }
        const fragment = { speaker: event.type === 'session.input_transcript.delta' ? 'user' : 'assistant', text: event.delta, start_ms: event.start_ms, end_ms: event.end_ms }
        fragments.push(fragment); transcriptBoundary.add(fragment)
        if (bytes(fragments) > config.maxInputBytes) requestClose('transcript_limit')
      } else if (event?.type === 'session.delegation.created' && event.delegation?.target === 'client') {
        const delegationId = event.delegation.id
        if (!id(delegationId) || delegations.has(delegationId)) return
        if (!Number.isFinite(event.offset_ms) || event.offset_ms < 0 || event.offset_ms < previousDelegationOffset) { requestClose('invalid_delegation_timing'); return }
        if (delegations.size >= MAX_DELEGATIONS) { requestClose('delegation_limit'); return }
        delegations.add(delegationId)
        transcriptBoundary.register(delegationId, event.offset_ms)
        const previousOffset = previousDelegationOffset
        previousDelegationOffset = event.offset_ms
        if (ready) chain = chain.then(() => runDelegation(delegationId, previousOffset, event.offset_ms)).catch(() => { requestClose('delegation_failed') })
        else queuedDelegations.push({ delegationId, previousOffset, offset: event.offset_ms })
      } else if (event?.type === 'error') requestClose('provider_protocol_error')
    }
    try {
      connection = await io.connect(config, receive, () => requestClose('sideband_connection_lost'))
      if (closing) { try { connection.send({ type: 'session.close', event_id: 'early_close' }) } catch {}; fail('closed_before_handoff') }
      const readiness = await control('ready', { providerSessionId: config.providerSessionId })
      if (readiness.allowed !== true) fail('worker_ready_unconfirmed')
      ready = true
      for (const { delegationId, previousOffset, offset } of queuedDelegations.splice(0)) chain = chain.then(() => runDelegation(delegationId, previousOffset, offset)).catch(() => { requestClose('delegation_failed') })
      while (!closing && !final) {
        const now = io.now()
        if (now >= config.deadlineMs - CLOSE_BUFFER_MS || now >= job.expiresAtMs - CLOSE_BUFFER_MS) { requestClose('reserved_deadline'); break }
        if (now - lastHeartbeat >= 15000) {
          await control('heartbeat', { latestSeconds, backendCalls, delegations: delegations.size })
          lastHeartbeat = io.now()
        }
        if (now - lastWatchdog >= 30000) {
          const scheduled = await control('schedule-watchdog', { delaySeconds: 30 })
          if (scheduled.allowed !== true) fail('watchdog_not_scheduled')
          lastWatchdog = io.now()
        }
        await io.sleep(100)
      }
    } catch { requestClose('worker_control_or_transport_failed') }
    finally {
      requestClose(closeReason || 'worker_ended')
      const drainStarted = io.now()
      while (!final && io.now() - drainStarted < CLOSE_BUFFER_MS) await io.sleep(100)
      try { connection?.close() } catch {}
      const complete = {
        finalUsageConfirmed: Boolean(final), backendUsageConfirmed: !backendUnknown && pendingBackend.size === 0,
        seconds: final?.usage.seconds ?? null, reason: final?.reason || closeReason || 'finalization_unconfirmed',
        voiceHoldKey: config.voiceHoldKey, infrastructureHoldKey: config.infrastructureHoldKey,
        backendResponseIds: [...seenResponses], receiptDigest: digest(final || { sessionId: job.sessionId, outcome: 'unconfirmed' }),
        durationMs: final ? Math.ceil(final.usage.seconds * 1000) : null,
        workerDurationMs: Math.max(0, io.now() - startedAt),
        infrastructureAllocationPolicyVersion: config.infrastructureAllocationPolicyVersion,
        infrastructureAllocationReceiptDigest: config.infrastructureAllocationReceiptDigest,
      }
      try { recorded = await command(job, leaseToken, 'complete', complete) } catch { /* Independent watchdog retries the unrecorded receipt. */ }
      config.providerKey = '' // RAM only, never returned, persisted or logged.
      attached.providerKey = ''
    }
    return { status: final ? backendUnknown || pendingBackend.size > 0 ? 'voice_closed_backend_uncertain' : 'closed' : 'finalization_unconfirmed', finalReceiptRecorded: recorded?.allowed === true, financialFinalizationConfirmed: recorded?.state === 'complete' }
  }
  return { monitor, watchdog }
}

export async function handler(event) {
  const worker = createVoiceSessionWorker()
  if (Array.isArray(event?.Records)) {
    for (const record of event.Records) {
      let job
      try { job = JSON.parse(record.body) } catch { fail('invalid_watchdog_message') }
      await worker.watchdog(job)
    }
    return { status: 'watchdog_processed' }
  }
  return event?.type === 'watchdog' ? worker.watchdog(event) : worker.monitor(event)
}
