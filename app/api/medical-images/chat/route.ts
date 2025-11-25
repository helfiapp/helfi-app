import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { costCentsEstimateFromText, estimateTokensFromText } from '@/lib/cost-meter'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { logAIUsage } from '@/lib/ai-usage-logger'

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

    const analysisResult = body.analysisResult || {}

    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Build system prompt with medical image analysis context
    const systemPrompt = [
      'You are a careful, patient-friendly assistant helping users understand and ask follow-up questions about a recent medical image analysis.',
      'You already have the analysis result from their Medical Image Analyzer. Treat that as background context that you silently keep in mind – the user has already seen those results above, so you do NOT need to repeat the whole analysis each time.',
      '',
      analysisResult.summary ? `Analysis summary: ${analysisResult.summary}` : '',
      Array.isArray(analysisResult.possibleCauses) && analysisResult.possibleCauses.length
        ? `Likely conditions (from highest to lowest confidence):\n${analysisResult.possibleCauses
            .map(
              (c: any, index: number) =>
                `- ${index === 0 ? '[highest]' : ''}${c.name} (${c.confidence || 'unknown'}): ${
                  c.whyLikely || ''
                }`.trim()
            )
            .join('\n')}`
        : '',
      Array.isArray(analysisResult.redFlags) && analysisResult.redFlags.length
        ? `Red-flag signs mentioned in the analysis:\n${analysisResult.redFlags
            .map((rf: string) => `- ${rf}`)
            .join('\n')}`
        : '',
      Array.isArray(analysisResult.nextSteps) && analysisResult.nextSteps.length
        ? `Suggested next steps from the analysis:\n${analysisResult.nextSteps
            .map((ns: string) => `- ${ns}`)
            .join('\n')}`
        : '',
      analysisResult.analysisText
        ? `Full analysis text (for your reference only):\n${String(analysisResult.analysisText).slice(
            0,
            1200
          )}`
        : '',
      '',
      'When you answer, focus on the user’s specific question, not on re-stating the full analysis.',
      '',
      'Always use the following section layout with the bold headings written exactly as shown, each on its own line with a blank line after it:',
      '',
      '**Short answer**',
      '- 2–4 sentences that directly answer the user’s question in plain language.',
      '',
      '**Why this matters**',
      '- 2–4 short bullet points explaining why this information is important for them (for example: what it could mean for their health, how it might change over time, or why monitoring is useful).',
      '',
      '**When to see a doctor**',
      '- Bullet points explaining when it is sensible to book a routine appointment and when it is important to seek urgent or emergency care, tailored to their question.',
      '',
      '**What you can do at home**',
      '- Simple, practical self-care steps or monitoring tips that are appropriate for their situation and consistent with the analysis.',
      '',
      'Only pull in details from the original analysis when they help answer the question; do NOT dump or repeat the full report. Use short sentences and bullet points so the reply is easy to scan in the chat bubble.',
      '',
      'Safety rules:',
      '- Do NOT provide a formal diagnosis or treatment plan.',
      '- Do NOT say that a doctor is unnecessary; instead, explain when medical review would be sensible.',
      '- Always remind the user that this information does not replace a real doctor’s examination.',
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
      // Wallet pre-check using conservative estimate
      {
        const cm = new CreditManager(user.id)
        const estimateCents = costCentsEstimateFromText(model, `${systemPrompt}\n${question}`, 800 * 4)
        const wallet = await cm.getWalletStatus()
        if (wallet.totalAvailableCents < estimateCents) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
        }
      }

      const enc = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          let full = ''
          try {
            const completion = await openai.chat.completions.create({
              model,
              temperature: 0.2,
              max_tokens: 800,
              stream: true,
              messages: chatMessages as any,
            })
            for await (const part of completion) {
              const token = part.choices?.[0]?.delta?.content || ''
              if (token) {
                full += token
                controller.enqueue(enc.encode(`data: ${token}\n\n`))
              }
            }
            // After stream completes, charge based on approximate output size
            try {
              const cm = new CreditManager(user.id)
              const actualCents = costCentsEstimateFromText(
                model,
                `${systemPrompt}\n${question}`,
                full.length
              )
              await cm.chargeCents(actualCents)
              const promptTokens = estimateTokensFromText(`${systemPrompt}\n${question}`)
              const completionTokens = Math.ceil(full.length / 4)
              await logAIUsage({
                context: { feature: 'medical-image:chat', userId: user.id },
                model,
                promptTokens,
                completionTokens,
                costCents: actualCents,
              })
            } catch {
              // Do not break the finished stream if charging fails
            }
            controller.enqueue(enc.encode('event: end\n\n'))
            controller.close()
          } catch (err) {
            controller.enqueue(enc.encode('event: error\n\n'))
            controller.close()
          }
        },
      })
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
    }

    // Non-streaming fallback
    {
      const model = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-4o-mini'
      // Pre-check
      {
        const cm = new CreditManager(user.id)
        const estimateCents = costCentsEstimateFromText(model, `${systemPrompt}\n${question}`, 800 * 4)
        const wallet = await cm.getWalletStatus()
        if (wallet.totalAvailableCents < estimateCents) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
        }
      }
      const wrapped = await chatCompletionWithCost(openai, {
        model,
        temperature: 0.2,
        max_tokens: 800,
        messages: chatMessages as any,
      } as any)
      try {
        const cm = new CreditManager(user.id)
        await cm.chargeCents(wrapped.costCents)
      } catch {}

      // Log AI usage for non-streaming medical image chat
      try {
        await logAIUsage({
          context: { feature: 'medical-image:chat', userId: user.id },
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
    console.error('[medical-images.chat.POST] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
