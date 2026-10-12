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
  read: () => Promise<AppleHealthTodaySummary>
  importSummary: (summary: AppleHealthTodaySummary, token: string) => Promise<void>
  now?: () => number
}) {
  let inFlight: { userId: string; done: Promise<void> } | null = null
  const lastAttempt = new Map<string, number>()
  return async (opts: { userId: string; token: string; manual?: boolean; allowed: () => boolean }): Promise<AppleHealthSyncResult | null> => {
    if (!opts.userId || !opts.token || !opts.allowed()) return null
    while (inFlight) {
      // A repeated event for this account already has a refresh in progress.
      if (inFlight.userId === opts.userId) return null
      // A newly signed-in account must not lose its initial foreground event.
      await inFlight.done
      if (!opts.allowed()) return null
    }
    const now = deps.now?.() ?? Date.now()
    if (!opts.manual && now - (lastAttempt.get(opts.userId) ?? -Infinity) < 60_000) return null
    let release: () => void = () => {}
    const job = { userId: opts.userId, done: new Promise<void>(resolve => { release = resolve }) }
    inFlight = job
    lastAttempt.set(opts.userId, now)
    try {
      const summary = await boundedRead(deps.read)
      if (!opts.allowed()) return null
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
