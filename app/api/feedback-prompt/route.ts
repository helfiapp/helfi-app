import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FEEDBACK_PROMPT_SEEN_KEY = '__FEEDBACK_PROMPT_SEEN__'
const FEEDBACK_PROMPT_SEEN_CATEGORY = '__SYSTEM__'

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return null
  return String(userId)
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existingMarker = await prisma.healthGoal.findFirst({
      where: {
        userId,
        name: FEEDBACK_PROMPT_SEEN_KEY,
      },
      select: { id: true },
    })

    return NextResponse.json({ seen: Boolean(existingMarker) })
  } catch (error) {
    console.error('Feedback prompt status check failed:', error)
    return NextResponse.json({ error: 'Failed to check feedback prompt status' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const userId = await getAuthenticatedUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existingMarker = await prisma.healthGoal.findFirst({
      where: {
        userId,
        name: FEEDBACK_PROMPT_SEEN_KEY,
      },
      select: { id: true },
    })

    if (existingMarker?.id) {
      await prisma.healthGoal.update({
        where: { id: existingMarker.id },
        data: {
          category: FEEDBACK_PROMPT_SEEN_CATEGORY,
          currentRating: 1,
        },
      })
    } else {
      await prisma.healthGoal.create({
        data: {
          userId,
          name: FEEDBACK_PROMPT_SEEN_KEY,
          category: FEEDBACK_PROMPT_SEEN_CATEGORY,
          currentRating: 1,
        },
      })
    }

    return NextResponse.json({ success: true, seen: true })
  } catch (error) {
    console.error('Feedback prompt status update failed:', error)
    return NextResponse.json({ error: 'Failed to update feedback prompt status' }, { status: 500 })
  }
}
