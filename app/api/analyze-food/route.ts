import { NextRequest, NextResponse } from 'next/server';
/**
 * IMPORTANT – DO NOT CHANGE OUTPUT FORMAT WITHOUT UPDATING UI PARSER
 * The Food Diary UI in `app/food/page.tsx` extracts nutrition via regex from a single line:
 *   Calories: <number>, Protein: <g>, Carbs: <g>, Fat: <g>
 * If you modify prompts or response shapes, ensure this exact line remains present.
 * A server-side fallback below appends this line when missing.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system';
import OpenAI from 'openai';
import { chatCompletionWithCost } from '@/lib/metered-openai';
import { costCentsEstimateFromText } from '@/lib/cost-meter';

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
    
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true }
    });

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
    let wantStructured = false; // when true, we also return items[] and totals
    let preferMultiDetect = true; // default ON: detect multiple foods without changing output line

    let isReanalysis = false;
    if (contentType?.includes('application/json')) {
      // Handle text-based food analysis
      const body = await req.json();
      const { textDescription, foodType, isReanalysis: reFlag, returnItems, multi } = body as any;
      isReanalysis = !!reFlag;
      wantStructured = !!returnItems;
      preferMultiDetect = !!multi;
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
          content: `Analyze this food description and provide accurate nutrition information based on the EXACT portion size specified. Be precise about size differences. Keep your explanation concise (1-2 sentences) and ALWAYS include a single nutrition line at the end in this exact format:

Calories: [number], Protein: [g], Carbs: [g], Fat: [g]

[Food name] ([portion size])

Food description: ${textDescription}
Food type: ${foodType}

${preferMultiDetect ? `If multiple distinct foods or components are mentioned (e.g., salads/soups/stews/plate with sides), describe them briefly.
` : ''}

IMPORTANT: Different sizes have different nutrition values:
- Large egg: ~70 calories, 6g protein
- Medium egg: ~55 calories, 5g protein  
- Small egg: ~45 calories, 4g protein

Examples:
"Medium banana (1 whole)
Calories: 105, Protein: 1g, Carbs: 27g, Fat: 0g"

"Large egg (1 whole)
Calories: 70, Protein: 6g, Carbs: 1g, Fat: 5g"

"Medium egg (1 whole)
Calories: 55, Protein: 5g, Carbs: 1g, Fat: 4g"

Pay close attention to portion size words like small, medium, large, or specific measurements. Calculate nutrition accordingly. End your response with the nutrition line exactly once as shown.
${wantStructured ? `
After your explanation and the one-line totals above, also include a compact JSON block between <ITEMS_JSON> and </ITEMS_JSON> with this exact shape for any detected foods (use an empty array if only one item):
<ITEMS_JSON>{"items":[{"name":"string","portion":"string","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}}</ITEMS_JSON>
` : ''}`
        }
      ];
    } else {
      // Handle image-based food analysis
      console.log('🖼️ Image analysis mode');
      
      const formData = await req.formData();
      const imageFile = formData.get('image') as File;
      
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
      
      console.log('✅ Image conversion complete:', {
        bufferSize: imageBuffer.byteLength,
        base64Length: imageBase64.length,
        dataUrlPrefix: imageDataUrl.substring(0, 50) + '...'
      });

      messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this food image and provide accurate nutrition information based on the visible portion size. Be precise about size differences. Keep your explanation concise (1-2 sentences) and ALWAYS include a single nutrition line at the end in this exact format:

Calories: [number], Protein: [g], Carbs: [g], Fat: [g]

[Food name] ([portion size])

${preferMultiDetect ? `If the image contains multiple distinct foods or components (e.g., salads/soups/stews/plate with sides), describe them briefly.
` : ''}

IMPORTANT: Different sizes have different nutrition values:
- Large egg: ~70 calories, 6g protein
- Medium egg: ~55 calories, 5g protein  
- Small egg: ~45 calories, 4g protein

Examples:
"Medium banana (1 whole)
Calories: 105, Protein: 1g, Carbs: 27g, Fat: 0g"

"Large egg (1 whole)
Calories: 70, Protein: 6g, Carbs: 1g, Fat: 5g"

"Medium egg (1 whole)
Calories: 55, Protein: 5g, Carbs: 1g, Fat: 4g"

Estimate portion size carefully from the image and calculate nutrition accordingly. End your response with the nutrition line exactly once as shown.
${wantStructured ? `
After your explanation and the one-line totals above, also include a compact JSON block between <ITEMS_JSON> and </ITEMS_JSON> with this exact shape for any detected foods (use an empty array if only one item):
<ITEMS_JSON>{"items":[{"name":"string","portion":"string","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}}</ITEMS_JSON>
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
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true, creditTopUps: true }
    });
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
    
    // Allow if: Premium subscription OR has purchased credits OR hasn't used free use yet
    let allowViaFreeUse = false;
    if (!isPremium && !hasPurchasedCredits && !hasUsedFreeFood && !isReanalysis) {
      // First time use - allow free
      allowViaFreeUse = true;
    } else if (!isPremium && !hasPurchasedCredits) {
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

    const model = isReanalysis ? 'gpt-4o-mini' : 'gpt-4o';
    const maxTokens = 500;

    // Wallet pre-check (skip if allowed via free use)
    if (!allowViaFreeUse) {
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
      temperature: 0.3,
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

    console.log('✅ Analysis received:', analysis.substring(0, 100) + '...');

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
    
    // Charge wallet (skip if allowed via free use)
    if (!allowViaFreeUse) {
      try {
        const cm = new CreditManager(currentUser.id);
        const ok = await cm.chargeCents(totalCostCents);
        if (!ok) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
        }
      } catch (e) {
        console.warn('Wallet charge failed:', e);
        return NextResponse.json({ error: 'Billing error' }, { status: 402 });
      }
    }

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
    } else if (isPremium) {
      await prisma.user.update({
        where: { id: currentUser.id },
        data: ( isReanalysis ? {
          dailyFoodReanalysisUsed: { increment: 1 },
          totalAnalysisCount: { increment: 1 },
        } : {
          dailyFoodAnalysisUsed: { increment: 1 },
          totalFoodAnalysisCount: { increment: 1 },
          totalAnalysisCount: { increment: 1 },
        } ) as any
      });
    }
    
    console.log('=== FOOD ANALYZER DEBUG END ===');

    const resp: any = {
      success: true,
      analysis: analysis.trim(),
    };
    if (wantStructured) {
      try {
        const m = analysis.match(/<ITEMS_JSON>([\s\S]*?)<\/ITEMS_JSON>/i);
        if (m && m[1]) {
          const parsed = JSON.parse(m[1]);
          if (parsed && typeof parsed === 'object') {
            resp.items = Array.isArray(parsed.items) ? parsed.items : [];
            resp.total = parsed.total || null;
          }
          // Strip the ITEMS_JSON block from analysis text to avoid UI artifacts
          resp.analysis = resp.analysis.replace(m[0], '').trim();
        }
      } catch (e) {
        console.warn('ITEMS_JSON parse failed');
      }
    }
    // Fire-and-forget: generate updated insights in preview mode
    try {
      fetch('/api/insights/generate?preview=1', { method: 'POST' }).catch(() => {})
    } catch {}
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