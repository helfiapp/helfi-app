import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    console.log('=== DEBUG SESSIONS IN DATABASE ===')
    
    // Get all sessions from database
    const sessions = await prisma.session.findMany({
      include: {
        user: {
          select: {
            email: true,
            name: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        expires: 'desc'
      },
      take: 10 // Get last 10 sessions
    })
    
    console.log(`Found ${sessions.length} sessions in database`)
    
    const sessionInfo = sessions.map(session => ({
      id: session.id.substring(0, 8) + '...',
      userEmail: session.user.email,
      userName: session.user.name,
      sessionToken: session.sessionToken.substring(0, 8) + '...',
      expires: session.expires,
      expired: session.expires < new Date(),
      userCreated: session.user.createdAt
    }))
    
    // Also check users
    const users = await prisma.user.findMany({
      select: {
        email: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            sessions: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    })
    
    console.log(`Found ${users.length} users in database`)
    
    return NextResponse.json({
      success: true,
      debug: {
        timestamp: new Date().toISOString(),
        sessionsCount: sessions.length,
        sessions: sessionInfo,
        usersCount: users.length,
        users: users,
        lastSessionCreated: sessions[0]?.expires || 'No sessions found'
      }
    })
    
  } catch (error) {
    console.error('Error debugging sessions:', error)
    return NextResponse.json({
      error: 'Failed to debug sessions',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 