import { prisma } from '@/lib/prisma'

type CircuitState = {
  open: boolean
  openUntil: Date | null
  reason: string | null
}

const CACHE_MS = 10_000
const cache = new Map<string, { cachedAt: number; state: CircuitState }>()

async function ensureCircuitTable() {
  // Keep this lightweight and compatible across environments.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS SafetyCircuitBreaker (
      scope TEXT PRIMARY KEY,
      openUntil TIMESTAMPTZ,
      openedAt TIMESTAMPTZ,
      reason TEXT,
      updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

export async function getCircuitState(scope: string): Promise<CircuitState> {
  const safeScope = String(scope || '').trim()
  if (!safeScope) return { open: false, openUntil: null, reason: null }

  const cached = cache.get(safeScope)
  const now = Date.now()
  if (cached && now - cached.cachedAt < CACHE_MS) {
    return cached.state
  }

  await ensureCircuitTable()

  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT openUntil, reason FROM SafetyCircuitBreaker WHERE scope = $1',
      safeScope
    )
    const row = rows?.[0]
    const openUntil = row?.openuntil || row?.openUntil ? new Date(row.openuntil || row.openUntil) : null
    const reason = row?.reason ? String(row.reason) : null
    const open = !!(openUntil && openUntil.getTime() > now)
    const state = { open, openUntil, reason }
    cache.set(safeScope, { cachedAt: now, state })
    return state
  } catch (error) {
    console.warn('[safety-circuit] Failed to read circuit state (non-blocking)', error)
    return { open: false, openUntil: null, reason: null }
  }
}

export async function openCircuit(options: { scope: string; minutes: number; reason: string }) {
  const safeScope = String(options.scope || '').trim()
  if (!safeScope) return

  const minutesRaw = Number(options.minutes)
  const minutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : 5
  const reason = String(options.reason || '').trim().slice(0, 500)
  const openUntil = new Date(Date.now() + minutes * 60 * 1000)

  await ensureCircuitTable()

  try {
    await prisma.$queryRawUnsafe(
      `INSERT INTO SafetyCircuitBreaker (scope, openUntil, openedAt, reason, updatedAt)
       VALUES ($1, $2, NOW(), $3, NOW())
       ON CONFLICT (scope)
       DO UPDATE SET openUntil = EXCLUDED.openUntil,
                     openedAt = EXCLUDED.openedAt,
                     reason = EXCLUDED.reason,
                     updatedAt = NOW()`,
      safeScope,
      openUntil,
      reason
    )
  } catch (error) {
    console.warn('[safety-circuit] Failed to open circuit (non-blocking)', error)
  } finally {
    cache.delete(safeScope)
  }
}

export async function closeCircuit(scope: string) {
  const safeScope = String(scope || '').trim()
  if (!safeScope) return

  await ensureCircuitTable()

  try {
    await prisma.$queryRawUnsafe(
      `INSERT INTO SafetyCircuitBreaker (scope, openUntil, openedAt, reason, updatedAt)
       VALUES ($1, NULL, NULL, NULL, NOW())
       ON CONFLICT (scope)
       DO UPDATE SET openUntil = NULL, openedAt = NULL, reason = NULL, updatedAt = NOW()`,
      safeScope
    )
  } catch (error) {
    console.warn('[safety-circuit] Failed to close circuit (non-blocking)', error)
  } finally {
    cache.delete(safeScope)
  }
}

