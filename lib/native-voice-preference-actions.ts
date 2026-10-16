import { NextRequest } from 'next/server'
import crypto from 'crypto'
import * as userData from '@/app/api/user-data/route'
import * as hydration from '@/app/api/hydration-goal/route'
import * as checkinSettings from '@/app/api/checkins/settings/route'
import * as moodReminders from '@/app/api/mood/reminders/route'
import * as quietHours from '@/app/api/notifications/quiet-hours/route'
import * as weeklyReports from '@/app/api/reports/weekly/preferences/route'
import * as coachSettings from '@/app/api/health-tips/settings/route'
import * as checkinHistory from '@/app/api/checkins/history/route'
import * as checkinRatings from '@/app/api/checkins/ratings/route'
import * as checkinToday from '@/app/api/checkins/today/route'

// Fixed semantic actions only. Never accept endpoint, method, owner IDs,
// authentication, syncOverride, consent, or arbitrary storage keys from a model.
export const VOICE_PREFERENCE_ACTION_SCHEMAS = {
  'profile.update': { firstName: 'text', lastName: 'text', bio: 'text', dateOfBirth: 'YYYY-MM-DD', gender: ['male', 'female'] },
  'health_setup.update': { gender: ['male', 'female'], weight: 'kg number', height: 'cm number', birthdate: 'YYYY-MM-DD', bodyType: ['ectomorph', 'mesomorph', 'endomorph'], exerciseFrequency: 'text', exerciseTypes: 'explicit replacement text list', exerciseTypesAdd: 'add exact exercise type names', exerciseTypesRemove: 'remove exact existing exercise type names', goals: 'explicit replacement selected health issue text list', goalsAdd: 'add selected health issue names', goalsRemove: 'remove exact selected health issue names', dietTypes: 'explicit replacement diet list', dietTypesAdd: 'add diet preferences', dietTypesRemove: 'remove exact existing diet preferences', allergies: 'explicit replacement allergy list', allergiesAdd: 'add allergy names', allergiesRemove: 'remove exact existing allergy names', diabetesType: ['', 'type1', 'type2', 'prediabetes'], healthSituations: { healthIssues: 'text', healthProblems: 'text', additionalInfo: 'text', skipped: 'boolean' }, healthCheckSettings: { enabled: 'boolean', frequency: ['always', 'high', 'never'], dailyCap: 'positive integer or null', thresholds: { sugar: 'positive number or null', carbs: 'positive number or null', fat: 'positive number or null' } } },
  'goals.update': { goalChoice: ['lose weight', 'gain weight', 'maintain weight', 'tone up', 'get shredded'], goalIntensity: ['mild', 'standard', 'aggressive'], goalTargetWeightKg: 'positive number', goalTargetWeightUnit: ['kg', 'lb'], goalPaceKgPerWeek: 'positive number', goalCalorieTarget: 'positive number', goalMacroMode: ['auto', 'manual'], goalMacroSplit: { proteinPct: 'fraction 0..1', carbPct: 'fraction 0..1', fatPct: 'fraction 0..1' }, goalFiberTarget: 'positive number', goalSugarMax: 'positive number' },
  'hydration_goal.set': { targetMl: 'positive integer millilitres' },
  'hydration_goal.reset': {},
  'checkin_reminders.update': { enabled: 'boolean', time1: 'HH:MM', time2: 'HH:MM', time3: 'HH:MM', time4: 'HH:MM', frequency: 'integer 1..4 subject to account cap', timezone: 'IANA time zone' },
  'mood_reminders.update': { enabled: 'boolean', time1: 'HH:MM', time2: 'HH:MM', time3: 'HH:MM', time4: 'HH:MM', frequency: 'integer 1..4 subject to account cap', timezone: 'IANA time zone' },
  'quiet_hours.update': { enabled: 'boolean', startTime: 'HH:MM', endTime: 'HH:MM', timezone: 'IANA time zone' },
  'weekly_reports.update': { enabled: 'boolean; normal AI consent, paid access and health setup checks remain' },
  'coach_preferences.update': { enabled: 'boolean; new paid activation requires its actual pricing confirmation screen', timezone: 'IANA time zone', timezoneManual: 'boolean' },
  'checkin.rating.update': { date: 'YYYY-MM-DD', issueId: 'existing own issue ID OR exact issueName', issueName: 'exact existing own issue name', value: 'integer 0..6', note: 'optional text; omitted preserves current note' },
  'checkin.rating.set': { date: 'YYYY-MM-DD local calendar date', issueId: 'existing own issue ID OR exact issueName', issueName: 'exact existing own issue name', value: 'integer 0..6, or null when not applicable', note: 'optional text; omitted preserves current note', isNa: 'optional boolean; true means not applicable' },
  'checkin.rating.delete': { date: 'YYYY-MM-DD local calendar date', issueId: 'existing own issue ID OR exact issueName', issueName: 'exact existing own issue name' },
} as const

export type VoicePreferenceActionName = keyof typeof VOICE_PREFERENCE_ACTION_SCHEMAS
export type VoicePreferenceInput = { action: VoicePreferenceActionName; values: Record<string, unknown> }
export type PreparedVoicePreferenceAction = VoicePreferenceInput & { userId: string; beforeHash: string; summary: string; preparedAt: number }
export type VoicePreferenceExecutionResult = { saved: boolean; status: 'saved' | 'already_set' | 'review_again' | 'not_saved' | 'needs_screen'; message: string; schedulingVerified?: boolean }

export class VoicePreferenceActionError extends Error {
  constructor(public code: string, message: string, public status = 400, public path?: string) { super(message); this.name = 'VoicePreferenceActionError' }
}
const fail = (message: string): never => { throw new VoicePreferenceActionError('invalid_preference', message) }
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : fail('Please specify the setting and its value.')
const keys = (value: Record<string, any>, allowed: readonly string[]) => { if (Object.keys(value).some(key => !allowed.includes(key))) fail('That field cannot be changed through this voice action.') }
const text = (value: unknown, max = 200) => typeof value === 'string' && value.length <= max && !value.includes('\u0000') ? value.trim() : fail('Please give a valid text value.')
const bool = (value: unknown) => typeof value === 'boolean' ? value : fail('Please say whether to turn this setting on or off.')
const positive = (value: unknown, max = 100000) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : fail('Please give a valid positive amount.')
const list = (value: unknown) => Array.isArray(value) && value.length <= 50 ? [...new Set(value.map(item => { const result = text(item, 160); if (!result || result.startsWith('__')) fail('Please use a normal health issue or preference name.'); return result }))] : fail('Please give a list of names.')
const choice = (value: unknown, allowed: readonly string[]) => { const result = text(value, 100).toLowerCase(); return allowed.includes(result) ? result : fail('Please choose one of the available settings.') }
const date = (value: unknown) => { const result = text(value, 10); const parsed = new Date(`${result}T12:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(result) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result && result <= new Date().toISOString().slice(0, 10) ? result : fail('Please give a valid date that is not in the future.') }
const calendarDate = (value: unknown) => { const result = text(value, 10); const parsed = new Date(`${result}T12:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(result) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result ? result : fail('Please give a valid local calendar date.') }
const time = (value: unknown) => { const result = text(value, 5); return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result) ? result : fail('Please give the time in hours and minutes.') }
const zone = (value: unknown) => { const result = text(value, 64); try { new Intl.DateTimeFormat('en', {timeZone:result}); return result } catch { return fail('Please give a valid time zone.') } }
const pick = (value: Record<string, any>, fields: readonly string[]) => Object.fromEntries(fields.map(field => [field, value[field] ?? null]))
const stable = (value: any): string => JSON.stringify(value && typeof value === 'object' ? Array.isArray(value) ? value.map(v => JSON.parse(stable(v))) : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(stable(value[key] ?? null))])) : value ?? null)
const hash = (value: unknown) => crypto.createHash('sha256').update(stable(value)).digest('hex')
const USER_FIELDS = [...Object.keys(VOICE_PREFERENCE_ACTION_SCHEMAS['health_setup.update']), ...Object.keys(VOICE_PREFERENCE_ACTION_SCHEMAS['goals.update']), 'profileInfo', 'healthSetupUpdatedAt']

function requestFor(original: NextRequest, path: string, method = 'GET', body?: unknown) {
  const headers = new Headers(original.headers)
  headers.delete('content-length'); headers.delete('host')
  headers.set('cache-control', 'no-store')
  if (body !== undefined) headers.set('content-type', 'application/json')
  return new NextRequest(new URL(path, original.url), { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
}

async function json(response: Response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.error || payload?.skipped) throw new VoicePreferenceActionError('manual_action_failed', 'The app could not apply that change. Nothing is being reported as saved.', response.status === 200 ? 409 : response.status)
  return object(payload)
}

function routeFor(action: VoicePreferenceActionName) {
  switch (action) {
    case 'profile.update': case 'health_setup.update': case 'goals.update': return { path: '/api/user-data?scope=health-setup', api: userData }
    case 'hydration_goal.set': case 'hydration_goal.reset': return { path: '/api/hydration-goal', api: hydration }
    case 'checkin_reminders.update': return { path: '/api/checkins/settings', api: checkinSettings }
    case 'mood_reminders.update': return { path: '/api/mood/reminders', api: moodReminders }
    case 'quiet_hours.update': return { path: '/api/notifications/quiet-hours', api: quietHours }
    case 'weekly_reports.update': return { path: '/api/reports/weekly/preferences', api: weeklyReports }
    case 'coach_preferences.update': return { path: '/api/health-tips/settings', api: coachSettings }
    case 'checkin.rating.update': return { path: '/api/checkins/history', api: checkinHistory }
    case 'checkin.rating.set': case 'checkin.rating.delete': return { path: '/api/checkins/today', api: checkinToday }
    default: throw new VoicePreferenceActionError('unsupported_action', 'That action needs its normal app screen.')
  }
}

// Match the actual Today wording, not guessed medical synonyms. The native
// screen appends "levels" to negative issues without changing their stored name.
function selectCheckinIssue(issues: Record<string, any>[], values: Record<string, any>, transcript?: string, existingOnly = false) {
  const normalized = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : ''
  const refuse = (): never => { throw new VoicePreferenceActionError('ambiguous_checkin', existingOnly ? 'Please choose the exact existing check-in issue and date. Nothing has been changed.' : 'Please choose the exact health issue already in your account. Nothing has been changed.') }
  const named = (value: unknown) => {
    const name = normalized(value)
    if (!name) return []
    const exact = issues.filter(issue => normalized(issue.name) === name)
    return exact.length ? exact : issues.filter(issue => issue.polarity === 'negative' && normalized(`${issue.name} levels`) === name)
  }
  // Only a bounded rating clause in the original request can recover a model's
  // decorated selector. Names appearing in the note are never selection proof.
  const command = typeof transcript === 'string' ? transcript.split(/\b(?:add\s+(?:the\s+)?note|with\s+(?:the\s+)?note|note\s*:)/i)[0] : ''
  const spoken = [...command.matchAll(/\brate\s+(?:my\s+)?(.{1,160}?)\s+(?:as\s+)?(?:zero|one|two|three|four|five|six|seven|first|second|third|fourth|fifth|sixth|seventh|-?\d+(?:\.\d+)?)(?:\s*(?:out\s+of|of|\/)\s*(?:six|seven|6|7))?(?=\s*(?:$|[.,;!?]|\band\b|\bwith\b))/gi)]
  const spokenMatches = spoken.length === 1 ? named(spoken[0][1]) : []
  if (spoken.length > 1 || spoken.length === 1 && spokenMatches.length !== 1) refuse()
  const nameMatches = named(values.issueName)
  if (nameMatches.length > 1) refuse()
  let matches = nameMatches
  if (values.issueId) {
    const exactId = issues.filter(issue => issue.id === values.issueId)
    // The schema permits a literal known name in issueId. An unknown opaque ID
    // must not fall through to another issue, even with a valid spoken name.
    matches = exactId.length ? exactId : named(values.issueId)
    if (matches.length !== 1 || nameMatches.length === 1 && nameMatches[0].id !== matches[0].id) refuse()
  } else if (!matches.length) matches = spokenMatches
  if (matches.length !== 1 || spokenMatches.length === 1 && spokenMatches[0].id !== matches[0].id) refuse()
  return matches[0]
}

function spokenCheckinValues(values: Record<string, any>, transcript?: string) {
  if (typeof transcript !== 'string') return values
  const result = { ...values }
  const note = /\b(?:add\s+(?:the\s+)?note|with\s+(?:the\s+)?note)\s*(?::|saying\b|that\b)?\s+([\s\S]+)$/i.exec(transcript)
  const command = note ? transcript.slice(0, note.index) : transcript.split(/\bnote\s*:/i)[0]
  // Today has seven choices stored at indices 0..6. An explicit four out of
  // seven means its fourth choice, Average, not the internal index four.
  const ratings = [...command.matchAll(/\brate\s+(?:my\s+)?(.{1,160}?)\s+(?:as\s+)?(zero|one|two|three|four|five|six|seven|first|second|third|fourth|fifth|sixth|seventh|-?\d+(?:\.\d+)?)\s*(?:out\s+of|of|\/)\s*(?:seven|7)(?=\s*(?:$|[.,;!?]|\band\b|\bwith\b))/gi)]
  if (ratings.length > 1) fail('Please choose one check-in issue and rating at a time.')
  if (ratings.length === 1) {
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven']
    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh']
    const token = ratings[0][2].toLowerCase()
    const ordinal = words.includes(token) ? words.indexOf(token) : ordinals.includes(token) ? ordinals.indexOf(token) + 1 : Number(token)
    if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 7) fail('Please choose one of the seven check-in ratings, from one to seven.')
    result.value = ordinal - 1
  }
  // Keep the original note's punctuation. A quoted note loses only its matched
  // enclosing quotation marks; the review adds no punctuation to its content.
  if (note) {
    const content = note[1].trim()
    result.note = /^(?:"[\s\S]*"|'[\s\S]*'|“[\s\S]*”)$/.test(content) ? content.slice(1, -1) : content
  }
  return result
}

async function read(original: NextRequest, action: VoicePreferenceActionName, values: Record<string, any>, transcript?: string) {
  const route = routeFor(action)
  const path = action === 'checkin.rating.update' ? `${route.path}?start=${encodeURIComponent(values.date)}&end=${encodeURIComponent(values.date)}`
    : action === 'checkin.rating.set' || action === 'checkin.rating.delete' ? `${route.path}?localDate=${encodeURIComponent(calendarDate(values.date))}` : route.path
  const payload = await json(await route.api.GET(requestFor(original, path)))
  if (['profile.update', 'health_setup.update', 'goals.update'].includes(action)) {
    const data = object(payload.data)
    return { ...data, profileInfo: { ...(data.profileInfo || {}), gender: data.gender } }
  }
  if (action === 'checkin.rating.update') {
    const history = (Array.isArray(payload.history) ? payload.history : []).filter((entry: any) => entry.date === values.date)
    const issues = [...new Map<string, Record<string, any>>(history.map((entry: any) => [entry.issueId, { ...entry, id: entry.issueId }])).values()]
    const selected = selectCheckinIssue(issues, values, transcript, true)
    const rows = history.filter((entry: any) => entry.issueId === selected.id)
    const issueIds = new Set(rows.map((row: any) => row.issueId))
    if (issueIds.size !== 1) throw new VoicePreferenceActionError('ambiguous_checkin', 'Please choose the exact existing check-in issue and date. Nothing has been changed.')
    return pick(rows[0], ['issueId', 'name', 'date', 'value', 'note', 'isNa'])
  }
  if (action === 'checkin.rating.set' || action === 'checkin.rating.delete') {
    const issue = selectCheckinIssue(Array.isArray(payload.issues) ? payload.issues : [], values, transcript)
    const latest = (Array.isArray(payload.ratings) ? payload.ratings : []).find((entry: any) => entry.issueId === issue.id)
    return { issueId: issue.id, name: issue.name, date: values.date, present: Boolean(latest), value: latest?.value ?? null, note: latest?.note || '', isNa: latest?.isNa === true, timestamp: latest?.timestamp || null }
  }
  return payload
}

function validate(action: VoicePreferenceActionName, raw: unknown, before: Record<string, any>) {
  const values = object(raw)
  const schema = VOICE_PREFERENCE_ACTION_SCHEMAS[action]
  if (!schema) throw new VoicePreferenceActionError('unsupported_action', 'Please use the normal app screen for that action.')
  keys(values, Object.keys(schema))
  if (action !== 'hydration_goal.reset' && !Object.keys(values).length) fail('Please say which setting should change.')
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(values)) {
    if (['enabled', 'timezoneManual', 'isNa'].includes(key)) result[key] = bool(value)
    else if (['time1', 'time2', 'time3', 'time4', 'startTime', 'endTime'].includes(key)) result[key] = time(value)
    else if (key === 'timezone') result[key] = zone(value)
    else if (key === 'frequency' && (action === 'checkin_reminders.update' || action === 'mood_reminders.update')) {
      const n = positive(value, 4); if (!Number.isInteger(n) || n > Number(before.maxFrequency || 1)) fail('That reminder frequency is not available for this account.'); result[key] = n
    } else if (['firstName', 'lastName', 'bio', 'exerciseFrequency', 'issueName', 'issueId', 'note'].includes(key)) result[key] = text(value, key === 'note' || key === 'bio' ? 2000 : 160)
    else if (['dateOfBirth', 'birthdate', 'date'].includes(key)) result[key] = key === 'date' && action.startsWith('checkin.rating.') ? calendarDate(value) : date(value)
    else if (key === 'gender') result[key] = choice(value, ['male', 'female'])
    else if (key === 'bodyType') result[key] = choice(value, ['ectomorph', 'mesomorph', 'endomorph'])
    else if (key === 'diabetesType') result[key] = choice(value, ['', 'type1', 'type2', 'prediabetes'])
    else if (/^(?:exerciseTypes|goals|dietTypes|allergies)(?:Add|Remove)?$/.test(key)) {
      // A model may return the one literal requested name instead of [name].
      // Normalize only semantic additions/removals; never infer a destructive
      // whole-list replacement or split a name at commas/conjunctions.
      result[key] = list(typeof value === 'string' && /(?:Add|Remove)$/.test(key) ? [value] : value)
    }
    else if (key === 'goalChoice') result[key] = choice(value, ['lose weight', 'gain weight', 'maintain weight', 'tone up', 'get shredded'])
    else if (key === 'goalIntensity') result[key] = choice(value, ['mild', 'standard', 'aggressive'])
    else if (key === 'goalTargetWeightUnit') result[key] = choice(value, ['kg', 'lb'])
    else if (key === 'goalMacroMode') result[key] = choice(value, ['auto', 'manual'])
    else if (key === 'goalMacroSplit') {
      const split = object(value); keys(split, ['proteinPct', 'carbPct', 'fatPct'])
      const normalized = Object.fromEntries(['proteinPct', 'carbPct', 'fatPct'].map(field => [field, positive(split[field], 1)]))
      if (Math.abs(Object.values(normalized).reduce((sum, n) => sum + n, 0) - 1) > 0.00001) fail('The three macro fractions must add up to one.')
      result[key] = normalized
    } else if (key === 'healthSituations') {
      const patch = object(value); keys(patch, ['healthIssues', 'healthProblems', 'additionalInfo', 'skipped'])
      result[key] = Object.fromEntries(Object.entries(patch).map(([field, v]) => [field, field === 'skipped' ? bool(v) : text(v, 4000)]))
    } else if (key === 'healthCheckSettings') {
      const patch = object(value); keys(patch, ['enabled', 'frequency', 'dailyCap', 'thresholds'])
      const next: any = {}
      if ('enabled' in patch) next.enabled = bool(patch.enabled)
      if ('frequency' in patch) next.frequency = choice(patch.frequency, ['always', 'high', 'never'])
      if ('dailyCap' in patch) { next.dailyCap = patch.dailyCap === null ? null : positive(patch.dailyCap); if (next.dailyCap !== null && !Number.isInteger(next.dailyCap)) fail('Please use a whole number for the daily cap.') }
      if ('thresholds' in patch) { const threshold = object(patch.thresholds); keys(threshold, ['sugar', 'carbs', 'fat']); next.thresholds = Object.fromEntries(Object.entries(threshold).map(([field, v]) => { const n = v === null ? null : positive(v); if (n !== null && !Number.isInteger(n)) fail('Please use whole numbers for these thresholds.'); return [field, n] })) }
      result[key] = next
    } else if (key === 'value') { if (!(value === null && action === 'checkin.rating.set' && values.isNa === true) && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 6)) fail('A check-in rating must be between zero and six, or explicitly not applicable.'); result[key] = value }
    else result[key] = positive(value, key === 'weight' || key === 'goalTargetWeightKg' ? 1000 : key === 'height' ? 300 : 100000)
  }
  if (action === 'checkin.rating.update' && (!result.date || !('value' in result) || (!result.issueId && !result.issueName))) fail('Please give the existing check-in issue, date and rating.')
  if (action === 'checkin.rating.set' || action === 'checkin.rating.delete') {
    if (!result.date || (!result.issueId && !result.issueName)) fail('Please choose the exact health issue and local date.')
    if (action === 'checkin.rating.delete') {
      if (!before.present) fail('There is no saved check-in for that issue and date to delete.')
    } else {
      const notApplicable = result.isNa ?? (result.value === undefined && before.isNa === true)
      if (notApplicable) {
        if (typeof result.value === 'number') fail('Please choose either a rating or not applicable.')
        result.value = null
      } else {
        if (result.value === undefined && before.present && !before.isNa) result.value = before.value
        if (typeof result.value !== 'number' || !Number.isInteger(result.value) || result.value < 0 || result.value > 6) fail('Please give a rating from zero to six, or say not applicable.')
      }
      result.isNa = notApplicable
      result.note = result.note ?? before.note ?? ''
    }
  }
  if (action === 'hydration_goal.set' && (!Number.isInteger(result.targetMl) || result.targetMl > 20000)) fail('Please give the water goal in whole millilitres, up to 20000.')
  if (action === 'coach_preferences.update' && result.timezone !== undefined) {
    if (result.timezoneManual === false) fail('Please choose either an automatic time zone or a fixed time zone for Smart Health Coach.')
    // A named zone is a fixed choice. Include its manual flag in the review so
    // the normal app's automatic browser-zone policy cannot undo that choice.
    result.timezoneManual = true
  }
  if (action === 'coach_preferences.update' && result.enabled === true && before.enabled !== true) throw new VoicePreferenceActionError('pricing_confirmation_required', 'Please review and accept Smart Health Coach pricing on its settings screen before enabling it.', 409, '/health-tips')
  expandListChanges(result, before)
  return result
}

function expandListChanges(values: Record<string, any>, before: Record<string, any>) {
  const result = { ...values }
  for (const field of ['dietTypes','allergies','exerciseTypes','goals']) {
    const add = values[`${field}Add`]
    const remove = values[`${field}Remove`]
    if (!add && !remove) continue
    if (field in values) fail('Please choose either replacing a list or adding and removing named items.')
    const normalized = (name: string) => name.trim().toLowerCase()
    const additions: string[] = add || []
    const removals: string[] = remove || []
    if (additions.some(name => removals.some(other => normalized(other) === normalized(name)))) fail('The same item cannot be added and removed in one change.')
    const current: string[] = Array.isArray(before[field]) ? before[field] : []
    if (removals.some(name => !current.some(existing => normalized(existing) === normalized(name)))) fail('Please name an exact item already in that list to remove it.')
    const next = current.filter(name => !removals.some(removeName => normalized(removeName) === normalized(name)))
    for (const name of additions) if (!next.some(existing => normalized(existing) === normalized(name))) next.push(name)
    result[field] = next
    delete result[`${field}Add`]; delete result[`${field}Remove`]
  }
  return result
}

function scope(action: VoicePreferenceActionName, before: Record<string, any>) {
  if (['profile.update', 'health_setup.update', 'goals.update'].includes(action)) return pick(before, USER_FIELDS)
  if (action === 'weekly_reports.update') return pick(before, ['reportsEnabled'])
  if (action === 'hydration_goal.set' || action === 'hydration_goal.reset') return pick(before, ['targetMl', 'source', 'updatedAt'])
  if (action.startsWith('checkin.rating.')) return before
  return pick(before, [...Object.keys(VOICE_PREFERENCE_ACTION_SCHEMAS[action]), 'maxFrequency'])
}

function payloadFor(action: VoicePreferenceActionName, values: Record<string, any>, before: Record<string, any>) {
  if (action === 'profile.update') {
    const result: any = { profileInfo: { ...object(before.profileInfo || {}), ...values } }
    if ('gender' in values) result.gender = values.gender
    if ('dateOfBirth' in values) result.birthdate = values.dateOfBirth
    if ('gender' in values || 'dateOfBirth' in values) result.healthSetupUpdatedAt = Number(before.healthSetupUpdatedAt) > 0 ? Number(before.healthSetupUpdatedAt) : Date.now()
    return result
  }
  if (action === 'health_setup.update' || action === 'goals.update') {
    values = expandListChanges(values, before)
    const stamp = Number(before.healthSetupUpdatedAt)
    const result: any = { ...values, healthSetupUpdatedAt: Number.isFinite(stamp) && stamp > 0 ? stamp : Date.now() }
    if (values.healthSituations) result.healthSituations = { ...(before.healthSituations || {}), ...values.healthSituations }
    if (values.healthCheckSettings) result.healthCheckSettings = { ...(before.healthCheckSettings || {}), ...values.healthCheckSettings, thresholds: { ...(before.healthCheckSettings?.thresholds || {}), ...(values.healthCheckSettings.thresholds || {}) } }
    return result
  }
  if (action === 'weekly_reports.update' || action === 'hydration_goal.set') return values
  if (action === 'hydration_goal.reset') return undefined
  if (action === 'checkin.rating.update') return {date:values.date,issueId:before.issueId,value:values.value,note:values.note ?? before.note ?? ''}
  if (action === 'checkin.rating.set') return { localDate: values.date, ratings: [{ issueId: before.issueId, value: values.value, note: values.note, isNa: values.isNa }] }
  const fields = Object.keys(VOICE_PREFERENCE_ACTION_SCHEMAS[action])
  return { ...pick(before, fields), ...values }
}

function matches(action: VoicePreferenceActionName, values: Record<string, any>, after: Record<string, any>): boolean {
  if (action === 'hydration_goal.reset') return after.source === 'auto'
  if (action === 'weekly_reports.update') return after.reportsEnabled === values.enabled
  if (action === 'checkin.rating.delete') return after.present === false
  if (action === 'checkin.rating.set' && after.present !== true) return false
  const state = action === 'profile.update' ? after.profileInfo : after
  const contains = (actual: any, expected: any): boolean => expected && typeof expected === 'object' && !Array.isArray(expected) ? Object.keys(expected).every(key => contains(actual?.[key], expected[key])) : typeof expected === 'number' ? (typeof actual === 'number' || typeof actual === 'string' && actual.trim() !== '') && Number.isFinite(Number(actual)) && Math.abs(Number(actual) - expected) < 1e-7 : stable(actual) === stable(expected)
  return Object.entries(values).filter(([key]) => !['issueName', 'issueId', 'date'].includes(key)).every(([key, value]) => contains(state?.[key], value))
}

export async function prepareVoicePreferenceAction(request: NextRequest, userId: string, input: VoicePreferenceInput, context?: { transcript?: string }): Promise<PreparedVoicePreferenceAction> {
  if (!userId) throw new VoicePreferenceActionError('unauthorized', 'Please sign in first.', 401)
  const envelope = object(input); keys(envelope, ['action', 'values'])
  const action = envelope.action as VoicePreferenceActionName
  if (!Object.prototype.hasOwnProperty.call(VOICE_PREFERENCE_ACTION_SCHEMAS, action)) throw new VoicePreferenceActionError('unsupported_action', 'That action needs its normal app screen.')
  // Reject unexpected fields before even reading the user's data.
  keys(object(envelope.values), Object.keys(VOICE_PREFERENCE_ACTION_SCHEMAS[action]))
  const before = await read(request, action, envelope.values, context?.transcript)
  const checkedValues = action === 'checkin.rating.set' || action === 'checkin.rating.update' ? spokenCheckinValues(envelope.values, context?.transcript) : envelope.values
  const rawValues = action.startsWith('checkin.rating.') ? { ...checkedValues, issueId: before.issueId } : checkedValues
  if (action.startsWith('checkin.rating.')) delete rawValues.issueName
  const values = validate(action, rawValues, before)
  if (action.startsWith('checkin.rating.')) { values.issueId = before.issueId; delete values.issueName }
  const summary = preferenceSummary(action, values, before)
  return { action, userId, values, beforeHash: hash({ userId, action, state: scope(action, before) }), summary, preparedAt: Date.now() }
}

function preferenceSummary(action: VoicePreferenceActionName, values: Record<string, any>, before: Record<string, any>) {
  if (action === 'coach_preferences.update' && values.timezoneManual === false) return `Use the app's automatic time zone for Smart Health Coach${values.enabled === undefined ? '.' : `; coach alerts: ${values.enabled ? 'on' : 'off'}.`}`
  if (action === 'hydration_goal.reset') return 'Use your automatic daily water goal.'
  if (action === 'hydration_goal.set') return `Set your daily water goal to ${values.targetMl} millilitres.`
  const checkinLabel = ['Really bad', 'Bad', 'Below average', 'Average', 'Above average', 'Good', 'Excellent'][values.value]
  if (action === 'checkin.rating.update') return `Set your ${before.name || 'selected issue'} check-in on ${values.date} to ${checkinLabel}${values.note !== undefined ? `. Note: “${values.note}”` : ', keeping its existing note.'}`
  if (action === 'checkin.rating.set') return `Set your ${before.name || 'selected issue'} check-in on ${values.date} to ${values.isNa ? 'not applicable' : checkinLabel}${values.note ? `. Note: “${values.note}”` : '.'}`
  if (action === 'checkin.rating.delete') return `Delete your ${before.name || 'selected issue'} check-in on ${values.date}.`
  const areas: Record<string, string> = { 'profile.update':'profile', 'health_setup.update':'health setup', 'goals.update':'daily goals', 'checkin_reminders.update':'check-in reminders', 'mood_reminders.update':'mood reminders', 'quiet_hours.update':'notification quiet hours', 'weekly_reports.update':'weekly reports', 'coach_preferences.update':'Smart Health Coach settings' }
  const labels: Record<string,string> = { firstName:'first name', lastName:'last name', bio:'bio', dateOfBirth:'date of birth', birthdate:'date of birth', gender:'gender', bodyType:'body type', weight:'weight in kilograms', height:'height in centimetres', exerciseFrequency:'exercise frequency', exerciseTypes:'exercise types', goals:'selected health issues', dietTypes:'diet preferences', allergies:'allergies', diabetesType:'recorded diabetes type', healthSituations:'health notes', healthIssues:'health issues', healthProblems:'health problems', additionalInfo:'additional information', skipped:'skipped', healthCheckSettings:'food health check settings', dailyCap:'daily cap', thresholds:'thresholds', goalChoice:'main goal', goalIntensity:'goal intensity', goalTargetWeightKg:'target weight in kilograms', goalTargetWeightUnit:'weight display unit', goalPaceKgPerWeek:'weekly weight change in kilograms', goalCalorieTarget:'daily calorie target', goalMacroMode:'macro setting', goalMacroSplit:'macro split', proteinPct:'protein fraction', carbPct:'carbohydrate fraction', fatPct:'fat fraction', goalFiberTarget:'daily fibre target', goalSugarMax:'daily sugar limit', time1:'first reminder', time2:'second reminder', time3:'third reminder', time4:'fourth reminder', startTime:'start time', endTime:'end time', timezoneManual:'manual time zone' }
  const describe = (value: any): string => typeof value === 'boolean' ? value ? 'on' : 'off' : Array.isArray(value) ? value.join(', ') || 'none' : value && typeof value === 'object' ? Object.entries(value).map(([key, v]) => `${labels[key] || key}: ${describe(v)}`).join('; ') : value === null ? 'automatic' : String(value)
  return `Update your ${areas[action]}: ${Object.entries(values).map(([key,value]) => { const operation = key.match(/^(dietTypes|allergies|exerciseTypes|goals)(Add|Remove)$/); const label = operation ? `${operation[2] === 'Add' ? 'add to' : 'remove from'} ${labels[operation[1]]}` : labels[key] || key; return `${label}: ${describe(value)}` }).join('; ')}.`
}

// Call only after the root verifies the signed, account-bound review and claims
// its existing confirmation receipt. This adapter never accepts arbitrary URLs.
export async function executeVoicePreferenceAction(request: NextRequest, userId: string, prepared: PreparedVoicePreferenceAction): Promise<VoicePreferenceExecutionResult> {
  if (!prepared || !userId || prepared.userId !== userId || !Number.isFinite(prepared.preparedAt) || Date.now() - prepared.preparedAt > 30 * 60 * 1000 || prepared.preparedAt > Date.now() + 1000) return {saved:false,status:'review_again',message:'Please review this setting change again before saving.'}
  if (prepared.action === 'coach_preferences.update' && prepared.values?.timezone !== undefined && prepared.values.timezoneManual === undefined) return {saved:false,status:'review_again',message:'Please review the fixed time zone choice again before saving.'}
  try {
    const before = await read(request, prepared.action, prepared.values)
    const values = validate(prepared.action, prepared.values, before)
    if (prepared.beforeHash !== hash({userId,action:prepared.action,state:scope(prepared.action,before)})) return {saved:false,status:'review_again',message:'Your settings changed since this review. Please review the latest values first.'}
    const expectedValues = expandListChanges(values, before)
    if (matches(prepared.action, expectedValues, before)) return {saved:true,status:'already_set',message:'That setting is already set to the value you requested.'}
    const route = routeFor(prepared.action)
    const body = payloadFor(prepared.action, values, before)
    const response = prepared.action === 'hydration_goal.reset'
      ? await hydration.DELETE(requestFor(request, route.path, 'DELETE'))
      : prepared.action === 'checkin.rating.update'
      ? await checkinRatings.PATCH(requestFor(request, '/api/checkins/ratings', 'PATCH', body))
      : prepared.action === 'checkin.rating.delete'
      ? await checkinRatings.DELETE(requestFor(request, `/api/checkins/ratings?date=${encodeURIComponent(values.date)}&issueId=${encodeURIComponent(before.issueId)}`, 'DELETE'))
      : await (route.api as any).POST(requestFor(request, route.path.split('?')[0], 'POST', body))
    const result = await json(response)
    const after = await read(request, prepared.action, values)
    if (!matches(prepared.action, expectedValues, after)) return {saved:false,status:'not_saved',message:'The app did not verify the requested setting. Please review the current value; I cannot claim the change succeeded.'}
    const scheduled = Array.isArray(result.scheduleResults) ? result.scheduleResults : null
    const needsSchedule = ['checkin_reminders.update','mood_reminders.update','coach_preferences.update'].includes(prepared.action) && (values.enabled ?? before.enabled) === true
    const schedulingVerified = !needsSchedule || Boolean(scheduled?.length && scheduled.every((entry: any) => entry.scheduled === true))
    return {saved:true,status:'saved',message:schedulingVerified ? 'Your setting change is saved and verified.' : 'Your settings are saved, but reminder delivery was not verified.',schedulingVerified}
  } catch (error) {
    return {saved:false,status:error instanceof VoicePreferenceActionError && error.code === 'pricing_confirmation_required' ? 'needs_screen' : 'not_saved',message:error instanceof VoicePreferenceActionError ? error.message : 'The app could not verify that setting change. Please check its current value before trying again.'}
  }
}
