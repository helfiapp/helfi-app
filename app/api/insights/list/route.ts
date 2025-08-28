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
    const res = await fetch(`${origin}/api/insights/generate?preview=1`, { method: 'POST', cache: 'no-cache' })
    const data = await res.json().catch(() => ({}))
    if (data?.items && Array.isArray(data.items)) {
      return NextResponse.json({ enabled: true, items: data.items, preview: true }, { status: 200 })
    }
  } catch {}

  // Fallback: simple sample items
  const items = [
    { id: 'i1', title: 'Hydration may be low', summary: 'Increase water intake to ~2–3L/day.', tags: ['hydration'], confidence: 0.72, createdAt: new Date().toISOString() },
    { id: 'i2', title: 'Magnesium timing', summary: 'Consider magnesium 1–2 hours before sleep.', tags: ['supplement'], confidence: 0.81, createdAt: new Date().toISOString() },
    { id: 'i3', title: 'Sodium and BP', summary: 'Watch sodium if BP is elevated; prefer low‑sodium options.', tags: ['nutrition','bp'], confidence: 0.65, createdAt: new Date().toISOString() },
  ]
  return NextResponse.json({ enabled: true, items, preview: true }, { status: 200 })
}


