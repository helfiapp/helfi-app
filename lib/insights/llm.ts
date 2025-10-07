import { z } from 'zod'

const CACHE_TTL_MS = 1000 * 60 * 30

const insightCache = new Map<
  string,
  { expiresAt: number; result: SectionLLMResult }
>()

// Lazy import to avoid bundling OpenAI client when not configured
let _openai: any = null

function getOpenAIClient() {
  if (_openai) return _openai
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return null
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const OpenAI = require('openai').default
  _openai = new OpenAI({ apiKey })
  return _openai
}

const llmSectionSchema = z.object({
  summary: z.string().optional(),
  working: z
    .array(
      z.object({
        name: z.string(),
        reason: z.string().min(1),
        dosage: z.string().optional().nullable(),
        timing: z.string().optional().nullable(),
      })
    )
    .default([]),
  suggested: z
    .array(
      z.object({
        name: z.string(),
        reason: z.string().min(1),
        protocol: z.string().optional().nullable(),
      })
    )
    .default([]),
  avoid: z
    .array(
      z.object({
        name: z.string(),
        reason: z.string().min(1),
      })
    )
    .default([]),
  recommendations: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        actions: z.array(z.string()).default([]),
        priority: z.enum(['now', 'soon', 'monitor']).default('monitor'),
      })
    )
    .default([]),
})

export type SectionLLMResult = z.infer<typeof llmSectionSchema>

type SectionMode =
  | 'supplements'
  | 'medications'
  | 'exercise'
  | 'nutrition'
  | 'lifestyle'
  | 'labs'

interface LLMInputData {
  issueName: string
  issueSummary?: string | null
  items?: Array<{ name: string; dosage?: string | null; timing?: string[] | null }>
  otherItems?: Array<{ name: string; dosage?: string | null }>
  profile?: {
    gender?: string | null
    weight?: number | null
    height?: number | null
    bodyType?: string | null
    exerciseFrequency?: string | null
  }
  mode: SectionMode
}

interface LLMOptions {
  minWorking?: number
  minSuggested?: number
  minAvoid?: number
  maxRetries?: number
}

function modeGuidance(mode: SectionMode) {
  switch (mode) {
    case 'supplements':
      return 'Evaluate supplements. Identify which are truly helpful for the issue, which additions to discuss with a clinician, and which supplements people with this issue should avoid or monitor.'
    case 'medications':
      return 'Evaluate prescription and OTC pharmaceutical therapies only (no supplements, herbs, nutraceuticals, or vitamins). Highlight medications that are supporting the issue, medication additions to discuss with a prescriber, and medications that warrant caution or avoidance.'
    case 'exercise':
      return 'Evaluate exercise and movement patterns. Highlight the training that supports this issue, recommended additions, and activities/protocols to limit or avoid.'
    case 'nutrition':
      return 'Evaluate nutrition patterns using foods, meals, or dietary patterns only. Do not mention supplements or pills. Highlight foods/meals that help, additions to include, and foods or dietary approaches to avoid for this issue.'
    case 'lifestyle':
      return 'Evaluate lifestyle habits (sleep, stress, routines). Highlight habits that are helping, habits to add, and habits/behaviours to avoid for this issue.'
    case 'labs':
      return 'Evaluate labs and biomarker monitoring. Highlight labs already supporting the issue, labs to order or review, and labs/testing patterns that require caution.'
    default:
      return ''
  }
}

function buildPrompt(
  {
    issueName,
    issueSummary,
    userContext,
    mode,
    minWorking,
    minSuggested,
    minAvoid,
    force,
  }: {
    issueName: string
    issueSummary?: string | null
    userContext: string
    mode: SectionMode
    minWorking: number
    minSuggested: number
    minAvoid: number
    force: boolean
  }
) {
  const guidanceFocus = modeGuidance(mode)
  const header = `You are a clinician-grade health assistant helping with the issue "${issueName}".`

  const baseGuidance = `
Provide precise, evidence-aligned guidance. Use the user context plus widely accepted best practice. If data is insufficient, state that but still offer clinician-ready suggestions.

Classify findings into three buckets: working (helpful/supportive today), suggested (worth discussing with clinician to add), avoid (risky or counterproductive). Always provide detailed clinical reasons (two sentences: mechanism + relevance to the specific issue). ${guidanceFocus}
Ensure the suggested array contains at least ${minSuggested} unique entries that are not already in the focusItems list.

Return JSON exactly matching this schema (no extra keys, no missing keys, do not rename fields):
{
  "summary": string,
  "working": Array<{"name": string, "reason": string, "dosage"?: string | null, "timing"?: string | null}>,
  "suggested": Array<{"name": string, "reason": string, "protocol"?: string | null}>,
  "avoid": Array<{"name": string, "reason": string}>,
  "recommendations": Array<{"title": string, "description": string, "actions": string[], "priority": "now" | "soon" | "monitor"}>
}
All strings must be non-empty and plain text. Use null when optional fields are unknown. Do not include title/description keys inside working/suggested/avoid items—use name/reason exactly. Suggestions must be novel relative to the focusItems and otherItems lists (case-insensitive) unless you are recommending a changed protocol.
Close every array/object and ensure the JSON is syntactically valid—never truncate or omit closing braces.
  `

  const forceNote = force
    ? `You must output at least ${minWorking} working item(s), ${minSuggested} suggested item(s), and ${minAvoid} avoid item(s). Suggested items must not duplicate any names already present in focusItems or otherItems. If logged data is sparse, rely on broadly accepted best-practice guidance for ${issueName}.`
    : ''

  // Add targeted domain rules for specific issues
  const loweredIssue = issueName.toLowerCase()
  const libidoRules = loweredIssue.includes('libido') || loweredIssue.includes('erection')
    ? `\nIssue-specific rules for libido:\n- Consider sex, age, weight/height, and training frequency when assessing androgen status and arousal.\n- Evaluate mechanisms: testosterone/DHT, nitric oxide/endothelial function, SHBG, stress/cortisol, sleep.\n- For males, flag 5-alpha-reductase inhibitors (e.g., saw palmetto) as potential libido-reducing; explain the DHT rationale and advise clinician discussion.\n- Provide concrete protocols where possible (e.g., dosing ranges/timing windows).\n`
    : ''

  return `${header}\n\nIssue summary: ${issueSummary ?? 'Not supplied.'}\n\nUser context (JSON):\n${userContext}\n\n${baseGuidance}\n${libidoRules}${forceNote}`
}

export async function generateSectionInsightsFromLLM(
  input: LLMInputData,
  options: LLMOptions = {}
): Promise<SectionLLMResult | null> {
  const openai = getOpenAIClient()
  if (!openai) {
    return null
  }

  const minWorking = options.minWorking ?? 1
  const minSuggested = options.minSuggested ?? 4
  const minAvoid = options.minAvoid ?? 2
  const maxRetries = options.maxRetries ?? 2

  const focusItems = (input.items ?? []).slice(0, 8)
  const otherItems = (input.otherItems ?? []).slice(0, 6)

  const userContext = JSON.stringify(
    {
      focusItems,
      otherItems,
      profile: input.profile ?? {},
    },
    null,
    2
  )

  const cacheKey = JSON.stringify({
    issueName: input.issueName,
    issueSummary: input.issueSummary ?? '',
    mode: input.mode,
    userContext,
    minWorking,
    minSuggested,
    minAvoid,
  })

  const cached = insightCache.get(cacheKey)
  const nowTs = Date.now()
  if (cached && cached.expiresAt > nowTs) {
    return cached.result
  }

  let attempt = 0
  let fallbackResult: SectionLLMResult | null = null
  while (attempt < maxRetries) {
    const force = attempt > 0
    const prompt = buildPrompt({
      issueName: input.issueName,
      issueSummary: input.issueSummary,
      userContext,
      mode: input.mode,
      minWorking,
      minSuggested,
      minAvoid,
      force,
    })

    try {
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_INSIGHTS_MODEL ?? 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a careful clinical decision support assistant. Follow instructions precisely, remain evidence-aligned, and never fabricate data.',
          },
          { role: 'user', content: prompt },
        ],
      })

      const content = response.choices?.[0]?.message?.content
      if (!content) {
        attempt += 1
        continue
      }

      let json: unknown
      try {
        json = JSON.parse(content)
      } catch (parseError) {
        console.warn('[insights.llm] Failed to parse JSON content', { content })
        throw parseError
      }

      const parsed = llmSectionSchema.safeParse(json)
      if (!parsed.success) {
        console.warn('[insights.llm] Invalid LLM JSON', {
          issues: parsed.error.issues,
          content,
        })
        attempt += 1
        continue
      }

      const data = parsed.data
      const containsUsefulContent =
        Boolean(data.summary?.trim()) ||
        data.working.length > 0 ||
        data.suggested.length > 0 ||
        data.avoid.length > 0 ||
        data.recommendations.length > 0

      if (containsUsefulContent) {
        fallbackResult = data
      }
      if (
        data.working.length >= minWorking &&
        data.suggested.length >= minSuggested &&
        data.avoid.length >= minAvoid
      ) {
        insightCache.set(cacheKey, {
          expiresAt: Date.now() + CACHE_TTL_MS,
          result: data,
        })
        return data
      }

      attempt += 1
      continue
    } catch (error) {
      console.error('[insights.llm] Failed to fetch LLM output', error)
      attempt += 1
    }
  }

  if (fallbackResult) {
    console.warn('[insights.llm] Returning fallback LLM output with reduced coverage')
    insightCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      result: fallbackResult,
    })
    return fallbackResult
  }

  return null
}
