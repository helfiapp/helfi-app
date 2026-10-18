export const VOICE_CREDITS_CHANGED = 'helfi:credits-changed'
export type VoiceCreditChange = { source: 'voice-assistant'; accountId: string; sessionId: string; phase: 'reserved' | 'settled' | 'uncertain' }
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value)

export function matchesVoiceCreditChange(value: any, accountId: string | undefined): value is VoiceCreditChange {
  return Boolean(accountId && value?.source === 'voice-assistant' && value.accountId === accountId && identifier(value.sessionId) && ['reserved', 'settled', 'uncertain'].includes(value.phase))
}

export function walletCreditBalance(value: any): { remaining: number; percentUsed?: number } | null {
  const remaining = value?.credits?.total, percent = value?.percentUsed
  if (typeof remaining !== 'number' || !Number.isFinite(remaining) || remaining < 0) return null
  return { remaining: Math.round(remaining), ...(typeof percent === 'number' && Number.isFinite(percent) ? { percentUsed: Math.max(0, Math.min(100, percent)) } : {}) }
}

/** Only observes an already owned billing session. It never delivers action
 * jobs, charges credits or repeats an app request. Voice stopping does not
 * cancel this observer; account changes and unmounting do. */
export function watchVoiceCreditSettlement(io: {
  accountId: string; sessionId: string; isCurrent: () => boolean
  request: (signal: AbortSignal) => Promise<unknown>
  onChange: (event: VoiceCreditChange) => void
  onFinished?: () => void
  now?: () => number
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
}) {
  const now = io.now || Date.now, schedule = io.setTimer || setTimeout, unschedule = io.clearTimer || clearTimeout
  let stopped = false, started = false, polls = 0, deadline = 0
  let timer: ReturnType<typeof setTimeout> | null = null, network: AbortController | null = null
  const current = () => !stopped && io.isCurrent()
  const notify = (phase: VoiceCreditChange['phase']) => {
    if (current()) {
      try { io.onChange({ source: 'voice-assistant', accountId: io.accountId, sessionId: io.sessionId, phase }) }
      catch { /* A display listener cannot interrupt financial observation. */ }
    }
  }
  const cancel = () => {
    if (stopped) return
    stopped = true
    if (timer) unschedule(timer)
    timer = null; network?.abort(); network = null
    io.onFinished?.()
  }
  const finish = (phase: 'settled' | 'uncertain') => { notify(phase); cancel() }
  const poll = async () => {
    timer = null
    if (!current()) { cancel(); return }
    if (++polls > 12 || now() >= deadline) { finish('uncertain'); return }
    const controller = new AbortController(); network = controller
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const value = await Promise.race([
        io.request(controller.signal),
        new Promise<never>((_, reject) => { timeout = schedule(() => { controller.abort(); reject(new Error('Credit verification timed out')) }, 5000) }),
      ]) as any
      if (!current()) return
      if (!value || value.sessionId !== io.sessionId || typeof value.state !== 'string') throw new Error('Credit session did not match')
      if (value.state === 'complete' || value.state === 'closed') { finish('settled'); return }
      if (['uncertain', 'failed', 'expired'].includes(value.state)) { finish('uncertain'); return }
    } catch { /* Keep the reservation unknown; a failed read is never zero. */ }
    finally { if (timeout !== undefined) unschedule(timeout); if (network === controller) network = null }
    if (!current()) { cancel(); return }
    const delay = Math.min(15000, 500 * 2 ** Math.min(polls - 1, 5), Math.max(0, deadline - now()))
    timer = schedule(() => { void poll() }, delay)
  }
  if (!identifier(io.accountId) || !identifier(io.sessionId)) stopped = true
  else notify('reserved')
  return {
    cancel,
    afterStop() {
      if (started || !current()) return
      started = true; deadline = now() + 90000
      timer = schedule(() => { void poll() }, 0)
    },
  }
}
