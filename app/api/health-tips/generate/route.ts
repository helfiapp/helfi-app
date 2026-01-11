import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import OpenAI from 'openai'
import crypto from 'crypto'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { capMaxTokensToBudget } from '@/lib/cost-meter'
import { logAIUsage } from '@/lib/ai-usage-logger'
import { buildTipPrompt, buildUserHealthContext, ensureHealthTipTables, extractTipJson } from '@/lib/health-tips'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

function resolveTimezone(timezone: string | null | undefined) {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  if (!timezone) return fallback
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(new Date())
    return timezone
  } catch {
    return fallback
  }
}

function getLocalTimeInfo(timezone: string, now: Date) {
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const localDateString = `${dateParts.find((p) => p.type === 'year')?.value}-${dateParts
    .find((p) => p.type === 'month')
    ?.value}-${dateParts.find((p) => p.type === 'day')?.value}`

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hh = timeParts.find((p) => p.type === 'hour')?.value || '00'
  const mm = timeParts.find((p) => p.type === 'minute')?.value || '00'
  const reminderTime = `${hh}:${mm}`

  const hourValue = parseInt(hh, 10)
  const approxSlot =
    hourValue < 11 ? 'morning' : hourValue < 15 ? 'around lunchtime' : hourValue < 19 ? 'afternoon' : 'evening'

  return { localDateString, reminderTime, approxSlot }
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  await ensureHealthTipTables()

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })
  if (!user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  }

  const settingsRows = await prisma.$queryRawUnsafe<
    Array<{
      timezone: string
      focusFood: boolean | null
      focusSupplements: boolean | null
      focusLifestyle: boolean | null
    }>
  >(
    `SELECT timezone, focusFood, focusSupplements, focusLifestyle
     FROM HealthTipSettings
     WHERE userId = $1`,
    user.id
  )

  const timezone = resolveTimezone(settingsRows[0]?.timezone)
  const now = new Date()
  const { localDateString, reminderTime, approxSlot } = getLocalTimeInfo(timezone, now)
  const localTimeDescription = `right now at ${reminderTime} in their local timezone (${approxSlot})`

  const openai = getOpenAIClient()
  if (!openai) {
    return NextResponse.json({ error: 'openai_not_configured' }, { status: 500 })
  }

  const context = await buildUserHealthContext(user.id)
  const model = 'gpt-5.2'
  const prompt = buildTipPrompt({
    context,
    localTimeDescription,
    focusFood: settingsRows[0]?.focusFood !== false,
    focusSupplements: settingsRows[0]?.focusSupplements !== false,
    focusLifestyle: settingsRows[0]?.focusLifestyle !== false,
  })
  const messages = [
    {
      role: 'user' as const,
      content: prompt,
    },
  ]

  const creditManager = new CreditManager(user.id)
  const walletStatus = await creditManager.getWalletStatus()
  let maxTokens = 800
  const cappedMaxTokens = capMaxTokensToBudget(model, prompt, maxTokens, walletStatus.totalAvailableCents)
  if (cappedMaxTokens <= 0) {
    return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 })
  }
  maxTokens = cappedMaxTokens

  const wrapped = await chatCompletionWithCost(openai, {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.4,
  } as any)

  const rawContent = wrapped.completion.choices?.[0]?.message?.content || ''
  const parsed = extractTipJson(rawContent)

  if (!parsed || !parsed.title || !parsed.tip) {
    return NextResponse.json({ error: 'tip_generation_failed' }, { status: 500 })
  }

  const category =
    parsed.category === 'supplement' || parsed.category === 'lifestyle'
      ? parsed.category
      : 'food'

  const safeTip = String(parsed.tip).trim()
  const safetyNote = String(parsed.safetyNote || '').trim()

  const costCents = wrapped.costCents
  const chargeCents = costCents

  const suggestedQuestions =
    Array.isArray(parsed.suggestedQuestions) && parsed.suggestedQuestions.length > 0
      ? parsed.suggestedQuestions
          .filter((q) => typeof q === 'string' && q.trim().length > 0)
          .slice(0, 4)
      : []

  const chargedOk = await creditManager.chargeCents(chargeCents)
  if (!chargedOk) {
    return NextResponse.json({ error: 'billing_failed' }, { status: 402 })
  }

  const tipId = crypto.randomUUID()

  await prisma.$executeRawUnsafe(
    `INSERT INTO HealthTips (id, userId, tipDate, sentAt, title, body, category, metadata, costCents, chargeCents)
     VALUES ($1,$2,$3::date,NOW(),$4,$5,$6,$7::jsonb,$8,$9)`,
    tipId,
    user.id,
    localDateString,
    String(parsed.title || '').substring(0, 140),
    safeTip,
    category,
    JSON.stringify({ rawContent, suggestedQuestions, safetyNote }).slice(0, 10000),
    costCents,
    chargeCents
  )

  try {
    await logAIUsage({
      context: { feature: 'health-tips:manual', userId: user.id },
      model,
      promptTokens: wrapped.promptTokens,
      completionTokens: wrapped.completionTokens,
      costCents,
    })
  } catch {
    // ignore usage logging failures
  }

  return NextResponse.json({
    ok: true,
    tip: {
      id: tipId,
      tipDate: localDateString,
      sentAt: now.toISOString(),
      title: String(parsed.title || '').substring(0, 140),
      body: safeTip,
      category,
      safetyNote,
      suggestedQuestions,
    },
  })
}
