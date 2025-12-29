import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { capMaxTokensToBudget } from '@/lib/cost-meter'
import { logAIUsage } from '@/lib/ai-usage-logger'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits'
import { isSubscriptionActive } from '@/lib/subscription-utils'

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = req.headers.get('content-type') || ''
    let body: {
      message?: string
      symptoms?: string[]
      duration?: string
      notes?: string
      analysisResult?: any
    } = {}
    if (contentType.includes('application/json')) {
      try {
        body = await req.json()
      } catch {}
    }

    const question = String(body?.message || '').trim()
    if (!question) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    const { symptoms = [], duration, notes, analysisResult = {} } = body

    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { subscription: true, creditTopUps: true } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isPremium = isSubscriptionActive(user.subscription)
    const now = new Date()
    const hasPurchasedCredits = user.creditTopUps?.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    )
    const hasFreeChatCredits = await hasFreeCredits(user.id, 'SYMPTOM_CHAT')
    const allowViaFreeUse = !isPremium && !hasPurchasedCredits && hasFreeChatCredits
    if (!isPremium && !hasPurchasedCredits && !hasFreeChatCredits) {
      return NextResponse.json(
        {
          error: 'Payment required',
          message: 'You\'ve used all your free symptom chat uses. Subscribe to a monthly plan or purchase credits to continue.',
          requiresPayment: true,
          exhaustedFreeCredits: true,
        },
        { status: 402 }
      )
    }

    // Build system prompt with analysis context
    const systemPrompt = [
      'You are a careful, patient-friendly clinical assistant helping users understand their symptom analysis.',
      'You have access to their recent symptom analysis results. Always include a disclaimer about consulting medical professionals.',
      '',
      `Original symptoms: ${symptoms.join(', ')}`,
      duration ? `Duration: ${duration}` : '',
      notes ? `User notes: ${notes}` : '',
      '',
      analysisResult.summary ? `Analysis summary: ${analysisResult.summary}` : '',
      analysisResult.possibleCauses?.length
        ? `Likely causes:\n${analysisResult.possibleCauses.map((c: any) => `- ${c.name} (${c.confidence}): ${c.whyLikely}`).join('\n')}`
        : '',
      analysisResult.redFlags?.length ? `Red flags:\n${analysisResult.redFlags.map((rf: string) => `- ${rf}`).join('\n')}` : '',
      analysisResult.nextSteps?.length ? `Next steps:\n${analysisResult.nextSteps.map((ns: string) => `- ${ns}`).join('\n')}` : '',
      '',
      'Rules:',
      '- Be concise and practical',
      '- Always remind users to consult healthcare professionals for concerning symptoms',
      '- Use clear, non-technical language',
      '- Reference specific parts of their analysis when relevant',
      '- Avoid providing diagnoses or treatment plans',
      '',
      'When users ask about supplements or dietary supplements:',
      '- Provide multiple (3-5+) specific supplement types that may be relevant to their condition',
      '- DO NOT recommend specific brands or product names',
      '- DO provide supplement categories/types (e.g., probiotics, digestive enzymes, omega-3 fatty acids, magnesium, vitamin D, etc.)',
      '- Explain briefly why each supplement type might be helpful for their specific symptoms',
      '- Always emphasize consulting a healthcare professional before starting any new supplements',
      '- Consider multiple supplement categories: vitamins, minerals, herbal supplements, probiotics/prebiotics, enzymes, amino acids, etc.',
    ]
      .filter(Boolean)
      .join('\n')

    const accept = (req.headers.get('accept') || '').toLowerCase()
    const wantsStream = accept.includes('text/event-stream')

    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: question },
    ]

    if (wantsStream) {
      const model = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-4o-mini'
      const promptText = `${systemPrompt}\n${question}`
      let maxTokens = 800
      if (!allowViaFreeUse) {
        const cm = new CreditManager(user.id)
        const wallet = await cm.getWalletStatus()
        const cappedMaxTokens = capMaxTokensToBudget(model, promptText, maxTokens, wallet.totalAvailableCents)
        if (cappedMaxTokens <= 0) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
        }
        maxTokens = cappedMaxTokens
      }

      const wrapped = await chatCompletionWithCost(openai, {
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: chatMessages as any,
      } as any)

      if (!allowViaFreeUse) {
        const cm = new CreditManager(user.id)
        const ok = await cm.chargeCents(wrapped.costCents)
        if (!ok) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
        }
      } else {
        await consumeFreeCredit(user.id, 'SYMPTOM_CHAT')
      }

      try {
        await logAIUsage({
          context: { feature: 'symptoms:chat', userId: user.id },
          model,
          promptTokens: wrapped.promptTokens,
          completionTokens: wrapped.completionTokens,
          costCents: wrapped.costCents,
        })
      } catch {
        // Ignore logging failures
      }

      const text = wrapped.completion.choices?.[0]?.message?.content || ''
      const enc = new TextEncoder()
      const chunks = text.match(/[\s\S]{1,200}/g) || ['']
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(enc.encode(`data: ${chunk}\n\n`))
          }
          controller.enqueue(enc.encode('event: end\n\n'))
          controller.close()
        },
      })
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
    }

    // Non-streaming fallback
    {
      const model = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-4o-mini'
      let maxTokens = 800
      // Pre-check
      if (!allowViaFreeUse) {
        const cm = new CreditManager(user.id)
        const wallet = await cm.getWalletStatus()
        const cappedMaxTokens = capMaxTokensToBudget(
          model,
          `${systemPrompt}\n${question}`,
          maxTokens,
          wallet.totalAvailableCents
        )
        if (cappedMaxTokens <= 0) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
        }
        maxTokens = cappedMaxTokens
      }
      const wrapped = await chatCompletionWithCost(openai, {
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: chatMessages as any,
      } as any)
      if (!allowViaFreeUse) {
        const cm = new CreditManager(user.id)
        const ok = await cm.chargeCents(wrapped.costCents)
        if (!ok) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
        }
      } else {
        await consumeFreeCredit(user.id, 'SYMPTOM_CHAT')
      }

      // Log AI usage for non-streaming symptom chat
      try {
        await logAIUsage({
          context: { feature: 'symptoms:chat', userId: user.id },
          model,
          promptTokens: wrapped.promptTokens,
          completionTokens: wrapped.completionTokens,
          costCents: wrapped.costCents,
        })
      } catch {
        // Ignore logging failures
      }

      const text = wrapped.completion.choices?.[0]?.message?.content || ''
      return NextResponse.json({ assistant: text })
    }
  } catch (error) {
    console.error('[symptom-chat.POST] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
