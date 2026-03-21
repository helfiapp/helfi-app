import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import OpenAI from 'openai'
import { authOptions } from '@/lib/auth'
import { assertAiUsageAllowed, isAiSafetyError } from '@/lib/ai-safety'
import { logAiUsageEvent, runChatCompletionWithLogging } from '@/lib/ai-usage-logger'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_AUDIO_BYTES = 12 * 1024 * 1024

const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

const trimSummary = (value: string, fallback: string) => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim()
  if (!clean) return fallback
  return clean.slice(0, 600)
}

async function resolveUserId(session: any): Promise<string | null> {
  if (session?.user?.id) return session.user.id
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    return user?.id ?? null
  }
  return null
}

const summarizeImage = async (client: OpenAI, file: File, userId: string) => {
  const imageBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(imageBuffer).toString('base64')
  const completion: any = await runChatCompletionWithLogging(
    client,
    {
      model: process.env.MOOD_MEDIA_IMAGE_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 140,
      messages: [
        {
          role: 'system',
          content:
            'You create short, practical notes for a personal health journal. Be factual. Keep it under two short sentences.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Summarize useful details from this mood journal image for a weekly report. Include visible text if any. Do not include private identifiers.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${file.type || 'image/jpeg'};base64,${base64}`,
                detail: 'low',
              },
            },
          ],
        },
      ],
    } as any,
    {
      feature: 'mood-journal:extract-image',
      userId,
      endpoint: '/api/mood/journal/extract-media',
    },
    {
      image: {
        width: null,
        height: null,
        bytes: file.size,
        mime: file.type || null,
      },
    },
  )

  return trimSummary(
    completion.choices?.[0]?.message?.content || '',
    'Image uploaded and analyzed for journal context.',
  )
}

const transcribeAudio = async (client: OpenAI, file: File, userId: string) => {
  const model = process.env.MOOD_MEDIA_AUDIO_MODEL || 'gpt-4o-mini-transcribe'
  const response = await client.audio.transcriptions.create({
    model,
    file,
    response_format: 'text',
  } as any)

  await logAiUsageEvent({
    feature: 'mood-journal:extract-audio',
    userId,
    endpoint: '/api/mood/journal/extract-media',
    model,
    promptTokens: 0,
    completionTokens: 0,
    costCents: 0,
    success: true,
    detail: 'audio transcription',
  })

  const text = typeof response === 'string' ? response : (response as any)?.text || ''
  return trimSummary(text, 'Voice note uploaded and analyzed for journal context.')
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = await resolveUserId(session)

    const formData: any = await request.formData().catch(() => null)
    if (!formData) {
      return NextResponse.json({ error: 'Invalid upload data' }, { status: 400 })
    }

    const rawKind = String(formData.get('kind') || '').trim().toLowerCase()
    const kind = rawKind === 'audio' ? 'audio' : rawKind === 'image' ? 'image' : null
    const file = formData.get('file')

    if (!kind) {
      return NextResponse.json({ error: 'Missing media type' }, { status: 400 })
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No media file provided' }, { status: 400 })
    }

    if (kind === 'image') {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: 'Image must be less than 6MB' }, { status: 400 })
      }
    } else {
      if (!file.type.startsWith('audio/')) {
        return NextResponse.json({ error: 'File must be audio' }, { status: 400 })
      }
      if (file.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: 'Audio must be less than 12MB' }, { status: 400 })
      }
    }

    const openai = getOpenAIClient()
    if (!openai) {
      const fallback =
        kind === 'image'
          ? 'Image uploaded and analyzed for journal context.'
          : 'Voice note uploaded and analyzed for journal context.'
      return NextResponse.json({ success: true, kind, summary: fallback, ai: false })
    }

    await assertAiUsageAllowed({
      feature: kind === 'image' ? 'mood-journal:extract-image' : 'mood-journal:extract-audio',
      userId,
    })

    const summary =
      kind === 'image'
        ? await summarizeImage(openai, file, userId || 'unknown')
        : await transcribeAudio(openai, file, userId || 'unknown')

    return NextResponse.json({ success: true, kind, summary, ai: true })
  } catch (error) {
    if (isAiSafetyError(error)) {
      return NextResponse.json(
        { error: 'AI uploads are temporarily paused because usage climbed too fast. Please try again shortly.' },
        { status: 429 },
      )
    }
    console.error('mood journal media extraction error', error)
    return NextResponse.json({ error: 'Failed to analyze media' }, { status: 500 })
  }
}
