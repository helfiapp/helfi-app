import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type RouteParams = {
  params: { id: string }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = String(params.id || '')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const existing = await prisma.exerciseEntry.findUnique({ where: { id } })
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.exerciseEntry.delete({ where: { id } })

  const entries = await prisma.exerciseEntry.findMany({
    where: { userId: session.user.id, localDate: existing.localDate },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  })
  const exerciseCalories = entries.reduce((sum, e) => sum + (Number(e.calories) || 0), 0)

  return NextResponse.json({ success: true, date: existing.localDate, exerciseCalories })
}

