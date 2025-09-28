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

interface CommonPromptInput {
  issueName: string
  issueSummary?: string | null
  userContext: string
  knowledgeNotes?: string[]
  mode: 'supplements' | 'medications'
}

function buildPrompt({ issueName, issueSummary, userContext, knowledgeNotes, mode }: CommonPromptInput) {
  const focus = mode === 'supplements' ? 'supplement' : 'medication'
  const header = `You are a clinician-grade health assistant helping evaluate ${focus} usage for the issue "${issueName}".`

  const guidance = `
Provide precise, evidence-aligned guidance. Only use information supplied in the user context. If data is insufficient, explicitly state that.

Classify the logged ${focus}s into three buckets: working (helpful/supportive), suggested (worth discussing with clinician), avoid (risky or counterproductive). Always provide concise reasons.

When unsure, leave the bucket empty rather than guessing.

Respond strictly as JSON with keys summary, working, suggested, avoid, recommendations.
Each recommendation must include title, description, actions (array, can be empty), and priority (now|soon|monitor).
  `

  const knowledge = knowledgeNotes && knowledgeNotes.length
    ? `Additional clinical notes to consider:\n- ${knowledgeNotes.join('\n- ')}`
    : ''

  return `${header}\n\nIssue summary: ${issueSummary ?? 'Not supplied.'}\n\n${knowledge}\n\nUser context (JSON):\n${userContext}\n\n${guidance}`
}

interface LLMInputData {
  issueName: string
  issueSummary?: string | null
  items: Array<{ name: string; dosage?: string | null; timing?: string[] | null }>
  otherItems?: Array<{ name: string; dosage?: string | null }>
  knowledgeNotes?: string[]
  mode: 'supplements' | 'medications'
}

export async function generateSectionInsightsFromLLM(input: LLMInputData): Promise<SectionLLMResult | null> {
  const openai = getOpenAIClient()
  if (!openai) {
    return null
  }

  if (!input.items.length) {
    return null
  }

  const userContext = JSON.stringify(
    {
      focusItems: input.items,
      otherItems: input.otherItems ?? [],
    },
    null,
    2
  )

  const prompt = buildPrompt({
    issueName: input.issueName,
    issueSummary: input.issueSummary,
    userContext,
    knowledgeNotes: input.knowledgeNotes,
    mode: input.mode,
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
            'You are a careful clinical decision support assistant. Follow instructions precisely and never fabricate data.',
        },
        { role: 'user', content: prompt },
      ],
    })

    const content = response.choices?.[0]?.message?.content
    if (!content) {
      return null
    }

    const parsed = llmSectionSchema.safeParse(JSON.parse(content))
    if (!parsed.success) {
      return null
    }

    return parsed.data
  } catch (error) {
    console.error('[insights.llm] Failed to fetch LLM output', error)
    return null
  }
}
