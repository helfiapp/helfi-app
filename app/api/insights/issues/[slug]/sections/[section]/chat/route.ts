import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  ensureChatTables,
  getOrCreateThread,
  listMessages,
  appendMessage,
  getOpenAIClient,
  buildSystemPrompt,
  listThreads,
  createThread,
  updateThreadTitle,
} from '@/lib/insights/chat-store'
import type { IssueSectionKey } from '@/lib/insights/issue-engine'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { capMaxTokensToBudget, estimateTokensFromText } from '@/lib/cost-meter'
import { logAIUsage } from '@/lib/ai-usage-logger'
import { chatCompletionWithCost } from '@/lib/metered-openai'

const rateMap = new Map<string, number>()
const MIN_INTERVAL_MS = 1500

export async function GET(
  _request: Request,
  context: { params: { slug: string; section: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const section = context.params.section as IssueSectionKey
    await ensureChatTables()
    const url = new URL(_request.url)
    const threadId = url.searchParams.get('threadId')
    
    if (threadId) {
      // Get specific thread messages
      const messages = await listMessages(threadId, 60)
      return NextResponse.json({ threadId, messages }, { status: 200 })
    } else {
      // Get or create default thread (backward compatibility)
      const thread = await getOrCreateThread(session.user.id, context.params.slug, section)
      const messages = await listMessages(thread.id, 60)
      return NextResponse.json({ threadId: thread.id, messages }, { status: 200 })
    }
  } catch (error) {
    console.error('[chat.GET] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: { slug: string; section: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const section = context.params.section as IssueSectionKey
    await ensureChatTables()
    const thread = await getOrCreateThread(session.user.id, context.params.slug, section)
    const { prisma } = await import('@/lib/prisma')
    await prisma.$executeRawUnsafe('DELETE FROM "InsightsChatMessage" WHERE "threadId" = $1', thread.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[chat.DELETE] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: { slug: string; section: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const contentType = request.headers.get('content-type') || ''
    let body: { message?: string; threadId?: string; newThread?: boolean } = {}
    if (contentType.includes('application/json')) {
      try {
        body = await request.json()
      } catch {}
    }
    const question = String(body?.message || '').trim()
    const section = context.params.section as IssueSectionKey
    await ensureChatTables()
    
    // Get or create thread
    let thread: { id: string }
    if (body.newThread) {
      // Create new thread only if explicitly requested
      thread = await createThread(session.user.id, context.params.slug, section)
    } else if (body.threadId) {
      // Use existing thread
      thread = { id: body.threadId }
    } else {
      // Get most recent thread or create new one ONLY if no threads exist
      const existingThreads = await listThreads(session.user.id, context.params.slug, section)
      if (existingThreads.length > 0) {
        thread = { id: existingThreads[0].id }
      } else {
        // Only create if truly no threads exist
        thread = await getOrCreateThread(session.user.id, context.params.slug, section)
      }
    }
    
    if (question) {
      await appendMessage(thread.id, 'user', question)
      // Auto-generate title from first message if thread has no title
      const threads = await listThreads(session.user.id, context.params.slug, section)
      const currentThread = threads.find(t => t.id === thread.id)
      if (currentThread && !currentThread.title) {
        const title = question.length > 50 ? question.substring(0, 47) + '...' : question
        await updateThreadTitle(thread.id, title)
      }
    }

    const accept = (request.headers.get('accept') || '').toLowerCase()
    const wantsStream = accept.includes('text/event-stream')
    const openai = getOpenAIClient()
    const system = await buildSystemPrompt(session.user.id, context.params.slug, section)

    if (!openai) {
      // Fallback without OpenAI: echo guidance
      const fallback = `I can help summarize and explain this section ("${context.params.slug}" → ${section}). Please provide a specific question.`
      await appendMessage(thread.id, 'assistant', fallback)
      if (wantsStream) {
        const stream = new ReadableStream({
          start(controller) {
            const enc = new TextEncoder()
            controller.enqueue(enc.encode(`data: ${fallback}\n\n`))
            controller.enqueue(enc.encode('event: end\n\n'))
            controller.close()
          },
        })
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
      }
      return NextResponse.json({ assistant: fallback })
    }

    // Load last messages for context
    const history = await listMessages(thread.id, 30)
    const chatMessages = [
      { role: 'system' as const, content: system },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ]

    if (wantsStream) {
      // Wallet pre-check using conservative estimate (max_tokens)
      const model = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-4o-mini'
      const promptText = [system, ...history.map((m) => m.content)].join('\n')
      const cm = new CreditManager(session.user.id)
      const wallet = await cm.getWalletStatus()
      const maxTokens = capMaxTokensToBudget(model, promptText, 500, wallet.totalAvailableCents)
      if (maxTokens <= 0) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
      }

      const wrapped = await chatCompletionWithCost(openai, {
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: chatMessages as any,
      } as any)

      const ok = await cm.chargeCents(wrapped.costCents)
      if (!ok) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
      }

      try {
        await logAIUsage({
          context: { feature: `insights:section-chat:${section}`, userId: session.user.id, issueSlug: context.params.slug },
          model,
          promptTokens: wrapped.promptTokens,
          completionTokens: wrapped.completionTokens,
          costCents: wrapped.costCents,
        })
      } catch {
        // Ignore logging failures
      }

      const text = wrapped.completion.choices?.[0]?.message?.content || ''
      await appendMessage(thread.id, 'assistant', text)

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
    const cm = new CreditManager(session.user.id)
    const promptText = [system, ...history.map((m) => m.content)].join('\n')
    const wallet = await cm.getWalletStatus()
    let maxTokens = capMaxTokensToBudget(model, promptText, 500, wallet.totalAvailableCents)
    if (maxTokens <= 0) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    }
    const wrapped = await chatCompletionWithCost(openai, {
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: chatMessages as any,
    } as any)
    const ok = await cm.chargeCents(wrapped.costCents)
    if (!ok) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    }

    // Log AI usage for non-streaming section chat
    try {
      await logAIUsage({
        context: {
          feature: `insights:section-chat:${section}`,
          userId: session.user.id,
          issueSlug: context.params.slug,
        },
        model,
        promptTokens: wrapped.promptTokens,
        completionTokens: wrapped.completionTokens,
        costCents: wrapped.costCents,
      })
    } catch {
      // Ignore logging failures
    }

    const text = wrapped.completion.choices?.[0]?.message?.content || ''
    await appendMessage(thread.id, 'assistant', text)
    return NextResponse.json({ assistant: text })
  }
  } catch (error) {
    console.error('[chat.POST] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
