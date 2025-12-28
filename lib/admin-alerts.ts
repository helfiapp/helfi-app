import { Resend } from 'resend'
import { getEmailFooter } from '@/lib/email-footer'

const DEFAULT_OWNER_EMAIL = 'louie@helfi.ai'

function getOwnerEmail(): string {
  const configured = (process.env.OWNER_EMAIL || DEFAULT_OWNER_EMAIL).trim()
  return configured || DEFAULT_OWNER_EMAIL
}

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.log('📧 Resend API not configured, skipping admin alert email')
    return null
  }
  return new Resend(process.env.RESEND_API_KEY)
}

export async function sendOwnerSignupEmail(options: { userEmail: string; userName?: string | null }) {
  const resend = getResendClient()
  if (!resend) return

  const recipientEmail = getOwnerEmail()
  const displayName = options.userName || options.userEmail.split('@')[0]
  const subject = `New Helfi signup: ${options.userEmail}`

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">New signup</h2>
      <p style="margin: 0 0 6px 0;"><strong>Email:</strong> ${options.userEmail}</p>
      <p style="margin: 0 0 16px 0;"><strong>Name:</strong> ${displayName}</p>
      <p style="margin: 0 0 16px 0;">This is a new account creation (paid or free).</p>
      ${getEmailFooter({
        recipientEmail,
        emailType: 'admin',
        reasonText: 'You received this email because you requested new signup alerts.'
      })}
    </div>
  `

  const emailResponse = await resend.emails.send({
    from: 'Helfi Alerts <support@helfi.ai>',
    to: recipientEmail,
    subject,
    html,
  })

  console.log(`✅ [SIGNUP ALERT] Sent to ${recipientEmail} with ID: ${emailResponse.data?.id}`)
}

export async function sendVercelSpendAlertEmail(options: {
  recipientEmail?: string
  payload: unknown
}) {
  const resend = getResendClient()
  if (!resend) return

  const recipientEmail = (options.recipientEmail || getOwnerEmail()).trim() || getOwnerEmail()
  const payloadText = options.payload
    ? JSON.stringify(options.payload, null, 2)
    : 'No payload provided.'

  const subject = 'Vercel spend alert received'
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Vercel spend alert</h2>
      <p style="margin: 0 0 16px 0;">A Vercel spend webhook was received.</p>
      <pre style="background:#f3f4f6; padding:12px; border-radius:8px; font-size:12px; white-space:pre-wrap;">${payloadText}</pre>
      ${getEmailFooter({
        recipientEmail,
        emailType: 'admin',
        reasonText: 'You received this email because you enabled Vercel spend alerts.'
      })}
    </div>
  `

  const emailResponse = await resend.emails.send({
    from: 'Helfi Alerts <support@helfi.ai>',
    to: recipientEmail,
    subject,
    html,
  })

  console.log(`✅ [VERCEL SPEND ALERT] Sent to ${recipientEmail} with ID: ${emailResponse.data?.id}`)
}
