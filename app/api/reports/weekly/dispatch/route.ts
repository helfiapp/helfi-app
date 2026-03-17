import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import { Resend } from 'resend'
import { isSchedulerAuthorized } from '@/lib/scheduler-auth'
import { dedupeSubscriptions, normalizeSubscriptionList, removeSubscriptionsByEndpoint, sendToSubscriptions } from '@/lib/push-subscriptions'
import { getEmailFooter } from '@/lib/email-footer'
import { getWeeklyReportById, updateWeeklyReportRecord } from '@/lib/weekly-health-report'
import { createInboxNotification } from '@/lib/notification-inbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DispatchPayload = {
  userId: string
  reportId: string
  timezone?: string
  testEmail?: string
}

function getBaseUrl() {
  let base = process.env.PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  if (!base) base = 'https://helfi.ai'
  base = base.trim()
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`
  return base.replace(/\/+$/, '')
}

function getResendClient() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function extractSummaryPoints(summary?: string | null) {
  const raw = String(summary || '')
    .replace(/\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return []

  const normalized = raw
    .replace(/\s+-\s+(?=[A-Z0-9])/g, '\n- ')
    .replace(/\s+•\s+/g, '\n• ')

  const points = normalized
    .split(/\n+/)
    .map((line) => line.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)

  if (points.length > 1) {
    return points.slice(0, 6)
  }

  return raw
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
}

function buildWeeklyReportEmail(params: {
  title: string
  bodyText: string
  periodText: string
  summary?: string | null
  reportUrl: string
  recipient: string
  isLocked: boolean
  isTestEmail: boolean
}) {
  const summaryPoints = extractSummaryPoints(params.summary)
  const actionLabel = params.isLocked ? 'Open report' : 'View report'
  const introText = params.isLocked
    ? 'Unlock your report to see the full detail.'
    : 'Here is the quick version before you open it.'
  const testPill = params.isTestEmail
    ? `<div style="display:inline-block; margin: 0 0 14px; padding: 6px 10px; border-radius: 999px; background: #ecfeff; color: #0f766e; font-size: 12px; font-weight: 700; letter-spacing: 0.03em;">TEST EMAIL</div>`
    : ''
  const summaryHtml = summaryPoints.length
    ? `
      <div style="margin-top: 24px;">
        <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">This week at a glance</div>
        ${summaryPoints
          .map(
            (point) => `
              <div style="margin-bottom: 10px; padding: 14px 16px; border: 1px solid #dbeafe; border-radius: 14px; background: #f8fbff;">
                <div style="font-size: 14px; line-height: 1.6; color: #334155;">${escapeHtml(point)}</div>
              </div>
            `
          )
          .join('')}
      </div>
    `
    : ''

  const html = `
    <div style="margin: 0; padding: 28px 16px; background: #f8fafc; font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; overflow: hidden; box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);">
        <div style="padding: 28px 28px 22px; background: linear-gradient(135deg, #0f172a 0%, #0f766e 100%); color: #ffffff;">
          ${testPill}
          <div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.8;">Helfi weekly report</div>
          <h1 style="margin: 10px 0 0; font-size: 30px; line-height: 1.2; color: #ffffff;">${escapeHtml(params.title)}</h1>
          ${params.periodText ? `<div style="margin-top: 12px; display: inline-block; padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,0.14); font-size: 13px; color: #e2e8f0;">${escapeHtml(params.periodText)}</div>` : ''}
        </div>

        <div style="padding: 28px;">
          <p style="margin: 0 0 8px; font-size: 16px; line-height: 1.7; color: #334155;">${escapeHtml(params.bodyText)}</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #64748b;">${escapeHtml(introText)}</p>
          ${summaryHtml}

          <div style="margin-top: 26px;">
            <a href="${params.reportUrl}" style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none; padding: 14px 22px; border-radius: 12px; font-size: 15px; font-weight: 700;">${actionLabel}</a>
          </div>
        </div>

        ${getEmailFooter({
          recipientEmail: params.recipient,
          emailType: 'transactional',
          reasonText: params.isTestEmail
            ? 'This is a test of your Helfi weekly report email.'
            : 'You received this email because your 7-day Helfi health report is ready.',
        })}
      </div>
    </div>
  `

  const text = [
    params.isTestEmail ? `TEST EMAIL` : null,
    params.title,
    params.periodText ? `Period: ${params.periodText}` : null,
    params.bodyText,
    summaryPoints.length ? '' : null,
    ...summaryPoints.map((point) => `- ${point}`),
    '',
    `${actionLabel}: ${params.reportUrl}`,
  ]
    .filter(Boolean)
    .join('\n')

  return { html, text }
}

export async function POST(req: NextRequest) {
  try {
    if (!isSchedulerAuthorized(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as Partial<DispatchPayload>
    const userId = String(body.userId || '')
    const reportId = String(body.reportId || '')
    const testEmail = String(body.testEmail || '').trim()
    const isTestEmail = !!testEmail
    if (!userId || !reportId) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    const report = await getWeeklyReportById(userId, reportId)
    if (!report || (report.status !== 'READY' && report.status !== 'LOCKED')) {
      return NextResponse.json({ skipped: 'report_not_ready' })
    }

    const alreadyPushed = !!report.pushSentAt
    const alreadyEmailed = !!report.emailSentAt
    if (!isTestEmail && alreadyPushed && alreadyEmailed) {
      return NextResponse.json({ skipped: 'already_notified' })
    }

    const isLocked = report.status === 'LOCKED'
    const title = isLocked
      ? 'Your 7-day health report is ready to unlock'
      : 'Your 7-day health report is ready'
    const emailSubject = 'View your seven day health report'
    const bodyText = isLocked
      ? 'Unlock your report to see what is working, what to focus on next, and what to avoid.'
      : 'Open your report to see what is working, what to focus on next, and what to avoid.'
    const baseUrl = getBaseUrl()
    const reportUrl = `${baseUrl}/insights/weekly-report?id=${encodeURIComponent(report.id)}`

    const results: Record<string, string> = {}
    let loggedInbox = false

    if (!alreadyPushed && !isTestEmail) {
      const subscriptionRows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
        `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
        userId
      )

      if (!subscriptionRows.length) {
        results.pushStatus = 'no_subscription'
      } else {
        const subscriptions = dedupeSubscriptions(normalizeSubscriptionList(subscriptionRows[0].subscription))
        if (!subscriptions.length) {
          results.pushStatus = 'no_subscription'
        } else {
          const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
          const privateKey = process.env.VAPID_PRIVATE_KEY || ''
          if (!publicKey || !privateKey) {
            results.pushStatus = 'vapid_not_configured'
          } else {
            webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)
            const payload = JSON.stringify({
              title,
              body: bodyText,
              url: `/insights/weekly-report?id=${reportId}`,
            })
            const { sent, errors, goneEndpoints } = await sendToSubscriptions(subscriptions, (sub) =>
              webpush.sendNotification(sub, payload)
            )
            if (goneEndpoints.length) {
              const remaining = removeSubscriptionsByEndpoint(subscriptions, goneEndpoints)
              await prisma.$executeRawUnsafe(
                `UPDATE PushSubscriptions SET subscription = $2::jsonb, updatedAt = NOW() WHERE userId = $1`,
                userId,
                JSON.stringify(remaining)
              )
            }
            if (sent > 0) {
              await updateWeeklyReportRecord(userId, reportId, { pushSentAt: new Date().toISOString() })
              results.pushStatus = 'sent'
              loggedInbox = true
            } else {
              results.pushStatus = `failed:${errors?.[0]?.message || 'unknown'}`
            }
          }
        }
      }
    }

    if (!alreadyEmailed || isTestEmail) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
      const recipient = testEmail || user?.email || ''
      const resend = getResendClient()

      if (!recipient) {
        results.emailStatus = 'missing_email'
      } else if (!resend) {
        results.emailStatus = 'resend_not_configured'
      } else {
        const subject = isTestEmail ? `TEST: ${emailSubject}` : emailSubject
        const periodText = report.periodStart && report.periodEnd
          ? `${report.periodStart} to ${report.periodEnd}`
          : ''
        const { html, text } = buildWeeklyReportEmail({
          title,
          bodyText,
          periodText,
          summary: report.summary,
          reportUrl,
          recipient,
          isLocked,
          isTestEmail,
        })

        try {
          await resend.emails.send({
            from: 'Helfi Team <support@helfi.ai>',
            to: recipient,
            subject,
            html,
            text,
          })
          if (!isTestEmail) {
            await updateWeeklyReportRecord(userId, reportId, { emailSentAt: new Date().toISOString() })
            loggedInbox = true
          }
          results.emailStatus = isTestEmail ? 'test_sent' : 'sent'
        } catch (error: any) {
          results.emailStatus = `failed:${error?.message || 'unknown'}`
        }
      }
    }

    if (loggedInbox) {
      await createInboxNotification({
        userId,
        title,
        body: bodyText,
        url: `/insights/weekly-report?id=${reportId}`,
        type: 'weekly_report',
        source: 'system',
        eventKey: `weekly_report:${reportId}`,
        metadata: { reportId, status: report.status },
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, results })
  } catch (error: any) {
    console.error('[weekly-report-dispatch] error', error?.stack || error)
    return NextResponse.json({ error: 'dispatch_error', message: error?.message || String(error) }, { status: 500 })
  }
}
