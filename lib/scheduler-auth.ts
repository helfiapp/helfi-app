import { NextRequest } from 'next/server'

export function isSchedulerAuthorized(req: NextRequest): boolean {
  const expected = process.env.SCHEDULER_SECRET || ''
  const authHeader = req.headers.get('authorization') || ''
  if (expected && authHeader === `Bearer ${expected}`) return true

  if (process.env.QSTASH_REQUIRE_SIGNATURE) {
    const sig = req.headers.get('upstash-signature')
    if (sig) return true
  }

  return false
}
