export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Returns whether the currently signed-in user has an Apple login linked.
// Used to decide whether to show the "Link Apple login" prompt.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: 'apple',
    },
    select: { id: true },
  })

  return NextResponse.json({ linked: Boolean(account) })
}

