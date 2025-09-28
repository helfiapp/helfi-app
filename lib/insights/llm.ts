import { z } from 'zod'

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
      return 'Evaluate prescription and OTC therapies. Highlight medications that are supporting the issue, additions to discuss with a prescriber, and medications that warrant caution or avoidance.'
    case 'exercise':
      return 'Evaluate exercise and movement patterns. Highlight the training that supports this issue, recommended additions, and activities/protocols to limit or avoid.'
    case 'nutrition':
      return 'Evaluate nutrition patterns. Highlight foods/meals that help, additions to include, and foods or dietary approaches to avoid for this issue.'
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

Classify findings into three buckets: working (helpful/supportive today), suggested (worth discussing with clinician to add), avoid (risky or counterproductive). Always provide concise clinical reasons. ${guidanceFocus}

Respond strictly as JSON with keys summary, working, suggested, avoid, recommendations. Each recommendation must include title, description, actions (array, can be empty), and priority (now|soon|monitor).
  `

  const forceNote = force
    ? `You must output at least ${minWorking} working item(s), ${minSuggested} suggested item(s), and ${minAvoid} avoid item(s). If logged data is sparse, rely on broadly accepted best-practice guidance for ${issueName}.`
    : ''

  return `${header}\n\nIssue summary: ${issueSummary ?? 'Not supplied.'}\n\nUser context (JSON):\n${userContext}\n\n${baseGuidance}\n${forceNote}`
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
  const minSuggested = options.minSuggested ?? 2
  const minAvoid = options.minAvoid ?? 2
  const maxRetries = options.maxRetries ?? 2

  const userContext = JSON.stringify(
    {
      focusItems: input.items ?? [],
      otherItems: input.otherItems ?? [],
    },
    null,
    2
  )

  let attempt = 0
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

      const parsed = llmSectionSchema.safeParse(JSON.parse(content))
      if (!parsed.success) {
        console.warn('[insights.llm] Invalid LLM JSON', parsed.error)
        attempt += 1
        continue
      }

      const data = parsed.data
      if (
        data.working.length >= minWorking &&
        data.suggested.length >= minSuggested &&
        data.avoid.length >= minAvoid
      ) {
        return data
      }

      attempt += 1
      continue
    } catch (error) {
      console.error('[insights.llm] Failed to fetch LLM output', error)
      attempt += 1
    }
  }

  return null
}
