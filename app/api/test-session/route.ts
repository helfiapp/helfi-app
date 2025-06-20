import { NextRequest, NextResponse } from 'next/server'
import { createSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    console.log('=== TEST SESSION CREATION ===')
    
    const body = await request.json()
    const { email, name } = body
    
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }
    
    console.log('Creating test session for:', email)
    
    // Create session directly in database
    const sessionToken = await createSession(email, name || email.split('@')[0])
    
    console.log('Test session created with token:', sessionToken.substring(0, 8) + '...')
    
    // Return the session token and set it as a cookie
    const response = NextResponse.json({
      success: true,
      sessionToken,
      email,
      message: 'Test session created successfully'
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
    console.error('Error creating test session:', error)
    return NextResponse.json({
      error: 'Failed to create test session',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 