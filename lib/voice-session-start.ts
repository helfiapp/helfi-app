import crypto from 'node:crypto'
import WebSocket from 'ws'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { assertAiUsageAllowed } from '@/lib/ai-safety'
import { bindVoiceProviderConnection, closeVoiceBillingSession, getVoiceBillingSession, openVoiceBillingSession, registerVoiceOperatorTestBudget, reserveVoiceSessionCost, settleVoiceSessionCost } from '@/lib/voice-session-ledger'
import { liveVoiceCostUnits } from '@/lib/voice-cost-policy'
import { signVoiceSessionControlToken } from '@/lib/voice-session-control'
import { dispatchVoiceSessionWorker, sendVoiceWatchdog } from '@/lib/voice-session-worker-dispatch'
import { nativeAssistantCommandInstructions, nativeAssistantCommandTool, type AssistantGeneralSessionConfig } from '@/lib/native-assistant-command-tool'

const db = prisma as any
const VOICE_HOLD = 'voice-duration'
const INFRA_HOLD = 'voice-infrastructure'
const INFRA_UNITS = BigInt('3000000000') // Explicit conservative $0.05 service allocation, not an AWS invoice.
const OPERATOR_ACCOUNT = 'cmcku4yvq000010l6z4ttp0ib'
const OPERATOR_AUTHORIZED_AT = Date.parse('2026-10-19T00:30:00Z')
const OPERATOR_EXPIRY = Date.parse('2026-10-20T00:25:00Z')
// The owner approved US$3 TOTAL, including US$0.918289288333 already spent.
// These two immutable US$1 lots keep historical + new authority below US$3.
// Do not renew the expired 18 October lot or derive IDs from a call/date.
const OPERATOR_AUTHORIZATIONS = Object.freeze(['owner-voice-repair-2026-10-19-allowance-1', 'owner-voice-repair-2026-10-19-allowance-2'])
const OPERATOR_EVIDENCE = 'owner-explicit-usd3-total-voice-verification-2026-10-19T0030Z'
const BACKEND_RESERVE_UNITS = BigInt('1800000000')
const SHUTDOWN_RESERVE_MS = 60000
const MINIMUM_DURATION_MS = 15000
const MINIMUM_OPERATOR_BUDGET = INFRA_UNITS + BACKEND_RESERVE_UNITS + liveVoiceCostUnits({ model: 'gpt-live-1', allocated: true, durationMs: BigInt(MINIMUM_DURATION_MS + SHUTDOWN_RESERVE_MS) })
export const VOICE_WORKER_PRICING = Object.freeze({ scale: '60000000000', voiceUnitsPerSecond: '50000000', inputUnitsPerToken: '6000', cachedInputUnitsPerToken: '600', cacheWriteUnitsPerToken: '7500', outputUnitsPerToken: '30000', longInputUnitsPerToken: '12000', longCachedInputUnitsPerToken: '1200', longCacheWriteUnitsPerToken: '15000', longOutputUnitsPerToken: '45000' })
const hash = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')

async function allocationGate(userId: string, create?: (tx: any) => Promise<void>) {
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
    const outstanding = await tx.voiceSessionRuntime.findMany({ where: { userId, state: { in: ['allocating', 'uncertain'] } }, select: { sessionId: true, state: true, providerSessionId: true } })
    if (outstanding.some((row: any) => row.state === 'uncertain' || !row.providerSessionId)) {
      throw Object.assign(new Error('voice_previous_allocation_unresolved'), { code: 'voice_previous_allocation_unresolved' })
    }
    if (create) await create(tx)
  }, { maxWait: 10000, timeout: 20000 })
}

/** This is real app server code. Credentials never enter agent scripts, stored
 * session data, queues, logs or client responses. */
async function closeProvider(providerId: string): Promise<number | null> {
  return new Promise(resolve => {
    let socket: WebSocket | null = null, done = false
    const finish = (seconds: number | null) => { if (done) return; done = true; clearTimeout(timer); socket?.close(); resolve(seconds) }
    const timer = setTimeout(() => finish(null), 5000)
    try {
      socket = new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(providerId)}/attach`, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } })
      socket.on('open', () => socket?.send(JSON.stringify({ type: 'session.close' })))
      socket.on('message', data => { try { const event = JSON.parse(String(data)); if (event.type === 'session.closed' && event.session?.id === providerId) finish(typeof event.usage?.seconds === 'number' && Number.isFinite(event.usage.seconds) && event.usage.seconds >= 0 ? event.usage.seconds : null) } catch {} })
      socket.on('error', () => finish(null)); socket.on('close', () => finish(null))
    } catch { finish(null) }
  })
}

export async function startMeteredLiveVoiceSession(input: { request: NextRequest; userId: string; sdp: string; general: AssistantGeneralSessionConfig; frontend: Record<string, unknown> }) {
  const { request, userId, sdp, general } = input
  let sessionId = '', providerId = '', handedToClient = false, allocationAttempted = false, workerMayRun = false
  const started = Date.now(), abort = new AbortController()
  const cancelled = () => abort.abort()
  request.signal.addEventListener('abort', cancelled)
  const timeout = setTimeout(cancelled, 15000)
  try {
    if (request.signal.aborted) throw new Error('voice_cancelled')
    const attemptId = request.headers.get('x-helfi-voice-attempt-id') || ''
    if (!/^[A-Za-z0-9_-]{12,100}$/.test(attemptId)) return NextResponse.json({ error: 'Please update Helfi to use protected voice billing.', code: 'voice_update_required' }, { status: 426 })
    if (input.frontend.model !== 'gpt-live-1' || typeof sdp !== 'string' || !sdp.trim() || Buffer.byteLength(sdp, 'utf8') > 65536) return NextResponse.json({ error: 'This voice connection is not supported.', code: 'voice_connection_unsupported' }, { status: 400 })
    const wallet = await new CreditManager(userId).getWalletStatus()
    if (Number(wallet.totalAvailableCents) < 10) return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    await assertAiUsageAllowed({ feature: 'voice-assistant:metered-session', userId })
    if (abort.signal.aborted) throw new Error('voice_cancelled')
    // An unknown provider allocation has no documented recover-by-client-ID
    // or guaranteed no-SDP auto-close. Do not create another paid allocation
    // for the account until the preceding one is verified closed.
    await allocationGate(userId)
    let operatorFundingId: string | undefined
    if (userId === OPERATOR_ACCOUNT && Date.now() >= OPERATOR_AUTHORIZED_AT && Date.now() < OPERATOR_EXPIRY) {
      for (const authorizationId of OPERATOR_AUTHORIZATIONS) {
        const funding = await registerVoiceOperatorTestBudget({ kind: 'operator_test_budget', accountId: userId, authorizationId, fundingEvidenceId: OPERATOR_EVIDENCE, fundingConfirmed: true, fundedUsdMicros: BigInt(1000000), expiresAtMs: OPERATOR_EXPIRY })
        // This is only selection. The existing ledger rechecks and reserves
        // the same lot atomically, so concurrent calls cannot overspend it.
        if (funding.userId === userId && funding.kind === 'operator_test_budget' && !funding.revokedAt && new Date(funding.expiresAt).getTime() === OPERATOR_EXPIRY && BigInt(funding.providerBudgetCostUnits) === BigInt('60000000000') && BigInt(funding.spentCostUnits) >= BigInt(0) && BigInt(funding.heldCostUnits) >= BigInt(0) && BigInt(funding.providerBudgetCostUnits) - BigInt(funding.spentCostUnits) - BigInt(funding.heldCostUnits) >= MINIMUM_OPERATOR_BUDGET) {
          operatorFundingId = funding.id
          break
        }
      }
      if (!operatorFundingId) throw Object.assign(new Error('operator_budget_exhausted'), { code: 'operator_budget_exhausted' })
    }
    const reserveCredits = operatorFundingId ? 10 : Math.min(100, Math.floor(Number(wallet.totalAvailableCents)))
    const expiresAt = new Date(started + 12 * 60_000)
    const financial = await openVoiceBillingSession({ userId, billingRunId: `voice-meter:${crypto.createHash('sha256').update(`${userId}:${attemptId}`).digest('hex')}`, reserveCredits, ...(operatorFundingId ? { operatorFundingId } : {}), initialReservationKey: 'initialization', initialReserveCostUnits: BigInt(0), expiresAt })
    if (!financial.newlyCreated) return NextResponse.json({ error: 'This connection attempt has already started. Reconnect voice to create a new covered connection.', code: 'voice_attempt_already_started' }, { status: 409 })
    sessionId = financial.id
    await settleVoiceSessionCost({ userId, sessionId, key: 'initialization', actualCostUnits: BigInt(0), receiptDigest: hash({ sessionId, phase: 'not_yet_allocated' }) })
    // One fixed service allocation covers this accepted startup's app/DB,
    // scheduling and monitoring work, including a later failed allocation.
    // It is never represented as an observed AWS invoice. Reserve it before
    // doing that work, and settle it even when no provider ID is returned.
    await reserveVoiceSessionCost({ userId, sessionId, key: INFRA_HOLD, kind: 'service_overhead_allocation', maxCostUnits: INFRA_UNITS })
    const affordableMs = Number((BigInt(financial.providerBudgetCostUnits) - INFRA_UNITS - BACKEND_RESERVE_UNITS) / BigInt(50000)) - SHUTDOWN_RESERVE_MS
    const durationMs = Math.min(120000, Math.floor(affordableMs))
    if (durationMs < MINIMUM_DURATION_MS) throw Object.assign(new Error('voice_budget_exhausted'), { code: 'voice_budget_exhausted' })
    const voiceUnits = liveVoiceCostUnits({ model: 'gpt-live-1', allocated: true, durationMs: BigInt(durationMs + SHUTDOWN_RESERVE_MS) })
    // A repeated HTTP attempt never creates another provider connection.
    const existingRuntime = await db.voiceSessionRuntime.findUnique({ where: { sessionId } })
    if (existingRuntime) throw new Error('voice_runtime_claim_conflict')
    await reserveVoiceSessionCost({ userId, sessionId, key: VOICE_HOLD, kind: 'voice_duration', maxCostUnits: voiceUnits })
    const deadlineMs = started + durationMs
    const allocationIntent = { clientRequestId: `helfi-voice-${crypto.randomUUID()}`, createdAtMs: Date.now(), state: 'prepared' }
    await allocationGate(userId, async tx => {
      await tx.voiceSessionRuntime.create({ data: { sessionId, userId, state: 'allocating', expiresAt,
        configuration: { assistantSessionId: general.sessionId, localDate: general.localDate, timeZone: general.timeZone, capabilities: ['general-assistant-v1', 'symptom-analysis-v1'], instructions: nativeAssistantCommandInstructions(general, true), tools: [nativeAssistantCommandTool(general)], backendModel: 'gpt-6-luna', maxInputBytes: 160000, maxOutputTokens: 4096, deadlineMs, maxAffordableDurationMs: durationMs, voiceReservedCostUnits: voiceUnits.toString(), infrastructureReservedCostUnits: INFRA_UNITS.toString(), voiceHoldKey: VOICE_HOLD, infrastructureHoldKey: INFRA_HOLD, infrastructurePolicyVersion: 'voice-service-overhead-2026-10-18-v1', pricing: VOICE_WORKER_PRICING, allocationIntent }, transcript: [], toolJobs: [] } })
    })
    const controlToken = signVoiceSessionControlToken({ userId, sessionId, expiresAtMs: expiresAt.getTime() })
    const job = { sessionId, controlToken, expiresAtMs: expiresAt.getTime() }
    // Queue independent cleanup authority before making any paid allocation.
    await sendVoiceWatchdog(job)
    if (abort.signal.aborted) throw new Error('voice_cancelled')
    const beforeAllocation = await db.voiceSessionRuntime.findUnique({ where: { sessionId } })
    await db.voiceSessionRuntime.update({ where: { sessionId }, data: { configuration: { ...beforeAllocation.configuration, allocationIntent: { ...allocationIntent, state: 'posted', postedAtMs: Date.now() } } } })
    allocationAttempted = true
    const response = await fetch('https://api.openai.com/v1/live/sessions', { method: 'POST', signal: abort.signal, headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json', 'X-Client-Request-Id': allocationIntent.clientRequestId, 'OpenAI-Safety-Identifier': crypto.createHash('sha256').update(`helfi-native-realtime:${userId}`).digest('hex') }, body: JSON.stringify({ session: { ...input.frontend, delegation: { type: 'client' }, client: { data_channel: { allowed_client_events: ['session.close', 'session.instructions.append'] } } }, transport: { type: 'webrtc', sdp } }) })
    const result = await response.json().catch(() => null)
    if (typeof result?.session?.id === 'string') providerId = result.session.id
    if (!response.ok || !providerId || typeof result?.transport?.sdp !== 'string' || !result.transport.sdp.trim()) throw new Error('voice_allocation_failed')
    await bindVoiceProviderConnection({ userId, sessionId, key: VOICE_HOLD, providerSessionId: providerId })
    await db.voiceSessionRuntime.update({ where: { sessionId }, data: { providerSessionId: providerId } })
    await sendVoiceWatchdog(job)
    const runtime = await db.voiceSessionRuntime.findUnique({ where: { sessionId } })
    await db.voiceSessionRuntime.update({ where: { sessionId }, data: { configuration: { ...runtime.configuration, watchdogReady: true } } })
    workerMayRun = true
    await dispatchVoiceSessionWorker(job)
    let ready = false
    while (!abort.signal.aborted && Date.now() - started < 14000) {
      const current = await db.voiceSessionRuntime.findUnique({ where: { sessionId }, select: { state: true, lastHeartbeatAt: true } })
      if (current?.state === 'ready' && current.lastHeartbeatAt && Date.now() - current.lastHeartbeatAt.getTime() < 10000) { ready = true; break }
      if (current && ['closed', 'uncertain', 'failed'].includes(current.state)) break
      await new Promise(resolve => setTimeout(resolve, 150))
    }
    if (!ready || abort.signal.aborted || request.signal.aborted) throw new Error('voice_monitor_not_ready')
    handedToClient = true
    return NextResponse.json({ session: { id: providerId }, transport: { type: 'webrtc', sdp: result.transport.sdp }, helfiSession: { id: sessionId, deadlineMs, reservedCredits: reserveCredits, marginBasis: financial.mode === 'operator_test_budget' ? 'operator_test_budget' : '50_percent_realized_net', costBasis: 'provider_usage_plus_service_allocation' }, delegation: 'server' }, { headers: { 'x-helfi-voice-protocol': 'live-v1', 'x-helfi-realtime-model': 'gpt-live-1', 'x-helfi-reserved-credits': String(reserveCredits), 'x-helfi-charged-credits': '0', 'server-timing': `total;dur=${Date.now() - started}` } })
  } catch (error: any) {
    const code = typeof error?.code === 'string' ? error.code : ''
    const funding = /funding|revenue_unverified/.test(code)
    const insufficient = /budget|insufficient_credits/.test(code)
    if (code === 'voice_previous_allocation_unresolved') return NextResponse.json({ error: 'The previous voice connection needs its final usage verified before another call can start.', code }, { status: 409 })
    console.error('[voice metering] start refused', funding ? 'funding_unverified' : insufficient ? 'covered_allowance_unavailable' : request.signal.aborted ? 'cancelled' : 'monitor_unavailable')
    return NextResponse.json({ error: funding ? 'The purchase value of these credits needs to be verified before paid voice can start.' : insufficient ? 'There is not enough covered credit allowance for this voice call.' : request.signal.aborted ? 'Voice was stopped.' : 'The voice spending monitor could not connect. Please try again.', code: funding ? 'voice_funding_unverified' : insufficient ? 'voice_budget_unavailable' : 'voice_monitor_unavailable' }, { status: funding || insufficient ? 402 : 503 })
  } finally {
    clearTimeout(timeout); request.signal.removeEventListener('abort', cancelled)
    if (sessionId && !handedToClient) {
      try {
        const seconds = providerId ? await closeProvider(providerId) : null
        if (workerMayRun) {
          // The monitor/watchdog owns these receipts after dispatch. Closing
          // here is safe; racing a second settlement could conflict with its
          // actual backend receipts or release still-pending paid work.
          console.info('[voice metering] cancelled handoff delegated final settlement')
        } else {
          const financial = await getVoiceBillingSession(userId, sessionId)
          // Settle only this allocator's own known costs. A dispatched worker
          // may already have begun paid work; its reservations require its own
          // verified receipts, even when HTTP handoff was cancelled.
          for (const hold of financial.reservations) if (hold.state === 'PENDING' && [VOICE_HOLD, INFRA_HOLD].includes(hold.key)) {
            if (hold.key === VOICE_HOLD && seconds === null && allocationAttempted) continue
            const cost = hold.key === VOICE_HOLD ? liveVoiceCostUnits({ model: 'gpt-live-1', allocated: Boolean(providerId), durationMs: BigInt(Math.ceil((seconds || 0) * 1000)) }) : INFRA_UNITS
            await settleVoiceSessionCost({ userId, sessionId, key: hold.key, actualCostUnits: cost, receiptDigest: hash({ sessionId, key: hold.key, seconds, allocated: Boolean(providerId), costBasis: hold.key === INFRA_HOLD ? 'fixed_service_allocation' : 'provider_final_usage' }) })
          }
          const final = await closeVoiceBillingSession({ userId, sessionId, finalUsageConfirmed: seconds !== null || !allocationAttempted })
          await db.voiceSessionRuntime.updateMany({ where: { sessionId }, data: { state: final.state === 'CLOSED' ? 'closed' : 'uncertain' } })
        }
      } catch { console.error('[voice metering] start cleanup requires final verification') }
    }
  }
}
