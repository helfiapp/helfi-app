import OpenAI from 'openai';
import { costCentsForTokens, estimateTokensFromText } from './cost-meter';
import { reportCriticalError } from '@/lib/error-reporter';

type CreateParams = Parameters<OpenAI['chat']['completions']['create']>[0];

export type CompletionWithCost<T = any> = {
  completion: T;
  costCents: number;
  promptTokens: number;
  completionTokens: number;
};

/**
 * Non-streaming chat completion that returns calculated cost in cents.
 * Callers can then charge the wallet accordingly.
 */
export async function chatCompletionWithCost(
  openai: OpenAI,
  params: CreateParams
): Promise<CompletionWithCost<OpenAI.Chat.Completions.ChatCompletion>> {
  const modelName = String((params as any).model || '').toLowerCase()
  const isGpt5Family = modelName.includes('gpt-5')
  const normalizedParams = (() => {
    if (!isGpt5Family) return params
    const maxTokens = Number((params as any).max_tokens)
    const maxCompletionTokens = Number((params as any).max_completion_tokens)
    const next: any = { ...params }
    delete next.max_tokens
    if (Number.isFinite(maxCompletionTokens) && maxCompletionTokens > 0) {
      next.max_completion_tokens = maxCompletionTokens
    } else if (Number.isFinite(maxTokens) && maxTokens > 0) {
      next.max_completion_tokens = maxTokens
    }
    return next
  })()
  try {
    const completion = await openai.chat.completions.create({
      ...normalizedParams,
      stream: false,
    } as any);

    // Try to use official usage first; if absent, fall back to a rough estimate.
    const usage = (completion as any).usage || {};
    const model = (completion as any).model || (params as any).model || 'gpt-4o';
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
    const model = String((params as any).model || 'unknown')
    const maxTokens =
      Number((params as any).max_tokens) ||
      Number((params as any).max_completion_tokens) ||
      0
    reportCriticalError({
      source: 'openai.chat.completions',
      error,
      details: {
        model,
        maxTokens,
      },
    })
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






