import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import OpenAI from 'openai'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'
import { buildCustomFoodAliases, buildCustomFoodKey } from '@/lib/food/custom-food-import'
import { searchCustomFoodMacros } from '@/lib/food/custom-foods'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const cleanIngredientName = (raw: string) => {
  let s = String(raw || '').trim()
  s = s.replace(/^[\s•*\-–—]+/, '').trim()
  s = s.replace(/^\d+\.\s+/, '').trim()
  s = s.replace(/\(.*?\)/g, ' ')
  s = s.replace(/\b(to taste|optional|plus more|for garnish|garnish|divided)\b/gi, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

const toFiniteOrNull = (value: any) => {
  const n = typeof value === 'number' ? value : Number(String(value || '').trim())
  return Number.isFinite(n) && n >= 0 ? n : null
}

const safeJsonParse = (raw: string) => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const getOpenAIClient = () => {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  return new OpenAI({ apiKey: key })
}

export async function POST(request: NextRequest) {
  try {
    let session = await getServerSession(authOptions)
    let userEmail: string | null = session?.user?.email ?? null
    if (!userEmail) {
      try {
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) userEmail = String(token.email)
      } catch {}
    }
    if (!userEmail) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await request.json().catch(() => ({} as any))
    const ingredientRaw = String(body?.ingredient || body?.lookup || '').trim()
    const ingredient = cleanIngredientName(ingredientRaw)
    if (!ingredient || ingredient.length < 2) {
      return NextResponse.json({ error: 'Missing ingredient text' }, { status: 400 })
    }

    const country = String(body?.country || '').trim().toUpperCase() || null

    // First, try to find it in existing custom foods.
    const existing = await searchCustomFoodMacros(ingredient, 1, { allowTypo: false, country })
    if (existing.length > 0) {
      const top = existing[0]
      return NextResponse.json(
        {
          item: {
            source: 'custom',
            id: top.id ? `custom:${top.id}` : `custom:${ingredient.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            name: String(top.name || ingredient),
            brand: top.brand ?? null,
            serving_size: '100 g',
            calories: top.calories ?? null,
            protein_g: top.protein_g ?? null,
            carbs_g: top.carbs_g ?? null,
            fat_g: top.fat_g ?? null,
            fiber_g: top.fiber_g ?? null,
            sugar_g: top.sugar_g ?? null,
          },
          created: false,
        },
        { status: 200 },
      )
    }

    const openai = getOpenAIClient()
    if (!openai) return NextResponse.json({ error: 'Nutrition fallback is temporarily unavailable.' }, { status: 503 })

    const completion = await runChatCompletionWithLogging(
      openai,
      {
        model: process.env.OPENAI_RECIPE_IMPORT_MODEL || 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' } as any,
        messages: [
          {
            role: 'system',
            content:
              'You are estimating nutrition for one recipe ingredient.\n' +
              'Return JSON only with keys:\n' +
              'name, servingSize, caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g, fiberPer100g, sugarPer100g, aliases.\n' +
              'Rules:\n' +
              '- Use a generic food name that can be searched later (not a full recipe sentence).\n' +
              '- Values must be per 100g and non-negative numbers.\n' +
              '- aliases must be a short array of alternate names (max 6).',
          },
          {
            role: 'user',
            content: JSON.stringify({
              ingredientLine: ingredientRaw,
              cleanedIngredient: ingredient,
              country,
            }),
          },
        ],
      } as any,
      { feature: 'recipe-import', userId: user.id, userLabel: userEmail, endpoint: '/api/recipe-import/resolve-missing' },
      { callDetail: 'missing-ingredient-auto-fill' },
    )

    const raw = completion?.choices?.[0]?.message?.content || ''
    const parsed =
      safeJsonParse(String(raw || '{}').trim().replace(/```json/gi, '').replace(/```/g, '').trim() || '{}') || {}

    const name = cleanIngredientName(String(parsed?.name || ingredient))
    const caloriesPer100g = toFiniteOrNull(parsed?.caloriesPer100g)
    const proteinPer100g = toFiniteOrNull(parsed?.proteinPer100g)
    const carbsPer100g = toFiniteOrNull(parsed?.carbsPer100g)
    const fatPer100g = toFiniteOrNull(parsed?.fatPer100g)
    const fiberPer100g = toFiniteOrNull(parsed?.fiberPer100g)
    const sugarPer100g = toFiniteOrNull(parsed?.sugarPer100g)

    if (
      !name ||
      caloriesPer100g === null ||
      proteinPer100g === null ||
      carbsPer100g === null ||
      fatPer100g === null
    ) {
      return NextResponse.json({ error: 'Could not estimate nutrition for this ingredient.' }, { status: 422 })
    }

    const aliasesRaw = Array.isArray(parsed?.aliases) ? parsed.aliases : []
    const aliases = Array.from(
      new Set(
        [ingredientRaw, ingredient, ...aliasesRaw.map((v: any) => String(v || '').trim()), ...buildCustomFoodAliases(name, null)]
          .map((v) => String(v || '').trim())
          .filter(Boolean)
          .slice(0, 12),
      ),
    )

    const key = buildCustomFoodKey({
      name,
      brand: null,
      kind: 'SINGLE',
      country,
    })

    const saved = await prisma.customFoodItem.upsert({
      where: { key },
      update: {
        name,
        brand: null,
        country,
        kind: 'SINGLE',
        caloriesPer100g,
        proteinPer100g,
        carbsPer100g,
        fatPer100g,
        fiberPer100g,
        sugarPer100g,
        aliases,
        servingOptions: [{ id: '100g', label: '100 g', grams: 100 }],
      },
      create: {
        key,
        name,
        brand: null,
        country,
        kind: 'SINGLE',
        caloriesPer100g,
        proteinPer100g,
        carbsPer100g,
        fatPer100g,
        fiberPer100g,
        sugarPer100g,
        aliases,
        servingOptions: [{ id: '100g', label: '100 g', grams: 100 }],
      },
    })

    return NextResponse.json(
      {
        item: {
          source: 'custom',
          id: `custom:${saved.id}`,
          name: saved.name,
          brand: saved.brand,
          serving_size: String(parsed?.servingSize || '100 g'),
          calories: saved.caloriesPer100g,
          protein_g: saved.proteinPer100g,
          carbs_g: saved.carbsPer100g,
          fat_g: saved.fatPer100g,
          fiber_g: saved.fiberPer100g,
          sugar_g: saved.sugarPer100g,
        },
        created: true,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('POST /api/recipe-import/resolve-missing error', error)
    return NextResponse.json({ error: 'Auto-fill failed.' }, { status: 500 })
  }
}
