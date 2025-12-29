import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { buildSupportFeedbackPrompt, processSupportTicketAutoReply, sendSupportFeedbackEmail, sendSupportTranscriptEmail } from '@/lib/support-automation'
import { getSupportAgentForTimestamp } from '@/lib/support-agents'
import { rehydrateSupportTicket } from '@/lib/support-attachments'

function guestTokenPrefix(token: string) {
  return `guest:${token}`
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ticketId = String(searchParams.get('ticketId') || '').trim()
  const token = String(searchParams.get('token') || '').trim()
  if (!ticketId || !token) {
    return NextResponse.json({ error: 'Missing ticketId or token' }, { status: 400 })
  }

  const ticket = await prisma.supportTicket.findFirst({
    where: {
      id: ticketId,
      externalMessageId: guestTokenPrefix(token),
    },
    include: {
      responses: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  return NextResponse.json({ ticket: ticket ? rehydrateSupportTicket(ticket) : null })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '').trim()

  if (action === 'create') {
    const name = String(body?.name || '').trim()
    const email = normalizeEmail(String(body?.email || ''))
    const message = String(body?.message || '').trim()

    if (!email || !message) {
      return NextResponse.json({ error: 'Name, email, and message are required' }, { status: 400 })
    }

    const token = crypto.randomBytes(12).toString('hex')
    const ticket = await prisma.supportTicket.create({
      data: {
        subject: 'Website inquiry',
        message,
        userEmail: email,
        userName: name || undefined,
        status: 'OPEN',
        priority: 'LOW',
        category: 'GENERAL',
        externalMessageId: guestTokenPrefix(token),
      },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })

    try {
      await processSupportTicketAutoReply({
        ticketId: ticket.id,
        latestUserMessage: message,
        source: 'web_chat',
      })
    } catch (aiError) {
      console.error('🤖 [SUPPORT AI] Failed to auto-reply to inquiry chat:', aiError)
    }

    const updatedTicket = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json({
      ticket: updatedTicket ? rehydrateSupportTicket(updatedTicket) : updatedTicket,
      token,
    })
  }

  if (action === 'add_response') {
    const ticketId = String(body?.ticketId || '').trim()
    const token = String(body?.token || '').trim()
    const message = String(body?.message || '').trim()
    if (!ticketId || !token || !message) {
      return NextResponse.json({ error: 'ticketId, token, and message are required' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: ticketId,
        externalMessageId: guestTokenPrefix(token),
      },
    })
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    await prisma.ticketResponse.create({
      data: {
        ticketId,
        message,
        isAdminResponse: false,
        userEmail: ticket.userEmail,
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
        source: 'web_chat',
      })
    } catch (aiError) {
      console.error('🤖 [SUPPORT AI] Failed to auto-reply to inquiry message:', aiError)
    }

    const updatedTicket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json({ ticket: updatedTicket ? rehydrateSupportTicket(updatedTicket) : updatedTicket })
  }

  if (action === 'end_chat') {
    const ticketId = String(body?.ticketId || '').trim()
    const token = String(body?.token || '').trim()
    if (!ticketId || !token) {
      return NextResponse.json({ error: 'ticketId and token are required' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: ticketId,
        externalMessageId: guestTokenPrefix(token),
      },
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
      console.error('📧 [SUPPORT TRANSCRIPT] Failed to send inquiry transcript:', emailError)
    }

    const updatedTicket = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json({ ticket: updatedTicket ? rehydrateSupportTicket(updatedTicket) : updatedTicket })
  }

  if (action === 'submit_feedback') {
    const ticketId = String(body?.ticketId || '').trim()
    const token = String(body?.token || '').trim()
    const rating = Number(body?.rating || 0)
    const comment = String(body?.comment || '').trim()
    if (!ticketId || !token) {
      return NextResponse.json({ error: 'ticketId and token are required' }, { status: 400 })
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'rating must be between 1 and 5' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: ticketId,
        externalMessageId: guestTokenPrefix(token),
      },
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
        userEmail: ticket.userEmail,
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
      console.error('📧 [SUPPORT FEEDBACK] Failed to send inquiry feedback email:', emailError)
    }

    const updatedTicket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json({ ticket: updatedTicket ? rehydrateSupportTicket(updatedTicket) : updatedTicket })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
