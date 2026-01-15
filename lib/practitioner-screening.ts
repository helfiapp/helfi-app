import OpenAI from 'openai'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'

export type PractitionerScreeningInput = {
  listingId: string
  displayName: string
  description?: string | null
  websiteUrl?: string | null
  phone?: string | null
  emailPublic?: string | null
  address?: string | null
  category?: string | null
  subcategory?: string | null
  tags?: string[]
  languages?: string[]
  hasCoordinates?: boolean
  hasFullAddress?: boolean
  hasPhone?: boolean
  hasWebsite?: boolean
  hasPublicEmail?: boolean
}

export type PractitionerScreeningResult = {
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

export async function screenPractitionerListing(
  input: PractitionerScreeningInput
): Promise<PractitionerScreeningResult> {
  const webhookUrl = process.env.PRACTITIONER_SCREENING_WEBHOOK_URL
  if (webhookUrl) {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'practitioner_listing', input }),
    })
    if (!resp.ok) {
      throw new Error(`Practitioner screening webhook failed: ${resp.status}`)
    }
    const data = await resp.json().catch(() => ({}))
    const risk = String(data?.riskLevel || data?.risk || '').toUpperCase()
    const action = String(data?.recommendedAction || data?.action || '').toUpperCase()
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(risk) || !['AUTO_APPROVE', 'MANUAL_REVIEW'].includes(action)) {
      throw new Error('Practitioner screening webhook returned invalid result')
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
      reasoning: 'AI screening is not configured; defaulting to manual review.',
    }
  }

  const model = (process.env.PRACTITIONER_SCREENING_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini'
  const system = `You are a fraud and scam screening assistant for a practitioner directory.
Return ONLY valid JSON with keys:
- riskLevel: one of LOW|MEDIUM|HIGH
- recommendedAction: one of AUTO_APPROVE|MANUAL_REVIEW
- reasoning: short explanation in plain language
- redFlags: array of strings (optional)

IMPORTANT:
- Only flag listings when there are clear, serious concerns (fraud, impersonation, illegal claims, guaranteed cures, miracle results, financial scams).
- Normal wellness or holistic language is NOT a reason to flag a listing.
- If the listing has a real address/coordinates and a phone number, that is a strong legitimacy signal.
- If unsure, choose LOW and AUTO_APPROVE.
`
  const user = {
    input,
    checks: [
      'Only extreme or illegal medical claims (guaranteed cures, miracle results, curing cancer, etc.)',
      'Missing or inconsistent contact details',
      'Likely spam or automated content',
      'Unclear or fake business identity',
      'High-risk language or scams',
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
    { feature: 'practitioner:screening', userLabel: input.listingId, endpoint: 'practitioner_screening' }
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
