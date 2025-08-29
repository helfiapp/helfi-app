import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
            take: 5,
          },
          healthLogs: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { goal: true }
          },
        },
      })
      recentFood = (profile?.foodLogs || []).map((f: any) => ({ name: f.name, createdAt: f.createdAt }))
      recentHealthLogs = (profile?.healthLogs || []).map((h: any) => ({ goal: h.goal?.name, rating: h.rating, createdAt: h.createdAt }))
    }
  } catch {
    // non-blocking
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
        })

        const prompt = `You are a careful, data-driven health coach. Based ONLY on the JSON profile below, generate 6 concise, high-value insights that a user would gladly pay for. Avoid generic advice. Personalize to the user's goals, supplements, medications, and recent logs.

Return a JSON array of items where each item has: 
  id (string),
  title (string),
  summary (string, 1–2 sentences, actionable),
  tags (array of strings like ['goals','supplement','medication','nutrition','timing','safety','energy','sleep']),
  confidence (0–1),
  reason (string),
  actions (array of 3–5 concise steps).

Content guidance:
- Cross-link data (e.g., a supplement timing that supports a goal; a nutrition tweak to help a symptom trend from health logs).
- Flag potential medication–supplement concerns as "check with your clinician" without diagnosing.
- Give clear next steps ("move magnesium to evening", "add protein to breakfast", "separate iron and calcium by 2h").
- Keep each card independent and skimmable.

Profile: ${profileText}`
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 400,
        })
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


