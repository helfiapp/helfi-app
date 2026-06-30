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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSymptomHistoryUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const analysisId = params.id
    if (!analysisId) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const deleted = await prisma.symptomAnalysis.deleteMany({
      where: { id: analysisId, userId: user.id },
    })

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting symptom history item:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete history item',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
