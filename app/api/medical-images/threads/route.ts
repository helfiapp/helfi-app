import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import {
  listThreads,
  createThread,
  updateThreadTitle,
  updateThreadArchived,
  deleteThread,
} from '@/lib/medical-chat-store'

async function resolveMedicalChatUserId(request: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions)
  const sessionUserId = String(session?.user?.id || '').trim()
  if (sessionUserId) {
    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true },
    })
    if (user?.id) return user.id
  }

  const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
  if (sessionEmail) {
    const user = await prisma.user.findUnique({
      where: { email: sessionEmail },
      select: { id: true },
    })
    if (user?.id) return user.id
  }

  const token = await getToken({
    req: request as any,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
  }).catch(() => null)

  const tokenUserId = String(token?.sub || token?.id || '').trim()
  if (tokenUserId) {
    const user = await prisma.user.findUnique({
      where: { id: tokenUserId },
      select: { id: true },
    })
    if (user?.id) return user.id
  }

  const tokenEmail = String(token?.email || '').trim().toLowerCase()
  if (tokenEmail) {
    const user = await prisma.user.findUnique({
      where: { email: tokenEmail },
      select: { id: true },
    })
    if (user?.id) return user.id
  }

  const nativeUserId = await getUserIdFromNativeAuth(request)
  if (!nativeUserId) return null

  const nativeUser = await prisma.user.findUnique({
    where: { id: nativeUserId },
    select: { id: true },
  })
  return nativeUser?.id || null
}

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveMedicalChatUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const threads = await listThreads(userId)
    return NextResponse.json({ threads }, { status: 200 })
  } catch (error) {
    console.error('[medical-threads.GET] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveMedicalChatUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const title = String(body?.title || '').trim() || null
    const context = body?.context && typeof body.context === 'object' ? body.context : null
    const thread = await createThread(userId, context || undefined, title || undefined)
    return NextResponse.json({ threadId: thread.id }, { status: 200 })
  } catch (error) {
    console.error('[medical-threads.POST] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await resolveMedicalChatUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const threadId = String(body?.threadId || '')
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const archived = typeof body?.archived === 'boolean' ? body.archived : null
    if (!threadId) {
      return NextResponse.json({ error: 'threadId required' }, { status: 400 })
    }
    if (title) {
      await updateThreadTitle(userId, threadId, title)
    }
    if (archived !== null) {
      await updateThreadArchived(userId, threadId, archived)
    }
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[medical-threads.PATCH] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await resolveMedicalChatUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const threadId = String(body?.threadId || '')
    if (!threadId) {
      return NextResponse.json({ error: 'threadId required' }, { status: 400 })
    }
    await deleteThread(userId, threadId)
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[medical-threads.DELETE] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
