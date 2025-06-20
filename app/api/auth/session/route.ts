import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    console.log('=== SESSION CREATION ENDPOINT ===')
    
    // Get NextAuth session
    const nextAuthSession = await getServerSession(authOptions)
    
    if (!nextAuthSession?.user?.email) {
      console.log('No NextAuth session found')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    console.log('NextAuth session found for:', nextAuthSession.user.email)
    
    // Create custom database session
    const sessionToken = await createSession(
      nextAuthSession.user.email,
      nextAuthSession.user.name || undefined,
      nextAuthSession.user.image || undefined
    )
    
    console.log('Custom session created with token:', sessionToken.substring(0, 8) + '...')
    
    // Return the session token so it can be stored in a cookie
    const response = NextResponse.json({
      success: true,
      sessionToken,
      user: {
        email: nextAuthSession.user.email,
        name: nextAuthSession.user.name,
        image: nextAuthSession.user.image
      }
    })
    
    // Set the session token as an HTTP-only cookie
    response.cookies.set('helfi-session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/'
    })
    
    return response
    
  } catch (error) {
    console.error('Error creating custom session:', error)
    return NextResponse.json({
      error: 'Failed to create session',
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