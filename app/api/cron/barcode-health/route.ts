import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { reportCriticalError } from '@/lib/error-reporter'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SUPPORT_ALERT_EMAIL = (process.env.SUPPORT_ALERT_EMAIL || 'support@helfi.ai').trim() || 'support@helfi.ai'

function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const expected = process.env.SCHEDULER_SECRET || ''
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null
  return isVercelCron || (expected && authHeader === `Bearer ${expected}`)
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await prisma.barcodeProduct.findFirst({ select: { barcode: true } })
    await prisma.foodLibraryItem.findFirst({ select: { id: true } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    await reportCriticalError({
      source: 'barcode-health-check',
      error,
      details: { message: 'Barcode storage check failed.' },
      recipientEmail: SUPPORT_ALERT_EMAIL,
    })
    return NextResponse.json({ ok: false, error: 'Barcode storage check failed.' }, { status: 500 })
  }
}
