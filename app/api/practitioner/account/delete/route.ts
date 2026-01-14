import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const confirm = body?.confirm ? String(body.confirm).trim() : ''
  if (confirm !== 'DELETE') {
    return NextResponse.json({ error: 'Confirmation text does not match.' }, { status: 400 })
  }

  const account = await prisma.practitionerAccount.findUnique({
    where: { userId: session.user.id },
  })

  if (!account) {
    return NextResponse.json({ error: 'Practitioner account not found.' }, { status: 404 })
  }

  await prisma.user.delete({
    where: { id: session.user.id },
  })

  return NextResponse.json({ success: true })
}
