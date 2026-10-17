/** Owned, provider-free daily context. Uses the SAME pure diary reader and
 * target calculator as native controls. No AI, debit, repair, save or sync. */
import crypto from 'crypto'
import type { NextRequest } from 'next/server'
import type { AssistantContext, AssistantOperation, AssistantValue } from './native-assistant-registry'
import { calculateDailyTargets, type DailyTargetInput } from './daily-targets'
import { normalizeFoodApiEntry } from '@/native/src/lib/foodDiaryEntries'
import { materializeMealPortion } from '@/native/src/lib/mealPortions'
import { optionalNutrient, sumOptionalNutrients, roundOptionalNutrient } from './food/nutrient-values'

export type CurrentStateDay = { localDate: string; timeZone: string; offsetsMinutes: number[] }
export type CurrentStateServices = {
  authenticatedActor(context: AssistantContext): Promise<string | null>
  /** Trusted host/device setting, never planner arguments. No UTC fallback. */
  trustedTimeZone(context: AssistantContext): Promise<string | null>
  now(): Date
  /** Fixed normal GET /api/user-data?scope=health-setup&voiceReadOnly=1. */
  profile(context: AssistantContext): Promise<unknown>
  /** Fixed normal GET /api/food-log?voiceReadOnly=1; must return readOnly:true. */
  food(context: AssistantContext, day: CurrentStateDay, tzOffsetMinutes: number): Promise<unknown>
  /** Fixed normal GET /api/exercise-entries?date=localDate; never syncs. */
  exercise(context: AssistantContext, day: CurrentStateDay): Promise<unknown>
}
export class CurrentStateError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'CurrentStateError' }
}
const fail = (code: string, message: string): never => { throw new CurrentStateError(code, message) }
const object = (value: any): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : fail('invalid_state', 'The app did not return the complete current records.')
const day = (value: any): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) return fail('invalid_date', 'Please choose a valid calendar date.')
  return value
}
const text = (value: any, max = 200): string => typeof value === 'string' && value.trim() && value.length <= max && !value.includes('\0') ? value : fail('invalid_state', 'A saved record has an invalid identity.')
function stable(value: any): any {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stable(value[key])]))
  return value
}
const digest = (value: any) => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
function parts(instant: Date, timeZone: string) {
  const format = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  const p = Object.fromEntries(format.formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
  return { date: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`, offset: Math.round((instant.getTime() - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)) / 60000) }
}
/** Two fixed-offset normal reads on a DST date cover both legacy day windows.
 * Final selection below uses actual IANA local day, never a guessed 24h day. */
export function currentStateDay(localDate: string, timeZone: string): CurrentStateDay {
  day(localDate)
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 100) return fail('timezone_required', 'The app needs your current time zone before calculating a daily allowance.')
  const noon = Date.parse(`${localDate}T12:00:00Z`), offsets = new Set<number>()
  let dayExists = false
  try {
    for (let hour = -36; hour <= 36; hour += 6) {
      const instant = new Date(noon + hour * 3600000), p = parts(instant, timeZone)
      offsets.add(p.offset)
      if (p.date === localDate) dayExists = true
    }
  } catch { return fail('invalid_timezone', 'The app could not verify that time zone.') }
  if (!dayExists || !offsets.size || offsets.size > 2 || [...offsets].some(value => value < -840 || value > 840)) return fail('invalid_timezone_day', 'The app could not verify that calendar day in your time zone.')
  return { localDate, timeZone, offsetsMinutes: [...offsets].sort((a, b) => a - b) }
}
function macroSplit(raw: any) {
  if (!raw || typeof raw !== 'object') return null
  let proteinPct = Number(raw.proteinPct), carbPct = Number(raw.carbPct), fatPct = Number(raw.fatPct)
  if (![proteinPct, carbPct, fatPct].some(Number.isFinite)) return null
  proteinPct = Number.isFinite(proteinPct) ? proteinPct : 0; carbPct = Number.isFinite(carbPct) ? carbPct : 0; fatPct = Number.isFinite(fatPct) ? fatPct : 0
  if (proteinPct > 1 || carbPct > 1 || fatPct > 1) { proteinPct /= 100; carbPct /= 100; fatPct /= 100 }
  const total = proteinPct + carbPct + fatPct
  return Number.isFinite(total) && total > 0 ? { proteinPct: proteinPct / total, carbPct: carbPct / total, fatPct: fatPct / total } : null
}
function normalizedProfile(response: unknown) {
  const envelope = object(response)
  if (envelope.readOnly !== true) return fail('read_only_contract_required', 'The normal profile could not provide a verified read-only result.')
  const source = object(envelope.data), useManual = typeof source.goalChoice === 'string' && /lose|gain/.test(source.goalChoice.toLowerCase())
  const measurement = (value: any) => typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : null
  const list = (value: any, field: string): string[] => {
    if (!Array.isArray(value) || value.length > 200 || value.some(item => typeof item !== 'string' || item.length > 300 || item.includes('\0'))) return fail('missing_constraints', `The saved ${field} could not be read completely.`)
    return [...value]
  }
  const allergies = list(source.allergies, 'allergies'), rawDiet = source.dietTypes ?? source.dietType
  const dietTypes = list(typeof rawDiet === 'string' ? [rawDiet] : rawDiet, 'diet preferences')
  const input: DailyTargetInput = {
    gender: source.gender, birthdate: source.birthdate || source.profileInfo?.dateOfBirth,
    weightKg: measurement(source.weight), heightCm: measurement(source.height), dietTypes,
    exerciseFrequency: source.exerciseFrequency, goals: Array.isArray(source.goals) ? source.goals : [],
    goalChoice: source.goalChoice, goalIntensity: source.goalIntensity,
    calorieTarget: useManual ? source.goalCalorieTarget : null, macroSplit: useManual ? macroSplit(source.goalMacroSplit) : null,
    fiberTarget: useManual ? source.goalFiberTarget : null, sugarMax: useManual ? source.goalSugarMax : null,
    exerciseDurations: source.exerciseDurations, bodyType: source.bodyType,
    healthSituations: source.healthSituations, allergies, diabetesType: source.diabetesType,
  }
  return { input, allergies, dietTypes, healthSetupUpdatedAt: source.healthSetupUpdatedAt ?? null, manualTargetEligible: useManual, goalMacroMode: source.goalMacroMode ?? null }
}
const KEYS = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar'] as const
type Totals = Record<typeof KEYS[number], number | null>
const aliases = { calories: ['calories', 'calories_kcal', 'kcal', 'energy', 'cal'], protein: ['protein', 'protein_g'], carbs: ['carbs', 'carbs_g'], fat: ['fat', 'fat_g'], fiber: ['fiber', 'fiber_g'], sugar: ['sugar', 'sugar_g'] }
function knownNutrition(raw: any) {
  const material = materializeMealPortion(raw), items = Array.isArray(material.items) ? material.items : null
  const source = material.nutrients || material.nutrition || material.total || {}
  const recorded = (value: any, keys: readonly string[]) => keys.some(key => optionalNutrient(value?.[key]) !== null)
  const normalized = normalizeFoodApiEntry(raw)
  // Keep uncertainty visible even where the normal UI displays absent primary
  // macros as zero. A budget cannot turn an unreported meal into zero calories.
  const evidence: Record<string, boolean> = {}
  for (const key of KEYS) {
    evidence[key] = items?.length ? items.every((item: any) => recorded(item, key === 'calories' ? ['calories', 'calories_kcal'] : [aliases[key][1], aliases[key][0]])) : recorded(source, aliases[key])
  }
  if (!evidence.calories) evidence.calories = items?.length ? items.every((item: any) => recorded(item, ['calories', 'calories_kcal']) || ['protein', 'carbs', 'fat'].every(key => recorded(item, aliases[key as keyof typeof aliases]))) : ['protein', 'carbs', 'fat'].every(key => evidence[key])
  return { normalized, evidence }
}
function selectedFoods(responses: unknown[], context: AssistantContext, requested: CurrentStateDay) {
  const selected = new Map<string, any>()
  for (const response of responses) {
    const data = object(response)
    if (data.readOnly !== true || data.success !== true || !Array.isArray(data.logs) || data.logs.length > 5000) return fail('read_only_contract_required', 'The normal diary could not provide a verified read-only result.')
    for (const value of data.logs) {
      const row = object(value), id = text(row.id)
      if (row.userId !== context.actorId) return fail('foreign_state', 'The app returned a record from a different account.')
      const explicit = typeof row.localDate === 'string' && row.localDate.trim() ? row.localDate : null
      const createdAt = new Date(row.createdAt)
      if (!Number.isFinite(createdAt.getTime())) return fail('invalid_state', 'A saved food needs a valid recorded time.')
      if (explicit && day(explicit) !== requested.localDate) return fail('foreign_date', 'The app returned a food from another selected date.')
      if (!explicit && parts(createdAt, requested.timeZone).date !== requested.localDate) continue
      const safe = { id, userId: row.userId, name: row.name, description: row.description, localDate: explicit, meal: row.meal, category: row.category, createdAt: createdAt.toISOString(), updatedAt: row.updatedAt ?? null, nutrients: row.nutrients, nutrition: row.nutrition, total: row.total, items: row.items }
      if (selected.has(id) && digest(selected.get(id)) !== digest(safe)) return fail('state_changed', 'A diary entry changed while it was being read. Please read the current day again.')
      selected.set(id, safe)
    }
  }
  return [...selected.values()].sort((a, b) => a.id.localeCompare(b.id))
}
function selectedExercise(response: unknown, context: AssistantContext, requested: CurrentStateDay) {
  const data = object(response)
  if (data.date !== requested.localDate || !Array.isArray(data.entries) || data.entries.length > 5000) return fail('invalid_exercise_state', 'The app could not read exercise for that exact date.')
  const entries = data.entries.map((value: unknown) => {
    const row = object(value), id = text(row.id)
    if (row.userId !== context.actorId || row.localDate !== requested.localDate || optionalNutrient(row.calories) === null) return fail('invalid_exercise_state', 'The app could not verify the recorded exercise allowance.')
    return { id, userId: row.userId, localDate: row.localDate, calories: Number(row.calories), source: row.source ?? null, updatedAt: row.updatedAt ?? null }
  }).sort((a: any, b: any) => a.id.localeCompare(b.id))
  if (new Set(entries.map((row: any) => row.id)).size !== entries.length) return fail('invalid_exercise_state', 'The exercise list contained repeated records.')
  const sum = entries.reduce((n: number, row: any) => n + row.calories, 0)
  if (typeof data.exerciseCalories !== 'number' || !Number.isFinite(data.exerciseCalories) || Math.abs(sum - data.exerciseCalories) > 0.000001) return fail('invalid_exercise_state', 'The recorded exercise total did not match its entries.')
  return { entries, calories: Math.max(0, Math.round(data.exerciseCalories)) }
}
function targets(profile: ReturnType<typeof normalizedProfile>, now: Date, timeZone: string) {
  const missing: string[] = [], input = profile.input
  if (!['male', 'female'].includes(input.gender || '')) missing.push('metabolic gender')
  if (!input.weightKg || !Number.isFinite(input.weightKg) || input.weightKg <= 0) missing.push('weight')
  if (!input.heightCm || !Number.isFinite(input.heightCm) || input.heightCm <= 0) missing.push('height')
  let birthdate: string | null = null
  try { birthdate = day(input.birthdate) } catch { missing.push('date of birth') }
  if (birthdate) {
    const localDate = parts(now, timeZone).date, systemDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const age = (date: string) => Number(date.slice(0, 4)) - Number(birthdate!.slice(0, 4)) - (date.slice(5) < birthdate!.slice(5) ? 1 : 0)
    if (age(localDate) <= 0 || age(localDate) > 110) missing.push('valid date of birth')
    if (age(localDate) !== age(systemDate)) missing.push('time-zone-safe birthday target')
  }
  if (missing.length) return { values: null, missing, basis: 'missing_personal_targets' as const }
  const calculated = calculateDailyTargets(input)
  if (calculated.calories === null || calculated.protein === null || calculated.carbs === null || calculated.fat === null) return { values: null, missing: ['personal daily target'], basis: 'missing_personal_targets' as const }
  // Normal native target display rounds positive values and uses defaults for
  // unavailable fields. Here an unavailable field remains null, never personal.
  const displayed = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null
  return { values: { calories: displayed(calculated.calories), protein: displayed(calculated.protein), carbs: displayed(calculated.carbs), fat: displayed(calculated.fat), fiber: displayed(calculated.fiber), sugar: displayed(calculated.sugarMax) }, missing, basis: profile.manualTargetEligible && Number(input.calorieTarget) > 0 ? 'saved_manual_target' as const : 'calculated_from_saved_profile' as const }
}
export function createNativeAssistantCurrentStateOperation(services: CurrentStateServices): AssistantOperation {
  async function authorize(context: AssistantContext) {
    if (context.signal?.aborted) return fail('cancelled', 'This daily read was stopped.')
    text(context.actorId); day(context.localDate)
    if (await services.authenticatedActor(context) !== context.actorId) return fail('unauthorized', 'Please use the same signed-in account before reading daily records.')
    if (context.signal?.aborted) return fail('cancelled', 'This daily read was stopped.')
  }
  async function read(context: AssistantContext, values: Record<string, AssistantValue>) {
    if (!values || Object.keys(values).some(key => key !== 'localDate')) return fail('invalid_input', 'Only the selected calendar date is accepted for this read.')
    await authorize(context)
    const now = services.now()
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return fail('invalid_clock', 'The app could not verify the current time.')
    const timeZone = await services.trustedTimeZone(context)
    const requested = currentStateDay(day(values.localDate ?? context.localDate), timeZone || '')
    if (parts(now, requested.timeZone).date !== context.localDate) return fail('stale_local_date', 'The local day changed. Please refresh the assistant context.')
    async function snapshot() {
      await authorize(context)
      const [profileResponse, exerciseResponse, ...foodResponses] = await Promise.all([services.profile(context), services.exercise(context, requested), ...requested.offsetsMinutes.map(offset => services.food(context, requested, offset))])
      await authorize(context)
      const profile = normalizedProfile(profileResponse), foods = selectedFoods(foodResponses, context, requested), exercise = selectedExercise(exerciseResponse, context, requested)
      const value = { actorId: context.actorId, targetsAsOfLocalDate: context.localDate, requested, profile, foods, exercise }
      return { ...value, sourceVersion: digest(value) }
    }
    const first = await snapshot(), current = await snapshot()
    await authorize(context)
    const finalNow = services.now(), finalZone = await services.trustedTimeZone(context)
    if (finalZone !== requested.timeZone || !(finalNow instanceof Date) || !Number.isFinite(finalNow.getTime()) || parts(finalNow, requested.timeZone).date !== context.localDate) return fail('stale_local_date', 'Your local day or time zone changed while the current data was read. Please refresh it.')
    if (first.sourceVersion !== current.sourceVersion) return fail('state_changed', 'Your daily data changed while it was read. Please read it again before planning dinner.')
    const all = current.foods.map(knownNutrition), total: Totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }, visible: Totals = { ...total }
    for (const { normalized, evidence } of all) for (const key of KEYS) {
      visible[key] = sumOptionalNutrients(visible[key], normalized.nutrients?.[key])
      total[key] = sumOptionalNutrients(total[key], evidence[key] ? normalized.nutrients?.[key] : null)
    }
    for (const key of KEYS) { total[key] = key === 'calories' && total[key] !== null ? Math.round(total[key]!) : roundOptionalNutrient(total[key]); visible[key] = key === 'calories' && visible[key] !== null ? Math.round(visible[key]!) : roundOptionalNutrient(visible[key]) }
    const personalized = targets(current.profile, now, requested.timeZone), base = personalized.values?.calories ?? null
    const visibleCalories = visible.calories ?? 0, macroCalories = (visible.protein ?? 0) * 4 + (visible.carbs ?? 0) * 4 + (visible.fat ?? 0) * 9
    const consumed = total.calories === null ? null : Math.max(0, Math.round(visibleCalories > 0 ? visibleCalories : macroCalories > 0 ? macroCalories : visibleCalories))
    const allowance = base === null ? null : Math.max(0, Math.round(base + current.exercise.calories)), remaining = allowance === null || consumed === null ? null : Math.max(0, Math.round(allowance - consumed))
    const status = base === null ? 'missing_personal_targets' : consumed === null ? 'incomplete_food_nutrition' : 'ready'
    return { operation: 'food.day_context.read', verified: true, safeToClaimSaved: false, actorId: context.actorId, localDate: requested.localDate, timeZone: requested.timeZone, readAt: finalNow.toISOString(), sourceVersion: current.sourceVersion,
      targetBasis: personalized.basis, targetsAsOfLocalDate: context.localDate, missingPersonalFields: personalized.missing, targets: personalized.values,
      budget: { status, baseTargetCalories: base, exerciseCalories: current.exercise.calories, dailyAllowanceCalories: allowance, consumedCalories: consumed, remainingCalories: remaining, overByCalories: allowance === null || consumed === null ? null : Math.max(0, Math.round(consumed - allowance)) },
      totals: total, visibleDiaryTotals: visible, foodCount: current.foods.length, exerciseCount: current.exercise.entries.length,
      constraints: { dietTypes: current.profile.dietTypes, allergies: current.profile.allergies, diabetesType: current.profile.input.diabetesType ?? null },
      message: status === 'ready' ? `Your saved food and exercise for ${requested.localDate} leave ${remaining} calories from your current daily allowance.` : status === 'missing_personal_targets' ? `Your personalized daily target could not be verified. Please provide ${personalized.missing.join(', ')} before using a remaining-calorie dinner budget.` : 'Some saved food has unreported calorie information. A reliable remaining-calorie dinner budget is not available yet.' }
  }
  return { id: 'food.day_context.read', description: 'Read actual owned food, exercise, current personalized targets and exact saved diet/allergies for dinner planning; incomplete data stays explicit.', kind: 'read',
    input: { type: 'object', properties: { localDate: { type: 'string', maxLength: 10, format: 'date' } }, required: [] }, normalHandler: 'read-only normal food-log + scoped user-data + exercise-entries GET; shared normal native foodDiaryEntries + daily-targets',
    coverage: { manualIds: ['food.diary.totals', 'exercise.list', 'health_setup.read'], status: 'offline-proof', scope: 'Current owned local-day context; no recipe generation, save, provider or credit call.' }, read,
    plannerResult: (result: any): AssistantValue => JSON.parse(JSON.stringify({ sourceVersion: result.sourceVersion, localDate: result.localDate, timeZone: result.timeZone, targetsAsOfLocalDate: result.targetsAsOfLocalDate, budget: result.budget, targets: result.targets, targetBasis: result.targetBasis, missingPersonalFields: result.missingPersonalFields, totals: result.totals, constraints: result.constraints, foodCount: result.foodCount, exerciseCount: result.exerciseCount, message: result.message })),
    verify: async (context, result: any) => { if (result?.verified !== true || result.safeToClaimSaved !== false || result.actorId !== context.actorId || typeof result.sourceVersion !== 'string') return false; const fresh = await read(context, { localDate: result.localDate }); return fresh.sourceVersion === result.sourceVersion },
  }
}

/** In-process fixed normal handlers. Construction alone performs no I/O. The
 * caller must supply trusted device timezone; never obtain it from model JSON. */
export function createCurrentStateNormalServices(request: NextRequest, host: { trustedTimeZone: CurrentStateServices['trustedTimeZone']; now?: () => Date }): CurrentStateServices {
  const get = async (pathname: string, init?: { profile?: boolean }) => {
    const { NextRequest } = await import('next/server'), headers = new Headers(request.headers)
    headers.delete('host'); headers.delete('content-length'); headers.set('cache-control', 'no-store')
    // The scoped profile GET otherwise writes country from request geolocation.
    if (init?.profile) { headers.delete('x-vercel-ip-country'); headers.delete('cf-ipcountry') }
    const forwarded = new NextRequest(new URL(pathname, request.url), { headers, signal: request.signal })
    const route = pathname.startsWith('/api/user-data?') ? await import('@/app/api/user-data/route') : pathname.startsWith('/api/food-log?') ? await import('@/app/api/food-log/route') : await import('@/app/api/exercise-entries/route')
    const response = await route.GET(forwarded), data = await response.json().catch(() => null)
    if (!response.ok || !data || data.error) return fail('normal_read_failed', 'The normal app could not read your current daily records.')
    if (init?.profile && data.readOnly !== true) return fail('read_only_contract_required', 'The normal profile did not confirm its read-only contract.')
    return data
  }
  return { now: host.now ?? (() => new Date()), trustedTimeZone: host.trustedTimeZone,
    authenticatedActor: async () => {
      const [{ getServerSession }, { authOptions }, { getUserIdFromNativeAuth }] = await Promise.all([import('next-auth'), import('@/lib/auth'), import('@/lib/native-auth')])
      const session = await getServerSession(authOptions), native = await getUserIdFromNativeAuth(request), web = session?.user?.id
      if (session?.user?.email && !web || web && native && web !== native) return null
      return web || native || null
    },
    profile: () => get('/api/user-data?scope=health-setup&voiceReadOnly=1', { profile: true }),
    food: (_context, requested, offset) => get(`/api/food-log?date=${encodeURIComponent(requested.localDate)}&tz=${offset}&voiceReadOnly=1`),
    exercise: (_context, requested) => get(`/api/exercise-entries?date=${encodeURIComponent(requested.localDate)}`),
  }
}
