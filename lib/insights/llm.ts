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

const DEFAULT_INSIGHTS_MODEL = process.env.OPENAI_INSIGHTS_MODEL ?? 'gpt-4o-mini'

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
    exerciseTypes?: string[] | null
  }
  mode: SectionMode
}

interface LLMOptions {
  minWorking?: number
  minSuggested?: number
  minAvoid?: number
  maxRetries?: number
}

type CanonicalType = 'food' | 'supplement' | 'exercise' | 'medication' | 'other'

interface ClassificationEntry {
  name: string
  reason?: string | null
}

interface ClassifiedItem {
  name: string
  canonicalType: CanonicalType
  inDomain: boolean
  explanation?: string
}

export interface GeneratedCandidateItem {
  name: string
  candidateType: CanonicalType
  bucket: 'suggested' | 'avoid'
  reason: string
  protocol?: string | null
}

export async function generateSectionCandidates(params: {
  issueName: string
  issueSummary?: string | null
  profile?: LLMInputData['profile']
  mode: SectionMode
  count?: { suggested?: number; avoid?: number }
}): Promise<GeneratedCandidateItem[] | null> {
  const openai = getOpenAIClient()
  if (!openai) return null
  const suggested = Math.max(4, params.count?.suggested ?? 6)
  const avoid = Math.max(4, params.count?.avoid ?? 6)
  const user = `Write SECTION: ${params.mode} for issue "${params.issueName}".
Generate only two arrays: suggested and avoid. Each item must include: name, candidateType guess ∈ {food,supplement,exercise,medication,other}, reason (two sentences: mechanism + direct relevance), and optional protocol.
Counts: suggested≥${suggested}, avoid≥${avoid}.
Profile: ${JSON.stringify(params.profile ?? {}, null, 2)}
Return strict JSON {"suggested": [...], "avoid": [...]}`
  try {
    console.time(`[insights.genCandidates:${params.mode}]`)
    const response = await openai.chat.completions.create({
      model: DEFAULT_INSIGHTS_MODEL,
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You propose domain-appropriate items with concise clinical reasons. Output JSON only.' },
        { role: 'user', content: user },
      ],
    })
    console.timeEnd(`[insights.genCandidates:${params.mode}]`)
    const content = response.choices?.[0]?.message?.content
    if (!content) return null
    let json: any
    try {
      json = JSON.parse(content)
    } catch {
      const stripped = content.replace(/```[a-zA-Z]*\n?|```/g, '').trim()
      const objMatch = stripped.match(/\{[\s\S]*\}/)
      if (!objMatch) return null
      json = JSON.parse(objMatch[0])
    }
    const all: GeneratedCandidateItem[] = []
    const pushItems = (arr: any[], bucket: 'suggested' | 'avoid') => {
      for (const it of Array.isArray(arr) ? arr : []) {
        if (!it || typeof it.name !== 'string' || typeof it.reason !== 'string') continue
        const ct = typeof it.candidateType === 'string' ? String(it.candidateType).toLowerCase() : 'other'
        const canonicalType: CanonicalType =
          ct === 'food' || ct === 'supplement' || ct === 'exercise' || ct === 'medication' ? (ct as CanonicalType) : 'other'
        all.push({
          name: it.name,
          candidateType: canonicalType,
          bucket,
          reason: it.reason,
          protocol: typeof it.protocol === 'string' ? it.protocol : null,
        })
      }
    }
    pushItems(json?.suggested, 'suggested')
    pushItems(json?.avoid, 'avoid')
    return all
  } catch (error) {
    console.warn('[insights.llm] generateSectionCandidates error', error)
    return null
  }
}

function allowedCanonicalTypesForMode(mode: SectionMode): Set<CanonicalType> | null {
  switch (mode) {
    case 'nutrition':
      return new Set<CanonicalType>(['food'])
    case 'exercise':
      return new Set<CanonicalType>(['exercise'])
    case 'supplements':
      return new Set<CanonicalType>(['supplement'])
    case 'medications':
      return new Set<CanonicalType>(['medication'])
    default:
      return null // no strict filtering for lifestyle/labs
  }
}

function meetsMinimums(
  data: SectionLLMResult,
  { minWorking, minSuggested, minAvoid }: { minWorking: number; minSuggested: number; minAvoid: number }
) {
  const workingOk = minWorking === 0 || data.working.length >= minWorking
  const suggestedOk = data.suggested.length >= minSuggested
  const avoidOk = data.avoid.length >= minAvoid
  return workingOk && suggestedOk && avoidOk
}

function scoreCandidate(data: SectionLLMResult) {
  // Weight suggested/avoid slightly higher because they matter most for actionability.
  return data.working.length * 2 + data.suggested.length * 3 + data.avoid.length * 3 + data.recommendations.length
}

interface RepairArgs {
  openai: any
  mode: SectionMode
  issueName: string
  issueSummary?: string | null
  minWorking: number
  minSuggested: number
  minAvoid: number
  focusItems: Array<{ name: string; dosage?: string | null; timing?: string[] | null }>
  otherItems: Array<{ name: string; dosage?: string | null }>
  profile?: LLMInputData['profile']
  previous: SectionLLMResult
}

async function repairLLMOutput({
  openai,
  mode,
  issueName,
  issueSummary,
  minWorking,
  minSuggested,
  minAvoid,
  focusItems,
  otherItems,
  profile,
  previous,
}: RepairArgs): Promise<SectionLLMResult | null> {
  try {
    const repairPrompt = `
You produced the following JSON guidance for "${issueName}" but it failed minimum coverage requirements. Revise it so every bucket meets the minimum counts.

Previous JSON:
${JSON.stringify(previous, null, 2)}

Context (focus items, other items, profile):
${JSON.stringify({ focusItems, otherItems, profile: profile ?? {} }, null, 2)}

Mode guidance:
${modeGuidance(mode)}

Issue summary:
${issueSummary ?? 'Not supplied.'}

Requirements:
- Suggested must contain at least ${minSuggested} unique items (not in focusItems unless altering protocol).
- Avoid must contain at least ${minAvoid} items relevant to ${issueName}.
- ${minWorking === 0 ? 'Working can remain empty if no focusItems support the issue, but explain why in the summary.' : `Working must contain at least ${minWorking} logged items when appropriate.`}
- Every reason must be two sentences: first sentence = mechanism; second sentence = direct relevance/action (include dose/timing when useful).
- Keep strictly to the JSON schema used previously (no additional keys).
- If data is sparse, rely on best-practice clinician guidance for ${issueName}; do not fabricate patient-specific logs.
`

    const response = await openai.chat.completions.create({
      model: DEFAULT_INSIGHTS_MODEL,
      temperature: 0.05,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a careful clinical decision support assistant. Adjust prior guidance to meet explicit minimum requirements without omitting important safety details.',
        },
        {
          role: 'user',
          content: repairPrompt,
        },
      ],
    })
    const content = response.choices?.[0]?.message?.content
    if (!content) return null

    let json: unknown
    try {
      json = JSON.parse(content)
    } catch {
      const stripped = content.replace(/```[a-zA-Z]*\n?|```/g, '').trim()
      const objMatch = stripped.match(/\{[\s\S]*\}/)
      if (!objMatch) {
        console.warn('[insights.llm] Repair pass failed to locate JSON object', { content })
        return null
      }
      try {
        json = JSON.parse(objMatch[0])
      } catch (parseError) {
        console.warn('[insights.llm] Repair pass JSON parse failed', { content })
        return null
      }
    }

    const parsed = llmSectionSchema.safeParse(json)
    if (!parsed.success) {
      console.warn('[insights.llm] Repair pass produced invalid JSON', { issues: parsed.error.issues, content })
      return null
    }
    return parsed.data
  } catch (error) {
    console.error('[insights.llm] Repair pass failed', error)
    return null
  }
}

function modeGuidance(mode: SectionMode) {
  switch (mode) {
    case 'supplements':
      return 'Evaluate supplements only (herbs, vitamins, nutraceuticals). Identify which logged supplements are truly helpful for the issue, which novel additions to discuss with a clinician, and which supplements people with this issue should avoid or monitor. Never include alcohol, foods, or lifestyle items in this section.'
    case 'medications':
      return 'Evaluate prescription and OTC pharmaceutical therapies only (no supplements, herbs, nutraceuticals, or vitamins). Highlight medications that are supporting the issue, medication additions to discuss with a prescriber, and medications that warrant caution or avoidance.'
    case 'exercise':
      return 'Evaluate exercise and movement patterns. Highlight the training that supports this issue, recommended additions, and activities/protocols to limit or avoid.'
    case 'nutrition':
      return 'Evaluate nutrition patterns using foods, meals, or dietary patterns only. Do not mention supplements or pills. Highlight foods/meals that help, additions to include, and foods or dietary approaches to avoid for this issue. Only mark "working" foods that are present in focusItems.'
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

You MUST audit every item in focusItems (the user's logged items). For each:
- If it supports the issue, include it in "working" with a mechanism-based reason and optional dose/timing.
- If it warrants caution for this issue, include it in "avoid" with a short clinical rationale.
- If it is neutral/irrelevant, you may omit it (do not put in suggested).

STRICT RULES:
- Prioritise logged items: if a focusItem is plausibly supportive for the issue, include it in "working" using the exact name from focusItems and provide rationale.
- Supplements mode: only include supplements/herbs/nutraceuticals. Never include alcohol, foods, or lifestyle items in any bucket.
- Nutrition mode: only mark foods as "working" if they appear in focusItems. Use suggested/avoid for novel foods.
- Reasons must include mechanism + relevance; add dose/timing or execution guidance where appropriate.
- If focusItems is empty or none are supportive, "working" may be empty, but clearly explain the gap in the summary.
- Even if user data is sparse, you MUST still populate "suggested" and "avoid" to the minimum counts using widely accepted best practice for ${issueName}. Never respond with "everything covered."

Classify findings into three buckets: working (helpful/supportive today), suggested (worth discussing with clinician to add), avoid (risky or counterproductive). Always provide detailed clinical reasons (two sentences: mechanism + direct issue relevance/action). ${guidanceFocus}
Ensure the suggested array contains at least ${minSuggested} unique entries that are not already in the focusItems list, and avoid duplicating any names from focusItems unless you are recommending a changed protocol. Provide concise but specific reasons (mechanism + relevance) and include dosing/timing where appropriate.

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
    ? `You must output at least ${minWorking} working item(s)${minWorking === 0 ? ' (it is acceptable for working to stay empty only if no focusItems are supportive)' : ''}, ${minSuggested} suggested item(s), and ${minAvoid} avoid item(s). Suggested items must not duplicate any names already present in focusItems or otherItems. If logged data is sparse, rely on clinician-grade best-practice guidance for ${issueName} rather than saying everything is covered. Keep every reason to exactly two sentences (mechanism + actionable relevance with dose/timing when helpful).`
    : ''

  // Add targeted domain rules for specific issues
  const loweredIssue = issueName.toLowerCase()
  const libidoRules = loweredIssue.includes('libido') || loweredIssue.includes('erection')
    ? `\nIssue-specific rules for libido:\n- Consider sex, age, weight/height, and training frequency when assessing androgen status and arousal.\n- Evaluate mechanisms: testosterone/DHT, nitric oxide/endothelial function, SHBG, stress/cortisol, sleep.\n- When focusItems include botanicals commonly discussed for libido (e.g., Tongkat Ali, Cistanche, Muira Puama), assess them and include in "working" if supportive with rationale; otherwise omit without moving them to suggested.\n- For males, flag 5-alpha-reductase inhibitors (e.g., saw palmetto) as potential libido-reducing; explain the DHT rationale and advise clinician discussion.\n- Provide concrete protocols where possible (e.g., dosing ranges/timing windows).\n`
    : ''

  return `${header}\n\nIssue summary: ${issueSummary ?? 'Not supplied.'}\n\nUser context (JSON):\n${userContext}\n\n${baseGuidance}\n${libidoRules}${forceNote}`
}

function uniqueByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const it of items) {
    const key = it.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

async function classifyCandidatesForSection(params: {
  openai: any
  issueName: string
  mode: SectionMode
  items: ClassificationEntry[]
  trace: string
}): Promise<ClassifiedItem[] | null> {
  const { openai, issueName, mode, items, trace } = params
  if (!items.length) return []
  try {
    const system = 'You are a precise classifier. For each item, assign a canonicalType and whether it is in-domain for the requested section. Output strict JSON.'
    const user = `Classify the following items for issue "${issueName}" in SECTION: ${mode}.

Return JSON with an array under key "items"; each element: {"name": string, "canonicalType": one of [food,supplement,exercise,medication,other], "inDomain": boolean, "explanation": string}.

Items:\n${JSON.stringify(items, null, 2)}`

    console.time(`${trace}:classify`)
    const response = await openai.chat.completions.create({
      model: DEFAULT_INSIGHTS_MODEL,
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
    console.timeEnd(`${trace}:classify`)

    const content = response.choices?.[0]?.message?.content
    if (!content) return null
    let json: any
    try {
      json = JSON.parse(content)
    } catch {
      const stripped = content.replace(/```[a-zA-Z]*\n?|```/g, '').trim()
      const objMatch = stripped.match(/\{[\s\S]*\}/)
      if (!objMatch) return null
      json = JSON.parse(objMatch[0])
    }
    const out = Array.isArray(json?.items) ? json.items : []
    return out
      .filter((it: any) => it && typeof it.name === 'string')
      .map((it: any) => ({
        name: String(it.name),
        canonicalType: (it.canonicalType as CanonicalType) ?? 'other',
        inDomain: Boolean(it.inDomain),
        explanation: typeof it.explanation === 'string' ? it.explanation : undefined,
      }))
  } catch (error) {
    console.warn('[insights.llm] classifyCandidatesForSection error', error)
    return null
  }
}

async function rewriteCandidatesToDomain(params: {
  openai: any
  issueName: string
  mode: SectionMode
  bucket: 'suggested' | 'avoid'
  expectedType: CanonicalType | null
  items: Array<{ name: string; reason: string }>
  attempts?: number
  trace: string
}): Promise<Array<{ name: string; reason: string }> | null> {
  const { openai, issueName, mode, bucket, expectedType, items, attempts = 2, trace } = params
  if (!items.length) return []
  const typeText = expectedType ? `${expectedType}` : 'the section domain'
  let tries = 0
  while (tries < attempts) {
    tries += 1
    try {
      console.time(`${trace}:rewrite-${bucket}#${tries}`)
      const response = await openai.chat.completions.create({
        model: DEFAULT_INSIGHTS_MODEL,
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Rewrite items into the requested domain. Output strict JSON only.' },
          {
            role: 'user',
            content:
              `For issue "${issueName}", SECTION: ${mode}. Some ${bucket} items are out-of-domain. Rewrite each into domain-conforming items that are strictly of type ${typeText}. Keep mechanisms relevant to ${issueName}. Return JSON {"items": Array<{"name": string, "reason": string}>}.

Items to rewrite:\n${JSON.stringify(items, null, 2)}`,
          },
        ],
      })
      console.timeEnd(`${trace}:rewrite-${bucket}#${tries}`)
      const content = response.choices?.[0]?.message?.content
      if (!content) continue
      let json: any
      try {
        json = JSON.parse(content)
      } catch {
        const stripped = content.replace(/```[a-zA-Z]*\n?|```/g, '').trim()
        const objMatch = stripped.match(/\{[\s\S]*\}/)
        if (!objMatch) continue
        json = JSON.parse(objMatch[0])
      }
      const out = Array.isArray(json?.items) ? json.items : []
      const cleaned = out
        .filter((it: any) => it && typeof it.name === 'string' && typeof it.reason === 'string')
        .map((it: any) => ({ name: it.name, reason: it.reason }))
      return cleaned
    } catch (error) {
      console.warn('[insights.llm] rewriteCandidatesToDomain error', error)
    }
  }
  return null
}

async function fillMissingItemsForSection(params: {
  openai: any
  issueName: string
  mode: SectionMode
  bucket: 'suggested' | 'avoid'
  expectedType: CanonicalType | null
  needed: number
  disallowNames: string[]
  trace: string
}): Promise<Array<{ name: string; reason: string; protocol?: string | null }> | null> {
  const { openai, issueName, mode, bucket, expectedType, needed, disallowNames, trace } = params
  if (needed <= 0) return []
  const typeText = expectedType ? `that are strictly of type ${expectedType}` : 'that fit the section domain'
  const diversityHint = (() => {
    switch (mode) {
      case 'nutrition':
        return 'Ensure diversity across macro groups (protein sources, high-fiber foods, low-sugar options, low-sodium choices).'
      case 'exercise':
        return 'Ensure diversity across modalities (aerobic, strength, mobility/rehab).'
      case 'supplements':
      case 'medications':
        return 'Ensure diversity across compound classes and include appropriate safety considerations.'
      default:
        return ''
    }
  })()
  const prompt = `We need ${needed} more items for SECTION: ${mode}, bucket: ${bucket}, for issue "${issueName}" ${typeText}.
Return JSON: {"items": Array<{"name": string, "reason": string, "protocol"?: string|null}>}.
Avoid any of these names (case-insensitive): ${disallowNames.join(', ') || 'None'}.
Each reason must be two sentences: mechanism + direct relevance/action.
${diversityHint}`

  try {
    console.time(`${trace}:fill-${bucket}`)
    const response = await openai.chat.completions.create({
      model: DEFAULT_INSIGHTS_MODEL,
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You generate concise, clinically-relevant items. Output strict JSON only.' },
        { role: 'user', content: prompt },
      ],
    })
    console.timeEnd(`${trace}:fill-${bucket}`)
    const content = response.choices?.[0]?.message?.content
    if (!content) return null
    let json: any
    try {
      json = JSON.parse(content)
    } catch {
      const stripped = content.replace(/```[a-zA-Z]*\n?|```/g, '').trim()
      const objMatch = stripped.match(/\{[\s\S]*\}/)
      if (!objMatch) return null
      json = JSON.parse(objMatch[0])
    }
    const items = Array.isArray(json?.items) ? json.items : []
    return items
      .filter((it: any) => it && typeof it.name === 'string' && typeof it.reason === 'string')
      .map((it: any) => ({ name: it.name, reason: it.reason, protocol: it.protocol ?? null }))
  } catch (error) {
    console.warn('[insights.llm] fillMissingItemsForSection error', error)
    return null
  }
}

export async function generateDegradedSection(
  input: LLMInputData,
  options: { minSuggested?: number; minAvoid?: number } = {}
): Promise<SectionLLMResult | null> {
  const openai = getOpenAIClient()
  if (!openai) return null
  const minSuggested = Math.max(4, options.minSuggested ?? 4)
  const minAvoid = Math.max(4, options.minAvoid ?? 4)
  const typeSet = allowedCanonicalTypesForMode(input.mode)
  const expected: CanonicalType | null = typeSet ? Array.from(typeSet)[0] : null
  const trace = `[insights:degraded:${input.mode}:${Math.random().toString(36).slice(2, 8)}]`
  let generateMs = 0
  let classifyMs = 0
  let fillMs = 0
  let rewriteMs = 0

  try {
    const user = `For issue "${input.issueName}", SECTION: ${input.mode}. Data may be sparse.
Generate minimally valid guidance with ONLY in-domain items. Output JSON with keys suggested and avoid only; working may be empty. Each item: name, reason (two sentences), optional protocol.
Counts: suggested≥${minSuggested}, avoid≥${minAvoid}.`
    const g0 = Date.now()
    console.time(`${trace}:generate`)
    const resp = await openai.chat.completions.create({
      model: DEFAULT_INSIGHTS_MODEL,
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Produce domain-correct, concise items. Output JSON only.' },
        { role: 'user', content: user },
      ],
    })
    console.timeEnd(`${trace}:generate`)
    generateMs += Date.now() - g0
    const content = resp.choices?.[0]?.message?.content
    if (!content) return null
    let json: any
    try {
      json = JSON.parse(content)
    } catch {
      const stripped = content.replace(/```[a-zA-Z]*\n?|```/g, '').trim()
      const objMatch = stripped.match(/\{[\s\S]*\}/)
      if (!objMatch) return null
      json = JSON.parse(objMatch[0])
    }
    const base: SectionLLMResult = {
      summary: 'Initial guidance generated while we prepare a deeper report.',
      working: [],
      suggested: Array.isArray(json?.suggested) ? json.suggested : [],
      avoid: Array.isArray(json?.avoid) ? json.avoid : [],
      recommendations: [],
    }
    // Classify and keep only expected domain
    const itemsForClassification: ClassificationEntry[] = [
      ...base.suggested.map((s) => ({ name: s.name, reason: s.reason })),
      ...base.avoid.map((a) => ({ name: a.name, reason: a.reason })),
    ]
    const c0 = Date.now()
    const classified = await classifyCandidatesForSection({
      openai,
      issueName: input.issueName,
      mode: input.mode,
      items: itemsForClassification,
      trace,
    })
    classifyMs += Date.now() - c0
    const typeMap = new Map<string, CanonicalType>()
    for (const it of classified ?? []) {
      typeMap.set(it.name.trim().toLowerCase(), it.canonicalType)
    }
    const keep = (name: string) => {
      const t = typeMap.get(name.trim().toLowerCase())
      return expected ? t === expected : true
    }
    let suggested = base.suggested.filter((s) => keep(s.name))
    let avoid = base.avoid.filter((a) => keep(a.name))
    // Top up if still short
    const disallow = [
      ...suggested.map((s) => s.name),
      ...avoid.map((a) => a.name),
    ]
    const needSuggested = Math.max(0, minSuggested - suggested.length)
    if (needSuggested > 0) {
      const f0 = Date.now()
      const more = await fillMissingItemsForSection({
        openai,
        issueName: input.issueName,
        mode: input.mode,
        bucket: 'suggested',
        expectedType: expected,
        needed: needSuggested,
        disallowNames: disallow,
        trace,
      })
      fillMs += Date.now() - f0
      suggested = uniqueByName([...suggested, ...(more ?? [])])
    }
    const needAvoid = Math.max(0, minAvoid - avoid.length)
    if (needAvoid > 0) {
      const f1 = Date.now()
      const more = await fillMissingItemsForSection({
        openai,
        issueName: input.issueName,
        mode: input.mode,
        bucket: 'avoid',
        expectedType: expected,
        needed: needAvoid,
        disallowNames: [
          ...suggested.map((s) => s.name),
          ...avoid.map((a) => a.name),
        ],
        trace,
      })
      fillMs += Date.now() - f1
      avoid = uniqueByName([...avoid, ...(more ?? [])])
    }
    const out: SectionLLMResult = {
      summary: base.summary,
      working: [],
      suggested,
      avoid,
      recommendations: [],
    }
    ;(out as any)._timings = {
      generateMs,
      classifyMs,
      rewriteMs,
      fillMs,
      totalMs: generateMs + classifyMs + rewriteMs + fillMs,
    }
    return out
  } catch (error) {
    console.warn('[insights.llm] generateDegradedSection error', error)
    return null
  }
}

// Quick degraded generator: single-pass candidate generation filtered to the expected domain.
// Designed for fast first-paint. Uses only one LLM call and avoids repair/classify loops.
export async function generateDegradedSectionQuick(
  input: LLMInputData,
  options: { minSuggested?: number; minAvoid?: number } = {}
): Promise<SectionLLMResult | null> {
  const minSuggested = Math.max(4, options.minSuggested ?? 4)
  const minAvoid = Math.max(4, options.minAvoid ?? 4)

  try {
    const expectedSet = allowedCanonicalTypesForMode(input.mode)
    const expected: CanonicalType | null = expectedSet ? Array.from(expectedSet)[0] : null
    const candidates = await generateSectionCandidates({
      issueName: input.issueName,
      issueSummary: input.issueSummary,
      profile: input.profile,
      mode: input.mode,
      count: { suggested: Math.max(6, minSuggested), avoid: Math.max(6, minAvoid) },
    })
    if (!candidates) return null

    const keep = (ct: CanonicalType) => (expected ? ct === expected : true)
    const suggested = candidates
      .filter((c) => c.bucket === 'suggested' && keep(c.candidateType))
      .slice(0, Math.max(minSuggested, 6))
      .map((c) => ({ name: c.name, reason: c.reason, protocol: c.protocol ?? null }))
    const avoid = candidates
      .filter((c) => c.bucket === 'avoid' && keep(c.candidateType))
      .slice(0, Math.max(minAvoid, 6))
      .map((c) => ({ name: c.name, reason: c.reason }))

    // Ensure minimum counts by truncation fallback (should already meet due to counts above)
    const finalSuggested = suggested.slice(0, Math.max(minSuggested, 4))
    const finalAvoid = avoid.slice(0, Math.max(minAvoid, 4))

    return {
      summary: 'Initial guidance generated while we prepare a deeper report.',
      working: [],
      suggested: finalSuggested,
      avoid: finalAvoid,
      recommendations: [],
    }
  } catch (error) {
    console.warn('[insights.llm] generateDegradedSectionQuick error', error)
    return null
  }
}

// Strict quick degraded generator: larger candidate request with tighter domain guardrails.
export async function generateDegradedSectionQuickStrict(
  input: LLMInputData,
  options: { minSuggested?: number; minAvoid?: number } = {}
): Promise<SectionLLMResult | null> {
  const minSuggested = Math.max(4, options.minSuggested ?? 4)
  const minAvoid = Math.max(4, options.minAvoid ?? 4)
  try {
    const expectedSet = allowedCanonicalTypesForMode(input.mode)
    const expected: CanonicalType | null = expectedSet ? Array.from(expectedSet)[0] : null
    const candidates = await generateSectionCandidates({
      issueName: input.issueName,
      issueSummary: input.issueSummary,
      profile: input.profile,
      mode: input.mode,
      count: { suggested: Math.max(10, minSuggested), avoid: Math.max(10, minAvoid) },
    })
    if (!candidates) return null
    const keep = (ct: CanonicalType) => (expected ? ct === expected : true)
    const suggested = candidates
      .filter((c) => c.bucket === 'suggested' && keep(c.candidateType))
      .slice(0, Math.max(minSuggested, 10))
      .map((c) => ({ name: c.name, reason: c.reason, protocol: c.protocol ?? null }))
    const avoid = candidates
      .filter((c) => c.bucket === 'avoid' && keep(c.candidateType))
      .slice(0, Math.max(minAvoid, 10))
      .map((c) => ({ name: c.name, reason: c.reason }))
    const finalSuggested = suggested.slice(0, Math.max(minSuggested, 4))
    const finalAvoid = avoid.slice(0, Math.max(minAvoid, 4))
    return {
      summary: 'Initial guidance generated while we prepare a deeper report.',
      working: [],
      suggested: finalSuggested,
      avoid: finalAvoid,
      recommendations: [],
    }
  } catch (error) {
    console.warn('[insights.llm] generateDegradedSectionQuickStrict error', error)
    return null
  }
}

export async function generateSectionInsightsFromLLM(
  input: LLMInputData,
  options: LLMOptions = {}
): Promise<SectionLLMResult | null> {
  const openai = getOpenAIClient()
  if (!openai) {
    return null
  }

  const focusItems = (input.items ?? []).slice(0, 8)
  const otherItems = (input.otherItems ?? []).slice(0, 6)
  const minWorking = options.minWorking ?? (focusItems.length > 0 ? 1 : 0)
  const minSuggested = options.minSuggested ?? 4
  const minAvoid = options.minAvoid ?? 4
  const maxRetries = options.maxRetries ?? 3

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

  let generateMs = 0
  let classifyMs = 0
  let rewriteMs = 0
  let fillMs = 0
  let generateAttempts = 0
  let bestCandidate: { result: SectionLLMResult; score: number; metMinimums: boolean } | null = null
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
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
      const g0 = Date.now()
      console.time(`[insights.gen:${input.mode}]`)
      const response = await openai.chat.completions.create({
        model: DEFAULT_INSIGHTS_MODEL,
        temperature: 0.05,
        max_tokens: 650,
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
      console.timeEnd(`[insights.gen:${input.mode}]`)
      const elapsed = Date.now() - g0
      generateMs += elapsed
      generateAttempts = attempt + 1

      const content = response.choices?.[0]?.message?.content
      if (!content) {
        continue
      }

      let json: unknown
      try {
        json = JSON.parse(content)
      } catch (parseError) {
        // Attempt a salvage parse: strip code fences and extract the first JSON object
        const stripped = content.replace(/```[a-zA-Z]*\n?|```/g, '').trim()
        const objMatch = stripped.match(/\{[\s\S]*\}/)
        if (objMatch) {
          try {
            json = JSON.parse(objMatch[0])
          } catch (e) {
            console.warn('[insights.llm] Salvage parse failed', { content })
            throw parseError
          }
        } else {
          console.warn('[insights.llm] Failed to parse JSON content', { content })
          throw parseError
        }
      }

      const parsed = llmSectionSchema.safeParse(json)
      if (!parsed.success) {
        console.warn('[insights.llm] Invalid LLM JSON', {
          issues: parsed.error.issues,
          content,
        })
        continue
      }

      const data = parsed.data
      const meets = meetsMinimums(data, { minWorking, minSuggested, minAvoid })
      const score = scoreCandidate(data)
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { result: data, score, metMinimums: meets }
      }
      if (meets) {
        break
      }
    } catch (error) {
      console.error('[insights.llm] Failed to fetch LLM output', error)
    }
  }

  // Stage 2: classification + fill-missing over the best candidate (with one repair attempt if needed)
  const trace = `[insights:${input.mode}:${Math.random().toString(36).slice(2, 8)}]`
  let base: SectionLLMResult | null = bestCandidate?.result ?? null
  if (base && !bestCandidate?.metMinimums) {
    const r0 = Date.now()
    const repaired = await repairLLMOutput({
      openai,
      mode: input.mode,
      issueName: input.issueName,
      issueSummary: input.issueSummary,
      minWorking,
      minSuggested,
      minAvoid,
      focusItems,
      otherItems,
      profile: input.profile,
      previous: base,
    })
    generateMs += Date.now() - r0
    if (repaired) base = repaired
  }

  if (!base) return null

  const allowed = allowedCanonicalTypesForMode(input.mode)
  let working = base.working.slice()
  let suggested = base.suggested.slice()
  let avoid = base.avoid.slice()

  console.log('[insights.llm] pre-classify counts', {
    mode: input.mode,
    working: working.length,
    suggested: suggested.length,
    avoid: avoid.length,
  })

  if (allowed) {
    const itemsForClassification: ClassificationEntry[] = [
      ...working.map((w) => ({ name: w.name, reason: w.reason })),
      ...suggested.map((s) => ({ name: s.name, reason: s.reason })),
      ...avoid.map((a) => ({ name: a.name, reason: a.reason })),
    ]
    const c0 = Date.now()
    const classified = await classifyCandidatesForSection({
      openai,
      issueName: input.issueName,
      mode: input.mode,
      items: itemsForClassification,
      trace,
    })
    classifyMs += Date.now() - c0
    const typeMap = new Map<string, CanonicalType>()
    for (const it of classified ?? []) {
      typeMap.set(it.name.trim().toLowerCase(), it.canonicalType)
    }

    const keep = (name: string) => {
      const key = name.trim().toLowerCase()
      const t = typeMap.get(key)
      if (!t) return false
      return allowed.has(t)
    }

    const droppedWorking = working.filter((w) => !keep(w.name))
    const droppedSuggested = suggested.filter((s) => !keep(s.name))
    const droppedAvoid = avoid.filter((a) => !keep(a.name))
    working = working.filter((w) => keep(w.name))
    suggested = suggested.filter((s) => keep(s.name))
    avoid = avoid.filter((a) => keep(a.name))

    console.log('[insights.llm] post-classify counts', {
      mode: input.mode,
      working: working.length,
      suggested: suggested.length,
      avoid: avoid.length,
    })

    // Rewrite out-of-domain candidates into the correct domain, then re-classify
    if (droppedSuggested.length) {
      const rw0 = Date.now()
      const rewritten = await rewriteCandidatesToDomain({
        openai,
        issueName: input.issueName,
        mode: input.mode,
        bucket: 'suggested',
        expectedType: Array.from(allowed)[0] ?? null,
        items: droppedSuggested.map((it) => ({ name: it.name, reason: it.reason })),
        attempts: 2,
        trace,
      })
      rewriteMs += Date.now() - rw0
      if (rewritten?.length) {
        const cc0 = Date.now()
        const reClassified = await classifyCandidatesForSection({
          openai,
          issueName: input.issueName,
          mode: input.mode,
          items: rewritten.map((m) => ({ name: m.name, reason: m.reason })),
          trace,
        })
        classifyMs += Date.now() - cc0
        const filtered = (reClassified ?? [])
          .filter((it) => allowed.has(it.canonicalType))
          .map((it) => {
            const src = rewritten.find((m) => m.name.trim().toLowerCase() === it.name.trim().toLowerCase())!
            return { name: src.name, reason: src.reason, protocol: null as string | null }
          })
        suggested = uniqueByName([...suggested, ...filtered])
      }
    }
    if (droppedAvoid.length) {
      const rw1 = Date.now()
      const rewritten = await rewriteCandidatesToDomain({
        openai,
        issueName: input.issueName,
        mode: input.mode,
        bucket: 'avoid',
        expectedType: Array.from(allowed)[0] ?? null,
        items: droppedAvoid.map((it) => ({ name: it.name, reason: it.reason })),
        attempts: 2,
        trace,
      })
      rewriteMs += Date.now() - rw1
      if (rewritten?.length) {
        const cc1 = Date.now()
        const reClassified = await classifyCandidatesForSection({
          openai,
          issueName: input.issueName,
          mode: input.mode,
          items: rewritten.map((m) => ({ name: m.name, reason: m.reason })),
          trace,
        })
        classifyMs += Date.now() - cc1
        const filtered = (reClassified ?? [])
          .filter((it) => allowed.has(it.canonicalType))
          .map((it) => {
            const src = rewritten.find((m) => m.name.trim().toLowerCase() === it.name.trim().toLowerCase())!
            return { name: src.name, reason: src.reason, protocol: null as string | null }
          })
        avoid = uniqueByName([...avoid, ...filtered])
      }
    }

    // Fill-missing up to 3 retries per bucket
    for (const bucket of ['suggested', 'avoid'] as const) {
      let attempts = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const need = bucket === 'suggested' ? Math.max(0, minSuggested - suggested.length) : Math.max(0, minAvoid - avoid.length)
        if (need <= 0 || attempts >= 3) break
        const disallow = [
          ...suggested.map((s) => s.name),
          ...avoid.map((a) => a.name),
          ...working.map((w) => w.name),
        ]
        const expected: CanonicalType | null = Array.from(allowed)[0] ?? null
        const f0 = Date.now()
        const more = await fillMissingItemsForSection({
          openai,
          issueName: input.issueName,
          mode: input.mode,
          bucket,
          expectedType: expected,
          needed: need,
          disallowNames: disallow,
          trace,
        })
        fillMs += Date.now() - f0
        attempts += 1
        if (!more || !more.length) break
        // classify the new items
        const c1 = Date.now()
        const moreClassified = await classifyCandidatesForSection({
          openai,
          issueName: input.issueName,
          mode: input.mode,
          items: more.map((m) => ({ name: m.name, reason: m.reason })),
          trace,
        })
        classifyMs += Date.now() - c1
        const filtered = (moreClassified ?? [])
          .filter((it) => allowed.has(it.canonicalType))
          .map((it) => {
            const src = more.find((m) => m.name.trim().toLowerCase() === it.name.trim().toLowerCase())!
            return { name: src.name, reason: src.reason, protocol: src.protocol ?? null }
          })
        if (bucket === 'suggested') {
          suggested = uniqueByName([...suggested, ...filtered])
        } else {
          avoid = uniqueByName([...avoid, ...filtered])
        }
        console.log('[insights.llm] fill-missing iteration', {
          mode: input.mode,
          bucket,
          added: filtered.length,
          suggested: suggested.length,
          avoid: avoid.length,
        })
      }
    }
  }

  const validated = suggested.length >= minSuggested && avoid.length >= minAvoid
  const final: SectionLLMResult = {
    summary: base.summary,
    working,
    suggested,
    avoid,
    recommendations: base.recommendations ?? [],
  }

  console.log('[insights.llm] final counts', {
    mode: input.mode,
    validated,
    working: final.working.length,
    suggested: final.suggested.length,
    avoid: final.avoid.length,
  })

  if (validated) {
    insightCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      result: final,
    })
  }
  // Attach timings for observability
  ;(final as any)._timings = {
    generateMs,
    classifyMs,
    rewriteMs,
    fillMs,
    totalMs: generateMs + classifyMs + rewriteMs + fillMs,
    attempts: {
      generate: generateAttempts,
    },
  }
  return final
}
