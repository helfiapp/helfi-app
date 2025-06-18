import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { HealthDatabase } from '@/lib/database'

// GET: Load user data from database
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const result = await HealthDatabase.getUserData(session.user.email)
    
    if (result.success) {
      return NextResponse.json({ data: result.data })
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
  } catch (error) {
    console.error('GET /api/user-data error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Save user data to database
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const data = await request.json()
    const result = await HealthDatabase.saveUserData(session.user.email, data)
    
    if (result.success) {
      return NextResponse.json({ success: true, data: result.data })
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
  } catch (error) {
    console.error('POST /api/user-data error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 