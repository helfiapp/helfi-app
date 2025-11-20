import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { costCentsEstimateFromText } from '@/lib/cost-meter'
import { chatCompletionWithCost } from '@/lib/metered-openai'

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
      'You are a careful, patient-friendly assistant helping users understand a recent medical image analysis.',
      'You already have the analysis result from their Medical Image Analyzer. Use that as your context rather than re-diagnosing from scratch.',
      '',
      analysisResult.summary ? `Analysis summary: ${analysisResult.summary}` : '',
      Array.isArray(analysisResult.possibleCauses) && analysisResult.possibleCauses.length
        ? `Likely conditions (from highest to lowest confidence):\n${analysisResult.possibleCauses
            .map(
              (c: any) =>
                `- ${c.name} (${c.confidence || 'unknown'}): ${c.whyLikely || ''}`.trim()
            )
            .join('\n')}`
        : '',
      Array.isArray(analysisResult.redFlags) && analysisResult.redFlags.length
        ? `Red-flag signs mentioned in the analysis:\n${analysisResult.redFlags
            .map((rf: string) => `- ${rf}`)
            .join('\n')}`
        : '',
      Array.isArray(analysisResult.nextSteps) && analysisResult.nextSteps.length
        ? `Suggested next steps:\n${analysisResult.nextSteps
            .map((ns: string) => `- ${ns}`)
            .join('\n')}`
        : '',
      analysisResult.analysisText
        ? `Full analysis text:\n${String(analysisResult.analysisText).slice(0, 1200)}`
        : '',
      '',
      'Rules:',
      '- Be concise, supportive, and non-alarming.',
      '- Use clear, non-technical language suitable for a non-medical user.',
      '- Reference specific parts of their analysis when relevant (for example, the highest-confidence condition or listed red flags).',
      '- Do NOT provide a formal diagnosis or treatment plan.',
      '- Always remind the user that this information does not replace a real doctor’s examination.',
      '',
      'If they ask what they should do, frame answers in terms of monitoring vs routine review vs urgent/emergency care, using the context above.',
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
      const text = wrapped.completion.choices?.[0]?.message?.content || ''
      return NextResponse.json({ assistant: text })
    }
  } catch (error) {
    console.error('[medical-images.chat.POST] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


