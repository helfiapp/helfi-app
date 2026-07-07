import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import crypto from 'crypto'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { CreditManager } from '@/lib/credit-system'
import { logAiUsageEvent } from '@/lib/ai-usage-logger'
import { assertAiUsageAllowed, isAiSafetyError } from '@/lib/ai-safety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REALTIME_MODEL = process.env.HELFI_VOICE_REALTIME_MODEL || 'gpt-realtime'
const REALTIME_VOICE = process.env.HELFI_VOICE_REALTIME_VOICE || process.env.HELFI_VOICE_TTS_VOICE || 'coral'
const REALTIME_TRANSCRIPTION_MODEL = process.env.HELFI_VOICE_REALTIME_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe'
const REALTIME_SESSION_MIN_CREDITS = Number(process.env.HELFI_VOICE_REALTIME_SESSION_CREDITS || 10)
const VOICE_PAID_ACCESS_MESSAGE = 'Talk to Helfi needs an active subscription or purchased credits.'

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
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ available: false, error: 'Unauthorized' }, { status: 401 })

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
    output_modalities: ['audio'],
    instructions: [
      'You are Talk to Helfi inside the Helfi health app.',
      'Speak naturally and briefly. Ask follow-up questions when needed.',
      'Never say something was saved, added, created, or logged unless a Helfi tool result proves it.',
      'Medication and supplement requests are review-first. Do not auto-save them.',
      'For medical concerns, help record notes and suggest speaking with a clinician. Do not diagnose or give treatment advice.',
      'When the user wants an app action, call the request_helfi_action tool with the user request and the intended safe action.',
    ].join('\n'),
    audio: {
      output: {
        voice: REALTIME_VOICE,
      },
      input: {
        transcription: {
          model: REALTIME_TRANSCRIPTION_MODEL,
          language: 'en',
        },
        turn_detection: {
          type: 'semantic_vad',
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
          'Ask the Helfi app to prepare or perform a safe app action. The app must still enforce paid access, consent, review-first rules, and successful-save proof.',
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
                'symptom_note',
                'health_journal',
                'mood_journal',
                'health_intake_items',
                'health_image_note',
                'navigate',
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
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
      body: form,
    })

    const answerSdp = await realtimeRes.text()
    if (!realtimeRes.ok) {
      console.error('[native voice realtime] session failed', realtimeRes.status, answerSdp.slice(0, 400))
      return NextResponse.json({ error: 'Live voice session could not start' }, { status: 502 })
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
    if (isAiSafetyError(error)) {
      return NextResponse.json(
        { error: 'AI voice is temporarily paused because usage climbed too fast. Please try again shortly.' },
        { status: 429 },
      )
    }
    console.error('[native voice realtime] failed', error)
    return NextResponse.json({ error: 'Live voice session failed' }, { status: 500 })
  }
}
