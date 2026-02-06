import { prisma } from '@/lib/prisma'
import { publishWithQStash, scheduleWeeklyReportNotificationWithQStash } from '@/lib/qstash'
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
  notifyAt: string | null
  emailSentAt: string | null
  pushSentAt: string | null
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
  reportsEnabled: boolean
  reportsEnabledAt: string | null
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
        notifyAt TIMESTAMPTZ,
        emailSentAt TIMESTAMPTZ,
        pushSentAt TIMESTAMPTZ,
        createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        lastShownAt TIMESTAMPTZ,
        dismissedAt TIMESTAMPTZ,
        dontShowAt TIMESTAMPTZ,
        viewedAt TIMESTAMPTZ
      )
    `)
    await prisma.$executeRawUnsafe(
      'ALTER TABLE WeeklyHealthReports ADD COLUMN IF NOT EXISTS notifyAt TIMESTAMPTZ'
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      'ALTER TABLE WeeklyHealthReports ADD COLUMN IF NOT EXISTS emailSentAt TIMESTAMPTZ'
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      'ALTER TABLE WeeklyHealthReports ADD COLUMN IF NOT EXISTS pushSentAt TIMESTAMPTZ'
    ).catch(() => {})
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
        lastStatus TEXT,
        reportsEnabled BOOLEAN DEFAULT FALSE,
        reportsEnabledAt TIMESTAMPTZ
      )
    `)
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_weekly_report_state_due ON WeeklyHealthReportState(nextReportDueAt)'
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      'ALTER TABLE WeeklyHealthReportState ADD COLUMN IF NOT EXISTS reportsEnabled BOOLEAN DEFAULT FALSE'
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      'ALTER TABLE WeeklyHealthReportState ADD COLUMN IF NOT EXISTS reportsEnabledAt TIMESTAMPTZ'
    ).catch(() => {})
    await prisma.$executeRawUnsafe(`
      DELETE FROM WeeklyHealthReportState
      WHERE ctid NOT IN (
        SELECT DISTINCT ON (userId) ctid
        FROM WeeklyHealthReportState
        ORDER BY userId, lastAttemptAt DESC NULLS LAST, nextReportDueAt DESC NULLS LAST
      )
    `).catch(() => {})
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_report_state_user ON WeeklyHealthReportState(userId)'
    ).catch(() => {})
    weeklyTablesEnsured = true
  } catch (error) {
    console.error('[weekly-report] Failed to ensure tables', error)
  }
}

function readRowValue(row: any, key: string) {
  if (!row) return undefined
  if (row[key] !== undefined) return row[key]
  const lower = key.toLowerCase()
  return row[lower]
}

function normalizeBool(value: unknown): boolean | null {
  if (value === true || value === false) return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (value === 't' || value === 'true' || value === 'TRUE') return true
  if (value === 'f' || value === 'false' || value === 'FALSE') return false
  return null
}

function normalizeReportRow(row: any): WeeklyReportRecord | null {
  if (!row) return null
  const periodStart = readRowValue(row, 'periodStart')
  const periodEnd = readRowValue(row, 'periodEnd')
  const readyAt = readRowValue(row, 'readyAt')
  const notifyAt = readRowValue(row, 'notifyAt')
  const emailSentAt = readRowValue(row, 'emailSentAt')
  const pushSentAt = readRowValue(row, 'pushSentAt')
  const createdAt = readRowValue(row, 'createdAt')
  const updatedAt = readRowValue(row, 'updatedAt')
  const lastShownAt = readRowValue(row, 'lastShownAt')
  const dismissedAt = readRowValue(row, 'dismissedAt')
  const dontShowAt = readRowValue(row, 'dontShowAt')
  const viewedAt = readRowValue(row, 'viewedAt')
  return {
    id: readRowValue(row, 'id'),
    userId: readRowValue(row, 'userId'),
    periodStart: periodStart ? new Date(periodStart).toISOString().slice(0, 10) : '',
    periodEnd: periodEnd ? new Date(periodEnd).toISOString().slice(0, 10) : '',
    status: readRowValue(row, 'status'),
    summary: readRowValue(row, 'summary') ?? null,
    dataSummary: readRowValue(row, 'dataSummary') ?? null,
    report: readRowValue(row, 'report') ?? null,
    model: readRowValue(row, 'model') ?? null,
    creditsCharged: readRowValue(row, 'creditsCharged') ?? null,
    error: readRowValue(row, 'error') ?? null,
    readyAt: readyAt ? new Date(readyAt).toISOString() : null,
    notifyAt: notifyAt ? new Date(notifyAt).toISOString() : null,
    emailSentAt: emailSentAt ? new Date(emailSentAt).toISOString() : null,
    pushSentAt: pushSentAt ? new Date(pushSentAt).toISOString() : null,
    createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString(),
    lastShownAt: lastShownAt ? new Date(lastShownAt).toISOString() : null,
    dismissedAt: dismissedAt ? new Date(dismissedAt).toISOString() : null,
    dontShowAt: dontShowAt ? new Date(dontShowAt).toISOString() : null,
    viewedAt: viewedAt ? new Date(viewedAt).toISOString() : null,
  }
}

function normalizeStateRow(row: any): WeeklyReportState | null {
  if (!row) return null
  const onboardingCompletedAt = readRowValue(row, 'onboardingCompletedAt')
  const nextReportDueAt = readRowValue(row, 'nextReportDueAt')
  const lastReportAt = readRowValue(row, 'lastReportAt')
  const lastAttemptAt = readRowValue(row, 'lastAttemptAt')
  const reportsEnabledAt = readRowValue(row, 'reportsEnabledAt')
  const reportsEnabledRaw = readRowValue(row, 'reportsEnabled')
  const parsed = normalizeBool(reportsEnabledRaw)
  // Treat either "enabled flag" OR "schedule exists" as enabled.
  // This prevents the UI/API from flipping to OFF if one field is temporarily missing.
  const hasSchedule = Boolean(nextReportDueAt || reportsEnabledAt)
  const reportsEnabled = parsed !== null ? parsed || hasSchedule : hasSchedule
  return {
    userId: readRowValue(row, 'userId'),
    onboardingCompletedAt: onboardingCompletedAt ? new Date(onboardingCompletedAt).toISOString() : null,
    nextReportDueAt: nextReportDueAt ? new Date(nextReportDueAt).toISOString() : null,
    lastReportAt: lastReportAt ? new Date(lastReportAt).toISOString() : null,
    lastAttemptAt: lastAttemptAt ? new Date(lastAttemptAt).toISOString() : null,
    lastStatus: readRowValue(row, 'lastStatus') ?? null,
    reportsEnabled,
    reportsEnabledAt: reportsEnabledAt ? new Date(reportsEnabledAt).toISOString() : null,
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
  const nextReportDueAt = updates.nextReportDueAt ?? existing?.nextReportDueAt ?? null
  const resolvedReportsEnabled =
    updates.reportsEnabled !== undefined
      ? updates.reportsEnabled
      : existing?.reportsEnabled !== undefined
        ? existing.reportsEnabled
        : nextReportDueAt != null
  const merged: WeeklyReportState = {
    userId,
    onboardingCompletedAt: updates.onboardingCompletedAt ?? existing?.onboardingCompletedAt ?? null,
    nextReportDueAt,
    lastReportAt: updates.lastReportAt ?? existing?.lastReportAt ?? null,
    lastAttemptAt: updates.lastAttemptAt ?? existing?.lastAttemptAt ?? null,
    lastStatus: updates.lastStatus ?? existing?.lastStatus ?? null,
    reportsEnabled: resolvedReportsEnabled,
    reportsEnabledAt: updates.reportsEnabledAt ?? existing?.reportsEnabledAt ?? null,
  }

  try {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO WeeklyHealthReportState (userId, onboardingCompletedAt, nextReportDueAt, lastReportAt, lastAttemptAt, lastStatus, reportsEnabled, reportsEnabledAt)
         VALUES ($1, $2::timestamptz, $3::timestamptz, $4::timestamptz, $5::timestamptz, $6, $7, $8::timestamptz)
         ON CONFLICT (userId)
         DO UPDATE SET onboardingCompletedAt = EXCLUDED.onboardingCompletedAt,
                      nextReportDueAt = EXCLUDED.nextReportDueAt,
                      lastReportAt = EXCLUDED.lastReportAt,
                      lastAttemptAt = EXCLUDED.lastAttemptAt,
                      lastStatus = EXCLUDED.lastStatus,
                      reportsEnabled = EXCLUDED.reportsEnabled,
                      reportsEnabledAt = EXCLUDED.reportsEnabledAt`,
        merged.userId,
        merged.onboardingCompletedAt,
        merged.nextReportDueAt,
        merged.lastReportAt,
        merged.lastAttemptAt,
        merged.lastStatus,
        merged.reportsEnabled,
        merged.reportsEnabledAt
      )
    } catch (error) {
      console.warn('[weekly-report] Upsert failed with reportsEnabled columns, retrying basic upsert', error)
      await prisma.$executeRawUnsafe(
        `INSERT INTO WeeklyHealthReportState (userId, onboardingCompletedAt, nextReportDueAt, lastReportAt, lastAttemptAt, lastStatus)
         VALUES ($1, $2::timestamptz, $3::timestamptz, $4::timestamptz, $5::timestamptz, $6)
         ON CONFLICT (userId)
         DO UPDATE SET onboardingCompletedAt = EXCLUDED.onboardingCompletedAt,
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
    }
    return merged
  } catch (error) {
    console.warn('[weekly-report] Failed to upsert state', error)
    return existing ?? null
  }
}

export async function markWeeklyReportOnboardingComplete(
  userId: string,
  completedAt = new Date(),
  options?: { schedule?: boolean }
) {
  await ensureWeeklyReportTables()
  const existing = await getWeeklyReportState(userId)
  if (existing?.onboardingCompletedAt && !options?.schedule) return existing
  const shouldSchedule = Boolean(options?.schedule)
  const nextDueAtRaw = shouldSchedule ? getNextDueAt(completedAt) : existing?.nextReportDueAt ?? null
  const nextDueAt =
    nextDueAtRaw && typeof nextDueAtRaw === 'string'
      ? new Date(nextDueAtRaw)
      : nextDueAtRaw instanceof Date
        ? nextDueAtRaw
        : null
  const nextDueIso = nextDueAt && !Number.isNaN(nextDueAt.getTime()) ? nextDueAt.toISOString() : null
  return upsertWeeklyReportState(userId, {
    onboardingCompletedAt: completedAt.toISOString(),
    nextReportDueAt: nextDueIso,
    lastStatus: shouldSchedule ? 'scheduled' : existing?.lastStatus ?? null,
  })
}

export async function setWeeklyReportsEnabled(
  userId: string,
  enabled: boolean,
  options?: { scheduleFrom?: Date }
): Promise<WeeklyReportState | null> {
  await ensureWeeklyReportTables()
  const now = new Date()
  const scheduleFrom = options?.scheduleFrom ?? now
  const existing = await getWeeklyReportState(userId)
  const nextDueAt = enabled ? getNextDueAt(scheduleFrom) : null
  const nextDueIso = nextDueAt ? nextDueAt.toISOString() : null
  const updated = await upsertWeeklyReportState(userId, {
    onboardingCompletedAt: existing?.onboardingCompletedAt ?? now.toISOString(),
    reportsEnabled: enabled,
    reportsEnabledAt: enabled ? now.toISOString() : existing?.reportsEnabledAt ?? null,
    nextReportDueAt: nextDueIso,
    lastStatus: enabled ? 'scheduled' : 'disabled',
  })
  if (!enabled) {
    return updated
  }
  if (updated?.nextReportDueAt) {
    return updated
  }
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO WeeklyHealthReportState (userId, nextReportDueAt, lastStatus)
       VALUES ($1, $2::timestamptz, 'scheduled')
       ON CONFLICT (userId)
       DO UPDATE SET nextReportDueAt = EXCLUDED.nextReportDueAt,
                    lastStatus = 'scheduled'`,
      userId,
      nextDueIso
    )
  } catch (error) {
    console.warn('[weekly-report] Failed to force schedule', error)
  }
  const refreshed = await getWeeklyReportState(userId)
  if (refreshed?.nextReportDueAt) {
    return refreshed
  }
  return {
    userId,
    onboardingCompletedAt: existing?.onboardingCompletedAt ?? now.toISOString(),
    nextReportDueAt: nextDueIso,
    lastReportAt: existing?.lastReportAt ?? null,
    lastAttemptAt: existing?.lastAttemptAt ?? null,
    lastStatus: 'scheduled',
    reportsEnabled: true,
    reportsEnabledAt: now.toISOString(),
  }
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
       VALUES ($1,$2,$3::date,$4::date,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12::timestamptz)`,
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
           readyAt = $10::timestamptz,
           notifyAt = $11::timestamptz,
           emailSentAt = $12::timestamptz,
           pushSentAt = $13::timestamptz,
           updatedAt = NOW(),
           lastShownAt = $14::timestamptz,
           dismissedAt = $15::timestamptz,
           dontShowAt = $16::timestamptz,
           viewedAt = $17::timestamptz
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
      merged.notifyAt ?? null,
      merged.emailSentAt ?? null,
      merged.pushSentAt ?? null,
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

export async function getWeeklyReportByPeriod(
  userId: string,
  periodStart: string,
  periodEnd: string
): Promise<WeeklyReportRecord | null> {
  await ensureWeeklyReportTables()
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT * FROM WeeklyHealthReports WHERE userId = $1 AND periodStart = $2 AND periodEnd = $3 ORDER BY createdAt DESC LIMIT 1',
      userId,
      periodStart,
      periodEnd
    )
    return normalizeReportRow(rows?.[0])
  } catch (error) {
    console.warn('[weekly-report] Failed to read report by period', error)
    return null
  }
}

export async function listWeeklyReports(userId: string, limit = 8): Promise<WeeklyReportRecord[]> {
  await ensureWeeklyReportTables()
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT * FROM WeeklyHealthReports WHERE userId = $1 ORDER BY createdAt DESC LIMIT $2',
      userId,
      Math.max(limit * 3, limit)
    )
    const unique = new Map<string, WeeklyReportRecord>()
    for (const row of rows) {
      const report = normalizeReportRow(row)
      if (!report) continue
      const key = `${report.periodStart}|${report.periodEnd}`
      if (!unique.has(key)) {
        unique.set(key, report)
      }
    }
    return Array.from(unique.values()).slice(0, limit)
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

export async function backfillWeeklyReportState(limit = 50) {
  await ensureWeeklyReportTables()
  const now = new Date()
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT u.id AS userId
       FROM "User" u
       WHERE u.gender IS NOT NULL
         AND u.weight IS NOT NULL
         AND u.height IS NOT NULL
         AND (
           EXISTS (
             SELECT 1 FROM "HealthGoal" g
             WHERE g."userId" = u.id AND g.name NOT LIKE '\\_\\_%' ESCAPE '\\'
           )
           OR EXISTS (
             SELECT 1 FROM "HealthGoal" g
             WHERE g."userId" = u.id
               AND g.name = '__SELECTED_ISSUES__'
               AND g.category IS NOT NULL
               AND btrim(g.category) NOT IN ('', '[]', 'null')
           )
           OR EXISTS (
             SELECT 1 FROM CheckinIssues ci
             WHERE ci.userid = u.id
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM WeeklyHealthReportState s WHERE s.userId = u.id
         )
       LIMIT $1`,
      limit
    )
    for (const row of rows) {
      await upsertWeeklyReportState(row.userId, {
        onboardingCompletedAt: now.toISOString(),
        nextReportDueAt: null,
        reportsEnabled: false,
        lastStatus: 'disabled',
      })
    }
  } catch (error) {
    console.warn('[weekly-report] Failed to backfill state', error)
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

function safeTimezone(input?: string | null) {
  const tz = (input || '').trim()
  if (!tz) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

async function readTimezoneFromTable(userId: string, table: string): Promise<string | null> {
  try {
    const rows: Array<{ timezone: string | null }> = await prisma.$queryRawUnsafe(
      `SELECT timezone FROM ${table} WHERE userId = $1`,
      userId
    )
    return rows?.[0]?.timezone ?? null
  } catch {
    return null
  }
}

export async function resolveWeeklyReportTimezone(userId: string): Promise<string> {
  const sources = ['CheckinSettings', 'MoodReminderSettings', 'HealthTipSettings']
  for (const table of sources) {
    const tz = await readTimezoneFromTable(userId, table)
    if (tz) return safeTimezone(tz)
  }
  return 'UTC'
}

function getBaseUrl() {
  let base = process.env.PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  if (!base) return ''
  base = base.trim()
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`
  return base.replace(/\/+$/, '')
}

export async function queueWeeklyReportNotification(
  report: WeeklyReportRecord | null
): Promise<{ scheduled: boolean; timezone: string; notifyAt?: string; reason?: string }> {
  if (!report) {
    return { scheduled: false, timezone: 'UTC', reason: 'missing_report' }
  }

  if (report.notifyAt || report.pushSentAt || report.emailSentAt) {
    return { scheduled: false, timezone: 'UTC', reason: 'already_scheduled' }
  }

  const timezone = await resolveWeeklyReportTimezone(report.userId)
  const notifyAt = new Date().toISOString()

  const immediate = await publishWithQStash('/api/reports/weekly/dispatch', {
    userId: report.userId,
    reportId: report.id,
    timezone,
  }).catch((error) => {
    console.warn('[weekly-report] Failed to dispatch notification', error)
    return { ok: false, reason: 'dispatch_error' }
  })

  if (immediate?.ok) {
    await updateWeeklyReportRecord(report.userId, report.id, { notifyAt })
    return { scheduled: true, timezone, notifyAt }
  }

  const base = getBaseUrl()
  const schedulerSecret = process.env.SCHEDULER_SECRET || ''
  if (base && schedulerSecret) {
    try {
      const res = await fetch(`${base}/api/reports/weekly/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${schedulerSecret}`,
        },
        body: JSON.stringify({ userId: report.userId, reportId: report.id, timezone }),
      })
      if (res.ok) {
        await updateWeeklyReportRecord(report.userId, report.id, { notifyAt })
        return { scheduled: true, timezone, notifyAt }
      }
    } catch (error) {
      console.warn('[weekly-report] Direct dispatch failed', error)
    }
  }

  const fallback = await scheduleWeeklyReportNotificationWithQStash(report.userId, timezone, report.id, '12:00')
    .catch((error) => {
      console.warn('[weekly-report] Failed to schedule notification', error)
      return { scheduled: false, reason: 'schedule_error' }
    })

  if (fallback?.scheduled) {
    await updateWeeklyReportRecord(report.userId, report.id, { notifyAt })
  }

  const immediateReason =
    immediate && 'responseBody' in immediate && typeof immediate.responseBody === 'string'
      ? immediate.responseBody
      : immediate?.reason

  return {
    scheduled: !!fallback?.scheduled,
    timezone,
    notifyAt: fallback?.scheduled ? notifyAt : undefined,
    reason: immediateReason || fallback?.reason || 'dispatch_failed',
  }
}

export function summarizeCoverage(stats: {
  daysActive: number
  totalEvents: number
  foodCount: number
  waterCount?: number
  moodCount: number
  checkinCount: number
  symptomCount: number
}): string | null {
  if (stats.daysActive >= 3 && stats.totalEvents >= 5) return null
  return 'We only captured a small amount of data this week, so this report may look lighter than usual. Keep logging each day for clearer trends.'
}
