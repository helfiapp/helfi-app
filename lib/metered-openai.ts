import OpenAI from 'openai';
import { costCentsForTokens, estimateTokensFromText } from './cost-meter';
import { reportCriticalError } from '@/lib/error-reporter';
import { assertAiUsageAllowed } from '@/lib/ai-safety';
import { getRunContext } from './run-context';
import { HELFI_ANALYSIS_MODEL, isSpecialistOpenAIModel } from './ai-models';

type CreateParams = Parameters<OpenAI['chat']['completions']['create']>[0];
type AiCallContext = {
  feature?: string | null
  userId?: string | null
  runId?: string | null
}

export type CompletionWithCost<T = any> = {
  completion: T;
  costCents: number;
  promptTokens: number;
  completionTokens: number;
};

function shouldReportCriticalOpenAIError(error: any): boolean {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status ?? 0)
  const code = String(error?.code || error?.error?.code || '').toLowerCase()
  const message = String(error?.message || '').toLowerCase()

  // Expected client input errors (bad MIME/file types) should not spam owner alerts.
  if (status === 400) {
    if (
      code === 'invalid_image_format' ||
      message.includes('invalid mime type') ||
      message.includes('only image types are supported') ||
      message.includes('invalid image format') ||
      message.includes('unsupported image')
    ) {
      return false
    }
  }

  return true
}

/**
 * Non-streaming chat completion that returns calculated cost in cents.
 * Callers can then charge the wallet accordingly.
 */
export async function chatCompletionWithCost(
  openai: OpenAI,
  params: CreateParams,
  context: AiCallContext = {}
): Promise<CompletionWithCost<OpenAI.Chat.Completions.ChatCompletion>> {
  const asyncContext = getRunContext()
  const mergedContext: AiCallContext = {
    feature: context.feature ?? asyncContext?.feature ?? null,
    userId: context.userId ?? asyncContext?.meta?.userId ?? null,
    runId: context.runId ?? asyncContext?.runId ?? null,
  }
  const requestedModel = String((params as any).model || '').trim()
  const keepRequestedModel =
    mergedContext.feature === 'admin:food-benchmark' ||
    isSpecialistOpenAIModel(requestedModel)
  const effectiveModel = keepRequestedModel ? requestedModel : HELFI_ANALYSIS_MODEL
  const effectiveParams: any = { ...params, model: effectiveModel }
  const modelName = effectiveModel.toLowerCase()
  const isGpt5Family = modelName.includes('gpt-5')
  const normalizedParams = (() => {
    if (!isGpt5Family) return effectiveParams
    const maxTokens = Number(effectiveParams.max_tokens)
    const maxCompletionTokens = Number(effectiveParams.max_completion_tokens)
    const next: any = { ...effectiveParams }
    delete next.max_tokens
    delete next.temperature
    if (modelName.includes('gpt-5.6') && !next.reasoning_effort) {
      // Most Helfi calls have small, user-facing response budgets. GPT-5.6
      // counts reasoning tokens inside max_completion_tokens, so using "low"
      // can consume the whole allowance and return no visible answer.
      // Use the model's supported "none" setting by default; quality-first
      // workflows such as weekly reports opt into more reasoning explicitly.
      next.reasoning_effort = 'none'
    }
    if (Number.isFinite(maxCompletionTokens) && maxCompletionTokens > 0) {
      next.max_completion_tokens = maxCompletionTokens
    } else if (Number.isFinite(maxTokens) && maxTokens > 0) {
      next.max_completion_tokens = maxTokens
    }
    return next
  })()
  try {
    await assertAiUsageAllowed(mergedContext)
    const completion = await openai.chat.completions.create({
      ...normalizedParams,
      stream: false,
    } as any);

    // Try to use official usage first; if absent, fall back to a rough estimate.
    const usage = (completion as any).usage || {};
    const model = (completion as any).model || effectiveModel || HELFI_ANALYSIS_MODEL;
    const promptTokens = Number(usage?.prompt_tokens || 0);
    const completionTokens = Number(usage?.completion_tokens || 0);

    let costCents = 0;
    if (promptTokens > 0 || completionTokens > 0) {
      costCents = costCentsForTokens(model, { promptTokens, completionTokens });
    } else {
      // Fallback: estimate from message text and max_tokens
      const promptText = extractPromptText(params.messages);
      const maxTokens =
        Number((params as any).max_tokens) ||
        Number((params as any).max_completion_tokens) ||
        0;
      const expectedOutputChars = Math.max(0, maxTokens * 4);
      costCents = costCentsForTokens(model, {
        promptTokens: estimateTokensFromText(promptText),
        completionTokens: Math.ceil(expectedOutputChars / 4),
      });
    }

    return {
      completion,
      costCents,
      promptTokens,
      completionTokens,
    };
  } catch (error) {
    const model = effectiveModel || 'unknown'
    const maxTokens =
      Number((params as any).max_tokens) ||
      Number((params as any).max_completion_tokens) ||
      0
    if (shouldReportCriticalOpenAIError(error)) {
      reportCriticalError({
        source: 'openai.chat.completions',
        error,
        details: {
          model,
          maxTokens,
        },
      })
    }
    throw error
  }
}

function extractPromptText(messages: any[]): string {
  try {
    return (messages || [])
      .map((m) => {
        if (!m?.content) return '';
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) {
          return m.content
            .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
            .join('\n');
        }
        return '';
      })
      .join('\n');
  } catch {
    return '';
  }
}
