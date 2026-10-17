import { NextRequest, NextResponse } from 'next/server'
import { getVoiceSessionControl, VoiceSessionControlError } from '@/lib/voice-session-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return NextResponse.json({ error: 'invalid_voice_control_request' }, { status: 415 })
    const header = request.headers.get('authorization') || ''
    if (!/^Bearer [A-Za-z0-9_.-]{1,1600}$/.test(header)) return NextResponse.json({ error: 'invalid_voice_control_token' }, { status: 401 })
    const text = await request.text()
    if (Buffer.byteLength(text, 'utf8') > 180000) return NextResponse.json({ error: 'voice_control_too_large' }, { status: 413 })
    const body = JSON.parse(text)
    const result = await getVoiceSessionControl().worker(header.slice(7), body)
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const known = error instanceof VoiceSessionControlError
    return NextResponse.json({ error: known ? error.code : 'voice_control_request_failed' }, { status: known ? error.status : 400, headers: { 'cache-control': 'no-store' } })
  }
}
