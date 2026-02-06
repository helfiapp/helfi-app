import { NextRequest, NextResponse } from 'next/server'
import { syncFastFoodMenus } from '@/lib/food/fast-food-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null
  const authHeader = request.headers.get('authorization')
  const expected = process.env.FAST_FOOD_MENU_SYNC_SECRET || process.env.SCHEDULER_SECRET

  if (!(isVercelCron || (expected && authHeader === `Bearer ${expected}`))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await syncFastFoodMenus()
  return NextResponse.json({ ok: true, ...result })
}
