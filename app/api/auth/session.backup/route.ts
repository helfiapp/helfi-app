import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { createSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    console.log('=== SESSION BRIDGE API CALLED ===')
    
    // Get NextAuth session
    const session = await getServerSession(authOptions)
    console.log('NextAuth session:', session ? 'EXISTS' : 'NONE')
    
    if (!session?.user?.email) {
      return NextResponse.json({ 
        error: 'No valid NextAuth session',
        redirect: '/auth/signin'
      }, { status: 401 })
    }
    
    console.log('Creating custom session for:', session.user.email)
    
    // Get the most recent session for this user from NextAuth
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        sessions: {
          orderBy: { expires: 'desc' },
          take: 1
        }
      }
    })
    
    if (!user || user.sessions.length === 0) {
      return NextResponse.json({ 
        error: 'No database session found',
        details: 'NextAuth session exists but no database session'
      }, { status: 500 })
    }
    
    const dbSession = user.sessions[0]
    console.log('Found database session:', dbSession.sessionToken.substring(0, 8) + '...')
    
    // Create response with proper cookie
    const response = NextResponse.json({
      success: true,
      message: 'Custom session cookie set',
      userEmail: session.user.email,
      sessionToken: dbSession.sessionToken.substring(0, 8) + '...',
      expires: dbSession.expires
    })
    
    // Set the session cookie with proper settings
    response.cookies.set('helfi-session', dbSession.sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
      domain: '.helfi.ai' // Allow on all subdomains
    })
    
    console.log('✅ Session cookie set successfully')
    
    return response
    
  } catch (error) {
    console.error('Session bridge error:', error)
    return NextResponse.json({
      error: 'Failed to create session bridge',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    console.log('=== SESSION DELETION ENDPOINT ===')
    
    // Get session token from cookie
    const cookies = request.headers.get('cookie') || ''
    const sessionMatch = cookies.match(/helfi-session=([^;]+)/)
    const sessionToken = sessionMatch ? sessionMatch[1] : null
    
    if (sessionToken) {
      // Delete custom session from database
      const { deleteSession } = await import('@/lib/session')
      await deleteSession(sessionToken)
      console.log('Custom session deleted')
    }
    
    // Create response and clear the cookie
    const response = NextResponse.json({ success: true, message: 'Session deleted' })
    response.cookies.set('helfi-session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/'
    })
    
    return response
    
  } catch (error) {
    console.error('Error deleting custom session:', error)
    return NextResponse.json({
      error: 'Failed to delete session',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 