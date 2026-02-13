import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureSmartCoachTables } from '@/lib/smart-health-coach'

const normalizeTime = (input: unknown, fallback: string) => {
  const value = String(input || '').trim()
  const match = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (!match) return fallback
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  await ensureSmartCoachTables()

  const rows = await prisma
    .$queryRawUnsafe<
      Array<{
        enabled: boolean
        starttime: string
        endtime: string
        timezone: string
      }>
    >(
      `SELECT enabled, startTime, endTime, timezone
       FROM NotificationQuietHours
       WHERE userId = $1`,
      user.id
    )
    .catch(
      () =>
        [] as Array<{
          enabled: boolean
          starttime: string
          endtime: string
          timezone: string
        }>
    )

  if (!rows.length) {
    return NextResponse.json({
      enabled: false,
      startTime: '22:00',
      endTime: '07:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    })
  }

  return NextResponse.json({
    enabled: !!rows[0].enabled,
    startTime: normalizeTime(rows[0].starttime, '22:00'),
    endTime: normalizeTime(rows[0].endtime, '07:00'),
    timezone: rows[0].timezone || 'UTC',
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({} as any))
  const enabled = !!body?.enabled
  const startTime = normalizeTime(body?.startTime, '22:00')
  const endTime = normalizeTime(body?.endTime, '07:00')
  const timezone =
    String(body?.timezone || '').trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'UTC'

  await ensureSmartCoachTables()

  await prisma.$executeRawUnsafe(
    `INSERT INTO NotificationQuietHours (userId, enabled, startTime, endTime, timezone, updatedAt)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (userId) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       startTime = EXCLUDED.startTime,
       endTime = EXCLUDED.endTime,
       timezone = EXCLUDED.timezone,
       updatedAt = NOW()`,
    user.id,
    enabled,
    startTime,
    endTime,
    timezone
  )

  return NextResponse.json({
    success: true,
    enabled,
    startTime,
    endTime,
    timezone,
  })
}
