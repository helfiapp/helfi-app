import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import OpenAI from 'openai'
import crypto from 'crypto'
import { CreditManager } from '@/lib/credit-system'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { costCentsEstimateFromText } from '@/lib/cost-meter'
import { scheduleHealthTipWithQStash } from '@/lib/qstash'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DispatchPayload = {
  userId: string
  reminderTime: string // "HH:MM"
  timezone: string
}

const CHECKIN_LABELS = [
  'Really bad',
  'Bad',
  'Below average',
  'Average',
  'Above average',
  'Good',
  'Excellent',
] as const

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

async function ensureTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS PushSubscriptions (
      userId TEXT PRIMARY KEY,
      subscription JSONB NOT NULL
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS HealthTipSettings (
      userId TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT true,
      time1 TEXT NOT NULL,
      time2 TEXT NOT NULL,
      time3 TEXT NOT NULL,
      timezone TEXT NOT NULL,
      frequency INTEGER NOT NULL DEFAULT 1,
      focusFood BOOLEAN NOT NULL DEFAULT true,
      focusSupplements BOOLEAN NOT NULL DEFAULT true,
      focusLifestyle BOOLEAN NOT NULL DEFAULT true
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS HealthTips (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      tipDate DATE NOT NULL,
      sentAt TIMESTAMP NOT NULL DEFAULT NOW(),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL,
      metadata JSONB,
      costCents INTEGER,
      chargeCents INTEGER
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS HealthTipDeliveryLog (
      userId TEXT NOT NULL,
      reminderTime TEXT NOT NULL,
      tipDate DATE NOT NULL,
      sentAt TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (userId, reminderTime, tipDate)
    )
  `)
}

async function buildUserHealthContext(userId: string) {
  // Ensure FoodLog has the lightweight 'items' column used by the Prisma client.
  // This mirrors the standalone migration 20251115120000_add_foodlog_items but runs defensively
  // so we don't depend on manual migration runs in production.
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "FoodLog" ADD COLUMN IF NOT EXISTS "items" JSONB`
    )
  } catch (e) {
    console.error('[HEALTH_TIPS] Failed to ensure FoodLog.items column', e)
  }

  // Health situations and selected issues
  const [healthSituationsGoal, selectedIssuesGoal, supplements, medications, recentFoodLogs] =
    await Promise.all([
      prisma.healthGoal.findFirst({
        where: { userId, name: '__HEALTH_SITUATIONS_DATA__' },
      }),
      prisma.healthGoal.findFirst({
        where: { userId, name: '__SELECTED_ISSUES__' },
      }),
      prisma.supplement.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.medication.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.foodLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ])

  let healthData: {
    healthIssues?: string
    healthProblems?: string
    additionalInfo?: string
  } | null = null
  let selectedHealthGoals: string[] = []

  if (healthSituationsGoal?.category) {
    try {
      const parsed = JSON.parse(healthSituationsGoal.category as any)
      healthData = {
        healthIssues: parsed.healthIssues || '',
        healthProblems: parsed.healthProblems || '',
        additionalInfo: parsed.additionalInfo || '',
      }
    } catch {
      // ignore parse errors
    }
  }

  if (selectedIssuesGoal?.category) {
    try {
      const parsed = JSON.parse(selectedIssuesGoal.category as any)
      if (Array.isArray(parsed)) {
        selectedHealthGoals = parsed.map((name: any) => String(name || '').trim()).filter(Boolean)
      }
    } catch {
      // ignore parse errors
    }
  }

  // Recent check-in ratings (last 7 days)
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const startDate = weekAgo.toISOString().slice(0, 10)
  const endDate = now.toISOString().slice(0, 10)

  // Ensure Checkin tables exist before querying (mirror /api/checkins/today)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CheckinIssues (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      polarity TEXT NOT NULL
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CheckinRatings (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      issueId TEXT NOT NULL,
      date TEXT NOT NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
      value INTEGER,
      note TEXT,
      isNa BOOLEAN DEFAULT false
    )
  `)

  const checkinRows: Array<{
    date: string
    issueId: string
    name: string
    polarity: string
    value: number | null
    note: string | null
  }> = await prisma.$queryRawUnsafe(
    `SELECT r.date, r.issueId, i.name, i.polarity, r.value, r.note
     FROM CheckinRatings r
     JOIN CheckinIssues i ON i.id = r.issueId
     WHERE r.userId = $1 AND r.date BETWEEN $2 AND $3
     ORDER BY r.date DESC, r.timestamp DESC`,
    userId,
    startDate,
    endDate
  )

  return {
    healthData,
    selectedHealthGoals,
    supplements,
    medications,
    recentFoodLogs,
    recentCheckins: checkinRows,
  }
}

function buildTipPrompt(args: {
  context: Awaited<ReturnType<typeof buildUserHealthContext>>
  localTimeDescription: string
  focusFood: boolean
  focusSupplements: boolean
  focusLifestyle: boolean
}) {
  const { context, localTimeDescription, focusFood, focusSupplements, focusLifestyle } = args
  const { healthData, selectedHealthGoals, supplements, medications, recentFoodLogs, recentCheckins } =
    context

  const lines: string[] = []

  if (healthData) {
    if (healthData.healthIssues?.trim()) {
      lines.push(`Current health issues: ${healthData.healthIssues.trim()}`)
    }
    if (healthData.healthProblems?.trim()) {
      lines.push(`Ongoing health problems: ${healthData.healthProblems.trim()}`)
    }
    if (healthData.additionalInfo?.trim()) {
      lines.push(`Additional health info: ${healthData.additionalInfo.trim()}`)
    }
  }

  if (selectedHealthGoals.length > 0) {
    lines.push(`Health goals/concerns being tracked: ${selectedHealthGoals.join(', ')}`)
  }

  if (supplements.length > 0) {
    const suppLines = supplements.slice(0, 8).map((s) => {
      const timingValue: any = (s as any).timing
      const timings = Array.isArray(timingValue)
        ? timingValue.map((t) => String(t)).join(', ')
        : timingValue
        ? String(timingValue)
        : ''
      return `- ${s.name} (${s.dosage || 'dose not specified'}) – timing: ${timings || 'not specified'}`
    })
    lines.push('Supplements currently taken:')
    lines.push(...suppLines)
  }

  if (medications.length > 0) {
    const medLines = medications.slice(0, 8).map((m) => {
      const timingValue: any = (m as any).timing
      const timings = Array.isArray(timingValue)
        ? timingValue.map((t) => String(t)).join(', ')
        : timingValue
        ? String(timingValue)
        : ''
      return `- ${m.name} (${m.dosage || 'dose not specified'}) – timing: ${timings || 'not specified'}`
    })
    lines.push('Medications currently taken:')
    lines.push(...medLines)
  }

  if (recentFoodLogs.length > 0) {
    const foodLines = recentFoodLogs.map((f) => {
      const when = f.createdAt.toISOString().slice(0, 16).replace('T', ' ')
      return `- [${when}] ${f.name}${f.description ? ` – ${f.description}` : ''}`
    })
    lines.push('Recent food diary entries:')
    lines.push(...foodLines)
  }

  if (recentCheckins.length > 0) {
    const ratingLines = recentCheckins.slice(0, 25).map((r) => {
      const v = r.value
      const label =
        v === null || v === undefined
          ? 'N/A'
          : CHECKIN_LABELS[Math.max(0, Math.min(CHECKIN_LABELS.length - 1, v))]
      const notePart = r.note ? ` – note: ${r.note}` : ''
      return `- [${r.date}] ${r.name}: ${label}${v !== null && v !== undefined ? ` (${v}/6)` : ''}${notePart}`
    })
    lines.push('Recent daily check-in ratings (last 7 days):')
    lines.push(...ratingLines)
  }

  const healthSnapshot =
    lines.length > 0
      ? lines.join('\n')
      : 'No structured health data is available yet beyond basic account information.'

  const preferredCategories: string[] = []
  if (focusFood) preferredCategories.push('food')
  if (focusSupplements) preferredCategories.push('supplement')
  if (focusLifestyle) preferredCategories.push('lifestyle')
  const preferredCategoriesText =
    preferredCategories.length > 0
      ? preferredCategories.join(', ')
      : 'food, supplement, lifestyle'

  const prompt = `You are a careful, practical health coach creating ONE personalised micro health tip for a specific user.

USER HEALTH SNAPSHOT (from Helfi app):
${healthSnapshot}

CONTEXT FOR THIS TIP:
- This tip is being sent around: ${localTimeDescription}
- The user receives at most 3 tips per day, so this one should feel meaningful, not generic.

GOAL:
- Provide ONE short, highly actionable health tip that this user can realistically apply today.
- The tip should clearly connect to at least ONE specific detail from the snapshot above (for example: a named health issue, a recurring symptom, a supplement they take, or a pattern in their recent meals or ratings).

CRITICAL RULES:
1. Avoid generic advice that could apply to absolutely everyone (e.g. "drink more water", "sleep more", "eat healthier") unless you tie it tightly to a concrete pattern from their data and make it very specific.
2. The tip must feel like it was written specifically for THIS person, based on the snapshot above.
3. The user has expressed a preference for these tip categories (in order of priority): ${preferredCategoriesText}.
   - You MUST choose the JSON "category" from these options: "food", "supplement", or "lifestyle".
   - Prefer a category that is in the preferred list above, but if the health snapshot clearly demands a different category, you may choose it and briefly explain why.
4. You may focus on ONE of these categories:
   - food: a specific meal, snack, or ingredient pattern that fits their issues
   - supplement: a specific supplement idea, timing tweak, or reminder connected to their issues
   - lifestyle: a small behaviour or routine change (sleep, stress, movement, bathroom timing, etc.)
5. Never diagnose or claim to cure anything. Use soft language like "may help", "you might consider", "many people with X find Y helpful".
6. Include a brief safety note that reminds them to consider medications, allergies, and to talk with a clinician when appropriate—especially if you mention a supplement or strong change.
7. Do NOT reveal your chain-of-thought. Only show the final recommendation and brief reasoning.

RESPONSE FORMAT (JSON ONLY, no markdown, no extra text):
{
  "title": "Short, specific title for the notification (5-9 words)",
  "category": "food" | "supplement" | "lifestyle",
  "tip": "1-3 short sentences with the main recommendation, explicitly referencing at least one detail from the snapshot above.",
  "safetyNote": "1 short sentence with a sensible safety or medical caution."
}`

  return prompt
}

function extractTipJson(raw: string) {
  if (!raw) return null
  let text = raw.trim()

  // Strip markdown fences if present
  const fenceMatch = text.match(/```json([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i)
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim()
  }

  // Try to isolate the first JSON object
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1)
  }

  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as {
      title?: string
      category?: string
      tip?: string
      safetyNote?: string
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const requireSignature = !!process.env.QSTASH_REQUIRE_SIGNATURE
    if (requireSignature) {
      const sig = req.headers.get('Upstash-Signature')
      if (!sig) {
        return NextResponse.json({ error: 'missing_signature' }, { status: 401 })
      }
      // Full signature verification can be added later with @upstash/qstash
    }

    const body = (await req.json().catch(() => ({}))) as Partial<DispatchPayload>
    const userId = String(body.userId || '')
    const reminderTime = String(body.reminderTime || '')
    const timezone = String(body.timezone || '')

    if (!userId || !reminderTime || !timezone) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    await ensureTables()

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

    // De-duplicate: only one tip per user/time/date
    const existing: Array<{ exists: number }> = await prisma.$queryRawUnsafe(
      `SELECT 1 as exists FROM HealthTipDeliveryLog WHERE userId = $1 AND reminderTime = $2 AND tipDate = $3::date LIMIT 1`,
      userId,
      reminderTime,
      localDateString
    )
    if (existing.length > 0) {
      return NextResponse.json({ skipped: 'already_sent' })
    }

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

    // Build health context for this user
    const context = await buildUserHealthContext(userId)

    // Create a light human description of the local time (morning/afternoon/evening)
    const [hhStr, mmStr] = reminderTime.split(':')
    const hh = parseInt(hhStr || '0', 10)
    const approxSlot =
      hh < 11 ? 'morning' : hh < 15 ? 'around lunchtime' : hh < 19 ? 'afternoon' : 'evening'
    const localTimeDescription = `${reminderTime} in their local timezone (${approxSlot})`

    const model = 'gpt-4o'
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

    // Wallet pre-check using a conservative estimate, then we will charge 2x the real cost
    const estimatedModelCostCents = costCentsEstimateFromText(model, prompt, 800 * 4)
    const estimatedChargeCents = estimatedModelCostCents * 2
    const creditManager = new CreditManager(user.id)
    const walletStatus = await creditManager.getWalletStatus()

    if (walletStatus.totalAvailableCents < estimatedChargeCents) {
      // Not enough credits – send a gentle notification that links to billing instead of a tip
    const payload = JSON.stringify({
        title: 'Top up credits to keep AI health tips coming',
        body: 'We could not send today’s health tip because your credits are low. Tap to add more credits or upgrade your plan.',
        url: '/billing',
      })
      await webpush
        .sendNotification(subscriptionRows[0].subscription, payload)
      .catch((err: unknown) => {
          console.error('[HEALTH_TIPS] Low-credit notification send error', err)
        })

      await prisma.$executeRawUnsafe(
        `INSERT INTO HealthTipDeliveryLog (userId, reminderTime, tipDate, sentAt)
         VALUES ($1, $2, $3::date, NOW())
         ON CONFLICT (userId, reminderTime, tipDate) DO UPDATE SET sentAt = NOW()`,
        userId,
        reminderTime,
        localDateString
      )

      // Still schedule the next attempt for tomorrow at the same time
      await scheduleHealthTipWithQStash(userId, reminderTime, effectiveTimezone).catch(
        (error) => {
          console.error('[HEALTH_TIPS] Failed to schedule next tip after low credits', error)
        }
      )

      return NextResponse.json({ skipped: 'insufficient_credits' })
    }

    // Generate the health tip with OpenAI
    const wrapped = await chatCompletionWithCost(openai, {
      model,
      messages,
      max_tokens: 800,
      temperature: 0.4,
    } as any)

    const rawContent = wrapped.completion.choices?.[0]?.message?.content || ''
    const parsed = extractTipJson(rawContent)

    if (!parsed || !parsed.title || !parsed.tip) {
      console.error('[HEALTH_TIPS] Failed to parse tip JSON', rawContent)
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

    const costCents = wrapped.costCents
    const chargeCents = costCents * 2

    // Charge the user twice the underlying AI cost in credits
    const chargedOk = await creditManager.chargeCents(chargeCents)
    if (!chargedOk) {
      return NextResponse.json({ error: 'billing_failed' }, { status: 402 })
    }

    const tipId = crypto.randomUUID()

    await prisma.$executeRawUnsafe(
      `INSERT INTO HealthTips (id, userId, tipDate, sentAt, title, body, category, metadata, costCents, chargeCents)
       VALUES ($1,$2,$3::date,NOW(),$4,$5,$6,$7,$8,$9)`,
      tipId,
      userId,
      localDateString,
      parsed.title.substring(0, 140),
      fullBody,
      category,
      JSON.stringify({ rawContent }).slice(0, 10000),
      costCents,
      chargeCents
    )

    await prisma.$executeRawUnsafe(
      `INSERT INTO HealthTipDeliveryLog (userId, reminderTime, tipDate, sentAt)
       VALUES ($1, $2, $3::date, NOW())
       ON CONFLICT (userId, reminderTime, tipDate) DO UPDATE SET sentAt = NOW()`,
      userId,
      reminderTime,
      localDateString
    )

    const notificationBody = safeTip.length > 120 ? `${safeTip.slice(0, 117)}…` : safeTip

    const payload = JSON.stringify({
      title: parsed.title.substring(0, 80),
      body: notificationBody,
      url: '/health-tips',
    })

    await webpush
      .sendNotification(subscriptionRows[0].subscription, payload)
      .catch((err: unknown) => {
        console.error('[HEALTH_TIPS] Notification send error', err)
      })

    // Schedule the next tip for this time tomorrow
    await scheduleHealthTipWithQStash(userId, reminderTime, effectiveTimezone).catch(
      (error) => {
        console.error('[HEALTH_TIPS] Failed to schedule next tip via QStash', error)
      }
    )

    return NextResponse.json({
      ok: true,
      tipId,
      costCents,
      chargeCents,
    })
  } catch (e: any) {
    console.error('[HEALTH_TIPS_DISPATCH] error', e?.stack || e)
    return NextResponse.json(
      { error: 'health_tip_dispatch_error', message: e?.message || String(e) },
      { status: 500 }
    )
  }
}


