import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

// This API route uses dynamic request data and should not be statically generated
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const redactRequestHeaders = (headers: Headers) => {
  const sensitive = new Set(['authorization', 'cookie', 'set-cookie', 'x-native-token'])
  return Object.fromEntries(
    Array.from(headers.entries()).map(([key, value]) => [
      key,
      sensitive.has(key.toLowerCase()) && value ? '[REDACTED]' : value,
    ]),
  )
}

export async function GET(request: NextRequest) {
  try {
    console.log('=== AUTH TEST DEBUG START ===')
    console.log('Request URL:', request.url)
    console.log('Request headers:', redactRequestHeaders(request.headers))
    
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
        authorization: request.headers.get('authorization') ? '[REDACTED]' : null,
        cookie: request.headers.get('cookie') ? '[REDACTED]' : null,
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
