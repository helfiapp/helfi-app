import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TicketCategory, TicketPriority } from '@prisma/client'
import { buildSupportFeedbackPrompt, processSupportTicketAutoReply, sendSupportFeedbackEmail, sendSupportTranscriptEmail } from '@/lib/support-automation'
import { getSupportAgentForTimestamp } from '@/lib/support-agents'

function normalizeCategory(value: string | undefined): TicketCategory {
  const upper = (value || '').toUpperCase()
  const allowed: TicketCategory[] = ['GENERAL', 'TECHNICAL', 'BILLING', 'ACCOUNT', 'FEATURE_REQUEST', 'BUG_REPORT', 'EMAIL']
  return allowed.includes(upper as TicketCategory) ? (upper as TicketCategory) : 'GENERAL'
}

function normalizePriority(value: string | undefined): TicketPriority {
  const upper = (value || '').toUpperCase()
  const allowed: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
  return allowed.includes(upper as TicketPriority) ? (upper as TicketPriority) : 'MEDIUM'
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get('activeOnly') !== '0'

  const whereClause: any = { userEmail: email }
  if (activeOnly) {
    whereClause.status = { notIn: ['RESOLVED', 'CLOSED'] }
  }

  const ticket = await prisma.supportTicket.findFirst({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      responses: { orderBy: { createdAt: 'asc' } },
    },
  })

  return NextResponse.json({ ticket })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  const name = session?.user?.name || ''
  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '').trim()
  const message = String(body?.message || '').trim()

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  if (action === 'create') {
    const subject = String(body?.subject || '').trim() || `Support request from ${email}`
    const category = normalizeCategory(body?.category)
    const priority = normalizePriority(body?.priority)

    const ticket = await prisma.supportTicket.create({
      data: {
        subject,
        message,
        userEmail: email,
        userName: name || undefined,
        userId: session?.user?.id || null,
        status: 'OPEN',
        priority,
        category,
      },
      include: {
        responses: { orderBy: { createdAt: 'asc' } },
      },
    })

    try {
      await processSupportTicketAutoReply({
        ticketId: ticket.id,
        latestUserMessage: message,
        source: 'app_ticket',
      })
    } catch (aiError) {
      console.error('🤖 [SUPPORT AI] Failed to auto-reply to in-app ticket:', aiError)
    }

    const updatedTicket = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json({ ticket: updatedTicket })
  }

  if (action === 'add_response') {
    const ticketId = String(body?.ticketId || '').trim()
    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId is required' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, userEmail: email },
    })
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    await prisma.ticketResponse.create({
      data: {
        ticketId,
        message,
        isAdminResponse: false,
        userEmail: email,
      },
    })

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: 'AWAITING_RESPONSE',
        updatedAt: new Date(),
      },
    })

    try {
      await processSupportTicketAutoReply({
        ticketId,
        latestUserMessage: message,
        source: 'app_reply',
      })
    } catch (aiError) {
      console.error('🤖 [SUPPORT AI] Failed to auto-reply to in-app reply:', aiError)
    }

    const updatedTicket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json({ ticket: updatedTicket })
  }

  if (action === 'end_chat') {
    const ticketId = String(body?.ticketId || '').trim()
    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId is required' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, userEmail: email },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const agent = getSupportAgentForTimestamp(new Date(ticket.createdAt || Date.now()))
    const feedbackPrompt = buildSupportFeedbackPrompt(ticket.userName, agent)
    const hasFeedbackPrompt = ticket.responses?.some((response) => response.isAdminResponse && response.message?.includes('rate your support experience'))
    if (!hasFeedbackPrompt) {
      await prisma.ticketResponse.create({
        data: {
          ticketId: ticket.id,
          message: feedbackPrompt,
          isAdminResponse: true,
          adminId: null,
        },
      })
    }

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'RESOLVED',
        updatedAt: new Date(),
      },
    })

    try {
      await sendSupportTranscriptEmail(ticket.id)
    } catch (emailError) {
      console.error('📧 [SUPPORT TRANSCRIPT] Failed to send transcript:', emailError)
    }

    const updatedTicket = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json({ ticket: updatedTicket })
  }

  if (action === 'submit_feedback') {
    const ticketId = String(body?.ticketId || '').trim()
    const rating = Number(body?.rating || 0)
    const comment = String(body?.comment || '').trim()
    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId is required' }, { status: 400 })
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'rating must be between 1 and 5' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, userEmail: email },
    })
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const feedbackMessage = [
      `[FEEDBACK] Rating: ${rating}/5`,
      comment ? `Comment: ${comment}` : 'Comment: (none)',
    ].join('\n')

    await prisma.ticketResponse.create({
      data: {
        ticketId,
        message: feedbackMessage,
        isAdminResponse: false,
        userEmail: email,
      },
    })

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: 'CLOSED',
        updatedAt: new Date(),
      },
    })

    try {
      await sendSupportFeedbackEmail({ ticketId, rating, comment })
    } catch (emailError) {
      console.error('📧 [SUPPORT FEEDBACK] Failed to send feedback email:', emailError)
    }

    const updatedTicket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json({ ticket: updatedTicket })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
