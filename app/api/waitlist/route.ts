import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

export async function POST(request: NextRequest) {
  try {
    const { email, name } = await request.json()

    if (!email || !name) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      )
    }

    // Check if email already exists
    const existingEntry = await prisma.waitlist.findUnique({
      where: { email }
    })

    if (existingEntry) {
      return NextResponse.json(
        { error: 'Email already registered for waitlist' },
        { status: 409 }
      )
    }

    // Add to waitlist
    const waitlistEntry = await prisma.waitlist.create({
      data: {
        email,
        name
      }
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Successfully added to waitlist',
      id: waitlistEntry.id
    })

  } catch (error) {
    console.error('Error adding to waitlist:', error)
    return NextResponse.json(
      { error: 'Failed to add to waitlist' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // JWT authentication check (with temporary token support)
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    // Allow temporary admin token during transition
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const waitlistEntries = await prisma.waitlist.findMany({
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ waitlist: waitlistEntries })

  } catch (error) {
    console.error('Error fetching waitlist:', error)
    return NextResponse.json(
      { error: 'Failed to fetch waitlist' },
      { status: 500 }
    )
  }
} 