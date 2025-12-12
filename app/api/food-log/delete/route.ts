import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Delete a specific food log (by id) for the authenticated user
export async function POST(request: NextRequest) {
  try {
    let session
    let userEmail: string | null = null
    try {
      session = await getServerSession(authOptions)
      userEmail = session?.user?.email ?? null
    } catch (sessionError) {
      console.error('POST /api/food-log/delete - getServerSession failed (will try JWT fallback):', sessionError)
    }

    // Match /api/food-log GET: JWT fallback because getServerSession can be unreliable on some clients.
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
        console.error('POST /api/food-log/delete - JWT fallback failed:', tokenError)
      }
    }

    if (!userEmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({} as any))
    const id = String((body as any)?.id || '').trim()
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // Ensure the log belongs to the user
    const existing = await prisma.foodLog.findUnique({ where: { id: id as any } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await prisma.foodLog.delete({ where: { id: id as any } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/food-log/delete error', error)
    return NextResponse.json({ error: 'Failed to delete log' }, { status: 500 })
  }
}

