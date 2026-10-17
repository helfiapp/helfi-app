import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { getVoiceSessionControl, VoiceSessionControlError } from '@/lib/voice-session-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
async function actor(request: NextRequest) {
  const web = (await getServerSession(authOptions))?.user?.id, native = await getUserIdFromNativeAuth(request)
  return web && native && web !== native ? null : web || native || null
}
const errorResponse = (error: unknown) => NextResponse.json({ error: error instanceof VoiceSessionControlError ? error.code : 'voice_session_request_failed' }, { status: error instanceof VoiceSessionControlError ? error.status : 400, headers: { 'cache-control': 'no-store' } })
export async function GET(request: NextRequest) {
  try {
    const userId = await actor(request)
    if (!userId) return NextResponse.json({ error: 'Please sign in to the same Helfi account.' }, { status: 401 })
    const url = new URL(request.url)
    if ([...url.searchParams.keys()].some(key => key !== 'sessionId') || url.searchParams.getAll('sessionId').length !== 1) return NextResponse.json({ error: 'invalid_voice_session_request' }, { status: 400 })
    const result = await getVoiceSessionControl().nativeRead(userId, url.searchParams.get('sessionId') || '')
    if (await actor(request) !== userId || request.signal.aborted) return NextResponse.json({ error: 'Please sign in to the same Helfi account.' }, { status: 401 })
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch (error) { return errorResponse(error) }
}
export async function POST(request: NextRequest) {
  try {
    const userId = await actor(request)
    if (!userId) return NextResponse.json({ error: 'Please sign in to the same Helfi account.' }, { status: 401 })
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return NextResponse.json({ error: 'invalid_voice_session_request' }, { status: 415 })
    const text = await request.text()
    if (Buffer.byteLength(text, 'utf8') > 180000) return NextResponse.json({ error: 'voice_control_too_large' }, { status: 413 })
    const result = await getVoiceSessionControl().nativeResult(request, userId, JSON.parse(text))
    if (await actor(request) !== userId || request.signal.aborted) return NextResponse.json({ error: 'Please sign in to the same Helfi account.' }, { status: 401 })
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch (error) { return errorResponse(error) }
}
