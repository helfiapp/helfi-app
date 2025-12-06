import { AsyncLocalStorage } from 'node:async_hooks'

export type RunContext = {
  runId?: string | null
  feature?: string | null
  meta?: {
    userId?: string | null
    changeTypes?: string[]
    sections?: string[]
    phase?: 'quick' | 'full'
  }
}

const runContextStore = new AsyncLocalStorage<RunContext>()
let fallbackContext: RunContext | undefined

/**
 * Run a function with a scoped run context (e.g., insights regeneration runId).
 * The context is available to downstream logging via getRunContext.
 */
export function withRunContext<T>(context: RunContext, fn: () => Promise<T> | T): Promise<T> | T {
  fallbackContext = context
  try {
    return runContextStore.run(context, fn as any)
  } finally {
    fallbackContext = undefined
  }
}

export function getRunContext(): RunContext | undefined {
  return runContextStore.getStore() ?? fallbackContext
}
