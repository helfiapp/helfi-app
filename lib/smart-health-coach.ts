import { randomUUID } from 'crypto'
import { buildFoodDiarySnapshot } from '@/lib/food-diary-context'
import { computeHydrationGoal } from '@/lib/hydration-goal'
import { prisma } from '@/lib/prisma'

export const SMART_COACH_ALERT_COST_CREDITS = 10
export const SMART_COACH_DAILY_CAP_CREDITS = 50
export const SMART_COACH_DAILY_MAX_ALERTS = 5
export const SMART_COACH_GLOBAL_COOLDOWN_MINUTES = 60
export const SMART_COACH_RULE_COOLDOWN_MINUTES = 4 * 60
export const SMART_COACH_CATEGORY_COOLDOWN_MINUTES = 3 * 60
export const SMART_COACH_MESSAGE_COOLDOWN_MINUTES = 6 * 60
export const SMART_COACH_AUTO_CHECK_TIMES = ['08:00', '11:00', '14:00', '17:00', '20:00'] as const

export type SmartCoachDecisionResult = 'sent' | 'blocked'

export type SmartCoachBlockReason =
  | 'none'
  | 'disabled'
  | 'no_rule'
  | 'quiet_hours'
  | 'global_cooldown'
  | 'rule_cooldown'
  | 'category_cooldown'
  | 'message_cooldown'
  | 'daily_cap'
  | 'insufficient_credits'
  | 'no_subscription'
  | 'billing_failed'
  | 'stale_schedule'
  | 'already_sent'
  | 'unknown'

export type SmartCoachRuleCandidate = {
  ruleId: string
  category: 'hydration' | 'macro' | 'meal' | 'mood'
  title: string
  body: string
  url: string
  why: string
  priority: number
}

export type SmartCoachEvaluation = {
  localDate: string
  localTime: string
  timezone: string
  rule: SmartCoachRuleCandidate | null
  metrics: Record<string, unknown>
}

export type SmartCoachQuietHours = {
  enabled: boolean
  startTime: string
  endTime: string
  timezone: string
}

export async function ensureSmartCoachTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS HealthCoachAlertLog (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      ruleId TEXT NOT NULL,
      evaluatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      triggerResult TEXT NOT NULL,
      blockReason TEXT,
      creditsCharged INTEGER NOT NULL DEFAULT 0,
      notificationId TEXT,
      openedAt TIMESTAMPTZ,
      metadata JSONB
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_healthcoach_log_user_time
    ON HealthCoachAlertLog(userId, evaluatedAt DESC)
  `).catch(() => {})
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_healthcoach_log_user_rule
    ON HealthCoachAlertLog(userId, ruleId, evaluatedAt DESC)
  `).catch(() => {})

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS NotificationQuietHours (
      userId TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      startTime TEXT NOT NULL DEFAULT '22:00',
      endTime TEXT NOT NULL DEFAULT '07:00',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await prisma.$executeRawUnsafe(
    `ALTER TABLE NotificationQuietHours ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC'`
  ).catch(() => {})
  await prisma.$executeRawUnsafe(
    `ALTER TABLE HealthTipSettings ADD COLUMN IF NOT EXISTS pricingAcceptedAt TIMESTAMPTZ`
  ).catch(() => {})
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS HealthCoachDispatchLock (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      localDate TEXT NOT NULL,
      reminderTime TEXT NOT NULL,
      createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(userId, localDate, reminderTime)
    )
  `).catch(() => {})
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_healthcoach_dispatchlock_user_time
    ON HealthCoachDispatchLock(userId, createdAt DESC)
  `).catch(() => {})
}

export async function getSmartCoachQuietHours(userId: string): Promise<SmartCoachQuietHours> {
  await ensureSmartCoachTables()
  const rows = await prisma
    .$queryRawUnsafe<
      Array<{
        enabled: boolean
        starttime: string
        endtime: string
        timezone: string
      }>
    >(
      `SELECT enabled, startTime, endTime, timezone
       FROM NotificationQuietHours
       WHERE userId = $1`,
      userId
    )
    .catch(
      () =>
        [] as Array<{
          enabled: boolean
          starttime: string
          endtime: string
          timezone: string
        }>
    )

  if (!rows.length) {
    return {
      enabled: false,
      startTime: '22:00',
      endTime: '07:00',
      timezone: 'UTC',
    }
  }

  return {
    enabled: !!rows[0].enabled,
    startTime: normalizeTime(rows[0].starttime || '22:00', '22:00'),
    endTime: normalizeTime(rows[0].endtime || '07:00', '07:00'),
    timezone: rows[0].timezone || 'UTC',
  }
}

export function getLocalDateTime(timezone: string, now = new Date()) {
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const localDate = `${dateParts.find((p) => p.type === 'year')?.value}-${dateParts.find((p) => p.type === 'month')?.value}-${dateParts.find((p) => p.type === 'day')?.value}`

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hh = timeParts.find((p) => p.type === 'hour')?.value || '00'
  const mm = timeParts.find((p) => p.type === 'minute')?.value || '00'

  return {
    localDate,
    localTime: `${hh}:${mm}`,
    hour: Number(hh),
    minute: Number(mm),
    minutesOfDay: Number(hh) * 60 + Number(mm),
  }
}

export function isWithinQuietHours(localTime: string, startTime: string, endTime: string) {
  const now = parseMinutes(localTime)
  const start = parseMinutes(startTime)
  const end = parseMinutes(endTime)
  if (now === null || start === null || end === null) return false
  if (start === end) return true
  if (start < end) {
    return now >= start && now < end
  }
  return now >= start || now < end
}

export async function logSmartCoachDecision(params: {
  userId: string
  ruleId: string
  triggerResult: SmartCoachDecisionResult
  blockReason: SmartCoachBlockReason
  creditsCharged: number
  notificationId?: string | null
  metadata?: Record<string, unknown>
}) {
  await ensureSmartCoachTables()
  await prisma.$executeRawUnsafe(
    `INSERT INTO HealthCoachAlertLog (
      id, userId, ruleId, triggerResult, blockReason, creditsCharged, notificationId, metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    randomUUID(),
    params.userId,
    params.ruleId || 'none',
    params.triggerResult,
    params.blockReason || 'unknown',
    Math.max(0, Number(params.creditsCharged || 0)),
    params.notificationId || null,
    JSON.stringify(params.metadata || {})
  ).catch(() => {})
}

export async function evaluateSmartCoachRule(params: {
  userId: string
  timezone: string
  now?: Date
}): Promise<SmartCoachEvaluation> {
  const now = params.now || new Date()
  const timezone = params.timezone || 'UTC'
  const local = getLocalDateTime(timezone, now)
  const tzOffsetMin = getTimeZoneOffsetMinutes(timezone, now)

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    include: {
      healthGoals: {
        orderBy: { updatedAt: 'desc' },
      },
    },
  })

  if (!user) {
    return {
      localDate: local.localDate,
      localTime: local.localTime,
      timezone,
      rule: null,
      metrics: { reason: 'user_not_found' },
    }
  }

  const snapshotPromise = buildFoodDiarySnapshot({
    userId: user.id,
    localDate: local.localDate,
    tzOffsetMin,
  }).catch(() => null)

  const foodMealsPromise = prisma.foodLog.findMany({
    where: { userId: user.id, localDate: local.localDate },
    select: { meal: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  }).catch(() => [])

  const waterTodayPromise = prisma.waterLog.findMany({
    where: { userId: user.id, localDate: local.localDate },
    select: { amountMl: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  }).catch(() => [])

  const waterLast3hPromise = prisma.waterLog.count({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(now.getTime() - 3 * 60 * 60 * 1000) },
    },
  }).catch(() => 0)

  const moodTodayRowsPromise = prisma
    .$queryRawUnsafe<Array<{ mood: number; localdate: string }>>(
      `SELECT mood, localDate
       FROM MoodEntries
       WHERE userId = $1 AND localDate = $2`,
      user.id,
      local.localDate
    )
    .catch(() => [] as Array<{ mood: number; localdate: string }>)

  const moodTrendRowsPromise = prisma
    .$queryRawUnsafe<Array<{ localdate: string; avgmood: number; count: number }>>(
      `SELECT localDate, AVG(mood)::float AS avgMood, COUNT(*)::int AS count
       FROM MoodEntries
       WHERE userId = $1
         AND localDate >= $2
       GROUP BY localDate
       ORDER BY localDate DESC
       LIMIT 3`,
      user.id,
      shiftDateString(local.localDate, -7)
    )
    .catch(() => [] as Array<{ localdate: string; avgmood: number; count: number }>)

  const journalTodayCountPromise = prisma.$queryRawUnsafe<Array<{ count: string }>>(
    `SELECT COUNT(*)::text AS count
     FROM MoodJournalEntries
     WHERE userId = $1 AND localDate = $2`,
    user.id,
    local.localDate
  ).catch(() => [{ count: '0' }])

  const weekWaterRowsPromise = prisma
    .$queryRawUnsafe<Array<{ localdate: string; totalml: number }>>(
      `SELECT localDate, COALESCE(SUM(amountMl), 0)::float AS totalMl
       FROM "WaterLog"
       WHERE "userId" = $1
         AND "localDate" >= $2
       GROUP BY localDate`,
      user.id,
      shiftDateString(local.localDate, -6)
    )
    .catch(() => [] as Array<{ localdate: string; totalml: number }>)

  const [
    snapshot,
    foodMeals,
    waterTodayRows,
    waterLast3hCount,
    moodTodayRows,
    moodTrendRows,
    journalTodayCountRows,
    weekWaterRows,
  ] = await Promise.all([
    snapshotPromise,
    foodMealsPromise,
    waterTodayPromise,
    waterLast3hPromise,
    moodTodayRowsPromise,
    moodTrendRowsPromise,
    journalTodayCountPromise,
    weekWaterRowsPromise,
  ])

  const hydrationTargetMl = resolveHydrationTargetMl(user)
  const waterTodayMl = Math.round(waterTodayRows.reduce((sum, row) => sum + (Number(row.amountMl) || 0), 0))
  const waterProgress = hydrationTargetMl > 0 ? waterTodayMl / hydrationTargetMl : 0

  const hasMeal = (pattern: RegExp) =>
    foodMeals.some((entry) => pattern.test(String(entry.meal || '').toLowerCase()))
  const hasBreakfast = hasMeal(/breakfast/)
  const hasLunch = hasMeal(/lunch/)
  const hasDinner = hasMeal(/dinner/)

  const totalMoodsToday = moodTodayRows.length
  const lowMoodsToday = moodTodayRows.filter((entry) => Number(entry.mood) <= 3).length
  const journalTodayCount = parseInt(journalTodayCountRows?.[0]?.count || '0', 10) || 0

  const moodAverages = moodTrendRows
    .map((row) => ({ date: row.localdate, avg: Number(row.avgmood) }))
    .filter((row) => Number.isFinite(row.avg))
  const hasThreeDayMoodDowntrend =
    moodAverages.length >= 3 &&
    moodAverages[0].avg < moodAverages[1].avg &&
    moodAverages[1].avg < moodAverages[2].avg

  const fatProgress = ratio(snapshot?.totals?.fat_g, snapshot?.targets?.fat_g)
  const carbProgress = ratio(snapshot?.totals?.carbs_g, snapshot?.targets?.carbs_g)
  const proteinProgress = ratio(snapshot?.totals?.protein_g, snapshot?.targets?.protein_g)
  const fiberProgress = ratio(snapshot?.totals?.fiber_g, snapshot?.targets?.fiber_g)
  const calorieProgress = ratio(snapshot?.totals?.calories, snapshot?.targets?.calories)

  const hydrationMissDays = weekWaterRows.filter((row) => {
    const total = Number(row.totalml) || 0
    return hydrationTargetMl > 0 && total < hydrationTargetMl * 0.75
  }).length

  const candidates: SmartCoachRuleCandidate[] = []
  const add = (rule: SmartCoachRuleCandidate, condition: boolean) => {
    if (!condition) return
    candidates.push(rule)
  }

  add(
    {
      ruleId: 'hydration_no_water_3h',
      category: 'hydration',
      title: 'Smart Health Coach: hydration check-in',
      body: `No water logged in the last 3 hours. A glass now can help you stay on track today.`,
      url: '/food/water',
      why: 'No water logged for 3 hours during wake window.',
      priority: 12,
    },
    local.minutesOfDay >= 8 * 60 && local.minutesOfDay <= 22 * 60 && waterLast3hCount === 0
  )

  add(
    {
      ruleId: 'hydration_lt25_noon',
      category: 'hydration',
      title: 'Smart Health Coach: water is behind',
      body: `You are at ${toPct(waterProgress)} of your water goal by noon. Add one drink now to catch up.`,
      url: '/food/water',
      why: 'Hydration below 25% by 12:00 PM.',
      priority: 10,
    },
    local.minutesOfDay >= 12 * 60 && waterProgress > 0 && waterProgress < 0.25
  )

  add(
    {
      ruleId: 'hydration_lt50_afternoon',
      category: 'hydration',
      title: 'Smart Health Coach: afternoon hydration',
      body: `Hydration is at ${toPct(waterProgress)} and should be near 50% by now. Add water with your next meal.`,
      url: '/food/water',
      why: 'Hydration below 50% by 3:00 PM.',
      priority: 9,
    },
    local.minutesOfDay >= 15 * 60 && waterProgress > 0 && waterProgress < 0.5
  )

  add(
    {
      ruleId: 'hydration_lt75_evening',
      category: 'hydration',
      title: 'Smart Health Coach: evening water reminder',
      body: `You are at ${toPct(waterProgress)} of your water goal by evening. A final bottle can close the gap.`,
      url: '/food/water',
      why: 'Hydration below 75% by 7:00 PM.',
      priority: 8,
    },
    local.minutesOfDay >= 19 * 60 && waterProgress > 0 && waterProgress < 0.75
  )

  add(
    {
      ruleId: 'hydration_miss_pattern',
      category: 'hydration',
      title: 'Smart Health Coach: hydration pattern detected',
      body: `You missed your water goal on ${hydrationMissDays} days this week. Try setting a small water target each meal.`,
      url: '/food/water',
      why: 'Repeated hydration misses across multiple days.',
      priority: 7,
    },
    local.minutesOfDay >= 19 * 60 && hydrationMissDays >= 3
  )

  add(
    {
      ruleId: 'fat_80_before_3pm',
      category: 'macro',
      title: 'Smart Health Coach: fat target running high',
      body: `You are already at ${toPct(fatProgress)} of your fat target before mid-afternoon. A leaner next meal may help balance today.`,
      url: '/food',
      why: 'Fat target reached early in the day.',
      priority: 10,
    },
    local.minutesOfDay < 15 * 60 && fatProgress >= 0.8
  )

  add(
    {
      ruleId: 'carbs_80_before_3pm',
      category: 'macro',
      title: 'Smart Health Coach: carbs are front-loaded',
      body: `You are at ${toPct(carbProgress)} of your carb target before 3 PM. Add protein-first options in your next meal.`,
      url: '/food',
      why: 'Carb target reached early in the day.',
      priority: 9,
    },
    local.minutesOfDay < 15 * 60 && carbProgress >= 0.8
  )

  add(
    {
      ruleId: 'protein_low_by_6pm',
      category: 'macro',
      title: 'Smart Health Coach: protein is low',
      body: `Protein is only ${toPct(proteinProgress)} of your target by evening. Add a protein-focused meal or snack next.`,
      url: '/food',
      why: 'Protein target is lagging by evening.',
      priority: 10,
    },
    local.minutesOfDay >= 18 * 60 && proteinProgress >= 0 && proteinProgress < 0.6
  )

  add(
    {
      ruleId: 'fiber_low_by_6pm',
      category: 'macro',
      title: 'Smart Health Coach: fiber check',
      body: `Fiber is at ${toPct(fiberProgress)} by evening. Try adding vegetables, berries, or legumes in your next meal.`,
      url: '/food',
      why: 'Fiber target is lagging by evening.',
      priority: 8,
    },
    local.minutesOfDay >= 18 * 60 && fiberProgress >= 0 && fiberProgress < 0.6
  )

  add(
    {
      ruleId: 'calories_spent_early',
      category: 'macro',
      title: 'Smart Health Coach: calorie pace is high',
      body: `You are at ${toPct(calorieProgress)} of calories early in the day. A lighter next meal can help avoid overshooting.`,
      url: '/food',
      why: 'Calories almost spent too early.',
      priority: 8,
    },
    local.minutesOfDay < 15 * 60 && calorieProgress >= 0.85
  )

  add(
    {
      ruleId: 'calories_too_low_late',
      category: 'macro',
      title: 'Smart Health Coach: low energy intake',
      body: `You are at ${toPct(calorieProgress)} of your calories late in the day. A balanced meal can help avoid under-eating.`,
      url: '/food',
      why: 'Calories are very low by late evening.',
      priority: 7,
    },
    local.minutesOfDay >= 21 * 60 && calorieProgress > 0 && calorieProgress < 0.6
  )

  add(
    {
      ruleId: 'no_breakfast_by_1pm',
      category: 'meal',
      title: 'Smart Health Coach: breakfast missing',
      body: 'No breakfast is logged yet. A small protein-rich meal now can help afternoon energy.',
      url: '/food',
      why: 'No breakfast logged by 1:00 PM.',
      priority: 7,
    },
    local.minutesOfDay >= 13 * 60 && !hasBreakfast
  )

  add(
    {
      ruleId: 'no_lunch_by_330pm',
      category: 'meal',
      title: 'Smart Health Coach: lunch check',
      body: 'Lunch is not logged yet. A balanced meal now may help prevent evening overeating.',
      url: '/food',
      why: 'No lunch logged by 3:30 PM.',
      priority: 6,
    },
    local.minutesOfDay >= 15 * 60 + 30 && !hasLunch
  )

  add(
    {
      ruleId: 'no_dinner_by_9pm',
      category: 'meal',
      title: 'Smart Health Coach: dinner still missing',
      body: 'Dinner is not logged yet. Add a simple balanced meal to close your day well.',
      url: '/food',
      why: 'No dinner logged by 9:00 PM.',
      priority: 6,
    },
    local.minutesOfDay >= 21 * 60 && !hasDinner
  )

  add(
    {
      ruleId: 'no_mood_checkin_evening',
      category: 'mood',
      title: 'Smart Health Coach: mood check-in reminder',
      body: 'No mood check-in yet today. A quick check-in can help spot patterns in your day.',
      url: '/mood',
      why: 'No mood check-in by evening.',
      priority: 7,
    },
    local.minutesOfDay >= 20 * 60 && totalMoodsToday === 0
  )

  add(
    {
      ruleId: 'negative_mood_journal_prompt',
      category: 'mood',
      title: 'Smart Health Coach: take a quick journal moment',
      body: 'You logged low mood more than once today. A short journal note may help reveal triggers.',
      url: '/health-journal',
      why: 'Multiple low mood entries without a journal note.',
      priority: 11,
    },
    lowMoodsToday >= 2 && journalTodayCount === 0
  )

  add(
    {
      ruleId: 'mood_downtrend_3_days',
      category: 'mood',
      title: 'Smart Health Coach: mood trend support',
      body: 'Your mood trend has dipped over the last few days. A short reflection note can help you identify what changed.',
      url: '/health-journal',
      why: 'Downward mood trend over 3 days.',
      priority: 11,
    },
    hasThreeDayMoodDowntrend
  )

  const chosen = candidates.sort((a, b) => b.priority - a.priority)[0] || null

  return {
    localDate: local.localDate,
    localTime: local.localTime,
    timezone,
    rule: chosen,
    metrics: {
      hydrationTargetMl,
      waterTodayMl,
      waterProgress,
      waterLast3hCount,
      fatProgress,
      carbProgress,
      proteinProgress,
      fiberProgress,
      calorieProgress,
      hasBreakfast,
      hasLunch,
      hasDinner,
      totalMoodsToday,
      lowMoodsToday,
      moodDowntrend: hasThreeDayMoodDowntrend,
      hydrationMissDays,
    },
  }
}

function ratio(value: unknown, target: unknown) {
  const v = Number(value)
  const t = Number(target)
  if (!Number.isFinite(v) || !Number.isFinite(t) || t <= 0) return 0
  return v / t
}

function toPct(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0%'
  return `${Math.round(value * 100)}%`
}

function parseMinutes(value: string) {
  const match = String(value || '').trim().match(/^(\d{2}):(\d{2})$/)
  if (!match) return null
  const hh = Number(match[1])
  const mm = Number(match[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function normalizeTime(value: string | undefined, fallback: string) {
  const s = String(value || '').trim()
  const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (!m) return fallback
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

function getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
  try {
    const dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const parts = dtf.formatToParts(date)
    const year = Number(parts.find((p) => p.type === 'year')?.value || 0)
    const month = Number(parts.find((p) => p.type === 'month')?.value || 1)
    const day = Number(parts.find((p) => p.type === 'day')?.value || 1)
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0)
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0)
    const second = Number(parts.find((p) => p.type === 'second')?.value || 0)
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, second)
    return Math.round((utcMs - date.getTime()) / 60000)
  } catch {
    return 0
  }
}

function shiftDateString(dateStr: string, deltaDays: number) {
  const [y, m, d] = String(dateStr || '').split('-').map((v) => Number(v))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return dateStr
  }
  const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
  date.setUTCDate(date.getUTCDate() + deltaDays)
  const yy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function resolveHydrationTargetMl(user: {
  weight: number | null
  height: number | null
  gender: string | null
  bodyType: string | null
  exerciseFrequency: string | null
  healthGoals: Array<{ name: string; category: string }>
}) {
  const read = (name: string) => {
    const found = user.healthGoals.find((goal) => goal.name === name)
    if (!found?.category) return null
    try {
      return JSON.parse(found.category)
    } catch {
      return null
    }
  }

  const hydrationStored = read('__HYDRATION_GOAL__')
  const storedTarget = Number(hydrationStored?.targetMl)
  if (Number.isFinite(storedTarget) && storedTarget > 0) {
    return Math.round(storedTarget)
  }

  const primaryGoal = read('__PRIMARY_GOAL__') || {}
  const profileInfo = read('__PROFILE_INFO_DATA__') || {}
  const dietPref = read('__DIET_PREFERENCE__') || {}
  const allergyData = read('__ALLERGIES_DATA__') || {}

  const dietTypesRaw = Array.isArray(dietPref?.dietTypes)
    ? dietPref.dietTypes
    : typeof dietPref?.dietType === 'string'
    ? [dietPref.dietType]
    : []

  const computed = computeHydrationGoal({
    weightKg: typeof user.weight === 'number' ? user.weight : null,
    heightCm: typeof user.height === 'number' ? user.height : null,
    gender: user.gender,
    bodyType: user.bodyType,
    exerciseFrequency: user.exerciseFrequency,
    exerciseTypes: [],
    dietTypes: dietTypesRaw.map((v: unknown) => String(v || '')).filter(Boolean),
    diabetesType: typeof allergyData?.diabetesType === 'string' ? allergyData.diabetesType : null,
    goalChoice: typeof primaryGoal?.goalChoice === 'string' ? primaryGoal.goalChoice : null,
    goalIntensity: typeof primaryGoal?.goalIntensity === 'string' ? primaryGoal.goalIntensity : null,
    birthdate: typeof profileInfo?.dateOfBirth === 'string' ? profileInfo.dateOfBirth : null,
  })

  return Math.round(computed.targetMl || 2300)
}
