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
    'GUIDELINES:',
    '- Always remind users to consult healthcare professionals for medical advice, diagnosis, or treatment',
    '- Provide personalized recommendations based on their data when relevant',
    '- Be supportive, clear, and non-alarming',
    '- If asked about supplements, provide types/categories, not specific brands',
    '- Consider interactions between their medications and supplements',
    '- Reference their health goals and tracking data when relevant',
    '- Keep responses concise but comprehensive',
    '- CRITICAL: Always format responses with proper paragraphs separated by blank lines',
    '- Use numbered lists (1. 2. 3.) or bullet points (- or *) for multiple items',
    '- Use **bold** for emphasis on key terms or headings',
    '- Break up long responses into clear sections with line breaks between paragraphs',
    '- NEVER provide responses as one continuous block of text without line breaks',
    '- Each paragraph should be separated by a blank line (double newline)',
  )

  return parts.join('\n')
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
      include: { subscription: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Load full user context
    const context = await loadFullUserContext(session.user.id)
    const systemPrompt = buildSystemPrompt(context)

    const accept = (req.headers.get('accept') || '').toLowerCase()
    const wantsStream = accept.includes('text/event-stream')

    const model = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-4o-mini'
    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: question },
    ]

    // Estimate cost (2x for user)
    const estimateCents = costCentsEstimateFromText(model, `${systemPrompt}\n${question}`, 1000 * 4)
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

    if (wallet.totalAvailableCents < userCostCents) {
      return NextResponse.json(
        {
          error: 'Insufficient credits',
          estimatedCost: userCostCents,
          availableCredits: wallet.totalAvailableCents,
        },
        { status: 402 }
      )
    }

    if (wantsStream) {
      const enc = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          let full = ''
          try {
            const completion = await openai.chat.completions.create({
              model,
              temperature: 0.7,
              max_tokens: 1000,
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

            // Charge actual cost (2x)
            try {
              const actualCents = costCentsEstimateFromText(model, `${systemPrompt}\n${question}`, full.length * 4)
              const actualUserCostCents = actualCents * 2
              await cm.chargeCents(actualUserCostCents)
            } catch (err) {
              console.error('[voice-chat] Failed to charge wallet:', err)
            }

            controller.enqueue(enc.encode('event: end\n\n'))
            controller.close()
          } catch (err: any) {
            console.error('[voice-chat] Stream error:', err)
            controller.enqueue(enc.encode(`data: Error: ${err.message || 'Unknown error'}\n\n`))
            controller.enqueue(enc.encode('event: end\n\n'))
            controller.close()
          }
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
        max_tokens: 1000,
        temperature: 0.7,
      })

      // Charge user (2x cost)
      const userCostCents = wrapped.costCents * 2
      await cm.chargeCents(userCostCents)

      const assistantMessage = wrapped.completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

      return NextResponse.json({
        assistant: assistantMessage,
        estimatedCost: userCostCents,
      })
    }
  } catch (err: any) {
    console.error('[voice-chat] Error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

