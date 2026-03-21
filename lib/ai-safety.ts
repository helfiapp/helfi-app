import { prisma } from '@/lib/prisma'
import { reportCriticalError } from '@/lib/error-reporter'
import { getCircuitState, openCircuit } from '@/lib/safety-circuit'

type AiGuardContext = {
  feature?: string | null
  userId?: string | null
  runId?: string | null
}

const envNumber = (name: string, fallback: number) => {
  const raw = Number(process.env[name] || '')
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

const AI_GUARD_WINDOW_MINUTES = envNumber('OPENAI_GUARD_WINDOW_MINUTES', 10)
const AI_GUARD_GLOBAL_MAX_CALLS = envNumber('OPENAI_GUARD_GLOBAL_MAX_CALLS', 120)
const AI_GUARD_GLOBAL_MAX_COST_CENTS = envNumber('OPENAI_GUARD_GLOBAL_MAX_COST_CENTS', 400)
const AI_GUARD_USER_MAX_CALLS = envNumber('OPENAI_GUARD_USER_MAX_CALLS', 60)
const AI_GUARD_USER_MAX_COST_CENTS = envNumber('OPENAI_GUARD_USER_MAX_COST_CENTS', 200)
const AI_GUARD_RUN_MAX_CALLS = envNumber('OPENAI_GUARD_RUN_MAX_CALLS', 32)
const AI_GUARD_RUN_MAX_COST_CENTS = envNumber('OPENAI_GUARD_RUN_MAX_COST_CENTS', 80)
const AI_GUARD_CIRCUIT_MINUTES = envNumber('OPENAI_GUARD_CIRCUIT_MINUTES', 20)

const GLOBAL_SCOPE = 'openai-global'

export class AiSafetyError extends Error {
  code = 'ai_safety_blocked'
  status = 429

  constructor(message: string) {
    super(message)
    this.name = 'AiSafetyError'
  }
}

export function isAiSafetyError(error: unknown): error is AiSafetyError {
  return (
    error instanceof Error &&
    (error.name === 'AiSafetyError' || String((error as any)?.code || '') === 'ai_safety_blocked')
  )
}

async function throwIfCircuitOpen(scope: string, fallbackMessage: string) {
  const state = await getCircuitState(scope)
  if (!state.open) return
  const reason = state.reason ? ` ${state.reason}` : ''
  throw new AiSafetyError(`${fallbackMessage}${reason}`.trim())
}

async function openAiCircuitAndThrow(options: {
  scope: string
  message: string
  userId?: string | null
  details: Record<string, unknown>
}) {
  await openCircuit({
    scope: options.scope,
    minutes: AI_GUARD_CIRCUIT_MINUTES,
    reason: options.message,
  })

  await reportCriticalError({
    source: 'ai.safety',
    error: new Error(options.message),
    userId: options.userId || undefined,
    details: options.details,
  })

  throw new AiSafetyError(options.message)
}

export async function assertAiUsageAllowed(context: AiGuardContext = {}) {
  const recentFrom = new Date(Date.now() - AI_GUARD_WINDOW_MINUTES * 60 * 1000)
  const userId = typeof context.userId === 'string' && context.userId.trim() ? context.userId.trim() : null
  const runId = typeof context.runId === 'string' && context.runId.trim() ? context.runId.trim() : null
  const feature = typeof context.feature === 'string' && context.feature.trim() ? context.feature.trim() : 'unknown'

  await throwIfCircuitOpen(
    GLOBAL_SCOPE,
    'AI calls are temporarily paused across Helfi while we stop an unusual usage spike.'
  )

  if (userId) {
    await throwIfCircuitOpen(
      `openai-user:${userId}`,
      'AI calls are temporarily paused for this account while we stop an unusual usage spike.'
    )
  }

  const globalRecent = await prisma.aIUsageEvent.aggregate({
    where: { createdAt: { gte: recentFrom }, success: true },
    _count: { _all: true },
    _sum: { costCents: true },
  })

  const globalCalls = Number(globalRecent._count?._all || 0)
  const globalCostCents = Number(globalRecent._sum?.costCents || 0)
  if (globalCalls >= AI_GUARD_GLOBAL_MAX_CALLS || globalCostCents >= AI_GUARD_GLOBAL_MAX_COST_CENTS) {
    await openAiCircuitAndThrow({
      scope: GLOBAL_SCOPE,
      message: 'AI calls were paused across Helfi because recent usage spiked above the safety limit.',
      userId,
      details: {
        feature,
        runId,
        recentWindowMinutes: AI_GUARD_WINDOW_MINUTES,
        globalCalls,
        globalCostCents,
        maxCalls: AI_GUARD_GLOBAL_MAX_CALLS,
        maxCostCents: AI_GUARD_GLOBAL_MAX_COST_CENTS,
      },
    })
  }

  if (userId) {
    const userRecent = await prisma.aIUsageEvent.aggregate({
      where: {
        userId,
        createdAt: { gte: recentFrom },
        success: true,
      },
      _count: { _all: true },
      _sum: { costCents: true },
    })

    const userCalls = Number(userRecent._count?._all || 0)
    const userCostCents = Number(userRecent._sum?.costCents || 0)
    if (userCalls >= AI_GUARD_USER_MAX_CALLS || userCostCents >= AI_GUARD_USER_MAX_COST_CENTS) {
      await openAiCircuitAndThrow({
        scope: `openai-user:${userId}`,
        message: 'AI calls were paused for this account because recent usage spiked above the safety limit.',
        userId,
        details: {
          feature,
          runId,
          recentWindowMinutes: AI_GUARD_WINDOW_MINUTES,
          userCalls,
          userCostCents,
          maxCalls: AI_GUARD_USER_MAX_CALLS,
          maxCostCents: AI_GUARD_USER_MAX_COST_CENTS,
        },
      })
    }
  }

  if (runId) {
    const runRecent = await prisma.aIUsageEvent.aggregate({
      where: { runId, success: true },
      _count: { _all: true },
      _sum: { costCents: true },
    })

    const runCalls = Number(runRecent._count?._all || 0)
    const runCostCents = Number(runRecent._sum?.costCents || 0)
    if (runCalls >= AI_GUARD_RUN_MAX_CALLS || runCostCents >= AI_GUARD_RUN_MAX_COST_CENTS) {
      const scope = userId ? `openai-user:${userId}` : GLOBAL_SCOPE
      await openAiCircuitAndThrow({
        scope,
        message: 'AI calls were paused because one refresh run grew far beyond the safety limit.',
        userId,
        details: {
          feature,
          runId,
          runCalls,
          runCostCents,
          maxCalls: AI_GUARD_RUN_MAX_CALLS,
          maxCostCents: AI_GUARD_RUN_MAX_COST_CENTS,
        },
      })
    }
  }
}
