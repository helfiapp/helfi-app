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

const REALTIME_MODEL = process.env.HELFI_VOICE_REALTIME_MODEL || 'gpt-realtime-2.1'
const REALTIME_VOICE = resolveHelfiRealtimeVoice()
const REALTIME_TRANSCRIPTION_MODEL = process.env.HELFI_VOICE_REALTIME_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe'
const REALTIME_SESSION_MIN_CREDITS = Number(process.env.HELFI_VOICE_REALTIME_SESSION_CREDITS || 10)
const VOICE_PAID_ACCESS_MESSAGE = 'Talk to Helfi needs an active subscription or purchased credits.'
const REALTIME_VOICE_ENABLED = process.env.HELFI_VOICE_REALTIME_ENABLED === 'true'
const REALTIME_VOICE_PAUSED_MESSAGE = 'Live voice is paused while it is being rebuilt. Text and camera still work.'

function hasAiConsentFlag(value: unknown) {
  const text = String(value || '').trim().toLowerCase()
  return text === 'true' || text === '1' || text === 'granted' || text === 'yes'
}

async function resolveUser(request: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null)
  const sessionUserId = typeof session?.user?.id === 'string' ? session.user.id : null
  const nativeUserId = sessionUserId ? null : await getUserIdFromNativeAuth(request)
  const userId = sessionUserId || nativeUserId
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
    if (request.nextUrl.searchParams.get('readiness') === '1') {
      const enabled = REALTIME_VOICE_ENABLED
      const configured = Boolean(process.env.OPENAI_API_KEY)
      return NextResponse.json({
        ready: enabled && configured,
        code: !enabled ? 'live_voice_paused' : !configured ? 'ai_service_not_configured' : 'ready',
        model: REALTIME_MODEL,
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
      model: REALTIME_MODEL,
      voice: REALTIME_VOICE,
      exactChatGptVoiceAvailable: exactChatGptVoiceAvailable(),
      voiceNote: 'ChatGPT app voices such as Juniper are not exposed as API voice names. Helfi is using Marin, the closest warm natural OpenAI API voice.',
    })
  } catch (error) {
    console.error('[native voice realtime] status failed', error)
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

function realtimeSessionConfig() {
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
      'Speak warmly, naturally, and briefly, with a calm human cadence. Avoid clipped, robotic, or repetitive phrasing. Avoid list-like responses.',
      'Usually answer in one or two short sentences. Do not repeat the user\'s request or use the same opening phrase every turn. Ask a follow-up only when it is genuinely needed.',
      'For a meal or recipe suggestion, first say only the meal name and one short reason it fits. Do not read the full ingredient list, nutrient breakdown, macros, or cooking steps unless the user asks. Instead ask whether they want the ingredients and nutrients, or the cooking steps.',
      '# Understanding speech',
      'Understand normal messy speech, pauses, self-corrections, mixed languages, and imperfect grammar. Preserve exact names, quantities, dates, steps, distances, doses, and calories the user states.',
      'If audio is unclear, ask one short clarification. Do not guess, invent details, or create a routine the user did not request.',
      'Do not treat your own recent spoken words as a new user request. Wait for a genuine user turn.',
      '# App actions',
      'If the user wants to log, save, add, update, review, open, navigate, track, record, or change anything in the Helfi app, call request_helfi_action before answering.',
      'Do not answer app-action requests from general knowledge. The app tool must prepare the draft, save result, handoff, or clarification first.',
      'App actions include food, favourites/favorites, build meal, water, exercise, walking, running, steps, calories burned, symptoms, health journal, mood, Health Intake medication/supplement drafts, health image notes, insights, and navigation.',
      'For exercise logging such as "I did a walk", "I walked 5449 steps", or "I burned 240 calories", call request_helfi_action with action "exercise". Do not invent or suggest a workout routine unless the user explicitly asks for a routine or workout plan.',
      'General questions and natural conversation may be answered directly. Use request_helfi_action with action "general_chat" only when the app brain or the current app context is needed to answer safely.',
      '# Save safety',
      'Never say something was saved, added, created, or logged unless a Helfi tool result proves it.',
      'Medication and supplement items are always review-first. Do not auto-save them.',
      'If the tool returns needsReview, say briefly that the review is ready and ask if they want to save it. Do not say it was saved.',
      'If the tool returns saved true, then and only then say it was saved.',
      'When the tool returns spokenReply and instruction, base your spoken answer on spokenReply and follow instruction exactly.',
      'If safeToClaimSaved is not true, do not use words like saved, added, created, or logged as if the action already happened.',
      'If the tool returns an open_screen or handoff result, say which app screen is ready.',
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
          eagerness: 'low',
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

export async function POST(request: NextRequest) {
  const abortController = new AbortController()
  const abortRealtimeRequest = () => abortController.abort()
  request.signal?.addEventListener?.('abort', abortRealtimeRequest)
  try {
    const user = await resolveUser(request)
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

    const sdp = await request.text()
    if (!sdp.trim()) return NextResponse.json({ error: 'Missing realtime session offer' }, { status: 400 })

    const chargeCents = Math.max(1, REALTIME_SESSION_MIN_CREDITS)
    const wallet = await new CreditManager(user.id).getWalletStatus()
    if (!hasPaidVoiceWalletAccess(wallet)) return voicePaidAccessResponse()
    if (wallet.totalAvailableCents < chargeCents) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: wallet.totalAvailableCents }, { status: 402 })
    }

    await assertAiUsageAllowed({
      feature: 'voice-assistant:realtime-session',
      userId: user.id,
    })

    const form = new FormData()
    form.set('sdp', sdp)
    form.set('session', JSON.stringify(realtimeSessionConfig()))

    const realtimeRes = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Safety-Identifier': safetyIdentifier(user.id),
      },
      signal: abortController.signal,
      body: form,
    })

    const answerSdp = await realtimeRes.text()
    if (!realtimeRes.ok) {
      console.error('[native voice realtime] session failed', realtimeRes.status, answerSdp.slice(0, 400))
      return NextResponse.json({ error: 'Live voice session could not start' }, { status: 502 })
    }

    if (request.signal?.aborted) {
      return NextResponse.json({ error: 'Live voice session was cancelled before it started.', code: 'live_voice_cancelled' }, { status: 499 })
    }

    const charged = await new CreditManager(user.id).chargeCents(chargeCents)
    if (!charged) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: wallet.totalAvailableCents }, { status: 402 })
    }

    await logAiUsageEvent({
      feature: 'voice-assistant:realtime-session',
      userId: user.id,
      endpoint: '/api/native/voice-assistant/realtime',
      model: REALTIME_MODEL,
      promptTokens: 0,
      completionTokens: 0,
      costCents: chargeCents,
      success: true,
      detail: `charged ${chargeCents} credits; created realtime voice session`,
    })

    return new NextResponse(answerSdp, {
      status: 200,
      headers: {
        'content-type': 'application/sdp',
        'x-helfi-charged-credits': String(chargeCents),
        'x-helfi-realtime-model': REALTIME_MODEL,
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
    console.error('[native voice realtime] failed', error)
    return NextResponse.json({ error: 'Live voice session failed' }, { status: 500 })
  } finally {
    request.signal?.removeEventListener?.('abort', abortRealtimeRequest)
  }
}
