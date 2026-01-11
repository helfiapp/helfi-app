import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import OpenAI from 'openai'
import crypto from 'crypto'
import { CreditManager } from '@/lib/credit-system'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { capMaxTokensToBudget } from '@/lib/cost-meter'
import { scheduleHealthTipWithQStash } from '@/lib/qstash'
import { logAIUsage } from '@/lib/ai-usage-logger'
import { dedupeSubscriptions, normalizeSubscriptionList, removeSubscriptionsByEndpoint, sendToSubscriptions } from '@/lib/push-subscriptions'
import { isSchedulerAuthorized } from '@/lib/scheduler-auth'
import { createInboxNotification } from '@/lib/notification-inbox'
import { buildTipPrompt, buildUserHealthContext, ensureHealthTipTables, extractTipJson } from '@/lib/health-tips'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DispatchPayload = {
  userId: string
  reminderTime: string // "HH:MM"
  timezone: string
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}
// helpers moved to lib/health-tips.ts

export async function POST(req: NextRequest) {
  let claimedDelivery = false
  let releaseDelivery: (() => Promise<void>) | null = null

  try {
    if (!isSchedulerAuthorized(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as Partial<DispatchPayload>
    const userId = String(body.userId || '')
    const reminderTime = String(body.reminderTime || '')
    const timezone = String(body.timezone || '')

    if (!userId || !reminderTime || !timezone) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    await ensureHealthTipTables()

    const [subscriptionRows, settingsRows] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ subscription: any }>>(
        `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
        userId
      ),
      prisma.$queryRawUnsafe<
        Array<{
          enabled: boolean
          time1: string
          time2: string
          time3: string
          timezone: string
          frequency: number | null
          focusFood: boolean | null
          focusSupplements: boolean | null
          focusLifestyle: boolean | null
        }>
      >(
        `SELECT enabled, time1, time2, time3, timezone, frequency, focusFood, focusSupplements, focusLifestyle
         FROM HealthTipSettings
         WHERE userId = $1`,
        userId
      ),
    ])

    if (!subscriptionRows.length) {
      // No subscription yet – nothing to deliver, but still attempt to schedule the next one
      await scheduleHealthTipWithQStash(userId, reminderTime, timezone).catch(() => {})
      return NextResponse.json({ skipped: 'no_subscription' })
    }
    let subscriptions = dedupeSubscriptions(normalizeSubscriptionList(subscriptionRows[0].subscription))
    if (!subscriptions.length) {
      await scheduleHealthTipWithQStash(userId, reminderTime, timezone).catch(() => {})
      return NextResponse.json({ skipped: 'no_subscription' })
    }

    const settings = settingsRows[0]
    if (!settings || !settings.enabled) {
      // User turned health tips off – do not schedule further jobs
      return NextResponse.json({ skipped: 'disabled' })
    }

    const resolvedFrequency = Math.max(1, Math.min(3, settings.frequency ?? 1))
    const activeTimes: string[] = []
    if (resolvedFrequency >= 1 && settings.time1) activeTimes.push(settings.time1)
    if (resolvedFrequency >= 2 && settings.time2) activeTimes.push(settings.time2)
    if (resolvedFrequency >= 3 && settings.time3) activeTimes.push(settings.time3)

    const timezoneStillMatches = settings.timezone === timezone
    const reminderStillActive = activeTimes.includes(reminderTime)

    if (!reminderStillActive || !timezoneStillMatches) {
      // Stale schedule – reschedule based on latest settings and exit
      try {
        const reschedules = await Promise.all(
          activeTimes.map((t) =>
            scheduleHealthTipWithQStash(userId, t, settings.timezone)
          )
        )
        console.log('[HEALTH_TIPS] Rescheduled after stale payload', {
          userId,
          reminderTime,
          timezone,
          activeTimes,
          reschedules,
        })
      } catch (err) {
        console.error('[HEALTH_TIPS] Failed to reschedule after stale payload', err)
      }
      return NextResponse.json({ skipped: 'stale_schedule' })
    }

    const effectiveTimezone = settings.timezone || timezone || 'UTC'
    const now = new Date()
    const localDateParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: effectiveTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const localDateString = `${localDateParts.find((p) => p.type === 'year')?.value}-${localDateParts
      .find((p) => p.type === 'month')
      ?.value}-${localDateParts.find((p) => p.type === 'day')?.value}`

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true, creditTopUps: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
    }

    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({ error: 'openai_not_configured' }, { status: 500 })
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
    const privateKey = process.env.VAPID_PRIVATE_KEY || ''
    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'vapid_not_configured' }, { status: 500 })
    }
    webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

    releaseDelivery = async () => {
      if (!claimedDelivery) return
      await prisma.$executeRawUnsafe(
        `DELETE FROM HealthTipDeliveryLog WHERE userId = $1 AND reminderTime = $2 AND tipDate = $3::date`,
        userId,
        reminderTime,
        localDateString
      ).catch(() => {})
      claimedDelivery = false
    }

    const claim: Array<{ userId: string }> = await prisma.$queryRawUnsafe(
      `INSERT INTO HealthTipDeliveryLog (userId, reminderTime, tipDate, sentAt)
       VALUES ($1, $2, $3::date, NOW())
       ON CONFLICT (userId, reminderTime, tipDate) DO NOTHING
       RETURNING userId`,
      userId,
      reminderTime,
      localDateString
    )
    if (!claim.length) {
      return NextResponse.json({ skipped: 'already_sent' })
    }
    claimedDelivery = true

    // Build health context for this user
    const context = await buildUserHealthContext(userId)

    // Create a light human description of the local time (morning/afternoon/evening)
    const [hhStr, mmStr] = reminderTime.split(':')
    const hh = parseInt(hhStr || '0', 10)
    const approxSlot =
      hh < 11 ? 'morning' : hh < 15 ? 'around lunchtime' : hh < 19 ? 'afternoon' : 'evening'
    const localTimeDescription = `${reminderTime} in their local timezone (${approxSlot})`

    const model = 'gpt-5.2'
    const prompt = buildTipPrompt({
      context,
      localTimeDescription,
      focusFood: settings.focusFood !== false,
      focusSupplements: settings.focusSupplements !== false,
      focusLifestyle: settings.focusLifestyle !== false,
    })
    const messages = [
      {
        role: 'user' as const,
        content: prompt,
      },
    ]

    // Wallet pre-check using a budget-aware max token cap
    const creditManager = new CreditManager(user.id)
    const walletStatus = await creditManager.getWalletStatus()

    let maxTokens = 800
    const cappedMaxTokens = capMaxTokensToBudget(model, prompt, maxTokens, walletStatus.totalAvailableCents)
    if (cappedMaxTokens <= 0) {
      // Not enough credits – send a gentle notification that links to billing instead of a tip
    const payload = JSON.stringify({
        title: 'Top up credits to keep AI health tips coming',
        body: 'We could not send today’s health tip because your credits are low. Tap to add more credits or upgrade your plan.',
        url: '/billing',
      })
      const lowCreditSend = await sendToSubscriptions(subscriptions, (sub) =>
        webpush.sendNotification(sub, payload)
      )
      if (lowCreditSend.goneEndpoints.length) {
        subscriptions = removeSubscriptionsByEndpoint(subscriptions, lowCreditSend.goneEndpoints)
        await prisma.$executeRawUnsafe(
          `UPDATE PushSubscriptions SET subscription = $2::jsonb, updatedAt = NOW() WHERE userId = $1`,
          userId,
          JSON.stringify(subscriptions)
        )
      }
      if (!lowCreditSend.sent) {
        console.error('[HEALTH_TIPS] Low-credit notification send error', lowCreditSend.errors)
      }
      if (lowCreditSend.sent) {
        await createInboxNotification({
          userId,
          title: 'Top up credits to keep AI health tips coming',
          body: 'We could not send today’s health tip because your credits are low. Tap to add more credits or upgrade your plan.',
          url: '/billing',
          type: 'health_tip_low_credit',
          source: 'push',
          eventKey: `health_tip_low_credit:${localDateString}:${reminderTime}`,
        }).catch(() => {})
      }

      // Still schedule the next attempt for tomorrow at the same time
      await scheduleHealthTipWithQStash(userId, reminderTime, effectiveTimezone).catch(
        (error) => {
          console.error('[HEALTH_TIPS] Failed to schedule next tip after low credits', error)
        }
      )

      return NextResponse.json({ skipped: 'insufficient_credits' })
    }
    maxTokens = cappedMaxTokens

    // Generate the health tip with OpenAI
    const wrapped = await chatCompletionWithCost(openai, {
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.4,
    } as any)

    const rawContent = wrapped.completion.choices?.[0]?.message?.content || ''
    const parsed = extractTipJson(rawContent)

    if (!parsed || !parsed.title || !parsed.tip) {
      console.error('[HEALTH_TIPS] Failed to parse tip JSON', rawContent)
      if (releaseDelivery) {
        await releaseDelivery()
      }
      return NextResponse.json({ error: 'tip_generation_failed' }, { status: 500 })
    }

    const category =
      parsed.category === 'supplement' || parsed.category === 'lifestyle'
        ? parsed.category
        : 'food'

    const safeTip = String(parsed.tip).trim()
    const safetyNote = String(parsed.safetyNote || '').trim()
    const fullBody =
      safetyNote && safetyNote.length > 0 ? `${safeTip} ${safetyNote}` : safeTip

    // costCents already includes the global markup (default 2x OpenAI cost).
    // Charge the user exactly that amount—do not double again.
    const costCents = wrapped.costCents
    const chargeCents = costCents

    const suggestedQuestions =
      Array.isArray(parsed.suggestedQuestions) && parsed.suggestedQuestions.length > 0
        ? parsed.suggestedQuestions
            .filter((q) => typeof q === 'string' && q.trim().length > 0)
            .slice(0, 4)
        : []

    // Charge the user in credits for this tip
    const chargedOk = await creditManager.chargeCents(chargeCents)
    if (!chargedOk) {
      if (releaseDelivery) {
        await releaseDelivery()
      }
      return NextResponse.json({ error: 'billing_failed' }, { status: 402 })
    }

    const tipId = crypto.randomUUID()

    await prisma.$executeRawUnsafe(
      `INSERT INTO HealthTips (id, userId, tipDate, sentAt, title, body, category, metadata, costCents, chargeCents)
       VALUES ($1,$2,$3::date,NOW(),$4,$5,$6,$7::jsonb,$8,$9)`,
      tipId,
      userId,
      localDateString,
      parsed.title.substring(0, 140),
      fullBody,
      category,
      JSON.stringify({ rawContent, suggestedQuestions }).slice(0, 10000),
      costCents,
      chargeCents
    )

    const notificationBody = safeTip.length > 120 ? `${safeTip.slice(0, 117)}…` : safeTip

    const payload = JSON.stringify({
      title: parsed.title.substring(0, 80),
      body: notificationBody,
      url: '/health-tips',
    })

    const tipSend = await sendToSubscriptions(subscriptions, (sub) => webpush.sendNotification(sub, payload))
    if (tipSend.goneEndpoints.length) {
      subscriptions = removeSubscriptionsByEndpoint(subscriptions, tipSend.goneEndpoints)
      await prisma.$executeRawUnsafe(
        `UPDATE PushSubscriptions SET subscription = $2::jsonb, updatedAt = NOW() WHERE userId = $1`,
        userId,
        JSON.stringify(subscriptions)
      )
    }
    if (!tipSend.sent) {
      console.error('[HEALTH_TIPS] Notification send error', tipSend.errors)
    }
    if (tipSend.sent) {
      await createInboxNotification({
        userId,
        title: parsed.title.substring(0, 80),
        body: notificationBody,
        url: '/health-tips',
        type: 'health_tip',
        source: 'push',
        eventKey: `health_tip:${localDateString}:${reminderTime}`,
        metadata: { tipId, category },
      }).catch(() => {})
    }

    // Schedule the next tip for this time tomorrow
    await scheduleHealthTipWithQStash(userId, reminderTime, effectiveTimezone).catch(
      (error) => {
        console.error('[HEALTH_TIPS] Failed to schedule next tip via QStash', error)
      }
    )

    // Log AI usage for health tip generation (fire-and-forget)
    try {
      await logAIUsage({
        context: { feature: 'health-tips:dispatch', userId },
        model,
        promptTokens: wrapped.promptTokens,
        completionTokens: wrapped.completionTokens,
        costCents,
      })
    } catch {
      // Logging issues should not affect tip delivery
    }

    return NextResponse.json({
      ok: true,
      tipId,
      costCents,
      chargeCents,
    })
  } catch (e: any) {
    if (releaseDelivery) {
      await releaseDelivery()
    }
    console.error('[HEALTH_TIPS_DISPATCH] error', e?.stack || e)
    return NextResponse.json(
      { error: 'health_tip_dispatch_error', message: e?.message || String(e) },
      { status: 500 }
    )
  }
}
