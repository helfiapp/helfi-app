/**
 * Reusable email footer component for all Helfi emails
 * This ensures legal compliance with unsubscribe requirements (CAN-SPAM, GDPR, etc.)
 * 
 * IMPORTANT: All emails sent from Helfi MUST include this footer
 */

export interface EmailFooterOptions {
  recipientEmail: string
  emailType?: 'waitlist' | 'welcome' | 'verification' | 'admin' | 'support' | 'marketing' | 'transactional'
  reasonText?: string // Custom reason text (e.g., "You received this email because you joined our waitlist")
}

/**
 * Generates the unsubscribe URL for a given email address
 */
export function getUnsubscribeUrl(email: string): string {
  const encodedEmail = encodeURIComponent(email)
  return `https://helfi.ai/api/unsubscribe?email=${encodedEmail}`
}

/**
 * Generates the standard email footer HTML with unsubscribe link
 * This footer MUST be included in all marketing and transactional emails
 */
export function getEmailFooter(options: EmailFooterOptions): string {
  const { recipientEmail, emailType = 'transactional', reasonText } = options
  
  // Default reason text based on email type
  const defaultReasonText = reasonText || (() => {
    switch (emailType) {
      case 'waitlist':
        return 'You received this email because you joined our waitlist.'
      case 'welcome':
        return 'You received this email because you created a Helfi account.'
      case 'verification':
        return 'You received this email because you signed up for Helfi.'
      case 'marketing':
        return 'You received this email because you are subscribed to Helfi updates.'
      case 'admin':
      case 'support':
        return 'You received this email from the Helfi support team.'
      default:
        return 'You received this email from Helfi.'
    }
  })()

  const unsubscribeUrl = getUnsubscribeUrl(recipientEmail)

  return `
    <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center;">
      <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151;"><strong>Best regards,<br>The Helfi Team</strong></p>
      <p style="margin: 20px 0 0 0; font-size: 14px;">
        <a href="https://helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">🌐 helfi.ai</a> | 
        <a href="mailto:support@helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">📧 support@helfi.ai</a>
      </p>
      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0 0 12px 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
          ${defaultReasonText}
        </p>
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          <a href="${unsubscribeUrl}" style="color: #10b981; text-decoration: underline; font-weight: 500;">Unsubscribe from emails</a> | 
          <a href="https://helfi.ai/privacy" style="color: #10b981; text-decoration: none;">Privacy Policy</a>
        </p>
        <p style="margin: 12px 0 0 0; font-size: 11px; color: #9ca3af;">
          © ${new Date().getFullYear()} Helfi. All rights reserved.
        </p>
      </div>
    </div>
  `
}

