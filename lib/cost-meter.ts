// Centralized cost metering for OpenAI usage.
// Prices are in cents per 1,000 tokens. Defaults reflect public pricing circa mid‑2024/2025.
// You can override any value by setting an env var like:
// HELFI_PRICE_GPT4O_INPUT_CENTS_PER_1K, HELFI_PRICE_GPT4O_OUTPUT_CENTS_PER_1K, etc.

type ModelPrices = {
  inputCentsPer1k: number;
  outputCentsPer1k: number;
};

// Global markup multiplier to apply to all computed costs (e.g., 2 = 2x OpenAI cost).
// Default is 2x per user request.
const BILLING_MARKUP_MULTIPLIER = (() => {
  const v = process.env.HELFI_BILLING_MARKUP_MULTIPLIER;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  return 2; // default: double the OpenAI cost to cover service margin
})();

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

function normalizeModelKey(model: string): string {
  const m = (model || '').toLowerCase();
  if (m.includes('gpt-4o-mini')) return 'gpt-4o-mini';
  if (m.includes('gpt-4o')) return 'gpt-4o';
  if (m.includes('gpt-4')) return 'gpt-4';
  if (m.includes('gpt-3.5')) return 'gpt-3.5-turbo';
  return m;
}

export function getModelPrices(model: string): ModelPrices {
  const key = model in DEFAULT_PRICES ? model : normalizeModelKey(model);
  return DEFAULT_PRICES[key] || DEFAULT_PRICES['gpt-4o'];
}

export function getBillingMarkupMultiplier() {
  return BILLING_MARKUP_MULTIPLIER;
}

export function getModelPriceInfo(model: string): ModelPrices {
  return getModelPrices(model);
}

// Raw OpenAI cost (no markup). Useful for reporting true spend against the vendor bill.
export function openaiCostCentsForTokens(model: string, usage: TokenUsage): number {
  const { inputCentsPer1k, outputCentsPer1k } = getModelPrices(model);
  const inCost = (usage.promptTokens / 1000) * inputCentsPer1k;
  const outCost = (usage.completionTokens / 1000) * outputCentsPer1k;
  return Math.ceil(inCost + outCost);
}

export function costCentsForTokens(model: string, usage: TokenUsage): number {
  const { inputCentsPer1k, outputCentsPer1k } = getModelPrices(model);
  const inCost = (usage.promptTokens / 1000) * inputCentsPer1k;
  const outCost = (usage.completionTokens / 1000) * outputCentsPer1k;
  const base = inCost + outCost;
  // Apply global markup and round up to avoid undercharging
  return Math.ceil(base * BILLING_MARKUP_MULTIPLIER);
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







