import { NextRequest, NextResponse } from 'next/server'
import { handleNativeAssistantRequest, readNativeAssistantSnapshot } from '@/lib/native-assistant-app'
import { aiConsentRequiredResponse } from '@/lib/ai-consent'
import { beginVoiceActionTrace, finishVoiceActionTrace } from '@/lib/native-voice-action-observability'
import { structuredVoiceSafetyMessage } from '@/lib/native-voice-structured-safety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => null)
  if (body?.channel !== 'realtime' || body.command === undefined) return handleNativeAssistantRequest(request)
  const trace = beginVoiceActionTrace(request, 'prepare')
  trace.action = 'assistant_plan'
  const finish = (response: Response) => finishVoiceActionTrace(response, trace)
  if (body.aiConsentGranted !== true) return finish(NextResponse.json({ error: 'AI sharing consent is required.' }, { status: 403 }))
  const consent = await aiConsentRequiredResponse(request)
  if (consent) return finish(consent)
  // The fixed structured command uses the existing authenticated normal host.
  // It never invokes a planner or adds a preparation/provider charge.
  const safetyMessage = structuredVoiceSafetyMessage(body.text)
  const response = await handleNativeAssistantRequest(request, undefined, safetyMessage ? { safetyMessage } : {})
  const result = await response.clone().json().catch(() => null)
  const view = result?.assistant
  if (result?.success === true && view?.id === body.sessionId && typeof view.actorId === 'string' && view.actorId && Array.isArray(view.steps)) trace.userId = view.actorId
  return finish(response)
}
export async function GET(request: NextRequest) { return readNativeAssistantSnapshot(request) }
