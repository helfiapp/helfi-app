import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'

async function getSymptomHistoryUser(request: NextRequest) {
  const nativeUserId = await getUserIdFromNativeAuth(request)
  if (nativeUserId) {
    return prisma.user.findUnique({ where: { id: nativeUserId } })
  }

  const session = await getServerSession(authOptions)
  const email = String(session?.user?.email || '').trim().toLowerCase()
  if (!email) return null
  return prisma.user.findUnique({ where: { email } })
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSymptomHistoryUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const user = await getSymptomHistoryUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
