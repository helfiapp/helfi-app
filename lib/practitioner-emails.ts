import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { getEmailFooter } from '@/lib/email-footer'
import type { PractitionerEmailType } from '@prisma/client'

const DEFAULT_SUPPORT_EMAIL = 'support@helfi.ai'

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.log('📧 Resend API not configured, skipping practitioner email')
    return null
  }
  return new Resend(process.env.RESEND_API_KEY)
}

function getSupportEmail(): string {
  const configured = (process.env.PRACTITIONER_SUPPORT_EMAIL || '').trim()
  return configured || DEFAULT_SUPPORT_EMAIL
}

function getBaseUrl(): string {
  let base =
    process.env.PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://helfi.ai'
  base = base.trim()
  if (base && !/^https?:\/\//i.test(base)) {
    base = `https://${base}`
  }
  return base.replace(/\/+$/, '')
}

async function logEmail(options: {
  practitionerAccountId?: string | null
  listingId?: string | null
  type: PractitionerEmailType
  toEmail: string
  metadata?: Record<string, any>
}) {
  try {
    await prisma.practitionerEmailLog.create({
      data: {
        practitionerAccountId: options.practitionerAccountId || null,
        listingId: options.listingId || null,
        type: options.type,
        toEmail: options.toEmail,
        sentAt: new Date(),
        metadata: options.metadata || undefined,
      },
    })
  } catch (error) {
    console.warn('[PractitionerEmailLog] Failed to log email', error)
  }
}

function dispatchEmail(options: {
  resend: Resend
  label: string
  message: { from: string; to: string; subject: string; html: string }
  log: {
    practitionerAccountId?: string | null
    listingId?: string | null
    type: PractitionerEmailType
    toEmail: string
    metadata?: Record<string, any>
  }
}) {
  options.resend.emails
    .send(options.message)
    .then((emailResponse) => {
      console.log(`✅ [${options.label}] Sent to ${options.message.to} with ID: ${emailResponse.data?.id}`)
      void logEmail(options.log)
    })
    .catch((error) => {
      console.error(`[${options.label}] Email failed`, error)
    })
}

export async function sendPractitionerApprovedEmail(options: {
  practitionerAccountId?: string | null
  listingId: string
  toEmail: string
  displayName: string
  slug: string
}) {
  const resend = getResendClient()
  if (!resend) return

  const subject = `Your listing is live on Helfi`
  const listingUrl = `${getBaseUrl()}/practitioners/${options.slug}`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">You're live on Helfi</h2>
      <p style="margin: 0 0 12px 0;">Great news — your listing for <strong>${options.displayName}</strong> is now active.</p>
      <p style="margin: 0 0 16px 0;">View your listing:</p>
      <a href="${listingUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:600;">View listing</a>
      ${getEmailFooter({
        recipientEmail: options.toEmail,
        emailType: 'support',
        reasonText: 'You received this email because your practitioner listing was approved.'
      })}
    </div>
  `

  dispatchEmail({
    resend,
    label: 'PRACTITIONER APPROVED',
    message: {
      from: 'Helfi <support@helfi.ai>',
      to: options.toEmail,
      subject,
      html,
    },
    log: {
      practitionerAccountId: options.practitionerAccountId,
      listingId: options.listingId,
      type: 'LISTING_APPROVED',
      toEmail: options.toEmail,
      metadata: { listingUrl },
    },
  })
}

function dispatchEmailNoLog(options: {
  resend: Resend
  label: string
  message: { from: string; to: string; subject: string; html: string }
}) {
  options.resend.emails
    .send(options.message)
    .then((emailResponse) => {
      console.log(`✅ [${options.label}] Sent to ${options.message.to} with ID: ${emailResponse.data?.id}`)
    })
    .catch((error) => {
      console.error(`[${options.label}] Email failed`, error)
    })
}

export async function sendPractitionerReviewEmail(options: {
  practitionerAccountId?: string | null
  listingId: string
  toEmail: string
  displayName: string
}) {
  const resend = getResendClient()
  if (!resend) return

  const subject = `Your Helfi listing is under review`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Thanks for applying</h2>
      <p style="margin: 0 0 12px 0;">We received your listing for <strong>${options.displayName}</strong>.</p>
      <p style="margin: 0 0 12px 0;">We run a quick safety check on every listing. Yours needs a manual review, so it will stay hidden for now.</p>
      <p style="margin: 0 0 16px 0;">Our team will review it shortly and email you as soon as it is approved.</p>
      ${getEmailFooter({
        recipientEmail: options.toEmail,
        emailType: 'support',
        reasonText: 'You received this email because your practitioner listing needs a manual review.'
      })}
    </div>
  `

  dispatchEmail({
    resend,
    label: 'PRACTITIONER REVIEW',
    message: {
      from: 'Helfi <support@helfi.ai>',
      to: options.toEmail,
      subject,
      html,
    },
    log: {
      practitionerAccountId: options.practitionerAccountId,
      listingId: options.listingId,
      type: 'LISTING_FLAGGED',
      toEmail: options.toEmail,
    },
  })
}

export async function sendPractitionerRejectedEmail(options: {
  practitionerAccountId?: string | null
  listingId: string
  toEmail: string
  displayName: string
  reason: string
}) {
  const resend = getResendClient()
  if (!resend) return

  const subject = `Update on your Helfi listing`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Listing not approved</h2>
      <p style="margin: 0 0 12px 0;">We reviewed your listing for <strong>${options.displayName}</strong>.</p>
      <p style="margin: 0 0 12px 0;">Reason:</p>
      <div style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:14px;white-space:pre-wrap;">${options.reason}</div>
      <p style="margin: 16px 0 0 0;">You can update your listing and resubmit when ready.</p>
      ${getEmailFooter({
        recipientEmail: options.toEmail,
        emailType: 'support',
        reasonText: 'You received this email because your practitioner listing was rejected.'
      })}
    </div>
  `

  dispatchEmail({
    resend,
    label: 'PRACTITIONER REJECTED',
    message: {
      from: 'Helfi <support@helfi.ai>',
      to: options.toEmail,
      subject,
      html,
    },
    log: {
      practitionerAccountId: options.practitionerAccountId,
      listingId: options.listingId,
      type: 'LISTING_REJECTED',
      toEmail: options.toEmail,
      metadata: { reason: options.reason },
    },
  })
}

export async function sendPractitionerAdminFlaggedEmail(options: {
  listingId: string
  displayName: string
  riskLevel?: string | null
  reasoning?: string | null
}) {
  const resend = getResendClient()
  if (!resend) return

  const supportEmail = getSupportEmail()
  const baseUrl = getBaseUrl()
  const reviewUrl = `${baseUrl}/admin-panel?tab=practitioners&listingId=${options.listingId}`
  const subject = `Review needed: ${options.displayName}`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Listing needs review</h2>
      <p style="margin: 0 0 6px 0;"><strong>Listing:</strong> ${options.displayName}</p>
      ${options.riskLevel ? `<p style="margin: 0 0 6px 0;"><strong>Risk:</strong> ${options.riskLevel}</p>` : ''}
      ${options.reasoning ? `<p style="margin: 0 0 12px 0;"><strong>Notes:</strong> ${options.reasoning}</p>` : ''}
      <p style="margin: 0 0 12px 0;">Open the listing to approve or reject it.</p>
      <a href="${reviewUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:600;">Review listing</a>
      ${getEmailFooter({
        recipientEmail: supportEmail,
        emailType: 'admin',
        reasonText: 'You received this email because a listing was flagged for review.'
      })}
    </div>
  `

  dispatchEmail({
    resend,
    label: 'PRACTITIONER FLAGGED ADMIN',
    message: {
      from: 'Helfi Alerts <support@helfi.ai>',
      to: supportEmail,
      subject,
      html,
    },
    log: {
      listingId: options.listingId,
      type: 'LISTING_FLAGGED',
      toEmail: supportEmail,
      metadata: { reviewUrl },
    },
  })
}

export async function sendPractitionerAdminActivatedEmail(options: {
  listingId: string
  displayName: string
  slug: string
}) {
  const resend = getResendClient()
  if (!resend) return

  const supportEmail = getSupportEmail()
  const baseUrl = getBaseUrl()
  const listingUrl = `${baseUrl}/practitioners/${options.slug}`
  const subject = `Listing activated: ${options.displayName}`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Listing activated</h2>
      <p style="margin: 0 0 12px 0;">${options.displayName} is now live.</p>
      <a href="${listingUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:600;">View listing</a>
      ${getEmailFooter({
        recipientEmail: supportEmail,
        emailType: 'admin',
        reasonText: 'You received this email because a practitioner listing was approved.'
      })}
    </div>
  `

  dispatchEmail({
    resend,
    label: 'PRACTITIONER APPROVED ADMIN',
    message: {
      from: 'Helfi Alerts <support@helfi.ai>',
      to: supportEmail,
      subject,
      html,
    },
    log: {
      listingId: options.listingId,
      type: 'LISTING_ACTIVATED',
      toEmail: supportEmail,
      metadata: { listingUrl },
    },
  })
}

export async function sendPractitionerTrialReminderEmail(options: {
  practitionerAccountId?: string | null
  listingId: string
  toEmail: string
  displayName: string
  daysLeft: number
}) {
  const resend = getResendClient()
  if (!resend) return

  const subject = `Your Helfi listing trial ends in ${options.daysLeft} days`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Trial reminder</h2>
      <p style="margin: 0 0 12px 0;">Your listing for <strong>${options.displayName}</strong> will hide in ${options.daysLeft} days if you do not subscribe.</p>
      <p style="margin: 0 0 16px 0;">To keep it live, open your practitioner dashboard and start the subscription.</p>
      ${getEmailFooter({
        recipientEmail: options.toEmail,
        emailType: 'support',
        reasonText: 'You received this email because your practitioner listing trial is ending.'
      })}
    </div>
  `

  dispatchEmail({
    resend,
    label: 'PRACTITIONER TRIAL REMINDER',
    message: {
      from: 'Helfi <support@helfi.ai>',
      to: options.toEmail,
      subject,
      html,
    },
    log: {
      practitionerAccountId: options.practitionerAccountId,
      listingId: options.listingId,
      type: options.daysLeft === 14 ? 'TRIAL_14D' : options.daysLeft === 7 ? 'TRIAL_7D' : 'TRIAL_1D',
      toEmail: options.toEmail,
    },
  })
}

export async function sendPractitionerTrialEndedEmail(options: {
  practitionerAccountId?: string | null
  listingId: string
  toEmail: string
  displayName: string
}) {
  const resend = getResendClient()
  if (!resend) return

  const subject = `Your Helfi listing is now hidden`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Trial ended</h2>
      <p style="margin: 0 0 12px 0;">Your listing for <strong>${options.displayName}</strong> is now hidden because the trial ended.</p>
      <p style="margin: 0 0 16px 0;">You can reactivate it anytime by starting the subscription in your practitioner dashboard.</p>
      ${getEmailFooter({
        recipientEmail: options.toEmail,
        emailType: 'support',
        reasonText: 'You received this email because your practitioner listing trial ended.'
      })}
    </div>
  `

  dispatchEmail({
    resend,
    label: 'PRACTITIONER TRIAL ENDED',
    message: {
      from: 'Helfi <support@helfi.ai>',
      to: options.toEmail,
      subject,
      html,
    },
    log: {
      practitionerAccountId: options.practitionerAccountId,
      listingId: options.listingId,
      type: 'TRIAL_ENDED',
      toEmail: options.toEmail,
    },
  })
}

export async function sendPractitionerPaymentFailedEmail(options: {
  practitionerAccountId?: string | null
  listingId: string
  toEmail: string
  displayName: string
}) {
  const resend = getResendClient()
  if (!resend) return

  const subject = `Payment issue for your Helfi listing`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Payment issue</h2>
      <p style="margin: 0 0 12px 0;">We could not process the subscription payment for <strong>${options.displayName}</strong>.</p>
      <p style="margin: 0 0 16px 0;">Please update your payment method in your practitioner dashboard to keep the listing live.</p>
      ${getEmailFooter({
        recipientEmail: options.toEmail,
        emailType: 'support',
        reasonText: 'You received this email because your practitioner subscription payment failed.'
      })}
    </div>
  `

  dispatchEmail({
    resend,
    label: 'PRACTITIONER PAYMENT FAILED',
    message: {
      from: 'Helfi <support@helfi.ai>',
      to: options.toEmail,
      subject,
      html,
    },
    log: {
      practitionerAccountId: options.practitionerAccountId,
      listingId: options.listingId,
      type: 'SUB_FAILED',
      toEmail: options.toEmail,
    },
  })
}

export async function sendPractitionerSubscriptionCanceledEmail(options: {
  practitionerAccountId?: string | null
  listingId: string
  toEmail: string
  displayName: string
}) {
  const resend = getResendClient()
  if (!resend) return

  const subject = `Subscription canceled for your Helfi listing`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Subscription canceled</h2>
      <p style="margin: 0 0 12px 0;">Your subscription for <strong>${options.displayName}</strong> has been canceled.</p>
      <p style="margin: 0 0 16px 0;">Your listing will be hidden at the end of the billing period.</p>
      ${getEmailFooter({
        recipientEmail: options.toEmail,
        emailType: 'support',
        reasonText: 'You received this email because your practitioner subscription was canceled.'
      })}
    </div>
  `

  dispatchEmail({
    resend,
    label: 'PRACTITIONER SUB CANCELED',
    message: {
      from: 'Helfi <support@helfi.ai>',
      to: options.toEmail,
      subject,
      html,
    },
    log: {
      practitionerAccountId: options.practitionerAccountId,
      listingId: options.listingId,
      type: 'SUB_CANCELED',
      toEmail: options.toEmail,
    },
  })
}

export async function sendPractitionerBoostReceiptEmail(options: {
  practitionerAccountId?: string | null
  listingId: string
  toEmail: string
  displayName: string
  radiusLabel: string
  priceCents: number
}) {
  const resend = getResendClient()
  if (!resend) return

  const price = (options.priceCents / 100).toFixed(2)
  const subject = `Boost purchase confirmed`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Boost confirmed</h2>
      <p style="margin: 0 0 12px 0;">Your listing <strong>${options.displayName}</strong> is boosted for ${options.radiusLabel}.</p>
      <p style="margin: 0 0 16px 0;">Amount paid: $${price} USD</p>
      ${getEmailFooter({
        recipientEmail: options.toEmail,
        emailType: 'support',
        reasonText: 'You received this email because you purchased a boost.'
      })}
    </div>
  `

  dispatchEmail({
    resend,
    label: 'PRACTITIONER BOOST RECEIPT',
    message: {
      from: 'Helfi <support@helfi.ai>',
      to: options.toEmail,
      subject,
      html,
    },
    log: {
      practitionerAccountId: options.practitionerAccountId,
      listingId: options.listingId,
      type: 'BOOST_PURCHASED',
      toEmail: options.toEmail,
      metadata: { priceCents: options.priceCents, radiusLabel: options.radiusLabel },
    },
  })
}

export async function sendPractitionerReengageEmail(options: {
  practitionerAccountId?: string | null
  listingId: string
  toEmail: string
  displayName: string
}) {
  const resend = getResendClient()
  if (!resend) return

  const subject = `Reactivate your Helfi listing`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">We can relist you anytime</h2>
      <p style="margin: 0 0 12px 0;">Your listing for <strong>${options.displayName}</strong> is currently hidden.</p>
      <p style="margin: 0 0 16px 0;">Start the subscription from your practitioner dashboard to make it live again.</p>
      ${getEmailFooter({
        recipientEmail: options.toEmail,
        emailType: 'support',
        reasonText: 'You received this email because your practitioner listing is hidden.'
      })}
    </div>
  `

  dispatchEmail({
    resend,
    label: 'PRACTITIONER REENGAGE',
    message: {
      from: 'Helfi <support@helfi.ai>',
      to: options.toEmail,
      subject,
      html,
    },
    log: {
      practitionerAccountId: options.practitionerAccountId,
      listingId: options.listingId,
      type: 'WEEKLY_REENGAGE',
      toEmail: options.toEmail,
    },
  })
}

export async function sendPractitionerContactSummaryEmail(options: {
  toEmail: string
  displayName: string
  slug: string
  rangeStart: Date
  rangeEnd: Date
  events: { action: string; timestamp: Date }[]
}) {
  const resend = getResendClient()
  if (!resend) return

  const formatDate = (value: Date) =>
    new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(value)

  const actionLabels: Record<string, string> = {
    profile_view: 'Profile viewed',
    call: 'Call clicked',
    website: 'Website clicked',
    email: 'Email clicked',
  }

  const counts = options.events.reduce<Record<string, number>>((acc, event) => {
    acc[event.action] = (acc[event.action] || 0) + 1
    return acc
  }, {})

  const listingUrl = `${getBaseUrl()}/practitioners/${options.slug}`
  const rangeLabel = `${formatDate(options.rangeStart)} → ${formatDate(options.rangeEnd)}`

  const summaryRows = Object.entries(actionLabels)
    .map(([key, label]) => `<li><strong>${label}:</strong> ${counts[key] || 0}</li>`)
    .join('')

  const eventRows = options.events
    .map((event) => `<li>${formatDate(event.timestamp)} — ${actionLabels[event.action] || event.action}</li>`)
    .join('')

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Weekly activity summary</h2>
      <p style="margin: 0 0 12px 0;">Here is the latest activity for <strong>${options.displayName}</strong>.</p>
      <p style="margin: 0 0 16px 0;"><strong>Range:</strong> ${rangeLabel}</p>
      <ul style="margin: 0 0 16px 18px; padding: 0; list-style: disc;">
        ${summaryRows}
      </ul>
      <p style="margin: 0 0 8px 0;"><strong>Activity details:</strong></p>
      <ul style="margin: 0 0 16px 18px; padding: 0; list-style: disc;">
        ${eventRows}
      </ul>
      <a href="${listingUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:600;">View listing</a>
      ${getEmailFooter({
        recipientEmail: options.toEmail,
        emailType: 'support',
        reasonText: 'You received this email because people interacted with your practitioner listing.'
      })}
    </div>
  `

  dispatchEmailNoLog({
    resend,
    label: 'PRACTITIONER CONTACT SUMMARY',
    message: {
      from: 'Helfi <support@helfi.ai>',
      to: options.toEmail,
      subject: 'Weekly listing activity summary',
      html,
    },
  })
}
