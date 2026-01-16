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

function readRowValue(row: any, key: string) {
  if (!row) return undefined
  if (row[key] !== undefined) return row[key]
  const lower = key.toLowerCase()
  return row[lower]
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
  return {
    userId: readRowValue(row, 'userId'),
    onboardingCompletedAt: onboardingCompletedAt ? new Date(onboardingCompletedAt).toISOString() : null,
    nextReportDueAt: nextReportDueAt ? new Date(nextReportDueAt).toISOString() : null,
    lastReportAt: lastReportAt ? new Date(lastReportAt).toISOString() : null,
    lastAttemptAt: lastAttemptAt ? new Date(lastAttemptAt).toISOString() : null,
    lastStatus: readRowValue(row, 'lastStatus') ?? null,
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
           notifyAt = $11,
           emailSentAt = $12,
           pushSentAt = $13,
           updatedAt = NOW(),
           lastShownAt = $14,
           dismissedAt = $15,
           dontShowAt = $16,
           viewedAt = $17
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

export async function backfillWeeklyReportState(limit = 50) {
  await ensureWeeklyReportTables()
  const now = new Date()
  const nextDueAt = getNextDueAt(now).toISOString()
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
        nextReportDueAt: nextDueAt,
        lastStatus: 'scheduled',
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
