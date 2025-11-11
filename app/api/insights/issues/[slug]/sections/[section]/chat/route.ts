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
import { costCentsEstimateFromText } from '@/lib/cost-meter'
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
      // Create new thread
      thread = await createThread(session.user.id, context.params.slug, section)
    } else if (body.threadId) {
      // Use existing thread
      thread = { id: body.threadId }
    } else {
      // Get or create default thread (backward compatibility)
      thread = await getOrCreateThread(session.user.id, context.params.slug, section)
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
    {
      const cm = new CreditManager(session.user.id)
      const promptText = [system, ...history.map((m) => m.content)].join('\n')
      const estimateCents = costCentsEstimateFromText(model, promptText, 500 * 4)
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
            model: process.env.OPENAI_INSIGHTS_MODEL || 'gpt-4o-mini',
              temperature: 0.2,
              max_tokens: 500,
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
            await appendMessage(thread.id, 'assistant', full)
          // Post-charge actual estimated cost
          try {
            const cm = new CreditManager(session.user.id)
            const promptText = [system, ...history.map((m) => m.content)].join('\n')
            const cents = costCentsEstimateFromText(
              process.env.OPENAI_INSIGHTS_MODEL || 'gpt-4o-mini',
              promptText,
              full.length
            )
            await cm.chargeCents(cents)
          } catch {}
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
    const cm = new CreditManager(session.user.id)
    const promptText = [system, ...history.map((m) => m.content)].join('\n')
    const estimateCents = costCentsEstimateFromText(model, promptText, 500 * 4)
    const wallet = await cm.getWalletStatus()
    if (wallet.totalAvailableCents < estimateCents) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    }
    const wrapped = await chatCompletionWithCost(openai, {
      model,
      temperature: 0.2,
      max_tokens: 500,
      messages: chatMessages as any,
    } as any)
    await cm.chargeCents(wrapped.costCents).catch(() => {})
    const text = wrapped.completion.choices?.[0]?.message?.content || ''
    await appendMessage(thread.id, 'assistant', text)
    return NextResponse.json({ assistant: text })
  }
  } catch (error) {
    console.error('[chat.POST] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


