import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { sendExistingMemberFeedbackEmail } from '@/lib/welcome-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const dryRun = body?.dryRun === true
    const limitRaw = Number(body?.limit)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : null
    const testEmail = typeof body?.testEmail === 'string' ? body.testEmail.trim().toLowerCase() : ''

    let recipients: Array<{ email: string; name: string }> = []

    if (testEmail) {
      const user = await prisma.user.findUnique({
        where: { email: testEmail },
        select: { email: true, name: true },
      })
      if (!user?.email) {
        return NextResponse.json({ error: `No user found for ${testEmail}` }, { status: 404 })
      }
      recipients = [{ email: user.email, name: user.name || user.email.split('@')[0] }]
    } else {
      const users = await prisma.user.findMany({
        where: { emailVerified: { not: null } },
        select: { email: true, name: true },
        orderBy: { createdAt: 'asc' },
        ...(limit ? { take: limit } : {}),
      })

      recipients = users
        .map((user) => ({
          email: String(user.email || '').trim().toLowerCase(),
          name: user.name || String(user.email || '').split('@')[0] || 'there',
        }))
        .filter((user) => Boolean(user.email))
    }

    if (recipients.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No recipients found.',
        summary: { total: 0, sent: 0, failed: 0 },
      })
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `Dry run complete. ${recipients.length} users would receive the feedback email.`,
        summary: { total: recipients.length, sent: 0, failed: 0 },
      })
    }

    let sent = 0
    let failed = 0
    const failures: Array<{ email: string; error: string }> = []

    for (const recipient of recipients) {
      try {
        const ok = await sendExistingMemberFeedbackEmail(recipient.email, recipient.name)
        if (ok) {
          sent += 1
        } else {
          failed += 1
          failures.push({ email: recipient.email, error: 'Send failed' })
        }
      } catch (error: any) {
        failed += 1
        failures.push({ email: recipient.email, error: error?.message || 'Unknown error' })
      }
    }

    return NextResponse.json({
      success: failed === 0,
      message:
        failed === 0
          ? `Sent feedback request email to ${sent} users.`
          : `Sent ${sent} emails. ${failed} failed.`,
      summary: {
        total: recipients.length,
        sent,
        failed,
      },
      failures: failures.slice(0, 20),
    })
  } catch (error: any) {
    console.error('Error sending feedback request email blast:', error)
    return NextResponse.json(
      { error: 'Failed to send feedback request emails.', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
