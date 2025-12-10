import { NextRequest, NextResponse } from 'next/server';
/**
 * IMPORTANT – DO NOT CHANGE OUTPUT FORMAT WITHOUT UPDATING UI PARSER
 * The Food Diary UI in `app/food/page.tsx` extracts nutrition via regex from a single line:
 *   Calories: <number>, Protein: <g>, Carbs: <g>, Fat: <g>
 * If you modify prompts or response shapes, ensure this exact line remains present.
 * A server-side fallback below appends this line when missing.
 *
 * ⚠️ GUARD RAIL (GUARD_RAILS.md §3.9):
 * - Do NOT weaken burger/patty/cheese/bacon/egg per-piece defaults or the
 *   `piecesPerServing` seeding / numeric normalization.
 * - Do NOT change portion sync expectations without explicit user approval.
 */
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { searchFatSecretFoods } from '@/lib/food-data';
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system';
import crypto from 'crypto';
import { consumeRateLimit } from '@/lib/rate-limit';

// Bump this when changing curated nutrition to invalidate old cached images.
const CACHE_VERSION = 'v3';
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 3;   // stop runaway loops quickly

// Guard rail: this route powers the main Food Analyzer. Billing enforcement
// (BILLING_ENFORCED) must remain true for production unless the user explicitly
// asks to pause billing. Do not toggle it off as a "quick fix" for other bugs.
import OpenAI from 'openai';
import { chatCompletionWithCost } from '@/lib/metered-openai';
import { costCentsEstimateFromText } from '@/lib/cost-meter';
import { logAiUsageEvent, runChatCompletionWithLogging } from '@/lib/ai-usage-logger';
import { getImageMetadata } from '@/lib/image-metadata';
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

// Normalize isGuess flag across items
const normalizeGuessFlags = (items: any[]): any[] =>
  Array.isArray(items)
    ? items.map((item) => ({
        ...item,
        isGuess: item?.isGuess === true,
      }))
    : [];

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

const normalizeDiscreteCounts = (items: any[]): any[] =>
  Array.isArray(items)
    ? items.map((item) => ({
        ...item,
        name: replaceWordNumbers(item?.name || ''),
        serving_size: replaceWordNumbers(item?.serving_size || item?.servingSize || ''),
        isGuess: item?.isGuess === true,
      }))
    : [];

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
const harmonizeDiscretePortionItems = (items: any[]): { items: any[]; total: any | null } => {
  if (!Array.isArray(items) || items.length === 0) {
    return { items, total: null };
  }

  const cloned = items.map((item) => ({ ...item }));

  const containsAny = (text: string, keywords: string[]): boolean => {
    const lower = text.toLowerCase();
    return keywords.some((k) => lower.includes(k));
  };

  const EGG_KEYWORDS = ['egg', 'eggs', 'scrambled egg', 'scrambled eggs', 'omelette', 'omelet'];
  const BACON_KEYWORDS = ['bacon', 'rasher', 'rashers', 'bacon strip', 'bacon strips'];
  const PATTY_KEYWORDS = ['patty', 'pattie', 'patties', 'burger patty', 'beef patty'];
  const CHEESE_KEYWORDS = ['cheese', 'cheddar', 'mozzarella', 'slice of cheese', 'cheese slice'];
  const DISCRETE_DEFAULTS: Array<{
    key: 'patty' | 'bacon' | 'cheese' | 'egg';
    keywords: string[];
    gramsPerPiece: number;
    caloriesPerPiece: number;
    proteinPerPiece?: number;
    fatPerPiece?: number;
  }> = [
    {
      key: 'patty',
      keywords: PATTY_KEYWORDS,
      gramsPerPiece: 115,
      caloriesPerPiece: 250,
      proteinPerPiece: 22,
      fatPerPiece: 18,
    },
    {
      key: 'bacon',
      keywords: BACON_KEYWORDS,
      gramsPerPiece: 15,
      caloriesPerPiece: 45,
      proteinPerPiece: 3,
      fatPerPiece: 3.5,
    },
    {
      key: 'cheese',
      keywords: CHEESE_KEYWORDS,
      gramsPerPiece: 25,
      caloriesPerPiece: 100,
      proteinPerPiece: 6,
      fatPerPiece: 9,
    },
    {
      key: 'egg',
      keywords: EGG_KEYWORDS,
      gramsPerPiece: 50,
      caloriesPerPiece: 70,
      proteinPerPiece: 6,
      fatPerPiece: 5,
    },
  ];

  for (const item of cloned) {
    const name = (item?.name || '') as string;
    const servingSize = (item?.serving_size || '') as string;
    const labelSource = replaceWordNumbers(`${name} ${servingSize}`.trim());
    const detectedCount = parseCountFromText(labelSource);

    const defaults = DISCRETE_DEFAULTS.find((d) => containsAny(labelSource, d.keywords));
    if (!defaults && !detectedCount) continue;

    const existingPieces =
      Number.isFinite(Number((item as any).piecesPerServing)) && Number(item.piecesPerServing) > 0
        ? Number(item.piecesPerServing)
        : null;
    const existingServings =
      Number.isFinite(Number(item?.servings)) && Number(item.servings) > 0 ? Number(item.servings) : 1;

    let piecesPerServing = detectedCount && detectedCount > 0 ? detectedCount : existingPieces;
    if (!piecesPerServing || piecesPerServing <= 0) {
      piecesPerServing = defaults?.key === 'patty' ? 2 : 1;
    }

    let totalPieces =
      (existingServings && piecesPerServing ? existingServings * piecesPerServing : piecesPerServing) || 1;
    if (detectedCount && detectedCount > totalPieces) {
      totalPieces = detectedCount;
    }
    if (totalPieces <= 0) totalPieces = 1;

    const normalizedServings = Math.max(1, totalPieces / piecesPerServing);
    item.servings = Math.round(normalizedServings * 1000) / 1000;
    (item as any).piecesPerServing = piecesPerServing;

    if (defaults) {
      // Seed serving_size with a discrete hint when missing so the UI picks up pieces.
      if (!item.serving_size || String(item.serving_size).trim().length === 0) {
        const label =
          defaults.key === 'patty'
            ? `${piecesPerServing} patty${piecesPerServing > 1 ? 'ies' : 'y'} (4–6 oz)`
            : defaults.key === 'bacon'
            ? `${piecesPerServing} slice${piecesPerServing > 1 ? 's' : ''} bacon`
            : defaults.key === 'cheese'
            ? `${piecesPerServing} cheese slice${piecesPerServing > 1 ? 's' : ''}`
            : `${piecesPerServing} piece${piecesPerServing > 1 ? 's' : ''}`;
        item.serving_size = label;
      }

      const totalPiecesForMacros = Math.max(totalPieces, piecesPerServing * item.servings);
      const calories = Number(item?.calories ?? 0);
      const protein = Number(item?.protein_g ?? 0);
      const fat = Number(item?.fat_g ?? 0);

      const perPieceCalories =
        totalPiecesForMacros > 0 && Number.isFinite(calories) ? calories / totalPiecesForMacros : 0;
      const perPieceProtein =
        totalPiecesForMacros > 0 && Number.isFinite(protein) ? protein / totalPiecesForMacros : 0;
      const perPieceFat = totalPiecesForMacros > 0 && Number.isFinite(fat) ? fat / totalPiecesForMacros : 0;

      if (!Number.isFinite(calories) || perPieceCalories < defaults.caloriesPerPiece * 0.9) {
        item.calories = Math.round(defaults.caloriesPerPiece * totalPiecesForMacros);
      }
      if (
        defaults.proteinPerPiece !== undefined &&
        (!Number.isFinite(protein) || perPieceProtein < defaults.proteinPerPiece * 0.9)
      ) {
        item.protein_g = Math.round(defaults.proteinPerPiece * totalPiecesForMacros * 10) / 10;
      }
      if (
        defaults.fatPerPiece !== undefined &&
        (!Number.isFinite(fat) || perPieceFat < defaults.fatPerPiece * 0.9)
      ) {
        item.fat_g = Math.round(defaults.fatPerPiece * totalPiecesForMacros * 10) / 10;
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

  // Normalize patties to the detected count (or default 2) with realistic per-piece macros and weight hints.
  base.forEach((it) => {
    const n = String(it?.name || '').toLowerCase();
    if (!n.includes('patty')) return;

    const detectedCount = parseCountFromText(`${it?.name || ''} ${it?.serving_size || ''}`) || null;
    const existingPieces =
      Number.isFinite(Number((it as any).piecesPerServing)) && Number((it as any).piecesPerServing) > 0
        ? Number((it as any).piecesPerServing)
        : null;
    const piecesPerServing = detectedCount && detectedCount > 0 ? detectedCount : existingPieces || 2;
    const existingServings =
      Number.isFinite(Number(it.servings)) && Number(it.servings) > 0 ? Number(it.servings) : 1;
    const totalPieces = Math.max(
      piecesPerServing * existingServings,
      detectedCount || 0,
      piecesPerServing,
      2,
    );
    const normalizedServings = Math.max(1, Math.round((totalPieces / piecesPerServing) * 1000) / 1000);

    (it as any).piecesPerServing = piecesPerServing;
    it.servings = normalizedServings;

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
    serving_size: '2 patties (4–6 oz each)',
    piecesPerServing: 2,
    servings: 1,
    calories: 500,
    protein_g: 44,
    carbs_g: 0,
    fat_g: 36,
    fiber_g: 0,
    sugar_g: 0,
    customGramsPerServing: 230,
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
    serving_size: '2 slices',
    piecesPerServing: 2,
    servings: 1,
    calories: 200,
    protein_g: 12,
    carbs_g: 1,
    fat_g: 18,
    fiber_g: 0,
    sugar_g: 0,
    customGramsPerServing: 50,
  }));

  ensureItem(['bacon'], () => ({
    name: 'Bacon slice',
    brand: null,
    serving_size: '2 slices',
    piecesPerServing: 2,
    servings: 1,
    calories: 90,
    protein_g: 6,
    carbs_g: 0,
    fat_g: 7,
    fiber_g: 0,
    sugar_g: 0,
    customGramsPerServing: 30,
  }));

  ensureItem(['lettuce'], () => ({
    name: 'Lettuce',
    brand: null,
    serving_size: '1 leaf',
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
    serving_size: '2 slices',
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

// In-memory cache for repeated photo analyses (keyed by image hash).
// Avoids re-calling the model and keeps macros consistent for the same photo.
const imageAnalysisCache = new Map<
  string,
  { analysis: string; items: any[] | null; total: any | null }
>();

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

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
    const rateCheck = consumeRateLimit('food-analyzer', rateKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
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
    let packagedEmphasisBlock = '';

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
- Copy the per-serving numbers verbatim (calories, protein, carbs, fat, fiber, sugar) and the printed serving size.
- Do NOT scale from per-100g to per-serving; do NOT "correct" the label.
- Keep serving_size as written on the label and set servings to 1 by default (user will adjust).`
        : '';
    };

    let isReanalysis = false;
    if (contentType?.includes('application/json')) {
      // Handle text-based food analysis
      const body = await req.json();
      const { textDescription, foodType, isReanalysis: reFlag, returnItems, multi, analysisMode: bodyMode } = body as any;
      isReanalysis = !!reFlag;
      // Default to true unless explicitly disabled
      wantStructured = returnItems !== undefined ? !!returnItems : true;
      preferMultiDetect = multi !== undefined ? !!multi : true;
      setAnalysisMode(bodyMode);
      console.log('📝 Text analysis mode:', { textDescription, foodType });

      if (!textDescription) {
        return NextResponse.json(
          { error: 'No food description provided' },
          { status: 400 }
        );
      }

      messages = [
        {
          role: "user",
          content: `Analyze this food description and provide accurate nutrition information based on the EXACT portion size specified. Be precise about size differences.

CRITICAL FOR MEALS WITH MULTIPLE COMPONENTS:
- If the description mentions multiple distinct foods (e.g., plate with protein, vegetables, grains, salads, soups, stews, sandwiches with multiple fillings, bowls with toppings), you MUST:
  1. Identify EACH component separately
  2. Estimate portion size for EACH component accurately
  3. Calculate nutrition for EACH component individually
  4. Sum all components to provide TOTAL nutrition values
  5. List components briefly in your description

- For complex meals, be thorough: don't miss side dishes, condiments, dressings, or toppings mentioned
- Estimate portions realistically based on the description
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

Keep your explanation concise (2-3 sentences) and ALWAYS include a single nutrition line at the end in this exact format:

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
- For discrete items like bacon or bread slices, count visible slices and use that count for servings.

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
- **BE COMPREHENSIVE: Include ALL likely components even if you're not 100% certain.**
- **Set "isGuess": true for any item you're including but aren't completely confident about.**
- **Set "isGuess": false only for items you can clearly identify with high confidence.**
- **For discrete items like patties, count them in serving_size (e.g., "2 patties" or "3 patties") and set servings to match the count.**
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
      imageHash = crypto.createHash('sha256').update(Buffer.from(imageBuffer)).digest('hex');
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

      messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this food image and provide accurate nutrition information based on the visible portion size. Be precise about size differences.

CRITICAL FOR MEALS WITH MULTIPLE COMPONENTS:
- If the image contains multiple distinct foods (e.g., plate with protein, vegetables, grains, salads, soups, stews, sandwiches with multiple fillings, bowls with toppings), you MUST:
  1. Identify EACH component separately
  2. Estimate portion size for EACH component accurately
  3. Calculate nutrition for EACH component individually
  4. Sum all components to provide TOTAL nutrition values
  5. List components briefly in your description

- For complex meals, be thorough: don't miss side dishes, condiments, dressings, or toppings
- Estimate portions realistically based on what's visible in the image
- **BE DARING: If you think you see something (even with low confidence), include it as a separate item with isGuess: true**
- **Scan edges/corners and include any plausible side items even if only partially visible; mark low-confidence ones as isGuess: true rather than skipping.**
- **Include breads/rolls/bagels/plate-side carbs when any part is visible; use isGuess: true if uncertain.**
- **For burgers specifically: ALWAYS include bun, patties (count them!), cheese, bacon (if visible), lettuce, tomato, and sauces/condiments as separate items**
- If unsure about a component, estimate conservatively but include it in your totals - the user can easily delete guessed items
- **Never omit a plausible ingredient just because macros are uncertain — include the card and flag it with isGuess: true.**
- For mixed dishes (salads, soups, stews), break down the main ingredients and sum them

COMMON MEAL PATTERNS TO RECOGNIZE (DO NOT MISS - BE COMPREHENSIVE):
- **Burgers: ALWAYS include bun + patties (count each patty separately) + cheese + bacon (if visible) + lettuce + tomato + sauces/condiments (ketchup, mayo, mustard, etc.)**
- Wraps/sandwiches/tacos: wrap/bread + protein + cheese + sauces + salad/veg
- Bowls/salads: base (rice/greens) + protein + toppings + dressing/sauce
- Plates: protein + starch (rice/pasta/potato/bread) + vegetables + sauces
- Pizzas/flatbreads: base + cheese + toppings (count visible slices as portion)
- Breakfasts: eggs + toast + spreads + bacon/sausage + sides (tomatoes, mushrooms)
- Soups/stews/curries: liquid base + visible solids (meat/veg) + rice/bread

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
- For discrete items like bacon or bread slices, count visible slices and use that count for servings.
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
  - If you are unsure, keep the item and mark isGuess: true rather than omitting it.

OUTPUT REQUIREMENTS:
- Keep explanation to 2-3 sentences
- ALWAYS end with a single nutrition line in this exact format:

Keep your explanation concise (2-3 sentences) and ALWAYS include a single nutrition line at the end in this exact format:

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
- **BE COMPREHENSIVE: Include ALL visible components (bun, patties, cheese, bacon, lettuce, tomato, sauces, condiments, etc.) even if you're not 100% certain.**
- **Set "isGuess": true for any item you're including but aren't completely confident about (e.g., condiments that might be hidden, salad that might be present).**
- **Set "isGuess": false only for items you can clearly see and identify with high confidence.**
- **For discrete items like patties, count them in serving_size (e.g., "2 patties" or "3 patties") and set servings to match the count.**
- Nutrition values should be PER SERVING (not total) for each item.
- The "total" object should sum all items multiplied by their servings.
` : ''}`
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
                detail: "high"
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

    const isPremium = currentUser.subscription?.plan === 'PREMIUM';
    
    // Check if user has purchased credits (non-expired)
    const now = new Date();
    const hasPurchasedCredits = currentUser.creditTopUps.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    );
    
    // Check if user has used their free food analysis
    const hasUsedFreeFood = (currentUser as any).hasUsedFreeFoodAnalysis || false;
    
    // Billing is now stable again – enforce credit checks for Food Analysis.
    // This controls wallet pre-checks and charges; free trial logic still applies.
    const BILLING_ENFORCED = true;

    // Allow if: Premium subscription OR has purchased credits OR hasn't used free use yet
    let allowViaFreeUse = false;
    if (!isPremium && !hasPurchasedCredits && !hasUsedFreeFood && !isReanalysis) {
      // First time use - allow free
      allowViaFreeUse = true;
    } else if (BILLING_ENFORCED && !isPremium && !hasPurchasedCredits) {
      // No subscription, no credits, and already used free - require payment
      return NextResponse.json(
        { 
          error: 'Payment required',
          message: 'You\'ve used your free food analysis. Subscribe to a monthly plan or purchase credits to continue.',
          requiresPayment: true
        },
        { status: 402 }
      );
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

    // Use the higher-accuracy model for both first pass and re-analysis.
    // Temperature is set to 0 for maximum consistency between runs on the same meal.
    const model = 'gpt-4o';
    const maxTokens = 600;

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
      const estimateCents = costCentsEstimateFromText(model, promptText, maxTokens * 4);
      const wallet = await cm.getWalletStatus();
      if (wallet.totalAvailableCents < estimateCents) {
        return NextResponse.json(
          { error: 'Insufficient credits' },
          { status: 402 }
        );
      }
    }

    // Pre-charge a minimal credit immediately upon analysis start (skip for free trial
    // or when billing checks are disabled)
    let prechargedCents = 0;
    if (BILLING_ENFORCED && !allowViaFreeUse) {
      try {
        const cm = new CreditManager(currentUser.id);
        const immediate = CREDIT_COSTS.FOOD_ANALYSIS; // 1 credit upfront
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

    console.log('🤖 Calling OpenAI API with:', {
      model,
      messageCount: messages.length,
      hasImageContent: messages[0]?.content && Array.isArray(messages[0].content)
    });

    // Call OpenAI API (metered)
    const primary = await chatCompletionWithCost(openai, {
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0,
    } as any);

    const response = primary.completion;

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

    console.log('📋 OpenAI Response:', {
      hasResponse: !!response,
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length || 0,
      hasContent: !!response.choices?.[0]?.message?.content
    });

    let analysis = response.choices[0]?.message?.content;
    let totalCostCents = primary.costCents;

    if (!analysis) {
      console.log('❌ No analysis received from OpenAI');
      return NextResponse.json(
        { error: 'No analysis received from OpenAI' },
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

    // Update counters and mark free use as used
    if (allowViaFreeUse && !isReanalysis) {
      // Mark free use as used (safe if column doesn't exist yet - migration pending)
      try {
        await prisma.user.update({
          where: { id: currentUser.id },
          data: {
            hasUsedFreeFoodAnalysis: true,
          } as any
        })
      } catch (e: any) {
        // Ignore if column doesn't exist yet (migration pending)
        if (!e.message?.includes('does not exist')) {
          console.warn('Failed to update hasUsedFreeFoodAnalysis:', e)
        }
      }
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
    let itemsSource: string = 'none';
    let itemsQuality: 'valid' | 'weak' | 'none' = 'none';
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
          if (parsed && typeof parsed === 'object') {
            const parsedItems = Array.isArray(parsed.items) ? parsed.items : [];
            const parsedTotal = typeof parsed.total === 'object' ? parsed.total : null;
            if (parsedItems.length > 0) {
              // Use the parsed items/total directly; do not overwrite them with fallback/default items
              resp.items = parsedItems;
              resp.total = parsedTotal || computeTotalsFromItems(parsedItems) || null;
              itemsSource = 'items_json';
              itemsQuality = validateStructuredItems(parsedItems) ? 'valid' : 'weak';
            }
          }
          // Always strip the ITEMS_JSON block to avoid UI artifacts, even if parsing failed
          resp.analysis = resp.analysis.replace(m[0], '').trim();
        }
      } catch (e) {
        console.warn('ITEMS_JSON handling failed (non-fatal):', e);
      }

      // If the main analysis did not contain a usable ITEMS_JSON block, make a
      // compact follow-up call whose ONLY job is to produce structured items
      // so the UI can render editable ingredient cards. This is text-only and
      // only runs when the first call missed items.
      if ((!resp.items || resp.items.length === 0) && analysis.length > 0) {
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
                  '- Use realistic per-serving values based on the analysis.\n' +
                  '- If unsure about fiber or sugar, set them to 0.\n' +
                  '- Respond with JSON only, no backticks.\n\n' +
                  'Analysis text:\n' +
                  analysis,
              },
            ],
            max_tokens: 220,
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
          if (parsed && typeof parsed === 'object') {
            const items = Array.isArray(parsed.items) ? parsed.items : [];
            const total = typeof parsed.total === 'object' ? parsed.total : null;
            if (items.length > 0) {
              resp.items = items;
              resp.total = total || computeTotalsFromItems(items) || resp.total || null;
                itemsSource = itemsSource === 'none' ? 'text_extractor' : `${itemsSource}+text_extractor`;
                itemsQuality = validateStructuredItems(items) ? 'valid' : 'weak';
              console.log('✅ Structured items extracted via follow-up call:', {
                itemCount: items.length,
              });
            }
          }
        } catch (e) {
          console.warn('ITEMS_JSON extractor follow-up failed (non-fatal):', e);
        }

        // If we still have no items, synthesize multiple editable items so cards stay separate.
        if (!resp.items || resp.items.length === 0) {
          const caloriesMatch = analysis.match(/calories\s*[:\-]?\s*(\d+)/i);
          const proteinMatch = analysis.match(/protein\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*g/i);
          const carbsMatch = analysis.match(/carbs?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*g/i);
          const fatMatch = analysis.match(/fat\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*g/i);
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
            const fallback = buildMultiComponentFallback(analysis, baseTotal);
            resp.items = fallback.items;
            resp.total = fallback.total;
            console.log('ℹ️ Using multi-item fallback to avoid single-card UI');
          } else {
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
          }
        }
      }
    }

    // If we still don't have meaningful per-component items (or only a generic "Meal" card)
    // but the prompt was multi-detect capable, run a lightweight structure-only pass to
    // force separate components. This keeps the ingredient cards usable when the primary
    // model skips ITEMS_JSON.
    if (
      wantStructured &&
      preferMultiDetect &&
      (!resp.items || resp.items.length === 0 || looksLikeSingleGenericItem(resp.items))
    ) {
      try {
        console.warn('⚠️ Photo analyzer: generic/missing items detected; running multi-item follow-up.');
        console.log('ℹ️ Enforcing multi-item breakdown via structure-only follow-up');
        const hintTotal = resp.total || computeTotalsFromItems(resp.items || []) || null;
        const followUp = await chatCompletionWithCost(openai, {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content:
                'Split this meal description into separate ingredients/components and return JSON only with this shape:\n' +
                '{"items":[{"name":"string","brand":null,"serving_size":"string","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}\n' +
                '- Use realistic per-serving values for EACH component (eggs, bacon, bagel, juice, etc).\n' +
                '- Keep servings to 1 by default and use household measures ("1 slice", "1 cup", "1 egg").\n' +
                '- Do not collapse everything into a single "Meal" item. Return 1 item per distinct component.\n' +
                (hintTotal
                  ? `- Keep totals roughly consistent with Calories ${hintTotal.calories ?? 'unknown'} / Protein ${
                      hintTotal.protein_g ?? 'unknown'
                    }g / Carbs ${hintTotal.carbs_g ?? 'unknown'}g / Fat ${hintTotal.fat_g ?? 'unknown'}g.\n`
                  : '') +
                '\nAnalysis text:\n' +
                analysis,
            },
          ],
          max_tokens: 220,
          temperature: 0,
        } as any);

        totalCostCents += followUp.costCents;
        const text = followUp.completion.choices?.[0]?.message?.content?.trim() || '';
        const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = cleaned ? parseItemsJsonRelaxed(cleaned) : null;
        if (parsed && typeof parsed === 'object') {
          const items = Array.isArray(parsed.items) ? parsed.items : [];
          const total = typeof parsed.total === 'object' ? parsed.total : null;
          if (items.length > 1 || (items.length === 1 && !looksLikeSingleGenericItem(items))) {
            resp.items = items;
            resp.total = total || computeTotalsFromItems(items) || resp.total || null;
            itemsSource = itemsSource === 'none' ? 'multi_followup' : `${itemsSource}+multi_followup`;
            itemsQuality = validateStructuredItems(items) ? 'valid' : 'weak';
            console.log('✅ Multi-item follow-up produced structured items:', items.length);
          }
        }
      } catch (multiErr) {
        console.warn('Multi-item follow-up failed (non-fatal):', multiErr);
      }
    }

    if (resp.items && resp.items.length > 0 && !resp.total) {
      resp.total = computeTotalsFromItems(resp.items);
    }

    // Burger-specific enrichment: ensure core components and realistic per-item macros.
    const burgerEnriched = ensureBurgerComponents(resp.items || [], resp.analysis);
    resp.items = burgerEnriched.items;
    resp.total = burgerEnriched.total || resp.total;

    // Normalize guess flags and discrete counts (convert word numbers to numerals).
    if (resp.items && Array.isArray(resp.items)) {
      resp.items = normalizeDiscreteCounts(normalizeGuessFlags(resp.items));
      if (!resp.total || Object.keys(resp.total || {}).length === 0) {
        resp.total = computeTotalsFromItems(resp.items);
      }
    }

    // Final safety pass: if the AI has described a discrete portion like
    // "3 large eggs" or "4 slices of bacon" but provided calories/macros that
    // only match a single unit, scale those macros up so that the totals match
    // the visible serving description. This does not touch the Food Diary UI
    // or diary loading logic – it only corrects the structured items returned
    // from this API.
    if (resp.items && Array.isArray(resp.items) && resp.items.length > 0) {
      const harmonized = harmonizeDiscretePortionItems(resp.items);
      resp.items = harmonized.items;
      if (harmonized.total) {
        resp.total = harmonized.total;
      } else if (!resp.total) {
        resp.total = computeTotalsFromItems(resp.items);
      }
    }

    // Enforce multi-item output for meal analyses (non-packaged) so the UI never shows a single card.
    if (
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
    if (packagedMode && resp.items && Array.isArray(resp.items) && resp.items.length > 0) {
      const enriched = await enrichPackagedItemsWithFatSecret(resp.items);
      if (enriched.total) {
        resp.items = enriched.items;
        resp.total = enriched.total;
      }
    }

    // General (non-packaged) enrichment when macros are missing/zero
    if (resp.items && Array.isArray(resp.items) && resp.items.length > 0) {
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

    // Packaged mode: skip secondary OpenAI per-serving extraction to keep one API call per analysis.
    if (packagedMode && resp.items && Array.isArray(resp.items) && resp.items.length > 0 && imageDataUrl) {
      console.log('ℹ️ Packaged mode active; secondary per-serving OpenAI call disabled to reduce usage.');
    }

    // NOTE: USDA/FatSecret database enhancement removed from AI photo analysis flow
    // These databases are still available via /api/food-data for manual ingredient lookup
    // The AI analysis works better without database interference - it provides accurate
    // estimates based on visual analysis and portion sizes, which databases can't match.

    // HEALTH COMPATIBILITY CHECK: temporarily skipped to keep one OpenAI call per analysis
    try {
      resp.healthWarning = null;
      resp.alternatives = null;
      console.log('ℹ️ Health compatibility check skipped to reduce OpenAI usage.');
    } catch (healthError) {
      console.warn('⚠️ Health compatibility section skipped due to error:', healthError);
    }

    // Charge wallet for all costs (food analysis + health checks)
    // Skip if allowed via free use OR when billing checks are disabled.
    if (BILLING_ENFORCED && !allowViaFreeUse) {
      try {
        const cm = new CreditManager(currentUser.id);
        // Charge the remainder after the upfront 1-credit pre-charge
        const remainder = Math.max(0, totalCostCents - prechargedCents);
        const ok = await cm.chargeCents(remainder);
        if (!ok) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
        }
      } catch (e) {
        console.warn('Wallet charge failed:', e);
        return NextResponse.json({ error: 'Billing error' }, { status: 402 });
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

    // Log AI usage for the main Food Analyzer (fire-and-forget).
    // Use the primary analysis tokens and the total combined cost (analysis + follow-ups).
    logAiUsageEvent({
      feature: 'food:analysis',
      userId: currentUser.id || null,
      userLabel: currentUser.email || null,
      scanId: imageHash ? `food-${imageHash.slice(0, 8)}` : `food-${Date.now()}`,
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

    return NextResponse.json(resp);

  } catch (error) {
    console.error('💥 OpenAI API Error:', error);
    
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
