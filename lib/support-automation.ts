import OpenAI from 'openai'
import crypto from 'crypto'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { TicketCategory, TicketPriority } from '@prisma/client'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'
import { getEmailFooter } from '@/lib/email-footer'
import { buildSupportCodeContext } from '@/lib/support-code-search'
import { getSupportAgentForTimestamp } from '@/lib/support-agents'
import supportKnowledgeBase from '@/data/support-kb.json'

const SUPPORT_AI_MODEL = process.env.SUPPORT_AI_MODEL || 'gpt-4o-mini'
const SUPPORT_COPY_EMAIL = 'support@helfi.ai'
const SUPPORT_VERIFICATION_TTL_MINUTES = 15
const SYSTEM_IDENTITY_MARKER = '[SYSTEM] Identity verified'
const SYSTEM_TRANSCRIPT_MARKER = '[SYSTEM] Transcript emailed'
const SYSTEM_INTERNAL_NOTES_MARKER = '[SYSTEM] Internal notes'
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

type SupportTopic = {
  id?: string
  title?: string
  summary?: string
  links?: Record<string, string | undefined>
}

type SupportKnowledgeBase = {
  version?: string
  rules?: string[]
  topics?: SupportTopic[]
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

function buildSupportSystemPrompt(agentName: string, agentRole: string): string {
  return [
    `You are ${agentName}, a careful and friendly support agent for ${agentRole}.`,
    'Your goal is to troubleshoot app issues, confirm expected behavior from the app, ask only for missing details, and keep the user safe.',
    '',
    'Rules:',
    '- Use plain English. Keep replies short, warm, and helpful.',
    '- Do not use markdown. Use simple sentences and plain "-" bullets.',
    '- Start with a brief greeting only if this is your first reply in the conversation; otherwise, skip the greeting and continue naturally.',
    '- Focus on app troubleshooting, not medical advice.',
    '- Do not claim hardware or device integrations that are not currently supported.',
    '- If asked about Apple devices or Apple Watch, explain they are not supported in the web app and are planned for the future native apps.',
    '- Do not show code snippets or internal file paths in the customer reply.',
    '- Use the Support Knowledge Base for verified links and steps. Always provide the most direct link when relevant.',
    '- If the user mentions the affiliate program or referrals, always explain: sign up first, apply, approval required, then portal access.',
    '- Never ask for passwords, payment card numbers, or full security answers.',
    '- Do not claim you made account changes. Only provide guidance and request verification when needed.',
    '- If the issue involves account access, billing, subscription changes, email change, password change, or deleting data, you MUST require identity verification.',
    '- If verification is pending, ask the user to reply with the 6-digit code we emailed them.',
    '- For troubleshooting, ask for at most two missing details. Prefer which page/chat and whether it happens on mobile or desktop.',
    '- Only ask for OS/browser versions or screenshots if the issue cannot be investigated without them.',
    '- If the user is frustrated or says they already answered, do not repeat questions. Move forward with investigation and explain what you will check.',
    '- Never say you cannot check the latest app build. Say you are checking it now and will confirm with the team.',
    '- If a bug is likely, tell the user we are investigating and provide clear internal notes for the team.',
    '- If the user already provided steps or a link they clicked, do not ask for the same info again. Move to the next helpful step.',
    '- Use the product facts below when answering questions about trials, pricing, credits, or features.',
    '- If you are not sure about a detail, say you will confirm and loop in the team.',
    `- Sign off with "${agentName} from ${agentRole}".`,
    '',
    supportProductFacts(),
    '',
    supportKnowledgeBaseFacts(),
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
    '- Chat UI: components/VoiceChat.tsx, app/symptoms/SymptomChat.tsx, app/medical-images/MedicalImageChat.tsx, app/insights/issues/[issueSlug]/SectionChat.tsx',
    '- Affiliate program: app/affiliate/*, app/api/affiliate/*, lib/affiliate-*',
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
    '- Device integrations: Fitbit is available now. Garmin Connect is in evaluation and may be temporarily unavailable until production approval is granted.',
    '- Sleep tracking is available only through connected devices (Fitbit; Garmin evaluation). There is no built-in sleep monitoring without a device connection.',
    '- Apple Watch, Apple Health, Samsung Health, Oura Ring, and Google Fit are not supported yet. These are planned for future iOS/Android apps.',
  ].join('\n')
}

function getSupportKnowledgeBase(): SupportKnowledgeBase {
  return supportKnowledgeBase as unknown as SupportKnowledgeBase
}

function findSupportTopic(id: string): SupportTopic | undefined {
  const kb = getSupportKnowledgeBase()
  return kb.topics?.find((topic) => topic.id === id)
}

function addAgentSignOff(message: string, agent?: { name: string; role: string }) {
  if (!agent) return message.trim()
  const signOff = `${agent.name} from ${agent.role}`
  if (message.includes(signOff)) return message.trim()
  return `${message.trim()}\n\n${signOff}`
}

function supportKnowledgeBaseFacts(): string {
  const kb = getSupportKnowledgeBase()
  const lines: string[] = ['SUPPORT KNOWLEDGE BASE (public, verified):']
  if (kb?.version) {
    lines.push(`Version: ${kb.version}`)
  }
  if (kb?.rules?.length) {
    lines.push('Rules:')
    kb.rules.forEach((rule) => lines.push(`- ${rule}`))
  }
  if (kb?.topics?.length) {
    lines.push('Topics:')
    kb.topics.forEach((topic) => {
      const title = topic.title || topic.id || 'Topic'
      const summary = topic.summary ? ` ${topic.summary}` : ''
      lines.push(`- ${title}.${summary}`)
      const links = topic.links || {}
      const linkEntries = Object.entries(links)
      linkEntries.forEach(([label, url]) => {
        lines.push(`  - ${label}: ${url}`)
      })
    })
  }
  return lines.join('\n')
}

type ChatBugAnalysis = {
  isChatBug: boolean
  isFrustrated: boolean
  hasChatArea: boolean
  hasMobile: boolean
  hasDesktop: boolean
  areas: string[]
  devices: string[]
}

function analyzeChatBugMessage(message: string): ChatBugAnalysis {
  const text = message.toLowerCase()
  const isChatBug =
    /(chat|chatbot|chatbox|chat box|text field|text input|message field|input)/i.test(text) &&
    /(bug|buggy|broken|not working|doesn.t work|does not work|issue|problem|glitch|jump|jumping|move|moving|disappear|off the screen|off-screen|weird)/i.test(text)
  const hasMobile = /(iphone|ipad|ios|android|mobile)/i.test(text)
  const hasDesktop = /(mac|windows|desktop|laptop|browser)/i.test(text)
  const hasChatArea = /(symptom|medical image|image analyzer|insight|talk to ai|voice|support chat)/i.test(text)
  const isFrustrated = /(repeating|already told|stop asking|check your code|check the code|loop|looping)/i.test(text)
  const areas: string[] = []
  if (/support chat|support widget|support/i.test(text)) {
    areas.push('Support chat widget')
  }
  if (/symptom/i.test(text)) {
    areas.push('Symptoms chat')
  }
  if (/medical image|image analyzer|medical/i.test(text)) {
    areas.push('Medical image chat')
  }
  if (/insight/i.test(text)) {
    areas.push('Insights chat')
  }
  if (/talk to ai|voice/i.test(text)) {
    areas.push('Talk to AI chat')
  }
  const devices: string[] = []
  if (/iphone|ipad|ios/i.test(text)) devices.push('iOS')
  if (/android/i.test(text)) devices.push('Android')
  if (/mac/i.test(text)) devices.push('macOS')
  if (/windows/i.test(text)) devices.push('Windows')
  if (/desktop/i.test(text)) devices.push('Desktop')
  if (/mobile/i.test(text)) devices.push('Mobile')

  return {
    isChatBug,
    isFrustrated,
    hasChatArea,
    hasMobile,
    hasDesktop,
    areas: Array.from(new Set(areas)),
    devices: Array.from(new Set(devices)),
  }
}

function buildChatBugInternalNotes(chatBug: ChatBugAnalysis): string {
  const lines = ['Chat input UI issue reported: input jumps, moves, or disappears while typing.']
  if (chatBug.areas.length > 0) {
    lines.push(`Reported area: ${chatBug.areas.join(', ')}.`)
  }
  if (chatBug.devices.length > 0) {
    lines.push(`Reported devices: ${chatBug.devices.join(', ')}.`)
  }
  lines.push('Check chat input container sizing, scroll anchoring, and keyboard handling.')
  lines.push('Likely files: components/VoiceChat.tsx, app/symptoms/SymptomChat.tsx, app/medical-images/MedicalImageChat.tsx, app/insights/issues/[issueSlug]/SectionChat.tsx.')
  if (chatBug.areas.includes('Support chat widget')) {
    lines.push('Also check components/support/SupportChatWidget.tsx and app/support/page.tsx.')
  }
  return lines.join(' ')
}

function buildDeterministicSupportReply(options: {
  message: string
  userLoggedIn: boolean
  agent?: { name: string; role: string }
}): string | null {
  const text = options.message.toLowerCase()
  const affiliateTopic = findSupportTopic('affiliate_program')
  const authTopic = findSupportTopic('auth_signin_signup')
  const passwordTopic = findSupportTopic('password_reset')
  const supportTopic = findSupportTopic('support_and_help')
  const featuresTopic = findSupportTopic('features')
  const sleepTopic = findSupportTopic('sleep_tracking')

  const affiliatePayoutMatch =
    /affiliate|referral|partner program|refer/i.test(text) &&
    /(payout|pay|paid|payment|commission|bank|stripe|transfer|threshold|monthly|net\s?-?\s?30)/i.test(text)
  if (affiliatePayoutMatch) {
    const signupUrl = affiliateTopic?.links?.signup || authTopic?.links?.signup || 'https://helfi.ai/auth/signin?mode=signup'
    const applyUrl = affiliateTopic?.links?.apply || 'https://helfi.ai/affiliate/apply'
    const termsUrl = affiliateTopic?.links?.terms || 'https://helfi.ai/affiliate/terms'
    const lines = [
      'Affiliate payouts run once per month.',
      'Payouts are sent via Stripe Connect to your bank account after approval.',
      'Minimum payout threshold is $50 USD.',
      'Commissions become payable 30 days after the purchase (Net-30) and are voided if refunded or disputed within that window.',
    ]
    if (!options.userLoggedIn) {
      lines.unshift(`To get started, create a Helfi account first: ${signupUrl}.`)
    }
    lines.push(`Apply here: ${applyUrl}.`)
    lines.push(`Terms: ${termsUrl}.`)
    return addAgentSignOff(lines.join('\n'), options.agent)
  }

  const chatBug = analyzeChatBugMessage(text)
  if (chatBug.isChatBug) {
    const followups: string[] = []
    if (!chatBug.hasChatArea) {
      followups.push('Which chat is it in? (Talk to AI, Symptoms, Medical Image, or Insights)')
    }
    if (!chatBug.hasMobile && !chatBug.hasDesktop) {
      followups.push('Does it happen on mobile, desktop, or both?')
    }

    const lines = [
      'Thanks for reporting this. I can see how frustrating that is.',
      'I am checking the latest app build and the chat module now so we can fix this.',
      'If the input is jumping or disappearing, a quick refresh usually brings it back while we investigate.',
    ]

    if (followups.length > 0) {
      if (chatBug.isFrustrated) {
        lines.push('If you want to add one helpful detail later, this is the most useful:')
      } else {
        lines.push('If you can, please tell me:')
      }
      followups.forEach((item) => lines.push(`- ${item}`))
    }

    return addAgentSignOff(lines.join('\n'), options.agent)
  }

  const featuresMatch = /features?|capabilities|what can (i|we) do|what does helfi do|what is included/i.test(text)
  if (featuresMatch) {
    const featureList = [
      'Health intake profile setup (build your health profile).',
      'Smart health tracking for weight, mood, energy, and custom metrics.',
      'Food logging with photo analysis and meal logging.',
      'Medication and supplement tracking with interaction checks.',
      'AI insights dashboard and personalized recommendations.',
      'Sleep data from connected devices (Fitbit; Garmin evaluation) and optional sleep quality ratings in mood check-ins.',
      'Symptom analysis with follow-up chat.',
      'Medical image analyzer with follow-up chat.',
      'Lab report upload and analysis (PDF or photos).',
      'Mood tracking and quick mood check-in.',
      'Daily check-ins and rating history.',
      'Talk to AI (voice chat).',
      'Health tips.',
      'Device connections (Fitbit available; Garmin evaluation in progress).',
    ]
    const featuresUrl = featuresTopic?.links?.overview || 'https://helfi.ai/#features'
    const reply = [
      'Here is a clear list of Helfi features:',
      '',
      ...featureList.map((item) => `- ${item}`),
      '',
      `Full overview: ${featuresUrl}.`,
    ].join('\n')
    return addAgentSignOff(reply, options.agent)
  }

  const sleepMatch = /sleep/i.test(text) && /track|tracking|monitor|monitoring|data|sync/i.test(text)
  if (sleepMatch) {
    const devicesUrl = sleepTopic?.links?.devices || 'https://helfi.ai/devices'
    const reply = [
      'Sleep is not tracked automatically unless a device is connected.',
      'If you connect Fitbit, Helfi can sync sleep data. Garmin sleep is in evaluation.',
      'Without a device, sleep is only an optional self-rating in mood check-ins.',
      `Devices page: ${devicesUrl}.`,
    ].join('\n')
    return addAgentSignOff(reply, options.agent)
  }

  const affiliateMatch = /affiliate|referral|partner program|refer/i.test(text)
  if (affiliateMatch) {
    const signupUrl = affiliateTopic?.links?.signup || authTopic?.links?.signup || 'https://helfi.ai/auth/signin?mode=signup'
    const applyUrl = affiliateTopic?.links?.apply || 'https://helfi.ai/affiliate/apply'
    const portalUrl = affiliateTopic?.links?.portal || 'https://helfi.ai/affiliate'
    const termsUrl = affiliateTopic?.links?.terms || 'https://helfi.ai/affiliate/terms'
    const loginIntro = options.userLoggedIn
      ? ''
      : `To get started, create a Helfi account first: ${signupUrl}.\n\n`
    const reply = [
      'Yes — we have an affiliate program.',
      '',
      `${loginIntro}Apply here: ${applyUrl}.`,
      'We review applications before approval.',
      `After approval, your portal is: ${portalUrl}.`,
      `Terms: ${termsUrl}.`,
    ].join('\n')
    return addAgentSignOff(reply, options.agent)
  }

  const signupMatch = /sign up|signup|create account|register/i.test(text)
  if (signupMatch) {
    const signupUrl = authTopic?.links?.signup || 'https://helfi.ai/auth/signin?mode=signup'
    const signinUrl = authTopic?.links?.signin || 'https://helfi.ai/auth/signin'
    const reply = [
      `Create your account here: ${signupUrl}.`,
      `Already have an account? Sign in here: ${signinUrl}.`,
    ].join('\n')
    return addAgentSignOff(reply, options.agent)
  }

  const signinMatch = /sign in|signin|log in|login/i.test(text)
  if (signinMatch) {
    const signinUrl = authTopic?.links?.signin || 'https://helfi.ai/auth/signin'
    const signupUrl = authTopic?.links?.signup || 'https://helfi.ai/auth/signin?mode=signup'
    const reply = [
      `Sign in here: ${signinUrl}.`,
      `If you need a new account, sign up here: ${signupUrl}.`,
    ].join('\n')
    return addAgentSignOff(reply, options.agent)
  }

  const passwordMatch = /password|reset password|forgot password/i.test(text)
  if (passwordMatch) {
    const forgotUrl = passwordTopic?.links?.forgot_password || 'https://helfi.ai/auth/forgot-password'
    const reply = `Start your password reset here: ${forgotUrl}. We will email you a secure reset link.`
    return addAgentSignOff(reply, options.agent)
  }

  const supportMatch = /support|help|contact/i.test(text)
  if (supportMatch) {
    const supportUrl = supportTopic?.links?.support || 'https://helfi.ai/support'
    const helpUrl = supportTopic?.links?.help || 'https://helfi.ai/help'
    const faqUrl = supportTopic?.links?.faq || 'https://helfi.ai/faq'
    const reply = [
      `Support page: ${supportUrl}.`,
      `Help page: ${helpUrl}.`,
      `FAQ: ${faqUrl}.`,
    ].join('\n')
    return addAgentSignOff(reply, options.agent)
  }

  return null
}

function buildSupportUserPrompt(input: {
  ticket: any
  latestMessage: string
  latestAttachments: SupportAttachment[]
  identityVerified: boolean
  verificationPending: boolean
  verificationJustCompleted: boolean
  hasPriorSupportReply: boolean
  userLoggedIn: boolean
  source?: string
  codeContext: string
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
    `Channel: ${input.source || 'unknown'}`,
    `User logged in: ${input.userLoggedIn ? 'yes' : 'no'}`,
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
    input.codeContext ? `Code context:\n${input.codeContext}` : 'Code context: (none)',
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

function collectInternalNotes(ticket: any): string[] {
  const responses = Array.isArray(ticket.responses) ? ticket.responses : []
  return responses
    .map((response: any) => String(response.message || ''))
    .filter((message: string) => message.startsWith(SYSTEM_INTERNAL_NOTES_MARKER))
    .map((message: string) => message.replace(SYSTEM_INTERNAL_NOTES_MARKER, '').trim())
    .filter(Boolean)
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
  const agent = getSupportAgentForTimestamp(new Date(ticket.createdAt || Date.now()))
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
    const author = response.isAdminResponse ? `${agent.name} (AI)` : 'Customer'
    entries.push({
      author,
      message: parsed.text,
      attachments: parsed.attachments,
    })
  })

  return entries
}

function buildTranscriptHtml(options: {
  ticket: any
  transcript: string
  includeInternalNotes?: boolean
  recipientEmail: string
  emailType?: 'admin' | 'support'
  reasonText?: string
}): string {
  const subject = escapeHtml(options.ticket.subject || 'Support request')
  const entries = buildTranscriptEntries(options.ticket)
  const includeInternalNotes = options.includeInternalNotes !== false
  const internalNotes = includeInternalNotes ? collectInternalNotes(options.ticket) : []
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
      ${internalNotes.length > 0 ? `
        <div style="margin-top: 18px;">
          <h3 style="margin: 0 0 8px 0; font-size: 14px;">AI internal notes</h3>
          <pre style="background:#111827; color:#f9fafb; padding:12px; border-radius:8px; font-size:12px; white-space:pre-wrap;">${escapeHtml(internalNotes.join('\n\n'))}</pre>
        </div>
      ` : ''}
      ${getEmailFooter({
        recipientEmail: options.recipientEmail,
        emailType: options.emailType,
        reasonText: options.reasonText,
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
    html: buildTranscriptHtml({
      ticket,
      transcript,
      includeInternalNotes: true,
      recipientEmail: SUPPORT_COPY_EMAIL,
      emailType: 'admin',
      reasonText: 'Transcript sent after the support chat ended.',
    }),
  })

  if (ticket.userEmail && ticket.userEmail !== SUPPORT_COPY_EMAIL) {
    await resend.emails.send({
      from: 'Helfi Support <support@helfi.ai>',
      to: ticket.userEmail,
      subject: 'Your Helfi support chat transcript',
      html: buildTranscriptHtml({
        ticket,
        transcript,
        includeInternalNotes: false,
        recipientEmail: ticket.userEmail,
        emailType: 'support',
        reasonText: 'Here is a copy of your support chat transcript.',
      }),
    })
  }

  await prisma.ticketResponse.create({
    data: {
      ticketId,
      message: `${SYSTEM_TRANSCRIPT_MARKER} (${new Date().toISOString()})`,
      isAdminResponse: true,
      adminId: null,
    },
  })
}

export function buildSupportFeedbackPrompt(
  userName?: string | null,
  agent?: { name: string; role: string }
) {
  const name = userName?.trim() ? userName.trim().split(' ')[0] : 'there'
  const agentName = agent?.name || 'Helfi Support'
  const agentRole = agent?.role || 'Helfi Support'
  return [
    `Thanks ${name} — I’m glad we could help.`,
    'If you have a moment, could you rate your support experience and leave a quick comment? It helps us improve.',
    `\n${agentName} from ${agentRole}`,
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

function fallbackSupportReply(options?: {
  message?: string
  userLoggedIn?: boolean
  agent?: { name: string; role: string }
}): SupportAiResult {
  const directReply = options?.message
    ? buildDeterministicSupportReply({
        message: options.message,
        userLoggedIn: Boolean(options.userLoggedIn),
        agent: options.agent,
      })
    : null
  if (directReply) {
    return {
      customerReply: directReply,
      shouldEscalate: false,
      escalationReason: '',
      needsIdentityCheck: false,
      needsMoreInfo: false,
      requestedInfo: [],
      internalNotes: 'Deterministic support reply used (AI unavailable).',
      suggestedCategory: '',
      suggestedPriority: '',
    }
  }

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
  const agent = getSupportAgentForTimestamp(new Date(ticket.createdAt || Date.now()))

  const rawLatest = String(input.latestUserMessage || ticket.message || '').trim()
  const parsedLatest = splitAttachmentsFromMessage(rawLatest)
  let latestMessage = stripHtml(parsedLatest.text)
  const rawLatestMessage = latestMessage

  const userLoggedIn = Boolean(ticket.userId || ticket.user?.id)
  let identityVerified = isIdentityVerified(ticket.responses || []) || userLoggedIn
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
  const chatBug = latestMessage ? analyzeChatBugMessage(latestMessage) : null
  const openai = getOpenAIClient()
  let aiResult: SupportAiResult

  const directReply = latestMessage
    ? buildDeterministicSupportReply({ message: latestMessage, userLoggedIn, agent })
    : null

  if (directReply) {
    aiResult = {
      customerReply: directReply,
      shouldEscalate: false,
      escalationReason: '',
      needsIdentityCheck: false,
      needsMoreInfo: false,
      requestedInfo: [],
      internalNotes: 'Deterministic support reply used.',
      suggestedCategory: '',
      suggestedPriority: '',
    }
  } else if (!openai) {
    aiResult = fallbackSupportReply({ message: latestMessage, userLoggedIn, agent })
  } else {
    const systemPrompt = buildSupportSystemPrompt(agent.name, agent.role)
    const codeContext = buildSupportCodeContext([ticket.subject, latestMessage].filter(Boolean).join(' '))
    const userPrompt = buildSupportUserPrompt({
      ticket,
      latestMessage,
      latestAttachments: parsedLatest.attachments,
      identityVerified,
      verificationPending,
      verificationJustCompleted,
      hasPriorSupportReply,
      userLoggedIn,
      source: input.source,
      codeContext,
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
        response_format: { type: 'json_object' },
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
    aiResult = safeParseSupportJson(rawText) || fallbackSupportReply({ message: latestMessage, userLoggedIn, agent })
  }

  if (chatBug?.isChatBug) {
    const bugNotes = buildChatBugInternalNotes(chatBug)
    aiResult.internalNotes = aiResult.internalNotes ? `${aiResult.internalNotes}\n${bugNotes}` : bugNotes
    if (!aiResult.suggestedCategory) {
      aiResult.suggestedCategory = 'BUG_REPORT'
    }
    if (!aiResult.suggestedPriority) {
      aiResult.suggestedPriority = 'MEDIUM'
    }
    if (!aiResult.shouldEscalate) {
      aiResult.shouldEscalate = true
      aiResult.escalationReason = aiResult.escalationReason || 'User reported chat input UI bug.'
    }
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

  const internalNotes = aiResult.internalNotes?.trim()
  if (internalNotes) {
    const trimmedNotes = internalNotes.length > 1800 ? `${internalNotes.slice(0, 1800)}...` : internalNotes
    await prisma.ticketResponse.create({
      data: {
        ticketId: ticket.id,
        message: `${SYSTEM_INTERNAL_NOTES_MARKER} ${trimmedNotes}`,
        isAdminResponse: true,
        adminId: null,
      },
    })
  }

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
