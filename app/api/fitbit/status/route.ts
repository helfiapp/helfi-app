import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Check Fitbit connection status
 * GET /api/fitbit/status
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const fitbitAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: 'fitbit',
      },
    })

    return NextResponse.json({
      connected: !!fitbitAccount,
      fitbitUserId: fitbitAccount?.providerAccountId || null,
    })
  } catch (error) {
    console.error('❌ Error checking Fitbit status:', error)
    return NextResponse.json(
      { error: 'Failed to check Fitbit status' },
      { status: 500 }
    )
  }
}

/**
 * Disconnect Fitbit account
 * DELETE /api/fitbit/disconnect
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Delete Fitbit account
    await prisma.account.deleteMany({
      where: {
        userId: session.user.id,
        provider: 'fitbit',
      },
    })

    // Optionally delete synced Fitbit data
    await prisma.fitbitData.deleteMany({
      where: {
        userId: session.user.id,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Fitbit account disconnected',
    })
  } catch (error) {
    console.error('❌ Error disconnecting Fitbit:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect Fitbit account' },
      { status: 500 }
    )
  }
}

