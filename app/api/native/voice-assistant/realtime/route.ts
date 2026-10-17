import { aiConsentRequiredResponse } from '@/lib/ai-consent'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { CreditManager } from '@/lib/credit-system'
import { startMeteredLiveVoiceSession } from '@/lib/voice-session-start'
import { isAiSafetyError } from '@/lib/ai-safety'
import { createNativeAssistantApp } from '@/lib/native-assistant-app'
import { normalizeVoiceTimeZone } from '@/lib/native-voice-time'
import { validateAssistantValue } from '@/lib/native-assistant-registry'
import { type AssistantGeneralSessionConfig } from '@/lib/native-assistant-command-tool'
import { exactChatGptVoiceAvailable, resolveHelfiRealtimeVoice } from '@/lib/openai-voice-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const preferredRegion = 'syd1'

const LIVE_MODEL = 'gpt-live-1'
const REALTIME_VOICE = resolveHelfiRealtimeVoice()
const VOICE_PAID_ACCESS_MESSAGE = 'Talk to Helfi needs an active subscription or purchased credits.'
const REALTIME_VOICE_ENABLED = process.env.HELFI_VOICE_REALTIME_ENABLED === 'true'
const REALTIME_VOICE_PAUSED_MESSAGE = 'Live voice is paused while it is being rebuilt. Text and camera still work.'

// Paid voice requires the server-controlled Live protocol. Older clients
// receive an update instruction before any provider connection is allocated.
function usesLiveProtocol(request: NextRequest) {
  return request.headers.get('x-helfi-voice-protocol') === 'live-v1'
}

function hasAiConsentFlag(value: unknown) {
  const text = String(value || '').trim().toLowerCase()
  return text === 'true' || text === '1' || text === 'granted' || text === 'yes'
}

async function resolveUser(request: NextRequest) {
  const hasNativeToken = Boolean(request.headers.get('x-native-token') || request.headers.get('authorization'))
  const nativeUserId = hasNativeToken ? await getUserIdFromNativeAuth(request) : null
  if (nativeUserId) return { id: nativeUserId }
  const session = nativeUserId ? null : await getServerSession(authOptions).catch(() => null)
  const sessionUserId = typeof session?.user?.id === 'string' ? session.user.id : null
  const userId = sessionUserId
  if (!userId) return null
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })
}

function hasPaidVoiceWalletAccess(wallet: any) {
  const topUpsAvailable = Array.isArray(wallet?.topUps)
    ? wallet.topUps.reduce((sum: number, item: any) => sum + Math.max(0, Number(item?.availableCents || 0)), 0)
    : 0
  const additionalAvailable = Math.max(0, Number(wallet?.additionalCreditsCents || 0))
  return Boolean(wallet?.plan) || topUpsAvailable > 0 || additionalAvailable > 0
}

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get('readiness') === '1') {
      const enabled = REALTIME_VOICE_ENABLED
      const configured = Boolean(process.env.OPENAI_API_KEY)
      return NextResponse.json({
        ready: enabled && configured,
        code: !enabled ? 'live_voice_paused' : !configured ? 'ai_service_not_configured' : 'ready',
        model: LIVE_MODEL,
        protocol: 'live-v1',
        supportedProtocols: ['live-v1'],
        metering: 'server-v1',
        voice: REALTIME_VOICE,
        exactChatGptVoiceAvailable: exactChatGptVoiceAvailable(),
        voiceNote: 'ChatGPT app voices such as Juniper are not exposed as API voice names. Helfi is using Marin, the closest warm natural OpenAI API voice.',
      })
    }

    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ available: false, error: 'Unauthorized' }, { status: 401 })

    if (!REALTIME_VOICE_ENABLED) {
      return NextResponse.json({
        available: false,
        code: 'live_voice_paused',
        message: REALTIME_VOICE_PAUSED_MESSAGE,
      })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        available: false,
        code: 'ai_service_not_configured',
        message: 'Live voice is not available on this local server. Text and camera still work.',
      })
    }

    const wallet = await new CreditManager(user.id).getWalletStatus()
    if (!hasPaidVoiceWalletAccess(wallet)) {
      return NextResponse.json({
        available: false,
        code: 'voice_subscription_required',
        message: VOICE_PAID_ACCESS_MESSAGE,
        requiresSubscription: true,
      }, { status: 402 })
    }

    return NextResponse.json({
      available: true,
      model: LIVE_MODEL,
      protocol: 'live-v1',
      voice: REALTIME_VOICE,
      exactChatGptVoiceAvailable: exactChatGptVoiceAvailable(),
      voiceNote: 'ChatGPT app voices such as Juniper are not exposed as API voice names. Helfi is using Marin, the closest warm natural OpenAI API voice.',
    })
  } catch (error) {
    console.error('[native voice realtime] status failed')
    return NextResponse.json({
      available: false,
      code: 'status_check_failed',
      message: 'Live voice status could not be checked. Text and camera still work.',
    }, { status: 500 })
  }
}

function liveSessionConfig(bundledWelcome: boolean) {
  return {
    model: LIVE_MODEL,
    store: false,
    audio: { output: { voice: REALTIME_VOICE } },
    instructions: [
      'You are Talk to Helfi, a warm, calm and concise health tracking assistant.',
      ...(bundledWelcome ? ['The application plays its own opening welcome recording. Do not generate, repeat or delegate an opening welcome. Wait for the caller to speak. The recording is not a user request or an app action.'] : []),
      'Never greet spontaneously on reconnect or repeat a welcome after a tool result.',
      'Listen naturally while speaking. Let the user finish, including pauses and self-corrections. Ask one short question when speech is unclear.',
      'Delegate every app action, meal/drink request, confirmation, rejection and correction to the backend. Keep exact foods, quantities, dates and times.',
      'You may briefly acknowledge work while it runs, but never say saved, added, created or logged until the completed Helfi backend result verifies it.',
      'A proposal is not a save. Read the backend review, then listen for yes, no or a correction and delegate it. Never infer consent from silence.',
      'A correction or wait/cancel instruction takes precedence over an earlier proposal. Do not promise cancellation of a save already completed; report the verified result.',
      'Keep meal suggestions brief: name and one reason, then offer ingredients/nutrients or cooking steps. Keep complete detail in the app.',
      'Medication/supplement changes are always review-first. Do not diagnose or recommend changes to treatment.',
    ].join('\n'),
    delegation: { type: 'client' },
  }
}

async function generalAssistantSessionConfig(request: NextRequest, actorId: string): Promise<AssistantGeneralSessionConfig | undefined> {
  if (!(request.headers.get('x-helfi-voice-capabilities') || '').split(',').map(value => value.trim()).includes('general-assistant-v1')) return undefined
  const sessionId = request.headers.get('x-helfi-assistant-session-id') || '', localDate = request.headers.get('x-helfi-assistant-local-date') || ''
  const timeZone = normalizeVoiceTimeZone(request.headers.get('x-helfi-assistant-time-zone'))
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(sessionId) || !timeZone) throw new Error('Please use the current signed-in assistant conversation and device time zone.')
  validateAssistantValue({ type: 'string', maxLength: 10, format: 'date' }, localDate)
  const context = { actorId, localDate, signal: request.signal, capabilities: (request.headers.get('x-helfi-voice-capabilities') || '').split(',').map(value => value.trim()) }
  const { host } = createNativeAssistantApp(request, timeZone)
  // Exactly one owned read; no planner or paid domain operation is invoked.
  const snapshot = await host.snapshot(context, sessionId)
  if (request.signal?.aborted) throw new Error('This voice request stopped before session configuration.')
  return { sessionId, localDate, timeZone, actions: host.discover(context), snapshot }
}

export async function POST(request: NextRequest) {
  const consentResponse = await aiConsentRequiredResponse(request)
  if (consentResponse) return consentResponse
  try {
    if (request.signal.aborted) return NextResponse.json({ error: 'Voice was stopped.', code: 'live_voice_cancelled' }, { status: 499 })
    const [user, sdp] = await Promise.all([resolveUser(request), request.text()])
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!REALTIME_VOICE_ENABLED) return NextResponse.json({ error: REALTIME_VOICE_PAUSED_MESSAGE, code: 'live_voice_paused' }, { status: 503 })
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
    if (!hasAiConsentFlag(request.headers.get('x-helfi-ai-consent'))) return NextResponse.json({ error: 'AI sharing consent is required before live voice can start.' }, { status: 403 })
    if (!sdp.trim() || Buffer.byteLength(sdp, 'utf8') > 160000) return NextResponse.json({ error: 'Please start a new voice connection.' }, { status: 400 })
    if (!usesLiveProtocol(request) || request.headers.get('x-helfi-voice-metering') !== 'server-v1') return NextResponse.json({ error: 'Please update Helfi to use protected voice billing.', code: 'voice_update_required' }, { status: 426 })
    const general = await generalAssistantSessionConfig(request, user.id)
    if (!general) return NextResponse.json({ error: 'Please open the current signed-in assistant conversation.' }, { status: 400 })
    return await startMeteredLiveVoiceSession({ request, userId: user.id, sdp, general, frontend: liveSessionConfig(request.headers.get('x-helfi-voice-greeting') === 'bundled-clip') })
  } catch (error) {
    if (isAiSafetyError(error)) return NextResponse.json({ error: 'AI voice is temporarily paused because usage climbed too fast. Please try again shortly.' }, { status: 429 })
    console.error('[native voice realtime] protected connection failed')
    return NextResponse.json({ error: 'The protected voice connection could not start. Please try again.' }, { status: 503 })
  }
}
