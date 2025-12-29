import { NextRequest, NextResponse } from 'next/server'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { Resend } from 'resend'
import { getEmailFooter } from '@/lib/email-footer'
import { prisma } from '@/lib/prisma'
import { processSupportTicketAutoReply } from '@/lib/support-automation'

// Check if database tables exist and create them if needed
async function ensureDatabaseSchema() {
  try {
    // Try to query the SupportTicket table to see if it exists
    await prisma.supportTicket.findFirst()
    return { success: true, message: 'Database schema is ready' }
  } catch (error: any) {
    console.log('🔧 Database schema needs to be created...')
    
    // If the table doesn't exist, we'll return a helpful message
    if (error.code === 'P2021' || error.message.includes('does not exist')) {
      return { 
        success: false, 
        needsSchema: true,
        message: 'Database schema needs to be deployed. Please run: npx prisma db push'
      }
    }
    
    return { success: false, message: 'Database connection error: ' + error.message }
  }
}

export async function GET(request: NextRequest) {
  try {
    // JWT authentication check
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check database schema first
    const schemaCheck = await ensureDatabaseSchema()
    if (!schemaCheck.success && schemaCheck.needsSchema) {
      return NextResponse.json({
        tickets: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalTickets: 0,
          hasNext: false,
          hasPrev: false
        },
        schemaStatus: {
          ready: false,
          message: schemaCheck.message,
          action: 'Please deploy database schema first'
        }
      })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const ticketId = searchParams.get('ticketId')
    
    // Handle single ticket retrieval
    if (action === 'get_ticket' && ticketId) {
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: ticketId },
        include: {
          user: {
            select: {
              email: true,
              name: true
            }
          },
          responses: {
            orderBy: { createdAt: 'asc' },
            include: {
              admin: {
                select: {
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      })
      
      if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
      }
      
      return NextResponse.json({ ticket })
    }
    
    // Default: Get tickets with pagination
    const rawStatus = String(searchParams.get('status') || 'all').trim()
    const normalizedStatus = rawStatus.toUpperCase()
    const allowedStatuses = new Set([
      'OPEN',
      'IN_PROGRESS',
      'AWAITING_RESPONSE',
      'RESPONDED',
      'RESOLVED',
      'CLOSED',
    ])
    const status = normalizedStatus === 'ALL' || normalizedStatus === 'ALL TICKETS' || !normalizedStatus
      ? 'all'
      : allowedStatuses.has(normalizedStatus)
        ? normalizedStatus
        : 'all'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    // Build filter conditions
    let whereClause: any = {}
    if (status !== 'all') {
      whereClause.status = status
    }

    // Get tickets with pagination
    const tickets = await prisma.supportTicket.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: {
          select: {
            email: true,
            name: true
          }
        },
        responses: {
          orderBy: { createdAt: 'asc' },
          include: {
            admin: {
              select: {
                name: true,
                email: true
              }
            }
          }
        }
      }
    })

    // Get total count for pagination
    const totalTickets = await prisma.supportTicket.count({
      where: whereClause
    })

    return NextResponse.json({
      tickets,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalTickets / limit),
        totalTickets,
        hasNext: page * limit < totalTickets,
        hasPrev: page > 1
      },
      schemaStatus: {
        ready: true,
        message: 'Database schema is ready'
      }
    })

  } catch (error: any) {
    console.error('❌ Error fetching tickets:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch tickets: ' + error.message,
        schemaStatus: {
          ready: false,
          message: 'Database error occurred'
        }
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check database schema first
    const schemaCheck = await ensureDatabaseSchema()
    if (!schemaCheck.success && schemaCheck.needsSchema) {
      return NextResponse.json({
        success: false,
        error: 'Database schema not ready',
        message: schemaCheck.message
      }, { status: 503 })
    }

    const { action, ticketId, ...data } = await request.json()

    if (action !== 'create') {
      const authHeader = request.headers.get('authorization')
      const admin = extractAdminFromHeaders(authHeader)
      if (!admin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    switch (action) {
      case 'create':
        // Create a new ticket (manual creation from admin)
        const newTicket = await prisma.supportTicket.create({
          data: {
            subject: data.subject,
            message: data.message,
            userEmail: data.userEmail,
            userName: data.userName,
            status: 'OPEN',
            priority: data.priority || 'MEDIUM',
            category: data.category || 'GENERAL'
          },
          include: {
            user: {
              select: {
                email: true,
                name: true
              }
            },
            responses: true
          }
        })

        // Send email notification to support team
        try {
          if (process.env.RESEND_API_KEY) {
            const resend = new Resend(process.env.RESEND_API_KEY)
            
            await resend.emails.send({
              from: 'Helfi Team <support@helfi.ai>',
              to: 'support@helfi.ai',
              subject: `🎫 New Support Ticket: ${newTicket.subject}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #10b981;">🎫 New Support Ticket Created</h2>
                  
                  <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin: 0 0 15px 0; color: #374151;">Ticket Details:</h3>
                    <p><strong>Ticket ID:</strong> ${newTicket.id}</p>
                    <p><strong>Subject:</strong> ${newTicket.subject}</p>
                    <p><strong>Category:</strong> ${newTicket.category}</p>
                    <p><strong>Priority:</strong> ${newTicket.priority}</p>
                    <p><strong>Status:</strong> ${newTicket.status}</p>
                    <p><strong>Created:</strong> ${new Date(newTicket.createdAt).toLocaleString()}</p>
                  </div>

                  <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin: 0 0 15px 0; color: #374151;">Customer Information:</h3>
                    <p><strong>Name:</strong> ${newTicket.userName || 'Not provided'}</p>
                    <p><strong>Email:</strong> ${newTicket.userEmail}</p>
                  </div>

                  <div style="background: #fff; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin: 0 0 15px 0; color: #374151;">Message:</h3>
                    <p style="line-height: 1.6; white-space: pre-wrap;">${newTicket.message}</p>
                  </div>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://helfi.ai/admin-panel" 
                       style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                      View in Admin Panel
                    </a>
                  </div>

                  ${getEmailFooter({ recipientEmail: 'support@helfi.ai', emailType: 'support', reasonText: 'This is an automated notification from the Helfi support system.' })}
                </div>
              `
            })
            console.log(`📧 [TICKET ALERT] Email notification sent for ticket ${newTicket.id}`)
          }
        } catch (emailError) {
          console.error('📧 [TICKET ALERT] Failed to send email notification:', emailError)
          // Don't fail the ticket creation if email fails
        }

        try {
          await processSupportTicketAutoReply({
            ticketId: newTicket.id,
            latestUserMessage: newTicket.message,
            source: 'web_ticket',
          })
        } catch (aiError) {
          console.error('🤖 [SUPPORT AI] Failed to auto-reply:', aiError)
        }

        return NextResponse.json({ ticket: newTicket })

      case 'update_status':
        const updatedTicket = await prisma.supportTicket.update({
          where: { id: ticketId },
          data: { status: data.status },
          include: {
            user: {
              select: {
                email: true,
                name: true
              }
            },
            responses: {
              include: {
                admin: {
                  select: {
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        })
        return NextResponse.json({ ticket: updatedTicket })

      case 'add_response':
        // Add admin response to ticket
        const response = await prisma.ticketResponse.create({
          data: {
            ticketId: ticketId,
            message: data.message,
            isAdminResponse: true,
            adminId: null  // Set to null instead of fake ID to avoid foreign key constraint
          }
        })

        // Update ticket status if needed
        await prisma.supportTicket.update({
          where: { id: ticketId },
          data: { 
            status: 'RESPONDED',
            updatedAt: new Date()
          }
        })

        // Send email response to user (if configured)
        try {
          // Get ticket information for email sending
          const ticket = await prisma.supportTicket.findUnique({
            where: { id: ticketId },
            select: {
              subject: true,
              userEmail: true,
              userName: true,
              createdAt: true
            }
          })

          if (process.env.RESEND_API_KEY && ticket) {
            const resend = new Resend(process.env.RESEND_API_KEY)
            
            await resend.emails.send({
              from: 'Helfi Team <support@helfi.ai>',
              to: ticket.userEmail,
              subject: `Re: ${ticket.subject}`,
              html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
                  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">Helfi</h1>
                    <p style="margin: 12px 0 0 0; opacity: 0.95; font-size: 16px;">Support Team Response</p>
                  </div>
                  
                  <div style="padding: 40px 30px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <h2 style="margin: 0 0 20px 0; color: #374151; font-size: 24px;">📬 Response to Your Support Request</h2>
                    
                    <div style="background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 16px; margin: 20px 0;">
                      <p style="margin: 0; color: #0c4a6e; font-size: 14px;">
                        <strong>📋 Regarding:</strong> ${ticket.subject}
                      </p>
                    </div>
                    
                    <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 30px 0;">
                      <h3 style="margin: 0 0 15px 0; color: #374151;">💬 Our Response:</h3>
                      <div style="line-height: 1.7; font-size: 16px; color: #4b5563; white-space: pre-wrap;">${data.message}</div>
                    </div>
                    
                    <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 30px 0;">
                      <p style="margin: 0; color: #065f46; font-size: 14px;">
                        <strong>💡 Need More Help?</strong> Simply reply to this email and we'll continue the conversation!
                      </p>
                    </div>
                    
                    <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center;">
                      <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151;"><strong>Best regards,<br>Helfi Support Team</strong></p>
                      <p style="margin: 20px 0 0 0; font-size: 14px;">
                        <a href="https://helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">🌐 helfi.ai</a> | 
                        <a href="mailto:support@helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">📧 support@helfi.ai</a>
                      </p>
                    </div>
                  </div>
                </div>
              `
            })
            
            console.log(`✅ [SUPPORT RESPONSE] Email sent to ${ticket.userEmail} for ticket ${ticketId}`)
          } else {
            console.log(`⚠️ [SUPPORT RESPONSE] Email not sent - RESEND_API_KEY: ${!!process.env.RESEND_API_KEY}, Ticket found: ${!!ticket}`)
          }
        } catch (emailError) {
          console.error(`❌ [SUPPORT RESPONSE] Failed to send email for ticket ${ticketId}:`, emailError)
          // Don't fail the API response if email fails - the response is still saved
        }

        return NextResponse.json({ response })

      case 'delete':
        // Delete a ticket and all its responses
        await prisma.ticketResponse.deleteMany({
          where: { ticketId: ticketId }
        })
        
        const deletedTicket = await prisma.supportTicket.delete({
          where: { id: ticketId }
        })
        
        return NextResponse.json({ 
          success: true, 
          message: 'Ticket deleted successfully',
          deletedTicket 
        })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error: any) {
    console.error('❌ Error handling ticket action:', error)
    return NextResponse.json(
      { error: 'Failed to process ticket action: ' + error.message },
      { status: 500 }
    )
  }
} 
