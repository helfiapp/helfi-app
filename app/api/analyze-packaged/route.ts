import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'
import { consumeRateLimit } from '@/lib/rate-limit'
import { getImageMetadata } from '@/lib/image-metadata'

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
  if (!openai) return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })

  const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
  const rateKey = (session.user as any)?.id ? `user:${(session.user as any)?.id}` : `ip:${clientIp}`
  const rateCheck = consumeRateLimit('analyze-packaged', rateKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
  if (!rateCheck.allowed) {
    const retryAfter = Math.max(1, Math.ceil(rateCheck.retryAfterMs / 1000))
    return NextResponse.json(
      { error: 'Too many packaged label analyses. Please wait and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
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
    { feature: 'food:analyze-packaged', userId: (session.user as any)?.id ?? null },
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
      userId: (session.user as any)?.id ?? null,
      userLabel: (session.user as any)?.email || null,
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
      userId: (session.user as any)?.id ?? null,
      userLabel: (session.user as any)?.email || null,
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

  return NextResponse.json({ success: true, raw: content.trim(), parsed })
}
