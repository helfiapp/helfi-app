import { AsyncLocalStorage } from 'node:async_hooks'

export type RunContext = {
  runId?: string | null
  feature?: string | null
}

const runContextStore = new AsyncLocalStorage<RunContext>()

/**
 * Run a function with a scoped run context (e.g., insights regeneration runId).
 * The context is available to downstream logging via getRunContext.
 */
export function withRunContext<T>(context: RunContext, fn: () => Promise<T> | T): Promise<T> | T {
  return runContextStore.run(context, fn as any)
}

export function getRunContext(): RunContext | undefined {
  return runContextStore.getStore()
}
