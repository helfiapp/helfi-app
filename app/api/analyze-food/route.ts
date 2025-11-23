import { NextRequest, NextResponse } from 'next/server';
/**
 * IMPORTANT – DO NOT CHANGE OUTPUT FORMAT WITHOUT UPDATING UI PARSER
 * The Food Diary UI in `app/food/page.tsx` extracts nutrition via regex from a single line:
 *   Calories: <number>, Protein: <g>, Carbs: <g>, Fat: <g>
 * If you modify prompts or response shapes, ensure this exact line remains present.
 * A server-side fallback below appends this line when missing.
 */
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { searchFatSecretFoods } from '@/lib/food-data';
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system';
import crypto from 'crypto';

// Bump this when changing curated nutrition to invalidate old cached images.
const CACHE_VERSION = 'v2';

// Guard rail: this route powers the main Food Analyzer. Billing enforcement
// (BILLING_ENFORCED) must remain true for production unless the user explicitly
// asks to pause billing. Do not toggle it off as a "quick fix" for other bugs.
import OpenAI from 'openai';
import { chatCompletionWithCost } from '@/lib/metered-openai';
import { costCentsEstimateFromText } from '@/lib/cost-meter';
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

// Secondary per-serving extractor for packaged labels: forces the model to read ONLY the per-serving column.
const extractPerServingFromLabel = async (
  openai: OpenAI,
  imageDataUrl: string,
): Promise<
  | {
      serving_size?: string | null;
      calories?: number | null;
      protein_g?: number | null;
      carbs_g?: number | null;
      fat_g?: number | null;
      fiber_g?: number | null;
      sugar_g?: number | null;
    }
  | null
> => {
  try {
    const completion = await chatCompletionWithCost(openai, {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Read ONLY the PER-SERVING column from this nutrition label. Ignore per 100g/ml values. Return JSON only in this shape:
{"serving_size":"string","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}
- Copy the per-serving numbers verbatim.
- If you see multiple columns, choose the one labelled per serve/per serving.
- For fat: read the TOTAL FAT row from the per-serving column. Do NOT add saturated or trans fat; just use the total fat per serving.
- Do NOT estimate or scale from per 100g.
- No prose, just JSON.` },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 180,
      temperature: 0,
    } as any);
    const raw = completion.completion.choices?.[0]?.message?.content?.trim() || '';
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = cleaned ? parseItemsJsonRelaxed(cleaned) : null;
    if (parsed && typeof parsed === 'object') {
      return parsed as any;
    }
  } catch (err) {
    console.warn('Per-serving extractor failed (non-fatal)', err);
  }
  return null;
};

// Optional: decode barcode from label image (OpenAI vision quick pass).
const extractBarcodeFromImage = async (openai: OpenAI, imageDataUrl: string): Promise<string | null> => {
  try {
    const completion = await chatCompletionWithCost(openai, {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Read a barcode number from this image if visible. Return only the number as plain text (digits only). If none, return "none".` },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 32,
      temperature: 0,
    } as any);
    const raw = completion.completion.choices?.[0]?.message?.content?.trim() || '';
    const cleaned = raw.replace(/[^0-9]/g, '');
    if (cleaned.length >= 6) return cleaned; // basic sanity
  } catch (err) {
    console.warn('Barcode extractor failed (non-fatal)', err);
  }
  return null;
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

  const parseCountFromLabel = (label: string): number | null => {
    if (!label) return null;
    const lower = String(label).toLowerCase();
    // Match patterns like:
    // "approximately 3 large eggs", "about 4 slices", "3 rashers of bacon"
    const m = lower.match(/(?:about|approximately|approx\.?|around)?\s*(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n) || n <= 1) return null;
    return n;
  };

  const containsAny = (text: string, keywords: string[]): boolean => {
    const lower = text.toLowerCase();
    return keywords.some((k) => lower.includes(k));
  };

  const EGG_KEYWORDS = ['egg', 'eggs', 'scrambled egg', 'scrambled eggs', 'omelette', 'omelet'];
  const BACON_KEYWORDS = ['bacon', 'rasher', 'rashers', 'bacon strip', 'bacon strips'];

  for (const item of cloned) {
    const name = (item?.name || '') as string;
    const servingSize = (item?.serving_size || '') as string;
    const labelSource = `${name} ${servingSize}`.trim();
    const count = parseCountFromLabel(servingSize || name);
    if (!count || count <= 1) continue;

    const calories = Number(item?.calories ?? 0);
    const protein = Number(item?.protein_g ?? 0);
    const carbs = Number(item?.carbs_g ?? 0);
    const fat = Number(item?.fat_g ?? 0);
    const fiber = Number(item?.fiber_g ?? 0);
    const sugar = Number(item?.sugar_g ?? 0);

    if (!Number.isFinite(calories) || calories <= 0) continue;

    // Eggs: label says "3 large eggs" etc, but calories ~= one egg (~70).
    if (containsAny(labelSource, EGG_KEYWORDS)) {
      // Treat values as per-egg if calories look like a single egg and we
      // haven't already set a higher servings count. We then update the
      // servings field so the UI and totals multiply correctly.
      if (calories > 0 && calories <= 120) {
        const currentServings = Number(item?.servings ?? 1);
        if (!Number.isFinite(currentServings) || currentServings <= 1.5) {
          item.servings = count;
          continue;
        }
      }
    }

    // Bacon: label says "about 4 slices" etc, but calories ~= one slice (~40).
    if (containsAny(labelSource, BACON_KEYWORDS)) {
      if (calories > 0 && calories <= 60) {
        const currentServings = Number(item?.servings ?? 1);
        if (!Number.isFinite(currentServings) || currentServings <= 1.5) {
          item.servings = count;
          continue;
        }
      }
    }
  }

  const total = computeTotalsFromItems(cloned);
  return { items: cloned, total };
};

// In-memory cache for repeated photo analyses (keyed by image hash).
// Avoids re-calling the model and keeps macros consistent for the same photo.
const imageAnalysisCache = new Map<
  string,
  { analysis: string; items: any[] | null; total: any | null }
>();

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
<ITEMS_JSON>{"items":[{"name":"string","brand":"string or null","serving_size":"string (e.g., '1 slice', '40g', '1 cup (8 oz)')","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}</ITEMS_JSON>

CRITICAL REQUIREMENTS:
- For packaged foods: ALWAYS extract the brand name if visible (e.g., "Burgen", "Heinz", "Nestle"). Set to null if not visible or not applicable.
- For packaged foods: ALWAYS extract the serving size from the label (e.g., "1 slice", "2 cookies", "100g", "1 cup"). This is the DEFAULT serving size per package.
- Set "servings" to 1 as the default (user can adjust this in the UI).
- For multi-item meals: Create separate items for each distinct food component.
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
      const imageDataUrl = `data:${imageFile.type};base64,${imageBase64}`;
      imageHash = crypto.createHash('sha256').update(Buffer.from(imageBuffer)).digest('hex');
      
      console.log('✅ Image conversion complete:', {
        bufferSize: imageBuffer.byteLength,
        base64Length: imageBase64.length,
        dataUrlPrefix: imageDataUrl.substring(0, 50) + '...',
        imageHash
      });

      // Cache check: if we've already analyzed this exact image, return the cached result
      const cacheKey = `${CACHE_VERSION}:${imageHash}`;
      const cached = imageAnalysisCache.get(cacheKey);
      if (cached) {
        console.log('♻️ Returning cached analysis for image hash', cacheKey);
        return NextResponse.json({
          success: true,
          analysis: cached.analysis,
          items: cached.items,
          total: cached.total,
          cached: true,
        });
      }

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
- If unsure about a component, estimate conservatively but include it in your totals
- For mixed dishes (salads, soups, stews), break down the main ingredients and sum them

COMMON MEAL PATTERNS TO RECOGNIZE (DO NOT MISS):
- Burgers/wraps/sandwiches/tacos: bun/wrap + protein + cheese + sauces + salad/veg
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
- A typical burger with bun + 6oz patty + cheese + bacon should total 600-900 calories, NOT 40-50 calories
- Always cross-check your totals: if a meal looks substantial, the calories should reflect that
- If your calculated total seems too low, re-check each component's nutrition values
- Use standard serving sizes and realistic nutrition databases

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
<ITEMS_JSON>{"items":[{"name":"string","brand":"string or null","serving_size":"string (e.g., '1 slice', '40g', '1 cup (8 oz)')","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}</ITEMS_JSON>

CRITICAL REQUIREMENTS:
- For packaged foods: ALWAYS extract the brand name if visible (e.g., "Burgen", "Heinz", "Nestle"). Set to null if not visible or not applicable.
- For packaged foods: ALWAYS extract the serving size from the label (e.g., "1 slice", "2 cookies", "100g", "1 cup"). This is the DEFAULT serving size per package.
- Set "servings" to 1 as the default (user can adjust this in the UI).
- For multi-item meals: Create separate items for each distinct food component.
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
      try {
        console.log('ℹ️ Nutrition line missing; running compact extractor');
        const extract = await chatCompletionWithCost(openai, {
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content:
                `From the following text, extract ONLY a single line in this exact format: \n\n` +
                `Calories: [number], Protein: [g], Carbs: [g], Fat: [g]\n\n` +
                `If you cannot infer a value, write 'unknown' for that field. No extra words.\n\nText:\n${analysis}`,
            },
          ],
          max_tokens: 60,
          temperature: 0,
        } as any);
        totalCostCents += extract.costCents;
        const extracted = extract.completion.choices?.[0]?.message?.content?.trim();
        if (extracted && /calories/i.test(extracted)) {
          analysis = `${analysis}\n${extracted}`;
          console.log('✅ Appended nutrition line:', extracted);
        }
      } catch (exErr) {
        console.warn('Nutrition extraction fallback failed:', exErr);
      }
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
            resp.items = Array.isArray(parsed.items) ? parsed.items : [];
            resp.total = typeof parsed.total === 'object' ? parsed.total : null;
            if ((!resp.total || Object.keys(resp.total).length === 0) && resp.items.length > 0) {
              resp.total = computeTotalsFromItems(resp.items);
            }
          }
          // Always strip the ITEMS_JSON block to avoid UI artifacts, even if parsing failed
          resp.analysis = resp.analysis.replace(m[0], '').trim();
        }
      } catch (e) {
        console.warn('ITEMS_JSON handling failed (non-fatal):', e);
      }

      // If the main analysis did not contain a usable ITEMS_JSON block, make a
      // compact follow-up call whose ONLY job is to produce structured items.
      if ((!resp.items || resp.items.length === 0) && analysis.length > 0) {
        try {
          console.log('ℹ️ No ITEMS_JSON found, running structured-items extractor');
          const extractor = await chatCompletionWithCost(openai, {
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content:
                  'From the following nutrition analysis text, extract a JSON object with this exact shape:\n\n' +
                  '{"items":[{"name":"string","brand":null,"serving_size":"string","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}],' +
                  '"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0}}\n\n' +
                  'Rules:\n' +
                  '- Use PER-SERVING nutrition values for each item based on REALISTIC standard nutrition databases.\n' +
                  '- The "total" object must be the sum of all items multiplied by their servings.\n' +
                  '- Use realistic values: burger bun ~150 cal, 6oz beef patty ~400 cal, cheese slice ~100 cal, bacon (2 slices) ~80 cal.\n' +
                  '- A typical burger should total 600-900 calories, NOT 40-50 calories.\n' +
                  '- If you are unsure about fiber or sugar, set them to 0.\n' +
                  '- Respond with JSON ONLY, no backticks, no comments, no extra text.\n\n' +
                  'Analysis text:\n' +
                  analysis,
              },
            ],
            max_tokens: 260,
            temperature: 0,
          } as any);
          totalCostCents += extractor.costCents;
          const text = extractor.completion.choices?.[0]?.message?.content?.trim() || '';
          // Handle cases where the assistant still wraps JSON in ```json fences
          // despite instructions to return raw JSON only.
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
              console.log('✅ Structured items extracted via follow-up call:', {
                itemCount: items.length,
              });
            }
          }
        } catch (e) {
          console.warn('ITEMS_JSON extractor follow-up failed (non-fatal):', e);
        }
      }
    }

    if (resp.items && resp.items.length > 0 && !resp.total) {
      resp.total = computeTotalsFromItems(resp.items);
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

    // Packaged mode: fill missing macros from FatSecret without overriding existing values.
    if (packagedMode && resp.items && Array.isArray(resp.items) && resp.items.length > 0) {
      const enriched = await enrichPackagedItemsWithFatSecret(resp.items);
      if (enriched.total) {
        resp.items = enriched.items;
        resp.total = enriched.total;
      }
    }

    // Packaged mode: force-read per-serving column and REPLACE macros with the per-serving read
    if (packagedMode && resp.items && Array.isArray(resp.items) && resp.items.length > 0 && imageDataUrl) {
      // 1) Force per-serving extraction first and replace macros for all items.
      const forced = await extractPerServingFromLabel(openai, imageDataUrl);
      if (forced) {
        const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);
        const forcedValues = {
          serving_size: forced.serving_size ?? null,
          calories: toNum(forced.calories),
          protein_g: toNum(forced.protein_g),
          carbs_g: toNum(forced.carbs_g),
          fat_g: toNum(forced.fat_g),
          fiber_g: toNum(forced.fiber_g),
          sugar_g: toNum(forced.sugar_g),
        };

        // If implied calories from macros exceed label calories by >15%, clamp fat to fit label calories (total fat row only).
        if (forcedValues.calories && forcedValues.calories > 0) {
          const proteinCals = (forcedValues.protein_g ?? 0) * 4;
          const carbCals = (forcedValues.carbs_g ?? 0) * 4;
          const fatCals = (forcedValues.fat_g ?? 0) * 9;
          const implied = proteinCals + carbCals + fatCals;
          if (implied > forcedValues.calories * 1.15) {
            const remaining = forcedValues.calories - (proteinCals + carbCals);
            const adjustedFat = Math.max(0, remaining / 9);
            forcedValues.fat_g = Math.round(adjustedFat * 10) / 10;
          }
        }

        resp.items = resp.items.map((item: any) => ({
          ...item,
          serving_size: forcedValues.serving_size || item.serving_size,
          calories: forcedValues.calories ?? item.calories,
          protein_g: forcedValues.protein_g ?? item.protein_g,
          carbs_g: forcedValues.carbs_g ?? item.carbs_g,
          fat_g: forcedValues.fat_g ?? item.fat_g,
          fiber_g: forcedValues.fiber_g ?? item.fiber_g,
          sugar_g: forcedValues.sugar_g ?? item.sugar_g,
        }));

        resp.total = computeTotalsFromItems(resp.items);

        // If calories present on label, keep them authoritative even if macro-implied differs.
        if (forcedValues.calories != null && resp.total) {
          resp.total.calories = Math.round(forcedValues.calories);
        }
      }

      // 2) Barcode fallback disabled for now to avoid wrong matches (burger mixups). Keep label per-serving as source of truth.
    }

    // NOTE: USDA/FatSecret database enhancement removed from AI photo analysis flow
    // These databases are still available via /api/food-data for manual ingredient lookup
    // The AI analysis works better without database interference - it provides accurate
    // estimates based on visual analysis and portion sizes, which databases can't match.

    // HEALTH COMPATIBILITY CHECK: Analyze food against user's health data
    try {
      console.log('🏥 Starting health compatibility check...');
      
      // Fetch user's health situations data (fresh from database, no cache)
      const healthSituationsGoal = await prisma.healthGoal.findFirst({
        where: {
          userId: currentUser.id,
          name: '__HEALTH_SITUATIONS_DATA__'
        }
      });

      // Also fetch selected health goals/issues (current active health concerns)
      const selectedIssuesGoal = await prisma.healthGoal.findFirst({
        where: {
          userId: currentUser.id,
          name: '__SELECTED_ISSUES__'
        }
      });

      let healthData = null;
      let selectedHealthGoals: string[] = [];
      
      // Parse health situations data
      if (healthSituationsGoal?.category) {
        try {
          const parsed = JSON.parse(healthSituationsGoal.category);
          healthData = {
            healthIssues: parsed.healthIssues || '',
            healthProblems: parsed.healthProblems || '',
            additionalInfo: parsed.additionalInfo || ''
          };
          console.log('📋 Health situations data:', {
            hasIssues: !!healthData.healthIssues,
            hasProblems: !!healthData.healthProblems,
            hasAdditionalInfo: !!healthData.additionalInfo
          });
        } catch (e) {
          console.warn('Failed to parse health situations data:', e);
        }
      }

      // Parse selected health goals/issues
      if (selectedIssuesGoal?.category) {
        try {
          const parsed = JSON.parse(selectedIssuesGoal.category);
          if (Array.isArray(parsed)) {
            selectedHealthGoals = parsed.map((name: any) => String(name || '').trim()).filter(Boolean);
          }
          console.log('📋 Selected health goals:', selectedHealthGoals);
        } catch (e) {
          console.warn('Failed to parse selected issues:', e);
        }
      }

      // Build comprehensive health context from BOTH sources
      const hasHealthSituations = healthData && (
        healthData.healthIssues.trim() || 
        healthData.healthProblems.trim() || 
        healthData.additionalInfo.trim()
      );
      const hasHealthGoals = selectedHealthGoals.length > 0;

      // Only perform health check if user has ANY health data
      if (hasHealthSituations || hasHealthGoals) {
        console.log('✅ User has health data, performing compatibility check...', {
          hasHealthSituations,
          hasHealthGoals,
          goalsCount: selectedHealthGoals.length
        });
        
        // Extract food name/description from analysis (first line or first sentence)
        const foodDescription = analysis.split('\n')[0].substring(0, 200);
        
        // Build health context prompt from BOTH health situations AND selected goals
        const healthContextParts: string[] = [];
        
        if (healthData) {
          if (healthData.healthIssues.trim()) {
            healthContextParts.push(`Current health issues: ${healthData.healthIssues}`);
          }
          if (healthData.healthProblems.trim()) {
            healthContextParts.push(`Ongoing health problems: ${healthData.healthProblems}`);
          }
          if (healthData.additionalInfo.trim()) {
            healthContextParts.push(`Additional health information: ${healthData.additionalInfo}`);
          }
        }
        
        if (selectedHealthGoals.length > 0) {
          healthContextParts.push(`Health goals/concerns being tracked: ${selectedHealthGoals.join(', ')}`);
        }
        
        const healthContext = healthContextParts.join('\n');
        
        console.log('📝 Health context being sent to AI:', healthContext.substring(0, 200) + '...');

        // Perform health compatibility analysis
        const healthCheckPrompt = `You are a health advisor analyzing whether a food item is suitable for a person based ONLY on their specific health information.

USER'S HEALTH INFORMATION:
${healthContext}

FOOD ITEM TO ANALYZE:
${foodDescription}

CRITICAL INSTRUCTIONS:
1. Analyze if this food could be problematic or harmful based ONLY on the user's health information provided above
2. If the food is NOT suitable, provide a clear, specific warning explaining why (e.g., "This contains peppers which can irritate ulcers" or "Black coffee can worsen ulcer symptoms")
3. If the food IS suitable, respond with "SAFE" only
4. CRITICAL: Base your analysis ONLY on the health information explicitly provided above. Do NOT infer, assume, or guess about health conditions that are NOT mentioned in the user's health information
5. Do NOT mention health concerns that are not listed in the user's health information (e.g., if libido/hormones are not mentioned, do not reference them)
6. Be specific about which ingredient or component of the food is problematic and why, but ONLY if it relates to the health information provided
7. If the food does not conflict with any of the provided health information, respond with "SAFE"

If the food is NOT suitable, format your response as:
⚠️ HEALTH WARNING: [specific reason why this food is problematic for their condition]

If the food IS suitable, respond with:
SAFE

Your analysis:`;

        const healthCheck = await chatCompletionWithCost(openai, {
          model: 'gpt-4o-mini', // Use cheaper model for health check
          messages: [
            {
              role: 'user',
              content: healthCheckPrompt
            }
          ],
          max_tokens: 200,
          temperature: 0.3,
        } as any);

        const healthCheckResult = healthCheck.completion.choices?.[0]?.message?.content?.trim() || '';
        totalCostCents += healthCheck.costCents;

        // If food is not suitable, get alternative recommendations
        if (healthCheckResult && !healthCheckResult.toUpperCase().includes('SAFE') && healthCheckResult.includes('⚠️')) {
          console.log('⚠️ Food is not suitable for user, getting alternatives...');
          
          const alternativesPrompt = `A person with the following health information is about to eat: "${foodDescription}"

However, this food is NOT suitable because: ${healthCheckResult.replace('⚠️ HEALTH WARNING:', '').trim()}

USER'S HEALTH INFORMATION:
${healthContext}

Provide 2-3 specific alternative food recommendations that would be MORE suitable for their health condition. Be specific and practical. Format as a simple list.

Your recommendations:`;

          const alternativesCheck = await chatCompletionWithCost(openai, {
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content: alternativesPrompt
              }
            ],
            max_tokens: 150,
            temperature: 0.4,
          } as any);

          const alternativesResult = alternativesCheck.completion.choices?.[0]?.message?.content?.trim() || '';
          totalCostCents += alternativesCheck.costCents;

          resp.healthWarning = healthCheckResult;
          resp.alternatives = alternativesResult;
          console.log('✅ Health compatibility check complete - food is NOT suitable');
        } else {
          console.log('✅ Health compatibility check complete - food is suitable');
        }
      } else {
        console.log('ℹ️ No health data found, skipping compatibility check');
      }
    } catch (healthError) {
      console.warn('⚠️ Health compatibility check failed (non-blocking):', healthError);
      // Don't fail the entire request if health check fails
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

    // Fire-and-forget: generate updated insights in preview mode
    try {
      fetch('/api/insights/generate?preview=1', { method: 'POST' }).catch(() => {})
    } catch {}

    // Cache successful image analyses to keep repeat results stable
    if (imageHash) {
      try {
        const cacheKey = `${CACHE_VERSION}:${imageHash}`;
        imageAnalysisCache.set(cacheKey, {
          analysis: resp.analysis,
          items: Array.isArray(resp.items) ? resp.items : null,
          total: resp.total ?? null,
        });
      } catch (err) {
        console.warn('Failed to cache image analysis (non-fatal):', err);
      }
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
