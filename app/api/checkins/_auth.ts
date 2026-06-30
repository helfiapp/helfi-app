import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'

export async function getCheckinUser(req: NextRequest) {
  const nativeUserId = await getUserIdFromNativeAuth(req)
  if (nativeUserId) {
    return prisma.user.findUnique({ where: { id: nativeUserId } })
  }

  const session = await getServerSession(authOptions)
  const email = String(session?.user?.email || '').trim().toLowerCase()
  if (!email) return null

  return prisma.user.findUnique({ where: { email } })
}
