import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

export async function POST(request: NextRequest) {
  try {
    const { email, name } = await request.json()
    const normalizedEmail = (email || '').trim().toLowerCase()
    const normalizedName = (name || '').trim()

    if (!normalizedEmail || !normalizedName) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      )
    }

    // Check if email already exists
    const existingEntry = await prisma.waitlist.findUnique({
      where: { email: normalizedEmail }
    })

    if (existingEntry) {
      // Return a friendly success message to avoid alarming users
      return NextResponse.json({
        success: true,
        message: 'You\'re already on the waitlist. We\'ll notify you when we go live.'
      })
    }

    // Add to waitlist
    const waitlistEntry = await prisma.waitlist.create({
      data: {
        email: normalizedEmail,
        name: normalizedName
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

export async function DELETE(request: NextRequest) {
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

    const { id } = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: 'Waitlist entry ID is required' },
        { status: 400 }
      )
    }

    // Delete the waitlist entry
    await prisma.waitlist.delete({
      where: { id }
    })

    return NextResponse.json({ 
      success: true,
      message: 'Waitlist entry deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting waitlist entry:', error)
    return NextResponse.json(
      { error: 'Failed to delete waitlist entry' },
      { status: 500 }
    )
  }
} 