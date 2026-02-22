export const SUPPORT_TICKET_PAGE_URL = 'https://helfi.ai/support'
export const SUPPORT_EMAIL_ADDRESS = 'support@helfi.ai'

export const WELCOME_EMAIL_SUBJECT = 'Welcome to Helfi - We value your feedback'
export const FEEDBACK_REQUEST_EMAIL_SUBJECT = 'Help us improve Helfi - your feedback matters'

function safeDisplayName(name: string): string {
  const trimmed = String(name || '').trim()
  return trimmed.length > 0 ? trimmed : 'there'
}

export function buildWelcomeFeedbackMessage(name: string): string {
  const displayName = safeDisplayName(name)
  return `Hi ${displayName},

Welcome to Helfi, and thank you for joining us.

Helfi is a new platform, and we are constantly improving the app and its features. Your feedback and constructive criticism are genuinely important to us.

If you spot an issue, have a feature idea, or want to suggest a small tweak, please contact us through our support ticket system:
• In the app, click your profile icon in the top-right corner, then choose Help & Support from the dropdown menu
• Or go directly to ${SUPPORT_TICKET_PAGE_URL}
• You can also email ${SUPPORT_EMAIL_ADDRESS}

We read every message and use your feedback to shape what we build next.

Best regards,
The Helfi Team`
}

export function buildExistingMemberFeedbackMessage(name: string): string {
  const displayName = safeDisplayName(name)
  return `Hi ${displayName},

Thank you for being part of Helfi.

Helfi is a new platform, and we are constantly improving the app and its features. Your feedback and constructive criticism are genuinely important to us.

If you spot an issue, have a feature idea, or want to suggest a small tweak, please contact us through our support ticket system:
• In the app, click your profile icon in the top-right corner, then choose Help & Support from the dropdown menu
• Or go directly to ${SUPPORT_TICKET_PAGE_URL}
• You can also email ${SUPPORT_EMAIL_ADDRESS}

We read every message and use your feedback to shape what we build next.

Thank you for helping us build a better Helfi experience.

Best regards,
The Helfi Team`
}

export function buildWelcomeFeedbackTemplateMessage(namePlaceholder = '{name}'): string {
  return buildWelcomeFeedbackMessage(namePlaceholder)
}

export function buildExistingMemberFeedbackTemplateMessage(namePlaceholder = '{name}'): string {
  return buildExistingMemberFeedbackMessage(namePlaceholder)
}

export const FEEDBACK_POPUP_COPY = {
  title: 'Help us improve Helfi',
  body:
    'Helfi is a new platform, and your feedback helps us improve every part of the app. If you notice an issue, have a feature idea, or want to suggest a tweak, please contact us through Help & Support.',
  supportSteps: [
    'Click your profile icon in the top-right corner, then choose Help & Support from the dropdown menu.',
    `Or go to ${SUPPORT_TICKET_PAGE_URL}.`,
    `You can also email ${SUPPORT_EMAIL_ADDRESS}.`,
  ],
  primaryButtonLabel: 'Open Help & Support',
  secondaryButtonLabel: 'Maybe later',
}
