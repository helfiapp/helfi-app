import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { consumeNativeVoicePromptHandoff } from '@/lib/native-voice-prompt-handoff'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveUser(request: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null)
  const sessionUserId = typeof session?.user?.id === 'string' ? session.user.id : null
  const nativeUserId = sessionUserId ? null : await getUserIdFromNativeAuth(request)
  const userId = sessionUserId || nativeUserId
  if (!userId) return null
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
}

export async function GET(request: NextRequest) {
  const user = await resolveUser(request)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const token = request.nextUrl.searchParams.get('token') || ''
  const prompt = await consumeNativeVoicePromptHandoff(user.id, token)
  if (!prompt) return NextResponse.json({ error: 'Prompt expired' }, { status: 404 })

  return NextResponse.json({ prompt })
}
