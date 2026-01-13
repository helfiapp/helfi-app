import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logAIUsage } from '@/lib/ai-usage-logger'
import { CreditManager } from '@/lib/credit-system'
import { capMaxTokensToBudget } from '@/lib/cost-meter'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits'
import { isSubscriptionActive } from '@/lib/subscription-utils'

// Lazy OpenAI import to avoid build-time env requirements
let _openai: any = null
function getOpenAI() {
  if (_openai) return _openai
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const OpenAI = require('openai').default
  _openai = new OpenAI({ apiKey })
  return _openai
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    }

    const {
      section,
      question,
      messages: clientMessages,
      issue,
    } = await request.json().catch(() => ({ section: 'safety', question: '', messages: null, issue: '' }))
    const sec = String(section || 'safety').toLowerCase()
    const userId = session.user.id

    // Load a narrow, privacy-conscious slice of recent data for better answers
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        healthGoals: { orderBy: { updatedAt: 'desc' } },
        supplements: true,
        medications: true,
        healthLogs: { orderBy: { createdAt: 'desc' }, take: 14 },
        foodLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
        subscription: true,
        creditTopUps: true,
      },
    })

    if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })

    const isPremium = isSubscriptionActive(user.subscription)
    const now = new Date()
    const hasPurchasedCredits = user.creditTopUps?.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    )
    const hasFreeChatCredits = await hasFreeCredits(userId, 'INSIGHTS_CHAT')
    const allowViaFreeUse = !isPremium && !hasPurchasedCredits && hasFreeChatCredits
    if (!isPremium && !hasPurchasedCredits && !hasFreeChatCredits) {
      return NextResponse.json(
        {
          error: 'Payment required',
          message: 'You\'ve used all your free insights chat uses. Subscribe to a monthly plan or purchase credits to continue.',
          requiresPayment: true,
          exhaustedFreeCredits: true,
        },
        { status: 402 }
      )
    }

    const profile = {
      gender: user.gender,
      height: user.height,
      weight: user.weight,
      goals: (user.healthGoals || []).filter((g: any) => !g.name?.startsWith('__')).map((g: any) => g.name),
      supplements: (user.supplements || []).map((s: any) => ({ name: s.name, dosage: s.dosage, timing: s.timing })),
      medications: (user.medications || []).map((m: any) => ({ name: m.name, dosage: m.dosage, timing: m.timing })),
      recentHealthLogs: (user.healthLogs || []).map((h: any) => ({ rating: h.rating, createdAt: h.createdAt })),
      recentFood: (user.foodLogs || []).map((f: any) => ({ name: f.name, nutrients: f.nutrients, createdAt: f.createdAt })),
    }

    // Fallback answer if OpenAI is not configured
    const fallback = () => {
      const hasIron = profile.supplements.some((s) => /iron/i.test(s.name || '')) || profile.medications.some((m) => /iron/i.test(m.name || ''))
      const hasCalcium = profile.supplements.some((s) => /calcium/i.test(s.name || '')) || profile.medications.some((m) => /calcium/i.test(m.name || ''))
      const hasMagnesium = profile.supplements.some((s) => /magnesium/i.test(s.name || ''))
      const tips: string[] = []
      if (hasIron && hasCalcium) tips.push('Separate iron and calcium by ~2 hours to support absorption (check with your clinician).')
      if (hasMagnesium) tips.push('Magnesium is often better in the evening, 1–2 hours before sleep; avoid pairing with high‑fiber meals.')
      if (tips.length === 0) tips.push('Log your current supplements/medications and daily symptoms; I will tailor specific safety/timing guidance next refresh.')
      const answer = `Here are practical safety pointers based on your current entries:\n- ${tips.join('\n- ')}`
      // Return a threaded shape for the client even in fallback
      const history = Array.isArray(clientMessages) && clientMessages.length
        ? clientMessages.map((m: any) => ({ role: String(m.role || 'user'), content: String(m.content || '') })).slice(-12)
        : (question ? [{ role: 'user', content: String(question) }] : [])
      return { messages: [...history, { role: 'assistant', content: answer }], preview: true }
    }

    const openai = getOpenAI()
    if (!openai) return NextResponse.json(fallback(), { status: 200 })

    // Build threaded chat messages
    const baseSystem = {
      role: 'system',
      content: [
        'You are a careful, non-alarming clinical assistant.',
        `SECTION: ${sec}`,
        'RULES:',
        '- Never diagnose; avoid certainty; suggest to check with clinician for changes.',
        '- Use ONLY the JSON profile provided; be specific, short, and actionable.',
        '- Your reply should be concise and structured with short bullets where helpful.',
        '',
        `PROFILE JSON: ${JSON.stringify(profile)}`,
        issue ? `ISSUE: ${String(issue)}` : '',
      ].filter(Boolean).join('\n'),
    }

    const history = Array.isArray(clientMessages) && clientMessages.length
      ? clientMessages.map((m: any) => ({ role: String(m.role || 'user'), content: String(m.content || '') })).slice(-12)
      : (question ? [{ role: 'user', content: String(question) }] : [])

    const model = 'gpt-4o-mini'
    const promptText = [baseSystem, ...history].map((m) => m.content).join('\n')
    let maxTokens = 400
    if (!allowViaFreeUse) {
      const cm = new CreditManager(userId)
      const wallet = await cm.getWalletStatus()
      const cappedMaxTokens = capMaxTokensToBudget(model, promptText, maxTokens, wallet.totalAvailableCents)
      if (cappedMaxTokens <= 0) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
      }
      maxTokens = cappedMaxTokens
    }

    const wrapped = await chatCompletionWithCost(openai, {
      model,
      messages: [baseSystem, ...history],
      temperature: 0.2,
      max_tokens: maxTokens,
    } as any)

    if (!allowViaFreeUse) {
      const cm = new CreditManager(userId)
      const ok = await cm.chargeCents(wrapped.costCents)
      if (!ok) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
      }
    } else {
      await consumeFreeCredit(userId, 'INSIGHTS_CHAT')
    }

    try {
      await logAIUsage({
        context: { feature: 'insights:ask', userId },
        model,
        promptTokens: wrapped.promptTokens,
        completionTokens: wrapped.completionTokens,
        costCents: wrapped.costCents,
      })
    } catch {
      // Ignore logging failures
    }

    const text = wrapped.completion.choices?.[0]?.message?.content || ''
    return NextResponse.json({ messages: [...history, { role: 'assistant', content: text }], preview: false }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
