import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const testToken = "c88f434eb99f5cf6a87d5c54e2bb3b4c632e6e0ae92bcf0e9c6df41bb1ce06fa"
    
    console.log('=== DIRECT TOKEN LOOKUP TEST ===')
    console.log('Looking for token:', testToken)
    
    // Direct database lookup
    const session = await prisma.session.findUnique({
      where: { sessionToken: testToken },
      include: {
        user: true
      }
    })
    
    console.log('Session found:', session ? 'YES' : 'NO')
    
    if (session) {
      console.log('Session details:', {
        id: session.id,
        userId: session.userId,
        token: session.sessionToken.substring(0, 10) + '...',
        expires: session.expires,
        userEmail: session.user.email
      })
    }
    
    // Also check all sessions for this user
    const allSessions = await prisma.session.findMany({
      where: {
        user: {
          email: "info@sonicweb.com.au"
        }
      },
      include: {
        user: true
      }
    })
    
    console.log('All sessions for user:', allSessions.length)
    
    return NextResponse.json({
      success: true,
      testToken: testToken.substring(0, 10) + '...',
      sessionFound: !!session,
      sessionDetails: session ? {
        id: session.id,
        userId: session.userId,
        tokenMatch: session.sessionToken === testToken,
        expires: session.expires,
        expired: session.expires < new Date(),
        userEmail: session.user.email
      } : null,
      allUserSessions: allSessions.map(s => ({
        id: s.id,
        token: s.sessionToken.substring(0, 10) + '...',
        expires: s.expires,
        expired: s.expires < new Date()
      }))
    })
    
  } catch (error) {
    console.error('Direct lookup error:', error)
    return NextResponse.json({
      error: 'Direct lookup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 