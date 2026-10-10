import { NextRequest, NextResponse } from 'next/server'
import { POST } from '@/app/api/analyze-food/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  // Forward only this current request's authentication. The common handler
  // verifies consent and matches the job to the authenticated account.
  const url = new URL('/api/analyze-food', req.url)
  url.searchParams.set('foodJobId', context.params.id)
  try {
    return await POST(new NextRequest(url, { method: 'POST', headers: req.headers }))
  } catch {
    return NextResponse.json({ error: 'The photo result could not be checked. Please try again.', code: 'food_job_check_unavailable' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
