import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const normalizeLabel = (raw: string) =>
  String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export async function GET(request: NextRequest) {
  let userEmail: string | null = null
  try {
    let session = await getServerSession(authOptions)
    userEmail = session?.user?.email ?? null

    if (!userEmail) {
      try {
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) {
          userEmail = String(token.email)
        }
      } catch (tokenError) {
        console.error('GET /api/food-log/library - JWT fallback failed:', tokenError)
      }
    }

    if (!userEmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const requestedLimit = Number(searchParams.get('limit') || 0)
    const maxUnique = clamp(Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 2000, 200, 5000)
    const scanLimit = clamp(maxUnique * 6, 1000, 15000)

    const logs = await prisma.foodLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: scanLimit,
      select: {
        id: true,
        description: true,
        name: true,
        imageUrl: true,
        nutrients: true,
        items: true,
        meal: true,
        category: true,
        localDate: true,
        createdAt: true,
      },
    })

    const seen = new Set<string>()
    const unique: typeof logs = []
    for (const log of logs) {
      const key = normalizeLabel(log.description || log.name || '')
      if (!key) continue
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(log)
      if (unique.length >= maxUnique) break
    }

    return NextResponse.json({ success: true, logs: unique, total: unique.length })
  } catch (error) {
    console.error('GET /api/food-log/library error', error)
    return NextResponse.json({ error: 'Failed to load library' }, { status: 500 })
  }
}
