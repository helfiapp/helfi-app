import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const preview = url.searchParams.get('preview') === '1'
  const enabled = process.env.NEXT_PUBLIC_INSIGHTS_ENABLED === 'true'
  if (!enabled && !preview) {
    return NextResponse.json({ enabled: false, items: [] }, { status: 200 })
  }

  // For preview or when enabled, ask the generator for real items (personalized if possible)
  try {
    const origin = new URL(request.url).origin
    // Cache-bust to avoid any intermediate caching layers
    const res = await fetch(`${origin}/api/insights/generate?preview=1&t=${Date.now()}`, { method: 'POST', cache: 'no-cache' })
    const data = await res.json().catch(() => ({}))
    if (data?.items && Array.isArray(data.items)) {
      return NextResponse.json({ enabled: true, items: data.items, preview: true }, { status: 200 })
    }
  } catch {}

  // Secondary fallback: derive personalized preview from stored onboarding data
  try {
    const origin = new URL(request.url).origin
    const ud = await fetch(`${origin}/api/user-data?t=${Date.now()}`, { cache: 'no-cache' }).then(r => r.json()).catch(() => null)
    const d = ud?.data || {}
    const goals: string[] = Array.isArray(d.goals) ? d.goals : []
    const supplements: any[] = Array.isArray(d.supplements) ? d.supplements : []
    const medications: any[] = Array.isArray(d.medications) ? d.medications : []
    const todaysFoods: any[] = Array.isArray(d.todaysFoods) ? d.todaysFoods : []

    const hasMagnesium = supplements.some(s => /magnesium/i.test(s.name || ''))
    const hasIron = supplements.some(s => /iron/i.test(s.name || ''))
    const hasCalcium = supplements.some(s => /calcium/i.test(s.name || ''))
    const hasOmega3 = supplements.some(s => /(omega|fish\s*oil)/i.test(s.name || ''))

    const items = [
      {
        id: 'pf1',
        title: goals.length ? `Weekly focus: ${goals[0]}` : 'Set a clear weekly focus',
        summary: goals.length ? `Prioritize progress on “${goals[0]}”. Define one measurable action for this week.` : 'Choose 1–2 goals to focus on and define one measurable action.',
        tags: ['goals'],
        confidence: 0.7,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pf2',
        title: hasMagnesium ? 'Move magnesium to evening' : 'Start with simple sleep support',
        summary: hasMagnesium ? 'Magnesium is often best 1–2 hours before bed; avoid pairing with high-fiber meals.' : 'If appropriate, consider magnesium in the evening to support sleep quality.',
        tags: ['supplement','timing','sleep'],
        confidence: 0.72,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pf3',
        title: hasIron && hasCalcium ? 'Separate iron and calcium' : 'Medication/supplement spacing check',
        summary: hasIron && hasCalcium ? 'Take iron and calcium at least 2 hours apart for better absorption (confirm with your clinician).' : 'Review timing to avoid conflicts; spacing doses by 2 hours can help (check with your clinician).',
        tags: ['safety','timing'],
        confidence: 0.66,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pf4',
        title: 'Protein-forward breakfast',
        summary: 'Aim for 25–35g protein at breakfast to stabilize morning energy and appetite.',
        tags: ['nutrition','energy'],
        confidence: 0.64,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pf5',
        title: hasOmega3 ? 'Keep omega‑3 consistent' : 'Consider omega‑3 intake',
        summary: hasOmega3 ? 'Take omega‑3 with a meal containing fat for better absorption.' : 'Discuss adding omega‑3 rich foods or a supplement with your clinician for cardio‑metabolic support.',
        tags: ['supplement','nutrition'],
        confidence: 0.61,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pf6',
        title: todaysFoods.length ? 'Balance carbs + fiber' : 'Hydration and fiber baseline',
        summary: todaysFoods.length ? 'Pair carbs with protein and fiber to steady energy; add veggies or legumes to meals.' : 'Target ~2–3L fluids daily and include fiber at each meal for digestion.',
        tags: ['nutrition','hydration'],
        confidence: 0.6,
        createdAt: new Date().toISOString(),
      },
    ]
    return NextResponse.json({ enabled: true, items, preview: true }, { status: 200 })
  } catch {}

  // Final static fallback
  const items = [
    { id: 'i1', title: 'Hydration may be low', summary: 'Increase water intake to ~2–3L/day.', tags: ['hydration'], confidence: 0.72, createdAt: new Date().toISOString() },
    { id: 'i2', title: 'Magnesium timing', summary: 'Consider magnesium 1–2 hours before sleep.', tags: ['supplement'], confidence: 0.81, createdAt: new Date().toISOString() },
    { id: 'i3', title: 'Sodium and BP', summary: 'Watch sodium if BP is elevated; prefer low‑sodium options.', tags: ['nutrition','bp'], confidence: 0.65, createdAt: new Date().toISOString() },
  ]
  return NextResponse.json({ enabled: true, items, preview: true }, { status: 200 })
}


