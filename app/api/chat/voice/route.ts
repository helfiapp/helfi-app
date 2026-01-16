import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { logAIUsage } from '@/lib/ai-usage-logger'
import { buildFoodDiarySnapshot, FoodDiarySnapshot } from '@/lib/food-diary-context'
import {
  ensureTalkToAITables,
  listMessages,
  appendMessage,
  createThread,
  updateThreadTitle,
  listThreads,
  getThreadChargeStatus,
  markThreadCharged,
  normalizeChatContext,
} from '@/lib/talk-to-ai-chat-store'
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits'
import { isSubscriptionActive } from '@/lib/subscription-utils'

const VOICE_CHAT_COST_CENTS = 10
const MEMORY_MATCH_LIMIT = 12
const MEMORY_FALLBACK_LIMIT = 8
const MEMORY_SNIPPET_MAX = 200
const MEMORY_STOP_WORDS = new Set([
  'a', 'about', 'after', 'again', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at', 'be',
  'because', 'been', 'before', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'done',
  'for', 'from', 'get', 'got', 'had', 'has', 'have', 'having', 'help', 'her', 'here', 'hers',
  'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'like', 'me', 'my',
  'myself', 'not', 'of', 'on', 'one', 'or', 'our', 'ours', 'ourselves', 'out', 'over', 'please',
  'said', 'same', 'she', 'should', 'so', 'some', 'something', 'that', 'the', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'to', 'too', 'up', 'us', 'very', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'you', 'your', 'yours',
])

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

function clipMemoryText(value: string, max = MEMORY_SNIPPET_MAX) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, Math.max(0, max - 3)).trim()}...`
}

function extractKeywords(text: string) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !MEMORY_STOP_WORDS.has(word))
  const unique = Array.from(new Set(words))
  return unique.slice(0, 8)
}

async function loadChatMemorySnippets(
  userId: string,
  question: string,
  threadId: string | undefined,
  context: string
) {
  await ensureTalkToAITables()

  const normalizedContext = normalizeChatContext(context)
  const keywords = extractKeywords(question)
  let rows: Array<{ content: string; createdAt: Date }> = []

  if (keywords.length) {
    const patterns = keywords.map((word) => `%${word}%`)
    const params: Array<string | string[]> = [userId, patterns]
    let query =
      `SELECT m."content", m."createdAt"
       FROM "TalkToAIChatMessage" m
       JOIN "TalkToAIChatThread" t ON t."id" = m."threadId"
       WHERE t."userId" = $1 AND m."role" = 'user' AND m."content" ILIKE ANY($2)`
    if (normalizedContext === 'food') {
      query += ' AND t."context" = $3'
      params.push(normalizedContext)
    } else {
      query += ' AND (t."context" IS NULL OR t."context" = $3)'
      params.push(normalizedContext)
    }
    if (threadId) {
      query += ' AND m."threadId" <> $4'
      params.push(threadId)
    }
    query += ` ORDER BY m."createdAt" DESC LIMIT ${MEMORY_MATCH_LIMIT}`
    rows = await prisma
      .$queryRawUnsafe<Array<{ content: string; createdAt: Date }>>(query, ...params)
      .catch(() => [])
  }

  if (!rows.length) {
    const params: Array<string> = [userId]
    let query =
      `SELECT m."content", m."createdAt"
       FROM "TalkToAIChatMessage" m
       JOIN "TalkToAIChatThread" t ON t."id" = m."threadId"
       WHERE t."userId" = $1 AND m."role" = 'user'`
    if (normalizedContext === 'food') {
      query += ' AND t."context" = $2'
      params.push(normalizedContext)
    } else {
      query += ' AND (t."context" IS NULL OR t."context" = $2)'
      params.push(normalizedContext)
    }
    if (threadId) {
      query += ' AND m."threadId" <> $3'
      params.push(threadId)
    }
    query += ` ORDER BY m."createdAt" DESC LIMIT ${MEMORY_FALLBACK_LIMIT}`
    rows = await prisma
      .$queryRawUnsafe<Array<{ content: string; createdAt: Date }>>(query, ...params)
      .catch(() => [])
  }

  return rows
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

const isValidDateString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const formatMacroValue = (value: number | null, unit: 'kcal' | 'g') => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
  const rounded = unit === 'kcal' ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${unit}`
}

const formatRemaining = (value: FoodDiarySnapshot['remaining'][keyof FoodDiarySnapshot['remaining']]) => {
  if (!value) return 'N/A'
  const remaining = typeof value.remainingClamped === 'number' ? value.remainingClamped : value.remaining
  const over = value.overBy
  if (typeof over === 'number' && over > 0) return `Over by ${Math.round(over * 10) / 10}`
  if (typeof remaining === 'number') return `${Math.round(remaining * 10) / 10} left`
  return 'N/A'
}

function buildSystemPrompt(
  context: Awaited<ReturnType<typeof loadFullUserContext>>,
  foodDiarySnapshot: FoodDiarySnapshot | null,
): string {
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

  if (foodDiarySnapshot) {
    parts.push('FOOD DIARY SNAPSHOT (TODAY):')
    parts.push(`- Local date: ${foodDiarySnapshot.localDate}`)
    parts.push(`- Logged entries counted: ${foodDiarySnapshot.logCount}`)
    parts.push(
      `- Consumed: ${formatMacroValue(foodDiarySnapshot.totals.calories, 'kcal')}, ` +
      `${formatMacroValue(foodDiarySnapshot.totals.protein_g, 'g')} protein, ` +
      `${formatMacroValue(foodDiarySnapshot.totals.carbs_g, 'g')} carbs, ` +
      `${formatMacroValue(foodDiarySnapshot.totals.fat_g, 'g')} fat, ` +
      `${formatMacroValue(foodDiarySnapshot.totals.fiber_g, 'g')} fiber, ` +
      `${formatMacroValue(foodDiarySnapshot.totals.sugar_g, 'g')} sugar`,
    )
    parts.push(
      `- Targets: ${formatMacroValue(foodDiarySnapshot.targets.calories, 'kcal')}, ` +
      `${formatMacroValue(foodDiarySnapshot.targets.protein_g, 'g')} protein, ` +
      `${formatMacroValue(foodDiarySnapshot.targets.carbs_g, 'g')} carbs, ` +
      `${formatMacroValue(foodDiarySnapshot.targets.fat_g, 'g')} fat, ` +
      `${formatMacroValue(foodDiarySnapshot.targets.fiber_g, 'g')} fiber, ` +
      `${formatMacroValue(foodDiarySnapshot.targets.sugar_g, 'g')} sugar (max)`,
    )
    parts.push(
      `- Remaining: ${formatRemaining(foodDiarySnapshot.remaining.calories)} kcal, ` +
      `${formatRemaining(foodDiarySnapshot.remaining.protein_g)} protein, ` +
      `${formatRemaining(foodDiarySnapshot.remaining.carbs_g)} carbs, ` +
      `${formatRemaining(foodDiarySnapshot.remaining.fat_g)} fat, ` +
      `${formatRemaining(foodDiarySnapshot.remaining.fiber_g)} fiber, ` +
      `${formatRemaining(foodDiarySnapshot.remaining.sugar_g)} sugar`,
    )
    if (foodDiarySnapshot.priority.low.length > 0) {
      parts.push(`- Priority focus (most behind): ${foodDiarySnapshot.priority.low.join(', ')}`)
    }
    if (foodDiarySnapshot.priority.nearCap.length > 0) {
      parts.push(`- Near/over cap: ${foodDiarySnapshot.priority.nearCap.join(', ')}`)
    }
    parts.push('')
  }

  parts.push(
    'CLINICAL STYLE (CRITICAL):',
    '- Act like a careful primary care clinician talking to a patient.',
    '- When a new symptom is raised, start with 3-6 short, targeted questions before long advice.',
    '- Use the user\'s medications, supplements, goals, recent logs, and issues to shape your questions and guidance.',
    '- Surface likely interactions or triggers (heat, dehydration, sleep loss, exercise, alcohol/caffeine) without being asked.',
    '- Keep responses concise and focused. Aim for <120 words unless the user asks for detail.',
    '',
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
    '- Do NOT use single asterisks for italics',
    '- Never put list markers or asterisks on their own line',
    '- NEVER write responses as one continuous paragraph',
    '- Keep paragraphs to 2-4 sentences maximum',
    '- Break up long explanations into multiple paragraphs',
    '- If your response is longer than 3 sentences, you MUST break it into multiple paragraphs',
    '- Every 2-3 sentences should be followed by a blank line',
    '',
    'USER DATA USAGE:',
    '- Only reference user data when directly relevant to their question',
    '- If asked about food, macros, or meal ideas, use the FOOD DIARY SNAPSHOT to guide suggestions',
    '- Prioritize nutrients that are most behind target; avoid nutrients at or over cap',
    '- Mention micronutrients only when they are provided; otherwise say they are unavailable',
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

function buildFoodSystemPrompt(foodDiarySnapshot: FoodDiarySnapshot | null): string {
  const snapshotText = foodDiarySnapshot ? JSON.stringify(foodDiarySnapshot) : 'null'
  return [
    'You are Helfi, a food and macro coach.',
    'Use the FOOD DIARY SNAPSHOT to focus on nutrients that are most behind target.',
    'Avoid suggestions that would worsen nutrients at or over cap.',
    'Give clear, simple food options the user can eat right now.',
    'If micronutrients are unknown, say they are unavailable.',
    `FOOD DIARY SNAPSHOT (JSON): ${snapshotText}`,
  ].join('\n')
}

const MAX_HISTORY_MESSAGES = 16
const MAX_MESSAGE_CHARS = 2000

const trimMessageContent = (value: string) => {
  const text = String(value || '')
  if (text.length <= MAX_MESSAGE_CHARS) return text
  return `${text.slice(0, MAX_MESSAGE_CHARS).trim()}...`
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

    // Get or create thread
    await ensureTalkToAITables()
    const chatContext = normalizeChatContext(body?.entryContext ?? body?.context)
    const isFoodChat = chatContext === 'food'
    let threadId: string
    if (body.newThread) {
      // Create new thread only if explicitly requested
      const thread = await createThread(session.user.id, undefined, chatContext)
      threadId = thread.id
    } else if (body.threadId) {
      // Use existing thread
      threadId = body.threadId
    } else {
      // Get most recent thread or create new one ONLY if no threads exist
      const threads = await listThreads(session.user.id, chatContext)
      if (threads.length > 0) {
        threadId = threads[0].id
      } else {
        // Only create if truly no threads exist
        const thread = await createThread(session.user.id, undefined, chatContext)
        threadId = thread.id
      }
    }

    const threadAlreadyCharged = await getThreadChargeStatus(threadId)
    const shouldCharge = !threadAlreadyCharged
    const hasFreeChatCredits = shouldCharge ? await hasFreeCredits(user.id, 'VOICE_CHAT') : false
    const allowViaFreeUse = shouldCharge && !isPremium && !hasPurchasedCredits && hasFreeChatCredits
    if (shouldCharge && !isPremium && !hasPurchasedCredits && !hasFreeChatCredits) {
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

    // Load message history for context
    const history = await listMessages(threadId, isFoodChat ? MAX_HISTORY_MESSAGES : 30)
    const historyMessages = history.map((m) => ({
      role: m.role,
      content: trimMessageContent(m.content),
    }))
    const memorySnippets = isFoodChat
      ? []
      : await loadChatMemorySnippets(session.user.id, question, threadId, chatContext)

    const resolvedTzOffset =
      Number.isFinite(Number(body?.tzOffsetMin)) ? Number(body.tzOffsetMin) : new Date().getTimezoneOffset()
    const requestedLocalDate = typeof body?.localDate === 'string' ? body.localDate.trim() : ''
    const resolvedLocalDate = isValidDateString(requestedLocalDate)
      ? requestedLocalDate
      : new Date(Date.now() - resolvedTzOffset * 60 * 1000).toISOString().slice(0, 10)

    // Load full user context
    const context = isFoodChat ? null : await loadFullUserContext(session.user.id)
    const foodDiarySnapshot = await buildFoodDiarySnapshot({
      userId: session.user.id,
      localDate: resolvedLocalDate,
      tzOffsetMin: resolvedTzOffset,
    })
    let systemPrompt = isFoodChat
      ? buildFoodSystemPrompt(foodDiarySnapshot)
      : buildSystemPrompt(context, foodDiarySnapshot)

    // Optional additional focus: a health tip summary passed from inline chat (e.g. on Health Tips page)
    const healthTipSummary =
      typeof body?.healthTipSummary === 'string' ? body.healthTipSummary.trim() : ''
    if (healthTipSummary) {
      systemPrompt += `\n\nCURRENT HEALTH TIP CONTEXT (IMPORTANT):\n${healthTipSummary}\n\nWhen the user asks questions in this chat, assume they are asking follow-up questions about this specific tip unless they clearly change the subject.`
    }

    if (!isFoodChat && memorySnippets.length) {
      const memoryLines = memorySnippets
        .slice(0, 10)
        .map((item) => `- ${item.createdAt.toISOString().slice(0, 10)}: ${clipMemoryText(item.content)}`)
      systemPrompt += `\n\nPAST CHAT MEMORY (saved conversations):\n${memoryLines.join('\n')}\n\nIf any memory looks unclear or outdated, ask the user to confirm before relying on it.`
    }

    const accept = (req.headers.get('accept') || '').toLowerCase()
    const wantsStream = accept.includes('text/event-stream')

    const model = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-5.2'
    // Add formatting reminder to user message for better compliance
    const trimmedQuestion = trimMessageContent(question)
    const enhancedQuestion = `${trimmedQuestion}\n\nPlease format your response with proper paragraphs, line breaks, and structure. Keep it concise and ask any clarifying questions first.`
    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...historyMessages,
      { role: 'user' as const, content: enhancedQuestion },
    ]

    // Save user message
    await appendMessage(threadId, 'user', question)

    // Auto-generate title from first message if thread has no title
    const threads = await listThreads(session.user.id, chatContext)
    const currentThread = threads.find(t => t.id === threadId)
    if (currentThread && !currentThread.title) {
      const title = question.length > 50 ? question.substring(0, 47) + '...' : question
      await updateThreadTitle(threadId, title)
    }

    // Check wallet
    const cm = new CreditManager(user.id)
    const wallet = await cm.getWalletStatus()

    // If only estimating, return cost
    if (body?.estimateOnly) {
      return NextResponse.json({
        estimatedCost: shouldCharge ? (allowViaFreeUse ? 0 : VOICE_CHAT_COST_CENTS) : 0,
        availableCredits: wallet.totalAvailableCents,
        freeUseApplied: allowViaFreeUse,
      })
    }

    if (shouldCharge && !allowViaFreeUse && wallet.totalAvailableCents < VOICE_CHAT_COST_CENTS) {
      return NextResponse.json(
        {
          error: 'Insufficient credits',
          estimatedCost: VOICE_CHAT_COST_CENTS,
          availableCredits: wallet.totalAvailableCents,
        },
        { status: 402 }
      )
    }

    const maxTokens = 500

    if (wantsStream) {
      const wrapped = await chatCompletionWithCost(openai, {
        model,
        messages: chatMessages,
        max_tokens: maxTokens,
        temperature: 0.3,
      } as any)

      const assistantMessage =
        wrapped.completion.choices?.[0]?.message?.content ||
        'I apologize, but I could not generate a response.'

      const apiCostCents = wrapped.costCents * 2
      const chargedCents = shouldCharge ? (allowViaFreeUse ? 0 : VOICE_CHAT_COST_CENTS) : 0
      if (shouldCharge) {
        if (!allowViaFreeUse) {
          const ok = await cm.chargeCents(chargedCents)
          if (!ok) {
            return NextResponse.json(
              {
                error: 'Insufficient credits',
                estimatedCost: VOICE_CHAT_COST_CENTS,
                availableCredits: wallet.totalAvailableCents,
              },
              { status: 402 }
            )
          }
        } else {
          await consumeFreeCredit(user.id, 'VOICE_CHAT')
        }
        await markThreadCharged(threadId)
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
          costCents: apiCostCents,
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
          const chargePayload = JSON.stringify({ chargedCents, chargedOnce: true })
          controller.enqueue(enc.encode(`event: charged\ndata: ${chargePayload}\n\n`))
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
        temperature: 0.3,
      })

      const apiCostCents = wrapped.costCents * 2
      const chargedCents = shouldCharge ? (allowViaFreeUse ? 0 : VOICE_CHAT_COST_CENTS) : 0
      if (shouldCharge) {
        if (!allowViaFreeUse) {
          const ok = await cm.chargeCents(chargedCents)
          if (!ok) {
            return NextResponse.json(
              {
                error: 'Insufficient credits',
                estimatedCost: VOICE_CHAT_COST_CENTS,
                availableCredits: wallet.totalAvailableCents,
              },
              { status: 402 }
            )
          }
        } else {
          await consumeFreeCredit(user.id, 'VOICE_CHAT')
        }
        await markThreadCharged(threadId)
      }

      // Log AI usage for cost tracking (voice chat, non-streaming)
      try {
        await logAIUsage({
          context: { feature: 'voice:chat', userId: user.id },
          model,
          promptTokens: wrapped.promptTokens,
          completionTokens: wrapped.completionTokens,
          costCents: apiCostCents,
        })
      } catch {
        // Ignore logging failures
      }

      const assistantMessage = wrapped.completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

      // Save assistant message
      await appendMessage(threadId, 'assistant', assistantMessage)

      return NextResponse.json({
        assistant: assistantMessage,
        estimatedCost: chargedCents,
        chargedCostCents: chargedCents,
        chargedOnce: true,
        threadId,
      })
    }
  } catch (err: any) {
    console.error('[voice-chat] Error:', err)
    const message = String(err?.message || '')
    const lower = message.toLowerCase()
    if (lower.includes('tokens') && lower.includes('limit')) {
      return NextResponse.json(
        { error: 'That chat is too long. Please start a new chat and try again.' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
