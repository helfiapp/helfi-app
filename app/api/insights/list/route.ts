import { NextResponse } from 'next/server'

export async function GET() {
  const enabled = process.env.NEXT_PUBLIC_INSIGHTS_ENABLED === 'true'
  if (!enabled) {
    return NextResponse.json({ enabled: false, items: [] }, { status: 200 })
  }

  // Mock data only; real generation comes later
  const items = [
    { id: 'i1', title: 'Hydration may be low', summary: 'Increase water intake to ~2–3L/day.', tags: ['hydration'], confidence: 0.72, createdAt: new Date().toISOString() },
    { id: 'i2', title: 'Magnesium timing', summary: 'Consider magnesium 1–2 hours before sleep.', tags: ['supplement'], confidence: 0.81, createdAt: new Date().toISOString() },
    { id: 'i3', title: 'Sodium and BP', summary: 'Watch sodium if BP is elevated; prefer low‑sodium options.', tags: ['nutrition','bp'], confidence: 0.65, createdAt: new Date().toISOString() },
  ]

  return NextResponse.json({ enabled: true, items }, { status: 200 })
}


