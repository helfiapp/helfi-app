import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'
import { ensureHealthJournalSchema } from '@/lib/health-journal-db'

export const dynamic = 'force-dynamic'

async function resolveHealthJournalUserId(request: NextRequest) {
  const nativeUserId = await getUserIdFromNativeAuth(request)
  if (nativeUserId) return nativeUserId

  const session = await getServerSession(authOptions)
  return session?.user?.id || null
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await resolveHealthJournalUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureHealthJournalSchema()

  const entryId = String(params?.id || '').trim()
  if (!entryId) {
    return NextResponse.json({ error: 'Missing entry id' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const content = String(body?.content || '').trim()
  if (!content) {
    return NextResponse.json({ error: 'Missing content' }, { status: 400 })
  }

  const existing = await prisma.healthJournalEntry.findFirst({
    where: { id: entryId, userId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const entry = await prisma.healthJournalEntry.update({
    where: { id: entryId },
    data: { content },
  })

  return NextResponse.json({ entry })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await resolveHealthJournalUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureHealthJournalSchema()

  const entryId = String(params?.id || '').trim()
  if (!entryId) {
    return NextResponse.json({ error: 'Missing entry id' }, { status: 400 })
  }

  const existing = await prisma.healthJournalEntry.findFirst({
    where: { id: entryId, userId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.healthJournalEntry.delete({ where: { id: entryId } })
  return NextResponse.json({ ok: true })
}
