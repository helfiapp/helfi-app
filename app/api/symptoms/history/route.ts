import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const analyses = await prisma.symptomAnalysis.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        symptoms: true,
        duration: true,
        notes: true,
        summary: true,
        analysisText: true,
        analysisData: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ success: true, history: analyses })
  } catch (error) {
    console.error('Error fetching symptom history:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch symptom history',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const deleted = await prisma.symptomAnalysis.deleteMany({ where: { userId: user.id } })

    return NextResponse.json({
      success: true,
      message: `Deleted ${deleted.count} analyses`,
      deletedCount: deleted.count,
    })
  } catch (error) {
    console.error('Error deleting symptom history:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete symptom history',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
