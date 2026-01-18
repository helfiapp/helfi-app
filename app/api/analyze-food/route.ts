import { NextRequest, NextResponse } from 'next/server';
/**
 * IMPORTANT – DO NOT CHANGE OUTPUT FORMAT WITHOUT UPDATING UI PARSER
 * The Food Diary UI in `app/food/page.tsx` extracts nutrition via regex from a single line:
 *   Calories: <number>, Protein: <g>, Carbs: <g>, Fat: <g>
 * If you modify prompts or response shapes, ensure this exact line remains present.
 * A server-side fallback below appends this line when missing.
 *
 * ⚠️ GUARD RAIL (GUARD_RAILS.md §3.9):
 * - Keep discrete item handling aligned with the guard rails:
 *   only set pieces/piecesPerServing when a visible, explicit count is present.
 * - Do NOT change portion sync expectations without explicit user approval.
 */
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { lookupFoodNutrition, searchFatSecretFoods } from '@/lib/food-data';
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system';
import { hasFreeCredits, consumeFreeCredit, type FreeCreditType } from '@/lib/free-credits';
import crypto from 'crypto';
import { consumeRateLimit } from '@/lib/rate-limit';
import { normalizeDiscreteItems, summarizeDiscreteItemsForLog } from '@/lib/food-normalization';
import { isSubscriptionActive } from '@/lib/subscription-utils';
import { logServerCall } from '@/lib/server-call-tracker';

// Bump this when changing curated nutrition to invalidate old cached images.
const CACHE_VERSION = 'v5';
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 3;   // stop runaway loops quickly
const STRICT_AI_ONLY_ITEMS = true;

// Guard rail: this route powers the main Food Analyzer. Billing enforcement
// (BILLING_ENFORCED) must remain true for production unless the user explicitly
// asks to pause billing. Do not toggle it off as a "quick fix" for other bugs.
import OpenAI from 'openai';
import { chatCompletionWithCost } from '@/lib/metered-openai';
import { capMaxTokensToBudget, costCentsEstimateFromText, estimateTokensFromText } from '@/lib/cost-meter';
import { logAiUsageEvent, runChatCompletionWithLogging } from '@/lib/ai-usage-logger';
import { getImageMetadata } from '@/lib/image-metadata';
import { checkMultipleDietCompatibility, normalizeDietTypes } from '@/lib/diets';
// NOTE: USDA/FatSecret lookup removed from AI analysis - kept only for manual ingredient lookup via /api/food-data

// Best-effort relaxed JSON parsing to handle minor LLM formatting issues
function parseItemsJsonRelaxed(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      // 1) Quote unquoted keys after { or ,  2) convert single quotes to double  3) remove trailing commas
      const keysQuoted = raw.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');
      const doubleQuoted = keysQuoted.replace(/'/g, '"');
      const noTrailingCommas = doubleQuoted.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(noTrailingCommas);
    } catch {
      return null;
    }
  }
}

const GEMINI_VISION_MODEL_DEFAULT = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const extractPromptTextFromMessages = (messages: any[]): string => {
  if (!Array.isArray(messages)) return '';
  return messages
    .map((message) => {
      const content = (message as any)?.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .map((part: any) => {
            if (typeof part === 'string') return part;
            if (typeof part?.text === 'string') return part.text;
            return '';
          })
          .filter(Boolean)
          .join('\n');
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
};

const parseInlineImageData = (dataUrl: string | null) => {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
};

const parseFeedbackList = (raw: any): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => String(item || '').replace(/[\r\n]+/g, ' ').trim())
      .filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item || '').replace(/[\r\n]+/g, ' ').trim())
          .filter(Boolean);
      }
    } catch {}
    return trimmed
      .split(',')
      .map((item) => String(item || '').replace(/[\r\n]+/g, ' ').trim())
      .filter(Boolean);
  }
  return [];
};

const sanitizeFeedbackItems = (items: string[], limit = 12): string[] => {
  return items
    .map((item) => String(item || '').replace(/[\r\n]+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit);
};

const extractGeminiText = (payload: any): string | null => {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
  return text.length ? text : null;
};

const runGeminiVisionCompletion = async (opts: {
  apiKey: string;
  model: string;
  promptText: string;
  imageDataUrl: string;
  maxOutputTokens: number;
  temperature?: number;
  responseMimeType?: string;
}) => {
  const { apiKey, model, promptText, imageDataUrl, maxOutputTokens, temperature, responseMimeType } = opts;
  const inlineData = parseInlineImageData(imageDataUrl);
  if (!inlineData) {
    throw new Error('Invalid image data for Gemini');
  }

  const generationConfig: Record<string, any> = {
    temperature: typeof temperature === 'number' ? temperature : 0,
    maxOutputTokens,
  };
  if (responseMimeType) {
    generationConfig.responseMimeType = responseMimeType;
  }

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          {
            inlineData: {
              data: inlineData.data,
              mimeType: inlineData.mimeType,
            },
          },
        ],
      },
    ],
    generationConfig,
  };

  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${text}`);
  }

  const payload = await response.json();
  const text = extractGeminiText(payload);
  const promptTokens = estimateTokensFromText(promptText);
  const completionTokens = estimateTokensFromText(text || '');
  const costCents = costCentsEstimateFromText(model, promptText, (text || '').length);

  return {
    completion: {
      choices: [{ message: { content: text || '' } }],
      model,
    },
    costCents,
    promptTokens,
    completionTokens,
  };
};

const computeTotalsFromItems = (items: any[]): any | null => {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const totals = items.reduce(
    (acc, item) => {
      const servings = Number.isFinite(Number(item?.servings)) ? Number(item.servings) : 1;
      acc.calories += Number(item?.calories || 0) * servings;
      acc.protein_g += Number(item?.protein_g || 0) * servings;
      acc.carbs_g += Number(item?.carbs_g || 0) * servings;
      acc.fat_g += Number(item?.fat_g || 0) * servings;
      acc.fiber_g += Number(item?.fiber_g || 0) * servings;
      acc.sugar_g += Number(item?.sugar_g || 0) * servings;
      return acc;
    },
    {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
    },
  );

  const round = (value: number, decimals = 1) => {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  };

  return {
    calories: Math.round(totals.calories),
    protein_g: round(totals.protein_g),
    carbs_g: round(totals.carbs_g),
    fat_g: round(totals.fat_g),
    fiber_g: totals.fiber_g > 0 ? round(totals.fiber_g) : null,
    sugar_g: totals.sugar_g > 0 ? round(totals.sugar_g) : null,
  };
};

const stripNutritionFromServingSize = (raw: string) => {
  return String(raw || '')
    .replace(/\([^)]*(calories?|kcal|kilojoules?|kj|protein|carbs?|fat|fibre|fiber|sugar)[^)]*\)/gi, '')
    .replace(/\b\d+(?:\.\d+)?\s*(kcal|cal|kj)\b[^,)]*(?:protein|carb|fat|fiber|fibre|sugar)[^,)]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseServingWeight = (servingSize?: string | null): number | null => {
  if (!servingSize) return null;
  const raw = String(servingSize);
  const parseRange = (pattern: RegExp, factor = 1) => {
    const rangeMatch = raw.match(pattern);
    if (rangeMatch) {
      const start = parseFloat(rangeMatch[1]);
      const end = parseFloat(rangeMatch[2]);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        return ((start + end) / 2) * factor;
      }
    }
    return null;
  };
  const parseSingle = (pattern: RegExp, factor = 1) => {
    const match = raw.match(pattern);
    if (!match) return null;
    const value = parseFloat(match[1]);
    return Number.isFinite(value) ? value * factor : null;
  };

  const gramsRange = parseRange(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*g\b/i);
  if (gramsRange) return gramsRange;
  const gramsMatch = parseSingle(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (gramsMatch) return gramsMatch;

  const mlRange = parseRange(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*ml\b/i);
  if (mlRange) return mlRange;
  const mlMatch = parseSingle(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (mlMatch) return mlMatch;

  const ozRange = parseRange(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:oz|ounce|ounces)\b/i, 28.3495);
  if (ozRange) return ozRange;
  const ozMatch = parseSingle(/(\d+(?:\.\d+)?)\s*(?:oz|ounce|ounces)\b/i, 28.3495);
  if (ozMatch) return ozMatch;

  const lbRange = parseRange(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)\b/i, 453.592);
  if (lbRange) return lbRange;
  const lbMatch = parseSingle(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)\b/i, 453.592);
  if (lbMatch) return lbMatch;

  return null;
};

const sanitizePackagedLabelItems = (items: any[]) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { items, needsReview: false, message: '' };
  }
  let needsReview = false;
  let message = '';
  const cleaned = items.map((item) => {
    const next = { ...item };
    if (next?.serving_size) {
      next.serving_size = stripNutritionFromServingSize(next.serving_size);
    }
    const weight =
      parseServingWeight(next?.serving_size || null) ||
      (Number.isFinite(Number(next?.customGramsPerServing)) && Number(next.customGramsPerServing) > 0
        ? Number(next.customGramsPerServing)
        : null) ||
      (Number.isFinite(Number(next?.customMlPerServing)) && Number(next.customMlPerServing) > 0
        ? Number(next.customMlPerServing)
        : null);

    if (!weight || weight <= 0) return next;

    const safe = (value: any) =>
      Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
    const calories = safe(next?.calories);
    const protein = safe(next?.protein_g);
    const carbs = safe(next?.carbs_g);
    const fat = safe(next?.fat_g);
    const fiber = safe(next?.fiber_g);
    const macroSum = protein + carbs + fat + fiber;
    const macroLimit = weight * 1.3 + 2;
    const calorieLimit = weight * 9.5 + 10;
    const hasNoNumbers = calories <= 0 && macroSum <= 0;
    const failsMacro = macroSum > macroLimit;
    const failsCalories = calories > calorieLimit;

    if (hasNoNumbers || failsMacro || failsCalories) {
      needsReview = true;
      message =
        'We could not read the per serve column clearly. Please retake the label photo and make sure the first column is sharp.';
      next.labelNeedsReview = true;
      next.labelNeedsReviewMessage = message;
      next.calories = null;
      next.protein_g = null;
      next.carbs_g = null;
      next.fat_g = null;
      next.fiber_g = null;
      next.sugar_g = null;
    }

    return next;
  });

  return { items: cleaned, needsReview, message };
};

const parseLabelJsonBlock = (raw: string): any | null => {
  if (!raw) return null;
  const match = raw.match(/<LABEL_JSON>([\s\S]*?)<\/LABEL_JSON>/i);
  const block = match && match[1] ? match[1].trim() : '';
  if (!block) return null;
  return parseItemsJsonRelaxed(block);
};

const extractLabelPerServingFromImage = async (
  openai: OpenAI,
  imageDataUrl: string,
  model: string,
) => {
  const messages: any[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            'Read this nutrition label. Use ONLY the first column that says "Quantity per serving" (ignore the per-100g column).\n' +
            'Return JSON between <LABEL_JSON> and </LABEL_JSON> only with this exact shape:\n' +
            '{"serving_size":"string","per_serving":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}\n' +
            '- If both kJ and Cal are shown, use the Cal value for calories.\n' +
            '- If a value is unclear, set it to null (do not guess).\n' +
            '- Do NOT use per-100g numbers.',
        },
        { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
      ],
    },
  ];

  const result = await chatCompletionWithCost(openai, {
    model,
    messages,
    max_tokens: 300,
    temperature: 0,
  } as any);

  const content = result.completion?.choices?.[0]?.message?.content || '';
  const parsed = parseLabelJsonBlock(content);
  return { parsed, costCents: result.costCents };
};

const isPlausibleTotal = (total: any): boolean => {
  if (!total || typeof total !== 'object') return false;
  const calories = Number((total as any)?.calories);
  if (!Number.isFinite(calories) || calories <= 0 || calories > 5000) return false;
  return true;
};

const chooseCanonicalTotal = (items: any[] | null | undefined, incomingTotal: any | null | undefined) => {
  const sumFromItems = computeTotalsFromItems(items || []);

  if (incomingTotal && isPlausibleTotal(incomingTotal)) {
    if (sumFromItems && isPlausibleTotal(sumFromItems)) {
      const diff = Math.abs(Number((incomingTotal as any).calories) - Number((sumFromItems as any).calories));
      const ratio = Number((sumFromItems as any).calories) > 0 ? diff / Number((sumFromItems as any).calories) : 0;
      if (ratio <= 0.35) {
        return incomingTotal;
      }
    } else {
      return incomingTotal;
    }
  }

  return sumFromItems || incomingTotal || null;
};

const EGG_KEYWORDS = ['egg', 'eggs', 'fried egg', 'boiled egg', 'scrambled egg', 'omelette', 'omelet'];

const enforceEggCountFromAnalysis = (items: any[] | null | undefined, analysis: string | null | undefined) => {
  if (!items || !Array.isArray(items) || items.length === 0) return items;
  const text = (analysis || '').toLowerCase();
  const inferredCount = extractExplicitPieceCount(text, ['egg', 'eggs']);
  if (!inferredCount || inferredCount < 2) return items;

  const looksLikeEgg = (name: string) => {
    const lower = name.toLowerCase();
    return EGG_KEYWORDS.some((k) => lower.includes(k));
  };

  const next = [...items];
  const first = { ...next[0] };
  if (!looksLikeEgg(String(first.name || '')) && !looksLikeEgg(String(first.serving_size || ''))) {
    return items;
  }

  const factor = inferredCount / Math.max(Number(first.servings) || 1, 1);
  const scaleField = (v: any) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * factor * 10) / 10 : null);

  first.serving_size = `${inferredCount} eggs`;
  first.servings = 1;
  (first as any).pieces = inferredCount;
  (first as any).piecesPerServing = inferredCount;
  first.calories = scaleField(first.calories);
  first.protein_g = scaleField(first.protein_g);
  first.carbs_g = scaleField(first.carbs_g);
  first.fat_g = scaleField(first.fat_g);
  if (first.fiber_g !== null && first.fiber_g !== undefined) first.fiber_g = scaleField(first.fiber_g);
  if (first.sugar_g !== null && first.sugar_g !== undefined) first.sugar_g = scaleField(first.sugar_g);

  next[0] = first;
  return next;
};

// Quick sanity checks for structured items
const summarizeItemsForLog = (items: any[]) =>
  Array.isArray(items)
    ? items.slice(0, 6).map((it) => ({
        name: it?.name,
        calories: it?.calories,
        protein_g: it?.protein_g,
        carbs_g: it?.carbs_g,
        fat_g: it?.fat_g,
        isGuess: it?.isGuess === true,
      }))
    : [];

const isRealisticItem = (item: any): boolean => {
  const cal = Number(item?.calories ?? 0);
  const protein = Number(item?.protein_g ?? 0);
  const fat = Number(item?.fat_g ?? 0);
  const carbs = Number(item?.carbs_g ?? 0);
  const hasAnyMacro = Number.isFinite(protein) && protein > 0.2 || Number.isFinite(fat) && fat > 0.2 || Number.isFinite(carbs) && carbs > 0.2;
  const caloriesReasonable = Number.isFinite(cal) && cal > 5 && cal < 2000;
  return caloriesReasonable && hasAnyMacro;
};

const validateStructuredItems = (items: any[]): boolean => {
  if (!Array.isArray(items) || items.length === 0) return false;
  const realisticCount = items.filter(isRealisticItem).length;
  // Accept single realistic item (single-food meal) or multi-item meals with at least two realistic items
  return realisticCount >= 1;
};

// Very small heuristic map to seed guessed macros when the AI misses structured items.
const estimatedGuessMacrosForName = (nameRaw: string) => {
  const name = (nameRaw || '').toLowerCase();
  // Defaults are conservative single-portion estimates.
  if (name.includes('chicken')) return { calories: 220, protein_g: 32, carbs_g: 0, fat_g: 8 };
  if (name.includes('beef') || name.includes('steak')) return { calories: 250, protein_g: 30, carbs_g: 0, fat_g: 14 };
  if (name.includes('pork')) return { calories: 240, protein_g: 27, carbs_g: 0, fat_g: 14 };
  if (name.includes('salmon') || name.includes('fish')) return { calories: 220, protein_g: 25, carbs_g: 0, fat_g: 13 };
  if (name.includes('potato')) return { calories: 150, protein_g: 3, carbs_g: 32, fat_g: 3 };
  if (name.includes('sweet potato')) return { calories: 140, protein_g: 3, carbs_g: 33, fat_g: 0.5 };
  if (name.includes('peas')) return { calories: 70, protein_g: 4, carbs_g: 12, fat_g: 0.5 };
  if (name.includes('broccoli')) return { calories: 35, protein_g: 2.5, carbs_g: 7, fat_g: 0.5 };
  if (name.includes('carrot')) return { calories: 45, protein_g: 1, carbs_g: 10, fat_g: 0.2 };
  if (name.includes('mushroom')) return { calories: 20, protein_g: 3, carbs_g: 3, fat_g: 0.3 };
  if (name.includes('rice')) return { calories: 200, protein_g: 4, carbs_g: 44, fat_g: 0.5 };
  if (name.includes('bread') || name.includes('bun')) return { calories: 150, protein_g: 5, carbs_g: 28, fat_g: 3 };
  // Fallback generic side.
  return { calories: 90, protein_g: 2, carbs_g: 12, fat_g: 3 };
};

// Pull likely components from the AI's prose description to add missing guessed items.
const inferComponentsFromAnalysis = (analysis: string | null | undefined): string[] => {
  if (!analysis) return [];
  const lower = analysis.toLowerCase();
  const withIdx = lower.indexOf(' with ');
  if (withIdx === -1) return [];
  const afterWith = analysis.slice(withIdx + 6);
  const firstSentence = afterWith.split(/[.]/)[0] || afterWith;
  const parts = firstSentence
    .split(/,| and | & /i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3 && p.split(/\s+/).length <= 6);
  const unique: string[] = [];
  for (const p of parts) {
    const lowerPart = p.toLowerCase();
    if (!unique.some((u) => u.toLowerCase() === lowerPart)) {
      unique.push(p);
    }
  }
  return unique.slice(0, 8);
};

const normalizeComponentName = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cleanComponentLabel = (value: string) => {
  return String(value || '')
    .replace(/^(a|an|one)\s+/i, '')
    .replace(/^(small|medium|large)\s+portion\s+of\s+/i, '')
    .replace(/^portion\s+of\s+/i, '')
    .replace(/^(small|medium|large)\s+/i, '')
    .replace(/(\d)\s*"/g, '$1 in ')
    .replace(/"/g, '')
    .trim();
};

const normalizeComponentList = (items: string[]) =>
  items
    .map((item) => cleanComponentLabel(item))
    .filter((item) => item && item.length >= 3);

const dedupeComponentList = (items: string[]) => {
  const seen = new Set<string>();
  const unique: string[] = [];
  items.forEach((item) => {
    const normalized = normalizeComponentName(item);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    unique.push(item);
  });
  return unique;
};

const replaceWordNumbersSimple = (value: string) => {
  const map: Record<string, string> = {
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
    ten: '10',
    eleven: '11',
    twelve: '12',
  };
  return String(value || '').replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (m) => {
    const repl = map[m.toLowerCase()];
    return repl || m;
  });
};

const normalizePlaceholderLabel = (value: string) =>
  replaceWordNumbersSimple(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isGenericPlaceholderName = (value: string) => {
  const normalized = normalizePlaceholderLabel(value);
  if (!normalized) return false;
  const roots = ['dessert', 'item', 'component', 'ingredient', 'food', 'dish', 'plate', 'meal'];
  const rootPattern = new RegExp(`^(?:${roots.join('|')})s?$`);
  const rootNumberPattern = new RegExp(`^(?:${roots.join('|')})s?\\s*\\d+$`);
  if (rootPattern.test(normalized)) return true;
  if (rootNumberPattern.test(normalized)) return true;
  if (normalized === 'unknown' || normalized === 'unknown item' || normalized === 'unknown food') return true;
  return false;
};

const renameGenericItemsWithComponents = (
  items: any[] | null | undefined,
  components: string[] | null | undefined,
): { items: any[]; changed: boolean; renamed: number } => {
  if (!Array.isArray(items) || items.length === 0) return { items: items || [], changed: false, renamed: 0 };
  if (!Array.isArray(components) || components.length === 0) return { items, changed: false, renamed: 0 };

  const normalizedComponents = dedupeComponentList(normalizeComponentList(components));
  const candidates = normalizedComponents
    .map((raw) => ({
      raw,
      key: normalizeComponentName(raw),
      isGeneric: isGenericPlaceholderName(raw),
    }))
    .filter((entry) => entry.key);
  const available = candidates.filter((entry) => !entry.isGeneric);
  if (available.length === 0) return { items, changed: false, renamed: 0 };

  const used = new Set<string>();
  items.forEach((item) => {
    const name = String(item?.name || '').trim();
    if (!name || isGenericPlaceholderName(name)) return;
    const key = normalizeComponentName(name);
    if (!key) return;
    if (available.some((entry) => entry.key === key)) {
      used.add(key);
    }
  });

  let renamed = 0;
  const nextItems = items.map((item) => {
    const name = String(item?.name || '').trim();
    if (!name || !isGenericPlaceholderName(name)) return item;
    const replacement = available.find((entry) => !used.has(entry.key));
    if (!replacement) return item;
    used.add(replacement.key);
    renamed += 1;
    return { ...item, name: replacement.raw };
  });

  return { items: nextItems, changed: renamed > 0, renamed };
};

const buildComponentBoundSchema = (components: string[]) => ({
  name: 'food_component_items',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'total'],
    properties: {
      items: {
        type: 'array',
        minItems: components.length,
        maxItems: components.length,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'component',
            'name',
            'brand',
            'serving_size',
            'servings',
            'calories',
            'protein_g',
            'carbs_g',
            'fat_g',
            'fiber_g',
            'sugar_g',
            'isGuess',
          ],
          properties: {
            component: { type: 'string', enum: components },
            name: { type: 'string' },
            brand: { type: ['string', 'null'] },
            serving_size: { type: 'string' },
            servings: { type: 'number' },
            calories: { type: ['number', 'null'] },
            protein_g: { type: ['number', 'null'] },
            carbs_g: { type: ['number', 'null'] },
            fat_g: { type: ['number', 'null'] },
            fiber_g: { type: ['number', 'null'] },
            sugar_g: { type: ['number', 'null'] },
            isGuess: { type: 'boolean' },
          },
        },
      },
      total: {
        type: 'object',
        additionalProperties: false,
        required: ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'],
        properties: {
          calories: { type: ['number', 'null'] },
          protein_g: { type: ['number', 'null'] },
          carbs_g: { type: ['number', 'null'] },
          fat_g: { type: ['number', 'null'] },
          fiber_g: { type: ['number', 'null'] },
          sugar_g: { type: ['number', 'null'] },
        },
      },
    },
  },
  strict: true,
});

const extractComponentsFromDelimitedText = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  const cleaned = String(raw).replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  let candidate = cleaned.split(/[.]/)[0] || cleaned;
  candidate = candidate
    .replace(/^(?:the\s+image\s+shows|this\s+image\s+shows|image\s+shows)\s+/i, '')
    .replace(/\b(each component|components?)\b.*$/i, '')
    .trim();

  const hasDelimiters = /,|;|\s+and\s+|\s+&\s+/i.test(candidate);
  if (!hasDelimiters) return [];

  const parts = candidate
    .split(/,|;| and | & /i)
    .map((part) =>
      part
        .replace(/^(?:several\s+components?|components?|includes?|including)\s*:?/i, '')
        .replace(/\bhere'?s\b.*$/i, '')
        .trim(),
    )
    .filter((part) => part.length >= 3);

  const mergeSaladComponents = (items: string[]) => {
    const merged: string[] = [];
    const veggieHints = [
      'lettuce','cucumber','tomato','carrot','carrots','onion','pepper','peppers','capsicum','spinach','rocket','arugula','greens','shredded',
    ];
    const stopHints = ['portion','sauce','fish','shrimp','prawn','wedges','fries','steak','chicken','pork','rice','potato','tartar'];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const lower = item.toLowerCase();
      if (lower.includes('salad') && lower.includes('with')) {
        const parts: string[] = [item];
        let j = i + 1;
        while (j < items.length) {
          const next = items[j];
          const nextLower = next.toLowerCase();
          if (stopHints.some((h) => nextLower.includes(h))) break;
          const wordCount = nextLower.split(/\s+/).filter(Boolean).length;
          if (wordCount <= 2 || veggieHints.some((h) => nextLower.includes(h))) {
            parts.push(next);
            j += 1;
            continue;
          }
          break;
        }
        merged.push(parts.join(', '));
        i = j - 1;
        continue;
      }
      merged.push(item);
    }
    return merged;
  };

  const mergedParts = mergeSaladComponents(parts);

  const filtered = mergedParts.filter((part) => {
    if (/^component\s*\d+$/i.test(part)) return false;
    return !/nutrition|breakdown|estimated|calories?|protein|carbs?|fat|fiber|fibre|sugar/i.test(part);
  });

  const unique: string[] = [];
  for (const part of filtered) {
    const normalized = normalizeComponentName(part);
    if (!normalized) continue;
    if (!unique.some((u) => normalizeComponentName(u) === normalized)) unique.push(part);
    if (unique.length >= 10) break;
  }
  return unique;
};

const extractComponentsFromAnalysis = (analysis: string | null | undefined): string[] => {
  if (!analysis) return [];
  const cleaned = analysis.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const extractExtraComponentsFromText = (text: string): string[] => {
    const results: string[] = [];
    const pushParts = (raw: string) => {
      raw
        .split(/,|;| and | & /i)
        .map((part) => part.trim())
        .filter((part) => part.length >= 3)
        .forEach((part) => results.push(part));
    };
    const servingPattern =
      /\b(?:a|an)\s+(?:serving|portion|side|order|cup|glass|bowl|scoop)\s+of\s+([^.;\n]+)/gi;
    let match: RegExpExecArray | null = null;
    while ((match = servingPattern.exec(text))) {
      if (match[1]) pushParts(match[1]);
    }
    const itemPattern =
      /\b(?:a|an)\s+(soft drink|soda|cola|drink|juice|milkshake|shake|water|ice cream|dessert(?:\s+\w+)?|fries|chips|nuggets|cookie|cookies|brownie|cake|cone)\b/gi;
    while ((match = itemPattern.exec(text))) {
      if (match[1]) pushParts(match[1]);
    }
    return results;
  };

  let listText = '';
  const componentsMatch = cleaned.match(
    /\b(?:components?|ingredients?)(?:\s+list)?\s*[:\-]\s*([^\n.]+)/i,
  );
  if (componentsMatch && componentsMatch[1]) {
    listText = componentsMatch[1];
  }
  if (!listText) {
    const withMatch = cleaned.match(/\bwith\b\s+([^.\n]+)/i);
    if (withMatch && withMatch[1]) listText = withMatch[1];
  }
  if (!listText) {
    const containsMatch = cleaned.match(/\b(?:contains?|includes?|including|consists\s+of)\b\s+([^.\n]+)/i);
    if (containsMatch && containsMatch[1]) listText = containsMatch[1];
  }
  if (!listText) {
    const beforeCalories = cleaned.split(/calories\s*:/i)[0] || cleaned;
    const fallback = extractComponentsFromDelimitedText(beforeCalories);
    return fallback;
  }

  const parts = listText
    .split(/,|;| and | & /i)
    .map((part) =>
      part
        .replace(/^(?:several\s+components?|components?|includes?|including)\s*:?/i, '')
        .replace(/\bhere'?s\b.*$/i, '')
        .trim(),
    )
    .filter((part) => part.length >= 3);

  const extraParts = extractExtraComponentsFromText(cleaned);

  const mergeSaladComponents = (items: string[]) => {
    const merged: string[] = [];
    const veggieHints = [
      'lettuce','cucumber','tomato','carrot','carrots','onion','pepper','peppers','capsicum','spinach','rocket','arugula','greens','shredded',
    ];
    const stopHints = ['portion','sauce','fish','shrimp','prawn','wedges','fries','steak','chicken','pork','rice','potato','tartar'];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const lower = item.toLowerCase();
      if (lower.includes('salad') && lower.includes('with')) {
        const parts: string[] = [item];
        let j = i + 1;
        while (j < items.length) {
          const next = items[j];
          const nextLower = next.toLowerCase();
          if (stopHints.some((h) => nextLower.includes(h))) break;
          const wordCount = nextLower.split(/\s+/).filter(Boolean).length;
          if (wordCount <= 2 || veggieHints.some((h) => nextLower.includes(h))) {
            parts.push(next);
            j += 1;
            continue;
          }
          break;
        }
        merged.push(parts.join(', '));
        i = j - 1;
        continue;
      }
      merged.push(item);
    }
    return merged;
  };

  const mergedParts = mergeSaladComponents([...parts, ...extraParts]);

  const filtered = mergedParts.filter((part) => {
    if (/^component\s*\d+$/i.test(part)) return false;
    return !/nutrition|breakdown|estimated|calories?|protein|carbs?|fat|fiber|fibre|sugar/i.test(part);
  });
  const unique: string[] = [];
  for (const part of filtered) {
    const normalized = normalizeComponentName(part);
    if (!normalized) continue;
    if (!unique.some((u) => normalizeComponentName(u) === normalized)) unique.push(part);
    if (unique.length >= 10) break;
  }
  return unique;
};

// Normalize isGuess flag across items
const normalizeGuessFlags = (items: any[]): any[] =>
  Array.isArray(items)
    ? items.map((item) => ({
        ...item,
        isGuess: item?.isGuess === true,
      }))
    : [];

const isSlicedProduceLabel = (text: string): boolean => {
  const lower = (text || '').toLowerCase()
  if (!lower.includes('slice')) return false
  return (
    lower.includes('avocado') ||
    lower.includes('cucumber') ||
    lower.includes('tomato') ||
    lower.includes('zucchini') ||
    lower.includes('courgette')
  )
}

const inferSliceCount = (text: string): number | null => {
  const lower = (text || '').toLowerCase()
  const match = lower.match(/(\d+)\s*(?:thin\s*)?slice/i)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

const applySlicedProduceSanity = (items: any[]): { items: any[]; changed: boolean } => {
  if (!Array.isArray(items) || items.length === 0) return { items, changed: false }
  let changed = false
  const next = items.map((item) => {
    if (!item || typeof item !== 'object') return item
    const name = String(item?.name || '')
    const serving = String(item?.serving_size || '')
    const label = `${name} ${serving}`.trim()
    if (!isSlicedProduceLabel(label)) return item

    // If the model already provided grams/oz/ml, keep it (user can still adjust).
    const hasExplicitWeight = /\b(\d+(?:\.\d+)?)\s*(g|gram|grams|ml|oz|ounce|ounces)\b/i.test(label)
    const calories = Number(item?.calories)
    const fat = Number(item?.fat_g)

    // If this is a guess and the calories/macros are clearly "whole-food" sized, clamp to a conservative slice portion.
    const isGuess = item?.isGuess === true
    const isEgregious =
      (!Number.isFinite(calories) || calories <= 0) ? false : calories >= 250 ||
      (!Number.isFinite(fat) || fat <= 0) ? false : fat >= 25

    if (!isGuess || hasExplicitWeight || !isEgregious) {
      // Still ensure sliced produce doesn't get treated as discrete pieces.
      if ((item as any)?.piecesPerServing || (item as any)?.pieces) {
        const cleaned = { ...item }
        delete (cleaned as any).piecesPerServing
        delete (cleaned as any).pieces
        return cleaned
      }
      return item
    }

    // Conservative estimate: thin slices are ~8g each (very rough).
    const inferredSlices = inferSliceCount(label)
    const grams = Math.min(90, Math.max(15, (inferredSlices ? inferredSlices * 8 : 25)))

    // Avocado: ~160 kcal / 100g, fat ~14.7g/100g, carbs ~8.5g/100g, protein ~2g/100g, fiber ~6.7g/100g.
    // For other sliced produce, the model is rarely egregious; keep only avocado clamp for now.
    const lowerName = name.toLowerCase()
    if (!lowerName.includes('avocado')) return item

    const scale = grams / 100
    const clamped = {
      ...item,
      name: 'avocado slices',
      serving_size: inferredSlices ? `${inferredSlices} thin slices (~${Math.round(grams)}g)` : `thin slices (~${Math.round(grams)}g)`,
      servings: 1,
      calories: Math.round(160 * scale),
      fat_g: Math.round(14.7 * scale * 10) / 10,
      carbs_g: Math.round(8.5 * scale * 10) / 10,
      protein_g: Math.round(2.0 * scale * 10) / 10,
      fiber_g: Math.round(6.7 * scale * 10) / 10,
      sugar_g: Math.round(0.7 * scale * 10) / 10,
      isGuess: true,
      // Ensure the UI defaults the weight editor to a sane value.
      customGramsPerServing: Math.round(grams * 100) / 100,
      weightUnit: 'g',
      weightAmount: Math.round(grams * 100) / 100,
    }
    delete (clamped as any).piecesPerServing
    delete (clamped as any).pieces
    changed = true
    return clamped
  })
  return { items: next, changed }
}

const replaceWordNumbers = (text: string) => {
  if (!text) return text;
  const map: Record<string, string> = {
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
    ten: '10',
    eleven: '11',
    twelve: '12',
  };
  return String(text).replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (m) => {
    const repl = map[m.toLowerCase()];
    return repl || m;
  });
};

const parseCountFromText = (text: string): number | null => {
  if (!text) return null;
  const normalized = replaceWordNumbers(String(text).toLowerCase());
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const DISCRETE_PIECE_KEYWORDS = [
  'egg',
  'eggs',
  'patty',
  'pattie',
  'patties',
  'nugget',
  'nuggets',
  'wing',
  'wings',
  'drumstick',
  'drumsticks',
  'leg',
  'legs',
  'slice',
  'slices',
  'strip',
  'strips',
  'tender',
  'tenders',
  'piece',
  'pieces',
  'cookie',
  'cookies',
  'cracker',
  'crackers',
  'biscuit',
  'biscuits',
  'sausage',
  'sausages',
  'link',
  'links',
]

const hasDiscreteKeyword = (text: string) => {
  const lower = String(text || '').toLowerCase()
  return DISCRETE_PIECE_KEYWORDS.some((k) => lower.includes(k))
}

const hasWeightUnitText = (text: string) =>
  /\b\d+(?:\.\d+)?\s*(g|gram|grams|kg|ml|oz|ounce|ounces|lb|pound|pounds)\b/i.test(String(text || ''));

const stripWeightPhrases = (text: string) =>
  String(text || '').replace(
    /\b\d+(?:\.\d+)?\s*(g|gram|grams|kg|ml|milliliter|millilitre|l|liter|litre|oz|ounce|ounces|lb|pound|pounds)\b/gi,
    ' ',
  );

const extractExplicitPieceCount = (text: string, keywords: string[] = DISCRETE_PIECE_KEYWORDS): number | null => {
  if (!text) return null
  const normalized = replaceWordNumbers(String(text).toLowerCase()).replace(/\b(a|an)\b/g, '1')
  const cleaned = stripWeightPhrases(normalized)
  const keywordPattern = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const match = cleaned.match(
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:x\\s*)?(?:[a-z-]+\\s+){0,2}(?:${keywordPattern})\\b`),
  )
  if (!match) return null
  const n = parseFloat(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

const extractExplicitDiscreteCountFromServing = (text: string, keywords: string[] = DISCRETE_PIECE_KEYWORDS): number | null => {
  if (!text) return null;
  const normalized = replaceWordNumbers(String(text).toLowerCase()).replace(/\b(a|an)\b/g, '1');
  const cleaned = stripWeightPhrases(normalized);
  const keywordPattern = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = cleaned.match(
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:x\\s*)?(?:[a-z-]+\\s+){0,2}(?:${keywordPattern})\\b`),
  );
  if (!match) return null;
  const n = parseFloat(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const hasExplicitPieceCount = (text: string, keywords?: string[]): boolean => {
  const count = extractExplicitPieceCount(text, keywords)
  return Number.isFinite(count) && Number(count) > 0
}

const normalizeDiscreteCounts = (items: any[]): any[] =>
  Array.isArray(items)
    ? items.map((item) => ({
        ...item,
        name: replaceWordNumbers(item?.name || ''),
        serving_size: replaceWordNumbers(item?.serving_size || item?.servingSize || ''),
        isGuess: item?.isGuess === true,
      }))
    : [];

// Sometimes the model misreads a weight like "8 oz cooked (227g)" as a *count* of 8 pieces,
// and may even prefix the name with the number. This causes the UI to show nonsense like
// "8 roasted chicken" with Pieces=8. If the serving is clearly weight-based and there are
// no discrete-unit keywords, we clear pieces metadata and strip accidental leading counts.
const fixWeightUnitsMisreadAsPieces = (items: any[]): { items: any[]; changed: boolean } => {
  if (!Array.isArray(items) || items.length === 0) return { items, changed: false }
  let changed = false

  const hasWeightUnit = (text: string) => /\b\d+(?:\.\d+)?\s*(g|gram|grams|kg|ml|oz|ounce|ounces)\b/i.test(text || '')

  const fixed = items.map((item) => {
    if (!item || typeof item !== 'object') return item
    const next: any = { ...item }
    const name = String(next?.name || '')
    const serving = String(next?.serving_size || next?.servingSize || '')
    const label = `${name} ${serving}`.trim()

    const piecesPerServing =
      Number.isFinite(Number(next?.piecesPerServing)) && Number(next.piecesPerServing) > 0 ? Number(next.piecesPerServing) : null
    const pieces =
      Number.isFinite(Number(next?.pieces)) && Number(next.pieces) > 0 ? Number(next.pieces) : null

    if (!hasWeightUnit(serving)) return next
    const explicitCount = extractExplicitPieceCount(label)
    const servingExplicit = extractExplicitDiscreteCountFromServing(serving)
    const hasExplicitCount = Boolean(explicitCount || servingExplicit)

    // If the model prefixed the name with a number (often from oz), strip it.
    if (!hasExplicitCount && /^\s*\d+\s+/.test(name)) {
      next.name = name.replace(/^\s*\d+\s+/, '').trim()
      changed = true
    }

    // If pieces metadata exists in a weight-based serving, remove it.
    if (!hasExplicitCount && (piecesPerServing || pieces)) {
      delete next.piecesPerServing
      delete next.pieces
      changed = true
    }

    return next
  })

  return { items: fixed, changed }
}

const stripPiecesWithoutExplicitCount = (items: any[]): { items: any[]; changed: boolean } => {
  if (!Array.isArray(items) || items.length === 0) return { items, changed: false }
  let changed = false

  const next = items.map((item) => {
    if (!item || typeof item !== 'object') return item
    const updated: any = { ...item }
    const name = String(updated?.name || '')
    const serving = String(updated?.serving_size || updated?.servingSize || '')
    const label = replaceWordNumbers(`${name} ${serving}`.trim())
    const servingExplicit = extractExplicitDiscreteCountFromServing(serving)
    const explicitCount = extractExplicitPieceCount(label) || servingExplicit
    const hasPieces =
      (Number.isFinite(Number(updated?.piecesPerServing)) && Number(updated.piecesPerServing) > 0) ||
      (Number.isFinite(Number(updated?.pieces)) && Number(updated.pieces) > 0)

    // If the serving is weight-based and doesn't declare a discrete count, strip any leading count from the name.
    if (hasWeightUnitText(serving) && !explicitCount && /^\s*\d+\s+/.test(name)) {
      updated.name = name.replace(/^\s*\d+\s+/, '').trim()
      changed = true
    }

    if (!explicitCount && hasPieces) {
      delete updated.piecesPerServing
      delete updated.pieces
      changed = true
    }

    return updated
  })

  return { items: next, changed }
}

// When in packaged mode, try to fill missing/zero macros from FatSecret without overwriting existing values.
const enrichPackagedItemsWithFatSecret = async (items: any[]): Promise<{ items: any[]; total: any | null }> => {
  const enriched: any[] = [];
  let changed = false;

  for (const item of items) {
    const next = { ...item };
    const query = [item.brand, item.name].filter(Boolean).join(' ').trim();
    const hasMissingMacros =
      next.calories == null ||
      next.protein_g == null ||
      next.carbs_g == null ||
      next.fat_g == null ||
      next.fiber_g == null ||
      next.sugar_g == null ||
      next.calories === 0;

    if (query && hasMissingMacros) {
      try {
        const fsResults = await searchFatSecretFoods(query, { pageSize: 1 });
        const candidate = fsResults?.[0];
        if (candidate) {
          const maybe = (key: keyof typeof candidate, fallback: any) =>
            candidate[key] !== null && candidate[key] !== undefined ? candidate[key] : fallback;

          if (candidate.serving_size && !next.serving_size) {
            next.serving_size = candidate.serving_size;
          }
          if (next.calories == null || next.calories === 0) next.calories = maybe('calories', next.calories);
          if (next.protein_g == null) next.protein_g = maybe('protein_g', next.protein_g);
          if (next.carbs_g == null) next.carbs_g = maybe('carbs_g', next.carbs_g);
          if (next.fat_g == null) next.fat_g = maybe('fat_g', next.fat_g);
          if (next.fiber_g == null) next.fiber_g = maybe('fiber_g', next.fiber_g);
          if (next.sugar_g == null) next.sugar_g = maybe('sugar_g', next.sugar_g);
          changed = true;
        }
      } catch (err) {
        console.warn('FatSecret enrichment failed (non-fatal)', err);
      }
    }

    enriched.push(next);
  }

  return {
    items: enriched,
    total: changed ? computeTotalsFromItems(enriched) : null,
  };
};

// Lightweight enrichment for struggling items using FatSecret without overriding decent AI values.
// Only runs when calories are missing/zero OR all macros are missing/zero.
const enrichItemsWithFatSecretIfMissing = async (items: any[]): Promise<{ items: any[]; total: any | null; changed: boolean }> => {
  if (!Array.isArray(items) || items.length === 0) {
    return { items, total: null, changed: false };
  }

  const enriched: any[] = [];
  let changed = false;

  for (const item of items) {
    const next = { ...item };
    const query = [item.brand, item.name].filter(Boolean).join(' ').trim();
    const calories = Number(item?.calories ?? 0);
    const protein = Number(item?.protein_g ?? 0);
    const carbs = Number(item?.carbs_g ?? 0);
    const fat = Number(item?.fat_g ?? 0);
    const macrosMissing =
      (!Number.isFinite(calories) || calories === 0) &&
      (!Number.isFinite(protein) || protein === 0) &&
      (!Number.isFinite(carbs) || carbs === 0) &&
      (!Number.isFinite(fat) || fat === 0);
    const caloriesMissingOrZero = !Number.isFinite(calories) || calories === 0;

    // Only attempt enrichment when we truly lack data
    if (!query || (!macrosMissing && !caloriesMissingOrZero)) {
      enriched.push(next);
      continue;
    }

    try {
      const fsResults = await searchFatSecretFoods(query, { pageSize: 1 });
      const candidate = fsResults?.[0];
      if (candidate) {
        const maybe = (key: keyof typeof candidate, fallback: any) =>
          candidate[key] !== null && candidate[key] !== undefined ? candidate[key] : fallback;

        if (caloriesMissingOrZero) next.calories = maybe('calories', next.calories);
        if (!Number.isFinite(protein) || protein === 0) next.protein_g = maybe('protein_g', next.protein_g);
        if (!Number.isFinite(carbs) || carbs === 0) next.carbs_g = maybe('carbs_g', next.carbs_g);
        if (!Number.isFinite(fat) || fat === 0) next.fat_g = maybe('fat_g', next.fat_g);
        if (!next.serving_size && candidate.serving_size) next.serving_size = candidate.serving_size;

        // Do not override non-zero values; only fill missing/zero
        changed = true;
      }
    } catch (err) {
      console.warn('FatSecret enrichment (missing macros) failed (non-fatal)', err);
    }

    enriched.push(next);
  }

  return {
    items: enriched,
    total: changed ? computeTotalsFromItems(enriched) : null,
    changed,
  };
};

const normalizeLookupQuery = (raw: string): string => {
  const cleaned = replaceWordNumbers(String(raw || ''))
    .replace(/^\s*\d+(?:\.\d+)?\s+/, '')
    .replace(/[^a-z0-9\s]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.toLowerCase();
};

const scoreLookupNameMatch = (queryNorm: string, candidateName: string): number => {
  if (!queryNorm) return 0;
  const nameNorm = normalizeLookupQuery(candidateName);
  if (!nameNorm) return 0;
  if (nameNorm === queryNorm) return 100;
  if (nameNorm.startsWith(queryNorm)) return 80;
  if (nameNorm.includes(queryNorm)) return 60;
  const tokens = queryNorm.split(' ').filter(Boolean);
  if (tokens.length === 0) return 0;
  const hitCount = tokens.filter((t) => nameNorm.includes(t)).length;
  return hitCount * 10;
};

const getItemWeightInGrams = (item: any): number | null => {
  const customGrams = Number(item?.customGramsPerServing);
  if (Number.isFinite(customGrams) && customGrams > 0) return customGrams;
  const customMl = Number(item?.customMlPerServing);
  if (Number.isFinite(customMl) && customMl > 0) return customMl;
  const serving = item?.serving_size || item?.servingSize;
  const parsed = parseServingWeight(serving);
  if (Number.isFinite(parsed) && parsed && parsed > 0) return parsed;
  return null;
};

const FRIED_SEAFOOD_KCAL_PER_100G_FLOOR = 180;
const ROASTED_CHICKEN_KCAL_PER_100G_FLOOR = 150;
const isFriedOrBatteredLabel = (label: string) =>
  /\b(fried|battered|breaded|crumbed|tempura|beer\b)\b/i.test(label || '');
const isSeafoodLabel = (label: string) =>
  /\b(fish|fillet|seafood|shrimp|prawn|calamari|squid|scallop|crab|lobster)\b/i.test(label || '');
const isRoastedChickenLabel = (label: string) =>
  /\b(chicken|rotisserie)\b/i.test(label || '') && /\b(roasted|grilled|baked|rotisserie)\b/i.test(label || '');

const applyFriedSeafoodCalorieFloor = (items: any[]): { items: any[]; changed: boolean } => {
  if (!Array.isArray(items) || items.length === 0) {
    return { items, changed: false };
  }

  let changed = false;
  const nextItems = items.map((item) => {
    const label = `${item?.name || ''} ${item?.serving_size || ''}`.trim();
    if (!label) return item;
    if (!isFriedOrBatteredLabel(label) || !isSeafoodLabel(label)) return item;

    const weight = getItemWeightInGrams(item);
    if (!Number.isFinite(weight) || !weight || weight <= 0) return item;

    const calories = Number(item?.calories ?? 0);
    if (!Number.isFinite(calories) || calories <= 0) return item;

    const per100 = (calories / weight) * 100;
    if (!Number.isFinite(per100) || per100 >= FRIED_SEAFOOD_KCAL_PER_100G_FLOOR) return item;

    const targetCalories = Math.round((weight * FRIED_SEAFOOD_KCAL_PER_100G_FLOOR) / 100);
    const scale = targetCalories / calories;
    const scaleMacro = (value: any, decimals = 1) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return value;
      const factor = Math.pow(10, decimals);
      return Math.round(num * scale * factor) / factor;
    };

    const next = { ...item };
    next.calories = targetCalories;
    if (next.protein_g != null) next.protein_g = scaleMacro(next.protein_g);
    if (next.carbs_g != null) next.carbs_g = scaleMacro(next.carbs_g);
    if (next.fat_g != null) next.fat_g = scaleMacro(next.fat_g);
    if (next.fiber_g != null) next.fiber_g = scaleMacro(next.fiber_g);
    if (next.sugar_g != null) next.sugar_g = scaleMacro(next.sugar_g);
    changed = true;
    return next;
  });

  return { items: nextItems, changed };
};

const applyRoastedChickenCalorieFloor = (items: any[]): { items: any[]; changed: boolean } => {
  if (!Array.isArray(items) || items.length === 0) {
    return { items, changed: false };
  }

  let changed = false;
  const nextItems = items.map((item) => {
    const label = `${item?.name || ''} ${item?.serving_size || ''}`.trim();
    if (!label) return item;
    if (!isRoastedChickenLabel(label)) return item;

    const weight = getItemWeightInGrams(item);
    if (!Number.isFinite(weight) || !weight || weight <= 0) return item;

    const calories = Number(item?.calories ?? 0);
    if (!Number.isFinite(calories) || calories <= 0) return item;

    const per100 = (calories / weight) * 100;
    if (!Number.isFinite(per100) || per100 >= ROASTED_CHICKEN_KCAL_PER_100G_FLOOR) return item;

    const targetCalories = Math.round((weight * ROASTED_CHICKEN_KCAL_PER_100G_FLOOR) / 100);
    const scale = targetCalories / calories;
    const scaleMacro = (value: any, decimals = 1) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return value;
      const factor = Math.pow(10, decimals);
      return Math.round(num * scale * factor) / factor;
    };

    const next = { ...item };
    next.calories = targetCalories;
    if (next.protein_g != null) next.protein_g = scaleMacro(next.protein_g);
    if (next.carbs_g != null) next.carbs_g = scaleMacro(next.carbs_g);
    if (next.fat_g != null) next.fat_g = scaleMacro(next.fat_g);
    if (next.fiber_g != null) next.fiber_g = scaleMacro(next.fiber_g);
    if (next.sugar_g != null) next.sugar_g = scaleMacro(next.sugar_g);
    changed = true;
    return next;
  });

  return { items: nextItems, changed };
};

const selectDatabaseCandidate = (query: string, candidates: any[], aiPer100?: number | null) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const queryNorm = normalizeLookupQuery(query);
  const candidatesWithMetrics: Array<{ candidate: any; weight: number; per100: number; score: number }> = [];
  for (const candidate of candidates) {
    const weight = parseServingWeight(candidate?.serving_size || null);
    if (!weight || weight <= 0 || weight > 5000) continue;
    const calories = Number(candidate?.calories ?? 0);
    if (!Number.isFinite(calories) || calories <= 0) continue;
    const per100 = (calories / weight) * 100;
    if (!Number.isFinite(per100) || per100 <= 0) continue;
    const sourceBonus = candidate?.source === 'usda' ? 3 : candidate?.source === 'fatsecret' ? 2 : 1;
    const score = scoreLookupNameMatch(queryNorm, candidate?.name || '') + sourceBonus;
    candidatesWithMetrics.push({ candidate, weight, per100, score });
  }
  if (candidatesWithMetrics.length === 0) return null;

  const per100Values = candidatesWithMetrics.map((entry) => entry.per100).sort((a, b) => a - b);
  const medianPer100 =
    per100Values.length === 0
      ? null
      : per100Values.length % 2 === 1
      ? per100Values[Math.floor(per100Values.length / 2)]
      : (per100Values[per100Values.length / 2 - 1] + per100Values[per100Values.length / 2]) / 2;

  const aiPer100Safe = Number.isFinite(Number(aiPer100)) ? Number(aiPer100) : null;
  const aiTooLow = aiPer100Safe && medianPer100 ? aiPer100Safe < medianPer100 * 0.85 : false;
  const aiTooHigh = aiPer100Safe && medianPer100 ? aiPer100Safe > medianPer100 * 1.2 : false;

  let pool = candidatesWithMetrics;
  if (aiPer100Safe && aiPer100Safe > 0 && !aiTooLow) {
    const lowerOrNear = candidatesWithMetrics.filter((entry) => entry.per100 <= aiPer100Safe * 1.05);
    if (lowerOrNear.length > 0) {
      pool = lowerOrNear;
    }
  }

  pool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (aiTooLow) return b.per100 - a.per100;
    if (aiTooHigh) return a.per100 - b.per100;
    return b.per100 - a.per100;
  });
  return { candidate: pool[0].candidate, weight: pool[0].weight, score: pool[0].score };
};

type DbOutlierOptions = {
  maxItems?: number;
  outlierRatio?: number;
  allowIncrease?: boolean;
  preferSource?: 'usda' | 'fatsecret' | 'auto';
};

// Database-backed calibration for single foods when AI macros look wildly off vs USDA/FatSecret.
const enrichItemsWithDatabaseIfOutlier = async (
  items: any[],
  options: DbOutlierOptions = {},
): Promise<{ items: any[]; total: any | null; changed: boolean }> => {
  if (!Array.isArray(items) || items.length === 0) {
    return { items, total: null, changed: false };
  }

  const maxItemsRaw = Number(options?.maxItems);
  const maxItems = Number.isFinite(maxItemsRaw) && maxItemsRaw > 0 ? Math.floor(maxItemsRaw) : 1;
  const outlierRatioRaw = Number(options?.outlierRatio);
  const OUTLIER_RATIO = Number.isFinite(outlierRatioRaw) && outlierRatioRaw > 0 ? outlierRatioRaw : 0.2;
  const allowIncrease = options?.allowIncrease === true;
  let checked = 0;
  let changed = false;
  const nextItems = items.map((item) => ({ ...item }));

  const isPreparedFoodName = (name: string) =>
    /\b(roast|roasted|rotisserie|fried|grilled|baked|bbq|barbecue|smoked|whole|cooked)\b/i.test(name || '');

  for (const item of nextItems) {
    if (checked >= maxItems) break;

    const weight = getItemWeightInGrams(item);
    if (!weight || weight < 15) continue;

    const calories = Number(item?.calories ?? 0);
    if (!Number.isFinite(calories) || calories <= 0) continue;

    const query = normalizeLookupQuery(item?.name || '');
    if (!query) continue;

    checked += 1;

    let dbResults: any[] = [];
    try {
      const preferSource =
        options?.preferSource && options.preferSource !== 'auto'
          ? options.preferSource
          : isPreparedFoodName(query)
          ? 'fatsecret'
          : 'usda';
      dbResults = await lookupFoodNutrition(query, {
        preferSource,
        maxResults: 3,
        usdaDataType: 'generic',
      });
    } catch (err) {
      console.warn('Database lookup failed (non-fatal)', err);
      continue;
    }

    const aiPer100 = (calories / weight) * 100;
    const selected = selectDatabaseCandidate(query, dbResults, aiPer100);
    if (!selected) continue;

    const { candidate, weight: candidateWeight } = selected;
    const candidateCalories = Number(candidate?.calories ?? 0);
    if (!Number.isFinite(candidateCalories) || candidateCalories <= 0) continue;

    const dbPer100 = (candidateCalories / candidateWeight) * 100;
    if (!Number.isFinite(aiPer100) || !Number.isFinite(dbPer100) || dbPer100 <= 0) continue;

    const ratio = Math.abs(aiPer100 - dbPer100) / dbPer100;
    const dbScaledCalories = Math.round(candidateCalories * (weight / candidateWeight));
    const calorieDiff = Math.abs(calories - dbScaledCalories);
    if (ratio < OUTLIER_RATIO && calorieDiff < 180) continue;
    if (!allowIncrease) {
      const aiIsGuess = item?.isGuess === true;
      const aiHigherThanDb = aiPer100 > dbPer100;
      const extremeLow = aiPer100 < dbPer100 * 0.65;
      if (!aiIsGuess && !aiHigherThanDb && !extremeLow) continue;
    }

    const scale = weight / candidateWeight;
    const scaleMacro = (value: any, decimals = 1) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return null;
      const factor = Math.pow(10, decimals);
      return Math.round(num * scale * factor) / factor;
    };

    item.calories = dbScaledCalories;
    if (candidate?.protein_g !== null && candidate?.protein_g !== undefined) {
      item.protein_g = scaleMacro(candidate.protein_g);
    }
    if (candidate?.carbs_g !== null && candidate?.carbs_g !== undefined) {
      item.carbs_g = scaleMacro(candidate.carbs_g);
    }
    if (candidate?.fat_g !== null && candidate?.fat_g !== undefined) {
      item.fat_g = scaleMacro(candidate.fat_g);
    }
    if (candidate?.fiber_g !== null && candidate?.fiber_g !== undefined) {
      item.fiber_g = scaleMacro(candidate.fiber_g);
    }
    if (candidate?.sugar_g !== null && candidate?.sugar_g !== undefined) {
      item.sugar_g = scaleMacro(candidate.sugar_g);
    }

    changed = true;
  }

  return {
    items: nextItems,
    total: changed ? computeTotalsFromItems(nextItems) : null,
    changed,
  };
};

// Optional: decode barcode from label image (OpenAI vision quick pass).
const fetchOpenFoodFactsByBarcode = async (barcode: string): Promise<any | null> => {
  try {
    if (!barcode || barcode.trim().length < 6) return null;
    const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'helfi-app/1.0 (support@helfi.ai)' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const nutr = p.nutriments || {};
    const servingSize =
      (p.serving_size && String(p.serving_size).trim()) ||
      (nutr['serving_size'] && String(nutr['serving_size']).trim()) ||
      null;
    const get = (k: string) => {
      const v = nutr[k];
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const calories = get('energy-kcal_serving') ?? get('energy_serving') ?? get('energy-kcal_100g') ?? get('energy_100g');
    const protein_g = get('proteins_serving') ?? get('proteins_100g');
    const carbs_g = get('carbohydrates_serving') ?? get('carbohydrates_100g');
    const fat_g = get('fat_serving') ?? get('fat_100g');
    const fiber_g = get('fiber_serving') ?? get('fiber_100g');
    const sugar_g = get('sugars_serving') ?? get('sugars_100g');
    return {
      name: p.product_name || p.brands || 'Packaged item',
      brand: p.brands || null,
      serving_size: servingSize,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      sugar_g,
    };
  } catch (err) {
    console.warn('OpenFoodFacts barcode lookup failed', err);
    return null;
  }
};

// Heuristic correction for discrete foods where the serving label clearly
// describes multiple units (e.g. "3 large eggs", "4 slices bacon") but the
// calories/macros look like a single unit. This runs **after** we have parsed
// ITEMS_JSON and before values are sent to the Food Diary UI.
const harmonizeDiscretePortionItems = (
  items: any[],
  options?: { applyWeightDefaults?: boolean },
): { items: any[]; total: any | null } => {
  if (!Array.isArray(items) || items.length === 0) {
    return { items, total: null };
  }

  const cloned = items.map((item) => ({ ...item }));
  const applyWeightDefaults = options?.applyWeightDefaults !== false;

  const containsAny = (text: string, keywords: string[]): boolean => {
    const lower = text.toLowerCase();
    return keywords.some((k) => lower.includes(k));
  };

  const EGG_KEYWORDS = ['egg', 'eggs', 'scrambled egg', 'scrambled eggs', 'omelette', 'omelet'];
  const BACON_KEYWORDS = ['bacon', 'rasher', 'rashers', 'bacon strip', 'bacon strips'];
  const PATTY_KEYWORDS = ['patty', 'pattie', 'patties', 'burger patty', 'beef patty'];
  const CHEESE_KEYWORDS = ['cheese', 'cheddar', 'mozzarella', 'slice of cheese', 'cheese slice'];
  const DRUMSTICK_KEYWORDS = ['drumstick', 'drumsticks', 'chicken drumstick', 'chicken leg', 'chicken legs'];
  const DISCRETE_DEFAULTS: Array<{
    key: string;
    keywords: string[];
    gramsPerPiece: number;
    caloriesPerPiece: number;
    proteinPerPiece?: number;
    fatPerPiece?: number;
    label?: (piecesPerServing: number) => string;
  }> = [
    {
      key: 'patty',
      keywords: PATTY_KEYWORDS,
      gramsPerPiece: 115,
      caloriesPerPiece: 250,
      proteinPerPiece: 22,
      fatPerPiece: 18,
      label: (n) => `${n} patty${n > 1 ? 'ies' : 'y'} (4–6 oz)`,
    },
    {
      key: 'bacon',
      keywords: BACON_KEYWORDS,
      gramsPerPiece: 15,
      caloriesPerPiece: 45,
      proteinPerPiece: 3,
      fatPerPiece: 3.5,
      label: (n) => `${n} slice${n > 1 ? 's' : ''} bacon`,
    },
    {
      key: 'cheese',
      keywords: CHEESE_KEYWORDS,
      gramsPerPiece: 25,
      caloriesPerPiece: 100,
      proteinPerPiece: 6,
      fatPerPiece: 9,
      label: (n) => `${n} cheese slice${n > 1 ? 's' : ''}`,
    },
    {
      key: 'egg',
      keywords: EGG_KEYWORDS,
      gramsPerPiece: 50,
      caloriesPerPiece: 70,
      proteinPerPiece: 6,
      fatPerPiece: 5,
      label: (n) => `${n} piece${n > 1 ? 's' : ''}`,
    },
    {
      key: 'drumstick',
      keywords: DRUMSTICK_KEYWORDS,
      gramsPerPiece: 90,
      caloriesPerPiece: 180,
      proteinPerPiece: 13,
      fatPerPiece: 12,
      label: (n) => `${n} drumstick${n > 1 ? 's' : ''}`,
    },
  ];
  const WEIGHT_ONLY_DEFAULTS: Array<{
    keywords: string[];
    gramsPerPiece: number;
  }> = [
    { keywords: ['battered fish', 'fried fish', 'fish fillet', 'fish fingers', 'fish sticks'], gramsPerPiece: 90 },
    { keywords: ['fried shrimp', 'shrimp', 'prawn', 'prawns'], gramsPerPiece: 30 },
    { keywords: ['sausage', 'sausages', 'link', 'links'], gramsPerPiece: 75 },
  ];

  for (const item of cloned) {
    const name = (item?.name || '') as string;
    const servingSize = (item?.serving_size || '') as string;
    const labelSource = replaceWordNumbers(`${name} ${servingSize}`.trim());
    const explicitCount = extractExplicitPieceCount(labelSource);

    const defaults = DISCRETE_DEFAULTS.find((d) => containsAny(labelSource, d.keywords));
    const weightDefaults = WEIGHT_ONLY_DEFAULTS.find((d) => containsAny(labelSource, d.keywords));
    if (!explicitCount) continue;
    const existingServings =
      Number.isFinite(Number(item?.servings)) && Number(item.servings) > 0 ? Number(item.servings) : 1;

    const piecesPerServing = explicitCount;
    const totalPieces = Math.max(1, existingServings * piecesPerServing);

    item.servings = Math.round(existingServings * 1000) / 1000;
    (item as any).piecesPerServing = piecesPerServing;

    if (applyWeightDefaults) {
      const perPieceWeight = defaults?.gramsPerPiece ?? weightDefaults?.gramsPerPiece ?? null;
      if (perPieceWeight && perPieceWeight > 0) {
        const totalWeight = perPieceWeight * piecesPerServing;
        const servingWeight = parseServingWeight(item?.serving_size || null);
        const customWeight = Number(item?.customGramsPerServing);
        const currentWeight =
          Number.isFinite(customWeight) && customWeight > 0
            ? customWeight
            : Number.isFinite(servingWeight) && servingWeight && servingWeight > 0
            ? servingWeight
            : null;
        if (!currentWeight || currentWeight < totalWeight) {
          item.customGramsPerServing = totalWeight;
        }
      }
    }

    if (defaults) {
      // Seed serving_size with a discrete hint when missing so the UI picks up pieces.
      if (!item.serving_size || String(item.serving_size).trim().length === 0) {
        const label =
          defaults.label?.(piecesPerServing) || `${piecesPerServing} piece${piecesPerServing > 1 ? 's' : ''}`;
        item.serving_size = label;
      }

      const totalPiecesForMacros = Math.max(totalPieces, piecesPerServing * item.servings);
      const calories = Number(item?.calories ?? NaN);
      const protein = Number(item?.protein_g ?? NaN);
      const fat = Number(item?.fat_g ?? NaN);

      const perPieceCalories =
        totalPiecesForMacros > 0 && Number.isFinite(calories) ? calories / totalPiecesForMacros : NaN;
      const perPieceProtein =
        totalPiecesForMacros > 0 && Number.isFinite(protein) ? protein / totalPiecesForMacros : NaN;
      const perPieceFat = totalPiecesForMacros > 0 && Number.isFinite(fat) ? fat / totalPiecesForMacros : NaN;

      const caloriesLow = !Number.isFinite(perPieceCalories) || perPieceCalories < defaults.caloriesPerPiece * 0.9;
      const proteinLow =
        defaults.proteinPerPiece === undefined ||
        !Number.isFinite(perPieceProtein) ||
        perPieceProtein < defaults.proteinPerPiece * 0.9;
      const fatLow =
        defaults.fatPerPiece === undefined || !Number.isFinite(perPieceFat) || perPieceFat < defaults.fatPerPiece * 0.9;

      // If the "total" looks like it's only for a single piece, prefer scaling the model's numbers
      // (this keeps photo-specific portion sizes), otherwise fall back to conservative defaults.
      if (caloriesLow && (proteinLow || fatLow)) {
        const looksLikePerPieceCalories = Number.isFinite(calories) && calories >= defaults.caloriesPerPiece * 0.6;
        if (looksLikePerPieceCalories) {
          const mult = totalPiecesForMacros;
          if (Number.isFinite(calories)) item.calories = Math.round(calories * mult);
          const macroFields: Array<keyof typeof item> = ['protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'];
          for (const field of macroFields) {
            const v = Number((item as any)?.[field]);
            if (Number.isFinite(v)) (item as any)[field] = Math.round(v * mult * 10) / 10;
          }
        } else {
          item.calories = Math.round(defaults.caloriesPerPiece * totalPiecesForMacros);
          if (defaults.proteinPerPiece !== undefined) {
            item.protein_g = Math.round(defaults.proteinPerPiece * totalPiecesForMacros * 10) / 10;
          }
          if (defaults.fatPerPiece !== undefined) {
            item.fat_g = Math.round(defaults.fatPerPiece * totalPiecesForMacros * 10) / 10;
          }
        }
      }

      if (
        !item.customGramsPerServing &&
        (!item.serving_size || !String(item.serving_size).toLowerCase().includes('g'))
      ) {
        item.customGramsPerServing = defaults.gramsPerPiece * piecesPerServing;
      }
    }
  }

  const total = computeTotalsFromItems(cloned);
  return { items: cloned, total };
};

// Burger-specific heuristics: ensure core components exist and have realistic macros.
const ensureBurgerComponents = (items: any[] | null, analysis: string | null | undefined): { items: any[]; total: any | null } => {
  const base = Array.isArray(items) ? normalizeGuessFlags(items) : [];
  const text = (analysis || '').toLowerCase();
  const names = base.map((it) => String(it?.name || '').toLowerCase());
  const looksLikeBurger =
    text.includes('burger') ||
    names.some((n) => n.includes('burger') || n.includes('patty') || n.includes('bun'));

  if (!looksLikeBurger) {
    return { items: base, total: computeTotalsFromItems(base) };
  }

  const hasKeyword = (keywords: string[]) =>
    base.some((it) => {
      const n = String(it?.name || '').toLowerCase();
      return keywords.some((k) => n.includes(k));
    });

  const ensureItem = (keywords: string[], createItem: () => any) => {
    if (!hasKeyword(keywords)) {
      base.push({ ...createItem(), isGuess: true });
    }
  };

  // Normalize patties to explicit counts only (avoid inferred pieces).
  base.forEach((it) => {
    const n = String(it?.name || '').toLowerCase();
    if (!n.includes('patty')) return;

    const existingServings =
      Number.isFinite(Number(it.servings)) && Number(it.servings) > 0 ? Number(it.servings) : 1;
    const nameOnly = replaceWordNumbers(String(it?.name || '').trim());
    const labelSource = replaceWordNumbers(`${it?.name || ''} ${it?.serving_size || ''}`.trim());
    const servingSizeRaw = String(it?.serving_size || '');
    const servingHasWeight = hasWeightUnitText(servingSizeRaw);
    const servingExplicit = extractExplicitDiscreteCountFromServing(servingSizeRaw);
    const explicitCount = servingExplicit ?? (servingHasWeight ? extractExplicitPieceCount(labelSource) : (extractExplicitPieceCount(nameOnly) ?? extractExplicitPieceCount(labelSource)));

    it.servings = Math.round(existingServings * 1000) / 1000;

    if (!explicitCount) {
      delete (it as any).piecesPerServing;
      delete (it as any).pieces;
      if (/^\s*\d+\s+/.test(String(it?.name || ''))) {
        it.name = String(it.name || '').replace(/^\s*\d+\s+/, '').trim();
      }
      if (!it.serving_size) {
        it.serving_size = '115 g';
      }
      if (!it.customGramsPerServing) {
        it.customGramsPerServing = 115;
      }

      const calories = Number(it.calories ?? NaN);
      const protein = Number(it.protein_g ?? NaN);
      const fat = Number(it.fat_g ?? NaN);
      if (!Number.isFinite(calories) || calories < 200) {
        it.calories = 250;
      }
      if (!Number.isFinite(protein) || protein < 18) {
        it.protein_g = 22;
      }
      if (!Number.isFinite(fat) || fat < 12) {
        it.fat_g = 18;
      }
      return;
    }

    const piecesPerServing = explicitCount;
    const totalPieces = Math.max(1, piecesPerServing * existingServings);
    (it as any).piecesPerServing = piecesPerServing;

    const perPieceCalories =
      totalPieces > 0 && Number.isFinite(Number(it.calories)) ? Number(it.calories) / totalPieces : 0;
    const perPieceProtein =
      totalPieces > 0 && Number.isFinite(Number(it.protein_g)) ? Number(it.protein_g) / totalPieces : 0;
    const perPieceFat =
      totalPieces > 0 && Number.isFinite(Number(it.fat_g)) ? Number(it.fat_g) / totalPieces : 0;

    if (!Number.isFinite(perPieceCalories) || perPieceCalories < 200) {
      it.calories = Math.round(250 * totalPieces);
    }
    if (!Number.isFinite(perPieceProtein) || perPieceProtein < 18) {
      it.protein_g = Math.round(22 * totalPieces * 10) / 10;
    }
    if (!Number.isFinite(perPieceFat) || perPieceFat < 12) {
      it.fat_g = Math.round(18 * totalPieces * 10) / 10;
    }
    if (!it.serving_size) {
      it.serving_size = `${piecesPerServing} patty${piecesPerServing > 1 ? 'ies' : 'y'} (4–6 oz)`;
    }
    if (!it.customGramsPerServing) {
      it.customGramsPerServing = piecesPerServing * 115;
    }
  });

  ensureItem(['patty', 'pattie'], () => ({
    name: 'Beef patty',
    brand: null,
    serving_size: '115 g',
    servings: 1,
    calories: 250,
    protein_g: 22,
    carbs_g: 0,
    fat_g: 18,
    fiber_g: 0,
    sugar_g: 0,
    customGramsPerServing: 115,
  }));

  ensureItem(['bun'], () => ({
    name: 'Burger bun',
    brand: null,
    serving_size: '1 bun',
    servings: 1,
    calories: 150,
    protein_g: 5,
    carbs_g: 28,
    fat_g: 3,
    fiber_g: 1,
    sugar_g: 3,
  }));

  ensureItem(['cheese'], () => ({
    name: 'Cheddar cheese slice',
    brand: null,
    serving_size: '25 g',
    servings: 1,
    calories: 100,
    protein_g: 6,
    carbs_g: 1,
    fat_g: 9,
    fiber_g: 0,
    sugar_g: 0,
    customGramsPerServing: 25,
  }));

  ensureItem(['bacon'], () => ({
    name: 'Bacon slice',
    brand: null,
    serving_size: '15 g',
    servings: 1,
    calories: 45,
    protein_g: 3,
    carbs_g: 0,
    fat_g: 3.5,
    fiber_g: 0,
    sugar_g: 0,
    customGramsPerServing: 15,
  }));

  ensureItem(['lettuce'], () => ({
    name: 'Lettuce',
    brand: null,
    serving_size: '10 g',
    servings: 1,
    calories: 5,
    protein_g: 0.5,
    carbs_g: 1,
    fat_g: 0,
    fiber_g: 0.5,
    sugar_g: 0,
  }));

  ensureItem(['tomato'], () => ({
    name: 'Tomato',
    brand: null,
    serving_size: '40 g',
    servings: 1,
    calories: 10,
    protein_g: 0.5,
    carbs_g: 2,
    fat_g: 0,
    fiber_g: 0.5,
    sugar_g: 1.5,
  }));

  ensureItem(['sauce', 'mayo', 'mayonnaise', 'ketchup', 'mustard'], () => ({
    name: 'Burger sauce',
    brand: null,
    serving_size: '1 tbsp',
    servings: 1,
    calories: 100,
    protein_g: 0,
    carbs_g: 1,
    fat_g: 11,
    fiber_g: 0,
    sugar_g: 1,
  }));

  const total = computeTotalsFromItems(base);
  return { items: base, total };
};

// Detect when the AI returned a generic single card instead of per-component items
const looksLikeSingleGenericItem = (items: any[] | null | undefined): boolean => {
  if (!Array.isArray(items) || items.length !== 1) return false;
  const item = items[0] || {};
  const name = String(item.name || '').trim().toLowerCase();
  const servingSize = String(item.serving_size || '').trim().toLowerCase();
  const genericNames = ['meal', 'food', 'entry'];
  const hasMinimalDetail = !servingSize || servingSize === '1 serving';
  return genericNames.includes(name) || hasMinimalDetail;
};

const looksLikeMultiIngredientSummary = (items: any[] | null | undefined): boolean => {
  if (!Array.isArray(items) || items.length !== 1) return false;
  const item = items[0] || {};
  const label = `${String(item?.name || '')} ${String(item?.serving_size || '')}`.toLowerCase();
  if (!label.trim()) return false;
  if (label.includes('components')) return true;
  const hasListDelimiters = label.includes(',') || label.includes(' and ') || label.includes(' with ');
  const wordCount = label.split(/\s+/).filter(Boolean).length;
  return hasListDelimiters && wordCount >= 6;
};

const normalizeSummaryLabel = (value: string): string => {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const hasSummaryDelimiter = (label: string): boolean => {
  return /,|\band\b|\bwith\b|\bplus\b|&/.test(label || '');
};

const isSubstantiveItem = (item: any): boolean => {
  const calories = Number(item?.calories ?? 0);
  if (Number.isFinite(calories) && calories >= 50) return true;
  const protein = Number(item?.protein_g ?? 0);
  const carbs = Number(item?.carbs_g ?? 0);
  const fat = Number(item?.fat_g ?? 0);
  return (
    (Number.isFinite(protein) && protein >= 5) ||
    (Number.isFinite(carbs) && carbs >= 5) ||
    (Number.isFinite(fat) && fat >= 5)
  );
};

const removeSummaryDuplicateItems = (
  items: any[],
): { items: any[]; removed: number } => {
  if (!Array.isArray(items) || items.length < 2) return { items, removed: 0 };
  const normalized = items.map((item) => {
    const name = normalizeSummaryLabel(item?.name || '');
    const label = normalizeSummaryLabel(`${item?.name || ''} ${item?.serving_size || ''}`);
    return { item, name, label };
  });
  const removeIndices = new Set<number>();
  normalized.forEach((entry, idx) => {
    if (!entry.label || !hasSummaryDelimiter(entry.label)) return;
    let hasSubstantiveMatch = false;
    for (let j = 0; j < normalized.length; j += 1) {
      if (j === idx) continue;
      const other = normalized[j];
      if (!other.name || other.name.length < 4) continue;
      if (!entry.label.includes(other.name)) continue;
      if (isSubstantiveItem(other.item)) {
        hasSubstantiveMatch = true;
        break;
      }
    }
    if (hasSubstantiveMatch) {
      removeIndices.add(idx);
    }
  });
  if (removeIndices.size === 0) return { items, removed: 0 };
  const filtered = items.filter((_, idx) => !removeIndices.has(idx));
  return { items: filtered, removed: removeIndices.size };
};

const itemsResultIsInvalid = (items: any[] | null | undefined, requireMultiple: boolean): boolean => {
  if (!Array.isArray(items) || items.length === 0) return true;
  if (looksLikeSingleGenericItem(items) || looksLikeMultiIngredientSummary(items)) return true;
  if (requireMultiple && items.length < 2) return true;
  return false;
};

const splitAnalysisIntoComponents = (analysis: string | null | undefined): string[] => {
  if (!analysis) return [];
  const cleaned = analysis.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/(?:,| and | with | plus | & )/gi)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);
  const unique: string[] = [];
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (!unique.some((u) => u.toLowerCase() === lower)) {
      unique.push(p);
    }
    if (unique.length >= 4) break;
  }
  return unique;
};

const looksLikeNonFoodArtifact = (nameRaw: any): boolean => {
  const name = String(nameRaw || '').trim();
  if (!name) return true;
  if (name.length > 140) return true;

  const lower = name.toLowerCase();
  // JSON/metadata artifacts accidentally parsed into items
  if (lower.includes('<items_json') || lower.includes('</items_json')) return true;
  if (name.includes('{') || name.includes('}') || name.includes('"')) return true;
  if (/^\s*[\[\]\{\}]+\s*$/.test(name)) return true;
  if (/^\s*[a-z_]+\s*:\s*.+$/i.test(name)) return true;
  if (/^\s*"(?:brand|serving_size|servings|calories|protein_g|carbs_g|fat_g|fiber_g|sugar_g)"\s*:/i.test(name)) return true;
  if (/^\s*(?:brand|serving_size|servings|calories|protein_g|carbs_g|fat_g|fiber_g|sugar_g)\s*:/i.test(name)) return true;
  if (/^\s*\d+\s*"(?:calories|protein|carbs|fat|fiber|sugar)/i.test(name)) return true;

  // Reject lines that are basically just numbers/symbols
  if (!/[a-z]/i.test(name)) return true;

  return false;
};

const sanitizeStructuredItems = (items: any[]): any[] => {
  if (!Array.isArray(items)) return [];
  const cleaned = items
    .filter((it) => it && typeof it === 'object')
    .map((it) => ({
      ...it,
      name: typeof it.name === 'string' ? it.name.trim() : '',
    }))
    .filter((it) => it.name && !looksLikeNonFoodArtifact(it.name));

  // Prevent runaway lists from exploding the UI
  return cleaned.length > 10 ? cleaned.slice(0, 10) : cleaned;
};

const itemsCoverComponentList = (items: any[] | null | undefined, components: string[]): boolean => {
  if (!Array.isArray(components) || components.length === 0) return true;
  if (!Array.isArray(items) || items.length === 0) return false;
  const normalizedComponents = components.map((c) => normalizeComponentName(c)).filter(Boolean);
  if (normalizedComponents.length === 0) return true;
  const labels = items.map((item: any) =>
    normalizeComponentName(`${item?.name || ''} ${item?.serving_size || ''}`),
  );
  return normalizedComponents.every((comp) =>
    labels.some((label) => label.includes(comp) || comp.includes(label)),
  );
};

const itemsAreUsable = (
  items: any[] | null | undefined,
  requiredCount: number,
  requireMultiple: boolean,
): boolean => {
  if (!Array.isArray(items) || items.length === 0) return false;
  if (looksLikeSingleGenericItem(items) || looksLikeMultiIngredientSummary(items)) return false;
  if (requireMultiple && items.length < Math.max(2, requiredCount)) return false;
  return true;
};

const buildMultiComponentFallback = (
  analysis: string | null | undefined,
  total: any | null | undefined,
): { items: any[]; total: any | null } => {
  const baseNames = splitAnalysisIntoComponents(analysis);
  while (baseNames.length < 2) {
    baseNames.push(baseNames.length === 0 ? 'Component 1' : `Component ${baseNames.length + 1}`);
  }
  const count = baseNames.length;
  const pick = (key: keyof typeof total) => {
    const val = total && typeof total[key] === 'number' ? Number(total[key]) : null;
    return Number.isFinite(val) && val !== null ? Math.max(0, val) / count : null;
  };
  const items = baseNames.map((name) => ({
    name,
    brand: null,
    serving_size: '1 serving',
    servings: 1,
    // Leave macros blank so the UI does not equal-split totals; mark as guesses.
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    fiber_g: null,
    sugar_g: null,
    isGuess: true,
  }));
  const synthesizedTotal =
    total && typeof total === 'object' ? total : computeTotalsFromItems(items) || null;
  return { items, total: synthesizedTotal };
};

// Initialize OpenAI client only when API key is available
// Updated: 2025-06-26 - Ensure environment variable is properly loaded
const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
};

export async function POST(req: NextRequest) {
  try {
    console.log('=== FOOD ANALYZER DEBUG START ===');
    let imageHash: string | null = null;
    let imageDataUrl: string | null = null;
    let imageMeta: ReturnType<typeof getImageMetadata> | null = null;
    let imageBytes: number | null = null;
    let imageMime: string | null = null;
    let visionDetail: "low" | "high" = "low";
    
    // Check authentication - pass request headers for proper session resolution
    const session = await getServerSession(authOptions);
    let userEmail: string | null = session?.user?.email ?? null;
    let usedTokenFallback = false;

    // Some recent route-handler changes made getServerSession unreliable for this endpoint.
    // Safeguard the analyzer by grabbing the JWT directly if the normal session lookup fails.
    if (!userEmail) {
      try {
        const token = await getToken({
          req,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        });
        if (token?.email) {
          userEmail = token.email as string;
          usedTokenFallback = true;
        }
      } catch (tokenError) {
        console.error('Failed to read JWT token for food analyzer auth:', tokenError);
      }
    }

    console.log('Session check:', { hasSession: !!session, hasEmail: !!userEmail, usedTokenFallback });
    if (!userEmail) {
      console.error('❌ Authentication failed - no valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedEmail = userEmail.trim().toLowerCase();

    const findOrCreateUser = async (includeRelations: any = { subscription: true }): Promise<any> => {
      try {
        const existing = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: includeRelations,
        });
        if (existing) return existing;

        console.warn('⚠️ Food analyzer could not find user record. Auto-creating placeholder record for', normalizedEmail);
        await prisma.user.create({
          data: {
            email: normalizedEmail,
            name: session?.user?.name || normalizedEmail.split('@')[0],
            emailVerified: new Date(),
          },
        });

        return await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: includeRelations,
        });
      } catch (creationError) {
        console.error('❌ Failed to find or create user for food analyzer:', creationError);
        return null;
      }
    };

    // Find user
    const user = await findOrCreateUser({ subscription: true });

    if (user?.id) {
      logServerCall({
        feature: 'foodAnalysis',
        endpoint: '/api/analyze-food',
        kind: 'analysis',
      }).catch((error) => {
        console.error('❌ Failed to log food analysis call:', error);
      });
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let allergySettings: { allergies: string[]; diabetesType?: string } = { allergies: [], diabetesType: '' };
    try {
      const storedAllergies = await prisma.healthGoal.findFirst({
        where: { userId: user.id, name: '__ALLERGIES_DATA__' },
      });
      if (storedAllergies?.category) {
        const parsed = JSON.parse(storedAllergies.category);
        allergySettings = {
          allergies: Array.isArray(parsed?.allergies)
            ? parsed.allergies.filter((a: any) => typeof a === 'string' && a.trim().length > 0)
            : [],
          diabetesType: typeof parsed?.diabetesType === 'string' ? parsed.diabetesType : '',
        };
      }
    } catch (error) {
      console.warn('⚠️ Could not load allergy settings for analyzer:', error);
    }

    let dietTypes: string[] = []
    try {
      const storedDiet = await prisma.healthGoal.findFirst({
        where: { userId: user.id, name: '__DIET_PREFERENCE__' },
      })
      if (storedDiet?.category) {
        const parsed = JSON.parse(storedDiet.category)
        const raw = Array.isArray(parsed?.dietTypes) ? parsed.dietTypes : parsed?.dietType
        dietTypes = normalizeDietTypes(raw)
      }
    } catch (error) {
      console.warn('⚠️ Could not load diet preference for analyzer:', error)
    }

    // We'll check free use, premium, or credits below
    let creditManager: CreditManager | null = null;
    
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ OpenAI API key not configured');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }
    
    console.log('✅ OpenAI API key configured');

    // Quick rate limit to stop accidental loops or repeated triggers
    const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown';
    const rateKey = user.id ? `user:${user.id}` : `ip:${clientIp}`;
    const rateCheck = await consumeRateLimit('food-analyzer', rateKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, Math.ceil(rateCheck.retryAfterMs / 1000));
      return NextResponse.json(
        { error: 'Too many analyses in a short period. Please wait and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const contentType = req.headers.get('content-type');
    console.log('📝 Content-Type:', contentType);
    let messages: any[] = [];
    // Backward-compatible enhancement flags
    // Default ON for best accuracy
    let wantStructured = true; // when true, we also return items[] and totals
    let preferMultiDetect = true; // default ON: detect multiple foods without changing output line
    let analysisMode: 'auto' | 'packaged' | 'meal' = 'auto';
    let packagedMode = false;
    let labelScan = false;
    let forceFresh = false;
    let packagedEmphasisBlock = '';
    let analysisHint = '';
    let feedbackDown = false;
    let feedbackReasons: string[] = [];
    let feedbackMissing = false;
    let feedbackItems: string[] = [];

    const setAnalysisMode = (modeRaw: any) => {
      const normalized = String(modeRaw || 'auto').toLowerCase();
      if (normalized === 'packaged' || normalized === 'meal') {
        analysisMode = normalized as 'packaged' | 'meal';
      } else {
        analysisMode = 'auto';
      }
      packagedMode = analysisMode === 'packaged';
      packagedEmphasisBlock = packagedMode
        ? `
PACKAGED MODE SELECTED:
- Use ONLY the per-serving column from the nutrition label (ignore per-100g values).
- Always read the first column that lists "Quantity per serving" (or similar).
- Copy the per-serving numbers verbatim (calories, protein, carbs, fat, fiber, sugar) and the printed serving size.
- If you cannot read the per-serve numbers clearly, set calories/protein/carbs/fat/fiber/sugar to null (do not guess).
- Do NOT scale from per-100g to per-serving; do NOT "correct" the label.
- Keep serving_size as written on the label and set servings to 1 by default (user will adjust).`
        : '';
    };

    let isReanalysis = false;
    if (contentType?.includes('application/json')) {
      // Handle text-based food analysis
      const body = await req.json();
      const {
        textDescription,
        foodType,
        isReanalysis: reFlag,
        returnItems,
        multi,
        analysisMode: bodyMode,
        labelScan: labelScanFlag,
        forceFresh: forceFreshFlag,
        analysisHint: bodyHint,
      } = body as any;
      isReanalysis = !!reFlag;
      // Default to true unless explicitly disabled
      wantStructured = returnItems !== undefined ? !!returnItems : true;
      preferMultiDetect = multi !== undefined ? !!multi : true;
      setAnalysisMode(bodyMode);
      labelScan = Boolean(labelScanFlag);
      forceFresh = Boolean(forceFreshFlag);
      analysisHint = typeof bodyHint === 'string' ? bodyHint : '';
      feedbackReasons = parseFeedbackList((body as any)?.feedbackReasons);
      feedbackDown = Boolean((body as any)?.feedbackDown) || feedbackReasons.length > 0;
      feedbackMissing =
        Boolean((body as any)?.feedbackMissing) ||
        feedbackReasons.some((reason) => /missing ingredients/i.test(String(reason)));
      feedbackItems = sanitizeFeedbackItems(parseFeedbackList((body as any)?.feedbackItems));
      console.log('📝 Text analysis mode:', { textDescription, foodType });

      if (!textDescription) {
        return NextResponse.json(
          { error: 'No food description provided' },
          { status: 400 }
        );
      }

      const cleanedHint = String(analysisHint || '').trim();
      const hintBlock =
        cleanedHint && !packagedMode
          ? `\nUSER HINT (optional): ${cleanedHint}\n- Use this only to disambiguate a tricky item.\n- Do NOT ignore other foods mentioned in the description.\n- Do NOT invent items that are not described.\n`
          : '';
      const feedbackBlock = feedbackDown
        ? `\nFEEDBACK (user reported issues): ${
            feedbackReasons.length ? feedbackReasons.join(', ') : 'Thumbs down'
          }\n${feedbackMissing ? '- Missing ingredients were reported. Re-check for small sides, sauces, and toppings.\n' : ''}${
            feedbackItems.length
              ? `- Previously detected items (include if described/visible, and add anything missing): ${feedbackItems.join(
                  ', ',
                )}.\n`
              : ''
          }- Ensure the final Components line includes every item you list.\n`
        : '';

      messages = [
        {
          role: "user",
          content: `Analyze this food description and provide accurate nutrition information based on the EXACT portion size specified. Be precise about size differences.${hintBlock}${feedbackBlock}

CRITICAL FOR MEALS WITH MULTIPLE COMPONENTS:
- If the description mentions multiple distinct foods (e.g., plate with protein, vegetables, grains, salads, soups, stews, sandwiches with multiple fillings, bowls with toppings), you MUST:
  1. Identify EACH component separately
  2. Estimate portion size for EACH component accurately
  3. Calculate nutrition for EACH component individually
  4. Sum all components to provide TOTAL nutrition values
  5. List components briefly in your description

- For complex meals, be thorough: don't miss side dishes, condiments, dressings, or toppings mentioned
- Estimate portions realistically based on the description
- Only use pieces when a clear count is stated; otherwise use grams/servings (if the count is 1, still write it explicitly, e.g., "1 egg")
- If unsure about a component, estimate conservatively but include it in your totals
- For mixed dishes (salads, soups, stews), break down the main ingredients and sum them

PACKAGED / BRANDED FOODS (VERY IMPORTANT):
- First, decide if this describes a packaged or branded product (box, bag, packet, bottle, can, branded rolls/bread/cereal, etc.).
- If it is packaged and a NUTRITION LABEL is mentioned, treat that label as the SINGLE SOURCE OF TRUTH for calories, protein, carbs, fat, fiber and sugar.
- Do NOT "re-estimate" or adjust the numbers away from the label just because the portion looks small or large – copy the label values faithfully.
- If the description includes both "Per serving" and "Per 100 g", use the "Per serving" values and the serving size wording from the label (e.g. "1 roll (60g)").
- For branded items, put the product brand in the "brand" field (e.g. "Tip Top", "Heinz") and the generic food name in "name" (e.g. "Hot dog roll").
- For packets with multiple identical units (e.g. 6 hot dog rolls), nutrition in ITEMS_JSON for EACH ITEM should be PER ONE ROLL by default with "servings": 1 (the app will multiply when the user eats more than one).
- If the text clearly says the person ate multiple units (e.g. "2 hot dog rolls"), keep the serving_size as on the label (per 1 roll) and set "servings" accordingly (e.g. 2).
${packagedEmphasisBlock}

Keep your explanation concise (2-3 sentences). After the explanation, include a single line exactly in this format:
Components: grilled chicken, white rice, steamed broccoli
- Use plain ingredient names only (no quantities).
- Include every distinct component you mentioned or can see.
- Even for a single-item meal, include one component.
- Do not use placeholders like "component 1", "item 1", or "dessert 1" in the final output.
- The Components line must match the ITEMS_JSON items exactly (no extras, no missing).
Then include a single nutrition line at the end in this exact format:

Calories: [number], Protein: [g], Carbs: [g], Fat: [g]

[Food name/meal description] ([total portion size])

Food description: ${textDescription}
Food type: ${foodType}

${preferMultiDetect ? `The description likely contains multiple foods or components - analyze each one carefully, calculate nutrition for each, then sum the totals.
` : ''}

IMPORTANT: Different sizes have different nutrition values:
- Large egg: ~70 calories, 6g protein
- Medium egg: ~55 calories, 5g protein  
- Small egg: ~45 calories, 4g protein

CRITICAL STRUCTURED OUTPUT RULES:
- ALWAYS return the ITEMS_JSON block and include fiber_g and sugar_g for each item (do not leave as 0 unless truly 0).
- Use household measures and add ounce equivalents in parentheses where appropriate (e.g., "1 cup (8 oz)").
- Item "name" must be the plain ingredient name only (e.g., "grilled salmon", "white rice"). Do NOT prefix names with "several components:", "components:", "meal:", etc.
- Do NOT use placeholder names like "dessert 1", "item 1", or "component 1". Use specific descriptive food names.
- Do NOT treat weights as counts: "8 oz" means weight, NOT "8 pieces". Never prefix an item name with a weight number.
- Only use pieces when a clear count is stated/visible; otherwise use weight/serving size.
- For foods like fries, wedges, rice, pasta, and salads: use weight/serving, not pieces.
- For sliced produce (e.g., avocado slices, tomato slices, cucumber slices): treat it as a PORTION (weight/servings), not a discrete piece count. Prefer a grams estimate or a fraction of the whole food (e.g., "1/4 avocado") and set isGuess: true if uncertain.
- If uncertain about a count, choose a conservative (lower) number and mark isGuess: true.

Examples:
"Medium banana (1 whole)
Calories: 105, Protein: 1g, Carbs: 27g, Fat: 0g"

"Grilled chicken breast (6 oz) with brown rice (1 cup) and steamed broccoli (1 cup)
Calories: 485, Protein: 45g, Carbs: 45g, Fat: 8g"

Pay close attention to portion size words like small, medium, large, or specific measurements. For meals, sum all components. Calculate nutrition accordingly. End your response with the nutrition line exactly once as shown.
${wantStructured ? `
After your explanation and the one-line totals above, also include a compact JSON block between <ITEMS_JSON> and </ITEMS_JSON> with this exact shape for any detected foods:
<ITEMS_JSON>{"items":[{"name":"string","brand":"string or null","serving_size":"string (e.g., '1 slice', '2 patties', '40g', '1 cup (8 oz)')","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"isGuess":false}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}</ITEMS_JSON>

CRITICAL REQUIREMENTS:
- For packaged foods: ALWAYS extract the brand name if visible (e.g., "Burgen", "Heinz", "Nestle"). Set to null if not visible or not applicable.
- For packaged foods: ALWAYS extract the serving size from the label (e.g., "1 slice", "2 cookies", "100g", "1 cup"). This is the DEFAULT serving size per package.
- Set "servings" to 1 as the default (user can adjust this in the UI).
- For multi-item meals: Create separate items for each distinct food component.
- Include ONLY components explicitly mentioned in the description. Do NOT invent typical sides/toppings.
- If you mention a component in the description, it MUST appear in ITEMS_JSON (no exceptions).
- Set "isGuess": true only when the description implies an item but is ambiguous.
- **Set "isGuess": false only for items you can clearly identify with high confidence.**
- **Only use pieces for discrete items when the count is clearly visible/stated (e.g., "2 patties"). Otherwise use grams/serving and leave pieces out.**
- Do not use "pieces" semantics for sliced produce; use portion/grams as described above.
- Nutrition values should be PER SERVING (not total) for each item.
- The "total" object should sum all items multiplied by their servings.
` : ''}`
        }
      ];
    } else {
      // Handle image-based food analysis
      console.log('🖼️ Image analysis mode');
      
      const formData = await req.formData();
      const imageFile = formData.get('image') as File;
      setAnalysisMode(formData.get('analysisMode'));
      labelScan = String(formData.get('labelScan') || '') === '1';
      forceFresh = String(formData.get('forceFresh') || '') === '1';
      analysisHint = String(formData.get('analysisHint') || '');
      feedbackReasons = parseFeedbackList(formData.get('feedbackReasons'));
      feedbackDown = String(formData.get('feedbackDown') || '') === '1' || feedbackReasons.length > 0;
      feedbackMissing =
        String(formData.get('feedbackMissing') || '') === '1' ||
        feedbackReasons.some((reason) => /missing ingredients/i.test(String(reason)));
      feedbackItems = sanitizeFeedbackItems(parseFeedbackList(formData.get('feedbackItems')));
      
      console.log('📊 Image file info:', {
        hasImageFile: !!imageFile,
        name: imageFile?.name || 'none',
        type: imageFile?.type || 'none',
        size: imageFile?.size || 0
      });

      if (!imageFile) {
        console.log('❌ No image file provided');
        return NextResponse.json(
          { error: 'No image file provided' },
          { status: 400 }
        );
      }

      // Convert image to base64
      console.log('🔄 Converting image to base64...');
      const imageBuffer = await imageFile.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString('base64');
      imageMeta = getImageMetadata(imageBuffer);
      imageDataUrl = `data:${imageFile.type};base64,${imageBase64}`;
      const baseHash = crypto.createHash('sha256').update(Buffer.from(imageBuffer)).digest('hex');
      imageHash = forceFresh ? `${baseHash}-${Date.now()}` : baseHash;
      imageBytes = imageBuffer.byteLength;
      imageMime = imageFile.type || null;
      
      console.log('✅ Image conversion complete:', {
        bufferSize: imageBuffer.byteLength,
        base64Length: imageBase64.length,
        dataUrlPrefix: imageDataUrl.substring(0, 50) + '...',
        imageHash
      });

      // For image analysis, request structured items and multi-detect by default
      wantStructured = true;
      preferMultiDetect = true;
      visionDetail = labelScan || packagedMode ? "high" : "low";

      const cleanedHint = String(analysisHint || '').trim();
      const hintBlock =
        cleanedHint && !packagedMode
          ? `\nUSER HINT (optional): ${cleanedHint}\n- Use this only to disambiguate a tricky item.\n- Do NOT ignore other visible foods.\n- Do NOT invent foods not visible in the photo.\n`
          : '';
      const feedbackBlock = feedbackDown
        ? `\nFEEDBACK (user reported issues): ${
            feedbackReasons.length ? feedbackReasons.join(', ') : 'Thumbs down'
          }\n${feedbackMissing ? '- Missing ingredients were reported. Re-check for small sides, sauces, and toppings.\n' : ''}${
            feedbackItems.length
              ? `- Previously detected items (include if visible, and add anything missing): ${feedbackItems.join(', ')}.\n`
              : ''
          }- Ensure the final Components line includes every item you list.\n`
        : '';

      messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this food image and provide accurate nutrition information based on the visible portion size. Be precise about size differences.${hintBlock}${feedbackBlock}

CRITICAL FOR MEALS WITH MULTIPLE COMPONENTS:
- If the image contains multiple distinct foods (e.g., plate with protein, vegetables, grains, salads, soups, stews, sandwiches with multiple fillings, bowls with toppings), you MUST:
  1. Identify EACH component separately
  2. Estimate portion size for EACH component accurately
  3. Calculate nutrition for EACH component individually
  4. Sum all components to provide TOTAL nutrition values
  5. List components briefly in your description

- Only include foods you can actually SEE in the photo. Do NOT assume common sides (e.g., fries) unless they are clearly visible.
- Estimate portions realistically based on what's visible in the image (only count pieces when the count is clearly visible).
- If something is unclear, prefer leaving it out OR include a generic label (e.g., "dipping sauce") and set isGuess: true.
- For mixed dishes (salads, soups, stews), break down the main ingredients and sum them

Do NOT infer meal patterns. Only list components supported by visible evidence in the photo.

PORTION CUES:
- Use plate size, utensil size, and hand-size cues to estimate grams or household measures
- Do not double count overlapping items; base your estimate on visible evidence
- Ignore inedible items. Only include a drink if clearly visible as part of the meal

PACKAGED / BRANDED FOODS (VERY IMPORTANT):
- First, decide if the photo shows a packaged or branded product (box, bag, packet, bottle, can, bread or rolls in a bag, cereal box, etc.).
- If any NUTRITION LABEL is visible on the front, back or side of the packaging, you MUST treat the label as the PRIMARY source of nutrition values.
- Mentally zoom in and carefully read the serving size and PER-SERVING values from the label; copy those numbers exactly into the item’s calories, protein_g, carbs_g, fat_g, fiber_g and sugar_g.
- If both "Per serving" and "Per 100 g" are shown, use the "Per serving" values and the printed serving size wording (e.g. "1 roll (60g)", "2 crackers (20g)").
- Do NOT invent or "correct" the label; if the label looks surprising, still trust it over your own visual estimate.
- Put the brand name from the packaging (e.g. "Tip Top", "Heinz") into the "brand" field and a generic food name into "name" (e.g. "Hot dog roll", "Wholemeal bread slice").
- For packets with multiple identical units (e.g. 6 hot dog rolls), nutrition in ITEMS_JSON for EACH ITEM should be PER ONE UNIT by default with "servings": 1. If the person clearly ate multiple units, keep serving_size as the label’s per-unit portion and adjust "servings" (e.g. 2 rolls eaten -> servings: 2).
${packagedEmphasisBlock}

CRITICAL STRUCTURED OUTPUT RULES:
- ALWAYS return the ITEMS_JSON block and include fiber_g and sugar_g for each item (do not leave as 0 unless truly 0).
- Use household measures and add ounce equivalents in parentheses where appropriate (e.g., "1 cup (8 oz)").
- Item "name" must be the plain ingredient name only (e.g., "grilled salmon", "white rice"). Do NOT prefix names with "several components:", "components:", "meal:", etc.
- Do NOT use placeholder names like "dessert 1", "item 1", or "component 1". Use specific descriptive food names.
- Only use pieces when a clear count is visible/stated; otherwise use grams/serving size.
- If the count is 1, still write it explicitly (e.g., "1 egg").
- For foods like fries, wedges, rice, pasta, and salads: use weight/serving, not pieces.
- For sliced produce (e.g., avocado slices, tomato slices, cucumber slices): treat it as a PORTION (weight/servings), not a discrete piece count. Prefer a grams estimate or a fraction of the whole food (e.g., "1/4 avocado") and set isGuess: true if uncertain.
- If uncertain about a count, choose a conservative (lower) number and mark isGuess: true.
- **CRITICAL: Use REALISTIC nutrition values based on standard food databases (USDA, nutrition labels, etc.). Do NOT underestimate calories or macros.**
- **Self-check before finalizing:** Sum all item macros and ensure they roughly match the headline Calories/Protein/Carbs/Fat line. If they don’t, adjust per-item macros (not the total) so the sum is realistic. Burgers with bun + 2 patties + cheese + bacon should land roughly 900–1100 kcal; a single patty ~200–300 kcal, cheese slice ~80–120 kcal, bacon slice ~40–50 kcal.

REALISTIC NUTRITION REFERENCE VALUES (use these as guidance for accurate analysis):

PROTEINS (cooked unless noted):
- Chicken breast (6 oz / 170g): ~280 calories, 54g protein, 0g carbs, 6g fat
- Chicken thigh (3 oz): ~180 calories, 22g protein, 0g carbs, 9g fat
- Ground beef 80/20 (6 oz cooked): ~400 calories, 30g protein, 0g carbs, 30g fat
- Ground beef 90/10 (6 oz cooked): ~300 calories, 35g protein, 0g carbs, 15g fat
- Salmon fillet (6 oz): ~350 calories, 40g protein, 0g carbs, 18g fat
- Tuna steak (6 oz): ~250 calories, 50g protein, 0g carbs, 2g fat
- Pork chop (6 oz): ~350 calories, 40g protein, 0g carbs, 18g fat
- Large egg: ~70 calories, 6g protein, 0.5g carbs, 5g fat
- Bacon (cooked, 2 slices): ~80 calories, 6g protein, 0g carbs, 7g fat
- Sausage link (pork, cooked): ~150 calories, 7g protein, 1g carbs, 13g fat

CARBOHYDRATES:
- White rice (cooked, 1 cup): ~220 calories, 4g protein, 45g carbs, 0.5g fat
- Brown rice (cooked, 1 cup): ~220 calories, 5g protein, 46g carbs, 2g fat
- Pasta (cooked, 1 cup): ~220 calories, 8g protein, 43g carbs, 1g fat
- White bread slice: ~80 calories, 2g protein, 15g carbs, 1g fat
- Whole wheat bread slice: ~80 calories, 4g protein, 15g carbs, 1g fat
- Burger bun (sesame): ~150 calories, 5g protein, 28g carbs, 3g fat
- Potato (medium, baked): ~160 calories, 4g protein, 37g carbs, 0g fat
- Sweet potato (medium, baked): ~180 calories, 4g protein, 41g carbs, 0g fat
- Oats (cooked, 1 cup): ~150 calories, 6g protein, 27g carbs, 3g fat

DAIRY:
- Cheese slice (American/Cheddar): ~100 calories, 6g protein, 1g carbs, 9g fat
- Mozzarella (1 oz): ~80 calories, 6g protein, 1g carbs, 6g fat
- Milk whole (1 cup): ~150 calories, 8g protein, 12g carbs, 8g fat
- Milk 2% (1 cup): ~120 calories, 8g protein, 12g carbs, 5g fat
- Greek yogurt (1 cup): ~150 calories, 20g protein, 9g carbs, 4g fat
- Butter (1 tbsp): ~100 calories, 0g protein, 0g carbs, 11g fat

VEGETABLES (cooked unless raw):
- Broccoli (1 cup): ~55 calories, 4g protein, 11g carbs, 0.5g fat
- Spinach (1 cup cooked): ~40 calories, 5g protein, 7g carbs, 0g fat
- Carrots (1 cup): ~50 calories, 1g protein, 12g carbs, 0g fat
- Green beans (1 cup): ~40 calories, 2g protein, 9g carbs, 0g fat
- Bell pepper (1 medium): ~30 calories, 1g protein, 7g carbs, 0g fat
- Tomato (1 medium): ~25 calories, 1g protein, 5g carbs, 0g fat
- Lettuce (1 cup shredded): ~5 calories, 0.5g protein, 1g carbs, 0g fat
- Onion (1 medium): ~45 calories, 1g protein, 11g carbs, 0g fat

FRUITS:
- Medium banana: ~105 calories, 1g protein, 27g carbs, 0.4g fat
- Apple (medium): ~95 calories, 0.5g protein, 25g carbs, 0.3g fat
- Orange (medium): ~60 calories, 1g protein, 15g carbs, 0g fat
- Berries (1 cup mixed): ~80 calories, 1g protein, 20g carbs, 0.5g fat
- Avocado (1 medium): ~240 calories, 3g protein, 13g carbs, 22g fat

FATS & CONDIMENTS:
- Olive oil (1 tbsp): ~120 calories, 0g protein, 0g carbs, 14g fat
- Mayonnaise (1 tbsp): ~100 calories, 0g protein, 0g carbs, 11g fat
- Salad dressing (2 tbsp): ~120 calories, 0g protein, 2g carbs, 12g fat
- Ketchup (1 tbsp): ~15 calories, 0g protein, 4g carbs, 0g fat
- Mustard (1 tbsp): ~5 calories, 0g protein, 1g carbs, 0g fat

COMMON MEAL COMPONENTS:
- Pizza slice (cheese, 1/8 of 14"): ~250 calories, 12g protein, 30g carbs, 10g fat
- Tortilla wrap (large): ~150 calories, 4g protein, 25g carbs, 4g fat
- Noodles (ramen, cooked): ~190 calories, 4g protein, 27g carbs, 7g fat
- Soup (chicken noodle, 1 cup): ~75 calories, 4g protein, 7g carbs, 3g fat

**ACCURACY REQUIREMENTS:**
- **For burgers: Two beef patties (4-6oz each) should total 400-700 calories for the patties alone. A complete burger with bun + 2 patties + cheese + bacon + condiments should total 900-1100 calories.**
- A typical burger with bun + 6oz patty + cheese + bacon should total 600-900 calories, NOT 40-50 calories
- Always cross-check your totals: if a meal looks substantial, the calories should reflect that
- If your calculated total seems too low, re-check each component's nutrition values
- Use standard serving sizes and realistic nutrition databases
- **When counting discrete items (patties, slices, nuggets), use realistic per-item values:**
  - Beef patty (4oz cooked): 200-300 calories per patty
  - Cheese slice: 80-120 calories per slice
  - Bacon slice (cooked): 40-50 calories per slice
  - If you are unsure and it is not clearly visible, omit it (do not invent it).

OUTPUT REQUIREMENTS:
- Keep explanation to 2-3 sentences
- ALWAYS end with a single nutrition line in this exact format:

Keep your explanation concise (2-3 sentences). After the explanation, include a single line exactly in this format:
Components: grilled chicken, white rice, steamed broccoli
- Use plain ingredient names only (no quantities).
- Include every distinct component you mentioned or can see.
- Even for a single-item meal, include one component.
- Do not use placeholders like "component 1", "item 1", or "dessert 1" in the final output.
- The Components line must match the ITEMS_JSON items exactly (no extras, no missing).
Then include a single nutrition line at the end in this exact format:

Calories: [number], Protein: [g], Carbs: [g], Fat: [g]

[Food name/meal description] ([total portion size])

${preferMultiDetect ? `The image likely contains multiple foods or components - analyze each one carefully, calculate nutrition for each, then sum the totals.
` : ''}

Examples with REALISTIC values:
"Medium banana (1 whole)
Calories: 105, Protein: 1g, Carbs: 27g, Fat: 0g"

"Grilled chicken breast (6 oz) with brown rice (1 cup) and steamed broccoli (1 cup)
Calories: 485, Protein: 45g, Carbs: 45g, Fat: 8g"

"Caesar salad with grilled chicken (large)
Calories: 520, Protein: 35g, Carbs: 18g, Fat: 32g"

"Burger with bun, 6oz beef patty, cheese, bacon, lettuce, tomato
Calories: 780, Protein: 47g, Carbs: 29g, Fat: 49g"

Estimate portion size carefully from the image and calculate nutrition accordingly using REALISTIC values. For meals, sum all components. End your response with the nutrition line exactly once as shown.
${wantStructured ? `
After your explanation and the one-line totals above, also include a compact JSON block between <ITEMS_JSON> and </ITEMS_JSON> with this exact shape for any detected foods:
<ITEMS_JSON>{"items":[{"name":"string","brand":"string or null","serving_size":"string (e.g., '1 slice', '2 patties', '40g', '1 cup (8 oz)')","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"isGuess":false}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}</ITEMS_JSON>

CRITICAL REQUIREMENTS:
- For packaged foods: ALWAYS extract the brand name if visible (e.g., "Burgen", "Heinz", "Nestle"). Set to null if not visible or not applicable.
- For packaged foods: ALWAYS extract the serving size from the label (e.g., "1 slice", "2 cookies", "100g", "1 cup"). This is the DEFAULT serving size per package.
- Set "servings" to 1 as the default (user can adjust this in the UI).
- For multi-item meals: Create separate items for each distinct food component.
- Include ONLY foods/components you can see in the photo. Do NOT add "typical" sides.
- If you mention a component in the description, it MUST appear in ITEMS_JSON (no exceptions).
- Set "isGuess": true only for ambiguous items that are still visible (e.g., an unknown dipping sauce).
- **Set "isGuess": false only for items you can clearly see and identify with high confidence.**
- **Only use pieces for discrete items when the count is clearly visible/stated (e.g., "2 patties"). Otherwise use grams/serving and leave pieces out.**
- Do not use "pieces" semantics for sliced produce; use portion/grams as described above.
- Nutrition values should be PER SERVING (not total) for each item.
- The "total" object should sum all items multiplied by their servings.
` : ''}`
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
                detail: visionDetail
              }
            }
          ]
        }
      ];
    }

    // PREMIUM/CREDITS/FREE USE GATING
    const currentUser = await findOrCreateUser({ subscription: true, creditTopUps: true });
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isPremium = isSubscriptionActive(currentUser.subscription);
    
    // Check if user has purchased credits (non-expired)
    const now = new Date();
    const hasPurchasedCredits = currentUser.creditTopUps.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    );
    
    // Check if user has free credits remaining
    const hasFreeFoodCredits = await hasFreeCredits(currentUser.id, 'FOOD_ANALYSIS');
    const hasFreeFoodReanalysisCredits = await hasFreeCredits(currentUser.id, 'FOOD_REANALYSIS');
    
    // Billing is now stable again – enforce credit checks for Food Analysis.
    // This controls wallet pre-checks and charges; free credits are consumed first.
    const BILLING_ENFORCED = true;

    // Allow if: Premium subscription OR has purchased credits OR has free credits remaining
    let allowViaFreeUse = false;
    if (!isPremium && !hasPurchasedCredits) {
      if (isReanalysis) {
        if (hasFreeFoodReanalysisCredits) {
          allowViaFreeUse = true;
        } else if (BILLING_ENFORCED) {
          return NextResponse.json(
            { 
              error: 'Payment required',
              message: 'You\'ve used all your free food re-analyses. Subscribe to a monthly plan or purchase credits to continue.',
              requiresPayment: true,
              exhaustedFreeCredits: true
            },
            { status: 402 }
          );
        }
      } else if (hasFreeFoodCredits) {
        // Has free credits - allow free use
        allowViaFreeUse = true;
      } else if (BILLING_ENFORCED) {
        // No subscription, no credits, and no free credits - require payment
        return NextResponse.json(
          { 
            error: 'Payment required',
            message: 'You\'ve used all your free food analyses. Subscribe to a monthly plan or purchase credits to continue.',
            requiresPayment: true,
            exhaustedFreeCredits: true
          },
          { status: 402 }
        );
      }
    }

    const lastReset = currentUser.lastAnalysisResetDate;
    const shouldReset = !lastReset || (now.getTime() - lastReset.getTime()) > 24*60*60*1000;
    if (shouldReset) {
      await prisma.user.update({
        where: { id: currentUser.id },
        data: ( {
          dailyAnalysisUsed: 0,
          dailyFoodAnalysisUsed: 0,
          dailyFoodReanalysisUsed: 0,
          lastAnalysisResetDate: now,
        } as any )
      });
      (currentUser as any).dailyFoodAnalysisUsed = 0 as any;
      (currentUser as any).dailyFoodReanalysisUsed = 0 as any;
    }

    // Daily gating removed – wallet pre-check happens below (trial still allowed)

    // Get OpenAI client
    const openai = getOpenAIClient();
    if (!openai) {
      console.log('❌ Failed to create OpenAI client');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Main food model selection.
    // Default is env-controlled; admin can set a per-user override via __FOOD_ANALYZER_MODEL__.
    // Temperature is set to 0 for maximum consistency between runs on the same meal.
    const envModelRaw = (process.env.OPENAI_FOOD_MODEL || '').trim()
    const defaultModel = imageDataUrl ? 'gpt-4o' : (envModelRaw || 'gpt-5.2')
    let model = defaultModel
    try {
      const goal = await prisma.healthGoal.findFirst({
        where: { userId: currentUser.id, name: '__FOOD_ANALYZER_MODEL__' },
        select: { category: true },
      })
      if (goal?.category) {
        const parsed = JSON.parse(goal.category)
        const override = typeof parsed?.model === 'string' ? parsed.model.trim() : ''
        const isGeminiOverride =
          override.startsWith('gemini-') && Boolean(imageDataUrl) && !packagedMode && !labelScan
        if (isGeminiOverride || override === 'gpt-4o' || override === 'gpt-5.2') {
          model = override
        }
      }
    } catch (e) {
      console.warn('Food analyzer model override lookup failed (non-fatal):', e)
    }
    const useGeminiVision =
      Boolean(imageDataUrl) && !packagedMode && !labelScan && model.startsWith('gemini-')

    let maxTokens = feedbackDown ? 800 : 600;

    // Wallet pre-check (skip if allowed via free use OR billing checks are disabled)
    if (BILLING_ENFORCED && !allowViaFreeUse) {
      const cm = new CreditManager(currentUser.id);
      const promptText = Array.isArray(messages)
        ? messages
            .map((m: any) => {
              if (!m?.content) return '';
              if (typeof m.content === 'string') return m.content;
              if (Array.isArray(m.content)) {
                return m.content
                  .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
                  .join('\n');
              }
              return '';
            })
            .join('\n')
        : '';
      const wallet = await cm.getWalletStatus();
      const cappedMaxTokens = capMaxTokensToBudget(model, promptText, maxTokens, wallet.totalAvailableCents);
      if (cappedMaxTokens <= 0) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
      }
      maxTokens = cappedMaxTokens;
    }

    // Pre-charge a minimal credit immediately upon analysis start (skip for free trial
    // or when billing checks are disabled)
    let prechargedCents = 0;
    if (BILLING_ENFORCED && !allowViaFreeUse) {
      try {
        const cm = new CreditManager(currentUser.id);
        const immediate = CREDIT_COSTS.FOOD_ANALYSIS; // fixed price upfront
        const okPre = await cm.chargeCents(immediate);
        if (!okPre) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
        }
        prechargedCents = immediate;
      } catch (e) {
        console.warn('Immediate pre-charge failed:', e);
        return NextResponse.json({ error: 'Billing error' }, { status: 402 });
      }
    }

    console.log('🤖 Calling food analysis model:', {
      provider: useGeminiVision ? 'Gemini' : 'OpenAI',
      model,
      messageCount: messages.length,
      hasImageContent: messages[0]?.content && Array.isArray(messages[0].content)
    });

    const runOpenAICompletion = async (params: any) => chatCompletionWithCost(openai, params);

    const runVisionCompletion = async (params: any) => {
      if (!useGeminiVision) {
        return runOpenAICompletion(params);
      }
      const apiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey) {
        console.warn('GEMINI_API_KEY missing; falling back to OpenAI for vision.');
        return runOpenAICompletion({ ...params, model: 'gpt-4o' });
      }
      const promptText = extractPromptTextFromMessages(params.messages || []);
      const maxOutputTokens = Number(params.max_tokens ?? params.max_completion_tokens ?? maxTokens);
      return runGeminiVisionCompletion({
        apiKey,
        model,
        promptText,
        imageDataUrl: imageDataUrl as string,
        maxOutputTokens,
        temperature: typeof params.temperature === 'number' ? params.temperature : 0,
        responseMimeType: params.responseMimeType,
      });
    };

    // Call food analysis model (metered)
    const runCompletion = async (runModel: string) =>
      runVisionCompletion({
        model: runModel,
        messages,
        ...(runModel.toLowerCase().includes('gpt-5')
          ? { max_completion_tokens: maxTokens }
          : { max_tokens: maxTokens }),
        temperature: 0,
      } as any);

    const extractAnalysisText = (completion: any): string | null => {
      const c = completion?.choices?.[0]?.message?.content;
      if (typeof c === 'string') {
        const trimmed = c.trim();
        return trimmed.length ? trimmed : null;
      }
      // Defensive: some SDK variants may return segmented content; join text parts.
      if (Array.isArray(c)) {
        const joined = c
          .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
          .join('')
          .trim();
        return joined.length ? joined : null;
      }
      return null;
    };

    const primary = await runCompletion(model);
    let response = primary.completion;

    if (imageDataUrl) {
      logAiUsageEvent({
        feature: isReanalysis ? 'food:image-reanalysis' : 'food:image-analysis',
        userId: currentUser.id || null,
        userLabel: currentUser.email || null,
        scanId: imageHash ? `food-${imageHash.slice(0, 8)}` : `food-${Date.now()}`,
        model,
        promptTokens: primary.promptTokens,
        completionTokens: primary.completionTokens,
        costCents: primary.costCents,
        image: {
          width: imageMeta?.width ?? null,
          height: imageMeta?.height ?? null,
          bytes: imageBytes,
          mime: imageMime,
        },
        endpoint: '/api/analyze-food',
        success: true,
      }).catch(() => {});
    } else {
      logAiUsageEvent({
        feature: isReanalysis ? 'food:text-reanalysis' : 'food:text-analysis',
        userId: currentUser.id || null,
        userLabel: currentUser.email || null,
        scanId: `food-${Date.now()}`,
        model,
        promptTokens: primary.promptTokens,
        completionTokens: primary.completionTokens,
        costCents: primary.costCents,
        endpoint: '/api/analyze-food',
        success: true,
      }).catch(() => {});
    }

    console.log('📋 Model Response:', {
      hasResponse: !!response,
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length || 0,
      hasContent: !!response.choices?.[0]?.message?.content
    });

    let analysis = extractAnalysisText(response);
    let totalCostCents = primary.costCents;

    // Rare but real: models sometimes return a completion object with no content.
    // To avoid showing the user a blank "failed" screen, retry once and then fall
    // back to gpt-4o for image analysis if needed.
    if (!analysis) {
      try {
        console.warn('⚠️ Model returned empty content; retrying once...');
        const retry = await runCompletion(model);
        totalCostCents += retry.costCents;
        response = retry.completion;
        analysis = extractAnalysisText(response);
      } catch (retryErr) {
        console.warn('Retry attempt failed (non-fatal):', retryErr);
      }
    }

    if (!analysis && imageDataUrl) {
      if (useGeminiVision) {
        try {
          console.warn('⚠️ Empty content after retry; falling back to gpt-4o for image analysis...');
          const fallback = await runOpenAICompletion({
            model: 'gpt-4o',
            messages,
            max_tokens: maxTokens,
            temperature: 0,
          } as any);
          totalCostCents += fallback.costCents;
          response = fallback.completion;
          analysis = extractAnalysisText(response);
          logAiUsageEvent({
            feature: 'food:image-analysis-fallback',
            userId: currentUser.id || null,
            userLabel: currentUser.email || null,
            scanId: imageHash ? `food-${imageHash.slice(0, 8)}` : `food-${Date.now()}`,
            model: 'gpt-4o',
            promptTokens: fallback.promptTokens,
            completionTokens: fallback.completionTokens,
            costCents: fallback.costCents,
            image: {
              width: imageMeta?.width ?? null,
              height: imageMeta?.height ?? null,
              bytes: imageBytes,
              mime: imageMime,
            },
            endpoint: '/api/analyze-food',
            success: true,
          }).catch(() => {});
        } catch (fallbackErr) {
          console.warn('gpt-4o fallback attempt failed (non-fatal):', fallbackErr);
        }
      } else if (model !== 'gpt-4o') {
        try {
          console.warn('⚠️ Empty content after retry; falling back to gpt-4o for image analysis...');
          const fallback = await runCompletion('gpt-4o');
          totalCostCents += fallback.costCents;
          response = fallback.completion;
          analysis = extractAnalysisText(response);
          logAiUsageEvent({
            feature: 'food:image-analysis-fallback',
            userId: currentUser.id || null,
            userLabel: currentUser.email || null,
            scanId: imageHash ? `food-${imageHash.slice(0, 8)}` : `food-${Date.now()}`,
            model: 'gpt-4o',
            promptTokens: fallback.promptTokens,
            completionTokens: fallback.completionTokens,
            costCents: fallback.costCents,
            image: {
              width: imageMeta?.width ?? null,
              height: imageMeta?.height ?? null,
              bytes: imageBytes,
              mime: imageMime,
            },
            endpoint: '/api/analyze-food',
            success: true,
          }).catch(() => {});
        } catch (fallbackErr) {
          console.warn('gpt-4o fallback attempt failed (non-fatal):', fallbackErr);
        }
      }
    }

    if (!analysis) {
      console.log('❌ No analysis received from model');
      return NextResponse.json(
        { error: 'No analysis received from model' },
        { status: 500 }
      );
    }

    console.log('✅ Analysis received:', analysis.substring(0, 200) + '...');
    console.log('✅ Analysis received:', analysis.substring(0, 200) + '...');

    // Server-side safeguard: ensure nutrition line is present so frontend cards render reliably
    const hasCalories = /calories\s*[:\-]?\s*\d+/i.test(analysis);
    const hasProtein = /protein\s*[:\-]?\s*\d+(?:\.\d+)?\s*g/i.test(analysis);
    const hasCarbs = /carb(?:ohydrate)?s?\s*[:\-]?\s*\d+(?:\.\d+)?\s*g/i.test(analysis);
    const hasFat = /fat\s*[:\-]?\s*\d+(?:\.\d+)?\s*g/i.test(analysis);

    if (!(hasCalories && hasProtein && hasCarbs && hasFat)) {
      const fallbackLine = 'Calories: unknown, Protein: unknown, Carbs: unknown, Fat: unknown';
      analysis = `${analysis}\n${fallbackLine}`;
      console.log('ℹ️ Nutrition line missing; appended static fallback to avoid extra AI calls');
    }
    
    // Note: Charging happens after health compatibility check to include all costs

    // Consume free credit if this was a free use
    if (allowViaFreeUse) {
      await consumeFreeCredit(currentUser.id, isReanalysis ? 'FOOD_REANALYSIS' : 'FOOD_ANALYSIS');
    }
    // Update counters (for all users, not just premium)
    await prisma.user.update({
      where: { id: currentUser.id },
      data: ( isReanalysis ? {
        dailyFoodReanalysisUsed: { increment: 1 },
        totalAnalysisCount: { increment: 1 },
      } : {
        dailyFoodAnalysisUsed: { increment: 1 },
        totalFoodAnalysisCount: { increment: 1 },
        totalAnalysisCount: { increment: 1 },
        monthlyFoodAnalysisUsed: { increment: 1 },
      } ) as any
    });
    
    console.log('=== FOOD ANALYZER DEBUG END ===');

    const resp: any = {
      success: true,
      analysis: analysis.trim(),
    };
    const isImageAnalysis = Boolean(imageDataUrl);
    let itemsSource: string = 'none';
    let itemsQuality: 'valid' | 'weak' | 'none' = 'none';
    let analysisTextForFollowUp = analysis;
    let listedComponents: string[] = [];
    let analysisComponents: string[] = [];
    let analysisLooksMulti = false;
    let componentsHint = '';
    let componentsRequirement = '';
    let componentBoundApplied = false;
    let itemsReady = false;
    let refreshItemsReady = () => {};
    if (wantStructured) {
      try {
        const m = analysis.match(/<ITEMS_JSON>([\s\S]*?)<\/ITEMS_JSON>/i);
        if (m && m[1]) {
          // Some model variants wrap the JSON payload in ```json fences even
          // inside our <ITEMS_JSON>...</ITEMS_JSON> tag. Strip those wrappers
          // before attempting relaxed JSON parsing so we don't silently drop
          // otherwise valid ingredient data.
          const rawBlock = m[1].trim();
          const cleanedBlock = rawBlock
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();
          const parsed = parseItemsJsonRelaxed(cleanedBlock);
          if (parsed) {
            const parsedItems = Array.isArray(parsed)
              ? parsed
              : Array.isArray((parsed as any).items)
              ? (parsed as any).items
              : [];
            const parsedTotal =
              !Array.isArray(parsed) && typeof (parsed as any).total === 'object'
                ? (parsed as any).total
                : null;
            if (parsedItems.length > 0) {
              // Use the parsed items/total directly; do not overwrite them with fallback/default items
              resp.items = sanitizeStructuredItems(parsedItems);
              resp.total = parsedTotal || computeTotalsFromItems(resp.items) || null;
              itemsSource = 'items_json';
              itemsQuality = validateStructuredItems(resp.items) ? 'valid' : 'weak';
            }
          }
          // Always strip the ITEMS_JSON block to avoid UI artifacts, even if parsing failed
          resp.analysis = resp.analysis.replace(m[0], '').trim();
        }
      } catch (e) {
        console.warn('ITEMS_JSON handling failed (non-fatal):', e);
      }

      analysisTextForFollowUp = resp.analysis || analysis;
      listedComponents = extractComponentsFromAnalysis(analysisTextForFollowUp);
      analysisComponents = extractComponentsFromDelimitedText(analysisTextForFollowUp);
      if (listedComponents.length === 0 && analysisComponents.length > 0) {
        listedComponents = analysisComponents;
      }
      listedComponents = normalizeComponentList(listedComponents);
      analysisComponents = normalizeComponentList(analysisComponents);
      const feedbackComponents = normalizeComponentList(feedbackItems);
      if (feedbackComponents.length > 0) {
        listedComponents = normalizeComponentList([...listedComponents, ...feedbackComponents]);
        analysisComponents = normalizeComponentList([...analysisComponents, ...feedbackComponents]);
      }
      if (
        listedComponents.length === 0 &&
        resp.items &&
        looksLikeMultiIngredientSummary(resp.items)
      ) {
        const summaryLabel = `${resp.items?.[0]?.name || ''} ${resp.items?.[0]?.serving_size || ''}`;
        listedComponents = extractComponentsFromDelimitedText(summaryLabel);
        listedComponents = normalizeComponentList(listedComponents);
      }
      analysisLooksMulti =
        analysisComponents.length > 1 || (resp.items ? looksLikeMultiIngredientSummary(resp.items) : false);
      componentsHint =
        listedComponents.length > 0
          ? `- Components list (include each as its own item): ${listedComponents.join(', ')}.\n`
          : '';
      const requiredComponentCount = Math.max(listedComponents.length, analysisComponents.length);
      componentsRequirement =
        requiredComponentCount > 1 ? `- Return at least ${requiredComponentCount} items.\n` : '';
      const needsMultipleItems = preferMultiDetect && (analysisLooksMulti || requiredComponentCount > 1);
      itemsReady =
        itemsAreUsable(resp.items, requiredComponentCount, needsMultipleItems) &&
        itemsCoverComponentList(resp.items, listedComponents);
      refreshItemsReady = () => {
        itemsReady =
          itemsAreUsable(resp.items, requiredComponentCount, needsMultipleItems) &&
          itemsCoverComponentList(resp.items, listedComponents);
      };

      // If the main analysis did not contain a usable ITEMS_JSON block, make a
      // compact follow-up call whose ONLY job is to produce structured items
      // so the UI can render editable ingredient cards. This is text-only and
      // only runs when the first call missed items.
      if (
        !itemsReady &&
        !isImageAnalysis &&
        (!resp.items || resp.items.length === 0) &&
        analysisTextForFollowUp.length > 0
      ) {
        try {
          console.log('ℹ️ No ITEMS_JSON found, running lightweight items extractor (text-only)');
          const extractor = await chatCompletionWithCost(openai, {
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content:
                  'Convert the nutrition analysis text below into JSON with this exact shape:\n' +
                  '{"items":[{"name":"string","brand":null,"serving_size":"string","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}],' +
                  '"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}\n' +
                  componentsHint +
                  componentsRequirement +
                  '- Use realistic per-serving values based on the analysis.\n' +
                  '- If unsure about fiber or sugar, set them to 0.\n' +
                  '- Respond with JSON only, no backticks.\n\n' +
                  'Analysis text:\n' +
                  analysisTextForFollowUp,
              },
            ],
            max_tokens: 360,
            temperature: 0,
          } as any);
          logAiUsageEvent({
            feature: 'food:items-extractor',
            userId: currentUser.id || null,
            userLabel: currentUser.email || null,
            scanId: imageHash ? `food-${imageHash.slice(0, 8)}` : `food-${Date.now()}`,
            model: 'gpt-4o-mini',
            promptTokens: extractor.promptTokens,
            completionTokens: extractor.completionTokens,
            costCents: extractor.costCents,
            endpoint: '/api/analyze-food',
            success: true,
          }).catch(() => {});
          totalCostCents += extractor.costCents;
          const text = extractor.completion.choices?.[0]?.message?.content?.trim() || '';
          const cleaned =
            text
              .replace(/```json/gi, '')
              .replace(/```/g, '')
              .trim() || '';
          const parsed = cleaned ? parseItemsJsonRelaxed(cleaned) : null;
          if (parsed) {
            const items = Array.isArray(parsed)
              ? parsed
              : Array.isArray((parsed as any).items)
              ? (parsed as any).items
              : [];
            const total =
              !Array.isArray(parsed) && typeof (parsed as any).total === 'object'
                ? (parsed as any).total
                : null;
            if (items.length > 0) {
              resp.items = sanitizeStructuredItems(items);
              resp.total = total || computeTotalsFromItems(resp.items) || resp.total || null;
              itemsSource = itemsSource === 'none' ? 'text_extractor' : `${itemsSource}+text_extractor`;
              itemsQuality = validateStructuredItems(resp.items) ? 'valid' : 'weak';
              console.log('✅ Structured items extracted via follow-up call:', {
                itemCount: items.length,
              });
              refreshItemsReady();
              if (listedComponents.length === 0 && looksLikeMultiIngredientSummary(resp.items)) {
                const summaryLabel = `${resp.items?.[0]?.name || ''} ${resp.items?.[0]?.serving_size || ''}`;
                listedComponents = extractComponentsFromDelimitedText(summaryLabel);
                componentsHint =
                  listedComponents.length > 0
                    ? `- Components list (include each as its own item): ${listedComponents.join(', ')}.\n`
                    : componentsHint;
                componentsRequirement =
                  listedComponents.length > 1
                    ? `- Return at least ${listedComponents.length} items.\n`
                    : componentsRequirement;
              }
            }
          }
        } catch (e) {
          console.warn('ITEMS_JSON extractor follow-up failed (non-fatal):', e);
        }

        // If we still have no items, synthesize multiple editable items so cards stay separate.
        if (!itemsReady && (!resp.items || resp.items.length === 0)) {
          const caloriesMatch = analysisTextForFollowUp.match(/calories\s*[:\-]?\s*(\d+)/i);
          const proteinMatch = analysisTextForFollowUp.match(/protein\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*g/i);
          const carbsMatch = analysisTextForFollowUp.match(/carbs?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*g/i);
          const fatMatch = analysisTextForFollowUp.match(/fat\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*g/i);
          const baseTotal =
            resp.total ||
            computeTotalsFromItems([
              {
                calories: caloriesMatch ? Number(caloriesMatch[1]) : null,
                protein_g: proteinMatch ? Number(proteinMatch[1]) : null,
                carbs_g: carbsMatch ? Number(carbsMatch[1]) : null,
                fat_g: fatMatch ? Number(fatMatch[1]) : null,
                fiber_g: 0,
                sugar_g: 0,
              },
            ]) ||
            null;

          if (preferMultiDetect && !packagedMode) {
            if (!STRICT_AI_ONLY_ITEMS) {
              const fallback = buildMultiComponentFallback(analysisTextForFollowUp, baseTotal);
              resp.items = fallback.items;
              resp.total = fallback.total;
              console.log('ℹ️ Using multi-item fallback to avoid single-card UI');
            } else {
              resp.total = baseTotal || resp.total || null;
              console.warn('⚠️ Strict AI-only mode: no fallback cards created when items are missing.');
            }
          } else if (!STRICT_AI_ONLY_ITEMS) {
            const fallbackItem = {
              name: 'Meal',
              brand: null,
              serving_size: '1 serving',
              servings: 1,
              calories: caloriesMatch ? Number(caloriesMatch[1]) : null,
              protein_g: proteinMatch ? Number(proteinMatch[1]) : null,
              carbs_g: carbsMatch ? Number(carbsMatch[1]) : null,
              fat_g: fatMatch ? Number(fatMatch[1]) : null,
              fiber_g: 0,
              sugar_g: 0,
            };
            resp.items = [fallbackItem];
            resp.total = baseTotal || computeTotalsFromItems(resp.items) || null;
            console.log('ℹ️ Using fallback single-item card to keep editor usable (packaged/explicit single)');
          } else {
            resp.total = baseTotal || resp.total || null;
            console.warn('⚠️ Strict AI-only mode: no fallback cards created for packaged/single cases.');
          }
          refreshItemsReady();
        }
      }
    }

    // For photo analyses with a clear component list, force a component-bound
    // vision follow-up so we always return one card per ingredient.
    if (!itemsReady && wantStructured && preferMultiDetect && isImageAnalysis && listedComponents.length > 1) {
      const needsComponentBound =
        !resp.items ||
        resp.items.length === 0 ||
        looksLikeSingleGenericItem(resp.items) ||
        looksLikeMultiIngredientSummary(resp.items) ||
        resp.items.length < listedComponents.length;
      if (needsComponentBound) {
        try {
          console.warn('⚠️ Analyzer: running component-bound vision follow-up.');
          const componentBoundPrompt =
            'Return JSON only. Use the component list and output exactly one item per component.\n' +
            'You must include ALL components and no extras.\n' +
            'Each item name must be the plain ingredient name for that component.\n' +
            '- Do NOT default every item to "100 g". Use realistic, different portions based on the photo.\n' +
            '- Prefer household measures with optional grams in parentheses (e.g., "1 fillet (150 g)", "3/4 cup cooked rice (150 g)", "1/4 avocado (50 g)", "1/3 cup cucumber slices (40 g)").\n' +
            '- If you cannot estimate grams, use a household portion without grams (e.g., "1 fillet", "1/2 cup").\n' +
            'Component list:\n' +
            listedComponents.map((c) => `- ${c}`).join('\n') +
            '\n\nUse the image as the primary source of truth. Analysis text is supplemental:\n' +
            analysisTextForFollowUp;
          const componentBoundMessages = [
            {
              role: 'user',
              content: [
                { type: 'text', text: componentBoundPrompt },
                { type: 'image_url', image_url: { url: imageDataUrl, detail: visionDetail } },
              ],
            },
          ];

          let componentBound: any = null;
          if (useGeminiVision) {
            componentBound = await runVisionCompletion({
              model,
              messages: componentBoundMessages,
              max_tokens: 420,
              temperature: 0,
              responseMimeType: 'application/json',
            } as any);
          } else {
            try {
              componentBound = await chatCompletionWithCost(openai, {
                model: 'gpt-4o',
                response_format: {
                  type: 'json_schema',
                  json_schema: buildComponentBoundSchema(listedComponents),
                } as any,
                messages: componentBoundMessages,
                max_tokens: 420,
                temperature: 0,
              } as any);
            } catch (schemaErr) {
              console.warn('Component-bound schema follow-up failed; retrying with json_object.', schemaErr);
              componentBound = await chatCompletionWithCost(openai, {
                model: 'gpt-4o',
                response_format: { type: 'json_object' } as any,
                messages: componentBoundMessages,
                max_tokens: 420,
                temperature: 0,
              } as any);
            }
          }

          if (componentBound?.completion) {
            totalCostCents += componentBound.costCents;
            const text = componentBound.completion.choices?.[0]?.message?.content?.trim() || '';
            const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = cleaned ? parseItemsJsonRelaxed(cleaned) : null;
            if (parsed) {
              const items = Array.isArray((parsed as any).items) ? (parsed as any).items : [];
              const total = typeof (parsed as any).total === 'object' ? (parsed as any).total : null;
              const normalizedComponents = listedComponents.map((c) => normalizeComponentName(c));
              const itemsByComponent = items.filter((item: any) => {
                const key = normalizeComponentName(item?.component || item?.name || '');
                return key && normalizedComponents.includes(key);
              });
              const orderedItems = normalizedComponents
                .map((comp, idx) => {
                  const item = itemsByComponent.find(
                    (candidate: any) =>
                      normalizeComponentName(candidate?.component || candidate?.name || '') === comp,
                  );
                  if (!item) return null;
                  const next = { ...item };
                  delete (next as any).component;
                  if (!next.name) next.name = listedComponents[idx];
                  return next;
                })
                .filter(Boolean) as any[];

              const requireMultiple = listedComponents.length > 1;
              if (orderedItems.length === listedComponents.length && !itemsResultIsInvalid(orderedItems, requireMultiple)) {
                resp.items = sanitizeStructuredItems(orderedItems);
                resp.total = total || computeTotalsFromItems(resp.items) || resp.total || null;
                itemsSource = itemsSource === 'none' ? 'component_bound' : `${itemsSource}+component_bound`;
                itemsQuality = validateStructuredItems(resp.items) ? 'valid' : 'weak';
                componentBoundApplied = true;
                console.log('✅ Component-bound follow-up produced items:', resp.items.length);
                refreshItemsReady();
              }
            }
          }
        } catch (componentErr) {
          console.warn('Component-bound vision follow-up failed (non-fatal):', componentErr);
        }
      }
    }

    // If we still don't have meaningful per-component items (or only a generic "Meal" card)
    // but the prompt was multi-detect capable, run a lightweight structure-only pass to
    // force separate components. This keeps the ingredient cards usable when the primary
    // model skips ITEMS_JSON.
    const missingFromList =
      listedComponents.length > 1 &&
      resp.items &&
      Array.isArray(resp.items) &&
      resp.items.length < listedComponents.length;
    if (
      !itemsReady &&
      wantStructured &&
      preferMultiDetect &&
      !componentBoundApplied &&
      (!resp.items ||
        resp.items.length === 0 ||
        looksLikeSingleGenericItem(resp.items) ||
        looksLikeMultiIngredientSummary(resp.items) ||
        missingFromList)
    ) {
      try {
        console.warn('⚠️ Analyzer: generic/missing/summary items detected; running multi-item follow-up.');
        console.log('ℹ️ Enforcing multi-item breakdown via structure-only follow-up');
        const hintTotal = resp.total || computeTotalsFromItems(resp.items || []) || null;
        const followUpPrompt =
          'Split this meal description into separate ingredients/components and return JSON only with this shape:\n' +
          '{"items":[{"name":"string","brand":null,"serving_size":"string","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}\n' +
          componentsHint +
          componentsRequirement +
          '- Use realistic per-serving values for EACH component (eggs, bacon, bagel, juice, etc).\n' +
          '- Keep servings to 1 by default and use household measures ("1 slice", "1 cup", "1 egg").\n' +
          '- Do not collapse everything into a single "Meal" item. Return 1 item per distinct component.\n' +
          '- Do NOT default every item to "100 g". Use different portion sizes based on the photo.\n' +
          '- Prefer household measures with optional grams in parentheses.\n' +
          (imageDataUrl ? '- Use the image as the primary source of truth; the analysis text is supplemental.\n' : '') +
          (hintTotal
            ? `- Keep totals roughly consistent with Calories ${hintTotal.calories ?? 'unknown'} / Protein ${
                hintTotal.protein_g ?? 'unknown'
              }g / Carbs ${hintTotal.carbs_g ?? 'unknown'}g / Fat ${hintTotal.fat_g ?? 'unknown'}g.\n`
            : '') +
          '\nAnalysis text:\n' +
          analysisTextForFollowUp;
        const followUpModel = imageDataUrl ? (useGeminiVision ? model : 'gpt-4o') : 'gpt-4o-mini';
        const followUpMessages = imageDataUrl
          ? [
              {
                role: 'user',
                content: [
                  { type: 'text', text: followUpPrompt },
                  { type: 'image_url', image_url: { url: imageDataUrl, detail: visionDetail } },
                ],
              },
            ]
          : [
              {
                role: 'user',
                content: followUpPrompt,
              },
            ];
        const followUp =
          imageDataUrl && useGeminiVision
            ? await runVisionCompletion({
                model: followUpModel,
                messages: followUpMessages,
                max_tokens: 360,
                temperature: 0,
                responseMimeType: 'application/json',
              } as any)
            : await chatCompletionWithCost(openai, {
                model: followUpModel,
                response_format: { type: 'json_object' } as any,
                messages: followUpMessages,
                max_tokens: 360,
                temperature: 0,
              } as any);

        totalCostCents += followUp.costCents;
        const text = followUp.completion.choices?.[0]?.message?.content?.trim() || '';
        const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = cleaned ? parseItemsJsonRelaxed(cleaned) : null;
        if (parsed) {
          const items = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as any).items)
            ? (parsed as any).items
            : [];
          const total =
            !Array.isArray(parsed) && typeof (parsed as any).total === 'object'
              ? (parsed as any).total
              : null;
          const requiresMultiple = listedComponents.length > 1 || analysisLooksMulti;
          const hasEnoughItems = requiresMultiple ? items.length > 1 : items.length > 0;
          if (hasEnoughItems && !looksLikeSingleGenericItem(items) && !looksLikeMultiIngredientSummary(items)) {
            resp.items = sanitizeStructuredItems(items);
            resp.total = total || computeTotalsFromItems(resp.items) || resp.total || null;
            const sourceLabel = imageDataUrl ? 'vision_multi_followup' : 'multi_followup';
            itemsSource = itemsSource === 'none' ? sourceLabel : `${itemsSource}+${sourceLabel}`;
            itemsQuality = validateStructuredItems(resp.items) ? 'valid' : 'weak';
            console.log('✅ Multi-item follow-up produced structured items:', items.length);
            refreshItemsReady();
          }
        }
      } catch (multiErr) {
        console.warn('Multi-item follow-up failed (non-fatal):', multiErr);
      }
    }

    // Final safety net for image analyses: if we still have no usable items,
    // force a structured follow-up using the image + analysis text.
    if (
      !itemsReady &&
      wantStructured &&
      isImageAnalysis &&
      !packagedMode &&
      (!resp.items ||
        resp.items.length === 0 ||
        looksLikeSingleGenericItem(resp.items) ||
        looksLikeMultiIngredientSummary(resp.items))
    ) {
      try {
        const forcedComponents = normalizeComponentList(
          listedComponents.length > 1
            ? listedComponents
            : extractComponentsFromDelimitedText(analysisTextForFollowUp),
        );
        const requireMultiple = forcedComponents.length > 1 || analysisLooksMulti;
        const forcedHint =
          forcedComponents.length > 0
            ? `- Components list (include each as its own item): ${forcedComponents.join(', ')}.\n`
            : '';
        const forcedRequirement = requireMultiple ? `- Return at least ${Math.max(forcedComponents.length, 2)} items.\n` : '';
        const forcedPrompt =
          'Return JSON only with this shape:\n' +
          '{"items":[{"name":"string","brand":null,"serving_size":"string","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}],' +
          '"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}\n' +
          forcedHint +
          forcedRequirement +
          '- Use the image as the primary source of truth.\n' +
          '- Do NOT return a single summary item for a multi-ingredient meal.\n' +
          '- Use realistic per-serving values for each ingredient.\n' +
          '\nAnalysis text:\n' +
          analysisTextForFollowUp;
        console.warn('⚠️ Analyzer: forcing structured image follow-up (items missing).');
        const forcedFollowUp = useGeminiVision
          ? await runVisionCompletion({
              model,
              messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: forcedPrompt },
                { type: 'image_url', image_url: { url: imageDataUrl, detail: visionDetail } },
              ],
            },
          ],
              max_tokens: 420,
              temperature: 0,
              responseMimeType: 'application/json',
            } as any)
          : await chatCompletionWithCost(openai, {
              model: 'gpt-4o',
              response_format: { type: 'json_object' } as any,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: forcedPrompt },
                    { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
                  ],
                },
              ],
              max_tokens: 420,
              temperature: 0,
            } as any);

        totalCostCents += forcedFollowUp.costCents;
        const text = forcedFollowUp.completion.choices?.[0]?.message?.content?.trim() || '';
        const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = cleaned ? parseItemsJsonRelaxed(cleaned) : null;
        if (parsed) {
          const items = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as any).items)
            ? (parsed as any).items
            : [];
          const total =
            !Array.isArray(parsed) && typeof (parsed as any).total === 'object'
              ? (parsed as any).total
              : null;
          if (!itemsResultIsInvalid(items, requireMultiple)) {
            resp.items = sanitizeStructuredItems(items);
            resp.total = total || computeTotalsFromItems(resp.items) || resp.total || null;
            itemsSource = itemsSource === 'none' ? 'forced_image_followup' : `${itemsSource}+forced_image_followup`;
            itemsQuality = validateStructuredItems(resp.items) ? 'valid' : itemsQuality;
            console.log('✅ Forced image follow-up produced items:', resp.items.length);
            refreshItemsReady();
          }
        }
      } catch (forcedErr) {
        console.warn('Forced image follow-up failed (non-fatal):', forcedErr);
      }
    }

    // Absolute last resort: if we still have no usable items, run a text-only
    // structured extractor so the UI never falls back to a summary-only card.
    if (
      !itemsReady &&
      wantStructured &&
      !packagedMode &&
      analysisTextForFollowUp &&
      (!resp.items ||
        resp.items.length === 0 ||
        looksLikeSingleGenericItem(resp.items) ||
        looksLikeMultiIngredientSummary(resp.items))
    ) {
      try {
        const fallbackComponents = normalizeComponentList(
          extractComponentsFromDelimitedText(analysisTextForFollowUp),
        );
        const requireMultiple = fallbackComponents.length > 1 || analysisLooksMulti;
        const fallbackHint =
          fallbackComponents.length > 0
            ? `- Components list (include each as its own item): ${fallbackComponents.join(', ')}.\n`
            : '';
        const fallbackRequirement = requireMultiple
          ? `- Return at least ${Math.max(fallbackComponents.length, 2)} items.\n`
          : '';
        console.warn('⚠️ Analyzer: running final text-only structured fallback.');
        const fallback = await chatCompletionWithCost(openai, {
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' } as any,
          messages: [
            {
              role: 'user',
              content:
                'Return JSON only with this shape:\n' +
                '{"items":[{"name":"string","brand":null,"serving_size":"string","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}],' +
                '"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}\n' +
                fallbackHint +
                fallbackRequirement +
                '- Use realistic per-serving values.\n' +
                '- Do NOT collapse multiple foods into a single summary item.\n' +
                '\nAnalysis text:\n' +
                analysisTextForFollowUp,
            },
          ],
          max_tokens: 360,
          temperature: 0,
        } as any);

        totalCostCents += fallback.costCents;
        const text = fallback.completion.choices?.[0]?.message?.content?.trim() || '';
        const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = cleaned ? parseItemsJsonRelaxed(cleaned) : null;
        if (parsed) {
          const items = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as any).items)
            ? (parsed as any).items
            : [];
          const total =
            !Array.isArray(parsed) && typeof (parsed as any).total === 'object'
              ? (parsed as any).total
              : null;
          if (!itemsResultIsInvalid(items, requireMultiple)) {
            resp.items = sanitizeStructuredItems(items);
            resp.total = total || computeTotalsFromItems(resp.items) || resp.total || null;
            itemsSource = itemsSource === 'none' ? 'text_only_fallback' : `${itemsSource}+text_only_fallback`;
            itemsQuality = validateStructuredItems(resp.items) ? 'valid' : itemsQuality;
            console.log('✅ Text-only fallback produced items:', resp.items.length);
            refreshItemsReady();
          }
        }
      } catch (fallbackErr) {
        console.warn('Text-only fallback failed (non-fatal):', fallbackErr);
      }
    }

    // If the analysis text clearly lists components that are missing from ITEMS_JSON,
    // backfill those components so the user can edit/remove them.
    if (!itemsReady && wantStructured && preferMultiDetect && !componentBoundApplied) {
      if (listedComponents.length > 0) {
        const existing = resp.items || [];
        const existingFiltered = existing.filter(
          (item: any) =>
            !looksLikeMultiIngredientSummary([item]) && !looksLikeSingleGenericItem([item]),
        );
        const existingLabels: string[] = existingFiltered.map((item: any) =>
          normalizeComponentName(`${item?.name || ''} ${item?.serving_size || ''}`),
        );
        const missingComponents = listedComponents.filter((component) => {
          const normalized = normalizeComponentName(component);
          if (!normalized) return false;
          return !existingLabels.some((label) => label.includes(normalized) || normalized.includes(label));
        });

        if (missingComponents.length > 0) {
          try {
            const followUp = isImageAnalysis
              ? await chatCompletionWithCost(openai, {
                  model: 'gpt-4o',
                  response_format: { type: 'json_object' } as any,
                  messages: [
                    {
                      role: 'user',
                      content: [
                        {
                          type: 'text',
                          text:
                            'Return JSON only with this shape:\n' +
                            '{"items":[{"name":"string","brand":null,"serving_size":"string","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"isGuess":false}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}\n' +
                            `- Include ONLY these components, exactly as listed: ${listedComponents.join(', ')}.\n` +
                            '- Do not omit any component. Do not add extras.\n' +
                            '- Do not omit small items (radish, cucumber, seaweed, kimchi).\n' +
                            '- Keep servings at 1 and use simple serving sizes ("1 serving", "1/4 cup").\n' +
                            '- If uncertain, set isGuess: true and keep macros conservative.\n' +
                            '\nAnalysis text:\n' +
                            analysisTextForFollowUp,
                        },
                        { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
                      ],
                    },
                  ],
                  max_tokens: 360,
                  temperature: 0,
                } as any)
              : await chatCompletionWithCost(openai, {
                  model: 'gpt-4o-mini',
                  response_format: { type: 'json_object' } as any,
                  messages: [
                    {
                      role: 'user',
                      content:
                        'Return JSON only with this shape:\n' +
                        '{"items":[{"name":"string","brand":null,"serving_size":"string","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"isGuess":false}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}\n' +
                        `- Include ONLY these components, exactly as listed: ${listedComponents.join(', ')}.\n` +
                        '- Do not omit any component. Do not add extras.\n' +
                        '- Do not omit small items (radish, cucumber, seaweed, kimchi).\n' +
                        '- Keep servings at 1 and use simple serving sizes ("1 serving", "1/4 cup").\n' +
                        '- If uncertain, set isGuess: true and keep macros conservative.\n' +
                        '\nAnalysis text:\n' +
                        analysisTextForFollowUp,
                    },
                  ],
                  max_tokens: 360,
                  temperature: 0,
                } as any);

            totalCostCents += followUp.costCents;
            const text = followUp.completion.choices?.[0]?.message?.content?.trim() || '';
            const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = cleaned ? parseItemsJsonRelaxed(cleaned) : null;
            const followUpItems = parsed
              ? sanitizeStructuredItems(
                  Array.isArray(parsed)
                    ? parsed
                    : Array.isArray((parsed as any).items)
                    ? (parsed as any).items
                    : [],
                )
              : [];
            if (followUpItems.length > 0) {
              const additions = followUpItems.filter((item: any) => {
                const normalized = normalizeComponentName(item?.name || '');
                if (!normalized) return false;
                return !existingLabels.some((label) => label.includes(normalized) || normalized.includes(label));
              });
              const merged =
                additions.length > 0
                  ? [
                      ...existingFiltered,
                      ...additions.map((item: any) => ({ ...item, isGuess: item?.isGuess === true })),
                    ]
                  : followUpItems;
              resp.items = sanitizeStructuredItems(merged);
              resp.total = computeTotalsFromItems(resp.items) || resp.total;
              itemsSource = itemsSource === 'none' ? 'component_backfill' : `${itemsSource}+component_backfill`;
              itemsQuality = validateStructuredItems(resp.items) ? 'valid' : itemsQuality;
              console.log('✅ Backfilled missing components from AI-only follow-up:', {
                missingCount: additions.length,
              });
              refreshItemsReady();
            }
          } catch (missingErr) {
            console.warn('Missing component AI follow-up failed (non-fatal):', missingErr);
          }
        }
      }
    }

    if (resp.items && resp.items.length > 0 && !resp.total) {
      resp.total = computeTotalsFromItems(resp.items);
    }

    // Hard guard: never return a single summary-style card when multiple components are present.
    if (
      wantStructured &&
      preferMultiDetect &&
      !packagedMode &&
      !labelScan &&
      resp.items &&
      Array.isArray(resp.items) &&
      resp.items.length === 1 &&
      looksLikeMultiIngredientSummary(resp.items)
    ) {
      const summaryLabel = `${String(resp.items?.[0]?.name || '')} ${String(resp.items?.[0]?.serving_size || '')}`.trim();
      const forcedComponents = dedupeComponentList(
        normalizeComponentList([
          ...listedComponents,
          ...analysisComponents,
          ...extractComponentsFromDelimitedText(summaryLabel),
          ...extractComponentsFromDelimitedText(analysisTextForFollowUp),
        ]),
      ).slice(0, 12);

      if (forcedComponents.length > 1) {
        try {
          const componentPrompt =
            'Return JSON only. Use the component list and output exactly one item per component.\n' +
            'You must include ALL components and no extras.\n' +
            `${forcedComponents.map((c) => `- ${c}`).join('\n')}\n` +
            '- Do not combine components into a single item.\n' +
            '- Use simple serving sizes (e.g., "1 serving", "1 slice").\n' +
            '- If unsure, set isGuess: true and leave macros as null.\n' +
            (imageDataUrl ? '- Use the image as the main source of truth.\n' : '') +
            '\nAnalysis text:\n' +
            analysisTextForFollowUp;
          const componentMessages = imageDataUrl
            ? [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: componentPrompt },
                    { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
                  ],
                },
              ]
            : [
                {
                  role: 'user',
                  content: componentPrompt,
                },
              ];
          const componentFollowUp = await chatCompletionWithCost(openai, {
            model: 'gpt-4o',
            response_format: { type: 'json_schema', json_schema: buildComponentBoundSchema(forcedComponents) } as any,
            messages: componentMessages,
            max_tokens: 420,
            temperature: 0,
          } as any);

          totalCostCents += componentFollowUp.costCents;
          const text = componentFollowUp.completion.choices?.[0]?.message?.content?.trim() || '';
          const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
          const parsed = cleaned ? parseItemsJsonRelaxed(cleaned) : null;
          if (parsed) {
            const items = Array.isArray(parsed)
              ? parsed
              : Array.isArray((parsed as any).items)
              ? (parsed as any).items
              : [];
            const total =
              !Array.isArray(parsed) && typeof (parsed as any).total === 'object'
                ? (parsed as any).total
                : null;
            const normalizedComponents = forcedComponents.map((c) => normalizeComponentName(c));
            const itemsByComponent = items.filter((item: any) => {
              const key = normalizeComponentName(item?.component || item?.name || '');
              return key && normalizedComponents.includes(key);
            });
            const orderedItems = normalizedComponents
              .map((comp, idx) => {
                const item = itemsByComponent.find(
                  (candidate: any) => normalizeComponentName(candidate?.component || candidate?.name || '') === comp,
                );
                if (!item) return null;
                const next = { ...item };
                delete (next as any).component;
                if (!next.name) next.name = forcedComponents[idx];
                return next;
              })
              .filter(Boolean) as any[];
            if (
              orderedItems.length === forcedComponents.length &&
              !itemsResultIsInvalid(orderedItems, true)
            ) {
              resp.items = sanitizeStructuredItems(orderedItems);
              resp.total = total || computeTotalsFromItems(resp.items) || resp.total || null;
              itemsSource =
                itemsSource === 'none' ? 'component_bound_repair' : `${itemsSource}+component_bound_repair`;
              itemsQuality = validateStructuredItems(resp.items) ? 'valid' : itemsQuality;
              console.log('✅ Forced component split repaired summary output:', {
                itemCount: resp.items.length,
              });
            }
          }
        } catch (repairErr) {
          console.warn('Component split repair failed (non-fatal):', repairErr);
        }
      }
    }

    // Burger-specific enrichment: ensure core components and realistic per-item macros.
    const burgerEnriched = ensureBurgerComponents(resp.items || [], resp.analysis);
    resp.items = burgerEnriched.items;
    resp.total = burgerEnriched.total || resp.total;

    if (resp.items && Array.isArray(resp.items) && listedComponents.length > 0) {
      const renamed = renameGenericItemsWithComponents(resp.items, listedComponents);
      if (renamed.changed) {
        resp.items = sanitizeStructuredItems(renamed.items);
        itemsSource = itemsSource === 'none' ? 'component_rename' : `${itemsSource}+component_rename`;
        itemsQuality = validateStructuredItems(resp.items) ? 'valid' : itemsQuality;
        console.log('ℹ️ Renamed generic item labels using components list.', {
          renamed: renamed.renamed,
        });
      }
    }

    // Intentionally do NOT add inferred “plausible” components from the prose.
    // This was a major source of hallucinations (e.g., fries or sauces not actually visible).

    // Normalize guess flags, discrete counts (pieces/servings), and convert word numbers to numerals.
    if (resp.items && Array.isArray(resp.items)) {
      resp.items = normalizeGuessFlags(resp.items);
      const discreteNormalized = normalizeDiscreteItems(resp.items, { analysisText: analysis });
      resp.items = discreteNormalized.items;
      if (discreteNormalized.changed && (!resp.total || Object.keys(resp.total || {}).length === 0)) {
        resp.total = computeTotalsFromItems(resp.items);
      }
      if (discreteNormalized.debug.length > 0) {
        console.log('[FOOD_DEBUG] discrete normalization preview', discreteNormalized.debug.slice(0, 4));
      }
      resp.items = normalizeDiscreteCounts(resp.items);
      const weightFix = fixWeightUnitsMisreadAsPieces(resp.items)
      if (weightFix.changed) {
        resp.items = weightFix.items
        resp.total = computeTotalsFromItems(resp.items) || resp.total
      }
      if (!resp.total || Object.keys(resp.total || {}).length === 0) {
        resp.total = computeTotalsFromItems(resp.items);
      }
    }

    // Sliced produce sanity: avoid egregious "whole avocado" guesses when the item is clearly just slices.
    if (resp.items && Array.isArray(resp.items) && resp.items.length > 0) {
      const sanitized = applySlicedProduceSanity(resp.items)
      resp.items = sanitized.items
      if (sanitized.changed) {
        resp.total = computeTotalsFromItems(resp.items) || resp.total
      }
    }

    if (packagedMode && labelScan && imageDataUrl && resp.items && resp.items.length > 0) {
      try {
        const labelModel = model === 'gpt-5.2' ? model : 'gpt-5.2'
        const labelResult = await extractLabelPerServingFromImage(openai, imageDataUrl, labelModel)
        totalCostCents += labelResult.costCents
        const parsed = labelResult.parsed || {}
        const perServing = parsed?.per_serving || parsed?.perServing || null
        const toNumber = (value: any) => {
          const num = Number(value)
          return Number.isFinite(num) ? num : null
        }
        const hasPerServingValues =
          perServing &&
          typeof perServing === 'object' &&
          Object.values(perServing).some((value) => value !== null && value !== undefined && value !== '');
        if (hasPerServingValues) {
          const nextItems = [...resp.items]
          const targetIndex = 0
          const next = { ...nextItems[targetIndex] }
          if (parsed?.serving_size || parsed?.servingSize) {
            next.serving_size = String(parsed.serving_size || parsed.servingSize || '').trim()
          }
          next.calories = toNumber(perServing.calories)
          next.protein_g = toNumber(perServing.protein_g ?? perServing.protein)
          next.carbs_g = toNumber(perServing.carbs_g ?? perServing.carbs)
          next.fat_g = toNumber(perServing.fat_g ?? perServing.fat)
          next.fiber_g = toNumber(perServing.fiber_g ?? perServing.fiber)
          next.sugar_g = toNumber(perServing.sugar_g ?? perServing.sugar)
          nextItems[targetIndex] = next
          resp.items = nextItems
          resp.total = computeTotalsFromItems(resp.items) || resp.total
        } else {
          const nextItems = resp.items.map((item: any, index: number) =>
            index === 0
              ? {
                  ...item,
                  labelNeedsReview: true,
                  labelNeedsReviewMessage:
                    'We could not read the per serve column clearly. Please retake the label photo.',
                  calories: null,
                  protein_g: null,
                  carbs_g: null,
                  fat_g: null,
                  fiber_g: null,
                  sugar_g: null,
                }
              : item,
          )
          resp.items = nextItems
          resp.total = computeTotalsFromItems(resp.items) || resp.total
        }
      } catch (labelErr) {
        console.warn('Label per-serving extraction failed (non-fatal):', labelErr)
      }
    }

    // Final safety pass: if the AI has described a discrete portion like
    // "3 large eggs" or "4 slices of bacon" but provided calories/macros that
    // only match a single unit, scale those macros up so that the totals match
    // the visible serving description. This does not touch the Food Diary UI
    // or diary loading logic – it only corrects the structured items returned
    // from this API.
    if (resp.items && Array.isArray(resp.items) && resp.items.length > 0) {
      const harmonized = harmonizeDiscretePortionItems(resp.items, {
        applyWeightDefaults: !packagedMode && !labelScan,
      });
      resp.items = harmonized.items;
      if (harmonized.total) {
        resp.total = harmonized.total;
      } else if (!resp.total) {
        resp.total = computeTotalsFromItems(resp.items);
      }
    }

    if (!packagedMode && !labelScan && resp.items && Array.isArray(resp.items) && resp.items.length > 0) {
      const friedFloor = applyFriedSeafoodCalorieFloor(resp.items);
      const chickenFloor = applyRoastedChickenCalorieFloor(friedFloor.items);
      if (friedFloor.changed || chickenFloor.changed) {
        resp.items = chickenFloor.items;
        resp.total = computeTotalsFromItems(resp.items) || resp.total;
      }
    }

    // Egg-specific enforcement: if analysis text says "two eggs" (or any number >=2),
    // force the payload to that count, with pieces/serving_size updated and macros scaled.
    resp.items = enforceEggCountFromAnalysis(resp.items, analysis);
    if (resp.items && (!resp.total || !isPlausibleTotal(resp.total))) {
      resp.total = computeTotalsFromItems(resp.items);
    }
    if (resp.items && Array.isArray(resp.items) && resp.items.length > 0) {
      const strictPieces = stripPiecesWithoutExplicitCount(resp.items);
      if (strictPieces.changed) {
        resp.items = strictPieces.items;
        resp.total = computeTotalsFromItems(resp.items) || resp.total;
      }
    }

    // Final safety net for image analyses: never return a single multi-ingredient summary card.
    // If we can detect multiple components but still only have one item, split into multiple
    // editable cards (macros left blank) to preserve per-ingredient UX.
    if (
      isImageAnalysis &&
      preferMultiDetect &&
      !packagedMode &&
      resp.items &&
      Array.isArray(resp.items) &&
      resp.items.length <= 1 &&
      (analysisLooksMulti || looksLikeMultiIngredientSummary(resp.items))
    ) {
      const fallback = buildMultiComponentFallback(analysisTextForFollowUp, resp.total);
      if (fallback.items.length > 1) {
        resp.items = fallback.items;
        if (!resp.total) {
          resp.total = fallback.total || resp.total || null;
        }
        itemsSource = itemsSource === 'none' ? 'component_split' : `${itemsSource}+component_split`;
        itemsQuality = 'weak';
        console.warn('✅ Split multi-ingredient summary into separate cards (macros left blank).');
      }
    }

    // Enforce multi-item output for meal analyses (non-packaged) so the UI never shows a single card.
    if (
      !STRICT_AI_ONLY_ITEMS &&
      preferMultiDetect &&
      !packagedMode &&
      (!resp.items || resp.items.length === 0 || (!validateStructuredItems(resp.items) || looksLikeSingleGenericItem(resp.items)))
    ) {
      const fallback = buildMultiComponentFallback(analysis, resp.total);
      // Mark all fallback items as guesses to avoid presenting them as authoritative
      resp.items = fallback.items.map((it) => ({ ...it, isGuess: true, calories: null, protein_g: null, carbs_g: null, fat_g: null }));
      resp.total = fallback.total || resp.total || null;
      itemsSource = itemsSource === 'none' ? 'multi_fallback' : `${itemsSource}+multi_fallback`;
      itemsQuality = 'weak';
      console.warn('✅ Enforced multi-item fallback to prevent single-card UI for meals (macros left blank to avoid equal-split).');
    }

    // Packaged mode: fill missing macros from FatSecret without overriding existing values.
    if (packagedMode && !labelScan && resp.items && Array.isArray(resp.items) && resp.items.length > 0) {
      const enriched = await enrichPackagedItemsWithFatSecret(resp.items);
      if (enriched.total) {
        resp.items = enriched.items;
        resp.total = enriched.total;
      }
    }

    // General (non-packaged) enrichment when macros are missing/zero
    if (!labelScan && resp.items && Array.isArray(resp.items) && resp.items.length > 0) {
      const needsEnrichment = resp.items.some(
        (it: any) =>
          (!Number.isFinite(Number(it?.calories)) || Number(it?.calories) === 0) ||
          ((!Number.isFinite(Number(it?.protein_g)) || Number(it?.protein_g) === 0) &&
            (!Number.isFinite(Number(it?.carbs_g)) || Number(it?.carbs_g) === 0) &&
            (!Number.isFinite(Number(it?.fat_g)) || Number(it?.fat_g) === 0)),
      );
      if (needsEnrichment) {
        const enriched = await enrichItemsWithFatSecretIfMissing(resp.items);
        if (enriched.changed) {
          resp.items = enriched.items;
          resp.total = enriched.total || resp.total || computeTotalsFromItems(enriched.items);
          itemsSource = `${itemsSource}+fatsecret_enrich`;
          itemsQuality = validateStructuredItems(resp.items) ? 'valid' : itemsQuality;
          console.log('ℹ️ Applied FatSecret enrichment for missing macros.');
        }
      }
    }

    if (!labelScan && !packagedMode && resp.items && Array.isArray(resp.items) && resp.items.length > 0) {
      const calibrated = await enrichItemsWithDatabaseIfOutlier(resp.items, {
        maxItems: feedbackDown ? Math.min(resp.items.length, 6) : 1,
        outlierRatio: feedbackDown ? 0.15 : 0.2,
        allowIncrease: feedbackDown,
      });
      if (calibrated.changed) {
        resp.items = calibrated.items;
        resp.total = calibrated.total || resp.total || computeTotalsFromItems(calibrated.items);
        itemsSource = `${itemsSource}+db_calibrate`;
        itemsQuality = validateStructuredItems(resp.items) ? 'valid' : itemsQuality;
        console.log('ℹ️ Applied database calibration for outlier macros.');
      }
    }

    if (!labelScan && !packagedMode && resp.items && Array.isArray(resp.items) && resp.items.length > 1) {
      const deduped = removeSummaryDuplicateItems(resp.items);
      if (deduped.removed > 0) {
        resp.items = deduped.items;
        resp.total = computeTotalsFromItems(resp.items) || resp.total;
        itemsSource = `${itemsSource}+summary_dedupe`;
        itemsQuality = validateStructuredItems(resp.items) ? 'valid' : itemsQuality;
        console.log('ℹ️ Removed summary duplicate items.', { removed: deduped.removed });
      }
    }

    // Stabilize totals: prefer plausible incoming total when it roughly matches per-item sums; otherwise recompute from items.
    if (labelScan) {
      resp.total = computeTotalsFromItems(resp.items) || resp.total;
    } else {
      resp.total = chooseCanonicalTotal(resp.items, resp.total);
    }

    // Consistency repair: if totals are implausibly low for a multi-item meal,
    // run a stricter vision pass to force realistic per-component macros.
    if (
      isImageAnalysis &&
      !packagedMode &&
      !labelScan &&
      resp.items &&
      Array.isArray(resp.items) &&
      resp.items.length > 0
    ) {
      const totalCalories = Number(resp.total?.calories ?? 0);
      const componentCount = Math.max(listedComponents.length, resp.items.length);
      const joinedNames = resp.items
        .map((item: any) => `${item?.name || ''} ${item?.serving_size || ''}`)
        .join(' ')
        .toLowerCase();
      const hasFriedCue = /\b(fried|battered|breaded|crumbed|wedge|wedges|fries|chips|tartar)\b/i.test(joinedNames);
      const minTotal =
        componentCount >= 4
          ? 350
          : componentCount >= 3
          ? 250
          : componentCount >= 2
          ? 180
          : 0;
      const minTotalWithCue = hasFriedCue ? Math.max(minTotal, 300) : minTotal;

      if (Number.isFinite(totalCalories) && totalCalories > 0 && totalCalories < minTotalWithCue) {
        try {
          const repairComponents = normalizeComponentList(
            listedComponents.length > 0
              ? listedComponents
              : resp.items.map((item: any) => String(item?.name || '')).filter(Boolean),
          );
          const repairHint =
            repairComponents.length > 0
              ? `- Components list (include each as its own item): ${repairComponents.join(', ')}.\n`
              : '';
          const repairPrompt =
            'Return JSON only with this shape:\n' +
            '{"items":[{"name":"string","brand":null,"serving_size":"string","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}],' +
            '"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}\n' +
            repairHint +
            '- Use the image as the primary source of truth.\n' +
            '- Do NOT underestimate calories for fried/battered items.\n' +
            '- Use realistic restaurant portion sizes.\n' +
            '- Return one item per distinct component.\n';
          console.warn('⚠️ Analyzer: totals too low; running consistency repair pass.');
          const repair = await chatCompletionWithCost(openai, {
            model: 'gpt-4o',
            response_format: { type: 'json_object' } as any,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: repairPrompt },
                  { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
                ],
              },
            ],
            max_tokens: 420,
            temperature: 0,
          } as any);

          totalCostCents += repair.costCents;
          const text = repair.completion.choices?.[0]?.message?.content?.trim() || '';
          const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
          const parsed = cleaned ? parseItemsJsonRelaxed(cleaned) : null;
          const items = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as any)?.items)
            ? (parsed as any).items
            : [];
          const total =
            !Array.isArray(parsed) && typeof (parsed as any)?.total === 'object'
              ? (parsed as any).total
              : null;
          if (items.length > 0 && !itemsResultIsInvalid(items, componentCount > 1)) {
            resp.items = sanitizeStructuredItems(items);
            resp.total = total || computeTotalsFromItems(resp.items) || resp.total;
            itemsSource = itemsSource === 'none' ? 'consistency_repair' : `${itemsSource}+consistency_repair`;
            itemsQuality = validateStructuredItems(resp.items) ? 'valid' : itemsQuality;
            console.log('✅ Consistency repair produced items:', resp.items.length);
          }
        } catch (repairErr) {
          console.warn('Consistency repair failed (non-fatal):', repairErr);
        }
      }
    }

    // Packaged mode: skip secondary OpenAI per-serving extraction to keep one API call per analysis.
    if (packagedMode && resp.items && Array.isArray(resp.items) && resp.items.length > 0 && imageDataUrl) {
      console.log('ℹ️ Packaged mode active; secondary per-serving OpenAI call disabled to reduce usage.');
    }

    // NOTE: USDA/FatSecret database enhancement removed from AI photo analysis flow
    // These databases are still available via /api/food-data for manual ingredient lookup
    // The AI analysis works better without database interference - it provides accurate
    // estimates based on visual analysis and portion sizes, which databases can't match.

    // HEALTH COMPATIBILITY CHECK: advisory-only, uses saved allergies/diabetes settings
    try {
      const warnings: string[] = [];
      const lowerAnalysis = (analysis || (resp as any)?.analysis || resp.total?.description || '').toString().toLowerCase();
      const itemNames = Array.isArray(resp.items)
        ? resp.items
            .map((it: any) => `${it?.name || ''} ${it?.serving_size || ''}`.toLowerCase())
            .join(' ')
        : '';
      const textBlob = `${lowerAnalysis} ${itemNames}`;

      const normalizeAllergy = (val: string) => {
        const lower = val.toLowerCase();
        if (lower.includes('peanut')) return 'peanut';
        if (lower.includes('tree nut')) return 'tree nuts';
        if (lower.includes('nut')) return 'tree nuts';
        if (lower.includes('gluten') || lower.includes('celiac') || lower.includes('coeliac') || lower.includes('wheat'))
          return 'gluten';
        if (lower.includes('dairy') || lower.includes('milk') || lower.includes('lactose')) return 'dairy';
        if (lower.includes('egg')) return 'egg';
        if (lower.includes('shellfish') || lower.includes('shrimp') || lower.includes('prawn')) return 'shellfish';
        if (lower.includes('fish')) return 'fish';
        if (lower.includes('soy')) return 'soy';
        if (lower.includes('sesame')) return 'sesame';
        if (lower.includes('corn') || lower.includes('maize')) return 'corn';
        return lower;
      };

      const allergyKeywordMap: Record<string, string[]> = {
        peanut: ['peanut', 'groundnut', 'satay', 'peanut butter'],
        'tree nuts': ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia'],
        gluten: ['gluten', 'wheat', 'barley', 'rye', 'malt', 'semolina', 'spelt'],
        dairy: ['milk', 'cream', 'cheese', 'butter', 'yogurt', 'ghee', 'custard'],
        egg: ['egg', 'eggs', 'mayo', 'mayonnaise'],
        shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'shellfish', 'scallop'],
        fish: ['fish', 'salmon', 'tuna', 'cod', 'trout', 'anchovy', 'sardine'],
        soy: ['soy', 'soya', 'edamame', 'tofu', 'tempeh', 'miso', 'soy sauce'],
        sesame: ['sesame', 'tahini', 'sesame seed'],
        corn: ['corn', 'maize', 'tortilla', 'polenta', 'cornmeal'],
        sulfites: ['sulfite', 'sulphite', 'wine', 'dried fruit', 'cider'],
      };

      const allergiesSelected = Array.isArray(allergySettings.allergies)
        ? allergySettings.allergies.filter((a) => typeof a === 'string' && a.trim().length > 0)
        : [];

      allergiesSelected.forEach((allergyRaw: string) => {
        const canonical = normalizeAllergy(allergyRaw);
        const keywords = allergyKeywordMap[canonical] || [canonical];
        const hit = keywords.some((kw) => textBlob.includes(kw.toLowerCase()));
        if (hit) {
          warnings.push(`Contains or may contain ${allergyRaw} based on the analysis.`);
        }
      });

      const diabetesType = (allergySettings.diabetesType || '').toLowerCase();
      if (diabetesType) {
        const sugarRaw =
          (resp.total as any)?.sugar_g ?? (resp.total as any)?.sugar ?? (resp.total as any)?.sugars_g;
        const sugar = Number(sugarRaw);
        const hasSugar = Number.isFinite(sugar);
        const carbsRaw = (resp.total as any)?.carbs_g ?? (resp.total as any)?.carbohydrates;
        const carbs = Number(carbsRaw);
        const hasCarbs = Number.isFinite(carbs);
        const hasSugaryKeywords = /dessert|cake|cookie|ice cream|juice|soda|sweet|syrup|candy|chocolate/.test(textBlob);

        const thresholds =
          diabetesType === 'prediabetes'
            ? { sugar: 28, carbs: 75, label: 'pre-diabetes' }
            : diabetesType === 'type1'
            ? { sugar: 22, carbs: 70, label: 'Type 1 diabetes' }
            : { sugar: 20, carbs: 65, label: 'Type 2 diabetes' };

        if (hasSugar && sugar > thresholds.sugar) {
          warnings.push(`High sugar for ${thresholds.label}: about ${Math.round(sugar)}g (target ≤ ${thresholds.sugar}g per meal).`);
        } else if (!hasSugar && hasSugaryKeywords) {
          warnings.push(`High-sugar food spotted; use caution for ${thresholds.label}.`);
        }
        if (hasCarbs && carbs > thresholds.carbs) {
          warnings.push(`High carbs for ${thresholds.label}: about ${Math.round(carbs)}g.`);
        }
      }

      resp.healthWarning = warnings.length ? `⚠️ Health warning:\n- ${warnings.join('\n- ')}` : null;

      if (warnings.length > 0) {
        try {
          const itemList = Array.isArray(resp.items)
            ? resp.items
                .map((it: any) => `${it?.name || ''}`.trim())
                .filter(Boolean)
                .slice(0, 6)
            : [];
          const totalParts: string[] = [];
          const calories = Number((resp.total as any)?.calories);
          const carbs = Number((resp.total as any)?.carbs_g);
          const fat = Number((resp.total as any)?.fat_g);
          const sugar = Number((resp.total as any)?.sugar_g);
          if (Number.isFinite(calories)) totalParts.push(`Calories ${Math.round(calories)}`);
          if (Number.isFinite(carbs)) totalParts.push(`Carbs ${Math.round(carbs)}g`);
          if (Number.isFinite(fat)) totalParts.push(`Fat ${Math.round(fat)}g`);
          if (Number.isFinite(sugar)) totalParts.push(`Sugar ${Math.round(sugar)}g`);

          const alternativesPrompt =
            'You are a nutrition assistant. The user received a health warning for this meal.\n' +
            'Suggest 2-3 safer alternatives. Each option must include:\n' +
            '- a short option name\n' +
            '- a simple 2-3 step recipe\n' +
            '- one short reason why it is a better fit\n' +
            'Avoid ingredients or issues mentioned in the warning. Keep the language plain and short.\n\n' +
            `Meal items: ${itemList.length > 0 ? itemList.join(', ') : 'Unknown'}\n` +
            `Totals: ${totalParts.length > 0 ? totalParts.join(', ') : 'Unknown'}\n` +
            `Warning: ${warnings.join(' | ')}\n\n` +
            'Return plain text only in this format:\n' +
            '- Option: ...\n' +
            '  Recipe: step 1; step 2; step 3.\n' +
            '  Why: ...';

          const alternatives = await chatCompletionWithCost(openai, {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: alternativesPrompt }],
            max_tokens: 220,
            temperature: 0.2,
          } as any);

          totalCostCents += alternatives.costCents;
          const text = alternatives.completion?.choices?.[0]?.message?.content?.trim() || '';
          resp.alternatives = text.replace(/```/g, '').trim() || null;
        } catch (alternativesError) {
          console.warn('Health alternatives generation failed (non-fatal):', alternativesError);
          resp.alternatives = null;
        }
      } else {
        resp.alternatives = null;
      }
    } catch (healthError) {
      console.warn('⚠️ Health compatibility section skipped due to error:', healthError);
    }

    // DIET CHECK: advisory-only, uses saved diet preference (no extra AI calls)
    try {
      const normalizedDietIds = normalizeDietTypes(dietTypes)
      if (normalizedDietIds.length > 0) {
        const itemNames = Array.isArray(resp.items)
          ? resp.items.map((it: any) => `${it?.name || ''} ${it?.serving_size || ''}`.trim()).filter(Boolean)
          : []
        const analysisText = (analysis || (resp as any)?.analysis || '').toString()
        const result = checkMultipleDietCompatibility({
          dietIds: normalizedDietIds,
          itemNames,
          analysisText,
          totals: (resp as any)?.total || null,
        })

        const warningsByDiet = result.warningsByDiet || []
        const suggestions = result.suggestions || []

        ;(resp as any).dietWarning =
          warningsByDiet.length > 0
            ? `⚠️ Diet warning:\n- ${warningsByDiet
                .map((d) => {
                  const joined = (d.warnings || []).join(' ')
                  return `${d.dietLabel}: ${joined}`.trim()
                })
                .join('\n- ')}`
            : null
        ;(resp as any).dietAlternatives = suggestions.length > 0 ? `- ${suggestions.join('\n- ')}` : null
      } else {
        ;(resp as any).dietWarning = null
        ;(resp as any).dietAlternatives = null
      }
    } catch (dietError) {
      console.warn('⚠️ Diet compatibility section skipped due to error:', dietError)
    }

    // Fixed per-use price is charged upfront; no remainder charge here.
    // Skip if allowed via free use OR when billing checks are disabled.
    if (BILLING_ENFORCED && !allowViaFreeUse) {
      try {
        const cm = new CreditManager(currentUser.id);
        const remainder = 0;
        const ok = await cm.chargeCents(remainder);
        if (!ok) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
        }
      } catch (e) {
        console.warn('Wallet charge failed:', e);
        return NextResponse.json({ error: 'Billing error' }, { status: 402 });
      }
    }

    if (packagedMode && Array.isArray(resp.items) && resp.items.length > 0) {
      const packagedReview = sanitizePackagedLabelItems(resp.items);
      resp.items = packagedReview.items;
      if (packagedReview.needsReview) {
        resp.labelNeedsReview = true;
        resp.labelReviewMessage = packagedReview.message;
        resp.total = computeTotalsFromItems(resp.items);
      }
    }

    const finalSummary = {
      itemsSource,
      itemsQuality,
      itemCount: Array.isArray(resp.items) ? resp.items.length : 0,
      totalPreview: resp.total
        ? {
            calories: (resp.total as any)?.calories,
            protein_g: (resp.total as any)?.protein_g,
            carbs_g: (resp.total as any)?.carbs_g,
            fat_g: (resp.total as any)?.fat_g,
          }
        : null,
      itemsPreview: summarizeItemsForLog(resp.items || []),
    };
    console.log('[FOOD_DEBUG] structured summary', finalSummary);

    const discreteLog = summarizeDiscreteItemsForLog(resp.items || []);
    if (discreteLog.length > 0) {
      console.log('[FOOD_DEBUG] discrete items', discreteLog);
    }

    const analysisId = imageHash ? `food-${imageHash.slice(0, 8)}` : `food-${Date.now()}`;

    // Log AI usage for the main Food Analyzer (fire-and-forget).
    // Use the primary analysis tokens and the total combined cost (analysis + follow-ups).
    logAiUsageEvent({
      feature: 'food:analysis',
      userId: currentUser.id || null,
      userLabel: currentUser.email || null,
      scanId: analysisId,
      model,
      promptTokens: primary.promptTokens,
      completionTokens: primary.completionTokens,
      costCents: totalCostCents,
      endpoint: '/api/analyze-food',
      success: true,
    }).catch(() => {});

    // Debug: log raw items/total for diagnostics (no PII; limited preview)
    try {
      console.log('[FOOD_DEBUG] raw response preview', {
        itemCount: Array.isArray(resp.items) ? resp.items.length : 0,
        itemsPreview: Array.isArray(resp.items)
          ? resp.items.slice(0, 5).map((it: any) => ({
              name: it?.name,
              serving_size: it?.serving_size,
              calories: it?.calories,
              protein_g: it?.protein_g,
              carbs_g: it?.carbs_g,
              fat_g: it?.fat_g,
              fiber_g: it?.fiber_g,
              sugar_g: it?.sugar_g,
              isGuess: it?.isGuess,
            }))
          : null,
        totalPreview: resp.total
          ? {
              calories: (resp.total as any)?.calories,
              protein_g: (resp.total as any)?.protein_g,
              carbs_g: (resp.total as any)?.carbs_g,
              fat_g: (resp.total as any)?.fat_g,
              fiber_g: (resp.total as any)?.fiber_g,
              sugar_g: (resp.total as any)?.sugar_g,
            }
          : null,
        });
    } catch (logErr) {
      console.warn('[FOOD_DEBUG] log error', logErr);
    }

    resp.analysisId = analysisId;
    return NextResponse.json(resp);

  } catch (error) {
    console.error('💥 AI API Error:', error);
    
    // Handle specific OpenAI errors
    if (error instanceof Error) {
      console.log('🔍 Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 200)
      });
      
      if (error.message.includes('insufficient_quota')) {
        return NextResponse.json(
          { error: 'OpenAI API quota exceeded. Please check your billing.' },
          { status: 429 }
        );
      }
      if (error.message.includes('invalid_api_key')) {
        return NextResponse.json(
          { error: 'Invalid OpenAI API key. Please check your configuration.' },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to analyze food' },
      { status: 500 }
    );
  }
} 
