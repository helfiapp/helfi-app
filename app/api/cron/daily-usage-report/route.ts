import { NextRequest, NextResponse } from 'next/server'
import { sendUsageReportEmail } from '@/lib/admin-alerts'
import { fetchNeonUsageSummary } from '@/lib/neon-usage'
import { formatBytes, formatNumber, getActivityCounts, getSpikeCandidates } from '@/lib/usage-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const expected = process.env.SCHEDULER_SECRET || ''
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null
  return isVercelCron || (expected && authHeader === `Bearer ${expected}`)
}

function getMelbourneTimeParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0')
  return { hour, minute }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const melbourne = getMelbourneTimeParts(now)
  if (melbourne.hour !== 10) {
    return NextResponse.json({ skipped: true, reason: 'outside_10am_window' })
  }

  const reportEnd = new Date()
  const reportStart = new Date(reportEnd.getTime() - 24 * 60 * 60 * 1000)

  const activity = await getActivityCounts(reportStart, reportEnd)
  const topActivity = activity.slice(0, 5)

  const spikeWindowMinutes = 10
  const baselineHours = 6
  const baselineWindows = (baselineHours * 60) / spikeWindowMinutes
  const recentFrom = new Date(reportEnd.getTime() - spikeWindowMinutes * 60 * 1000)
  const baselineFrom = new Date(reportEnd.getTime() - baselineHours * 60 * 60 * 1000)

  const spikeCandidates = await getSpikeCandidates({
    recentFrom,
    recentTo: reportEnd,
    baselineFrom,
    baselineTo: reportEnd,
    baselineWindows,
  })

  const spikes = spikeCandidates.filter((row) => {
    if (row.recentCount < row.spikeThreshold) return false
    const baseline = row.baselinePerWindow || 0
    if (baseline === 0) return row.recentCount >= row.spikeThreshold
    return row.recentCount >= baseline * 3
  })

  const neonUsage = await fetchNeonUsageSummary({
    from: reportStart.toISOString(),
    to: reportEnd.toISOString(),
    granularity: 'daily',
    orgId: (process.env.NEON_ORG_ID || '').trim() || undefined,
  })

  const usageLines = Object.entries(neonUsage?.metrics || {})
    .map(([key, value]) => {
      if (/bytes/i.test(key)) {
        return `${key}: ${formatBytes(value)}`
      }
      return `${key}: ${formatNumber(value)}`
    })
    .sort()

  const subject = 'Helfi daily usage report'
  const recipientEmail = 'support@helfi.ai'

  const activityHtml = topActivity.length
    ? `<ul>${topActivity
        .map((row) => `<li>${row.label}: ${formatNumber(row.count)}</li>`)
        .join('')}</ul>`
    : '<p>No activity recorded.</p>'

  const spikeHtml = spikes.length
    ? `<ul>${spikes
        .map(
          (row) =>
            `<li>${row.label}: ${formatNumber(row.recentCount)} in last ${spikeWindowMinutes} mins (baseline ${formatNumber(Math.round(row.baselinePerWindow || 0))})</li>`
        )
        .join('')}</ul>`
    : '<p>No spikes detected.</p>'

  const neonHtml = neonUsage
    ? usageLines.length
      ? `<ul>${usageLines.map((line) => `<li>${line}</li>`).join('')}</ul>`
      : '<p>No Neon usage data found.</p>'
    : '<p>Neon API key missing or invalid.</p>'

  const neonNote = neonUsage?.note
    ? `<p style="color:#b91c1c;">Note: ${neonUsage.note}</p>`
    : ''

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Daily usage report</h2>
      <p style="margin: 0 0 12px 0;">Window: ${reportStart.toISOString()} → ${reportEnd.toISOString()}</p>

      <h3 style="margin: 18px 0 8px 0;">Biggest database activity</h3>
      ${activityHtml}

      <h3 style="margin: 18px 0 8px 0;">Spikes (last ${spikeWindowMinutes} minutes)</h3>
      ${spikeHtml}

      <h3 style="margin: 18px 0 8px 0;">Neon usage (from API)</h3>
      ${neonHtml}
      ${neonNote}
    </div>
  `

  await sendUsageReportEmail({
    recipientEmail,
    subject,
    html,
  })

  return NextResponse.json({ ok: true, sentTo: recipientEmail })
}
