import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import OpenAI from 'openai'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { CreditManager } from '@/lib/credit-system'
import { logAiUsageEvent } from '@/lib/ai-usage-logger'
import { estimateTextToSpeechCostCents } from '@/lib/cost-meter'
import { assertAiUsageAllowed, isAiSafetyError } from '@/lib/ai-safety'
import { resolveHelfiTtsVoice } from '@/lib/openai-voice-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTS_MODEL = process.env.HELFI_VOICE_TTS_MODEL || 'gpt-4o-mini-tts'
const TTS_VOICE = resolveHelfiTtsVoice()
const VOICE_REPLY_MIN_CREDITS = 2
const VOICE_PAID_ACCESS_MESSAGE = 'Talk to Helfi needs an active subscription or purchased credits.'

function cleanText(value: unknown, max = 1200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

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

export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({} as any))
    const text = cleanText(body?.text)
    if (!text) return NextResponse.json({ error: 'No reply text found' }, { status: 400 })
    if (!hasAiConsentFlag(body?.aiConsentGranted ?? body?.aiConsent)) {
      return NextResponse.json({ error: 'AI sharing consent is required before spoken replies can be created.' }, { status: 403 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Voice reply is not configured' }, { status: 500 })
    }

    const estimatedCost = estimateTextToSpeechCostCents(text)
    const chargeCents = Math.max(VOICE_REPLY_MIN_CREDITS, estimatedCost)
    const wallet = await new CreditManager(user.id).getWalletStatus()
    if (!hasPaidVoiceWalletAccess(wallet)) {
      return voicePaidAccessResponse()
    }
    if (wallet.totalAvailableCents < chargeCents) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: wallet.totalAvailableCents }, { status: 402 })
    }

    await assertAiUsageAllowed({
      feature: 'voice-assistant:tts',
      userId: user.id,
    })

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await openai.audio.speech.create({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: text,
      instructions:
        'Speak like a real, warm health coach in a natural conversational tone. Use gentle energy, smooth pacing, and subtle expression. Avoid sounding robotic, flat, or like an announcer.',
      response_format: 'mp3',
    } as any)

    const charged = await new CreditManager(user.id).chargeCents(chargeCents)
    if (!charged) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: wallet.totalAvailableCents }, { status: 402 })
    }

    await logAiUsageEvent({
      feature: 'voice-assistant:tts',
      userId: user.id,
      endpoint: '/api/native/voice-assistant/tts',
      model: TTS_MODEL,
      promptTokens: 0,
      completionTokens: 0,
      costCents: chargeCents,
      success: true,
      detail: 'charged voice reply credits after draft review',
    })

    const buffer = Buffer.from(await response.arrayBuffer())
    return NextResponse.json({
      success: true,
      audio: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
      chargedCredits: chargeCents,
    })
  } catch (error) {
    if (isAiSafetyError(error)) {
      return NextResponse.json(
        { error: 'AI voice is temporarily paused because usage climbed too fast. Please try again shortly.' },
        { status: 429 },
      )
    }
    console.error('[native voice assistant tts] failed', error)
    return NextResponse.json({ error: 'Voice reply failed' }, { status: 500 })
  }
}
