import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

const REPORT_PERIOD_DAYS = 7

export type WeeklyReportStatus = 'RUNNING' | 'READY' | 'FAILED' | 'LOCKED'

export type WeeklyReportRecord = {
  id: string
  userId: string
  periodStart: string
  periodEnd: string
  status: WeeklyReportStatus
  summary: string | null
  dataSummary: Record<string, unknown> | null
  report: Record<string, unknown> | null
  model: string | null
  creditsCharged: number | null
  error: string | null
  readyAt: string | null
  createdAt: string
  updatedAt: string
  lastShownAt: string | null
  dismissedAt: string | null
  dontShowAt: string | null
  viewedAt: string | null
}

export type WeeklyReportState = {
  userId: string
  onboardingCompletedAt: string | null
  nextReportDueAt: string | null
  lastReportAt: string | null
  lastAttemptAt: string | null
  lastStatus: string | null
}

let weeklyTablesEnsured = false

export async function ensureWeeklyReportTables() {
  if (weeklyTablesEnsured) return
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS WeeklyHealthReports (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        periodStart DATE NOT NULL,
        periodEnd DATE NOT NULL,
        status TEXT NOT NULL,
        summary TEXT,
        dataSummary JSONB,
        report JSONB,
        model TEXT,
        creditsCharged INTEGER,
        error TEXT,
        readyAt TIMESTAMPTZ,
        createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        lastShownAt TIMESTAMPTZ,
        dismissedAt TIMESTAMPTZ,
        dontShowAt TIMESTAMPTZ,
        viewedAt TIMESTAMPTZ
      )
    `)
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_created ON WeeklyHealthReports(userId, createdAt DESC)'
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_weekly_reports_status ON WeeklyHealthReports(status)'
    ).catch(() => {})

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS WeeklyHealthReportState (
        userId TEXT PRIMARY KEY,
        onboardingCompletedAt TIMESTAMPTZ,
        nextReportDueAt TIMESTAMPTZ,
        lastReportAt TIMESTAMPTZ,
        lastAttemptAt TIMESTAMPTZ,
        lastStatus TEXT
      )
    `)
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_weekly_report_state_due ON WeeklyHealthReportState(nextReportDueAt)'
    ).catch(() => {})
    weeklyTablesEnsured = true
  } catch (error) {
    console.error('[weekly-report] Failed to ensure tables', error)
  }
}

function normalizeReportRow(row: any): WeeklyReportRecord | null {
  if (!row) return null
  return {
    id: row.id,
    userId: row.userId,
    periodStart: row.periodStart ? new Date(row.periodStart).toISOString().slice(0, 10) : '',
    periodEnd: row.periodEnd ? new Date(row.periodEnd).toISOString().slice(0, 10) : '',
    status: row.status,
    summary: row.summary ?? null,
    dataSummary: row.dataSummary ?? null,
    report: row.report ?? null,
    model: row.model ?? null,
    creditsCharged: row.creditsCharged ?? null,
    error: row.error ?? null,
    readyAt: row.readyAt ? new Date(row.readyAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
    lastShownAt: row.lastShownAt ? new Date(row.lastShownAt).toISOString() : null,
    dismissedAt: row.dismissedAt ? new Date(row.dismissedAt).toISOString() : null,
    dontShowAt: row.dontShowAt ? new Date(row.dontShowAt).toISOString() : null,
    viewedAt: row.viewedAt ? new Date(row.viewedAt).toISOString() : null,
  }
}

function normalizeStateRow(row: any): WeeklyReportState | null {
  if (!row) return null
  return {
    userId: row.userId,
    onboardingCompletedAt: row.onboardingCompletedAt ? new Date(row.onboardingCompletedAt).toISOString() : null,
    nextReportDueAt: row.nextReportDueAt ? new Date(row.nextReportDueAt).toISOString() : null,
    lastReportAt: row.lastReportAt ? new Date(row.lastReportAt).toISOString() : null,
    lastAttemptAt: row.lastAttemptAt ? new Date(row.lastAttemptAt).toISOString() : null,
    lastStatus: row.lastStatus ?? null,
  }
}

export function getNextDueAt(fromDate: Date) {
  return new Date(fromDate.getTime() + REPORT_PERIOD_DAYS * 24 * 60 * 60 * 1000)
}

export async function getWeeklyReportState(userId: string): Promise<WeeklyReportState | null> {
  await ensureWeeklyReportTables()
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT * FROM WeeklyHealthReportState WHERE userId = $1',
      userId
    )
    return normalizeStateRow(rows?.[0])
  } catch (error) {
    console.warn('[weekly-report] Failed to read state', error)
    return null
  }
}

export async function upsertWeeklyReportState(
  userId: string,
  updates: Partial<WeeklyReportState>
): Promise<WeeklyReportState | null> {
  await ensureWeeklyReportTables()
  const existing = await getWeeklyReportState(userId)
  const merged: WeeklyReportState = {
    userId,
    onboardingCompletedAt: updates.onboardingCompletedAt ?? existing?.onboardingCompletedAt ?? null,
    nextReportDueAt: updates.nextReportDueAt ?? existing?.nextReportDueAt ?? null,
    lastReportAt: updates.lastReportAt ?? existing?.lastReportAt ?? null,
    lastAttemptAt: updates.lastAttemptAt ?? existing?.lastAttemptAt ?? null,
    lastStatus: updates.lastStatus ?? existing?.lastStatus ?? null,
  }

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO WeeklyHealthReportState (userId, onboardingCompletedAt, nextReportDueAt, lastReportAt, lastAttemptAt, lastStatus)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (userId) DO UPDATE SET
         onboardingCompletedAt = EXCLUDED.onboardingCompletedAt,
         nextReportDueAt = EXCLUDED.nextReportDueAt,
         lastReportAt = EXCLUDED.lastReportAt,
         lastAttemptAt = EXCLUDED.lastAttemptAt,
         lastStatus = EXCLUDED.lastStatus`,
      merged.userId,
      merged.onboardingCompletedAt,
      merged.nextReportDueAt,
      merged.lastReportAt,
      merged.lastAttemptAt,
      merged.lastStatus
    )
    return merged
  } catch (error) {
    console.warn('[weekly-report] Failed to upsert state', error)
    return existing ?? null
  }
}

export async function markWeeklyReportOnboardingComplete(userId: string, completedAt = new Date()) {
  await ensureWeeklyReportTables()
  const existing = await getWeeklyReportState(userId)
  if (existing?.onboardingCompletedAt) return existing
  const nextDueAt = getNextDueAt(completedAt)
  return upsertWeeklyReportState(userId, {
    onboardingCompletedAt: completedAt.toISOString(),
    nextReportDueAt: nextDueAt.toISOString(),
    lastStatus: 'scheduled',
  })
}

export async function createWeeklyReportRecord(params: {
  userId: string
  periodStart: string
  periodEnd: string
  status: WeeklyReportStatus
  summary?: string | null
  dataSummary?: Record<string, unknown> | null
  report?: Record<string, unknown> | null
  model?: string | null
  creditsCharged?: number | null
  error?: string | null
  readyAt?: string | null
}): Promise<WeeklyReportRecord | null> {
  await ensureWeeklyReportTables()
  const reportId = randomUUID()
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO WeeklyHealthReports (id, userId, periodStart, periodEnd, status, summary, dataSummary, report, model, creditsCharged, error, readyAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)`,
      reportId,
      params.userId,
      params.periodStart,
      params.periodEnd,
      params.status,
      params.summary ?? null,
      JSON.stringify(params.dataSummary ?? null),
      JSON.stringify(params.report ?? null),
      params.model ?? null,
      params.creditsCharged ?? null,
      params.error ?? null,
      params.readyAt ?? null
    )
    const row = await getWeeklyReportById(params.userId, reportId)
    return row
  } catch (error) {
    console.warn('[weekly-report] Failed to create report', error)
    return null
  }
}

export async function updateWeeklyReportRecord(
  userId: string,
  reportId: string,
  updates: Partial<WeeklyReportRecord>
): Promise<WeeklyReportRecord | null> {
  await ensureWeeklyReportTables()
  const existing = await getWeeklyReportById(userId, reportId)
  if (!existing) return null

  const merged: WeeklyReportRecord = {
    ...existing,
    ...updates,
    id: existing.id,
    userId: existing.userId,
  }

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE WeeklyHealthReports
       SET status = $3,
           summary = $4,
           dataSummary = $5::jsonb,
           report = $6::jsonb,
           model = $7,
           creditsCharged = $8,
           error = $9,
           readyAt = $10,
           updatedAt = NOW(),
           lastShownAt = $11,
           dismissedAt = $12,
           dontShowAt = $13,
           viewedAt = $14
       WHERE id = $1 AND userId = $2`,
      reportId,
      userId,
      merged.status,
      merged.summary ?? null,
      JSON.stringify(merged.dataSummary ?? null),
      JSON.stringify(merged.report ?? null),
      merged.model ?? null,
      merged.creditsCharged ?? null,
      merged.error ?? null,
      merged.readyAt ?? null,
      merged.lastShownAt ?? null,
      merged.dismissedAt ?? null,
      merged.dontShowAt ?? null,
      merged.viewedAt ?? null
    )
    return merged
  } catch (error) {
    console.warn('[weekly-report] Failed to update report', error)
    return existing
  }
}

export async function getWeeklyReportById(userId: string, reportId: string): Promise<WeeklyReportRecord | null> {
  await ensureWeeklyReportTables()
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT * FROM WeeklyHealthReports WHERE id = $1 AND userId = $2',
      reportId,
      userId
    )
    return normalizeReportRow(rows?.[0])
  } catch (error) {
    console.warn('[weekly-report] Failed to read report by id', error)
    return null
  }
}

export async function getLatestWeeklyReport(userId: string): Promise<WeeklyReportRecord | null> {
  await ensureWeeklyReportTables()
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT * FROM WeeklyHealthReports WHERE userId = $1 ORDER BY createdAt DESC LIMIT 1',
      userId
    )
    return normalizeReportRow(rows?.[0])
  } catch (error) {
    console.warn('[weekly-report] Failed to read latest report', error)
    return null
  }
}

export async function listWeeklyReports(userId: string, limit = 8): Promise<WeeklyReportRecord[]> {
  await ensureWeeklyReportTables()
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT * FROM WeeklyHealthReports WHERE userId = $1 ORDER BY createdAt DESC LIMIT $2',
      userId,
      limit
    )
    return rows.map(normalizeReportRow).filter(Boolean) as WeeklyReportRecord[]
  } catch (error) {
    console.warn('[weekly-report] Failed to list reports', error)
    return []
  }
}

export async function listDueWeeklyReportUsers(limit = 25): Promise<Array<{ userId: string; nextReportDueAt: string | null }>> {
  await ensureWeeklyReportTables()
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT userId, nextReportDueAt
       FROM WeeklyHealthReportState
       WHERE nextReportDueAt IS NOT NULL
         AND nextReportDueAt <= NOW()
         AND (lastAttemptAt IS NULL OR lastAttemptAt <= NOW() - INTERVAL '20 hours')
       ORDER BY nextReportDueAt ASC
       LIMIT $1`,
      limit
    )
    return rows.map((row) => ({
      userId: row.userId,
      nextReportDueAt: row.nextReportDueAt ? new Date(row.nextReportDueAt).toISOString() : null,
    }))
  } catch (error) {
    console.warn('[weekly-report] Failed to list due users', error)
    return []
  }
}

export async function updateWeeklyReportNotification(
  userId: string,
  reportId: string,
  action: 'shown' | 'viewed' | 'dont_show'
): Promise<WeeklyReportRecord | null> {
  const report = await getWeeklyReportById(userId, reportId)
  if (!report) return null
  const now = new Date().toISOString()
  if (action === 'shown') {
    return updateWeeklyReportRecord(userId, reportId, { lastShownAt: now })
  }
  if (action === 'viewed') {
    return updateWeeklyReportRecord(userId, reportId, { viewedAt: now })
  }
  return updateWeeklyReportRecord(userId, reportId, { dontShowAt: now, dismissedAt: now })
}

export function summarizeCoverage(stats: {
  daysActive: number
  totalEvents: number
  foodCount: number
  moodCount: number
  checkinCount: number
  symptomCount: number
}): string | null {
  if (stats.daysActive >= 3 && stats.totalEvents >= 5) return null
  return 'We only captured a small amount of data this week, so this report may look lighter than usual. Keep logging each day for clearer trends.'
}
