import { NextRequest } from 'next/server'
import { getWeeklyReportRequestUser } from '@/lib/weekly-report-request-auth'
import * as weeklyStatus from '@/app/api/reports/weekly/status/route'
import * as weeklyList from '@/app/api/reports/weekly/list/route'
import * as uploadedList from '@/app/api/reports/list/route'
import * as creditStatus from '@/app/api/credit/status/route'
import * as hydrationGoal from '@/app/api/hydration-goal/route'
import * as waterLog from '@/app/api/water-log/route'
import * as fitbitStatus from '@/app/api/fitbit/status/route'
import * as garminStatus from '@/app/api/garmin/status/route'

// Fixed normal authenticated GET handlers only. No model-supplied URL, method,
// account, preview mode, report generation, unlock, provider call or mutation.
export const VOICE_APP_READ_SCHEMAS = {
  'reports.status': {},
  'reports.list': { kind: 'optional weekly|uploaded (default weekly)', limit: 'optional integer 1..10' },
  'reports.weekly.read': { reportId: 'exact owned ID OR both periodStart and periodEnd', periodStart: 'YYYY-MM-DD', periodEnd: 'YYYY-MM-DD', section: 'optional summary|overview|supplements|medications|nutrition|hydration|exercise|lifestyle|labs|mood|symptoms (default summary)' },
  'credit.balance': {},
  'hydration.status': { localDate: 'optional YYYY-MM-DD (default current requested local date)' },
  'devices.status': { provider: 'optional fitbit|garmin|all (default all)' },
} as const
export type VoiceAppReadName = keyof typeof VOICE_APP_READ_SCHEMAS
export type VoiceAppReadInput = { action: VoiceAppReadName; values: { kind?: 'weekly' | 'uploaded'; limit?: number; localDate?: string; provider?: 'fitbit' | 'garmin' | 'all'; reportId?: string; periodStart?: string; periodEnd?: string; section?: string } }
export type VoiceAppReadResult = { action: VoiceAppReadName; verified: true; message: string; data: Record<string, unknown>; safeToClaimSaved: false }
export class VoiceAppReadError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = 'VoiceAppReadError' }
}
const fail = (message = 'The app could not verify that information. Please open its normal screen and try again.'): never => { throw new VoiceAppReadError('app_read_unverified', message, 409) }
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : fail()
const exactKeys = (value: Record<string, any>, allowed: string[]) => { if (Object.keys(value).some(key => !allowed.includes(key))) fail('That information request contains an unsupported field.') }
const date = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) fail('Please choose a valid calendar date.')
  return value as string
}
const finite = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fail()
const identifier = (value: unknown): string => typeof value === 'string' && value.trim() && value.length <= 500 ? value : fail()
const optionalTimestamp = (value: unknown): string | null => value == null ? null : typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : fail()
const reportStatus = (value: unknown): string => typeof value === 'string' && ['RUNNING', 'READY', 'FAILED', 'LOCKED'].includes(value) ? value : fail()
function active(request: NextRequest) { if (request.signal?.aborted) throw new VoiceAppReadError('cancelled', 'This information request stopped.', 499) }
function validate(input: unknown): VoiceAppReadInput {
  const candidate = object(input); exactKeys(candidate, ['action', 'values'])
  if (typeof candidate.action !== 'string' || !Object.prototype.hasOwnProperty.call(VOICE_APP_READ_SCHEMAS, candidate.action)) fail('That information request is not supported.')
  const values = object(candidate.values)
  const allowed = candidate.action === 'reports.weekly.read' ? ['reportId', 'periodStart', 'periodEnd', 'section'] : candidate.action === 'reports.list' ? ['kind', 'limit'] : candidate.action === 'hydration.status' ? ['localDate'] : candidate.action === 'devices.status' ? ['provider'] : []
  exactKeys(values, allowed)
  if ('kind' in values && !['weekly', 'uploaded'].includes(values.kind)) fail()
  if ('limit' in values && (!Number.isInteger(values.limit) || values.limit < 1 || values.limit > 10)) fail()
  if ('provider' in values && !['fitbit', 'garmin', 'all'].includes(values.provider)) fail()
  if ('localDate' in values) date(values.localDate)
  if (candidate.action === 'reports.weekly.read') {
    const byId = values.reportId !== undefined, byPeriod = values.periodStart !== undefined || values.periodEnd !== undefined
    if (byId === byPeriod) fail('Please choose an exact report ID or its complete start and end dates.')
    if (byId) identifier(values.reportId)
    if (byPeriod && (date(values.periodStart) > date(values.periodEnd))) fail('Please choose a valid report period.')
    if (values.section !== undefined && !['summary', 'overview', 'supplements', 'medications', 'nutrition', 'hydration', 'exercise', 'lifestyle', 'labs', 'mood', 'symptoms'].includes(values.section)) fail('Please choose an existing report section.')
  }
  return candidate as VoiceAppReadInput
}
async function get(request: NextRequest, path: string, handler: (request: NextRequest) => Promise<Response>) {
  active(request)
  const headers = new Headers(request.headers)
  headers.delete('host'); headers.delete('content-length'); headers.set('cache-control', 'no-store')
  const response = await handler(new NextRequest(new URL(path, request.url), { method: 'GET', headers, signal: request.signal }))
  active(request)
  const data = await response.json().catch(() => null)
  active(request)
  if (!response.ok || !data || typeof data !== 'object' || Array.isArray(data) || data.error) throw new VoiceAppReadError('normal_handler_failed', response.status === 401 ? 'Please sign in again to check that information.' : response.status === 403 ? 'The app has not granted access to that information. Please check its normal screen.' : 'The app could not verify that information. Please try its normal screen.', response.ok ? 409 : response.status)
  return data
}
export async function readVoiceAppData(request: NextRequest, userId: string, input: VoiceAppReadInput, localDate: string): Promise<VoiceAppReadResult> {
  active(request)
  const { action, values } = validate(input)
  // The same normal account resolver is used before any delegated read. It
  // catches a mismatching cookie/native account instead of exposing its data.
  const authenticated = await getWeeklyReportRequestUser(request)
  active(request)
  if (!userId || authenticated?.id !== userId) throw new VoiceAppReadError('unauthorized', 'Please sign in again before checking your information.', 401)
  const result = (message: string, data: Record<string, unknown>): VoiceAppReadResult => ({ action, verified: true, message, data, safeToClaimSaved: false })

  if (action === 'reports.status') {
    const data = await get(request, '/api/reports/weekly/status?voiceReadOnly=1', weeklyStatus.GET)
    if (data.healthSetupComplete === false) return result('Complete Health Setup to access your weekly reports.', { healthSetupComplete: false })
    if (data.healthSetupComplete !== true || data.voiceReadOnly !== true || typeof data.reportsEnabled !== 'boolean') fail()
    const status = data.status == null ? null : reportStatus(data.status)
    const id = data.reportId == null ? null : identifier(data.reportId)
    if ((status == null) !== (id == null)) fail()
    const summary = status === 'LOCKED' ? 'Your latest weekly report is locked. Open Reports to check access.' : status === 'READY' ? 'Your latest weekly report is ready.' : status === 'RUNNING' ? 'Your latest weekly report is still being prepared.' : status === 'FAILED' ? 'Your latest weekly report did not complete. Open Reports for details.' : 'The app currently lists no weekly report.'
    return result(`${summary} Report scheduling is ${data.reportsEnabled ? 'enabled' : 'disabled'}.`, { healthSetupComplete: true, reportId: id, status, reportsEnabled: data.reportsEnabled, nextReportDueAt: optionalTimestamp(data.nextReportDueAt), periodStart: data.periodStart == null ? null : date(data.periodStart), periodEnd: data.periodEnd == null ? null : date(data.periodEnd) })
  }
  if (action === 'reports.list') {
    const kind = values.kind ?? 'weekly', limit = values.limit ?? 5
    const data = await get(request, kind === 'weekly' ? '/api/reports/weekly/list' : '/api/reports/list', kind === 'weekly' ? weeklyList.GET : uploadedList.GET)
    if (!Array.isArray(data.reports)) fail()
    if (kind === 'weekly' && data.enabled === false) return result('Weekly reports are not currently enabled in the app.', { kind, enabled: false, reports: [] })
    if (kind === 'weekly' && (data.enabled !== true || data.healthSetupComplete !== true)) fail()
    const ids = new Set<string>()
    const reports = data.reports.map((raw: unknown) => {
      const row = object(raw), id = identifier(row.id)
      if (ids.has(id) || (row.userId != null && row.userId !== userId)) fail()
      ids.add(id)
      if (kind === 'weekly') return { id, status: reportStatus(row.status), periodStart: date(row.periodStart), periodEnd: date(row.periodEnd) }
      if (typeof row.status !== 'string' || !['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DECRYPTION_FAILED'].includes(row.status)) fail()
      return { id, status: row.status.toUpperCase(), createdAt: optionalTimestamp(row.createdAt) ?? fail() }
    }).slice(0, limit)
    const labels = reports.map((row: any) => kind === 'weekly' ? `${row.periodStart} to ${row.periodEnd}: ${row.status.toLowerCase()}` : `${row.createdAt}: ${row.status.toLowerCase()}`)
    return result(reports.length ? `The app lists these ${kind === 'weekly' ? 'weekly' : 'uploaded'} reports: ${labels.join('; ')}.` : `The app currently lists no ${kind === 'weekly' ? 'weekly' : 'uploaded'} reports.`, { kind, reports })
  }
  if (action === 'reports.weekly.read') {
    const data = await get(request, '/api/reports/weekly/list', weeklyList.GET)
    if (data.enabled === false) return result('Weekly reports are not currently enabled in the app.', { enabled: false })
    if (data.enabled !== true || data.healthSetupComplete !== true || !Array.isArray(data.reports)) fail()
    const ids = new Set<string>()
    const rows = data.reports.map((raw: unknown) => {
      const row = object(raw), id = identifier(row.id)
      if (ids.has(id) || row.userId != null && row.userId !== userId) fail()
      ids.add(id); reportStatus(row.status); date(row.periodStart); date(row.periodEnd)
      return row
    })
    const matches = rows.filter((row: any) => values.reportId ? row.id === values.reportId : row.periodStart === values.periodStart && row.periodEnd === values.periodEnd)
    const navigation = { title: 'Insights', path: '/insights', nativeTarget: { type: 'tab', tab: 'Insights' } }
    if (matches.length !== 1) return result(matches.length ? 'More than one report matches that period. Please choose its exact report ID.' : 'I could not find that report in your accessible reports. Please choose an exact report and period from Insights.', { selectionRequired: true, choices: matches.map((row: any) => ({ reportId: row.id, status: row.status, periodStart: row.periodStart, periodEnd: row.periodEnd })), navigation })
    const row = matches[0], status = reportStatus(row.status)
    const identity = { reportId: row.id, status, periodStart: row.periodStart, periodEnd: row.periodEnd, navigation }
    if (status !== 'READY') return result(status === 'LOCKED' ? 'That report is locked. Open Insights to check access.' : status === 'RUNNING' ? 'That report is still being prepared. Its contents are not ready to read.' : 'That report did not complete. There is no ready report content to read.', identity)
    const section = values.section ?? 'summary'
    const payload = typeof row.report === 'string' ? (() => { try { return object(JSON.parse(row.report)) } catch { return {} } })() : row.report && typeof row.report === 'object' && !Array.isArray(row.report) ? row.report : {}
    const stored = (value: unknown) => typeof value === 'string' && value.trim() && value.length <= 20000 ? value : fail('That stored report text is unavailable or too long to read here. Please open Insights.')
    if (section === 'summary') {
      const summary = stored(typeof row.summary === 'string' && row.summary.trim() ? row.summary : payload.summary)
      return result(`Stored report summary:\n${summary}`, { ...identity, section, storedText: summary })
    }
    const rawBucket = payload.sections?.[section]
    if (!rawBucket || typeof rawBucket !== 'object' || Array.isArray(rawBucket)) return result('That report has no stored text for the selected section. Please choose another section or open Insights.', { ...identity, section })
    const content: Record<string, Array<string | Record<string, string>>> = {}, spoken: string[] = []
    for (const [key, label] of [['working', "What's working"], ['suggested', 'Suggested'], ['avoid', 'Avoid']]) {
      const entries = rawBucket[key]
      if (entries === undefined) continue
      if (!Array.isArray(entries) || entries.length > 100) fail()
      content[key] = entries.map((entry: any) => {
        if (typeof entry === 'string') return stored(entry)
        const item = object(entry), selected: Record<string, string> = {}
        if (item.name != null && item.name !== '') selected.name = stored(item.name)
        if (item.reason != null && item.reason !== '') selected.reason = stored(item.reason)
        if (!Object.keys(selected).length) fail()
        return selected
      })
      if (content[key].length) spoken.push(`${label}:`, ...content[key].flatMap(entry => typeof entry === 'string' ? [entry] : Object.values(entry)))
    }
    if (!spoken.length) return result('That report section has no stored entries.', { ...identity, section })
    if (spoken.join('\n').length > 20000) fail('That section is too long to read here. Please open Insights.')
    return result(`Stored ${section} section:\n${spoken.join('\n')}`, { ...identity, section, storedContent: content })
  }
  if (action === 'credit.balance') {
    const data = await get(request, '/api/credit/status', creditStatus.GET)
    if (data.hasAccess !== true || data.debugStage !== 'success' || data.schemaVersion !== 2) fail('Your Helfi credit balance could not be verified. Please check Billing & Credits.')
    const availableCredits = finite(data.totalAvailableCents)
    return result(`Before any charge for this voice request, your Helfi app wallet showed ${availableCredits} credits available.`, { availableCredits, balanceTiming: 'before_current_voice_request_charge' })
  }
  if (action === 'hydration.status') {
    const selectedDate = date(values.localDate ?? localDate)
    const goal = await get(request, `/api/hydration-goal?date=${selectedDate}`, hydrationGoal.GET)
    const water = await get(request, `/api/water-log?localDate=${selectedDate}`, waterLog.GET)
    const targetMl = finite(goal.targetMl)
    if (targetMl === 0 || !['custom', 'auto'].includes(goal.source) || !Array.isArray(water.entries)) fail()
    const ids = new Set<string>()
    let loggedMl = 0
    for (const raw of water.entries) {
      const row = object(raw), id = identifier(row.id)
      if (row.localDate !== selectedDate || (row.userId != null && row.userId !== userId) || ids.has(id)) fail()
      ids.add(id); loggedMl += finite(row.amountMl)
      if (!Number.isFinite(loggedMl)) fail()
    }
    loggedMl = Math.round(loggedMl * 1000) / 1000
    return result(`For ${selectedDate}, your water log totals ${loggedMl} mL against a ${targetMl} mL goal.`, { localDate: selectedDate, loggedMl, targetMl, goalSource: goal.source, entryCount: ids.size })
  }
  const providers = values.provider && values.provider !== 'all' ? [values.provider] : ['fitbit', 'garmin']
  const devices: Record<string, unknown>[] = []
  for (const provider of providers) {
    const data = await get(request, `/api/${provider}/status?voiceReadOnly=1`, provider === 'fitbit' ? fitbitStatus.GET : garminStatus.GET)
    if (typeof data.storedConnection !== 'boolean' || data.liveVerified !== false || (provider === 'garmin' && typeof data.credentialsPresent !== 'boolean')) fail()
    devices.push({ provider, storedConnection: data.storedConnection, ...(provider === 'garmin' ? { credentialsPresent: data.credentialsPresent } : {}), liveVerified: false })
  }
  return result(`${devices.map(row => `${row.provider === 'fitbit' ? 'Fitbit' : 'Garmin'}: ${row.storedConnection ? 'a saved connection is present' : 'no saved connection is present'}${row.provider === 'garmin' && row.storedConnection && row.credentialsPresent === false ? ', and its saved credentials are missing' : ''}`).join('; ')}. This checks saved app status only; live device access and syncing were not tested.`, { devices })
}
