import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureHealthJournalSchema } from '@/lib/health-journal-db'

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

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureHealthJournalSchema()

  const { searchParams } = new URL(request.url)
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
        userId: session.user.id,
        localDate: { gte: monthStart, lte: monthEnd },
      },
      distinct: ['localDate'],
      select: { localDate: true },
    })

    return NextResponse.json({ dates: rows.map((row) => row.localDate) })
  }

  const targetDate = isValidDate(dateParam) ? dateParam : buildTodayLocalDate()
  const entries = await prisma.healthJournalEntry.findMany({
    where: { userId: session.user.id, localDate: targetDate },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ entries })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
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

  const entry = await prisma.healthJournalEntry.create({
    data: {
      userId: session.user.id,
      content,
      localDate,
    },
  })

  return NextResponse.json({ entry })
}
