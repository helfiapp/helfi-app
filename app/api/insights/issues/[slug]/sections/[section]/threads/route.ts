import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ensureChatTables, listThreads, createThread, updateThreadTitle, deleteThread } from '@/lib/insights/chat-store'

export async function GET(
  _request: Request,
  context: { params: { slug: string; section: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await ensureChatTables()
    const threads = await listThreads(session.user.id, context.params.slug, context.params.section)
    return NextResponse.json({ threads }, { status: 200 })
  } catch (error) {
    console.error('[threads.GET] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: { slug: string; section: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const title = String(body?.title || '').trim() || null
    await ensureChatTables()
    const thread = await createThread(session.user.id, context.params.slug, context.params.section, title || undefined)
    return NextResponse.json({ threadId: thread.id }, { status: 200 })
  } catch (error) {
    console.error('[threads.POST] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: { slug: string; section: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const threadId = String(body?.threadId || '')
    const title = String(body?.title || '').trim()
    if (!threadId || !title) {
      return NextResponse.json({ error: 'threadId and title required' }, { status: 400 })
    }
    await ensureChatTables()
    await updateThreadTitle(threadId, title)
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[threads.PATCH] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: { slug: string; section: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const threadId = String(body?.threadId || '')
    if (!threadId) {
      return NextResponse.json({ error: 'threadId required' }, { status: 400 })
    }
    await ensureChatTables()
    await deleteThread(threadId)
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[threads.DELETE] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

