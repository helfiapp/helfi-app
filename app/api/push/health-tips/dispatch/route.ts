import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import crypto from 'crypto'
import { CreditManager } from '@/lib/credit-system'
import { scheduleHealthTipWithQStash } from '@/lib/qstash'
import {
  dedupeSubscriptions,
  normalizeSubscriptionList,
  removeSubscriptionsByEndpoint,
  sendToSubscriptions,
} from '@/lib/push-subscriptions'
import { createInboxNotification } from '@/lib/notification-inbox'
import { ensureHealthTipTables } from '@/lib/health-tips'
import { isSchedulerAuthorized } from '@/lib/scheduler-auth'
import {
  SMART_COACH_ALERT_COST_CREDITS,
  SMART_COACH_AUTO_CHECK_TIMES,
  SMART_COACH_CATEGORY_COOLDOWN_MINUTES,
  SMART_COACH_DAILY_CAP_CREDITS,
  SMART_COACH_DAILY_MAX_ALERTS,
  SMART_COACH_GLOBAL_COOLDOWN_MINUTES,
  SMART_COACH_MESSAGE_COOLDOWN_MINUTES,
  SMART_COACH_RULE_COOLDOWN_MINUTES,
  ensureSmartCoachTables,
  evaluateSmartCoachRule,
  getLocalDateTime,
  getSmartCoachQuietHours,
  isWithinQuietHours,
  logSmartCoachDecision,
  type SmartCoachBlockReason,
} from '@/lib/smart-health-coach'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DispatchPayload = {
  userId: string
  reminderTime: string
  timezone: string
}

function getPushKeys() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || ''
  return { publicKey, privateKey, hasKeys: !!publicKey && !!privateKey }
}

async function scheduleNextReminder(userId: string, reminderTime: string, timezone: string) {
  await scheduleHealthTipWithQStash(userId, reminderTime, timezone).catch((error) => {
    console.error('[SMART_COACH] Failed to schedule next run', error)
  })
}

async function claimDispatchWindow(params: {
  userId: string
  localDate: string
  reminderTime: string
}) {
  await prisma.$executeRawUnsafe(
    `DELETE FROM HealthCoachDispatchLock WHERE createdAt < NOW() - INTERVAL '3 days'`
  ).catch(() => {})

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO HealthCoachDispatchLock (id, userId, localDate, reminderTime)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (userId, localDate, reminderTime) DO NOTHING
     RETURNING id`,
    crypto.randomUUID(),
    params.userId,
    params.localDate,
    params.reminderTime
  )

  return rows.length > 0
}

async function pushIfPossible(
  subscriptions: any[],
  payload: string,
  userId: string,
  hasKeys: boolean,
  publicKey: string,
  privateKey: string
) {
  if (!hasKeys || !subscriptions.length) {
    return {
      sent: false,
      subscriptions,
    }
  }

  webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)
  const sendResult = await sendToSubscriptions(subscriptions, (sub) =>
    webpush.sendNotification(sub, payload)
  )
  let updated = subscriptions

  if (sendResult.goneEndpoints.length) {
    updated = removeSubscriptionsByEndpoint(updated, sendResult.goneEndpoints)
    await prisma.$executeRawUnsafe(
      `UPDATE PushSubscriptions SET subscription = $2::jsonb, updatedAt = NOW() WHERE userId = $1`,
      userId,
      JSON.stringify(updated)
    ).catch(() => {})
  }

  return {
    sent: !!sendResult.sent,
    subscriptions: updated,
  }
}

async function sendCapReachedNotice(args: {
  userId: string
  localDate: string
  subscriptions: any[]
  hasKeys: boolean
  publicKey: string
  privateKey: string
}) {
  const title = 'Smart Health Coach: daily limit reached'
  const body = 'Daily coach limit reached. New alerts will resume tomorrow.'
  const url = '/health-tips'
  const eventKey = `smart_health_coach_cap:${args.localDate}`

  await createInboxNotification({
    userId: args.userId,
    title,
    body,
    url,
    type: 'smart_health_coach_info',
    source: 'push',
    eventKey,
    metadata: { kind: 'daily_cap' },
  }).catch(() => {})

  const payload = JSON.stringify({ title, body, url })
  await pushIfPossible(
    args.subscriptions,
    payload,
    args.userId,
    args.hasKeys,
    args.publicKey,
    args.privateKey
  ).catch(() => {})
}

async function sendLowCreditsNotice(args: {
  userId: string
  localDate: string
  subscriptions: any[]
  hasKeys: boolean
  publicKey: string
  privateKey: string
}) {
  const title = 'Smart Health Coach: top up needed'
  const body = 'You do not have enough credits for Smart Health Coach alerts right now.'
  const url = '/billing'
  const eventKey = `smart_health_coach_low_credit:${args.localDate}`

  await createInboxNotification({
    userId: args.userId,
    title,
    body,
    url,
    type: 'smart_health_coach_low_credit',
    source: 'push',
    eventKey,
    metadata: { kind: 'low_credit' },
  }).catch(() => {})

  const payload = JSON.stringify({ title, body, url })
  await pushIfPossible(
    args.subscriptions,
    payload,
    args.userId,
    args.hasKeys,
    args.publicKey,
    args.privateKey
  ).catch(() => {})
}

export async function POST(req: NextRequest) {
  const now = new Date()

  try {
    if (!isSchedulerAuthorized(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as Partial<DispatchPayload>
    const userId = String(body.userId || '')
    const reminderTime = String(body.reminderTime || '')
    const fallbackTimezone = String(body.timezone || 'UTC')

    if (!userId || !reminderTime) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    await ensureHealthTipTables()
    await ensureSmartCoachTables()

    const [settingsRows, subscriptionRows] = await Promise.all([
      prisma.$queryRawUnsafe<
        Array<{
          enabled: boolean
          timezone: string
        }>
      >(
        `SELECT enabled, timezone
         FROM HealthTipSettings
         WHERE userId = $1`,
        userId
      ),
      prisma.$queryRawUnsafe<Array<{ subscription: any }>>(
        `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
        userId
      ),
    ])

    const settings = settingsRows[0]
    if (!settings || !settings.enabled) {
      await logSmartCoachDecision({
        userId,
        ruleId: 'none',
        triggerResult: 'blocked',
        blockReason: 'disabled',
        creditsCharged: 0,
        metadata: { reminderTime },
      })
      return NextResponse.json({ skipped: 'disabled' })
    }

    const activeTimes: string[] = [...SMART_COACH_AUTO_CHECK_TIMES]

    const effectiveTimezone = settings.timezone || fallbackTimezone || 'UTC'
    const local = getLocalDateTime(effectiveTimezone, now)
    const claimedDispatchWindow = await claimDispatchWindow({
      userId,
      localDate: local.localDate,
      reminderTime,
    })
    if (!claimedDispatchWindow) {
      await logSmartCoachDecision({
        userId,
        ruleId: 'none',
        triggerResult: 'blocked',
        blockReason: 'already_sent',
        creditsCharged: 0,
        metadata: {
          reason: 'duplicate_dispatch_window',
          localDate: local.localDate,
          reminderTime,
          timezone: effectiveTimezone,
        },
      })
      return NextResponse.json({ skipped: 'already_sent' })
    }

    const reminderStillActive = activeTimes.includes(reminderTime)
    const timezoneStillMatches = effectiveTimezone === fallbackTimezone || !fallbackTimezone

    if (!reminderStillActive || !timezoneStillMatches) {
      try {
        await Promise.all(
          activeTimes.map((time) => scheduleHealthTipWithQStash(userId, time, effectiveTimezone))
        )
      } catch (error) {
        console.error('[SMART_COACH] Failed stale schedule resync', error)
      }

      await logSmartCoachDecision({
        userId,
        ruleId: 'none',
        triggerResult: 'blocked',
        blockReason: 'stale_schedule',
        creditsCharged: 0,
        metadata: { reminderTime, timezone: fallbackTimezone, activeTimes, effectiveTimezone },
      })
      return NextResponse.json({ skipped: 'stale_schedule' })
    }

    const quietHours = await getSmartCoachQuietHours(userId)

    if (quietHours.enabled) {
      const localTimeForQuiet = getLocalDateTime(
        quietHours.timezone || effectiveTimezone,
        now
      ).localTime
      const inQuietHours = isWithinQuietHours(
        localTimeForQuiet,
        quietHours.startTime,
        quietHours.endTime
      )
      if (inQuietHours) {
        await logSmartCoachDecision({
          userId,
          ruleId: 'none',
          triggerResult: 'blocked',
          blockReason: 'quiet_hours',
          creditsCharged: 0,
          metadata: {
            localTime: localTimeForQuiet,
            start: quietHours.startTime,
            end: quietHours.endTime,
            timezone: quietHours.timezone || effectiveTimezone,
          },
        })
        await scheduleNextReminder(userId, reminderTime, effectiveTimezone)
        return NextResponse.json({ skipped: 'quiet_hours' })
      }
    }

    const evaluation = await evaluateSmartCoachRule({
      userId,
      timezone: effectiveTimezone,
      now,
    })

    if (!evaluation.rule) {
      await logSmartCoachDecision({
        userId,
        ruleId: 'none',
        triggerResult: 'blocked',
        blockReason: 'no_rule',
        creditsCharged: 0,
        metadata: evaluation.metrics,
      })
      await scheduleNextReminder(userId, reminderTime, effectiveTimezone)
      return NextResponse.json({ skipped: 'no_rule' })
    }

    const dailySummaryRows = await prisma.$queryRawUnsafe<
      Array<{ sentcount: string; chargedcredits: string }>
    >(
      `SELECT
         COUNT(*)::text AS sentCount,
         COALESCE(SUM(COALESCE(chargeCents, 0)), 0)::text AS chargedCredits
       FROM HealthTips
       WHERE userId = $1
         AND tipDate = $2::date
         AND category = 'smart_health_coach'`,
      userId,
      evaluation.localDate
    )
    const sentCount = parseInt(dailySummaryRows[0]?.sentcount || '0', 10) || 0
    const chargedCredits = parseInt(dailySummaryRows[0]?.chargedcredits || '0', 10) || 0

    const subscriptions = dedupeSubscriptions(
      normalizeSubscriptionList(subscriptionRows[0]?.subscription)
    )
    const { publicKey, privateKey, hasKeys } = getPushKeys()

    if (
      sentCount >= SMART_COACH_DAILY_MAX_ALERTS ||
      chargedCredits >= SMART_COACH_DAILY_CAP_CREDITS
    ) {
      await sendCapReachedNotice({
        userId,
        localDate: evaluation.localDate,
        subscriptions,
        hasKeys,
        publicKey,
        privateKey,
      })
      await logSmartCoachDecision({
        userId,
        ruleId: evaluation.rule.ruleId,
        triggerResult: 'blocked',
        blockReason: 'daily_cap',
        creditsCharged: 0,
        metadata: {
          sentCount,
          chargedCredits,
          limitAlerts: SMART_COACH_DAILY_MAX_ALERTS,
          limitCredits: SMART_COACH_DAILY_CAP_CREDITS,
          ...evaluation.metrics,
        },
      })
      await scheduleNextReminder(userId, reminderTime, effectiveTimezone)
      return NextResponse.json({ skipped: 'daily_cap' })
    }

    const globalCooldownRows = await prisma.$queryRawUnsafe<Array<{ tipid: string }>>(
      `SELECT id AS tipId
       FROM HealthTips
       WHERE userId = $1
         AND category = 'smart_health_coach'
         AND sentAt >= NOW() - ($2 * INTERVAL '1 minute')
       ORDER BY sentAt DESC
       LIMIT 1`,
      userId,
      SMART_COACH_GLOBAL_COOLDOWN_MINUTES
    )
    if (globalCooldownRows.length > 0) {
      await logSmartCoachDecision({
        userId,
        ruleId: evaluation.rule.ruleId,
        triggerResult: 'blocked',
        blockReason: 'global_cooldown',
        creditsCharged: 0,
        metadata: {
          cooldownMinutes: SMART_COACH_GLOBAL_COOLDOWN_MINUTES,
          ...evaluation.metrics,
        },
      })
      await scheduleNextReminder(userId, reminderTime, effectiveTimezone)
      return NextResponse.json({ skipped: 'global_cooldown' })
    }

    const ruleCooldownRows = await prisma.$queryRawUnsafe<Array<{ tipid: string }>>(
      `SELECT id AS tipId
       FROM HealthTips
       WHERE userId = $1
         AND category = 'smart_health_coach'
         AND metadata->>'ruleId' = $2
         AND sentAt >= NOW() - ($3 * INTERVAL '1 minute')
       ORDER BY sentAt DESC
       LIMIT 1`,
      userId,
      evaluation.rule.ruleId,
      SMART_COACH_RULE_COOLDOWN_MINUTES
    )
    if (ruleCooldownRows.length > 0) {
      await logSmartCoachDecision({
        userId,
        ruleId: evaluation.rule.ruleId,
        triggerResult: 'blocked',
        blockReason: 'rule_cooldown',
        creditsCharged: 0,
        metadata: {
          cooldownMinutes: SMART_COACH_RULE_COOLDOWN_MINUTES,
          ...evaluation.metrics,
        },
      })
      await scheduleNextReminder(userId, reminderTime, effectiveTimezone)
      return NextResponse.json({ skipped: 'rule_cooldown' })
    }

    const categoryCooldownRows = await prisma.$queryRawUnsafe<Array<{ tipid: string }>>(
      `SELECT id AS tipId
       FROM HealthTips
       WHERE userId = $1
         AND category = 'smart_health_coach'
         AND metadata->>'category' = $2
         AND sentAt >= NOW() - ($3 * INTERVAL '1 minute')
       ORDER BY sentAt DESC
       LIMIT 1`,
      userId,
      evaluation.rule.category,
      SMART_COACH_CATEGORY_COOLDOWN_MINUTES
    )
    if (categoryCooldownRows.length > 0) {
      await logSmartCoachDecision({
        userId,
        ruleId: evaluation.rule.ruleId,
        triggerResult: 'blocked',
        blockReason: 'category_cooldown',
        creditsCharged: 0,
        metadata: {
          category: evaluation.rule.category,
          cooldownMinutes: SMART_COACH_CATEGORY_COOLDOWN_MINUTES,
          ...evaluation.metrics,
        },
      })
      await scheduleNextReminder(userId, reminderTime, effectiveTimezone)
      return NextResponse.json({ skipped: 'category_cooldown' })
    }

    const messageCooldownRows = await prisma.$queryRawUnsafe<Array<{ tipid: string }>>(
      `SELECT id AS tipId
       FROM HealthTips
       WHERE userId = $1
         AND category = 'smart_health_coach'
         AND title = $2
         AND body = $3
         AND sentAt >= NOW() - ($4 * INTERVAL '1 minute')
       ORDER BY sentAt DESC
       LIMIT 1`,
      userId,
      evaluation.rule.title,
      evaluation.rule.body,
      SMART_COACH_MESSAGE_COOLDOWN_MINUTES
    )
    if (messageCooldownRows.length > 0) {
      await logSmartCoachDecision({
        userId,
        ruleId: evaluation.rule.ruleId,
        triggerResult: 'blocked',
        blockReason: 'message_cooldown',
        creditsCharged: 0,
        metadata: {
          cooldownMinutes: SMART_COACH_MESSAGE_COOLDOWN_MINUTES,
          ...evaluation.metrics,
        },
      })
      await scheduleNextReminder(userId, reminderTime, effectiveTimezone)
      return NextResponse.json({ skipped: 'message_cooldown' })
    }

    const creditManager = new CreditManager(userId)
    const wallet = await creditManager.getWalletStatus()
    if ((wallet.totalAvailableCents || 0) < SMART_COACH_ALERT_COST_CREDITS) {
      await sendLowCreditsNotice({
        userId,
        localDate: evaluation.localDate,
        subscriptions,
        hasKeys,
        publicKey,
        privateKey,
      })
      await logSmartCoachDecision({
        userId,
        ruleId: evaluation.rule.ruleId,
        triggerResult: 'blocked',
        blockReason: 'insufficient_credits',
        creditsCharged: 0,
        metadata: { walletTotal: wallet.totalAvailableCents, ...evaluation.metrics },
      })
      await scheduleNextReminder(userId, reminderTime, effectiveTimezone)
      return NextResponse.json({ skipped: 'insufficient_credits' })
    }

    const charged = await creditManager.chargeCents(SMART_COACH_ALERT_COST_CREDITS)
    if (!charged) {
      await logSmartCoachDecision({
        userId,
        ruleId: evaluation.rule.ruleId,
        triggerResult: 'blocked',
        blockReason: 'billing_failed',
        creditsCharged: 0,
        metadata: evaluation.metrics,
      })
      await scheduleNextReminder(userId, reminderTime, effectiveTimezone)
      return NextResponse.json({ skipped: 'billing_failed' }, { status: 402 })
    }

    const eventKey = `smart_health_coach:${evaluation.localDate}:${evaluation.rule.ruleId}:${Math.floor(
      now.getTime() / (60 * 60 * 1000)
    )}`

    const notificationPayload = JSON.stringify({
      title: evaluation.rule.title,
      body: evaluation.rule.body,
      url: evaluation.rule.url,
    })

    const pushResult = await pushIfPossible(
      subscriptions,
      notificationPayload,
      userId,
      hasKeys,
      publicKey,
      privateKey
    )

    const notificationId = await createInboxNotification({
      userId,
      title: evaluation.rule.title,
      body: evaluation.rule.body,
      url: evaluation.rule.url,
      type: 'smart_health_coach_alert',
      source: 'push',
      eventKey,
      metadata: {
        ruleId: evaluation.rule.ruleId,
        category: evaluation.rule.category,
        localDate: evaluation.localDate,
        localTime: evaluation.localTime,
      },
    }).catch(() => null)

    const tipId = crypto.randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO HealthTips (
        id, userId, tipDate, sentAt, title, body, category, metadata, costCents, chargeCents
      )
      VALUES ($1,$2,$3::date,NOW(),$4,$5,$6,$7::jsonb,$8,$9)`,
      tipId,
      userId,
      evaluation.localDate,
      evaluation.rule.title.slice(0, 140),
      evaluation.rule.body,
      'smart_health_coach',
      JSON.stringify({
        ruleId: evaluation.rule.ruleId,
        category: evaluation.rule.category,
        why: evaluation.rule.why,
        notificationId,
        eventKey,
        pushDelivered: pushResult.sent,
        localTime: evaluation.localTime,
      }).slice(0, 10000),
      SMART_COACH_ALERT_COST_CREDITS,
      SMART_COACH_ALERT_COST_CREDITS
    )

    await logSmartCoachDecision({
      userId,
      ruleId: evaluation.rule.ruleId,
      triggerResult: 'sent',
      blockReason: 'none',
      creditsCharged: SMART_COACH_ALERT_COST_CREDITS,
      notificationId,
      metadata: {
        ...evaluation.metrics,
        localDate: evaluation.localDate,
        localTime: evaluation.localTime,
        timezone: evaluation.timezone,
      },
    })

    await scheduleNextReminder(userId, reminderTime, effectiveTimezone)

    return NextResponse.json({
      ok: true,
      ruleId: evaluation.rule.ruleId,
      tipId,
      creditsCharged: SMART_COACH_ALERT_COST_CREDITS,
      notificationId,
      localDate: local.localDate,
      localTime: local.localTime,
    })
  } catch (error: any) {
    console.error('[SMART_COACH_DISPATCH] error', error?.stack || error)
    const blockReason: SmartCoachBlockReason = 'unknown'
    const body = (await req.json().catch(() => ({}))) as Partial<DispatchPayload>
    const userId = String(body?.userId || '')
    if (userId) {
      await logSmartCoachDecision({
        userId,
        ruleId: 'none',
        triggerResult: 'blocked',
        blockReason,
        creditsCharged: 0,
        metadata: { message: error?.message || String(error) },
      })
    }
    return NextResponse.json(
      { error: 'smart_coach_dispatch_error', message: error?.message || String(error) },
      { status: 500 }
    )
  }
}
