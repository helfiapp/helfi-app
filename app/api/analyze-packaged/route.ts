import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'
import { logAiUsageEvent } from '@/lib/ai-usage-logger'
import { consumeRateLimit } from '@/lib/rate-limit'
import { getImageMetadata } from '@/lib/image-metadata'
import { prisma } from '@/lib/prisma'
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system'
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits'
import { isSubscriptionActive } from '@/lib/subscription-utils'
import { logServerCall } from '@/lib/server-call-tracker'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 3

const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contentType = req.headers.get('content-type') || ''
  const openai = getOpenAIClient()
  if (!openai) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })

  const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
  const rateKey = (session.user as any)?.id ? `user:${(session.user as any)?.id}` : `ip:${clientIp}`
  const rateCheck = await consumeRateLimit('analyze-packaged', rateKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
  if (!rateCheck.allowed) {
    const retryAfter = Math.max(1, Math.ceil(rateCheck.retryAfterMs / 1000))
    return NextResponse.json(
      { error: 'Too many packaged label analyses. Please wait and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { subscription: true, creditTopUps: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  logServerCall({
    feature: 'packagedFoodLabel',
    endpoint: '/api/analyze-packaged',
    kind: 'analysis',
  }).catch((error) => {
    console.error('❌ Failed to log packaged label call:', error)
  })

  const isPremium = isSubscriptionActive(user.subscription)
  const now = new Date()
  const hasPurchasedCredits = user.creditTopUps.some(
    (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
  )
  const hasFreeFoodCredits = await hasFreeCredits(user.id, 'FOOD_ANALYSIS')

  let allowViaFreeUse = false
  if (!isPremium && !hasPurchasedCredits && hasFreeFoodCredits) {
    allowViaFreeUse = true
  } else if (!isPremium && !hasPurchasedCredits && !hasFreeFoodCredits) {
    return NextResponse.json(
      {
        error: 'Payment required',
        message: 'You\'ve used all your free food analyses. Subscribe to a monthly plan or purchase credits to continue.',
        requiresPayment: true,
        exhaustedFreeCredits: true,
      },
      { status: 402 }
    )
  }

  let promptText = ''
  let imageDataUrl: string | null = null
  let imageMeta: ReturnType<typeof getImageMetadata> | null = null
  let imageBytes: number | null = null
  let imageMime: string | null = null

  if (contentType.includes('application/json')) {
    const { text } = await req.json()
    if (!text) return NextResponse.json({ error: 'No label text provided' }, { status: 400 })
    promptText = text
  } else {
    const form = await req.formData()
    const image = form.get('image') as File | null
    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    const buf = await image.arrayBuffer()
    const base64 = Buffer.from(buf).toString('base64')
    imageDataUrl = `data:${image.type};base64,${base64}`
    imageMeta = getImageMetadata(buf)
    imageBytes = buf.byteLength
    imageMime = image.type || null
  }

  if (!allowViaFreeUse) {
    const cm = new CreditManager(user.id)
    const wallet = await cm.getWalletStatus()
    if (wallet.totalAvailableCents < CREDIT_COSTS.FOOD_ANALYSIS) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    }
    const ok = await cm.chargeCents(CREDIT_COSTS.FOOD_ANALYSIS)
    if (!ok) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    }
  }

  // Ask the model to extract per-portion nutrition from either text or image
  const messages: any[] = [
    imageDataUrl
      ? {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Read this packaged food nutrition label. Return a JSON block between <NUTR_JSON> and </NUTR_JSON> only, with fields: {"serving_size":"string","per_serving":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}. Use numbers; if unknown, use null.'
            },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
          ]
        }
      : {
          role: 'user',
          content:
            'Read this packaged food nutrition label text. Return a JSON block between <NUTR_JSON> and </NUTR_JSON> only, with fields: {"serving_size":"string","per_serving":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}. Use numbers; if unknown, use null.\n\nLabel text:\n' +
            promptText,
        },
  ]

  const result: any = await runChatCompletionWithLogging(
    openai,
    {
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 400,
      temperature: 0,
    },
    { feature: 'food:analyze-packaged', userId: user.id },
    imageDataUrl
      ? {
          image: {
            width: imageMeta?.width ?? null,
            height: imageMeta?.height ?? null,
            bytes: imageBytes,
            mime: imageMime,
          },
        }
      : undefined
  )

  if (imageDataUrl) {
    logAiUsageEvent({
      feature: 'food:analyze-packaged',
      endpoint: '/api/analyze-packaged',
      userId: user.id,
      userLabel: user.email || null,
      scanId: `packaged-${Date.now()}`,
      model: 'gpt-4o-mini',
      promptTokens: (result as any)?.promptTokens || 0,
      completionTokens: (result as any)?.completionTokens || 0,
      costCents: (result as any)?.costCents || 0,
      image: {
        width: imageMeta?.width ?? null,
        height: imageMeta?.height ?? null,
        bytes: imageBytes,
        mime: imageMime,
      },
      success: true,
    }).catch(() => {})
  } else {
    logAiUsageEvent({
      feature: 'food:analyze-packaged',
      endpoint: '/api/analyze-packaged',
      userId: user.id,
      userLabel: user.email || null,
      scanId: `packaged-${Date.now()}`,
      model: 'gpt-4o-mini',
      promptTokens: (result as any)?.promptTokens || 0,
      completionTokens: (result as any)?.completionTokens || 0,
      costCents: (result as any)?.costCents || 0,
      success: true,
    }).catch(() => {})
  }
  const content = result.choices?.[0]?.message?.content || ''
  const m = content.match(/<NUTR_JSON>([\s\S]*?)<\/NUTR_JSON>/i)
  let parsed: any = null
  if (m && m[1]) {
    try {
      parsed = JSON.parse(m[1])
    } catch {}
  }

  if (allowViaFreeUse) {
    await consumeFreeCredit(user.id, 'FOOD_ANALYSIS')
  }

  return NextResponse.json({ success: true, raw: content.trim(), parsed })
}
