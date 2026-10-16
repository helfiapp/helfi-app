export type VoiceReadTicket = { signal: AbortSignal; isCurrent: () => boolean; finish: () => void }

// Screen-local reads only. Changing account or unmounting invalidates every
// outstanding response, even if a fetch adapter ignores AbortSignal.
export function createVoiceActionReadGuard() {
  let mounted = false
  let account: string | null = null
  let epoch = 0
  let sequence = 0
  const reads = new Map<string, { id: number; controller: AbortController }>()
  const invalidate = () => { epoch++; for (const read of reads.values()) read.controller.abort(); reads.clear() }
  return {
    setAccount(next: string | null) { if (account !== next) { account = next; invalidate() } },
    mount() { mounted = true },
    unmount() { mounted = false; invalidate() },
    begin(expectedAccount: string | null, scope: string): VoiceReadTicket | null {
      if (!mounted || !account || account !== expectedAccount) return null
      reads.get(scope)?.controller.abort()
      const id = ++sequence, generation = epoch, controller = new AbortController()
      reads.set(scope, { id, controller })
      const isCurrent = () => mounted && account === expectedAccount && epoch === generation && reads.get(scope)?.id === id && !controller.signal.aborted
      return { signal:controller.signal,isCurrent,finish:() => { if (reads.get(scope)?.id === id) reads.delete(scope) } }
    },
  }
}

export function matchesVoiceActionReadRefresh(payload: any, accountId: string | undefined, area: 'devices' | 'health-images' | 'coach-history' | 'checkin-history') {
  const expected = {
    devices: ['devices.interest.update','device_interest'],
    'health-images': ['health_image_note.delete','health_image_note'],
    'coach-history': ['coach_history.delete','history_action'],
    'checkin-history': ['checkin_history.delete','history_action'],
  }[area]
  return Boolean(accountId && payload?.source === 'voice-assistant' && payload.accountId === accountId && payload.action === expected[0] && payload.kind === expected[1] && Array.isArray(payload.changedAreas) && payload.changedAreas.length === 1 && payload.changedAreas[0] === area)
}
