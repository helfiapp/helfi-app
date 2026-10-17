import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'
import { ensureHealthJournalSchema } from '@/lib/health-journal-db'
import { nativeAssistantJournalEntryId } from '@/lib/native-assistant-action-id'

export const dynamic = 'force-dynamic'

function buildTodayLocalDate() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isValidMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value)
}

async function resolveHealthJournalUserId(request: NextRequest) {
  const nativeUserId = await getUserIdFromNativeAuth(request)
  if (nativeUserId) return nativeUserId

  const session = await getServerSession(authOptions)
  return session?.user?.id || null
}

export async function GET(request: NextRequest) {
  const userId = await resolveHealthJournalUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const readOnly = searchParams.get('voiceReadOnly') === '1'
  if (!readOnly) await ensureHealthJournalSchema()
  const dateParam = String(searchParams.get('date') || '').trim()
  const monthParam = String(searchParams.get('month') || '').trim()

  if (monthParam && isValidMonth(monthParam)) {
    const [yearText, monthText] = monthParam.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    const daysInMonth = new Date(year, Math.max(0, month - 1) + 1, 0).getDate()
    const monthStart = `${yearText}-${monthText}-01`
    const monthEnd = `${yearText}-${monthText}-${String(daysInMonth).padStart(2, '0')}`

    const rows = await prisma.healthJournalEntry.findMany({
      where: {
        userId,
        localDate: { gte: monthStart, lte: monthEnd },
      },
      distinct: ['localDate'],
      select: { localDate: true },
    })

    return NextResponse.json({ dates: rows.map((row) => row.localDate), ...(readOnly ? { readOnly: true } : {}) })
  }

  const targetDate = isValidDate(dateParam) ? dateParam : buildTodayLocalDate()
  const entries = await prisma.healthJournalEntry.findMany({
    where: { userId, localDate: targetDate },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ entries, ...(readOnly ? { readOnly: true } : {}) })
}

export async function POST(request: NextRequest) {
  const userId = await resolveHealthJournalUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureHealthJournalSchema()

  const body = await request.json().catch(() => ({}))
  const content = String(body?.content || '').trim()
  if (!content) {
    return NextResponse.json({ error: 'Missing content' }, { status: 400 })
  }

  const localDateRaw = String(body?.localDate || '').trim()
  const localDate = isValidDate(localDateRaw) ? localDateRaw : buildTodayLocalDate()

  // Optional normal client-action identity. Legacy/manual requests keep their
  // exact create behavior. Same owned action + changed content is a conflict.
  let actionEntryId: string | undefined
  if (body?.clientActionId !== undefined) {
    try { actionEntryId = nativeAssistantJournalEntryId(userId, body.clientActionId) }
    catch { return NextResponse.json({ error: 'Invalid client action identity' }, { status: 400 }) }
    const existing = await prisma.healthJournalEntry.findUnique({ where: { id: actionEntryId } })
    if (existing) {
      if (existing.userId !== userId || existing.content !== content || existing.localDate !== localDate) return NextResponse.json({ error: 'This saved action has different reviewed content.' }, { status: 409 })
      return NextResponse.json({ entry: existing, idempotentReplay: true })
    }
  }

  let entry
  try { entry = await prisma.healthJournalEntry.create({
    data: {
      ...(actionEntryId ? { id: actionEntryId } : {}),
      userId,
      content,
      localDate,
    },
  }) } catch (error: any) {
    if (!actionEntryId || error?.code !== 'P2002') throw error
    const existing = await prisma.healthJournalEntry.findUnique({ where: { id: actionEntryId } })
    if (!existing || existing.userId !== userId || existing.content !== content || existing.localDate !== localDate) return NextResponse.json({ error: 'This saved action has different reviewed content.' }, { status: 409 })
    return NextResponse.json({ entry: existing, idempotentReplay: true })
  }

  return NextResponse.json({ entry })
}
