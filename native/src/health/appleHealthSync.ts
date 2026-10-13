import type { AppleHealthTodaySummary } from './appleHealth'

export const appleHealthAutoKey = (userId: string) => `helfi_apple_health_auto_v1:${encodeURIComponent(userId)}`
export type AppleHealthSyncResult = { summary: AppleHealthTodaySummary; imported: boolean }

async function boundedRead(read: () => Promise<AppleHealthTodaySummary>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Apple Health took too long to respond. Please try again.')), 30_000) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// Shared by automatic and manual refresh; never run overlapping daily reads/posts.
export function createAppleHealthSync(deps: {
  read: (localDate: string) => Promise<AppleHealthTodaySummary>
  importSummary: (summary: AppleHealthTodaySummary, token: string) => Promise<void>
  now?: () => number
}) {
  let inFlight: { key: string; done: Promise<void> } | null = null
  const lastAttempt = new Map<string, number>()
  return async (opts: { userId: string; token: string; localDate?: string; manual?: boolean; allowed: () => boolean }): Promise<AppleHealthSyncResult | null> => {
    if (!opts.userId || !opts.token || !opts.allowed()) return null
    const captured = new Date(deps.now?.() ?? Date.now())
    const localDate = opts.localDate ?? `${captured.getFullYear()}-${String(captured.getMonth() + 1).padStart(2, '0')}-${String(captured.getDate()).padStart(2, '0')}`
    const key = JSON.stringify([opts.userId, localDate])
    while (inFlight) {
      // A repeated event for this account already has a refresh in progress.
      if (inFlight.key === key) return null
      // A different account or selected day must not lose its refresh request.
      await inFlight.done
      if (!opts.allowed()) return null
    }
    const now = deps.now?.() ?? Date.now()
    if (!opts.manual && now - (lastAttempt.get(key) ?? -Infinity) < 60_000) return null
    let release: () => void = () => {}
    const job = { key, done: new Promise<void>(resolve => { release = resolve }) }
    inFlight = job
    lastAttempt.set(key, now)
    try {
      const summary = await boundedRead(() => deps.read(localDate))
      if (!opts.allowed()) return null
      if (summary.localDate !== localDate) throw new Error('Apple Health returned a different date. Please try again.')
      // A phone can have steps but no active-energy samples. Never invent calories.
      let imported = false
      if (summary.activeEnergyKcal !== null && Number.isFinite(summary.activeEnergyKcal) && summary.activeEnergyKcal > 0) {
        await deps.importSummary(summary, opts.token)
        imported = true
      }
      return opts.allowed() ? { summary, imported } : null
    } finally {
      if (inFlight === job) inFlight = null
      release()
    }
  }
}
