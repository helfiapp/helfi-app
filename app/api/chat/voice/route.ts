import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { capMaxTokensToBudget, costCentsEstimateFromText, estimateTokensFromText } from '@/lib/cost-meter'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { logAIUsage } from '@/lib/ai-usage-logger'
import { ensureTalkToAITables, listMessages, appendMessage, createThread, updateThreadTitle, listThreads } from '@/lib/talk-to-ai-chat-store'
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits'
import { isSubscriptionActive } from '@/lib/subscription-utils'

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

async function loadFullUserContext(userId: string) {
  const [user, issues] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        gender: true,
        height: true,
        weight: true,
        bodyType: true,
        exerciseFrequency: true,
        exerciseTypes: true,
        healthGoals: {
          select: {
            id: true,
            name: true,
            category: true,
            currentRating: true,
            createdAt: true,
            updatedAt: true,
            healthLogs: {
              select: {
                rating: true,
                notes: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 12,
            },
          },
        },
        supplements: {
          select: {
            name: true,
            dosage: true,
            timing: true,
            updatedAt: true,
          },
        },
        medications: {
          select: {
            name: true,
            dosage: true,
            timing: true,
            updatedAt: true,
          },
        },
        exerciseLogs: {
          select: {
            type: true,
            duration: true,
            intensity: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        foodLogs: {
          select: {
            name: true,
            description: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    }),
    prisma.$queryRawUnsafe<Array<{ id: string; name: string; polarity: string; slug: string }>>(
      'SELECT id, name, polarity, slug FROM "CheckinIssues" WHERE "userId" = $1',
      userId
    ).catch(() => []),
  ])

  if (!user) return null

  return {
    profile: {
      gender: user.gender,
      weight: user.weight,
      height: user.height,
      bodyType: user.bodyType,
      exerciseFrequency: user.exerciseFrequency,
      exerciseTypes: user.exerciseTypes,
    },
    healthGoals: user.healthGoals,
    supplements: user.supplements,
    medications: user.medications,
    exerciseLogs: user.exerciseLogs,
    foodLogs: user.foodLogs,
    issues: issues.map((i) => ({ id: i.id, name: i.name, polarity: i.polarity, slug: i.slug })),
  }
}

function buildSystemPrompt(context: Awaited<ReturnType<typeof loadFullUserContext>>): string {
  if (!context) {
    return 'You are Helfi, a helpful AI health assistant. Provide accurate, supportive health guidance.'
  }

  const parts: string[] = [
    'You are Helfi, an AI health assistant with comprehensive access to the user\'s health data.',
    'Your role is to provide personalized, evidence-based health guidance while always emphasizing that you are not a replacement for professional medical advice.',
    '',
    'USER PROFILE:',
    `- Gender: ${context.profile.gender || 'Not specified'}`,
    `- Weight: ${context.profile.weight ? `${context.profile.weight} kg` : 'Not specified'}`,
    `- Height: ${context.profile.height ? `${context.profile.height} cm` : 'Not specified'}`,
    `- Body Type: ${context.profile.bodyType || 'Not specified'}`,
    `- Exercise Frequency: ${context.profile.exerciseFrequency || 'Not specified'}`,
    `- Exercise Types: ${context.profile.exerciseTypes?.join(', ') || 'None specified'}`,
    '',
  ]

  if (context.supplements.length > 0) {
    parts.push('CURRENT SUPPLEMENTS:')
    context.supplements.forEach((supp) => {
      parts.push(`- ${supp.name}: ${supp.dosage || 'No dosage'} ${supp.timing?.length ? `(Timing: ${supp.timing.join(', ')})` : ''}`)
    })
    parts.push('')
  }

  if (context.medications.length > 0) {
    parts.push('CURRENT MEDICATIONS:')
    context.medications.forEach((med) => {
      parts.push(`- ${med.name}: ${med.dosage || 'No dosage'} ${med.timing?.length ? `(Timing: ${med.timing.join(', ')})` : ''}`)
    })
    parts.push('')
  }

  if (context.healthGoals.length > 0) {
    parts.push('HEALTH GOALS & TRACKING:')
    context.healthGoals.forEach((goal) => {
      if (goal.name.startsWith('__')) return
      parts.push(`- ${goal.name}: Current rating ${goal.currentRating || 'N/A'}`)
      if (goal.healthLogs.length > 0) {
        const recent = goal.healthLogs.slice(0, 3)
        parts.push(`  Recent logs: ${recent.map((l) => `Rating ${l.rating}${l.notes ? ` - ${l.notes}` : ''}`).join('; ')}`)
      }
    })
    parts.push('')
  }

  if (context.issues.length > 0) {
    parts.push('TRACKED HEALTH ISSUES:')
    context.issues.forEach((issue) => {
      parts.push(`- ${issue.name} (${issue.polarity === 'positive' ? 'Positive' : 'Negative'})`)
    })
    parts.push('')
  }

  if (context.exerciseLogs.length > 0) {
    parts.push('RECENT EXERCISE LOGS:')
    context.exerciseLogs.slice(0, 10).forEach((log) => {
      parts.push(`- ${log.type}: ${log.duration} min${log.intensity ? ` (${log.intensity})` : ''} on ${log.createdAt.toLocaleDateString()}`)
    })
    parts.push('')
  }

  if (context.foodLogs.length > 0) {
    parts.push('RECENT FOOD LOGS:')
    context.foodLogs.slice(0, 10).forEach((log) => {
      parts.push(`- ${log.name}${log.description ? `: ${log.description}` : ''} on ${log.createdAt.toLocaleDateString()}`)
    })
    parts.push('')
  }

  parts.push(
    'RESPONSE FORMATTING (CRITICAL - FOLLOW EXACTLY):',
    '',
    'You MUST format all responses with proper structure. Example format:',
    '',
    '**Heading or Key Point**',
    '',
    'First paragraph here. Keep it concise and focused.',
    '',
    'Second paragraph here if needed.',
    '',
    '1. First numbered item',
    '2. Second numbered item',
    '3. Third numbered item',
    '',
    '• Bullet point one',
    '• Bullet point two',
    '',
    '**Another Section**',
    '',
    'Final paragraph.',
    '',
    'RULES:',
    '- ALWAYS separate paragraphs with a blank line (double newline: \\n\\n)',
    '- Use numbered lists (1. 2. 3.) for sequential items',
    '- Use bullet points (- or •) for non-sequential items',
    '- Use **bold** for section headings and key terms',
    '- NEVER write responses as one continuous paragraph',
    '- Keep paragraphs to 2-4 sentences maximum',
    '- Break up long explanations into multiple paragraphs',
    '- If your response is longer than 3 sentences, you MUST break it into multiple paragraphs',
    '- Every 2-3 sentences should be followed by a blank line',
    '',
    'USER DATA USAGE:',
    '- Only reference user data when directly relevant to their question',
    '- Do NOT list all their supplements/medications unless specifically asked',
    '- Do NOT dump their entire health profile unless requested',
    '- When asked for "concise" or "brief" answers, provide ONLY the essential information',
    '- Focus on answering the specific question asked, not providing a data dump',
    '',
    'GUIDELINES:',
    '- Always remind users to consult healthcare professionals for medical advice',
    '- Provide personalized recommendations based on their data ONLY when relevant',
    '- Be supportive, clear, and non-alarming',
    '- If asked about supplements, provide types/categories, not specific brands',
    '- Consider interactions between medications and supplements when relevant',
    '- Keep responses focused on the user\'s actual question',
  )

  return parts.join('\n')
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await ensureTalkToAITables()
    const url = new URL(req.url)
    const threadId = url.searchParams.get('threadId')
    
    if (threadId) {
      // Get specific thread messages
      const messages = await listMessages(threadId, 60)
      return NextResponse.json({ threadId, messages }, { status: 200 })
    } else {
      return NextResponse.json({ error: 'threadId required' }, { status: 400 })
    }
  } catch (error) {
    console.error('[chat-voice.GET] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const question = String(body?.message || '').trim()
    if (!question) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { subscription: true, creditTopUps: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isPremium = isSubscriptionActive(user.subscription)
    const now = new Date()
    const hasPurchasedCredits = user.creditTopUps?.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    )
    const hasFreeChatCredits = await hasFreeCredits(user.id, 'VOICE_CHAT')
    const allowViaFreeUse = !isPremium && !hasPurchasedCredits && hasFreeChatCredits
    if (!isPremium && !hasPurchasedCredits && !hasFreeChatCredits) {
      return NextResponse.json(
        {
          error: 'Payment required',
          message: 'You\'ve used all your free voice chat uses. Subscribe to a monthly plan or purchase credits to continue.',
          requiresPayment: true,
          exhaustedFreeCredits: true,
        },
        { status: 402 }
      )
    }

    // Get or create thread
    await ensureTalkToAITables()
    let threadId: string
    if (body.newThread) {
      // Create new thread only if explicitly requested
      const thread = await createThread(session.user.id)
      threadId = thread.id
    } else if (body.threadId) {
      // Use existing thread
      threadId = body.threadId
    } else {
      // Get most recent thread or create new one ONLY if no threads exist
      const threads = await listThreads(session.user.id)
      if (threads.length > 0) {
        threadId = threads[0].id
      } else {
        // Only create if truly no threads exist
        const thread = await createThread(session.user.id)
        threadId = thread.id
      }
    }

    // Load message history for context
    const history = await listMessages(threadId, 30)
    const historyMessages = history.map((m) => ({ role: m.role, content: m.content }))

    // Load full user context
    const context = await loadFullUserContext(session.user.id)
    let systemPrompt = buildSystemPrompt(context)

    // Optional additional focus: a health tip summary passed from inline chat (e.g. on Health Tips page)
    const healthTipSummary =
      typeof body?.healthTipSummary === 'string' ? body.healthTipSummary.trim() : ''
    if (healthTipSummary) {
      systemPrompt += `\n\nCURRENT HEALTH TIP CONTEXT (IMPORTANT):\n${healthTipSummary}\n\nWhen the user asks questions in this chat, assume they are asking follow-up questions about this specific tip unless they clearly change the subject.`
    }

    const accept = (req.headers.get('accept') || '').toLowerCase()
    const wantsStream = accept.includes('text/event-stream')

    const model = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-4o-mini'
    // Add formatting reminder to user message for better compliance
    const enhancedQuestion = `${question}\n\nPlease format your response with proper paragraphs, line breaks, and structure.`
    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...historyMessages,
      { role: 'user' as const, content: enhancedQuestion },
    ]

    // Save user message
    await appendMessage(threadId, 'user', question)

    // Auto-generate title from first message if thread has no title
    const threads = await listThreads(session.user.id)
    const currentThread = threads.find(t => t.id === threadId)
    if (currentThread && !currentThread.title) {
      const title = question.length > 50 ? question.substring(0, 47) + '...' : question
      await updateThreadTitle(threadId, title)
    }

    // Estimate cost (2x for user)
    const promptText = `${systemPrompt}\n${question}`
    const estimateCents = costCentsEstimateFromText(model, promptText, 1000 * 4)
    const userCostCents = estimateCents * 2 // Double the cost for user

    // Check wallet
    const cm = new CreditManager(user.id)
    const wallet = await cm.getWalletStatus()

    // If only estimating, return cost
    if (body?.estimateOnly) {
      return NextResponse.json({
        estimatedCost: userCostCents,
        availableCredits: wallet.totalAvailableCents,
      })
    }

    let maxTokens = 1000
    if (!allowViaFreeUse) {
      const budgetCents = Math.floor(wallet.totalAvailableCents / 2)
      const cappedMaxTokens = capMaxTokensToBudget(model, promptText, maxTokens, budgetCents)
      if (cappedMaxTokens <= 0) {
        return NextResponse.json(
          {
            error: 'Insufficient credits',
            estimatedCost: userCostCents,
            availableCredits: wallet.totalAvailableCents,
          },
          { status: 402 }
        )
      }
      maxTokens = cappedMaxTokens
    }

    if (wantsStream) {
      const wrapped = await chatCompletionWithCost(openai, {
        model,
        messages: chatMessages,
        max_tokens: maxTokens,
        temperature: 0.4,
      } as any)

      const assistantMessage =
        wrapped.completion.choices?.[0]?.message?.content ||
        'I apologize, but I could not generate a response.'

      const actualUserCostCents = wrapped.costCents * 2
      if (!allowViaFreeUse) {
        const ok = await cm.chargeCents(actualUserCostCents)
        if (!ok) {
          return NextResponse.json(
            {
              error: 'Insufficient credits',
              estimatedCost: actualUserCostCents,
              availableCredits: wallet.totalAvailableCents,
            },
            { status: 402 }
          )
        }
      } else {
        await consumeFreeCredit(user.id, 'VOICE_CHAT')
      }

      // Save assistant message
      await appendMessage(threadId, 'assistant', assistantMessage)

      // Log usage for visibility
      try {
        await logAIUsage({
          context: { feature: 'voice:chat', userId: user.id },
          model,
          promptTokens: wrapped.promptTokens,
          completionTokens: wrapped.completionTokens,
          costCents: actualUserCostCents,
        })
      } catch {
        // Ignore logging failures
      }

      const enc = new TextEncoder()
      const chunks = assistantMessage.match(/[\s\S]{1,200}/g) || ['']
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            const payload = JSON.stringify({ token: chunk })
            controller.enqueue(enc.encode(`data: ${payload}\n\n`))
          }
          controller.enqueue(enc.encode('event: end\n\n'))
          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    } else {
      // Non-streaming
      const wrapped = await chatCompletionWithCost(openai, {
        model,
        messages: chatMessages,
        max_tokens: maxTokens,
        temperature: 0.4,
      })

      // Charge user (2x cost)
      const userCostCents = wrapped.costCents * 2
      if (!allowViaFreeUse) {
        const ok = await cm.chargeCents(userCostCents)
        if (!ok) {
          return NextResponse.json(
            {
              error: 'Insufficient credits',
              estimatedCost: userCostCents,
              availableCredits: wallet.totalAvailableCents,
            },
            { status: 402 }
          )
        }
      } else {
        await consumeFreeCredit(user.id, 'VOICE_CHAT')
      }

      // Log AI usage for cost tracking (voice chat, non-streaming)
      try {
        await logAIUsage({
          context: { feature: 'voice:chat', userId: user.id },
          model,
          promptTokens: wrapped.promptTokens,
          completionTokens: wrapped.completionTokens,
          costCents: userCostCents,
        })
      } catch {
        // Ignore logging failures
      }

      const assistantMessage = wrapped.completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

      // Save assistant message
      await appendMessage(threadId, 'assistant', assistantMessage)

      return NextResponse.json({
        assistant: assistantMessage,
        estimatedCost: userCostCents,
        threadId,
      })
    }
  } catch (err: any) {
    console.error('[voice-chat] Error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
