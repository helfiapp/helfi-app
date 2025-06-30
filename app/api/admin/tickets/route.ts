import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

const prisma = new PrismaClient()

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
    
    // Allow temporary admin token during transition
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
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
    const status = searchParams.get('status') || 'all'
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
    // JWT authentication check
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    // Allow temporary admin token during transition
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
            adminId: 'temp-admin-id'
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
        // TODO: Implement email sending logic here

        return NextResponse.json({ response })

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