import { getServerSession } from 'next-auth'
import type { NextRequest } from 'next/server'

import { authOptions } from '@/lib/auth'
import { isHealthSetupComplete } from '@/lib/health-setup-completion'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'

export type WeeklyReportRequestUser = {
  id: string
  email: string | null
}

export async function getWeeklyReportRequestUser(request?: NextRequest): Promise<WeeklyReportRequestUser | null> {
  const session = await getServerSession(authOptions)
  if (session?.user?.id) {
    return {
      id: session.user.id,
      email: session.user.email ? String(session.user.email) : null,
    }
  }

  if (!request) return null

  const nativeUserId = await getUserIdFromNativeAuth(request)
  if (!nativeUserId) return null

  const user = await prisma.user.findUnique({
    where: { id: nativeUserId },
    select: { id: true, email: true },
  })

  if (!user?.id) return null
  return {
    id: user.id,
    email: user.email || null,
  }
}

export async function isWeeklyReportHealthSetupComplete(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      gender: true,
      weight: true,
      height: true,
      healthGoals: {
        select: { name: true },
      },
    },
  })

  if (!user) return false
  return isHealthSetupComplete({
    gender: user.gender,
    weight: user.weight,
    height: user.height,
    goals: user.healthGoals,
  })
}
