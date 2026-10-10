import 'server-only'
import type OpenAI from 'openai'
import type { Response, ResponseInput, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses'
import type { CompletionWithCost } from './metered-openai'
import { assertAiUsageAllowed } from './ai-safety'
import { costCentsForTokens } from './cost-meter'
import { HELFI_ANALYSIS_MODEL } from './ai-models'
import { HELFI_FOOD_PHOTO_MODEL, FOOD_PHOTO_MODEL_FEATURE, FOOD_PHOTO_COMPLETION_TOKENS } from './food-photo-model'

export type FoodBackgroundContext = {
  userId: string
  runId: string
  feature?: string | null
  timeoutMs?: number
}

type FoodBackgroundOptions = { timeoutMs?: number }

export type FoodBackgroundPoll =
  | { status: 'pending' }
  | { status: 'completed'; result: CompletionWithCost }
  | { status: 'failed'; error: string }

// These errors contain fixed codes only: provider errors can contain private
// image URLs, prompts or request details, so do not expose their messages.
export class FoodPhotoBackgroundError extends Error {
  constructor(public code: string, public status = 502) {
    super(code)
    this.name = 'FoodPhotoBackgroundError'
  }
}

function fail(code: string, status = 502): never {
  throw new FoodPhotoBackgroundError(code, status)
}

/** Convert the existing analyzer's messages without losing images or instructions. */
export function foodPhotoMessagesToInput(messages: unknown): ResponseInput {
  if (!Array.isArray(messages) || !messages.length) fail('food_background_invalid_messages', 400)
  return messages.map((message: any) => {
    if (!message || !['system', 'developer', 'user', 'assistant'].includes(message.role) ||
        message.tool_calls || message.function_call || message.name) {
      fail('food_background_unsupported_message', 400)
    }
    if (typeof message.content === 'string') return { role: message.role, content: message.content }
    if (!Array.isArray(message.content) || !message.content.length) fail('food_background_invalid_content', 400)
    const content = message.content.map((part: any) => {
      if (part?.type === 'text' && typeof part.text === 'string') return { type: 'input_text', text: part.text }
      if (part?.type === 'image_url' && typeof part.image_url?.url === 'string' && part.image_url.url.trim()) {
        const detail = part.image_url.detail ?? 'auto'
        if (!['auto', 'low', 'high'].includes(detail) || message.role !== 'user') {
          fail('food_background_unsupported_image', 400)
        }
        return { type: 'input_image', image_url: part.image_url.url, detail }
      }
      fail('food_background_unsupported_content', 400)
    })
    return { role: message.role, content }
  }) as ResponseInput
}

function approvedModel(model: unknown): string {
  if (typeof model !== 'string') fail('food_background_invalid_model')
  for (const base of [HELFI_FOOD_PHOTO_MODEL, HELFI_ANALYSIS_MODEL]) {
    if (model === base || model.startsWith(base + '-')) return base
  }
  fail('food_background_invalid_model')
}

/** Only a complete, non-refused response with real usage can be charged. */
export function foodBackgroundResponseToCompletion(response: Response): CompletionWithCost {
  if (response.status === 'queued' || response.status === 'in_progress') fail('food_background_pending', 202)
  if (response.status !== 'completed') fail('food_background_' + (
    ['failed', 'cancelled', 'incomplete'].includes(response.status || '') ? response.status : 'invalid_status'))
  const model = approvedModel(response.model)
  if (!Array.isArray(response.output)) fail('food_background_invalid_output')
  const texts: string[] = []
  for (const item of response.output) {
    if (item.type === 'reasoning') continue
    if (item.type !== 'message' || item.role !== 'assistant' || item.status !== 'completed') {
      fail('food_background_invalid_output')
    }
    for (const part of item.content) {
      if (part.type === 'refusal') fail('food_background_refused')
      if (part.type !== 'output_text' || typeof part.text !== 'string') fail('food_background_invalid_output')
      texts.push(part.text)
    }
  }
  const text = texts.join('\n')
  if (!text.trim()) fail('food_background_empty_output')
  const usage = response.usage
  if (!usage || ![usage.input_tokens, usage.output_tokens, usage.total_tokens]
      .every(value => Number.isSafeInteger(value) && value >= 0) ||
      usage.total_tokens !== usage.input_tokens + usage.output_tokens || usage.total_tokens === 0) {
    fail('food_background_invalid_usage')
  }
  // output_tokens already includes reasoning tokens; never add them again.
  const promptTokens = usage.input_tokens
  const completionTokens = usage.output_tokens
  return {
    completion: {
      id: response.id,
      object: 'chat.completion',
      created: response.created_at,
      model: response.model,
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: usage.total_tokens },
    },
    costCents: costCentsForTokens(model, { promptTokens, completionTokens }),
    promptTokens,
    completionTokens,
  }
}

function safeProviderError(error: any, operation: 'start' | 'retrieve' | 'cancel'): FoodPhotoBackgroundError {
  const status = Number(error?.status)
  if (operation === 'retrieve' && status === 404) return new FoodPhotoBackgroundError('food_background_expired', 410)
  if (status === 429) return new FoodPhotoBackgroundError('food_background_rate_limit', 429)
  if (status === 401 || status === 403) return new FoodPhotoBackgroundError('food_background_provider_access', 502)
  if (status === 400) return new FoodPhotoBackgroundError('food_background_provider_rejected', 502)
  // A failed create transport does not prove that the provider rejected the
  // request. The durable job must not blindly resubmit this unknown outcome.
  return new FoodPhotoBackgroundError('food_background_' + operation + '_uncertain', 503)
}

function validateResponseId(responseId: string): void {
  if (typeof responseId !== 'string' || !/^resp_[A-Za-z0-9_-]{1,250}$/.test(responseId)) {
    fail('food_background_invalid_response_id', 400)
  }
}

function sdkOptions(options: FoodBackgroundOptions = {}) {
  const timeout = options.timeoutMs ?? 8000
  if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 8000) {
    fail('food_background_invalid_timeout', 400)
  }
  return { timeout, maxRetries: 0 }
}

/** Caller must persist the job and enforce account ownership before every call. */
export async function startFoodBackgroundCompletion(
  openai: OpenAI,
  params: any,
  context: FoodBackgroundContext,
): Promise<{ responseId: string }> {
  if (typeof context?.userId !== 'string' || !context.userId.trim() ||
      typeof context.runId !== 'string' || !/^[A-Za-z0-9:_-]{1,200}$/.test(context.runId)) {
    fail('food_background_missing_context', 400)
  }
  const options = sdkOptions(context)
  if (!params || params.tools || params.tool_choice || params.functions || params.function_call ||
      params.audio || params.modalities || params.stream || (params.n != null && params.n !== 1)) {
    fail('food_background_unsupported_parameters', 400)
  }
  if (![HELFI_FOOD_PHOTO_MODEL, HELFI_ANALYSIS_MODEL].includes(params.model)) fail('food_background_invalid_model', 400)
  // Preserve the existing metered adapter's feature gate: 6.1 is food-only.
  const model = params.model === HELFI_FOOD_PHOTO_MODEL && context.feature === FOOD_PHOTO_MODEL_FEATURE
    ? HELFI_FOOD_PHOTO_MODEL : HELFI_ANALYSIS_MODEL
  const cap = params.max_completion_tokens ?? params.max_tokens ?? FOOD_PHOTO_COMPLETION_TOKENS
  if (!Number.isSafeInteger(cap) || cap <= 0) fail('food_background_invalid_token_cap', 400)
  const request: ResponseCreateParamsNonStreaming = {
    model,
    input: foodPhotoMessagesToInput(params.messages),
    background: true,
    store: false,
    stream: false,
    max_output_tokens: cap,
    // SDK 5.7 predates the supported 5.6 'none' value. Keep the cast confined
    // to that enum; no SDK or credential change is needed.
    reasoning: { effort: (model === HELFI_FOOD_PHOTO_MODEL ? 'low' : 'none') as 'low' },
  }
  const format = params.response_format
  if (format?.type === 'json_object' || format?.type === 'text') request.text = { format: { type: format.type } }
  else if (format?.type === 'json_schema' && format.json_schema &&
      typeof format.json_schema.name === 'string' && format.json_schema.schema &&
      typeof format.json_schema.schema === 'object') {
    request.text = { format: { type: 'json_schema', ...format.json_schema } }
  } else if (format != null) fail('food_background_unsupported_format', 400)
  // This runs for each new generation, including text-only repair stages.
  await assertAiUsageAllowed(context)
  let response: Response
  try {
    // The opaque persisted stage ID is an extra duplicate-request defense.
    // Responses idempotency support is not assumed: an ambiguous create must
    // still remain uncertain and must not be automatically submitted again.
    response = await openai.responses.create(request, { ...options, headers: { 'Idempotency-Key': context.runId } })
  } catch (error) {
    throw safeProviderError(error, 'start')
  }
  validateResponseId(response.id)
  return { responseId: response.id }
}

export async function retrieveFoodBackgroundCompletion(
  openai: OpenAI, responseId: string, options: FoodBackgroundOptions = {},
): Promise<FoodBackgroundPoll> {
  validateResponseId(responseId)
  const requestOptions = sdkOptions(options)
  let response: Response
  try {
    response = await openai.responses.retrieve(responseId, { stream: false }, requestOptions)
  } catch (error) {
    const safeError = safeProviderError(error, 'retrieve')
    if (safeError.code === 'food_background_expired') return { status: 'failed', error: safeError.code }
    throw safeError
  }
  if (response.id !== responseId) fail('food_background_response_mismatch')
  if (response.status === 'queued' || response.status === 'in_progress') return { status: 'pending' }
  try {
    return { status: 'completed', result: foodBackgroundResponseToCompletion(response) }
  } catch (error) {
    if (error instanceof FoodPhotoBackgroundError) return { status: 'failed', error: error.code }
    throw error
  }
}

export async function cancelFoodBackgroundCompletion(
  openai: OpenAI, responseId: string, options: FoodBackgroundOptions = {},
): Promise<void> {
  validateResponseId(responseId)
  const requestOptions = sdkOptions(options)
  // Do not require renewed AI-sharing permission to cancel an existing job.
  try {
    await openai.responses.cancel(responseId, requestOptions)
  } catch (error) {
    throw safeProviderError(error, 'cancel')
  }
}
