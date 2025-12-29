import OpenAI from 'openai'
import crypto from 'crypto'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { TicketCategory, TicketPriority } from '@prisma/client'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'
import { getEmailFooter } from '@/lib/email-footer'

const SUPPORT_AI_MODEL = process.env.SUPPORT_AI_MODEL || 'gpt-4o-mini'
const SUPPORT_COPY_EMAIL = 'support@helfi.ai'
const SUPPORT_VERIFICATION_TTL_MINUTES = 15
const SUPPORT_AGENT_NAME = 'Maya'
const SUPPORT_AGENT_ROLE = 'Helfi Support'
const SYSTEM_IDENTITY_MARKER = '[SYSTEM] Identity verified'
const SYSTEM_TRANSCRIPT_MARKER = '[SYSTEM] Transcript emailed'
const ATTACHMENTS_MARKER = '[[ATTACHMENTS]]'

type SupportAiResult = {
  customerReply: string
  shouldEscalate: boolean
  escalationReason?: string
  needsIdentityCheck?: boolean
  needsMoreInfo?: boolean
  requestedInfo?: string[]
  internalNotes?: string
  suggestedCategory?: string
  suggestedPriority?: string
}

type SupportAutomationInput = {
  ticketId: string
  latestUserMessage?: string | null
  source?: 'app_ticket' | 'app_reply' | 'email_ticket' | 'email_reply' | 'web_ticket' | 'web_chat' | 'admin_reply'
}

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type SupportAttachment = {
  name: string
  url: string
  type?: string
  size?: number
}

function splitAttachmentsFromMessage(message: string): { text: string; attachments: SupportAttachment[] } {
  const markerIndex = message.indexOf(ATTACHMENTS_MARKER)
  if (markerIndex === -1) {
    return { text: message, attachments: [] }
  }

  const text = message.slice(0, markerIndex).trim()
  const raw = message.slice(markerIndex + ATTACHMENTS_MARKER.length).trim()
  if (!raw) {
    return { text, attachments: [] }
  }

  try {
    const parsed = JSON.parse(raw)
    const attachments = Array.isArray(parsed)
      ? parsed.map((item) => ({
          name: String(item?.name || ''),
          url: String(item?.url || ''),
          type: item?.type ? String(item.type) : undefined,
          size: typeof item?.size === 'number' ? item.size : undefined,
        })).filter((item) => item.name && item.url)
      : []
    return { text, attachments }
  } catch {
    return { text: message, attachments: [] }
  }
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractVerificationCode(message: string): string | null {
  const match = message.match(/\b(\d{6})\b/)
  return match ? match[1] : null
}

function verificationIdentifier(ticketId: string, userEmail: string): string {
  return `support:${ticketId}:${userEmail.toLowerCase()}`
}

function verificationTokenHash(ticketId: string, code: string): string {
  return crypto.createHash('sha256').update(`${ticketId}:${code}`).digest('hex')
}

function isIdentityVerified(responses: Array<{ message: string; isAdminResponse: boolean }>): boolean {
  return responses.some((r) => r.isAdminResponse && r.message?.startsWith(SYSTEM_IDENTITY_MARKER))
}

function buildSupportSystemPrompt(): string {
  return [
    `You are ${SUPPORT_AGENT_NAME}, a careful and friendly support agent for ${SUPPORT_AGENT_ROLE}.`,
    'Your goal is to troubleshoot app issues, ask for missing details, and keep the user safe.',
    '',
    'Rules:',
    '- Use plain English. Keep replies short, warm, and helpful.',
    '- Start with a brief greeting only if this is your first reply in the conversation; otherwise, skip the greeting and continue naturally.',
    '- Focus on app troubleshooting, not medical advice.',
    '- Do not claim hardware or device integrations that are not currently supported.',
    '- Never ask for passwords, payment card numbers, or full security answers.',
    '- Do not claim you made account changes. Only provide guidance and request verification when needed.',
    '- If the issue involves account access, billing, subscription changes, email change, password change, or deleting data, you MUST require identity verification.',
    '- If verification is pending, ask the user to reply with the 6-digit code we emailed them.',
    '- For troubleshooting, ask for steps to reproduce, device type, OS version, browser/app version, and screenshots when relevant.',
    '- If a bug is likely, tell the user we are investigating and provide clear internal notes for the team.',
    '- Use the product facts below when answering questions about trials, pricing, credits, or features.',
    '- If you are not sure about a detail, say you will confirm and loop in the team.',
    `- Sign off with "${SUPPORT_AGENT_NAME} from ${SUPPORT_AGENT_ROLE}".`,
    '',
    supportProductFacts(),
    '',
    'Output strict JSON only with these fields:',
    '{ "customerReply": string, "shouldEscalate": boolean, "escalationReason": string, "needsIdentityCheck": boolean, "needsMoreInfo": boolean, "requestedInfo": string[], "internalNotes": string, "suggestedCategory": string, "suggestedPriority": string }',
    'Do not include markdown or code fences.',
    '',
    'The internalNotes field is for the team only and may mention likely code areas.',
    'Never mention internalNotes or code paths in the customerReply.',
  ].join('\n')
}

function supportCodeMap(): string {
  return [
    'CODE MAP (for internal notes only):',
    '- Auth / login: app/api/auth/*, app/auth/*, lib/auth.ts',
    '- Support tickets: app/support/page.tsx, app/api/admin/tickets/route.ts, app/api/tickets/webhook/route.ts, prisma/schema.prisma (SupportTicket)',
    '- Billing / subscriptions: app/api/billing/*, app/billing/*, stripe docs',
    '- AI chats: app/api/chat/voice/route.ts, lib/metered-openai.ts, lib/ai-usage-logger.ts',
    '- Food logging: app/food/*, app/api/food-*',
    '- Medical images: app/medical-images/*, app/api/medical-images/*',
    '- Symptoms: app/symptoms/*, app/api/analyze-symptoms/*',
    '- Insights: app/insights/*, lib/insights/*',
    '- Push notifications: app/api/push/*, lib/push/*',
  ].join('\n')
}

function supportProductFacts(): string {
  return [
    'PRODUCT FACTS:',
    '- No free trial. New users get multiple free uses of AI features before needing credits or a subscription.',
    '- Free AI uses on signup: 5 food photo analyses, 2 symptom analyses, 2 medical image analyses, 2 supplement/medication interaction analyses.',
    '- Extra free uses on signup: 1 full health intake analysis, 3 insights updates.',
    '- Free chats on signup: 2 symptom follow-up chats, 2 medical image follow-up chats, 2 insights chats, 2 voice chats.',
    '- Free re-analyses on signup: 2 food re-analyses, 2 interaction re-analyses.',
    '- Non-AI features remain free for all users.',
    '- Premium plan: $20/month includes 30 daily AI food analyses, 30 reanalysis credits per day, 30 medical image analyses per day, advanced insights, priority support, and export capabilities.',
    '- Credit packs: $5 for 100 credits or $10 for 150 credits. Credits do not expire and can be used for any analysis.',
    '- Helfi is a web app that works in the browser on mobile and desktop; no download is required.',
    '- Device integrations available now: Fitbit and Garmin Connect.',
    '- Apple Watch, Apple Health, Samsung Health, Oura Ring, and Google Fit are not supported yet. These are planned for future iOS/Android apps.',
  ].join('\n')
}

function buildSupportUserPrompt(input: {
  ticket: any
  latestMessage: string
  latestAttachments: SupportAttachment[]
  identityVerified: boolean
  verificationPending: boolean
  verificationJustCompleted: boolean
  hasPriorSupportReply: boolean
  conversation: string
}): string {
  const ticket = input.ticket
  return [
    `Ticket ID: ${ticket.id}`,
    `Subject: ${ticket.subject || 'Support request'}`,
    `Category: ${ticket.category}`,
    `Priority: ${ticket.priority}`,
    `Status: ${ticket.status}`,
    `User Email: ${ticket.userEmail}`,
    `User Name: ${ticket.userName || 'Not provided'}`,
    '',
    `Identity verified: ${input.identityVerified ? 'yes' : 'no'}`,
    `Verification pending: ${input.verificationPending ? 'yes' : 'no'}`,
    `Verification just completed: ${input.verificationJustCompleted ? 'yes' : 'no'}`,
    `Has prior support reply: ${input.hasPriorSupportReply ? 'yes' : 'no'}`,
    '',
    'Latest user message:',
    input.latestMessage || '(no new message)',
    input.latestAttachments.length > 0 ? `Attachments: ${input.latestAttachments.map((a) => `${a.name} (${a.type || 'file'})`).join(', ')}` : '',
    '',
    'Conversation history:',
    input.conversation || '(none)',
    '',
    supportProductFacts(),
    '',
    supportCodeMap(),
  ].join('\n')
}

function safeParseSupportJson(text: string): SupportAiResult | null {
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed.customerReply !== 'string') return null
    return {
      customerReply: String(parsed.customerReply || '').trim(),
      shouldEscalate: Boolean(parsed.shouldEscalate),
      escalationReason: parsed.escalationReason ? String(parsed.escalationReason) : '',
      needsIdentityCheck: Boolean(parsed.needsIdentityCheck),
      needsMoreInfo: Boolean(parsed.needsMoreInfo),
      requestedInfo: Array.isArray(parsed.requestedInfo) ? parsed.requestedInfo.map(String) : [],
      internalNotes: parsed.internalNotes ? String(parsed.internalNotes) : '',
      suggestedCategory: parsed.suggestedCategory ? String(parsed.suggestedCategory) : '',
      suggestedPriority: parsed.suggestedPriority ? String(parsed.suggestedPriority) : '',
    }
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1))
        if (!parsed || typeof parsed.customerReply !== 'string') return null
        return {
          customerReply: String(parsed.customerReply || '').trim(),
          shouldEscalate: Boolean(parsed.shouldEscalate),
          escalationReason: parsed.escalationReason ? String(parsed.escalationReason) : '',
          needsIdentityCheck: Boolean(parsed.needsIdentityCheck),
          needsMoreInfo: Boolean(parsed.needsMoreInfo),
          requestedInfo: Array.isArray(parsed.requestedInfo) ? parsed.requestedInfo.map(String) : [],
          internalNotes: parsed.internalNotes ? String(parsed.internalNotes) : '',
          suggestedCategory: parsed.suggestedCategory ? String(parsed.suggestedCategory) : '',
          suggestedPriority: parsed.suggestedPriority ? String(parsed.suggestedPriority) : '',
        }
      } catch {
        return null
      }
    }
    return null
  }
}

function buildConversationHistory(ticket: any): string {
  const lines: string[] = []
  if (ticket.message) {
    const parsed = splitAttachmentsFromMessage(String(ticket.message))
    const base = stripHtml(parsed.text)
    lines.push(`Customer: ${base}`)
    if (parsed.attachments.length > 0) {
      lines.push(`Attachments: ${parsed.attachments.map((a) => `${a.name} (${a.type || 'file'})`).join(', ')}`)
    }
  }
  const responses = Array.isArray(ticket.responses) ? ticket.responses : []
  for (const response of responses) {
    const parsed = splitAttachmentsFromMessage(String(response.message || ''))
    const text = stripHtml(parsed.text)
    if (!text) continue
    if (text.startsWith('[SYSTEM]')) continue
    lines.push(`${response.isAdminResponse ? 'Support' : 'Customer'}: ${text}`)
    if (parsed.attachments.length > 0) {
      lines.push(`Attachments: ${parsed.attachments.map((a) => `${a.name} (${a.type || 'file'})`).join(', ')}`)
    }
  }
  return lines.slice(-12).join('\n')
}

async function hasPendingVerification(ticketId: string, userEmail: string): Promise<boolean> {
  const identifier = verificationIdentifier(ticketId, userEmail)
  const pending = await prisma.verificationToken.findFirst({
    where: {
      identifier,
      expires: { gt: new Date() },
    },
  })
  return Boolean(pending)
}

async function consumeVerificationCode(ticketId: string, userEmail: string, code: string): Promise<boolean> {
  const identifier = verificationIdentifier(ticketId, userEmail)
  const tokenHash = verificationTokenHash(ticketId, code)
  const token = await prisma.verificationToken.findFirst({
    where: {
      identifier,
      token: tokenHash,
      expires: { gt: new Date() },
    },
  })
  if (!token) return false

  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier, token: tokenHash } },
  })

  await prisma.ticketResponse.create({
    data: {
      ticketId,
      message: `${SYSTEM_IDENTITY_MARKER} (${new Date().toISOString()})`,
      isAdminResponse: true,
      adminId: null,
    },
  })

  return true
}

async function ensureVerificationCode(ticketId: string, userEmail: string): Promise<boolean> {
  const identifier = verificationIdentifier(ticketId, userEmail)
  const existing = await prisma.verificationToken.findFirst({
    where: {
      identifier,
      expires: { gt: new Date() },
    },
  })
  if (existing) return true

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const tokenHash = verificationTokenHash(ticketId, code)
  const expires = new Date(Date.now() + SUPPORT_VERIFICATION_TTL_MINUTES * 60 * 1000)

  await prisma.verificationToken.deleteMany({ where: { identifier } })
  await prisma.verificationToken.create({
    data: { identifier, token: tokenHash, expires },
  })

  const resend = getResendClient()
  if (!resend) return false

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">Helfi</h1>
        <p style="margin: 12px 0 0 0; opacity: 0.95; font-size: 16px;">Support Verification</p>
      </div>
      <div style="padding: 40px 30px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <p style="margin: 0 0 20px 0; line-height: 1.7; font-size: 16px; color: #4b5563;">
          Please confirm it is really you. Use this 6-digit code to continue your support request:
        </p>
        <div style="background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 10px; padding: 16px; text-align: center; margin: 24px 0;">
          <span style="font-size: 28px; letter-spacing: 4px; font-weight: 700; color: #0c4a6e;">${code}</span>
        </div>
        <p style="margin: 0; font-size: 14px; color: #6b7280;">
          This code expires in ${SUPPORT_VERIFICATION_TTL_MINUTES} minutes.
        </p>
        ${getEmailFooter({ recipientEmail: userEmail, emailType: 'support', reasonText: 'This verification keeps your account safe.' })}
      </div>
    </div>
  `

  await resend.emails.send({
    from: 'Helfi Support <support@helfi.ai>',
    to: userEmail,
    subject: 'Your Helfi support verification code',
    html,
  })

  return true
}

function buildSupportResponseHtml(options: {
  subject: string
  message: string
  internalNotes?: string
  isCopy?: boolean
  ticketId?: string
  latestUserMessage?: string
}): string {
  const safeMessage = escapeHtml(options.message)
  const internalNotes = options.internalNotes ? escapeHtml(options.internalNotes) : ''
  const latestUserMessage = options.latestUserMessage ? escapeHtml(options.latestUserMessage) : ''
  const latestUserBlock = options.isCopy && latestUserMessage
    ? `
      <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0; color: #374151; font-weight: 600; font-size: 14px;">Latest Customer Message</p>
        <div style="white-space: pre-wrap; color: #4b5563; font-size: 14px;">${latestUserMessage}</div>
      </div>
    `
    : ''
  const internalBlock = options.isCopy && internalNotes
    ? `
      <div style="background: #fff7ed; border: 1px solid #fdba74; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0; color: #9a3412; font-weight: 600; font-size: 14px;">Internal Notes (AI)</p>
        <div style="white-space: pre-wrap; color: #7c2d12; font-size: 14px;">${internalNotes}</div>
      </div>
    `
    : ''

  const ticketMeta = options.isCopy && options.ticketId
    ? `<p style="margin: 0 0 12px 0; font-size: 13px; color: #6b7280;">Ticket ID: ${options.ticketId}</p>`
    : ''

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">Helfi</h1>
        <p style="margin: 12px 0 0 0; opacity: 0.95; font-size: 16px;">Support Team Response</p>
      </div>
      <div style="padding: 40px 30px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <h2 style="margin: 0 0 20px 0; color: #374151; font-size: 24px;">Response to your support request</h2>
        <div style="background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; color: #0c4a6e; font-size: 14px;">
            <strong>Regarding:</strong> ${escapeHtml(options.subject)}
          </p>
        </div>
        ${ticketMeta}
        ${latestUserBlock}
        <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 30px 0;">
          <h3 style="margin: 0 0 15px 0; color: #374151;">Our Response:</h3>
          <div style="line-height: 1.7; font-size: 16px; color: #4b5563; white-space: pre-wrap;">${safeMessage}</div>
        </div>
        ${internalBlock}
        <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 30px 0;">
          <p style="margin: 0; color: #065f46; font-size: 14px;">
            <strong>Need more help?</strong> Reply to this email and we will continue the conversation.
          </p>
        </div>
        <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center;">
          <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151;"><strong>Best regards,<br>Helfi Support Team</strong></p>
          <p style="margin: 20px 0 0 0; font-size: 14px;">
            <a href="https://helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">helfi.ai</a> |
            <a href="mailto:support@helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">support@helfi.ai</a>
          </p>
        </div>
      </div>
    </div>
  `
}

async function sendSupportResponseEmail(options: {
  ticket: any
  message: string
  internalNotes?: string
  latestUserMessage?: string
  sendUserEmail?: boolean
  sendSupportCopy?: boolean
}) {
  const resend = getResendClient()
  if (!resend) return

  const subject = options.ticket.subject || 'Support request'
  const userEmail = options.ticket.userEmail
  const copyEmail = SUPPORT_COPY_EMAIL
  const sendUserEmail = options.sendUserEmail ?? true
  const sendSupportCopy = options.sendSupportCopy ?? false

  if (sendUserEmail) {
    await resend.emails.send({
      from: 'Helfi Support <support@helfi.ai>',
      to: userEmail,
      subject: `Re: ${subject}`,
      html: buildSupportResponseHtml({ subject, message: options.message }),
    })
  }

  if (sendSupportCopy && copyEmail && userEmail.toLowerCase() !== copyEmail.toLowerCase()) {
    await resend.emails.send({
      from: 'Helfi Support <support@helfi.ai>',
      to: copyEmail,
      subject: `Copy: Re: ${subject}`,
      html: buildSupportResponseHtml({
        subject,
        message: options.message,
        internalNotes: options.internalNotes || '',
        isCopy: true,
        ticketId: options.ticket.id,
        latestUserMessage: options.latestUserMessage || '',
      }),
    })
  }
}

async function sendEscalationNotice(options: {
  ticket: any
  internalNotes?: string
  reason?: string
}) {
  const resend = getResendClient()
  if (!resend) return

  const subject = `Escalation needed: ${options.ticket.subject || 'Support request'}`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Support escalation needed</h2>
      <p style="margin: 0 0 6px 0;"><strong>Ticket ID:</strong> ${options.ticket.id}</p>
      <p style="margin: 0 0 6px 0;"><strong>User:</strong> ${options.ticket.userEmail}</p>
      <p style="margin: 0 0 12px 0;"><strong>Subject:</strong> ${escapeHtml(options.ticket.subject || 'Support request')}</p>
      ${options.reason ? `<p style="margin: 0 0 12px 0;"><strong>Reason:</strong> ${escapeHtml(options.reason)}</p>` : ''}
      ${options.internalNotes ? `<pre style="background:#f3f4f6; padding:12px; border-radius:8px; font-size:12px; white-space:pre-wrap;">${escapeHtml(options.internalNotes)}</pre>` : ''}
      ${getEmailFooter({
        recipientEmail: SUPPORT_COPY_EMAIL,
        emailType: 'admin',
        reasonText: 'This is an automated escalation alert from the Helfi support system.',
      })}
    </div>
  `

  await resend.emails.send({
    from: 'Helfi Alerts <support@helfi.ai>',
    to: SUPPORT_COPY_EMAIL,
    subject,
    html,
  })
}

type TranscriptEntry = {
  author: string
  message: string
  attachments: SupportAttachment[]
}

function buildTranscriptEntries(ticket: any): TranscriptEntry[] {
  const entries: TranscriptEntry[] = []
  if (ticket.message) {
    const parsed = splitAttachmentsFromMessage(String(ticket.message))
    entries.push({
      author: `Customer (${ticket.userEmail})`,
      message: parsed.text,
      attachments: parsed.attachments,
    })
  }

  const responses = Array.isArray(ticket.responses) ? ticket.responses : []
  responses.forEach((response: any) => {
    const parsed = splitAttachmentsFromMessage(String(response.message || ''))
    if (!parsed.text) return
    if (parsed.text.startsWith('[SYSTEM]')) return
    const author = response.isAdminResponse ? `${SUPPORT_AGENT_NAME} (AI)` : 'Customer'
    entries.push({
      author,
      message: parsed.text,
      attachments: parsed.attachments,
    })
  })

  return entries
}

function buildTranscriptHtml(options: { ticket: any; transcript: string }): string {
  const subject = escapeHtml(options.ticket.subject || 'Support request')
  const entries = buildTranscriptEntries(options.ticket)
  const transcriptHtml = entries
    .map((entry) => {
      const safeMessage = escapeHtml(entry.message).replace(/\n/g, '<br />')
      const attachmentsHtml = entry.attachments.length
        ? `
          <div style="margin-top: 6px; font-size: 12px; color: #6b7280;">
            ${entry.attachments
              .map((att) => {
                const name = escapeHtml(att.name)
                const type = escapeHtml(att.type || 'file')
                const url = escapeHtml(att.url)
                return `<div>Attachment: <a href="${url}" target="_blank" rel="noreferrer">${name}</a> (${type})</div>`
              })
              .join('')}
          </div>
        `
        : ''
      return `
        <div style="margin: 0 0 16px 0;">
          <div style="font-size: 13px; color: #111827; margin-bottom: 4px;">
            <strong>${escapeHtml(entry.author)}</strong>
          </div>
          <div style="font-size: 13px; color: #374151;">${safeMessage}</div>
          ${attachmentsHtml}
        </div>
      `
    })
    .join('')
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Support chat transcript</h2>
      <p style="margin: 0 0 6px 0;"><strong>Ticket ID:</strong> ${options.ticket.id}</p>
      <p style="margin: 0 0 6px 0;"><strong>User:</strong> ${options.ticket.userEmail}</p>
      <p style="margin: 0 0 16px 0;"><strong>Subject:</strong> ${subject}</p>
      <div style="background:#f3f4f6; padding:12px; border-radius:8px;">
        ${transcriptHtml || '<div style="font-size: 13px; color: #6b7280;">No messages recorded.</div>'}
      </div>
      ${getEmailFooter({
        recipientEmail: SUPPORT_COPY_EMAIL,
        emailType: 'admin',
        reasonText: 'Transcript sent after the support chat ended.',
      })}
    </div>
  `
}

export async function sendSupportTranscriptEmail(ticketId: string) {
  const resend = getResendClient()
  if (!resend) return

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { responses: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket) return
  const alreadySent = ticket.responses?.some((response) => response.isAdminResponse && response.message?.startsWith(SYSTEM_TRANSCRIPT_MARKER))
  if (alreadySent) return

  const transcript = ''
  await resend.emails.send({
    from: 'Helfi Support <support@helfi.ai>',
    to: SUPPORT_COPY_EMAIL,
    subject: `Support transcript: ${ticket.subject || 'Support request'}`,
    html: buildTranscriptHtml({ ticket, transcript }),
  })

  await prisma.ticketResponse.create({
    data: {
      ticketId,
      message: `${SYSTEM_TRANSCRIPT_MARKER} (${new Date().toISOString()})`,
      isAdminResponse: true,
      adminId: null,
    },
  })
}

export function buildSupportFeedbackPrompt(userName?: string | null) {
  const name = userName?.trim() ? userName.trim().split(' ')[0] : 'there'
  return [
    `Thanks ${name} — I’m glad we could help.`,
    'If you have a moment, could you rate your support experience and leave a quick comment? It helps us improve.',
    `\n${SUPPORT_AGENT_NAME} from ${SUPPORT_AGENT_ROLE}`,
  ].join('\n')
}

export async function sendSupportFeedbackEmail(options: {
  ticketId: string
  rating: number
  comment?: string
}) {
  const resend = getResendClient()
  if (!resend) return

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: options.ticketId },
  })
  if (!ticket) return

  const comment = options.comment?.trim() ? escapeHtml(options.comment.trim()) : 'No comment provided.'
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Support feedback received</h2>
      <p style="margin: 0 0 6px 0;"><strong>Ticket ID:</strong> ${ticket.id}</p>
      <p style="margin: 0 0 6px 0;"><strong>User:</strong> ${ticket.userEmail}</p>
      <p style="margin: 0 0 6px 0;"><strong>Rating:</strong> ${options.rating}/5</p>
      <p style="margin: 12px 0 0 0;"><strong>Comment:</strong></p>
      <p style="margin: 6px 0 0 0;">${comment}</p>
      ${getEmailFooter({
        recipientEmail: SUPPORT_COPY_EMAIL,
        emailType: 'admin',
        reasonText: 'Support feedback submitted after a chat ended.',
      })}
    </div>
  `

  await resend.emails.send({
    from: 'Helfi Support <support@helfi.ai>',
    to: SUPPORT_COPY_EMAIL,
    subject: `Support feedback: ${ticket.subject || 'Support request'}`,
    html,
  })
}

function fallbackSupportReply(): SupportAiResult {
  return {
    customerReply: 'Thanks for reaching out. I am unable to access the support assistant right now. I have flagged your request for a human review and will follow up as soon as possible.',
    shouldEscalate: true,
    escalationReason: 'AI unavailable',
    needsIdentityCheck: false,
    needsMoreInfo: true,
    requestedInfo: [],
    internalNotes: 'OpenAI client unavailable or response parse failed.',
    suggestedCategory: '',
    suggestedPriority: '',
  }
}

export async function processSupportTicketAutoReply(input: SupportAutomationInput) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    include: {
      responses: { orderBy: { createdAt: 'asc' } },
      user: { select: { id: true, email: true, name: true } },
    },
  })

  if (!ticket) return
  if (!ticket.userEmail) return

  const rawLatest = String(input.latestUserMessage || ticket.message || '').trim()
  const parsedLatest = splitAttachmentsFromMessage(rawLatest)
  let latestMessage = stripHtml(parsedLatest.text)
  const rawLatestMessage = latestMessage

  let identityVerified = isIdentityVerified(ticket.responses || []) || Boolean(ticket.userId)
  let verificationPending = await hasPendingVerification(ticket.id, ticket.userEmail)
  let verificationJustCompleted = false

  const code = latestMessage ? extractVerificationCode(latestMessage) : null
  if (code) {
    const verified = await consumeVerificationCode(ticket.id, ticket.userEmail, code)
    if (verified) {
      identityVerified = true
      verificationJustCompleted = true
      verificationPending = false
      latestMessage = latestMessage.replace(code, '').trim()
      if (!latestMessage) {
        latestMessage = 'User provided the verification code.'
      }
    }
  }

  const conversation = buildConversationHistory(ticket)
  const hasPriorSupportReply = (ticket.responses || []).some((response: any) => {
    const message = String(response.message || '')
    return response.isAdminResponse && !message.startsWith('[SYSTEM]') && !message.startsWith('[FEEDBACK]')
  })
  const openai = getOpenAIClient()
  let aiResult: SupportAiResult

  if (!openai) {
    aiResult = fallbackSupportReply()
  } else {
    const systemPrompt = buildSupportSystemPrompt()
    const userPrompt = buildSupportUserPrompt({
      ticket,
      latestMessage,
      latestAttachments: parsedLatest.attachments,
      identityVerified,
      verificationPending,
      verificationJustCompleted,
      hasPriorSupportReply,
      conversation,
    })

    const completion = await runChatCompletionWithLogging(
      openai,
      {
        model: SUPPORT_AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 500,
      },
      {
        feature: 'support:ai',
        userId: ticket.userId || ticket.user?.id || null,
        userLabel: ticket.userEmail,
      },
      {
        callDetail: input.source ? `source:${input.source}` : undefined,
      }
    )

    const rawText = completion?.choices?.[0]?.message?.content || ''
    aiResult = safeParseSupportJson(rawText) || fallbackSupportReply()
  }

  if (aiResult.needsIdentityCheck && !identityVerified) {
    const sent = await ensureVerificationCode(ticket.id, ticket.userEmail)
    const needsCodeReminder = !aiResult.customerReply.toLowerCase().includes('code')
    if (sent && needsCodeReminder) {
      aiResult.customerReply = `${aiResult.customerReply}\n\nFor security, we sent a 6-digit verification code to your email. Please reply with that code to continue.`
    }
    if (!sent) {
      aiResult.customerReply = `${aiResult.customerReply}\n\nFor security, please log in to your Helfi account and continue this request from the in-app support chat so we can verify you.`
    }
  }

  if (!aiResult.customerReply) {
    aiResult = fallbackSupportReply()
  }

  if (aiResult.suggestedCategory && aiResult.suggestedCategory !== ticket.category) {
    const allowedCategories: TicketCategory[] = ['GENERAL', 'TECHNICAL', 'BILLING', 'ACCOUNT', 'FEATURE_REQUEST', 'BUG_REPORT', 'EMAIL']
    if (allowedCategories.includes(aiResult.suggestedCategory as TicketCategory)) {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { category: aiResult.suggestedCategory as TicketCategory },
      })
    }
  }

  if (aiResult.suggestedPriority && aiResult.suggestedPriority !== ticket.priority) {
    const allowedPriorities: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
    if (allowedPriorities.includes(aiResult.suggestedPriority as TicketPriority)) {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { priority: aiResult.suggestedPriority as TicketPriority },
      })
    }
  }

  await prisma.ticketResponse.create({
    data: {
      ticketId: ticket.id,
      message: aiResult.customerReply,
      isAdminResponse: true,
      adminId: null,
    },
  })

  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: aiResult.shouldEscalate ? 'IN_PROGRESS' : 'RESPONDED',
      updatedAt: new Date(),
    },
  })

  const isEmailChannel =
    input.source === 'email_reply' ||
    input.source === 'email_ticket' ||
    input.source === 'web_ticket'
  if (isEmailChannel) {
    await sendSupportResponseEmail({
      ticket,
      message: aiResult.customerReply,
      internalNotes: aiResult.internalNotes || '',
      latestUserMessage: rawLatestMessage,
      sendUserEmail: true,
      sendSupportCopy: false,
    })
  }

  if (aiResult.shouldEscalate) {
    await sendEscalationNotice({
      ticket,
      internalNotes: aiResult.internalNotes || '',
      reason: aiResult.escalationReason || 'Needs human review',
    })
  }

  console.log('✅ [SUPPORT AI] Auto-reply sent', {
    ticketId: ticket.id,
    source: input.source || 'unknown',
    identityVerified,
    verificationPending,
    latestMessage: rawLatestMessage.slice(0, 120),
  })
}
