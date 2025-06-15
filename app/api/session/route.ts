import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

export async function GET() {
  const session = await getServerSession()
  
  return NextResponse.json({
    authenticated: !!session,
    user: session?.user || null
  })
} 