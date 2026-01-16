import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.practitionerAccount.findUnique({
    where: { userId: session.user.id },
  })

  if (existing) {
    return NextResponse.json({ account: existing })
  }

  const created = await prisma.practitionerAccount.create({
    data: {
      userId: session.user.id,
      contactEmail: session.user.email.toLowerCase(),
    },
  })

  return NextResponse.json({ account: created })
}
