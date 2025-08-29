import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function ensureTable() {
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS "InsightsUserState" ("userId" TEXT PRIMARY KEY, "pinned" JSONB NOT NULL DEFAULT \'[]\', "dismissed" JSONB NOT NULL DEFAULT \'[]\', "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())'
  )
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ pinned: [], dismissed: [] }, { status: 200 })
    await ensureTable()
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT "pinned", "dismissed" FROM "InsightsUserState" WHERE "userId" = $1',
      session.user.id,
    )
    const state = rows?.[0] || { pinned: [], dismissed: [] }
    return NextResponse.json(state, { status: 200 })
  } catch (e) {
    return NextResponse.json({ pinned: [], dismissed: [] }, { status: 200 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    await ensureTable()
    const body = await request.json().catch(() => ({}))
    const { action, id } = body || {}
    if (!id || !action) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT "pinned", "dismissed" FROM "InsightsUserState" WHERE "userId" = $1',
      session.user.id,
    )
    const current = rows?.[0] || { pinned: [], dismissed: [] }
    let pinned: string[] = Array.isArray(current.pinned) ? current.pinned : []
    let dismissed: string[] = Array.isArray(current.dismissed) ? current.dismissed : []

    switch (action) {
      case 'pin':
        if (!pinned.includes(id)) pinned = [id, ...pinned].slice(0, 50)
        dismissed = dismissed.filter((x) => x !== id)
        break
      case 'unpin':
        pinned = pinned.filter((x) => x !== id)
        break
      case 'dismiss':
        if (!dismissed.includes(id)) dismissed = [id, ...dismissed].slice(0, 200)
        pinned = pinned.filter((x) => x !== id)
        break
      case 'undismiss':
        dismissed = dismissed.filter((x) => x !== id)
        break
      default:
        return NextResponse.json({ error: 'bad_action' }, { status: 400 })
    }

    await prisma.$executeRawUnsafe(
      'INSERT INTO "InsightsUserState" ("userId", "pinned", "dismissed", "updatedAt") VALUES ($1, $2::jsonb, $3::jsonb, NOW())\n       ON CONFLICT ("userId") DO UPDATE SET "pinned" = EXCLUDED."pinned", "dismissed" = EXCLUDED."dismissed", "updatedAt" = NOW()',
      session.user.id,
      JSON.stringify(pinned),
      JSON.stringify(dismissed),
    )

    return NextResponse.json({ pinned, dismissed }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


