import { NextRequest, NextResponse } from 'next/server'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import OpenAI from 'openai'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { costCentsForTokens } from '@/lib/cost-meter'
import { FOOD_BENCHMARK_MODELS, isFoodBenchmarkImageUrl, inspectFoodBenchmarkOutput, estimateFoodBenchmarkVendorCents } from '@/lib/food-benchmark'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getOpenAIClient = (): OpenAI | null => {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

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
            '- Mark every estimated portion with isGuess:true. Do not pretend a photo measures weight or hidden oil.\n' +
            '- Keep raw/cooked/breaded identities. Give one ingredient card for each visible component, with nutrition for that whole stated portion and servings:1. Do not default every component to 100g.\n' +
            '- Unknown fibre/sugar are null, not zero. Total must equal the sum of the item values.\n' +
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
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({} as any))
    const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : ''
    const models = Array.isArray(body?.models) ? body.models : []
    const modelList: string[] = models.length ? [...new Set<string>(models)] : ['gpt-5.6-sol', 'gpt-6.1-sol']
    if (modelList.length > 3 || modelList.some(model => !(FOOD_BENCHMARK_MODELS as readonly string[]).includes(model))) {
      return NextResponse.json({ error: 'Choose a supported food comparison model.' }, { status: 400 })
    }
    if (!imageUrl || !isFoodBenchmarkImageUrl(imageUrl)) {
      return NextResponse.json({ error: 'Use a public Helfi food test image. Private or customer images are not accepted.' }, { status: 400 })
    }

    const openai = getOpenAIClient()
    if (!openai) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })

    const messages = buildBenchmarkMessages(imageUrl)

    const results: any[] = []
    for (const model of modelList) {
      const started = Date.now()
      try {
        const out = await chatCompletionWithCost(openai, {
          model, messages,
          ...(model.startsWith('gpt-5') || model.startsWith('gpt-6')
            ? { max_completion_tokens: model === 'gpt-6.1-sol' ? 6144 : 3072 }
            : { max_tokens: 3072 }),
          response_format: { type: 'json_object' },
          ...(model === 'gpt-6.1-sol' ? { reasoning_effort: 'low' } : { temperature: 0 }),
        } as any, { feature: 'admin:food-benchmark' })
        const text = out.completion.choices?.[0]?.message?.content?.trim?.() || ''
        const finishReason = out.completion.choices?.[0]?.finish_reason || null
        const inspected = inspectFoodBenchmarkOutput(text, finishReason)
        results.push({
          model, promptTokens: out.promptTokens, completionTokens: out.completionTokens,
          vendorCostCents: estimateFoodBenchmarkVendorCents(model, out.promptTokens, out.completionTokens),
          billedCostCents: costCentsForTokens(model, { promptTokens: out.promptTokens, completionTokens: out.completionTokens }),
          outputPreview: text, finishReason, elapsedMs: Date.now() - started,
          ingredientCardsReady: inspected.ingredientCardsReady, itemCount: inspected.itemCount,
          totalsMatch: inspected.totalsMatch,
        })
      } catch (error: any) {
        results.push({ model, ingredientCardsReady: false, elapsedMs: Date.now() - started,
          outputPreview: 'This model could not complete the comparison.',
          errorCode: typeof error?.code === 'string' ? error.code : 'comparison_failed' })
      }
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      results,
      note:
        'Public test photos only. Portions are estimates; calories cannot be verified without measured ingredient weights. This simplified comparison checks ingredient cards and totals. Vendor cost is an uncached standard-price estimate; Configured charge shows the current charge estimate in cents and no test-account wallet is charged.',
    })
  } catch (err: any) {
    console.error('[admin food-benchmark] failed')
    return NextResponse.json({ error: 'Food comparison could not complete. Please try again.' }, { status: 500 })
  }
}
