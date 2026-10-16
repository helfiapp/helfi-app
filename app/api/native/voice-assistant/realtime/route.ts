import { aiConsentRequiredResponse } from '@/lib/ai-consent'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import crypto from 'crypto'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { CreditManager } from '@/lib/credit-system'
import { logAiUsageEvent } from '@/lib/ai-usage-logger'
import { assertAiUsageAllowed, isAiSafetyError } from '@/lib/ai-safety'
import { exactChatGptVoiceAvailable, resolveHelfiRealtimeVoice } from '@/lib/openai-voice-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const preferredRegion = 'syd1'

const REALTIME_MODEL = process.env.HELFI_VOICE_REALTIME_MODEL || 'gpt-realtime-2.1'
const LIVE_MODEL = process.env.HELFI_VOICE_LIVE_MODEL || 'gpt-live-1'
const LIVE_BACKEND_MODEL = process.env.HELFI_VOICE_LIVE_BACKEND_MODEL || 'gpt-6-luna'
const REALTIME_VOICE = resolveHelfiRealtimeVoice()
const REALTIME_TRANSCRIPTION_MODEL = process.env.HELFI_VOICE_REALTIME_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe'
const REALTIME_SESSION_MIN_CREDITS = Number(process.env.HELFI_VOICE_REALTIME_SESSION_CREDITS || 10)
const VOICE_PAID_ACCESS_MESSAGE = 'Talk to Helfi needs an active subscription or purchased credits.'
const REALTIME_VOICE_ENABLED = process.env.HELFI_VOICE_REALTIME_ENABLED === 'true'
const REALTIME_VOICE_PAUSED_MESSAGE = 'Live voice is paused while it is being rebuilt. Text and camera still work.'

// Negotiate explicitly: already-installed clients retain their supported Realtime
// handshake. New clients use Live's different session and event protocol.
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

function voicePaidAccessResponse() {
  return NextResponse.json(
    { error: VOICE_PAID_ACCESS_MESSAGE, code: 'voice_subscription_required', requiresSubscription: true },
    { status: 402 },
  )
}

export async function GET(request: NextRequest) {
  try {
    const live = usesLiveProtocol(request)
    if (request.nextUrl.searchParams.get('readiness') === '1') {
      const enabled = REALTIME_VOICE_ENABLED
      const configured = Boolean(process.env.OPENAI_API_KEY)
      return NextResponse.json({
        ready: enabled && configured,
        code: !enabled ? 'live_voice_paused' : !configured ? 'ai_service_not_configured' : 'ready',
        model: live ? LIVE_MODEL : REALTIME_MODEL,
        protocol: live ? 'live-v1' : 'realtime',
        supportedProtocols: ['live-v1', 'realtime'],
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
      model: live ? LIVE_MODEL : REALTIME_MODEL,
      protocol: live ? 'live-v1' : 'realtime',
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

function safetyIdentifier(userId: string) {
  return crypto.createHash('sha256').update(`helfi-native-realtime:${userId}`).digest('hex')
}

function realtimeBillingRunId(userId: string, rawSessionId: unknown) {
  const supplied = String(rawSessionId || '').trim()
  const sessionId = /^[A-Za-z0-9._:-]{12,100}$/.test(supplied) ? supplied : crypto.randomUUID()
  const digest = crypto.createHash('sha256').update(`${userId}:${sessionId}`).digest('hex')
  return `native-realtime:${digest}`
}

async function existingRealtimeCharge(userId: string, runId: string) {
  const claim = await prisma.aIUsageEvent.findFirst({
    where: { userId, runId, feature: 'voice-assistant:realtime-charge-marker', createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
    select: { success: true, errorMessage: true },
  })
  return Boolean(claim?.success && claim.errorMessage !== 'insufficient_credits')
}

async function closeUnusedLiveSession(sessionId: string, userId: string) {
  // Node22's built-in Undici WebSocket supports authenticated server headers.
  // Use Live's documented sideband/session.close, not the SIP-only hangup API.
  if (!sessionId || typeof WebSocket === 'undefined') return false
  return new Promise<boolean>((resolve) => {
    let socket: any
    let settled = false
    const finish = (confirmed: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      try { socket?.close() } catch {}
      resolve(confirmed)
    }
    const timeout = setTimeout(() => finish(false), 2000)
    try {
      socket = new (WebSocket as any)(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(sessionId)}/attach`, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'OpenAI-Safety-Identifier': safetyIdentifier(userId) },
      })
      socket.addEventListener('open', () => { socket.send(JSON.stringify({ type: 'session.close' })) })
      socket.addEventListener('message', (event: any) => {
        try { if (JSON.parse(String(event.data))?.type === 'session.closed') finish(true) } catch {}
      })
      socket.addEventListener('error', () => finish(false))
      socket.addEventListener('close', () => finish(false))
    } catch { finish(false) }
  })
}

function realtimeSessionConfig(bundledWelcome = false) {
  return {
    type: 'realtime',
    model: REALTIME_MODEL,
    reasoning: {
      effort: 'low',
    },
    output_modalities: ['audio'],
    instructions: [
      '# Role',
      'You are Talk to Helfi, the one conversational assistant available from every screen in the Helfi health app.',
      '# Speaking style',
      'Speak like a polite, discreet butler: warm, calm, capable, and brief. Avoid clipped, robotic, or repetitive phrasing. Avoid list-like responses.',
      'Usually answer in one or two short sentences. Do not repeat the user\'s request or use the same opening phrase every turn. Ask a follow-up only when it is genuinely needed.',
      'For a meal or recipe suggestion, first say only the meal name and one short reason it fits. Do not read the full ingredient list, nutrient breakdown, macros, or cooking steps unless the user asks. Instead ask whether they want the ingredients and nutrients, or the cooking steps.',
      ...(bundledWelcome ? ['The application plays its own opening welcome recording. Do not generate, repeat or delegate an opening welcome. Wait for the caller to speak. The recording is not a user request or an app action.'] : []),
      'Only give an opening welcome when the app explicitly requests it. Do not restart a welcome after reconnecting, after a tool result, or while the user is speaking.',
      '# Understanding speech',
      'Understand normal messy speech, pauses, self-corrections, mixed languages, and imperfect grammar. Preserve exact names, quantities, dates, steps, distances, doses, and calories the user states.',
      'If audio is unclear, ask one short clarification. Do not guess, invent details, or create a routine the user did not request.',
      'Do not treat your own recent spoken words as a new user request. Wait for a genuine user turn.',
      '# App actions',
      'If the user wants to log, save, add, update, review, open, navigate, track, record, or change anything in the Helfi app, call request_helfi_action before answering.',
      'Do not answer app-action requests from general knowledge. The app tool must prepare the draft, save result, handoff, or clarification first.',
      'App actions include food, favourites/favorites, build meal, water, exercise, walking, running, steps, calories burned, symptoms, health journal, mood, Health Intake medication/supplement drafts, health image notes, insights, and navigation.',
      'Use record_action for changes or deletion of an already saved diary/library entry, and preference_action for profile, health setup, goals, reminders, quiet hours and check-in settings. Use local_preference_action for device dark mode, haptics, analytics or profile visibility. Use notification_action to mark inbox notifications read or delete reviewed notifications; preserve exact titles and limit bulk requests to the visible notifications captured in the review, keeping later arrivals. Preserve exact names, dates and requested changes in request. These actions require a fresh reviewed proposal and confirmation; never turn an edit into a new log.',
      'Use app_read to check actual report status/list, Helfi wallet credits, hydration totals/goals or saved Fitbit/Garmin connection status. Never answer these from memory. Use recipe_import_url for a complete recipe link the user asks to import; the app reviews the normal import charge first and returns the imported recipe for a separate save review.',
      'Use support_action for actual support ticket status or an explicitly requested support message. Never send support messages just because the user mentions a problem. Ask for exact text and review before any message, closing, feedback or deletion; do not claim email delivery.',
      'Use report_action if the user explicitly requests weekly report generation or opening/exporting a saved report PDF. Preserve normal eligibility and credit review; accepted or preparing does not mean generated, unlocked or emailed. PDF access opens only an existing owned ready report after exact review; it does not prove a file was saved or shared. Use app_read to check report status or contents.',
      'Use additional_action for explicitly requested device-interest preferences, selected saved health-image-note deletion, saved chat-history rename/deletion or selected coach/check-in history deletion. Require exact saved-item selection and review. Interest never means device connection. Saved chat history is separate from this current voice conversation. Never delete unreviewed later arrivals or promise a completed deletion before the app verifies it.',
      'For exercise logging such as "I did a walk", "I walked 5449 steps", or "I burned 240 calories", call request_helfi_action with action "exercise". Do not invent or suggest a workout routine unless the user explicitly asks for a routine or workout plan.',
      'General questions and natural conversation may be answered directly. Use request_helfi_action with action "general_chat" only when the app brain or the current app context is needed to answer safely.',
      '# Save safety',
      'Never say something was saved, added, created, or logged unless a Helfi tool result proves it.',
      'Medication and supplement items are always review-first. Do not auto-save them.',
      'If the tool returns needsReview, read spokenReply exactly. It contains the exact proposal summary and must end with: “Would you like me to save that for you?” Then immediately listen for a natural yes, no, or correction without asking the user to tap anything.',
      'A clear yes/save means call request_helfi_action again so the app can save exactly once. A no/discard means call it again so the app can discard. A correction means call it again with the correction; read the corrected spokenReply exactly and ask the save question again.',
      'Confirmation, rejection, and correction turns must not claim another user charge. The app tool result is the source of truth.',
      'If the tool returns saved true, then and only then confirm clearly that it is complete.',
      'If the user says “Delete this conversation” or equivalent and means this current voice conversation, call request_helfi_action with action delete_conversation. Confirm that only the chat was deleted and saved health records were not changed. An explicitly saved or previous Chat History thread uses additional_action with exact selection/review; it must never clear this current voice conversation.',
      'When the tool returns spokenReply and instruction, base your spoken answer on spokenReply and follow instruction exactly.',
      'If safeToClaimSaved is not true, do not use words like saved, added, created, or logged as if the action already happened.',
      'If the tool returns an open_screen or handoff result, say which app screen is ready.',
      'Use device_action for the existing Apple Health import, automatic-update and discovered-source controls. The phone must execute and verify these after review. Never claim OS permission or imported activity from authorization alone.',
      '# Health safety',
      'For medical concerns, give only brief general information, help record notes, and suggest a qualified clinician when appropriate. Do not diagnose or tell the user to start, stop, or change treatment.',
    ].join('\n'),
    audio: {
      output: {
        voice: REALTIME_VOICE,
        speed: 1,
      },
      input: {
        noise_reduction: {
          type: 'near_field',
        },
        transcription: {
          model: REALTIME_TRANSCRIPTION_MODEL,
        },
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'high',
          create_response: true,
          interrupt_response: true,
        },
      },
    },
    tools: [
      {
        type: 'function',
        name: 'request_helfi_action',
        description:
          'Ask the Helfi app to prepare or perform a safe app action. Use this for every logging, tracking, review, navigation, or app-control request, including exercise walks/steps/calories burned. The app must still enforce paid access, consent, review-first rules, and successful-save proof.',
        parameters: {
          type: 'object',
          properties: {
            request: {
              type: 'string',
              description: 'The user request in their own words.',
            },
            action: {
              type: 'string',
              enum: [
                'food_favorite',
                'food_draft',
                'food_build_meal',
                'water',
                'exercise',
                'journal',
                'symptom_note',
                'mood',
                'health_intake_items',
                'health_image_note',
                'insights',
                'navigate',
                'general_chat',
                'delete_conversation',
                'record_action',
                'preference_action',
                'local_preference_action',
                'notification_action',
                'app_read',
                'recipe_import_url',
                'support_action',
                'report_action',
                'additional_action',
                'device_action',
                'unknown',
              ],
            },
            needsReview: {
              type: 'boolean',
              description: 'True when the app must show a review before saving.',
            },
          },
          required: ['request', 'action', 'needsReview'],
        },
      },
    ],
    tool_choice: 'auto',
  }
}

function liveSessionConfig(greetOnConnect = false, bundledWelcome = false) {
  const existing = realtimeSessionConfig()
  return {
    model: LIVE_MODEL,
    store: false,
    ...(greetOnConnect ? { input: [{ type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'Greet the caller now in English with exactly: Hi, I’m Helfi. What can I help you with? Begin once the live microphone conversation connects, then pause and listen. If the caller starts first or interrupts, skip or stop the welcome and listen. This welcome is not an app action: do not delegate it, call tools, log anything, or claim a save. Say this welcome only once.' }] }] } : {}),
    audio: { output: { voice: REALTIME_VOICE } },
    instructions: [
      'You are Talk to Helfi, a warm, calm and concise health tracking assistant.',
      ...(bundledWelcome ? ['The application plays its own opening welcome recording. Do not generate, repeat or delegate an opening welcome. Wait for the caller to speak. The recording is not a user request or an app action.'] : []),
      'Only give an opening welcome when a startup developer message explicitly requests it; never greet spontaneously on reconnect or repeat it after a tool result.',
      'Listen naturally while speaking. Let the user finish, including pauses and self-corrections. Ask one short question when speech is unclear.',
      'Delegate every app action, meal/drink request, confirmation, rejection and correction to the backend. Keep exact foods, quantities, dates and times.',
      'You may briefly acknowledge work while it runs, but never say saved, added, created or logged until a completed Helfi tool result has saved=true and safeToClaimSaved=true.',
      'A proposal is not a save. Read the backend spokenReply for review, then listen for yes, no or a correction and delegate it. Never infer consent from silence.',
      'A correction or wait/cancel instruction takes precedence over an earlier proposal. Do not promise cancellation of a save already completed; report the verified result.',
      'Keep meal suggestions brief: name and one reason, then offer ingredients/nutrients or cooking steps. Keep complete detail in the app.',
      'Medication/supplement changes are always review-first. Do not diagnose or recommend changes to treatment.',
    ].join('\n'),
    delegation: {
      type: 'responses',
      responses: {
        model: LIVE_BACKEND_MODEL,
        instructions: `${existing.instructions}\nYou handle delegated Helfi tasks. Call request_helfi_action with the complete latest user request, preserving corrections and the app review context. Tool output is the only save evidence. Return its spokenReply and factual outcome concisely. Never invent a successful save from a pending, failed or missing tool result.`,
        tools: existing.tools.map((tool) => ({ ...tool, strict: false })),
        tool_choice: 'auto',
        parallel_tool_calls: false,
        max_output_tokens: 2048,
      },
    },
  }
}

export async function POST(request: NextRequest) {
  const consentResponse = await aiConsentRequiredResponse(request)
  if (consentResponse) return consentResponse

  const requestStartedAt = Date.now()
  const abortController = new AbortController()
  let allocatedLiveSessionId = ''
  let allocatedUserId = ''
  let handedToClient = false
  const abortRealtimeRequest = () => abortController.abort()
  request.signal?.addEventListener?.('abort', abortRealtimeRequest)
  if (request.signal?.aborted) abortController.abort()
  try {
    if (abortController.signal.aborted) {
      return NextResponse.json({ error: 'Live voice session was cancelled before it started.', code: 'live_voice_cancelled' }, { status: 499 })
    }
    const [user, sdp] = await Promise.all([resolveUser(request), request.text()])
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!REALTIME_VOICE_ENABLED) {
      return NextResponse.json({ error: REALTIME_VOICE_PAUSED_MESSAGE, code: 'live_voice_paused' }, { status: 503 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }

    if (!hasAiConsentFlag(request.headers.get('x-helfi-ai-consent'))) {
      return NextResponse.json({ error: 'AI sharing consent is required before live voice can start.' }, { status: 403 })
    }

    if (!sdp.trim()) return NextResponse.json({ error: 'Missing realtime session offer' }, { status: 400 })

    const chargeCents = Math.max(1, REALTIME_SESSION_MIN_CREDITS)
    const billingRunId = realtimeBillingRunId(user.id, request.headers.get('x-helfi-voice-session-id'))
    const alreadyPaid = await existingRealtimeCharge(user.id, billingRunId)
    const walletBeforeStart = await new CreditManager(user.id).getWalletStatus()
    if (!alreadyPaid && !hasPaidVoiceWalletAccess(walletBeforeStart)) return voicePaidAccessResponse()
    if (!alreadyPaid && Number(walletBeforeStart?.totalAvailableCents || 0) < chargeCents) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: Number(walletBeforeStart?.totalAvailableCents || 0) }, { status: 402 })
    }
    const guardStartedAt = Date.now()
    await assertAiUsageAllowed({
      feature: 'voice-assistant:realtime-session',
      userId: user.id,
    })
    const guardMs = Date.now() - guardStartedAt

    const live = usesLiveProtocol(request)
    const bundledWelcome = request.headers.get('x-helfi-voice-greeting') === 'bundled-clip'
    const greetOnConnect = !alreadyPaid && request.headers.get('x-helfi-voice-greeting') === 'new-conversation'
    const model = live ? LIVE_MODEL : REALTIME_MODEL
    const form = new FormData()
    if (!live) {
      form.set('sdp', sdp)
      form.set('session', JSON.stringify(realtimeSessionConfig(bundledWelcome)))
    }

    const openAiStartedAt = Date.now()
    if (abortController.signal.aborted) {
      return NextResponse.json({ error: 'Live voice session was cancelled before it started.', code: 'live_voice_cancelled' }, { status: 499 })
    }
    const realtimeRes = await fetch(live ? 'https://api.openai.com/v1/live/sessions' : 'https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Safety-Identifier': safetyIdentifier(user.id),
        ...(live ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: abortController.signal,
      body: live ? JSON.stringify({ session: liveSessionConfig(greetOnConnect, bundledWelcome), transport: { type: 'webrtc', sdp } }) : form,
    })
    const openAiMs = Date.now() - openAiStartedAt

    const responseText = await realtimeRes.text()
    if (!realtimeRes.ok) {
      console.error('[native voice realtime] session failed', realtimeRes.status)
      return NextResponse.json({ error: 'Live voice session could not start' }, { status: 502 })
    }
    let answerSdp = responseText
    let liveSessionId = ''
    if (live) {
      const response = JSON.parse(responseText)
      answerSdp = response?.transport?.sdp
      liveSessionId = response?.session?.id
      if (typeof liveSessionId === 'string' && liveSessionId) {
        allocatedLiveSessionId = liveSessionId
        allocatedUserId = user.id
      }
      if (typeof answerSdp !== 'string' || !answerSdp.trim() || typeof liveSessionId !== 'string' || !liveSessionId) {
        return NextResponse.json({ error: 'The voice service returned an incomplete connection.' }, { status: 502 })
      }
    }

    if (request.signal?.aborted) {
      return NextResponse.json({ error: 'Live voice session was cancelled before it started.', code: 'live_voice_cancelled' }, { status: 499 })
    }

    const chargeStartedAt = Date.now()
    const chargeClaim = await new CreditManager(user.id).chargeCentsOnce(chargeCents, {
      feature: 'voice-assistant:realtime-charge-marker',
      runId: billingRunId,
      model,
      endpoint: '/api/native/voice-assistant/realtime',
    })
    const chargeMs = Date.now() - chargeStartedAt
    if (!chargeClaim.success) {
      const wallet = await new CreditManager(user.id).getWalletStatus().catch(() => null)
      return NextResponse.json({
        error: 'Insufficient credits',
        estimatedCost: chargeCents,
        availableCredits: Number(wallet?.totalAvailableCents || 0),
      }, { status: 402 })
    }
    if (abortController.signal.aborted || request.signal?.aborted) {
      // The atomic charge may have completed concurrently with cancellation.
      // Keep its retry claim so reconnecting this conversation cannot charge twice.
      return NextResponse.json({ error: 'The connection was cancelled. Any existing session charge will be reused when you reconnect.', code: 'live_voice_cancelled' }, { status: 499 })
    }

    const usageLog = logAiUsageEvent({
      feature: 'voice-assistant:realtime-session',
      userId: user.id,
      endpoint: '/api/native/voice-assistant/realtime',
      model,
      promptTokens: 0,
      completionTokens: 0,
      costCents: chargeClaim.charged ? chargeCents : 0,
      success: true,
      detail: chargeClaim.charged
        ? `charged ${chargeCents} credits; created realtime voice session`
        : 'reused the existing charge for a realtime voice connection retry',
      runId: billingRunId,
    })
    const waitUntil = (globalThis as any).waitUntil
    if (typeof waitUntil === 'function') {
      waitUntil(usageLog)
    } else {
      void usageLog
    }

    const totalMs = Date.now() - requestStartedAt

    handedToClient = true
    return new NextResponse(live ? JSON.stringify({ session: { id: liveSessionId }, transport: { type: 'webrtc', sdp: answerSdp } }) : answerSdp, {
      status: 200,
      headers: {
        'content-type': live ? 'application/json' : 'application/sdp',
        'x-helfi-charged-credits': String(chargeClaim.charged ? chargeCents : 0),
        'x-helfi-charge-reused': String(chargeClaim.reused),
        'x-helfi-realtime-model': model,
        'x-helfi-voice-protocol': live ? 'live-v1' : 'realtime',
        'server-timing': `guard;dur=${guardMs}, openai;dur=${openAiMs}, charge;dur=${chargeMs}, total;dur=${totalMs}`,
      },
    })
  } catch (error) {
    if ((error as any)?.name === 'AbortError' || abortController.signal.aborted || request.signal?.aborted) {
      return NextResponse.json({ error: 'Live voice session was cancelled before it started.', code: 'live_voice_cancelled' }, { status: 499 })
    }
    if (isAiSafetyError(error)) {
      return NextResponse.json(
        { error: 'AI voice is temporarily paused because usage climbed too fast. Please try again shortly.' },
        { status: 429 },
      )
    }
    console.error('[native voice realtime] failed')
    return NextResponse.json({ error: 'Live voice session failed' }, { status: 500 })
  } finally {
    request.signal?.removeEventListener?.('abort', abortRealtimeRequest)
    if (allocatedLiveSessionId && !handedToClient) {
      const closed = await closeUnusedLiveSession(allocatedLiveSessionId, allocatedUserId)
      if (!closed) console.warn('[native voice live] unused session close was not confirmed')
    }
  }
}
