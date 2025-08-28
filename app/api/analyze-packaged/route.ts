import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'

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

  let promptText = ''
  let imageDataUrl: string | null = null

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

  const result = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 400,
    temperature: 0,
  })
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


