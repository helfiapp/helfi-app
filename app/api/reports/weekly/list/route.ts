import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const preview = url.searchParams.get('preview') === '1'
  const enabled = process.env.NEXT_PUBLIC_REPORTS_ENABLED === 'true'
  if (!enabled && !preview) {
    return NextResponse.json({ enabled: false, reports: [] }, { status: 200 })
  }

  // Mock weekly reports list
  const reports = [
    { id: 'w1', weekStart: '2025-08-25', summary: 'Energy improved; hydration low; magnesium helpful', createdAt: new Date().toISOString() },
  ]

  return NextResponse.json({ enabled: true, reports, preview }, { status: 200 })
}


