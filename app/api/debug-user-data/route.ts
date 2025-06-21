import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    console.log('=== DEBUG USER DATA SAVE ===')
    
    // Test session
    const session = await getServerSession(authOptions)
    console.log('Session check:', session ? 'EXISTS' : 'NONE')
    console.log('User email:', session?.user?.email)
    
    if (!session?.user?.email) {
      return NextResponse.json({ 
        error: 'No session',
        debug: 'Session authentication failed'
      }, { status: 401 })
    }
    
    // Test data parsing
    const data = await request.json()
    console.log('=== RECEIVED DATA ===')
    console.log('Data keys:', Object.keys(data))
    console.log('Gender:', data.gender, typeof data.gender)
    console.log('BodyType:', data.bodyType, typeof data.bodyType)
    console.log('Exercise Frequency:', data.exerciseFrequency, typeof data.exerciseFrequency)
    console.log('Exercise Types:', data.exerciseTypes, typeof data.exerciseTypes)
    console.log('Weight:', data.weight, typeof data.weight)
    console.log('Height:', data.height, typeof data.height)
    
    // Test database connection
    console.log('=== DATABASE TESTS ===')
    
    // Test 1: Simple user lookup
    try {
      const existingUser = await prisma.user.findUnique({
        where: { email: session.user.email }
      })
      console.log('User lookup:', existingUser ? 'FOUND' : 'NOT FOUND')
    } catch (dbError) {
      console.error('Database lookup error:', dbError)
      return NextResponse.json({ 
        error: 'Database lookup failed',
        debug: dbError instanceof Error ? dbError.message : 'Unknown DB error'
      }, { status: 500 })
    }
    
    // Test 2: Try basic user update with minimal data
    try {
      const updateResult = await prisma.user.updateMany({
        where: { email: session.user.email },
        data: {
          name: session.user.email.split('@')[0] // Just update name safely
        }
      })
      console.log('Basic update test:', updateResult.count > 0 ? 'SUCCESS' : 'NO ROWS')
    } catch (updateError) {
      console.error('Basic update error:', updateError)
      return NextResponse.json({ 
        error: 'Basic update failed',
        debug: updateError instanceof Error ? updateError.message : 'Unknown update error'
      }, { status: 500 })
    }
    
    // Test 3: Try enum conversion
    try {
      const enumData: any = {}
      
      if (data.gender) {
        enumData.gender = data.gender.toUpperCase()
        console.log('Gender enum conversion:', data.gender, '->', enumData.gender)
      }
      
      if (data.bodyType) {
        enumData.bodyType = data.bodyType.toUpperCase()  
        console.log('BodyType enum conversion:', data.bodyType, '->', enumData.bodyType)
      }
      
      console.log('Enum data prepared:', enumData)
    } catch (enumError) {
      console.error('Enum conversion error:', enumError)
      return NextResponse.json({ 
        error: 'Enum conversion failed',
        debug: enumError instanceof Error ? enumError.message : 'Unknown enum error'
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Diagnostic completed - check server logs for details',
      sessionExists: !!session,
      userEmail: session.user.email,
      dataReceived: Object.keys(data)
    })
    
  } catch (error) {
    console.error('=== DIAGNOSTIC ENDPOINT ERROR ===')
    console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error)
    console.error('Error message:', error instanceof Error ? error.message : String(error))
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    
    return NextResponse.json({
      error: 'Diagnostic failed',
      debug: {
        type: error instanceof Error ? error.constructor.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 10) : null
      }
    }, { status: 500 })
  }
} 