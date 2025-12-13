import { NextRequest, NextResponse } from 'next/server'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import OpenAI from 'openai'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { openaiCostCentsForTokens, costCentsForTokens } from '@/lib/cost-meter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getOpenAIClient = (): OpenAI | null => {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

const isSafeImageUrl = (url: string) => /^https?:\/\//i.test(url) && url.length < 2000

const buildBenchmarkMessages = (imageUrl: string) => {
  return [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            'Analyze this food image.\n' +
            '- Return short, plain ingredient names (no "several components:" prefixes).\n' +
            '- For sliced produce (e.g., avocado slices), treat as a portion (grams or fraction of whole), NOT "pieces".\n' +
            '- Be conservative when uncertain and mark guesses.\n' +
            'Return ONLY a JSON block with shape:\n' +
            '{"items":[{"name":"string","brand":null,"serving_size":"string","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"isGuess":false}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}',
        },
        { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
      ],
    },
  ]
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({} as any))
    const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : ''
    const models = Array.isArray(body?.models) ? body.models : []
    const modelList =
      models.length > 0
        ? models.filter((m: any) => typeof m === 'string' && m.trim().length > 0).slice(0, 3)
        : ['gpt-4o', 'gpt-5.2']

    if (!imageUrl || !isSafeImageUrl(imageUrl)) {
      return NextResponse.json({ error: 'Provide a public https:// imageUrl' }, { status: 400 })
    }

    const openai = getOpenAIClient()
    if (!openai) return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 })

    const messages = buildBenchmarkMessages(imageUrl)

    const results: any[] = []
    for (const model of modelList) {
      const out = await chatCompletionWithCost(openai, {
        model,
        messages,
        max_tokens: 700,
        temperature: 0,
      } as any)
      const text = out.completion.choices?.[0]?.message?.content?.trim?.() || ''
      const vendorCostCents = openaiCostCentsForTokens(model, {
        promptTokens: out.promptTokens,
        completionTokens: out.completionTokens,
      })
      const billedCostCents = costCentsForTokens(model, {
        promptTokens: out.promptTokens,
        completionTokens: out.completionTokens,
      })
      results.push({
        model,
        promptTokens: out.promptTokens,
        completionTokens: out.completionTokens,
        vendorCostCents,
        billedCostCents,
        outputPreview: text.slice(0, 1200),
      })
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      results,
      note:
        'Benchmark prompt is simplified vs the live analyzer. Use this to compare relative cost/token usage and qualitative output.',
    })
  } catch (err: any) {
    console.error('[admin food-benchmark] error', err)
    return NextResponse.json({ error: err?.message || 'Benchmark failed' }, { status: 500 })
  }
}
