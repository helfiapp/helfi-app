import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  listThreads,
  createThread,
  updateThreadTitle,
  updateThreadArchived,
  deleteThread,
} from '@/lib/symptom-chat-store'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const threads = await listThreads(session.user.id)
    return NextResponse.json({ threads }, { status: 200 })
  } catch (error) {
    console.error('[symptom-threads.GET] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const title = String(body?.title || '').trim() || null
    const context = body?.context && typeof body.context === 'object' ? body.context : null
    const thread = await createThread(session.user.id, context || undefined, title || undefined)
    return NextResponse.json({ threadId: thread.id }, { status: 200 })
  } catch (error) {
    console.error('[symptom-threads.POST] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
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
      await updateThreadTitle(session.user.id, threadId, title)
    }
    if (archived !== null) {
      await updateThreadArchived(session.user.id, threadId, archived)
    }
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[symptom-threads.PATCH] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
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
    await deleteThread(session.user.id, threadId)
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[symptom-threads.DELETE] error', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
