import OpenAI from 'openai'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'

export type AffiliateScreeningInput = {
  email: string
  name: string
  website?: string | null
  primaryChannel?: string | null
  primaryChannelOther?: string | null
  audienceSize?: string | null
  promotionMethod: string
  notes?: string | null
  ip?: string | null
  userAgent?: string | null
  country?: string | null
  region?: string | null
  city?: string | null
}

export type AffiliateScreeningResult = {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  recommendedAction: 'AUTO_APPROVE' | 'MANUAL_REVIEW'
  reasoning: string
  redFlags?: string[]
  raw?: any
}

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

function tryParseJsonObject(text: string): any | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

export async function screenAffiliateApplication(input: AffiliateScreeningInput): Promise<AffiliateScreeningResult> {
  const webhookUrl = process.env.AFFILIATE_SCREENING_WEBHOOK_URL
  if (webhookUrl) {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'affiliate_application', input }),
    })
    if (!resp.ok) {
      throw new Error(`Affiliate screening webhook failed: ${resp.status}`)
    }
    const data = await resp.json().catch(() => ({}))
    const risk = String(data?.riskLevel || data?.risk || '').toUpperCase()
    const action = String(data?.recommendedAction || data?.action || '').toUpperCase()
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(risk) || !['AUTO_APPROVE', 'MANUAL_REVIEW'].includes(action)) {
      throw new Error('Affiliate screening webhook returned invalid result')
    }
    return {
      riskLevel: risk as any,
      recommendedAction: action as any,
      reasoning: String(data?.reasoning || data?.summary || 'No reasoning provided'),
      redFlags: Array.isArray(data?.redFlags) ? data.redFlags.map((x: any) => String(x)) : undefined,
      raw: data,
    }
  }

  const openai = getOpenAI()
  if (!openai) {
    return {
      riskLevel: 'MEDIUM',
      recommendedAction: 'MANUAL_REVIEW',
      reasoning: 'OPENAI_API_KEY not configured; defaulting to manual review.',
    }
  }

  const model = (process.env.AFFILIATE_SCREENING_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini'
  const system = `You are an affiliate application screening service for a SaaS app.
Return ONLY valid JSON with keys:
- riskLevel: one of LOW|MEDIUM|HIGH
- recommendedAction: one of AUTO_APPROVE|MANUAL_REVIEW
- reasoning: short explanation
- redFlags: array of strings (optional)
`
  const user = {
    input,
    criteria: [
      'Email domain quality',
      'Consistency of applicant details',
      'Clarity and specificity of promotion method',
      'Signs of automated or low-effort submissions',
      'IP / location anomalies (where available)',
    ],
  }

  const result = await runChatCompletionWithLogging(
    openai,
    {
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(user) },
      ],
    },
    { feature: 'affiliate:screening', userLabel: input.email, endpoint: 'affiliate_screening' }
  )

  const text = (result as any)?.choices?.[0]?.message?.content || ''
  const parsed = tryParseJsonObject(text) || {}
  const riskLevel = String(parsed?.riskLevel || '').toUpperCase()
  const recommendedAction = String(parsed?.recommendedAction || '').toUpperCase()

  if (!['LOW', 'MEDIUM', 'HIGH'].includes(riskLevel) || !['AUTO_APPROVE', 'MANUAL_REVIEW'].includes(recommendedAction)) {
    return {
      riskLevel: 'MEDIUM',
      recommendedAction: 'MANUAL_REVIEW',
      reasoning: 'AI returned an invalid response; defaulting to manual review.',
      raw: { text },
    }
  }

  return {
    riskLevel: riskLevel as any,
    recommendedAction: recommendedAction as any,
    reasoning: String(parsed?.reasoning || 'No reasoning provided'),
    redFlags: Array.isArray(parsed?.redFlags) ? parsed.redFlags.map((x: any) => String(x)) : undefined,
    raw: parsed,
  }
}
