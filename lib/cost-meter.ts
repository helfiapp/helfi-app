// Centralized cost metering for OpenAI usage.
// Prices are in cents per 1,000 tokens. Defaults reflect public pricing circa mid‑2024/2025.
// You can override any value by setting an env var like:
// HELFI_PRICE_GPT4O_INPUT_CENTS_PER_1K, HELFI_PRICE_GPT4O_OUTPUT_CENTS_PER_1K, etc.

type ModelPrices = {
  inputCentsPer1k: number;
  outputCentsPer1k: number;
};

const envNumber = (key: string, fallback: number): number => {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const DEFAULT_PRICES: Record<string, ModelPrices> = {
  // 4o: ~$0.005 / 1k input, $0.015 / 1k output
  'gpt-4o': {
    inputCentsPer1k: envNumber('HELFI_PRICE_GPT4O_INPUT_CENTS_PER_1K', 0.5),
    outputCentsPer1k: envNumber('HELFI_PRICE_GPT4O_OUTPUT_CENTS_PER_1K', 1.5),
  },
  // 4o-mini: ~$0.00015 / 1k input, $0.0006 / 1k output
  'gpt-4o-mini': {
    inputCentsPer1k: envNumber('HELFI_PRICE_GPT4O_MINI_INPUT_CENTS_PER_1K', 0.015),
    outputCentsPer1k: envNumber('HELFI_PRICE_GPT4O_MINI_OUTPUT_CENTS_PER_1K', 0.06),
  },
  // GPT-4 (fallback)
  'gpt-4': {
    inputCentsPer1k: envNumber('HELFI_PRICE_GPT4_INPUT_CENTS_PER_1K', 3.0),
    outputCentsPer1k: envNumber('HELFI_PRICE_GPT4_OUTPUT_CENTS_PER_1K', 6.0),
  },
  // Historical 3.5 fallback, rarely used
  'gpt-3.5-turbo': {
    inputCentsPer1k: envNumber('HELFI_PRICE_GPT35_INPUT_CENTS_PER_1K', 0.15),
    outputCentsPer1k: envNumber('HELFI_PRICE_GPT35_OUTPUT_CENTS_PER_1K', 0.2),
  },
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
};

export function getModelPrices(model: string): ModelPrices {
  const key = model in DEFAULT_PRICES ? model : model.toLowerCase();
  return DEFAULT_PRICES[key] || DEFAULT_PRICES['gpt-4o'];
}

export function costCentsForTokens(model: string, usage: TokenUsage): number {
  const { inputCentsPer1k, outputCentsPer1k } = getModelPrices(model);
  const inCost = (usage.promptTokens / 1000) * inputCentsPer1k;
  const outCost = (usage.completionTokens / 1000) * outputCentsPer1k;
  // Round up to the nearest cent to avoid undercharging
  return Math.ceil(inCost + outCost);
}

// Rough estimation for streaming or when usage is unavailable.
// Uses a simple characters-to-tokens heuristic (~4 chars per token).
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  const approx = Math.ceil(text.length / 4);
  return approx;
}

export function costCentsEstimateFromText(
  model: string,
  promptText: string,
  expectedOutputChars: number
): number {
  const promptTokens = estimateTokensFromText(promptText);
  const completionTokens = Math.ceil(expectedOutputChars / 4);
  return costCentsForTokens(model, { promptTokens, completionTokens });
}







