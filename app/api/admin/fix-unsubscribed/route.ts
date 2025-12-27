import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

/**
 * Admin endpoint to manually mark waitlist entries as unsubscribed
 * This fixes cases where someone unsubscribed before the column existed
 */
export async function POST(request: NextRequest) {
  try {
    // JWT authentication check
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Ensure column exists
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Waitlist" 
      ADD COLUMN IF NOT EXISTS "unsubscribed" BOOLEAN NOT NULL DEFAULT false
    `).catch(() => {})

    // Mark as unsubscribed using raw SQL
    const escapedEmail = normalizedEmail.replace(/'/g, "''")
    await prisma.$executeRawUnsafe(`
      UPDATE "Waitlist" 
      SET unsubscribed = true 
      WHERE LOWER(email) = LOWER('${escapedEmail}')
    `)

    return NextResponse.json({ 
      success: true,
      message: `Marked ${normalizedEmail} as unsubscribed`
    })

  } catch (error: any) {
    console.error('Error marking as unsubscribed:', error)
    return NextResponse.json(
      { error: 'Failed to mark as unsubscribed: ' + (error?.message || 'Unknown error') },
      { status: 500 }
    )
  }
}

