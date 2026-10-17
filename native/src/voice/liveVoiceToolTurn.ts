/** Managed Live Responses tool continuation. No transport, provider or app I/O.
 * The host owns authorization and execution; this helper owns event correlation
 * and the all-results barrier. Live's commands do not accept response_id. */
type ToolItem = { type: string; call_id?: string; name?: string; arguments?: string; [key: string]: unknown }
type ToolResult = { item: ToolItem; ready: boolean; output?: string; sent: boolean }
type ToolTurn = { id: string; delegationId: string; terminal: boolean; failed: boolean; continued: boolean; calls: Map<string, ToolResult> }
export type LiveVoiceToolTurnIo = {
  isCurrent: () => boolean
  executeToolCall: (item: ToolItem) => unknown | Promise<unknown>
  /** Return false when the event was not sent. Throwing also stops continuation. */
  send: (event: Record<string, unknown>) => boolean | void
  onError: (message: string) => void
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const FAILURE = { ok: false, saved: false, safeToClaimSaved: false, message: 'The app could not complete that action. Please check its result before retrying.' }

export function createLiveVoiceToolTurn(io: LiveVoiceToolTurnIo) {
  const turns = new Map<string, ToolTurn>()
  const currentByDelegation = new Map<string, string>()
  const callOwners = new Map<string, string>()
  const deferred: { envelope: any; item: ToolItem }[] = []
  let stopped = false
  let eventSequence = 0
  const active = () => !stopped && io.isCurrent()
  const fail = (message: string) => {
    if (!active()) return
    stopped = true
    io.onError(message)
  }
  const turnFor = (id: string, delegationId: string) => {
    let turn = turns.get(id)
    if (!turn) {
      if (turns.size >= 200) { fail('Please reconnect voice to continue this long conversation.'); return null }
      turn = { id, delegationId, terminal: false, failed: false, continued: false, calls: new Map() }
      turns.set(id, turn)
    }
    if (delegationId && turn.delegationId && turn.delegationId !== delegationId) {
      fail('The voice tool result did not match its original request. Please reconnect voice.'); return null
    }
    if (delegationId) turn.delegationId = delegationId
    return turn
  }
  const send = (event: Record<string, unknown>) => {
    if (!active()) return false
    try {
      if (io.send({ ...event, event_id: `helfi_tool_${++eventSequence}` }) === false) throw Error('Not sent')
      return true
    } catch {
      fail('The app result could not reach voice. Please check its result before reconnecting.'); return false
    }
  }
  const flush = () => {
    if (!active() || deferred.length) return
    const pending = [...turns.values()].filter(turn => !turn.continued && !turn.failed && turn.calls.size)
    if (!pending.length || pending.some(turn => !turn.terminal || [...turn.calls.values()].some(call => !call.ready))) return
    // response.create has no response selector. Flush every known pending
    // response's results before the single backend continuation command.
    for (const turn of pending) for (const [callId, call] of turn.calls) {
      if (call.sent) continue
      if (!send({ type: 'response.item.create', item: { type: 'function_call_output', call_id: callId, output: call.output } })) return
      call.sent = true
    }
    if (!send({ type: 'response.create' })) return
    for (const turn of pending) turn.continued = true
  }
  const resolveTurn = (envelope: any) => {
    const nested = envelope.event || {}, delegationId = text(envelope.delegation_id)
    const explicitId = text(nested.response?.id) || text(nested.response_id)
    if (explicitId) return turnFor(explicitId, delegationId)
    const mapped = currentByDelegation.get(delegationId)
    if (mapped) return turns.get(mapped) || null
    // Some envelopes omit delegation_id. A single current response is safe;
    // ambiguity remains queued until its lifecycle supplies the association.
    const candidates = [...turns.values()].filter(turn => !turn.continued && !turn.failed && (!delegationId || turn.delegationId === delegationId))
    return candidates.length === 1 ? candidates[0] : null
  }
  const addCall = (turn: ToolTurn, item: ToolItem) => {
    const callId = text(item.call_id)
    if (!callId || !text(item.name)) { fail('The voice tool request was incomplete. Nothing further was submitted.'); return }
    const owner = callOwners.get(callId)
    if (owner) {
      if (owner !== turn.id) fail('The voice tool identity was reused for a different request. Please reconnect voice.')
      return
    }
    if (turn.continued || turn.failed) { fail('A voice tool arrived after its request ended. Please reconnect voice.'); return }
    if (callOwners.size >= 1000) { fail('Please reconnect voice to continue this long conversation.'); return }
    callOwners.set(callId, turn.id)
    const call: ToolResult = { item, ready: false, sent: false }
    turn.calls.set(callId, call)
    Promise.resolve().then(() => {
      if (!active() || turn.failed) return FAILURE
      return io.executeToolCall(item)
    }).then(result => {
      if (!active() || turn.failed) return
      try { call.output = JSON.stringify(result ?? FAILURE) } catch { call.output = JSON.stringify(FAILURE) }
      if (typeof call.output !== 'string') call.output = JSON.stringify(FAILURE)
      call.ready = true
      flush()
    }, () => {
      if (!active() || turn.failed) return
      call.output = JSON.stringify(FAILURE); call.ready = true; flush()
    })
  }
  const drainDeferred = () => {
    for (let index = 0; index < deferred.length;) {
      const queued = deferred[index], turn = resolveTurn(queued.envelope)
      if (!turn) { index++; continue }
      deferred.splice(index, 1); addCall(turn, queued.item)
    }
  }
  const handleEvent = (envelope: any): boolean => {
    if (envelope?.type === 'session.delegation.created' && envelope.delegation?.target === 'responses') {
      if (!active()) return true
      const id = text(envelope.delegation.response_id), delegationId = text(envelope.delegation.id)
      if (id) {
        if (turnFor(id, delegationId)) currentByDelegation.set(delegationId, id)
        drainDeferred(); flush()
      }
      return true
    }
    if (envelope?.type !== 'response.event') return false
    const nested = envelope.event || {}
    if (!['response.created', 'response.output_item.done', 'response.completed', 'response.failed', 'response.incomplete'].includes(nested.type)) return false
    if (nested.type === 'response.output_item.done' && nested.item?.type !== 'function_call') return false
    if (!active()) return true
    const delegationId = text(envelope.delegation_id)
    if (nested.type === 'response.output_item.done') {
      const ownerId = callOwners.get(text(nested.item.call_id))
      if (ownerId) {
        const original = turns.get(ownerId)?.calls.get(text(nested.item.call_id))?.item
        if (original?.name !== nested.item.name || original?.arguments !== nested.item.arguments) fail('The voice tool identity was reused for different details. Please reconnect voice.')
        // A duplicate older item can arrive after a newer response.created.
        // Its original call identity remains authoritative; never execute it
        // against the newer delegation merely because it is now current.
        return true
      }
    }
    const turn = resolveTurn(envelope)
    if (nested.type === 'response.created') {
      if (!turn) { fail('The voice response identity was missing. Please reconnect voice.'); return true }
      currentByDelegation.set(delegationId, turn.id)
      drainDeferred(); flush(); return true
    }
    if (nested.type === 'response.output_item.done') {
      if (turn) addCall(turn, nested.item)
      else {
        if (deferred.length >= 100) fail('The voice tool response could not be matched. Please reconnect voice.')
        else deferred.push({ envelope, item: nested.item })
      }
      return true
    }
    if (!turn) { fail('The voice response could not be matched to its request. Please reconnect voice.'); return true }
    if (nested.type !== 'response.completed') {
      turn.failed = true
      if (turn.calls.size) io.onError('Voice could not continue the app result. Please check the result shown in Helfi before retrying.')
      return false // Keep the host's existing failure reporting.
    }
    turn.terminal = true
    // Forwarded response.output is deliberately empty; calls came from the
    // granular item events, never this lifecycle snapshot.
    drainDeferred(); flush(); return true
  }
  return { handleEvent, stop: () => { stopped = true; deferred.length = 0 } }
}
