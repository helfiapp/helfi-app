import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'
import { consumeRateLimit } from '@/lib/rate-limit'

const INSIGHTS_RATE_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const INSIGHTS_RATE_MAX = 2

// Lazy OpenAI import to avoid build-time env requirements
let _openai: any = null
function getOpenAI() {
  if (_openai) return _openai
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const OpenAI = require('openai').default
  _openai = new OpenAI({ apiKey })
  return _openai
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const preview = url.searchParams.get('preview') === '1'
  const enabled = process.env.NEXT_PUBLIC_INSIGHTS_ENABLED === 'true'
  if (!enabled && !preview) {
    return NextResponse.json({ enabled: false, items: [] }, { status: 200 })
  }

  // Personalize from current user's data when available
  let profile: any = null
  let recentFood: any[] = []
  let recentHealthLogs: any[] = []
  // Aggregated nutrition snapshot for the last 7 days (best-effort, safe fallbacks)
  let weeklyNutritionSummary: any = null
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.id) {
      profile = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
          healthGoals: true,
          supplements: true,
          medications: true,
          foodLogs: {
            orderBy: { createdAt: 'desc' },
            take: 30,
          },
          healthLogs: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { goal: true }
          },
        },
      })
      // Include nutrients when available so the AI can be specific
      recentFood = (profile?.foodLogs || []).map((f: any) => ({ name: f.name, nutrients: f.nutrients || null, createdAt: f.createdAt }))
      recentHealthLogs = (profile?.healthLogs || []).map((h: any) => ({ goal: h.goal?.name, rating: h.rating, createdAt: h.createdAt }))
    }
  } catch {
    // non-blocking
  }

  // Compute a 7-day nutrition summary from recent food logs (best-effort)
  try {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const last7 = recentFood.filter((f: any) => new Date(f.createdAt).getTime() >= cutoff)
    const sums = {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0,
    }
    let counted = 0
    const foodCount: Record<string, number> = {}
    for (const f of last7) {
      const n = (f && f.nutrients) || {}
      // Accept multiple possible keys commonly returned by analyzers
      const cals = Number(n.calories ?? n.kcal ?? 0) || 0
      const protein = Number(n.protein_g ?? n.protein ?? 0) || 0
      const carbs = Number(n.carbs_g ?? n.carbohydrates_g ?? n.carbohydrates ?? 0) || 0
      const fat = Number(n.fat_g ?? n.total_fat_g ?? 0) || 0
      const fiber = Number(n.fiber_g ?? n.dietary_fiber_g ?? 0) || 0
      const sugar = Number(n.sugar_g ?? n.sugars_g ?? 0) || 0
      const sodium = Number(n.sodium_mg ?? n.salt_mg ?? 0) || 0
      // Only count entries that have at least one nutrient value
      if (cals || protein || carbs || fat || fiber || sugar || sodium) {
        sums.calories += cals
        sums.protein_g += protein
        sums.carbs_g += carbs
        sums.fat_g += fat
        sums.fiber_g += fiber
        sums.sugar_g += sugar
        sums.sodium_mg += sodium
        counted += 1
      }
      const key = String(f.name || '').trim().toLowerCase()
      if (key) foodCount[key] = (foodCount[key] || 0) + 1
    }
    const topFoods = Object.entries(foodCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

    weeklyNutritionSummary = {
      daysAnalyzed: Math.min(7, Math.max(1, Math.ceil((Date.now() - cutoff) / (24 * 60 * 60 * 1000)))),
      entriesWithNutrients: counted,
      totals: sums,
      dailyAverages: {
        calories: counted ? Math.round(sums.calories / 7) : 0,
        protein_g: counted ? +(sums.protein_g / 7).toFixed(1) : 0,
        carbs_g: counted ? +(sums.carbs_g / 7).toFixed(1) : 0,
        fat_g: counted ? +(sums.fat_g / 7).toFixed(1) : 0,
        fiber_g: counted ? +(sums.fiber_g / 7).toFixed(1) : 0,
        sugar_g: counted ? +(sums.sugar_g / 7).toFixed(1) : 0,
        sodium_mg: counted ? Math.round(sums.sodium_mg / 7) : 0,
      },
      topFoods,
    }
  } catch {
    weeklyNutritionSummary = null
  }

  // Simple personalized fallback insights (used when AI call not available)
  const fallback = () => {
    const goals = profile?.healthGoals?.filter((g: any) => !g.name?.startsWith('__')) || []
    const supplements = profile?.supplements || []
    const meds = profile?.medications || []
    const hasMagnesium = supplements.some((s: any) => /magnesium/i.test(s?.name || ''))
    const hasIron = supplements.some((s: any) => /iron/i.test(s?.name || ''))
    const hasCalcium = supplements.some((s: any) => /calcium/i.test(s?.name || ''))
    const hasOmega3 = supplements.some((s: any) => /(omega|fish\s*oil)/i.test(s?.name || ''))

    const items = [
      {
        id: 'pf1',
        title: goals.length ? `Weekly focus: ${goals[0].name}` : 'Set a clear weekly focus',
        summary: goals.length ? `Prioritize “${goals[0].name}”. Define one measurable action for this week.` : 'Choose 1–2 goals to focus on and define one measurable action.',
        tags: ['goals'],
        confidence: 0.7,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pf2',
        title: hasMagnesium ? 'Optimize magnesium timing' : 'Start with simple sleep support',
        summary: hasMagnesium ? 'You already take magnesium — try 1–2 hours before bed and avoid pairing with high‑fiber meals for absorption.' : 'If appropriate, consider evening magnesium to support sleep quality.',
        tags: ['supplement','timing','sleep'],
        confidence: 0.72,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pf3',
        title: hasIron && hasCalcium ? 'Separate iron and calcium' : 'Medication/supplement spacing check',
        summary: hasIron && hasCalcium ? 'Take iron and calcium at least 2 hours apart for absorption (check with your clinician).' : 'Review timing to avoid conflicts; spacing doses by ~2 hours can help (check with your clinician).',
        tags: ['safety','timing'],
        confidence: 0.66,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pf4',
        title: 'Protein‑forward breakfast',
        summary: 'Aim for 25–35g protein at breakfast to stabilize morning energy and appetite.',
        tags: ['nutrition','energy'],
        confidence: 0.64,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pf5',
        title: hasOmega3 ? 'Keep omega‑3 consistent' : 'Consider omega‑3 intake',
        summary: hasOmega3 ? 'Take omega‑3 with a meal containing fat for better absorption.' : 'Consider omega‑3 rich foods or a supplement (discuss with your clinician).',
        tags: ['supplement','nutrition'],
        confidence: 0.61,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pf6',
        title: 'Hydration + fiber baseline',
        summary: 'Target ~2–3L fluids daily and include fiber at each meal for digestion.',
        tags: ['hydration','nutrition'],
        confidence: 0.6,
        createdAt: new Date().toISOString(),
      },
    ]
    return items
  }

  // Real AI generation (also allowed in preview to bypass flag safely)
  const clientIp = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
  const rateKey = profile?.id ? `user:${profile.id}` : `ip:${clientIp}`
  const rateCheck = consumeRateLimit('insights-generate', rateKey, INSIGHTS_RATE_MAX, INSIGHTS_RATE_WINDOW_MS)
  if (!rateCheck.allowed) {
    const retryAfter = Math.max(1, Math.ceil(rateCheck.retryAfterMs / 1000))
    return NextResponse.json(
      { enabled: enabled || preview, items: fallback(), rateLimited: true },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  {
    try {
      const openai = getOpenAI()
      if (openai && profile) {
        const profileText = JSON.stringify({
          gender: profile.gender,
          weight: profile.weight,
          height: profile.height,
          goals: (profile.healthGoals || []).map((g: any) => g.name),
          supplements: (profile.supplements || []).map((s: any) => ({ name: s.name, timing: s.timing })),
          medications: (profile.medications || []).map((m: any) => ({ name: m.name, timing: m.timing })),
          recentFood,
          recentHealthLogs,
          weeklyNutritionSummary,
        })

        const prompt = `You are a careful, data-driven health coach. Based ONLY on the JSON profile below, generate 6 high-value, personalized insights. Avoid generic advice. Use the user's goals, supplements, medications, recent foods (with nutrients), health logs, and the 7-day nutrition summary.

Return a JSON array of items where each item has:
  id (string),
  title (string),
  summary (2–3 sentences, specific, quantified when possible),
  tags (array of strings like ['goals','supplement','medication','nutrition','timing','safety','energy','sleep']),
  confidence (0–1),
  reason (string, explain the "why" using the provided data, cite specific numbers like grams/day or averages if available),
  actions (array of 3–5 concrete steps tailored to the user; include amounts/timing/examples; where relevant say "check with your clinician").

Nutrition guidance rules:
- Use weeklyNutritionSummary.dailyAverages to reference protein_g, fiber_g, sugar_g, sodium_mg, calories when available.
- If protein appears low (< 70 g/day for average adult unless height/weight suggests otherwise), propose specific breakfast/lunch/dinner examples with grams.
- If fiber is low (< 25 g/day), suggest concrete swaps to reach ~25–35 g/day with food examples.
- If sugar is high (> 50 g/day) or sodium high (> 2300 mg/day), suggest reductions with practical substitutions.
- Use recentFood to cite examples (e.g., "based on frequent item: greek yogurt").
- Cross-link supplements/medications with timing and interactions (advice as "check with your clinician").

Keep each insight skimmable but substantive. Do not return prose outside of the JSON array.

Profile: ${profileText}`
        const resp: any = await runChatCompletionWithLogging(openai, {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 1000,
        }, { feature: 'insights:landing-generate', userId: profile.id })
        const text = resp.choices?.[0]?.message?.content || ''
        // Try to extract JSON array
        const jsonMatch = text.match(/\[([\s\S]*?)\]/)
        const items = jsonMatch ? JSON.parse(jsonMatch[0]) : fallback()
        try {
          // Save to cache for faster subsequent loads
          await prisma.$executeRawUnsafe(
            'CREATE TABLE IF NOT EXISTS "InsightsCache" ("userId" TEXT PRIMARY KEY, "items" JSONB NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())'
          )
          await prisma.$executeRawUnsafe(
            'INSERT INTO "InsightsCache" ("userId", "items", "updatedAt") VALUES ($1, $2::jsonb, NOW())\n             ON CONFLICT ("userId") DO UPDATE SET "items" = EXCLUDED."items", "updatedAt" = NOW()',
            profile.id,
            JSON.stringify(items)
          )
        } catch {}
        return NextResponse.json({ enabled: true, items, ai: true }, { status: 200 })
      }
    } catch (e) {
      // fall back below
    }
  }

  return NextResponse.json({ enabled: true, items: fallback(), preview: true }, { status: 200 })
}
