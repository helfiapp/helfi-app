import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    // Get current session
    const session = await getServerSession()
    
    // Check environment variables (without exposing secrets)
    const envCheck = {
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? 'SET' : 'NOT SET',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET',
      DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
    }
    
    // Check database connectivity
    let dbStatus = 'UNKNOWN'
    try {
      await prisma.$connect()
      const userCount = await prisma.user.count()
      dbStatus = `CONNECTED (${userCount} users)`
    } catch (error) {
      dbStatus = `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
    
    // Check recent sessions
    let sessionInfo = 'No session info available'
    try {
      const sessionCount = await prisma.session.count()
      sessionInfo = `${sessionCount} sessions in database`
    } catch (error) {
      sessionInfo = `Error fetching sessions: ${error}`
    }
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      currentSession: session,
      environment: envCheck,
      database: dbStatus,
      sessionInfo,
      message: 'Authentication debug info'
    })
    
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Debug failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
} 