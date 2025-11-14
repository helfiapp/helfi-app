import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

function getFallbackAdminEmail(authHeader: string | null) {
  if (authHeader && authHeader.includes('temp-admin-token')) {
    return (process.env.OWNER_EMAIL || 'admin@helfi.ai').toLowerCase()
  }
  return null
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    const fallbackEmail = getFallbackAdminEmail(authHeader)
    if (!admin && !fallbackEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS OwnerPushLog (
        createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
        event TEXT,
        userEmail TEXT,
        status TEXT,
        info TEXT
      )
    `)

    const rows: Array<{ createdAt: Date; event: string; userEmail: string; status: string; info: string | null }> =
      await prisma.$queryRawUnsafe(
        `SELECT createdAt, event, userEmail, status, info
         FROM OwnerPushLog
         ORDER BY createdAt DESC
         LIMIT 50`
      )

    return NextResponse.json({ logs: rows })
  } catch (e) {
    console.error('[ADMIN PUSH LOGS] error', e)
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


