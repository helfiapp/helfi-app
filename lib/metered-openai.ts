import OpenAI from 'openai';
import { costCentsForTokens, estimateTokensFromText } from './cost-meter';

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
  const completion = await openai.chat.completions.create({
    ...params,
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
    const expectedOutputChars = Math.max(0, Number((params as any).max_tokens || 0) * 4);
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






