import { Resend } from 'resend'
import { getEmailFooter } from '@/lib/email-footer'
import {
  FEEDBACK_REQUEST_EMAIL_SUBJECT,
  WELCOME_EMAIL_SUBJECT,
  buildExistingMemberFeedbackMessage,
  buildWelcomeFeedbackMessage,
} from '@/lib/feedback-message-copy'

type EmailFooterType = 'welcome' | 'marketing' | 'support' | 'transactional'

interface SendStyledEmailOptions {
  email: string
  subject: string
  message: string
  ctaHref: string
  ctaLabel: string
  emailType: EmailFooterType
  reasonText?: string
}

interface SendWelcomeEmailOptions {
  email: string
  name: string
  ctaHref?: string
  ctaLabel?: string
}

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null
  }
  return new Resend(process.env.RESEND_API_KEY)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderTextAsHtml(message: string): string {
  return message
    .split('\n')
    .map((line) => {
      if (!line.trim()) {
        return '<div style="height: 10px;"></div>'
      }
      return `<p style="margin: 18px 0; line-height: 1.7; font-size: 16px;">${escapeHtml(line)}</p>`
    })
    .join('')
}

async function sendStyledEmail(options: SendStyledEmailOptions): Promise<boolean> {
  const resend = getResendClient()
  if (!resend) {
    console.log('📧 Resend API not configured, skipping email send')
    return false
  }

  try {
    const emailResponse = await resend.emails.send({
      from: 'Helfi Team <support@helfi.ai>',
      to: options.email,
      subject: options.subject,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">Helfi</h1>
            <p style="margin: 12px 0 0 0; opacity: 0.95; font-size: 16px;">Your AI-Powered Health Coach</p>
          </div>
          
          <div style="padding: 40px 30px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            ${renderTextAsHtml(options.message)}
            
            <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb; text-align: center;">
              <a href="${escapeHtml(options.ctaHref)}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 10px 0; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);">${escapeHtml(options.ctaLabel)}</a>
            </div>
            
            ${getEmailFooter({
              recipientEmail: options.email,
              emailType: options.emailType,
              reasonText: options.reasonText,
            })}
          </div>
        </div>
      `,
    })

    if (emailResponse.error) {
      console.error(`❌ [EMAIL] Provider rejected ${options.email}:`, emailResponse.error)
      return false
    }

    console.log(`✅ [EMAIL] Sent to ${options.email} with ID: ${emailResponse.data?.id}`)
    return true
  } catch (error) {
    console.error(`❌ [EMAIL] Failed to send to ${options.email}:`, error)
    return false
  }
}

export async function sendWelcomeEmail(options: SendWelcomeEmailOptions): Promise<boolean> {
  const message = buildWelcomeFeedbackMessage(options.name)
  return sendStyledEmail({
    email: options.email,
    subject: WELCOME_EMAIL_SUBJECT,
    message,
    ctaHref: options.ctaHref || 'https://helfi.ai/dashboard',
    ctaLabel: options.ctaLabel || 'Open Helfi Dashboard',
    emailType: 'welcome',
  })
}

export async function sendExistingMemberFeedbackEmail(email: string, name: string): Promise<boolean> {
  const message = buildExistingMemberFeedbackMessage(name)
  return sendStyledEmail({
    email,
    subject: FEEDBACK_REQUEST_EMAIL_SUBJECT,
    message,
    ctaHref: 'https://helfi.ai/support',
    ctaLabel: 'Open Help & Support',
    emailType: 'marketing',
    reasonText: 'You received this email because you have a Helfi account.',
  })
}
