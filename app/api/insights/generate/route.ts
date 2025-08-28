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
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.id) {
      profile = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
          healthGoals: true,
          supplements: true,
          medications: true,
        },
      })
    }
  } catch {
    // non-blocking
  }

  // Simple personalized fallback insights (used for preview and for safety)
  const fallback = () => {
    const goals = profile?.healthGoals?.filter((g: any) => !g.name?.startsWith('__')) || []
    const supplements = profile?.supplements || []
    const meds = profile?.medications || []
    const items = [
      {
        id: 'p1',
        title: goals.length ? `Focus: ${goals[0].name}` : 'Set a clear weekly focus',
        summary: goals.length ? `We will prioritize progress on “${goals[0].name}”.` : 'Choose 1–2 goals to focus on this week.',
        tags: ['goals'],
        confidence: 0.7,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'p2',
        title: supplements.length ? 'Supplement timing check' : 'Start with a simple supplement plan',
        summary: supplements.length ? 'Consider evening magnesium for sleep quality.' : 'If appropriate, consider magnesium at night for relaxation.',
        tags: ['supplement'],
        confidence: 0.6,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'p3',
        title: meds.length ? 'Medication interactions watch' : 'Nutrition focus for energy',
        summary: meds.length ? 'Avoid high‑sodium meals if on BP‑related meds.' : 'Try balanced meals with protein + fiber to steady energy.',
        tags: ['safety','nutrition'],
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
        })

        const prompt = `You are a careful health coach. Based ONLY on this JSON profile, produce 3 short insights in JSON with fields: id, title, summary, tags (array), confidence (0-1). Keep plain, safe, non-medical-advice wording. Profile: ${profileText}`
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
        return NextResponse.json({ enabled: true, items, ai: true }, { status: 200 })
      }
    } catch (e) {
      // fall back below
    }
  }

  return NextResponse.json({ enabled: true, items: fallback(), preview: true }, { status: 200 })
}


