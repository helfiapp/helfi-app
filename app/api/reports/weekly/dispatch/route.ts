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

export async function POST(req: NextRequest) {
  try {
    if (!isSchedulerAuthorized(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as Partial<DispatchPayload>
    const userId = String(body.userId || '')
    const reportId = String(body.reportId || '')
    if (!userId || !reportId) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    const report = await getWeeklyReportById(userId, reportId)
    if (!report || (report.status !== 'READY' && report.status !== 'LOCKED')) {
      return NextResponse.json({ skipped: 'report_not_ready' })
    }

    const alreadyPushed = !!report.pushSentAt
    const alreadyEmailed = !!report.emailSentAt
    if (alreadyPushed && alreadyEmailed) {
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

    if (!alreadyPushed) {
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

    if (!alreadyEmailed) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
      const recipient = user?.email || ''
      const resend = getResendClient()

      if (!recipient) {
        results.emailStatus = 'missing_email'
      } else if (!resend) {
        results.emailStatus = 'resend_not_configured'
      } else {
        const subject = emailSubject
        const periodText = report.periodStart && report.periodEnd
          ? `${report.periodStart} to ${report.periodEnd}`
          : ''
        const summaryText = report.summary
          ? `<p style="margin: 12px 0; color: #475569;">${escapeHtml(report.summary)}</p>`
          : ''
        const actionLabel = 'Health Report'

        const html = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
            <h2 style="margin: 0 0 12px; color: #0f172a;">${title}</h2>
            ${periodText ? `<p style="margin: 0 0 12px; color: #64748b;">${periodText}</p>` : ''}
            <p style="margin: 12px 0; color: #334155;">${bodyText}</p>
            ${summaryText}
            <a href="${reportUrl}" style="display: inline-block; margin-top: 16px; background: #10b981; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">${actionLabel}</a>
            ${getEmailFooter({
              recipientEmail: recipient,
              emailType: 'transactional',
              reasonText: 'You received this email because your 7-day Helfi health report is ready.',
            })}
          </div>
        `
        const text = `${emailSubject}\n${bodyText}\n${periodText ? `Period: ${periodText}\n` : ''}${report.summary || ''}\n\nView: ${reportUrl}`

        try {
          await resend.emails.send({
            from: 'Helfi Team <support@helfi.ai>',
            to: recipient,
            subject,
            html,
            text,
          })
          await updateWeeklyReportRecord(userId, reportId, { emailSentAt: new Date().toISOString() })
          results.emailStatus = 'sent'
          loggedInbox = true
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
