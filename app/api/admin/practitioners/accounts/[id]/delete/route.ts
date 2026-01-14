import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const confirm = body?.confirm ? String(body.confirm).trim() : ''
  if (confirm !== 'DELETE') {
    return NextResponse.json({ error: 'Confirmation text does not match.' }, { status: 400 })
  }

  const account = await prisma.practitionerAccount.findUnique({
    where: { id: params.id },
  })

  if (!account) {
    return NextResponse.json({ error: 'Practitioner account not found.' }, { status: 404 })
  }

  await prisma.user.delete({
    where: { id: account.userId },
  })

  return NextResponse.json({ success: true })
}
