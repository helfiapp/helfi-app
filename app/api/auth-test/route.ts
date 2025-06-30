import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    console.log('=== AUTH TEST DEBUG START ===')
    console.log('Request URL:', request.url)
    console.log('Request headers:', Object.fromEntries(request.headers.entries()))
    
    // Test NextAuth session
    const session = await getServerSession(authOptions)
    
    console.log('NextAuth session result:', session)
    console.log('Session user:', session?.user)
    console.log('Session user email:', session?.user?.email)
    
    // Return detailed debug info
    return NextResponse.json({
      debug: 'Authentication Test Endpoint',
      timestamp: new Date().toISOString(),
      session: session,
      sessionExists: !!session,
      userExists: !!session?.user,
      userEmail: session?.user?.email || null,
      authOptionsConfigured: {
        hasProviders: !!authOptions.providers && authOptions.providers.length > 0,
        sessionStrategy: authOptions.session?.strategy || 'default',
        hasSecret: !!authOptions.secret,
        debugEnabled: authOptions.debug || false
      },
      headers: {
        authorization: request.headers.get('authorization') || null,
        cookie: request.headers.get('cookie') || null,
        userAgent: request.headers.get('user-agent') || null
      }
    })
    
  } catch (error) {
    console.error('Auth test error:', error)
    return NextResponse.json({ 
      error: 'Auth test failed', 
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
} 