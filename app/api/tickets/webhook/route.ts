import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { processSupportTicketAutoReply } from '@/lib/support-automation'

export async function POST(request: NextRequest) {
  try {
    // This webhook will receive emails from your email service
    // For now, this is a simple implementation that can be extended
    const emailData = await request.json()

    // Extract email information
    const {
      from,
      to,
      subject,
      text,
      html,
      messageId,
      date
    } = emailData

    // Parse sender information
    const senderEmail = typeof from === 'string' ? from : from?.email || from?.address
    const senderName = typeof from === 'string' ? from : from?.name || senderEmail

    if (senderEmail && senderEmail.toLowerCase() === 'support@helfi.ai') {
      return NextResponse.json({ success: true, message: 'Ignored support outbound email' })
    }

    // Check if this is a reply to an existing ticket
    const existingTicket = await prisma.supportTicket.findFirst({
      where: {
        OR: [
          { userEmail: senderEmail },
          { externalMessageId: messageId }
        ]
      },
      orderBy: { createdAt: 'desc' }
    })

    if (existingTicket && subject.toLowerCase().includes('re:')) {
      // This is a reply to an existing ticket
      await prisma.ticketResponse.create({
        data: {
          ticketId: existingTicket.id,
          message: text || html,
          isAdminResponse: false,
          userEmail: senderEmail
        }
      })

      // Update ticket status
      await prisma.supportTicket.update({
        where: { id: existingTicket.id },
        data: { 
          status: 'AWAITING_RESPONSE',
          updatedAt: new Date()
        }
      })

      try {
        await processSupportTicketAutoReply({
          ticketId: existingTicket.id,
          latestUserMessage: text || html,
          source: 'email_reply',
        })
      } catch (aiError) {
        console.error('🤖 [SUPPORT AI] Failed to auto-reply to email reply:', aiError)
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Reply added to existing ticket',
        ticketId: existingTicket.id 
      })
    } else {
      // Create new ticket
      const newTicket = await prisma.supportTicket.create({
        data: {
          subject: subject || 'No Subject',
          message: text || html || 'No message content',
          userEmail: senderEmail,
          userName: senderName,
          status: 'OPEN',
          priority: 'MEDIUM',
          category: 'EMAIL',
          externalMessageId: messageId
        }
      })

      try {
        await processSupportTicketAutoReply({
          ticketId: newTicket.id,
          latestUserMessage: text || html,
          source: 'ticket_create',
        })
      } catch (aiError) {
        console.error('🤖 [SUPPORT AI] Failed to auto-reply to email ticket:', aiError)
      }

      return NextResponse.json({ 
        success: true, 
        message: 'New ticket created',
        ticketId: newTicket.id 
      })
    }

  } catch (error: any) {
    console.error('❌ Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed: ' + error.message },
      { status: 500 }
    )
  }
} 
