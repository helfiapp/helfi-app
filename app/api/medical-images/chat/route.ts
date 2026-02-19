import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { capMaxTokensToBudget } from '@/lib/cost-meter'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { logAIUsage } from '@/lib/ai-usage-logger'
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits'
import { isSubscriptionActive } from '@/lib/subscription-utils'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import {
  getThread,
  createThread,
  listMessages,
  appendMessage,
  updateThreadTitle,
  updateThreadContext,
  updateThreadCost,
} from '@/lib/medical-chat-store'

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

function buildTitle(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return 'New chat'
  return trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed
}

function extractAssistantText(wrapped: any): string {
  const message = wrapped?.completion?.choices?.[0]?.message
  const content = message?.content

  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    const combined = content
      .map((part: any) => {
        if (typeof part === 'string') return part
        if (!part || typeof part !== 'object') return ''
        if (typeof part.text === 'string') return part.text
        if (typeof part.content === 'string') return part.content
        return ''
      })
      .join('')
      .trim()
    if (combined) return combined
  }

  if (typeof message?.refusal === 'string' && message.refusal.trim()) {
    return message.refusal.trim()
  }

  return ''
}

function formatForNativePlainText(raw: string): string {
  let text = String(raw || '').replace(/\r\n/g, '\n')

  text = text.replace(/^#{1,6}\s*/gm, '')
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/\*([^*\n]+)\*/g, '$1')
  text = text.replace(/`([^`\n]+)`/g, '$1')
  text = text.replace(/^\s*[-*]\s+/gm, '• ')
  text = text.replace(/([^\n])(\d+\.\s)/g, '$1\n$2')
  text = text.replace(/([^\n])(•\s)/g, '$1\n$2')
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

function buildFallbackAssistantText(params: {
  question: string
  summary: string | null
  redFlags: string[]
  nextSteps: string[]
  topCause: { name?: string; whyLikely?: string; confidence?: string } | null
}): string {
  const question = (params.question || '').toLowerCase()
  const topCauseText = params.topCause?.name
    ? `${params.topCause.name}${params.topCause?.confidence ? ` (${params.topCause.confidence})` : ''}`
    : 'the top likely condition from your analysis'
  const topCauseWhy = params.topCause?.whyLikely || null

  const likelyDoctorTriggers = params.redFlags.length
    ? params.redFlags.slice(0, 3)
    : ['fast worsening pain', 'spreading redness', 'fever or feeling very unwell']
  const likelyHomeSteps = params.nextSteps.length
    ? params.nextSteps.slice(0, 4)
    : ['Keep the area clean and dry.', 'Take clear photos daily to track changes.', 'Avoid picking, squeezing, or scratching the area.']

  if (question.includes('red flag') || question.includes('urgent') || question.includes('emergency')) {
    return [
      '**Short answer**',
      '',
      'The key warning signs are listed below. If you notice any of them, get medical care quickly.',
      '',
      '**Why this matters**',
      '',
      '- These signs can mean the issue is getting worse.',
      '- Fast changes are safer to check early.',
      '',
      '**When to see a doctor**',
      '',
      ...likelyDoctorTriggers.map((item) => `- ${item}`),
      '- Go to urgent care or emergency now if symptoms are severe or rapidly worsening.',
      '',
      '**What you can do at home**',
      '',
      '- Monitor the area twice daily and note any changes.',
      '- Avoid irritation and keep the area protected.',
      '- This guidance does not replace an in-person medical exam.',
    ].join('\n')
  }

  return [
    '**Short answer**',
    '',
    params.summary
      ? `${params.summary}`
      : `From your analysis, the top likely condition is ${topCauseText}.`,
    '',
    '**Why this matters**',
    '',
    `- Your analysis suggests ${topCauseText}.`,
    topCauseWhy ? `- Why this may fit: ${topCauseWhy}` : '- Matching symptoms and image features help guide next steps.',
    '- Watching changes over time helps you decide when to seek care.',
    '',
    '**When to see a doctor**',
    '',
    ...likelyDoctorTriggers.map((item) => `- ${item}`),
    '- If you are unsure, booking a routine appointment is a safe next step.',
    '',
    '**What you can do at home**',
    '',
    ...likelyHomeSteps.map((step) => `- ${step}`),
    '- This information is not a diagnosis and does not replace a doctor.',
  ].join('\n')
}

async function resolveMedicalChatUser(request: NextRequest): Promise<{ id: string; email: string | null } | null> {
  const session = await getServerSession(authOptions)
  const sessionUserId = String(session?.user?.id || '').trim()
  if (sessionUserId) {
    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true, email: true },
    })
    if (user?.id) return { id: user.id, email: user.email || null }
  }

  const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
  if (sessionEmail) {
    const user = await prisma.user.findUnique({
      where: { email: sessionEmail },
      select: { id: true, email: true },
    })
    if (user?.id) return { id: user.id, email: user.email || null }
  }

  const token = await getToken({
    req: request as any,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
  }).catch(() => null)

  const tokenUserId = String(token?.sub || token?.id || '').trim()
  if (tokenUserId) {
    const user = await prisma.user.findUnique({
      where: { id: tokenUserId },
      select: { id: true, email: true },
    })
    if (user?.id) return { id: user.id, email: user.email || null }
  }

  const tokenEmail = String(token?.email || '').trim().toLowerCase()
  if (tokenEmail) {
    const user = await prisma.user.findUnique({
      where: { email: tokenEmail },
      select: { id: true, email: true },
    })
    if (user?.id) return { id: user.id, email: user.email || null }
  }

  const nativeUserId = await getUserIdFromNativeAuth(request)
  if (!nativeUserId) return null

  const nativeUser = await prisma.user.findUnique({
    where: { id: nativeUserId },
    select: { id: true, email: true },
  })
  if (!nativeUser?.id) return null
  return { id: nativeUser.id, email: nativeUser.email || null }
}

export async function GET(req: NextRequest) {
  try {
    const chatUser = await resolveMedicalChatUser(req)
    if (!chatUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL(req.url)
    const threadId = url.searchParams.get('threadId')
    if (!threadId) {
      return NextResponse.json({ error: 'threadId required' }, { status: 400 })
    }
    let thread = null as Awaited<ReturnType<typeof getThread>> | null
    let messages: Awaited<ReturnType<typeof listMessages>> = []
    try {
      thread = await getThread(chatUser.id, threadId)
      if (!thread) {
        return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
      }
      messages = await listMessages(threadId, 60)
    } catch (storageError) {
      console.error('[medical-chat.GET] storage fallback', storageError)
      messages = []
    }
    return NextResponse.json({ threadId, messages }, { status: 200 })
  } catch (error) {
    console.error('[medical-chat.GET] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const isNativeClient = Boolean(req.headers.get('x-native-token') || req.headers.get('X-Native-Token'))
    const chatUser = await resolveMedicalChatUser(req)
    if (!chatUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = req.headers.get('content-type') || ''
    let body: {
      message?: string
      threadId?: string
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

    const safeAnalysisResult =
      body?.analysisResult && typeof body.analysisResult === 'object' ? body.analysisResult : {}
    const contextPayload = { analysisResult: safeAnalysisResult }
    const hasContext = Object.keys(safeAnalysisResult || {}).length > 0

    const requestedThreadId = typeof body?.threadId === 'string' ? body.threadId.trim() : ''
    let threadId = requestedThreadId
    let thread: Awaited<ReturnType<typeof getThread>> | null = null
    let persistChatHistory = true

    try {
      thread = threadId ? await getThread(chatUser.id, threadId) : null

      if (!thread) {
        const title = buildTitle(question)
        const created = await createThread(chatUser.id, hasContext ? contextPayload : undefined, title)
        threadId = created.id
        thread = { id: created.id, title, context: hasContext ? contextPayload : null }
      } else {
        if (hasContext) {
          await updateThreadContext(chatUser.id, threadId, contextPayload)
        }
        if (!thread.title) {
          await updateThreadTitle(chatUser.id, threadId, buildTitle(question))
        }
      }
    } catch (storageError) {
      console.error('[medical-chat.POST] storage fallback', storageError)
      persistChatHistory = false
      threadId = threadId || `medical-fallback-${Date.now()}`
      thread = { id: threadId, title: buildTitle(question), context: hasContext ? contextPayload : null }
    }

    const threadContext = hasContext ? contextPayload : thread?.context || {}
    const analysisResult =
      threadContext?.analysisResult && typeof threadContext.analysisResult === 'object'
        ? threadContext.analysisResult
        : {}

    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }
    const user = await prisma.user.findUnique({
      where: { id: chatUser.id },
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
    const hasLegacyCredits = Number((user as any)?.additionalCredits || 0) > 0
    const hasPaidAccess = isPremium || hasPurchasedCredits || hasLegacyCredits
    let hasFreeChatCredits = false
    try {
      hasFreeChatCredits = await hasFreeCredits(user.id, 'MEDICAL_CHAT')
    } catch (creditError) {
      console.error('[medical-chat.POST] free-credit fallback', creditError)
      hasFreeChatCredits = false
    }
    const allowViaFreeUse = !hasPaidAccess && hasFreeChatCredits
    if (!hasPaidAccess && !hasFreeChatCredits) {
      return NextResponse.json(
        {
          error: 'Payment required',
          message: 'You\'ve used all your free medical image chat uses. Subscribe to a monthly plan or purchase credits to continue.',
          requiresPayment: true,
          exhaustedFreeCredits: true,
        },
        { status: 402 }
      )
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

    const history = persistChatHistory
      ? await listMessages(threadId, 30).catch((storageError) => {
          console.error('[medical-chat.POST] history fallback', storageError)
          persistChatHistory = false
          return []
        })
      : []
    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ]

    if (persistChatHistory) {
      await appendMessage(threadId, 'user', question).catch((storageError) => {
        console.error('[medical-chat.POST] append user fallback', storageError)
        persistChatHistory = false
      })
    }

    const possibleCauses = Array.isArray(analysisResult?.possibleCauses)
      ? analysisResult.possibleCauses.filter((item: any) => item && typeof item === 'object')
      : []
    const redFlags = Array.isArray(analysisResult?.redFlags)
      ? analysisResult.redFlags.filter((item: any) => typeof item === 'string')
      : []
    const nextSteps = Array.isArray(analysisResult?.nextSteps)
      ? analysisResult.nextSteps.filter((item: any) => typeof item === 'string')
      : []
    const fallbackText = buildFallbackAssistantText({
      question,
      summary: typeof analysisResult?.summary === 'string' ? analysisResult.summary : null,
      redFlags,
      nextSteps,
      topCause: possibleCauses[0] || null,
    })
    const finalFallbackText = isNativeClient ? formatForNativePlainText(fallbackText) : fallbackText

    if (wantsStream) {
      const model = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-4o-mini'
      const promptText = [systemPrompt, ...history.map((m) => m.content), question].join('\n')
      let maxTokens = 800
      if (!allowViaFreeUse && !hasPaidAccess) {
        try {
          const cm = new CreditManager(user.id)
          const wallet = await cm.getWalletStatus()
          const cappedMaxTokens = capMaxTokensToBudget(model, promptText, maxTokens, wallet.totalAvailableCents)
          if (cappedMaxTokens <= 0) {
            return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
          }
          maxTokens = cappedMaxTokens
        } catch (billingError) {
          return NextResponse.json({ error: 'Billing error' }, { status: 402 })
        }
      }

      let wrapped: any
      try {
        wrapped = await chatCompletionWithCost(openai, {
          model,
          temperature: 0.2,
          max_tokens: maxTokens,
          messages: chatMessages as any,
        } as any)
      } catch (aiError) {
        if (persistChatHistory) {
          await appendMessage(threadId, 'assistant', finalFallbackText).catch(() => {})
        }
        const enc = new TextEncoder()
        const chunks = finalFallbackText.match(/[\s\S]{1,200}/g) || ['']
        const costPayload = JSON.stringify({ costCents: 0, covered: true })
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(enc.encode(`data: ${chunk}\n\n`))
            }
            controller.enqueue(enc.encode(`data: __cost__${costPayload}\n\n`))
            controller.enqueue(enc.encode('event: end\n\n'))
            controller.close()
          },
        })
        console.error('[medical-chat.POST] stream AI fallback used', aiError)
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
      }

      const text = extractAssistantText(wrapped)
      if (!text) {
        if (persistChatHistory) {
          await appendMessage(threadId, 'assistant', finalFallbackText).catch(() => {})
        }
        const enc = new TextEncoder()
        const chunks = finalFallbackText.match(/[\s\S]{1,200}/g) || ['']
        const costPayload = JSON.stringify({ costCents: 0, covered: true })
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(enc.encode(`data: ${chunk}\n\n`))
            }
            controller.enqueue(enc.encode(`data: __cost__${costPayload}\n\n`))
            controller.enqueue(enc.encode('event: end\n\n'))
            controller.close()
          },
        })
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
      }
      const finalText = isNativeClient ? formatForNativePlainText(text) : text

      if (!allowViaFreeUse) {
        try {
          const cm = new CreditManager(user.id)
          const ok = await cm.chargeCents(wrapped.costCents)
          if (!ok && !hasPaidAccess) {
            return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
          }
          if (!ok && hasPaidAccess) {
            console.error('[medical-chat.POST] paid-user stream charge could not be written')
          }
        } catch (billingError) {
          if (!hasPaidAccess) {
            return NextResponse.json({ error: 'Billing error' }, { status: 402 })
          }
          console.error('[medical-chat.POST] paid-user stream charge fallback', billingError)
        }
      } else {
        try {
          await consumeFreeCredit(user.id, 'MEDICAL_CHAT')
        } catch (creditError) {
          console.error('[medical-chat.POST] consume free credit fallback', creditError)
        }
      }

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

      if (persistChatHistory) {
        await appendMessage(threadId, 'assistant', finalText).catch((storageError) => {
          console.error('[medical-chat.POST] append assistant fallback', storageError)
        })
        await updateThreadCost(chatUser.id, threadId, wrapped.costCents, allowViaFreeUse).catch((storageError) => {
          console.error('[medical-chat.POST] update cost fallback', storageError)
        })
      }
      const enc = new TextEncoder()
      const chunks = finalText.match(/[\s\S]{1,200}/g) || ['']
      const costPayload = JSON.stringify({ costCents: wrapped.costCents, covered: allowViaFreeUse })
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(enc.encode(`data: ${chunk}\n\n`))
          }
          controller.enqueue(enc.encode(`data: __cost__${costPayload}\n\n`))
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
      if (!allowViaFreeUse && !hasPaidAccess) {
        try {
          const cm = new CreditManager(user.id)
          const wallet = await cm.getWalletStatus()
          const cappedMaxTokens = capMaxTokensToBudget(
            model,
            [systemPrompt, ...history.map((m) => m.content), question].join('\n'),
            maxTokens,
            wallet.totalAvailableCents
          )
          if (cappedMaxTokens <= 0) {
            return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
          }
          maxTokens = cappedMaxTokens
        } catch (billingError) {
          return NextResponse.json({ error: 'Billing error' }, { status: 402 })
        }
      }
      let wrapped: any
      try {
        wrapped = await chatCompletionWithCost(openai, {
          model,
          temperature: 0.2,
          max_tokens: maxTokens,
          messages: chatMessages as any,
        } as any)
      } catch (aiError) {
        if (persistChatHistory) {
          await appendMessage(threadId, 'assistant', finalFallbackText).catch(() => {})
        }
        console.error('[medical-chat.POST] non-stream AI fallback used', aiError)
        return NextResponse.json({ assistant: finalFallbackText, costCents: 0, covered: true, threadId })
      }

      const text = extractAssistantText(wrapped)
      if (!text) {
        if (persistChatHistory) {
          await appendMessage(threadId, 'assistant', finalFallbackText).catch(() => {})
        }
        return NextResponse.json({ assistant: finalFallbackText, costCents: 0, covered: true, threadId })
      }
      const finalText = isNativeClient ? formatForNativePlainText(text) : text

      if (!allowViaFreeUse) {
        try {
          const cm = new CreditManager(user.id)
          const ok = await cm.chargeCents(wrapped.costCents)
          if (!ok && !hasPaidAccess) {
            return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
          }
          if (!ok && hasPaidAccess) {
            console.error('[medical-chat.POST] paid-user non-stream charge could not be written')
          }
        } catch (billingError) {
          if (!hasPaidAccess) {
            return NextResponse.json({ error: 'Billing error' }, { status: 402 })
          }
          console.error('[medical-chat.POST] paid-user non-stream charge fallback', billingError)
        }
      } else {
        try {
          await consumeFreeCredit(user.id, 'MEDICAL_CHAT')
        } catch (creditError) {
          console.error('[medical-chat.POST] consume free credit fallback', creditError)
        }
      }

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

      if (persistChatHistory) {
        await appendMessage(threadId, 'assistant', finalText).catch((storageError) => {
          console.error('[medical-chat.POST] append assistant fallback', storageError)
        })
        await updateThreadCost(chatUser.id, threadId, wrapped.costCents, allowViaFreeUse).catch((storageError) => {
          console.error('[medical-chat.POST] update cost fallback', storageError)
        })
      }
      return NextResponse.json({ assistant: finalText, costCents: wrapped.costCents, covered: allowViaFreeUse, threadId })
    }
  } catch (error) {
    console.error('[medical-images.chat.POST] error', error)
    return NextResponse.json(
      {
        assistant:
          'I had a temporary issue answering that. Please try sending your question again. If it keeps happening, tap New chat and try once more.',
        costCents: 0,
        covered: true,
      },
      { status: 200 }
    )
  }
}
