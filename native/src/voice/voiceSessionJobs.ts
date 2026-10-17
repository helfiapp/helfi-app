import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'

type SessionJob = { callId: string; args: { request?: string; action?: string; needsReview?: boolean; assistantCommand?: unknown }; actualHumanText: string }
type JobIo = { baseUrl: string; sessionId: string; token: string; isCurrent: () => boolean; onJob: (job: SessionJob) => Promise<unknown>; onError: (message: string) => void; onClosed?: () => void }

/** The server holds the spending authority. This client only delivers an
 * immutable owned app job through the existing review/confirmation host. */
export function startVoiceSessionJobs(io: JobIo) {
  let stopped = false, timer: ReturnType<typeof setTimeout> | null = null, failures = 0
  let network: AbortController | null = null
  const handled = new Set<string>()
  const deliveries = new Map<string, unknown>()
  const identities = new Map<string, string>()
  const expiresAt = Date.now() + 12 * 60000
  let polls = 0
  const current = () => !stopped && io.isCurrent()
  const stop = () => { stopped = true; if (timer) clearTimeout(timer); timer = null; network?.abort(); network = null }
  const fail = () => { if (!current()) return; stop(); io.onError('The protected voice connection stopped. Please check the result shown in Helfi before reconnecting.') }
  const request = async (method: 'GET' | 'POST', body?: unknown) => {
    const controller = new AbortController()
    network = controller
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(`${io.baseUrl}/api/native/voice-assistant/session${method === 'GET' ? `?sessionId=${encodeURIComponent(io.sessionId)}` : ''}`, { method, signal: controller.signal, headers: { ...buildNativeAuthHeaders(io.token), ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const result = await response.json()
      if (!response.ok || !result || result.error) throw new Error('Voice job unavailable')
      return result
    } finally { clearTimeout(timeout); if (network === controller) network = null }
  }
  const poll = async () => {
    if (!current()) { stop(); return }
    if (++polls > 1000 || Date.now() >= expiresAt) { fail(); return }
    try {
      const data = await request('GET')
      if (!current()) return
      if (data.sessionId !== io.sessionId || !Array.isArray(data.jobs) || data.jobs.length > 20) { fail(); return }
      if (['closed', 'complete', 'expired'].includes(data.state)) { stop(); io.onClosed?.(); return }
      if (['uncertain', 'failed'].includes(data.state)) { fail(); return }
      for (const raw of data.jobs) {
        if (!current()) return
        if (!raw || typeof raw.callId !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(raw.callId) || !raw.args || typeof raw.args !== 'object' || Array.isArray(raw.args) || typeof raw.actualHumanText !== 'string' || !raw.actualHumanText.trim() || raw.actualHumanText.length > 20000) { fail(); return }
        const identity = JSON.stringify({ args: raw.args, actualHumanText: raw.actualHumanText })
        if (identities.has(raw.callId) && identities.get(raw.callId) !== identity) { fail(); return }
        if (handled.has(raw.callId)) {
          if (deliveries.has(raw.callId)) {
            await request('POST', { sessionId: io.sessionId, callId: raw.callId, result: deliveries.get(raw.callId) })
            deliveries.delete(raw.callId)
          }
          continue
        }
        if (handled.size >= 200) { fail(); return }
        // Claim before app execution. A failed result POST never repeats a
        // potentially successful app effect; the server retains its receipt.
        handled.add(raw.callId)
        identities.set(raw.callId, identity)
        let result: unknown
        try { result = await io.onJob(raw) } catch { result = { ok: false, saved: false, safeToClaimSaved: false } }
        if (!current()) return
        // The server reads the owned normal assistant state itself. Send its
        // version pointer only, so a long note is never repeated in delivery
        // or mistaken for a trusted client-side save receipt.
        const evidence = result as { ok?: boolean; assistantContext?: { id?: unknown; actorId?: unknown; revision?: unknown } } | null
        const pointer = evidence?.assistantContext
        const validPointer = pointer && typeof pointer.id === 'string' && pointer.id.length <= 200 && typeof pointer.actorId === 'string' && pointer.actorId.length <= 200 && Number.isSafeInteger(pointer.revision) && Number(pointer.revision) >= 0
        const payload = validPointer
          ? { ok: evidence?.ok === true, assistantContext: { id: pointer.id, actorId: pointer.actorId, revision: pointer.revision } }
          : { ok: false, saved: false, safeToClaimSaved: false }
        deliveries.set(raw.callId, payload)
        await request('POST', { sessionId: io.sessionId, callId: raw.callId, result: payload })
        deliveries.delete(raw.callId)
        if (!current()) return
      }
      failures = 0
    } catch {
      if (!current()) return
      // A delivery failure after an app effect cannot be retried as an action.
      // Read-only polls may retry; the immutable call claim remains retained.
      if (++failures >= 3) { fail(); return }
    }
    if (current()) timer = setTimeout(() => { void poll() }, failures ? 1500 : 750)
  }
  timer = setTimeout(() => { void poll() }, 0)
  return { stop }
}
