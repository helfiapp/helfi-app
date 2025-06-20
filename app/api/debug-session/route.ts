import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    console.log('=== SESSION DEBUG ENDPOINT ===')
    
    // Test session retrieval
    const session = await getServerSession(authOptions)
    
    // Get headers for debugging
    const headers = Object.fromEntries(request.headers.entries())
    
    // Get cookies for debugging
    const cookies = request.headers.get('cookie') || 'No cookies'
    
    // Test environment variables
    const envCheck = {
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      DATABASE_URL: !!process.env.DATABASE_URL,
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    }
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      session: session ? {
        hasUser: !!session.user,
        userEmail: session.user?.email,
        userName: session.user?.name,
        userImage: session.user?.image
      } : null,
      sessionRaw: session,
      cookies: cookies,
      headers: {
        authorization: headers.authorization || 'None',
        'next-auth.session-token': headers['next-auth.session-token'] || 'None',
        'x-forwarded-for': headers['x-forwarded-for'] || 'None',
        host: headers.host || 'None',
        referer: headers.referer || 'None'
      },
      environment: envCheck,
      url: request.url,
      method: request.method
    }
    
    console.log('Session debug info:', JSON.stringify(debugInfo, null, 2))
    
    return NextResponse.json({
      success: true,
      authenticated: !!session?.user?.email,
      debug: debugInfo
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
    
  } catch (error) {
    console.error('Session debug error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
} 