import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// This endpoint provides a lightweight view of a user's health setup status
// so that the UI can decide when to show reminders without loading the full
// onboarding payload.

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        healthGoals: {
          select: {
            name: true,
          },
        },
        supplements: {
          select: { id: true },
        },
        medications: {
          select: { id: true },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const visibleGoals = user.healthGoals.filter((goal) => !goal.name.startsWith('__'))
    const hasBasicProfile = !!(user.gender && user.weight && user.height)
    const hasGoals = visibleGoals.length > 0
    const hasOtherHealthData = user.supplements.length > 0 || user.medications.length > 0

    const complete = hasBasicProfile && hasGoals
    const partial = !complete && (hasBasicProfile || hasGoals || hasOtherHealthData)

    const reminderRecord = user.healthGoals.find(
      (goal) => goal.name === '__HEALTH_SETUP_REMINDER_DISABLED__'
    )
    const reminderDisabled = !!reminderRecord

    return NextResponse.json({
      complete,
      partial,
      reminderDisabled,
    })
  } catch (error) {
    console.error('Error in GET /api/health-setup-status:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const disableReminder = body?.disableReminder === true

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (disableReminder) {
      const existing = await prisma.healthGoal.findFirst({
        where: { userId: user.id, name: '__HEALTH_SETUP_REMINDER_DISABLED__' },
      })

      const payload = {
        disabled: true,
        updatedAt: new Date().toISOString(),
      }

      if (existing) {
        await prisma.healthGoal.update({
          where: { id: existing.id },
          data: { category: JSON.stringify(payload) },
        })
      } else {
        await prisma.healthGoal.create({
          data: {
            userId: user.id,
            name: '__HEALTH_SETUP_REMINDER_DISABLED__',
            category: JSON.stringify(payload),
            currentRating: 0,
          },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in POST /api/health-setup-status:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}


